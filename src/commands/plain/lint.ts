import chalk from "chalk";
import { writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { createPSetupError, printPlainError } from "../../errors/index.js";
import { scanProject } from "../../scanner/index.js";
import { runCommand } from "../../executor/index.js";

interface LintFlags {
  force?: boolean;
  args?: string[];
  [key: string]: unknown;
}

export async function cmdLint(sub: string | undefined, cwd: string, flags: LintFlags): Promise<void> {
  const action = sub || "run";

  switch (action) {
    case "run": return lintRun(cwd, flags);
    case "setup": return lintSetup(cwd, flags);
    case "fix": return lintFix(cwd, flags);
    default:
      printPlainError(createPSetupError({
        code: "UNKNOWN_SUBCOMMAND",
        command: "lint",
        subcommand: sub,
        cwd,
        details: ["Valid: run, setup, fix"],
      }));
  }
}

async function lintRun(cwd: string, flags: LintFlags): Promise<void> {
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";

  if (scan.scripts.lint) {
    console.log(chalk.blue(`Running lint with ${pm}...`));
    const result = await runCommand(`${pm} run lint`, cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green("✓ Lint passed"));
    } else {
      console.log(result.stdout);
      console.log(result.stderr);
      printPlainError(createPSetupError({ code: "COMMAND_FAILED", command: "lint", cwd, details: ["Lint check failed."] }));
    }
  } else {
    // Try to detect and run appropriate linter directly
    if (existsSync(join(cwd, ".eslintrc.json")) || existsSync(join(cwd, ".eslintrc.js")) || existsSync(join(cwd, "eslint.config.js")) || existsSync(join(cwd, "eslint.config.mjs"))) {
      const result = await runCommand(`npx eslint . --ext .ts,.tsx,.js,.jsx`, cwd);
      if (result.exitCode === 0) console.log(chalk.green("✓ ESLint passed"));
      else { console.log(result.stdout); console.log(result.stderr); }
    } else if (existsSync(join(cwd, "biome.json"))) {
      const result = await runCommand(`npx @biomejs/biome check .`, cwd);
      if (result.exitCode === 0) console.log(chalk.green("✓ Biome check passed"));
      else { console.log(result.stdout); console.log(result.stderr); }
    } else {
      console.log(chalk.yellow("No lint configuration found."));
      console.log(chalk.dim("  Run 'setup lint setup' to configure a linter."));
    }
  }
}

async function lintSetup(cwd: string, flags: LintFlags): Promise<void> {
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";
  const lang = (scan.language || "").toLowerCase();
  const tool = flags.args?.[0] || "eslint";

  if (tool === "eslint") {
    if (lang === "typescript" || lang === "javascript") {
      const eslintConfig = {
        root: true,
        env: { node: true, es2022: true },
        extends: [
          "eslint:recommended",
          ...(lang === "typescript" ? ["plugin:@typescript-eslint/recommended"] : []),
        ],
        parser: lang === "typescript" ? "@typescript-eslint/parser" : undefined,
        parserOptions: { ecmaVersion: "latest", sourceType: "module" },
        rules: {
          "no-unused-vars": "warn",
          "no-console": "off",
        },
      };

      await writeFile(join(cwd, ".eslintrc.json"), JSON.stringify(eslintConfig, null, 2) + "\n");
      console.log(chalk.green("✓ Created .eslintrc.json"));

      const installCmd = pm === "npm" ? "npm install -D" : pm === "yarn" ? "yarn add -D" : pm === "pnpm" ? "pnpm add -D" : "bun add -D";
      const packages = lang === "typescript"
        ? "eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin"
        : "eslint";
      console.log(chalk.dim(`  Install: ${installCmd} ${packages}`));
    }
  } else if (tool === "biome") {
    const biomeConfig = {
      $schema: "https://biomejs.dev/schemas/1.9.0/schema.json",
      organizeImports: { enabled: true },
      linter: {
        enabled: true,
        rules: { recommended: true },
      },
      formatter: {
        enabled: true,
        indentStyle: "space",
        indentWidth: 2,
      },
    };
    await writeFile(join(cwd, "biome.json"), JSON.stringify(biomeConfig, null, 2) + "\n");
    console.log(chalk.green("✓ Created biome.json"));
    console.log(chalk.dim(`  Install: ${pm === "npm" ? "npm install -D" : `${pm} add -D`} @biomejs/biome`));
  } else if (tool === "prettier") {
    const prettierConfig = {
      semi: true,
      singleQuote: true,
      tabWidth: 2,
      trailingComma: "es5",
      printWidth: 100,
    };
    await writeFile(join(cwd, ".prettierrc"), JSON.stringify(prettierConfig, null, 2) + "\n");
    await writeFile(join(cwd, ".prettierignore"), "node_modules\ndist\nbuild\ncoverage\n");
    console.log(chalk.green("✓ Created .prettierrc and .prettierignore"));
  }
}

async function lintFix(cwd: string, flags: LintFlags): Promise<void> {
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";

  if (scan.scripts["lint:fix"]) {
    const result = await runCommand(`${pm} run lint:fix`, cwd);
    if (result.exitCode === 0) console.log(chalk.green("✓ Lint fix applied"));
    else console.log(result.stderr);
  } else if (scan.scripts.lint) {
    const result = await runCommand(`${pm} run lint -- --fix`, cwd);
    if (result.exitCode === 0) console.log(chalk.green("✓ Lint fix applied"));
    else console.log(result.stderr);
  } else if (existsSync(join(cwd, "biome.json"))) {
    const result = await runCommand("npx @biomejs/biome check --write .", cwd);
    if (result.exitCode === 0) console.log(chalk.green("✓ Biome fix applied"));
    else console.log(result.stderr);
  } else {
    const result = await runCommand("npx eslint . --fix --ext .ts,.tsx,.js,.jsx", cwd);
    if (result.exitCode === 0) console.log(chalk.green("✓ ESLint fix applied"));
    else console.log(result.stderr);
  }
}
