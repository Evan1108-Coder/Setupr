import { readFile, readdir, access, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";
import type { ScanResult } from "../store/appStore.js";

export type ProjectContext = {
  cwd: string;
  scan: ScanResult;
  terminal: {
    shell: string;
    term: string;
    columns: number;
    rows: number;
    platform: string;
    nodeVersion: string;
  };
  git: {
    isRepo: boolean;
    branch?: string;
    remoteUrl?: string;
    isDirty?: boolean;
  };
  envVars: {
    defined: string[];
    required: string[];
    missing: string[];
  };
  fileTree: string[];
  configFiles: string[];
  monorepo: {
    detected: boolean;
    type?: "npm-workspaces" | "pnpm-workspaces" | "turborepo" | "lerna" | "nx";
    packages?: string[];
  };
};

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function runCmd(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 3000 }).trim();
  } catch {
    return "";
  }
}

async function collectGitInfo(cwd: string): Promise<ProjectContext["git"]> {
  const isRepo = await exists(join(cwd, ".git"));
  if (!isRepo) return { isRepo: false };

  const branch = runCmd(`git -C "${cwd}" branch --show-current`);
  const remoteUrl = runCmd(`git -C "${cwd}" remote get-url origin`);
  const status = runCmd(`git -C "${cwd}" status --porcelain`);

  return {
    isRepo: true,
    branch: branch || undefined,
    remoteUrl: remoteUrl || undefined,
    isDirty: status.length > 0,
  };
}

async function collectEnvInfo(cwd: string): Promise<ProjectContext["envVars"]> {
  const defined: string[] = [];
  const required: string[] = [];

  const envPath = join(cwd, ".env");
  const examplePath = join(cwd, ".env.example");

  if (await exists(envPath)) {
    const content = await readFile(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
      if (match) defined.push(match[1]);
    }
  }

  if (await exists(examplePath)) {
    const content = await readFile(examplePath, "utf-8");
    for (const line of content.split("\n")) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
      if (match) required.push(match[1]);
    }
  }

  const missing = required.filter((v) => !defined.includes(v));
  return { defined, required, missing };
}

async function collectFileTree(cwd: string, maxDepth = 2): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string, depth: number, prefix: string) {
    if (depth > maxDepth) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      results.push(rel);
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), depth + 1, rel);
      }
    }
  }

  await walk(cwd, 0, "");
  return results;
}

async function detectMonorepo(cwd: string, files: string[]): Promise<ProjectContext["monorepo"]> {
  if (files.includes("pnpm-workspace.yaml")) {
    const content = await readFile(join(cwd, "pnpm-workspace.yaml"), "utf-8").catch(() => "");
    const packages = content.match(/- ['"]?([^'"]+)['"]?/g)?.map((m) => m.replace(/- ['"]?/, "").replace(/['"]$/, "")) || [];
    return { detected: true, type: "pnpm-workspaces", packages };
  }

  if (files.includes("turbo.json") || files.includes("turborepo.json")) {
    return { detected: true, type: "turborepo" };
  }

  if (files.includes("lerna.json")) {
    return { detected: true, type: "lerna" };
  }

  if (files.includes("nx.json")) {
    return { detected: true, type: "nx" };
  }

  const pkgPath = join(cwd, "package.json");
  if (await exists(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
      if (pkg.workspaces) {
        const workspaces = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages || [];
        return { detected: true, type: "npm-workspaces", packages: workspaces };
      }
    } catch {}
  }

  return { detected: false };
}

const CONFIG_PATTERNS = [
  "tsconfig.json", "jsconfig.json", "vite.config.*", "next.config.*",
  "webpack.config.*", "rollup.config.*", "eslint.*", ".eslintrc*",
  "prettier.*", ".prettierrc*", "babel.config.*", ".babelrc",
  "jest.config.*", "vitest.config.*", "tailwind.config.*",
  "postcss.config.*", "docker-compose.*", "Dockerfile",
  ".github", "Makefile", "pyproject.toml", "setup.py", "setup.cfg",
];

function matchesConfigPattern(name: string): boolean {
  for (const pattern of CONFIG_PATTERNS) {
    if (pattern.includes("*")) {
      const prefix = pattern.split("*")[0];
      if (name.startsWith(prefix)) return true;
    } else if (name === pattern || name.startsWith(pattern)) {
      return true;
    }
  }
  return false;
}

export async function collectContext(cwd: string, scan: ScanResult): Promise<ProjectContext> {
  const rootFiles = await readdir(cwd).catch(() => [] as string[]);
  const [git, envVars, fileTree, monorepo] = await Promise.all([
    collectGitInfo(cwd),
    collectEnvInfo(cwd),
    collectFileTree(cwd),
    detectMonorepo(cwd, rootFiles),
  ]);

  const configFiles = rootFiles.filter(matchesConfigPattern);

  return {
    cwd,
    scan,
    terminal: {
      shell: process.env.SHELL || "unknown",
      term: process.env.TERM || "unknown",
      columns: process.stdout.columns || 80,
      rows: process.stdout.rows || 24,
      platform: process.platform,
      nodeVersion: process.version,
    },
    git,
    envVars,
    fileTree,
    configFiles,
    monorepo,
  };
}

export function contextToDSL(ctx: ProjectContext): string {
  const parts: string[] = [];

  parts.push(`[PRJ lang=${ctx.scan.language || "?"} fw=${ctx.scan.framework || "none"} pm=${ctx.scan.packageManager || "?"} deps=${ctx.scan.dependencies}]`);

  if (ctx.git.isRepo) {
    parts.push(`[GIT br=${ctx.git.branch || "?"} dirty=${ctx.git.isDirty ? "y" : "n"}${ctx.git.remoteUrl ? " remote=" + ctx.git.remoteUrl.split("/").pop()?.replace(".git", "") : ""}]`);
  }

  if (ctx.monorepo.detected) {
    parts.push(`[MONO type=${ctx.monorepo.type} pkgs=${ctx.monorepo.packages?.length || "?"}]`);
  }

  if (ctx.envVars.missing.length > 0) {
    parts.push(`[ENV missing=${ctx.envVars.missing.join(",")}]`);
  } else if (ctx.envVars.defined.length > 0) {
    parts.push(`[ENV ok vars=${ctx.envVars.defined.length}]`);
  }

  parts.push(`[SYS ${ctx.terminal.platform} node=${ctx.terminal.nodeVersion} shell=${basename(ctx.terminal.shell)}]`);

  if (ctx.configFiles.length > 0) {
    parts.push(`[CFG ${ctx.configFiles.slice(0, 8).join(",")}]`);
  }

  parts.push(`[TREE ${ctx.fileTree.length} files]`);

  return parts.join(" ");
}
