import chalk from "chalk";
import { writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { createPSetupError, printPlainError } from "../../errors/index.js";
import { scanProject } from "../../scanner/index.js";
import { runCommand } from "../../executor/index.js";

interface FormatFlags {
  force?: boolean;
  args?: string[];
  [key: string]: unknown;
}

export async function cmdFormat(sub: string | undefined, cwd: string, flags: FormatFlags): Promise<void> {
  const action = sub || "run";

  switch (action) {
    case "run": return formatRun(cwd, flags);
    case "check": return formatCheck(cwd, flags);
    case "setup": return formatSetup(cwd, flags);
    default:
      printPlainError(createPSetupError({
        code: "UNKNOWN_SUBCOMMAND",
        command: "format",
        subcommand: sub,
        cwd,
        details: ["Valid: run, check, setup"],
      }));
  }
}

async function formatRun(cwd: string, _flags: FormatFlags): Promise<void> {
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";

  if (scan.scripts.format) {
    const result = await runCommand(`${pm} run format`, cwd);
    if (result.exitCode === 0) console.log(chalk.green("✓ Formatted"));
    else console.log(result.stderr);
    return;
  }

  const formatter = detectFormatter(cwd);
  if (formatter === "prettier") {
    const result = await runCommand('npx prettier --write "**/*.{ts,tsx,js,jsx,json,css,md}"', cwd);
    if (result.exitCode === 0) console.log(chalk.green("✓ Formatted with Prettier"));
    else console.log(result.stderr);
  } else if (formatter === "biome") {
    const result = await runCommand("npx @biomejs/biome format --write .", cwd);
    if (result.exitCode === 0) console.log(chalk.green("✓ Formatted with Biome"));
    else console.log(result.stderr);
  } else if ((scan.language || "").toLowerCase() === "python") {
    const result = await runCommand("python -m black . 2>/dev/null || ruff format .", cwd);
    if (result.exitCode === 0) console.log(chalk.green("✓ Formatted Python files"));
    else console.log(result.stderr);
  } else if ((scan.language || "").toLowerCase() === "go") {
    const result = await runCommand("gofmt -w .", cwd);
    if (result.exitCode === 0) console.log(chalk.green("✓ Formatted Go files"));
    else console.log(result.stderr);
  } else if ((scan.language || "").toLowerCase() === "rust") {
    const result = await runCommand("cargo fmt", cwd);
    if (result.exitCode === 0) console.log(chalk.green("✓ Formatted Rust files"));
    else console.log(result.stderr);
  } else {
    console.log(chalk.yellow("No formatter detected."));
    console.log(chalk.dim("  Run 'setup format setup' to configure Prettier or Biome."));
  }
}

async function formatCheck(cwd: string, _flags: FormatFlags): Promise<void> {
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";

  if (scan.scripts["format:check"]) {
    const result = await runCommand(`${pm} run format:check`, cwd);
    if (result.exitCode === 0) console.log(chalk.green("✓ All files formatted correctly"));
    else { console.log(result.stdout); printPlainError(createPSetupError({ code: "COMMAND_FAILED", command: "format", subcommand: "check", cwd, details: ["Some files need formatting."] })); }
    return;
  }

  const formatter = detectFormatter(cwd);
  if (formatter === "prettier") {
    const result = await runCommand('npx prettier --check "**/*.{ts,tsx,js,jsx,json,css,md}"', cwd);
    if (result.exitCode === 0) console.log(chalk.green("✓ All files formatted correctly"));
    else console.log(chalk.yellow("Some files need formatting. Run 'setup format' to fix."));
  } else if (formatter === "biome") {
    const result = await runCommand("npx @biomejs/biome format .", cwd);
    if (result.exitCode === 0) console.log(chalk.green("✓ All files formatted correctly"));
    else console.log(chalk.yellow("Some files need formatting. Run 'setup format' to fix."));
  } else {
    console.log(chalk.yellow("No formatter configured."));
  }
}

async function formatSetup(cwd: string, flags: FormatFlags): Promise<void> {
  const tool = flags.args?.[0] || "prettier";
  const scan = await scanProject(cwd);

  if (tool === "prettier") {
    const config = {
      semi: true,
      singleQuote: true,
      tabWidth: 2,
      trailingComma: "es5",
      printWidth: 100,
      arrowParens: "always",
      endOfLine: "lf",
    };
    await writeFile(join(cwd, ".prettierrc"), JSON.stringify(config, null, 2) + "\n");

    const ignoreEntries = ["node_modules", "dist", "build", "coverage", ".next", ".nuxt", "pnpm-lock.yaml", "package-lock.json", "yarn.lock"];
    await writeFile(join(cwd, ".prettierignore"), ignoreEntries.join("\n") + "\n");
    console.log(chalk.green("✓ Created .prettierrc and .prettierignore"));

    const pm = scan.packageManager || "npm";
    const installCmd = pm === "npm" ? "npm install -D" : pm === "yarn" ? "yarn add -D" : pm === "pnpm" ? "pnpm add -D" : "bun add -D";
    console.log(chalk.dim(`  Install: ${installCmd} prettier`));
  } else if (tool === "biome") {
    const config = {
      $schema: "https://biomejs.dev/schemas/1.9.0/schema.json",
      formatter: {
        enabled: true,
        indentStyle: "space",
        indentWidth: 2,
        lineWidth: 100,
      },
    };
    await writeFile(join(cwd, "biome.json"), JSON.stringify(config, null, 2) + "\n");
    console.log(chalk.green("✓ Created biome.json"));
  } else if (tool === "editorconfig") {
    const content = `root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false

[*.{py,rs}]
indent_size = 4
`;
    await writeFile(join(cwd, ".editorconfig"), content);
    console.log(chalk.green("✓ Created .editorconfig"));
  }
}

function detectFormatter(cwd: string): "prettier" | "biome" | null {
  if (existsSync(join(cwd, ".prettierrc")) || existsSync(join(cwd, ".prettierrc.json")) || existsSync(join(cwd, "prettier.config.js"))) {
    return "prettier";
  }
  if (existsSync(join(cwd, "biome.json")) || existsSync(join(cwd, "biome.jsonc"))) {
    return "biome";
  }
  return null;
}
