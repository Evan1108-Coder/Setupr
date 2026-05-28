import chalk from "chalk";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { scanProject } from "../../scanner/index.js";
import { createPSetupError, printPlainError } from "../../errors/index.js";
import { loadConfig } from "../../state/config.js";

interface CIFlags {
  force?: boolean;
  args?: string[];
  [key: string]: unknown;
}

type CIPlatform = "github" | "gitlab" | "bitbucket" | "circleci";

export async function cmdCI(sub: string | undefined, cwd: string, flags: CIFlags): Promise<void> {
  const platform = (sub || flags.args?.[0] || "auto") as CIPlatform | "auto";
  const resolvedPlatform = platform === "auto" ? await detectPlatform(cwd) : platform;

  if (!resolvedPlatform) {
    printPlainError(createPSetupError({
      code: "CI_PLATFORM_UNKNOWN",
      command: "ci",
      cwd,
      details: ["Could not detect CI platform. Specify: github, gitlab, bitbucket, or circleci."],
    }));
    return;
  }

  const scan = await scanProject(cwd);
  console.log(chalk.blue.bold(`\n  Generating CI config (${resolvedPlatform})\n`));
  console.log(chalk.dim(`  Stack: ${scan.language || "unknown"} / ${scan.framework || "none"} / ${scan.packageManager || "npm"}`));

  try {
    switch (resolvedPlatform) {
      case "github": await generateGitHubActions(cwd, scan); break;
      case "gitlab": await generateGitLabCI(cwd, scan); break;
      case "bitbucket": await generateBitbucket(cwd, scan); break;
      case "circleci": await generateCircleCI(cwd, scan); break;
    }
    console.log(chalk.green(`\n✓ Generated ${resolvedPlatform} CI config`));
  } catch (err) {
    printPlainError(createPSetupError({
      code: "CI_GENERATE_FAILED",
      command: "ci",
      cwd,
      details: [err instanceof Error ? err.message : String(err)],
    }));
  }
}

async function detectPlatform(cwd: string): Promise<CIPlatform | null> {
  const { existsSync } = await import("fs");
  if (existsSync(join(cwd, ".github"))) return "github";
  if (existsSync(join(cwd, ".gitlab-ci.yml"))) return "gitlab";
  if (existsSync(join(cwd, "bitbucket-pipelines.yml"))) return "bitbucket";
  if (existsSync(join(cwd, ".circleci"))) return "circleci";

  const { runCommand } = await import("../../executor/index.js");
  const result = await runCommand("git remote get-url origin 2>/dev/null", cwd);
  if (result.stdout.includes("github.com")) return "github";
  if (result.stdout.includes("gitlab")) return "gitlab";
  if (result.stdout.includes("bitbucket")) return "bitbucket";

  return "github";
}

async function generateGitHubActions(cwd: string, scan: ReturnType<typeof scanProject> extends Promise<infer T> ? T : never): Promise<void> {
  const dir = join(cwd, ".github", "workflows");
  await mkdir(dir, { recursive: true });

  const pm = scan.packageManager || "npm";
  const installCmd = pm === "yarn" ? "yarn install --frozen-lockfile" : pm === "pnpm" ? "pnpm install --frozen-lockfile" : pm === "bun" ? "bun install --frozen-lockfile" : "npm ci";
  const nodeVersion = scan.runtime?.version || "20";
  const hasTest = !!scan.scripts.test && scan.scripts.test !== 'echo "No tests configured"';
  const hasBuild = !!scan.scripts.build;
  const hasLint = !!scan.scripts.lint;
  const hasTypecheck = !!scan.scripts.typecheck;

  let yaml = `name: CI\n\non:\n  push:\n    branches: [main, master]\n  pull_request:\n    branches: [main, master]\n\njobs:\n  ci:\n    runs-on: ubuntu-latest\n\n    strategy:\n      matrix:\n        node-version: [${nodeVersion}]\n\n    steps:\n      - uses: actions/checkout@v4\n\n      - name: Setup Node.js\n        uses: actions/setup-node@v4\n        with:\n          node-version: \${{ matrix.node-version }}\n`;

  if (pm === "pnpm") {
    yaml += `\n      - name: Setup pnpm\n        uses: pnpm/action-setup@v4\n        with:\n          version: latest\n`;
  }

  yaml += `\n      - name: Install dependencies\n        run: ${installCmd}\n`;

  if (hasLint) yaml += `\n      - name: Lint\n        run: ${pm} run lint\n`;
  if (hasTypecheck) yaml += `\n      - name: Type check\n        run: ${pm} run typecheck\n`;
  if (hasBuild) yaml += `\n      - name: Build\n        run: ${pm} run build\n`;
  if (hasTest) yaml += `\n      - name: Test\n        run: ${pm} run test\n`;

  await writeFile(join(dir, "ci.yml"), yaml);
  console.log(chalk.green(`  ✓ .github/workflows/ci.yml`));
}

async function generateGitLabCI(cwd: string, scan: ReturnType<typeof scanProject> extends Promise<infer T> ? T : never): Promise<void> {
  const pm = scan.packageManager || "npm";
  const installCmd = pm === "pnpm" ? "pnpm install --frozen-lockfile" : pm === "yarn" ? "yarn install --frozen-lockfile" : "npm ci";

  let yaml = `image: node:${scan.runtime?.version || "20"}\n\nstages:\n  - install\n  - validate\n  - build\n  - test\n\ninstall:\n  stage: install\n  script:\n    - ${installCmd}\n  cache:\n    paths:\n      - node_modules/\n`;

  if (scan.scripts.lint) {
    yaml += `\nlint:\n  stage: validate\n  script:\n    - ${pm} run lint\n`;
  }

  if (scan.scripts.build) {
    yaml += `\nbuild:\n  stage: build\n  script:\n    - ${pm} run build\n  artifacts:\n    paths:\n      - dist/\n`;
  }

  if (scan.scripts.test) {
    yaml += `\ntest:\n  stage: test\n  script:\n    - ${pm} run test\n`;
  }

  await writeFile(join(cwd, ".gitlab-ci.yml"), yaml);
  console.log(chalk.green("  ✓ .gitlab-ci.yml"));
}

async function generateBitbucket(cwd: string, scan: ReturnType<typeof scanProject> extends Promise<infer T> ? T : never): Promise<void> {
  const pm = scan.packageManager || "npm";
  const installCmd = pm === "pnpm" ? "pnpm install" : pm === "yarn" ? "yarn install" : "npm ci";

  let yaml = `image: node:${scan.runtime?.version || "20"}\n\npipelines:\n  default:\n    - step:\n        name: Install & Test\n        caches:\n          - node\n        script:\n          - ${installCmd}\n`;

  if (scan.scripts.lint) yaml += `          - ${pm} run lint\n`;
  if (scan.scripts.build) yaml += `          - ${pm} run build\n`;
  if (scan.scripts.test) yaml += `          - ${pm} run test\n`;

  await writeFile(join(cwd, "bitbucket-pipelines.yml"), yaml);
  console.log(chalk.green("  ✓ bitbucket-pipelines.yml"));
}

async function generateCircleCI(cwd: string, scan: ReturnType<typeof scanProject> extends Promise<infer T> ? T : never): Promise<void> {
  const dir = join(cwd, ".circleci");
  await mkdir(dir, { recursive: true });

  const pm = scan.packageManager || "npm";
  const installCmd = pm === "pnpm" ? "pnpm install --frozen-lockfile" : pm === "yarn" ? "yarn install --frozen-lockfile" : "npm ci";

  let yaml = `version: 2.1\n\norbs:\n  node: circleci/node@5\n\njobs:\n  build-and-test:\n    docker:\n      - image: cimg/node:${scan.runtime?.version || "20"}.0\n    steps:\n      - checkout\n      - run: ${installCmd}\n`;

  if (scan.scripts.lint) yaml += `      - run: ${pm} run lint\n`;
  if (scan.scripts.build) yaml += `      - run: ${pm} run build\n`;
  if (scan.scripts.test) yaml += `      - run: ${pm} run test\n`;

  yaml += `\nworkflows:\n  main:\n    jobs:\n      - build-and-test\n`;

  await writeFile(join(dir, "config.yml"), yaml);
  console.log(chalk.green("  ✓ .circleci/config.yml"));
}
