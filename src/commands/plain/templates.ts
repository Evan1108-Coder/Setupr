import chalk from "chalk";
import { mkdir, writeFile, readdir, rm } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { runCommand } from "../../executor/index.js";
import { createPSetupError, printPlainError } from "../../errors/index.js";

interface TemplateFlags {
  force?: boolean;
  args?: string[];
  [key: string]: unknown;
}

const TEMPLATES_DIR = ".p-setup/templates";

export async function cmdTemplate(sub: string | undefined, cwd: string, flags: TemplateFlags): Promise<void> {
  switch (sub) {
    case "new": return templateNew(cwd, flags);
    case "list": return templateList(cwd);
    case "save": return templateSave(cwd, flags);
    case "remove": return templateRemove(cwd, flags);
    default:
      printPlainError(createPSetupError({
        code: "UNKNOWN_SUBCOMMAND",
        command: "template",
        subcommand: sub,
        cwd,
        details: ["Valid: new <source>, list, save <name>, remove <name>"],
      }));
  }
}

async function templateNew(cwd: string, flags: TemplateFlags): Promise<void> {
  const source = flags.args?.[0];
  if (!source) {
    printPlainError(createPSetupError({
      code: "TEMPLATE_NOT_FOUND",
      command: "template",
      subcommand: "new",
      cwd,
      details: ["Usage: setup template new <github-repo-or-url>", "Examples:", "  setup template new user/repo", "  setup template new https://github.com/user/repo"],
    }));
    return;
  }

  const targetDir = flags.args?.[1] || cwd;
  const files = await readdir(targetDir).catch(() => []);
  if (files.length > 0 && !flags.force) {
    console.log(chalk.yellow("Target directory is not empty. Use --force to overwrite."));
    return;
  }

  let repoUrl = source;
  if (!source.startsWith("http") && !source.startsWith("git@")) {
    repoUrl = `https://github.com/${source}.git`;
  }

  console.log(chalk.blue(`Cloning template from: ${source}`));

  const cloneResult = await runCommand(`git clone --depth 1 ${repoUrl} "${targetDir}/.__temp_template"`, cwd);
  if (cloneResult.exitCode !== 0) {
    printPlainError(createPSetupError({
      code: "TEMPLATE_FETCH_FAILED",
      command: "template",
      cwd,
      details: [cloneResult.stderr.slice(0, 300)],
    }));
    return;
  }

  const tempDir = join(targetDir, ".__temp_template");
  await rm(join(tempDir, ".git"), { recursive: true, force: true });

  const { cpSync } = await import("fs");
  const entries = await readdir(tempDir);
  for (const entry of entries) {
    cpSync(join(tempDir, entry), join(targetDir, entry), { recursive: true });
  }
  await rm(tempDir, { recursive: true, force: true });

  console.log(chalk.green(`✓ Project scaffolded from ${source}`));
  console.log(chalk.dim("  Next: setup (to install and configure)"));
}

async function templateList(cwd: string): Promise<void> {
  console.log(chalk.blue.bold("\n  Built-in Templates\n"));
  const templates = [
    { name: "express-api", desc: "Express.js REST API (TypeScript)" },
    { name: "react-app", desc: "React + Vite (TypeScript)" },
    { name: "cli-tool", desc: "CLI tool (TypeScript + tsup)" },
    { name: "monorepo", desc: "Turborepo monorepo" },
  ];

  for (const t of templates) {
    console.log(`  ${chalk.green(t.name.padEnd(18))} ${chalk.dim(t.desc)}`);
  }

  const templatesDir = join(cwd, TEMPLATES_DIR);
  if (existsSync(templatesDir)) {
    const saved = await readdir(templatesDir).catch(() => []);
    if (saved.length > 0) {
      console.log(chalk.blue.bold("\n  Saved Templates\n"));
      for (const name of saved) {
        console.log(`  ${chalk.cyan(name)}`);
      }
    }
  }

  console.log(chalk.dim("\n  Use: setup template new <name-or-github-repo>"));
  console.log(chalk.dim("  Use: setup init <template-name> for built-in templates"));
}

async function templateSave(cwd: string, flags: TemplateFlags): Promise<void> {
  const name = flags.args?.[0];
  if (!name) {
    console.log(chalk.yellow("Usage: setup template save <name>"));
    return;
  }

  const templatesDir = join(cwd, TEMPLATES_DIR, name);
  await mkdir(templatesDir, { recursive: true });

  const filesToSave = ["package.json", "tsconfig.json", ".env.example", "Dockerfile", "docker-compose.yml"];
  const { readFile, copyFile } = await import("fs/promises");
  let saved = 0;

  for (const file of filesToSave) {
    const src = join(cwd, file);
    if (existsSync(src)) {
      await copyFile(src, join(templatesDir, file));
      saved++;
    }
  }

  const scan = await import("../../scanner/index.js").then(m => m.scanProject(cwd));
  const meta = { language: scan.language, framework: scan.framework, packageManager: scan.packageManager, savedAt: new Date().toISOString() };
  await writeFile(join(templatesDir, "template.json"), JSON.stringify(meta, null, 2));

  console.log(chalk.green(`✓ Saved template "${name}" (${saved} files)`));
}

async function templateRemove(cwd: string, flags: TemplateFlags): Promise<void> {
  const name = flags.args?.[0];
  if (!name) return;

  const templatesDir = join(cwd, TEMPLATES_DIR, name);
  if (!existsSync(templatesDir)) {
    console.log(chalk.yellow(`Template "${name}" not found.`));
    return;
  }

  await rm(templatesDir, { recursive: true, force: true });
  console.log(chalk.green(`✓ Removed template "${name}"`));
}
