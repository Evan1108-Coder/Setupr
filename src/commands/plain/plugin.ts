import chalk from "chalk";
import { readFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { createPSetupError, printPlainError } from "../../errors/index.js";
import { loadConfig, saveConfig } from "../../state/config.js";
import { runCommand } from "../../executor/index.js";

interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  hooks?: string[];
  commands?: string[];
}

export async function cmdPlugin(
  sub: string | undefined,
  cwd: string,
  flags: { args?: string[]; force?: boolean }
): Promise<void> {
  switch (sub) {
    case "install":
      await pluginInstall(cwd, flags);
      break;
    case "remove":
      await pluginRemove(cwd, flags);
      break;
    case "list":
      await pluginList(cwd);
      break;
    case "info":
      await pluginInfo(cwd, flags);
      break;
    case "enable":
      await pluginToggle(cwd, flags, true);
      break;
    case "disable":
      await pluginToggle(cwd, flags, false);
      break;
    default:
      printPlainError(
        createPSetupError({
          code: "UNKNOWN_SUBCOMMAND",
          command: "plugin",
          subcommand: sub,
          cwd,
          details: ["Valid subcommands: install, remove, list, info, enable, disable."],
        })
      );
  }
}

async function pluginInstall(cwd: string, flags: { args?: string[]; force?: boolean }): Promise<void> {
  const name = flags.args?.[0];
  if (!name) {
    printPlainError(
      createPSetupError({
        code: "PLUGIN_NOT_FOUND",
        command: "plugin",
        subcommand: "install",
        cwd,
        details: ["Usage: setup plugin install <name|url>"],
      })
    );
    return;
  }

  const pluginsDir = join(cwd, ".p-setup", "plugins");
  await mkdir(pluginsDir, { recursive: true });

  const isUrl = name.startsWith("http") || name.includes("/");

  try {
    if (isUrl) {
      const pluginDir = join(pluginsDir, name.split("/").pop()?.replace(/\.git$/, "") || "plugin");
      await runCommand(`git clone --depth 1 ${name} ${pluginDir}`, cwd);
      console.log(chalk.green(`✓ Installed plugin from ${name}`));
    } else {
      // npm-style install from registry
      const pluginDir = join(pluginsDir, name);
      await mkdir(pluginDir, { recursive: true });
      const result = await runCommand(`npm pack ${name} --pack-destination ${pluginDir}`, cwd);
      if (result.exitCode !== 0) {
        printPlainError(
          createPSetupError({
            code: "PLUGIN_REGISTRY_FAILED",
            command: "plugin",
            subcommand: "install",
            cwd,
            details: [`Could not install '${name}' from npm registry.`, result.stderr],
          })
        );
        return;
      }
      console.log(chalk.green(`✓ Installed plugin: ${name}`));
    }

    // Register in config
    const config = await loadConfig();
    const plugins = config.plugins || [];
    const existing = plugins.find((p) => p.name === name);
    if (!existing) {
      plugins.push({ name, version: "latest", enabled: true, source: isUrl ? "git" : "npm" });
      config.plugins = plugins;
      await saveConfig(config);
    }
  } catch (err) {
    printPlainError(
      createPSetupError({
        code: "PLUGIN_LOAD_FAILED",
        command: "plugin",
        subcommand: "install",
        cwd,
        details: [err instanceof Error ? err.message : String(err)],
      })
    );
  }
}

async function pluginRemove(cwd: string, flags: { args?: string[] }): Promise<void> {
  const name = flags.args?.[0];
  if (!name) {
    printPlainError(
      createPSetupError({
        code: "PLUGIN_NOT_FOUND",
        command: "plugin",
        subcommand: "remove",
        cwd,
        details: ["Usage: setup plugin remove <name>"],
      })
    );
    return;
  }

  const pluginDir = join(cwd, ".p-setup", "plugins", name);
  try {
    await rm(pluginDir, { recursive: true, force: true });
  } catch {}

  const config = await loadConfig();
  config.plugins = (config.plugins || []).filter((p) => p.name !== name);
  await saveConfig(config);

  console.log(chalk.green(`✓ Removed plugin: ${name}`));
}

async function pluginList(_cwd: string): Promise<void> {
  const config = await loadConfig();
  const plugins = config.plugins || [];

  if (plugins.length === 0) {
    console.log(chalk.dim("No plugins installed."));
    console.log(chalk.dim("Run 'setup plugin install <name>' to add one."));
    return;
  }

  console.log(chalk.blue.bold("\n  Installed Plugins\n"));
  for (const p of plugins) {
    const status = p.enabled ? chalk.green("●") : chalk.red("○");
    const source = chalk.dim(`(${p.source || "unknown"})`);
    console.log(`  ${status} ${chalk.white(p.name)} ${chalk.dim(p.version || "")} ${source}`);
  }
  console.log(chalk.dim(`\n  ${plugins.length} plugin${plugins.length === 1 ? "" : "s"} installed\n`));
}

async function pluginInfo(cwd: string, flags: { args?: string[] }): Promise<void> {
  const name = flags.args?.[0];
  if (!name) {
    printPlainError(
      createPSetupError({
        code: "PLUGIN_NOT_FOUND",
        command: "plugin",
        subcommand: "info",
        cwd,
        details: ["Usage: setup plugin info <name>"],
      })
    );
    return;
  }

  const pluginDir = join(cwd, ".p-setup", "plugins", name);
  try {
    const manifestPath = join(pluginDir, "package.json");
    const raw = await readFile(manifestPath, "utf-8");
    const manifest: PluginManifest = JSON.parse(raw);

    console.log(chalk.blue.bold(`\n  Plugin: ${manifest.name}\n`));
    console.log(`  Version:     ${chalk.white(manifest.version)}`);
    console.log(`  Description: ${chalk.white(manifest.description || "none")}`);
    if (manifest.author) console.log(`  Author:      ${chalk.white(manifest.author)}`);
    if (manifest.hooks) console.log(`  Hooks:       ${chalk.dim(manifest.hooks.join(", "))}`);
    if (manifest.commands) console.log(`  Commands:    ${chalk.dim(manifest.commands.join(", "))}`);
    console.log("");
  } catch {
    printPlainError(
      createPSetupError({
        code: "PLUGIN_NOT_FOUND",
        command: "plugin",
        subcommand: "info",
        cwd,
        details: [`Plugin '${name}' not found or missing package.json.`],
      })
    );
  }
}

async function pluginToggle(cwd: string, flags: { args?: string[] }, enable: boolean): Promise<void> {
  const name = flags.args?.[0];
  if (!name) {
    printPlainError(
      createPSetupError({
        code: "PLUGIN_NOT_FOUND",
        command: "plugin",
        subcommand: enable ? "enable" : "disable",
        cwd,
        details: [`Usage: setup plugin ${enable ? "enable" : "disable"} <name>`],
      })
    );
    return;
  }

  const config = await loadConfig();
  const plugin = (config.plugins || []).find((p) => p.name === name);
  if (!plugin) {
    printPlainError(
      createPSetupError({
        code: "PLUGIN_NOT_FOUND",
        command: "plugin",
        subcommand: enable ? "enable" : "disable",
        cwd,
        details: [`Plugin '${name}' is not installed.`],
      })
    );
    return;
  }

  plugin.enabled = enable;
  await saveConfig(config);
  console.log(chalk.green(`✓ Plugin '${name}' ${enable ? "enabled" : "disabled"}`));
}
