import chalk from "chalk";
import { readFile, writeFile, mkdir } from "fs/promises";
import { isAbsolute, join, basename } from "path";
import { createSetuprError, printPlainError } from "../../errors/index.js";
import { scanProject } from "../../scanner/index.js";

interface ShareConfig {
  name: string;
  version: string;
  exportedAt: string;
  language?: string;
  framework?: string;
  packageManager?: string;
  runtime?: { name: string; version?: string };
  scripts?: Record<string, string>;
  dependencies?: { prod: number; dev: number };
  envKeys?: string[];
  configFiles?: string[];
  services?: string[];
  monorepo?: { type: string; packages: string[] };
  preferences?: Record<string, unknown>;
}

export async function cmdShare(
  sub: string | undefined,
  cwd: string,
  flags: { args?: string[]; force?: boolean }
): Promise<void> {
  switch (sub) {
    case "export":
      await shareExport(cwd, flags);
      break;
    case "import":
      await shareImport(cwd, flags);
      break;
    case "inspect":
      await shareInspect(cwd, flags);
      break;
    default:
      printPlainError(
        createSetuprError({
          code: "UNKNOWN_SUBCOMMAND",
          command: "share",
          subcommand: sub,
          cwd,
          details: ["Valid subcommands: export, import, inspect."],
        })
      );
  }
}

async function shareExport(cwd: string, flags: { args?: string[]; force?: boolean }): Promise<void> {
  const outputName = flags.args?.[0] || `${basename(cwd)}.setupr.json`;
  const outputPath = resolveSharePath(cwd, outputName);

  try {
    const scan = await scanProject(cwd);

    let envKeys: string[] = [];
    try {
      const exampleContent = await readFile(join(cwd, ".env.example"), "utf-8");
      envKeys = exampleContent
        .split("\n")
        .map((l) => l.split("=")[0].trim())
        .filter((k) => k && !k.startsWith("#"));
    } catch {}

    const config: ShareConfig = {
      name: basename(cwd),
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      language: scan.language || undefined,
      framework: scan.framework || undefined,
      packageManager: scan.packageManager || undefined,
      runtime: scan.runtime ? { name: scan.runtime.name, version: scan.runtime.version || undefined } : undefined,
      scripts: Object.keys(scan.scripts).length > 0 ? scan.scripts : undefined,
      dependencies: scan.dependencies,
      envKeys: envKeys.length > 0 ? envKeys : undefined,
      configFiles: scan.configFiles.length > 0 ? scan.configFiles : undefined,
      services: scan.services.length > 0 ? scan.services : undefined,
      monorepo: scan.monorepo || undefined,
    };

    await writeFile(outputPath, JSON.stringify(config, null, 2) + "\n");
    console.log(chalk.green(`✓ Exported project config to ${outputName}`));
    console.log(chalk.dim(`  Language: ${config.language || "unknown"}`));
    console.log(chalk.dim(`  Framework: ${config.framework || "none"}`));
    console.log(chalk.dim(`  PM: ${config.packageManager || "none"}`));
    if (envKeys.length > 0) {
      console.log(chalk.dim(`  Env keys: ${envKeys.length} variables`));
    }
  } catch (err) {
    printPlainError(
      createSetuprError({
        code: "SHARE_EXPORT_FAILED",
        command: "share",
        subcommand: "export",
        cwd,
        details: [err instanceof Error ? err.message : String(err)],
      })
    );
  }
}

async function shareImport(cwd: string, flags: { args?: string[]; force?: boolean }): Promise<void> {
  const inputName = flags.args?.[0];
  if (!inputName) {
    printPlainError(
      createSetuprError({
        code: "SHARE_IMPORT_FAILED",
        command: "share",
        subcommand: "import",
        cwd,
        details: ["Usage: setup share import <config-file>"],
      })
    );
    return;
  }

  try {
    const inputPath = resolveSharePath(cwd, inputName);
    const raw = await readFile(inputPath, "utf-8");
    const config: ShareConfig = JSON.parse(raw);

    if (!config.name || !config.exportedAt) {
      printPlainError(
        createSetuprError({
          code: "SHARE_IMPORT_FAILED",
          command: "share",
          subcommand: "import",
          cwd,
          details: ["Invalid config file: missing required fields (name, exportedAt)."],
        })
      );
      return;
    }

    console.log(chalk.blue.bold("\n  Importing Project Config\n"));
    console.log(chalk.dim(`  From: ${inputName}`));
    console.log(chalk.dim(`  Exported: ${config.exportedAt}`));
    console.log("");

    // Create .env.example from envKeys
    if (config.envKeys && config.envKeys.length > 0) {
      const envExamplePath = join(cwd, ".env.example");
      const envContent = config.envKeys.map((k) => `${k}=`).join("\n") + "\n";
      await writeFile(envExamplePath, envContent);
      console.log(chalk.green(`  ✓ Created .env.example with ${config.envKeys.length} keys`));
    }

    // Create .setupr directory with imported config
    const psetupDir = join(cwd, ".setupr");
    await mkdir(psetupDir, { recursive: true });
    await writeFile(join(psetupDir, "imported.json"), JSON.stringify(config, null, 2) + "\n");
    console.log(chalk.green("  ✓ Saved imported config to .setupr/imported.json"));

    // Show recommendations
    console.log(chalk.blue("\n  Recommendations:"));
    if (config.packageManager) {
      console.log(chalk.dim(`  • Use ${config.packageManager} as package manager`));
    }
    if (config.runtime) {
      console.log(chalk.dim(`  • Runtime: ${config.runtime.name} ${config.runtime.version || ""}`));
    }
    if (config.services && config.services.length > 0) {
      console.log(chalk.dim(`  • Services needed: ${config.services.join(", ")}`));
    }
    console.log(chalk.dim("\n  Run 'setup' to apply this configuration.\n"));
  } catch (err) {
    printPlainError(
      createSetuprError({
        code: "SHARE_IMPORT_FAILED",
        command: "share",
        subcommand: "import",
        cwd,
        details: [err instanceof Error ? err.message : String(err)],
      })
    );
  }
}

async function shareInspect(cwd: string, flags: { args?: string[] }): Promise<void> {
  const inputName = flags.args?.[0];
  if (!inputName) {
    printPlainError(
      createSetuprError({
        code: "SHARE_IMPORT_FAILED",
        command: "share",
        subcommand: "inspect",
        cwd,
        details: ["Usage: setup share inspect <config-file>"],
      })
    );
    return;
  }

  try {
    const inputPath = resolveSharePath(cwd, inputName);
    const raw = await readFile(inputPath, "utf-8");
    const config: ShareConfig = JSON.parse(raw);

    console.log(chalk.blue.bold("\n  Share Config Inspection\n"));
    console.log(`  Name:         ${chalk.white(config.name)}`);
    console.log(`  Version:      ${chalk.white(config.version)}`);
    console.log(`  Exported:     ${chalk.dim(config.exportedAt)}`);
    console.log(`  Language:     ${chalk.white(config.language || "unknown")}`);
    console.log(`  Framework:    ${chalk.white(config.framework || "none")}`);
    console.log(`  PM:           ${chalk.white(config.packageManager || "none")}`);
    if (config.runtime) {
      console.log(`  Runtime:      ${chalk.white(`${config.runtime.name} ${config.runtime.version || ""}`)}`);
    }
    if (config.dependencies) {
      console.log(`  Dependencies: ${chalk.white(`${config.dependencies.prod} prod, ${config.dependencies.dev} dev`)}`);
    }
    if (config.envKeys) {
      console.log(`  Env keys:     ${chalk.white(config.envKeys.join(", "))}`);
    }
    if (config.services && config.services.length > 0) {
      console.log(`  Services:     ${chalk.white(config.services.join(", "))}`);
    }
    if (config.configFiles && config.configFiles.length > 0) {
      console.log(`  Configs:      ${chalk.dim(config.configFiles.join(", "))}`);
    }
    if (config.monorepo) {
      console.log(`  Monorepo:     ${chalk.white(`${config.monorepo.type} (${config.monorepo.packages.length} packages)`)}`);
    }
    if (config.scripts) {
      console.log(chalk.blue("\n  Scripts:"));
      for (const [name, cmd] of Object.entries(config.scripts)) {
        console.log(`    ${chalk.green(name.padEnd(15))} ${chalk.dim(cmd)}`);
      }
    }
    console.log("");
  } catch (err) {
    printPlainError(
      createSetuprError({
        code: "SHARE_IMPORT_FAILED",
        command: "share",
        subcommand: "inspect",
        cwd,
        details: [err instanceof Error ? err.message : String(err)],
      })
    );
  }
}

function resolveSharePath(cwd: string, file: string): string {
  return isAbsolute(file) ? file : join(cwd, file);
}
