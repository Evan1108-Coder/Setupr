import chalk from "chalk";
import { scanProject } from "../../scanner/index.js";
import { runCommand } from "../../executor/index.js";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { initEnvFile, normalizeEnvKey, parseEnvKeys, parseEnvPairs } from "../../env/index.js";
import { createSetuprError, printPlainError, classifyCommandFailure } from "../../errors/index.js";

interface Flags {
  force?: boolean;
  args?: string[];
  [key: string]: any;
}

export async function runNonTUICommand(
  command: string,
  sub: string | undefined,
  cwd: string,
  flags: Flags
): Promise<void> {
  switch (command) {
    case "dashboard":
    case "status": {
      const { runPlainMode } = await import("../../cli/plain.js");
      await runPlainMode(command, cwd, sub, { force: flags.force, json: Boolean(flags.json) });
      break;
    }
    case "env":
      await cmdEnv(sub, cwd, flags);
      break;
    case "auth": {
      const { cmdAuth } = await import("./auth.js");
      await cmdAuth(sub, cwd, { ...flags, args: flags.args || [] });
      break;
    }
    case "info":
      await cmdInfo(cwd);
      break;
    case "list":
      await cmdList(cwd);
      break;
    case "run":
      await cmdRun(sub, cwd);
      break;
    case "switch":
      await cmdSwitch(sub, cwd);
      break;
    case "add":
      await cmdAdd(sub, cwd);
      break;
    case "remove":
      await cmdRemove(sub, cwd);
      break;
    case "port":
      await cmdPort(sub, cwd);
      break;
    case "deps":
      await cmdDeps(cwd);
      break;
    case "config":
      await cmdConfig(sub, cwd, flags);
      break;
    case "lock":
      await cmdLock(cwd);
      break;
    case "diff":
      await cmdDiff(cwd);
      break;
    case "logs":
      await cmdProcessLogs(cwd, sub);
      break;
    case "ps":
      await cmdPs(cwd, flags);
      break;
    case "stop":
      await cmdStop(cwd, sub, flags);
      break;
    case "restart":
      await cmdRestart(cwd, sub, flags);
      break;
    case "test":
      await cmdTest(cwd);
      break;
    case "build":
      await cmdBuild(cwd);
      break;
    case "deploy":
      await cmdDeploy(cwd);
      break;
    case "open":
      await cmdOpen(sub, cwd);
      break;
    case "git": {
      const { cmdGit } = await import("./git.js");
      await cmdGit(sub, cwd, { ...flags, args: flags.args || [] });
      break;
    }
    case "init": {
      const { cmdInit } = await import("./init.js");
      await cmdInit(cwd, { ...flags, args: sub ? [sub, ...(flags.args || [])] : flags.args || [] });
      break;
    }
    case "migrate": {
      const { cmdMigrate } = await import("./migrate.js");
      await cmdMigrate(sub, cwd, { ...flags, args: flags.args || [] });
      break;
    }
    case "ci": {
      const { cmdCI } = await import("./ci.js");
      await cmdCI(sub, cwd, { ...flags, args: flags.args || [] });
      break;
    }
    case "docker": {
      const { cmdDocker } = await import("./docker.js");
      await cmdDocker(sub, cwd, { ...flags, args: flags.args || [] });
      break;
    }
    case "secrets": {
      const { cmdSecrets } = await import("./secrets.js");
      await cmdSecrets(sub, cwd, { ...flags, args: flags.args || [] });
      break;
    }
    case "templates": {
      const { cmdTemplate } = await import("./templates.js");
      await cmdTemplate(sub, cwd, { ...flags, args: flags.args || [] });
      break;
    }
    case "workspace": {
      const { cmdWorkspace } = await import("./workspace.js");
      await cmdWorkspace(sub, cwd, { ...flags, args: flags.args || [] });
      break;
    }
    case "health": {
      const { cmdHealth } = await import("./health.js");
      await cmdHealth(sub, cwd, { ...flags, args: flags.args || [] });
      break;
    }
    case "share": {
      const { cmdShare } = await import("./share.js");
      await cmdShare(sub, cwd, { ...flags, args: flags.args || [] });
      break;
    }
    case "plugin": {
      const { cmdPlugin } = await import("./plugin.js");
      await cmdPlugin(sub, cwd, { ...flags, args: flags.args || [] });
      break;
    }
    case "lint": {
      const { cmdLint } = await import("./lint.js");
      await cmdLint(sub, cwd, { ...flags, args: flags.args || [] });
      break;
    }
    case "format": {
      const { cmdFormat } = await import("./format.js");
      await cmdFormat(sub, cwd, { ...flags, args: flags.args || [] });
      break;
    }
    case "scaffold": {
      const { cmdScaffold } = await import("./scaffold.js");
      await cmdScaffold(sub, cwd, { ...flags, args: flags.args || [] });
      break;
    }
    default:
      printPlainError(createSetuprError({
        code: "UNKNOWN_COMMAND",
        command,
        cwd,
        details: [`Received: ${command}`],
      }));
  }
}

async function cmdEnv(sub: string | undefined, cwd: string, flags: Flags) {
  const envPath = join(cwd, ".env");
  const examplePath = join(cwd, ".env.example");

  switch (sub) {
    case "init": {
      let result;
      try {
        result = await initEnvFile(cwd, { overwrite: flags.force });
      } catch (err) {
        printPlainError(createSetuprError({
          code: "ENV_WRITE_FAILED",
          command: "env",
          subcommand: "init",
          cwd,
          details: [err instanceof Error ? err.message : String(err)],
          forceBehavior: "Force mode can overwrite files, but it cannot write through directories, locked files, or denied permissions.",
        }));
        return;
      }
      if (result.skipped) {
        if (result.reason === "missing-example") {
          printPlainError(createSetuprError({
            code: "ENV_TEMPLATE_MISSING",
            command: "env",
            subcommand: "init",
            cwd,
            forceBehavior: "With --force, Setupr creates an empty .env and tells you no variables were inferred.",
          }));
        } else {
          printPlainError(createSetuprError({
            code: "ENV_ALREADY_EXISTS",
            command: "env",
            subcommand: "init",
            cwd,
          }));
        }
      } else if (result.source === ".env.example") {
        console.log(chalk.green("✓ Created .env from .env.example"));
      } else {
        console.log(chalk.yellow("⚠ Created empty .env because --force was used and no .env.example was found."));
        console.log(chalk.dim("  No required variables could be inferred."));
      }
      break;
    }
    case "check": {
      try {
        const example = await readFile(examplePath, "utf-8");
        const env = await readFile(envPath, "utf-8").catch(() => "");
        const required = parseEnvKeys(example);
        const defined = parseEnvKeys(env);
        const currentPairs = parseEnvPairs(env);
        const missing = required.filter((k) => !defined.includes(k) || !currentPairs[k]?.trim());
        if (missing.length === 0) {
          console.log(chalk.green("✓ All environment variables are set"));
        } else {
          printPlainError(createSetuprError({
            code: "ENV_CHECK_FAILED",
            command: "env",
            subcommand: "check",
            cwd,
            details: [`Missing ${missing.length} variable${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`],
            canContinue: false,
          }));
        }
      } catch (err) {
        printPlainError(createSetuprError({
          code: envReadErrorCode(err),
          command: "env",
          subcommand: "check",
          cwd,
          details: [err instanceof Error ? err.message : String(err)],
          canContinue: false,
        }));
      }
      break;
    }
    case "sync": {
      try {
        const example = await readFile(examplePath, "utf-8");
        const env = await readFile(envPath, "utf-8").catch(() => "");
        const currentPairs = parseEnvPairs(env);
        let newContent = "";
        for (const line of example.split("\n")) {
          const rawKey = line.split("=")[0].trim();
          const key = normalizeEnvKey(rawKey);
          if (key && !key.startsWith("#") && currentPairs[key]) {
            const prefix = rawKey.startsWith("export ") ? "export " : "";
            newContent += `${prefix}${key}=${currentPairs[key]}\n`;
          } else {
            newContent += line + "\n";
          }
        }
        await writeFile(envPath, newContent);
        console.log(chalk.green("✓ Synced .env with .env.example structure"));
      } catch (e) {
        printPlainError(createSetuprError({
          code: "ENV_SYNC_FAILED",
          command: "env",
          subcommand: "sync",
          cwd,
          details: [(e as Error).message],
        }));
      }
      break;
    }
    case "smart": {
      console.log(chalk.blue.bold("\n  🧠 Env Smart Analysis\n"));
      try {
        const example = await readFile(examplePath, "utf-8");
        const env = await readFile(envPath, "utf-8").catch(() => "");
        const examplePairs = parseEnvPairs(example);
        const currentPairs = parseEnvPairs(env);
        const exampleKeys = parseEnvKeys(example);
        const currentKeys = parseEnvKeys(env);

        const missing: string[] = [];
        const empty: string[] = [];
        const invalid: string[] = [];
        const extra: string[] = [];
        const changed: string[] = [];

        for (const key of exampleKeys) {
          if (!currentKeys.includes(key)) {
            missing.push(key);
          } else if (!currentPairs[key] || currentPairs[key].trim() === "" || currentPairs[key] === '""' || currentPairs[key] === "''") {
            empty.push(key);
          } else {
            const val = currentPairs[key];
            if (isLikelyInvalid(key, val)) {
              invalid.push(key);
            }
          }
        }

        for (const key of currentKeys) {
          if (!exampleKeys.includes(key)) {
            extra.push(key);
          }
        }

        const exampleDefaultPairs = parseEnvPairs(example);
        for (const key of exampleKeys) {
          if (currentPairs[key] && exampleDefaultPairs[key] && currentPairs[key] !== exampleDefaultPairs[key] && exampleDefaultPairs[key].trim() !== "") {
            changed.push(key);
          }
        }

        let issues = 0;

        if (missing.length > 0) {
          issues += missing.length;
          console.log(chalk.red(`  ✗ Missing (${missing.length}):`));
          missing.forEach((k) => {
            const defaultVal = examplePairs[k];
            console.log(chalk.dim(`    ${k}`) + (defaultVal ? chalk.dim(` (default: ${defaultVal})`) : chalk.yellow(" — needs value")));
          });
          console.log("");
        }

        if (empty.length > 0) {
          issues += empty.length;
          console.log(chalk.yellow(`  ⚠ Empty/placeholder values (${empty.length}):`));
          empty.forEach((k) => console.log(chalk.dim(`    ${k}=${currentPairs[k] || ""}`)));
          console.log("");
        }

        if (invalid.length > 0) {
          issues += invalid.length;
          console.log(chalk.yellow(`  ⚠ Possibly invalid (${invalid.length}):`));
          invalid.forEach((k) => console.log(chalk.dim(`    ${k}=${currentPairs[k]}`) + chalk.yellow(` — ${getInvalidReason(k, currentPairs[k])}`)));
          console.log("");
        }

        if (extra.length > 0) {
          console.log(chalk.cyan(`  ℹ Extra vars not in .env.example (${extra.length}):`));
          extra.forEach((k) => console.log(chalk.dim(`    ${k}`)));
          console.log("");
        }

        if (changed.length > 0) {
          console.log(chalk.cyan(`  ℹ Customized from defaults (${changed.length}):`));
          changed.forEach((k) => console.log(chalk.dim(`    ${k}: ${exampleDefaultPairs[k]} → ${currentPairs[k]}`)));
          console.log("");
        }

        // Interactive: prompt for missing/empty/invalid values
        const needsInput = [...missing, ...empty, ...invalid];
        if (needsInput.length > 0 && process.stdin.isTTY) {
          console.log(chalk.blue.bold("  Interactive Fix\n"));
          console.log(chalk.dim("  Enter values for issues below (press Enter to skip):\n"));

          const { createInterface } = await import("readline");
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          const ask = (q: string): Promise<string> => new Promise((r) => rl.question(q, r));

          for (const key of needsInput) {
            const current = currentPairs[key] || examplePairs[key] || "";
            const hint = current ? chalk.dim(` [${current}]`) : "";
            const reason = invalid.includes(key) ? chalk.yellow(` (${getInvalidReason(key, currentPairs[key] || "")})`) : "";
            const answer = await ask(`  ${chalk.white(key)}${hint}${reason}: `);
            if (answer.trim()) {
              currentPairs[key] = answer.trim();
            } else if (!currentPairs[key] && examplePairs[key]) {
              currentPairs[key] = examplePairs[key];
            }
          }
          rl.close();
          console.log("");
        } else if (issues === 0) {
          console.log(chalk.green("  ✓ All environment variables look good!"));
          if (extra.length > 0) {
            console.log(chalk.dim(`    (${extra.length} extra vars present, not in .env.example)`));
          }
        } else {
          printPlainError(createSetuprError({
            code: "ENV_SMART_FAILED",
            command: "env",
            subcommand: "smart",
            cwd,
            details: [`${issues} issue${issues > 1 ? "s" : ""} found. Run interactively in a TTY to fix, or manually edit .env.`],
            canContinue: false,
          }));
          return;
        }

        // Write reorganized .env
        let output = "";
        for (const line of example.split("\n")) {
          if (!line.trim() || line.startsWith("#")) {
            output += line + "\n";
            continue;
          }
          const rawKey = line.split("=")[0].trim();
          const key = normalizeEnvKey(rawKey);
          if (currentPairs[key]) {
            const prefix = rawKey.startsWith("export ") ? "export " : "";
            output += `${prefix}${key}=${currentPairs[key]}\n`;
          } else {
            output += line + "\n";
          }
        }
        for (const key of extra) {
          output += `${key}=${currentPairs[key]}\n`;
        }
        await writeFile(envPath, output);
        console.log(chalk.green("  ✓ Saved .env (reorganized, matched .env.example order)"));
      } catch (err) {
        printPlainError(createSetuprError({
          code: envReadErrorCode(err),
          command: "env",
          subcommand: "smart",
          cwd,
          details: ["Smart analysis needs .env.example so it can compare expected values to current values."],
        }));
      }
      break;
    }
    default:
      printPlainError(createSetuprError({
        code: "UNKNOWN_SUBCOMMAND",
        command: "env",
        subcommand: sub,
        cwd,
        details: ["Valid subcommands: init, check, sync, smart."],
      }));
  }
}

async function cmdInfo(cwd: string) {
  const scan = await scanProject(cwd);
  console.log(chalk.blue.bold("\n  Project Info\n"));
  console.log(`  Language:    ${chalk.white(scan.language || "unknown")}`);
  console.log(`  Framework:   ${chalk.white(scan.framework || "none")}`);
  console.log(`  PM:          ${chalk.white(scan.packageManager || "none")}`);
  console.log(`  Runtime:     ${chalk.white(scan.runtime ? `${scan.runtime.name}${scan.runtime.version ? ` ${scan.runtime.version}` : ""}` : "none")}`);
  console.log(`  Deps:        ${chalk.white(`${scan.dependencies.prod} prod + ${scan.dependencies.dev} dev`)}`);
  if (scan.services.length) console.log(`  Services:    ${chalk.white(scan.services.join(", "))}`);
  if (scan.monorepo) console.log(`  Monorepo:    ${chalk.white(`${scan.monorepo.type} (${scan.monorepo.packages.length} packages)`)}`);
  console.log(`  Configs:     ${chalk.dim(scan.configFiles.join(", "))}`);
  console.log("");
}

async function cmdList(cwd: string) {
  const scan = await scanProject(cwd);
  if (Object.keys(scan.scripts).length === 0) {
    console.log(chalk.dim("No scripts found."));
    return;
  }
  console.log(chalk.blue.bold("\n  Available Scripts\n"));
  for (const [name, cmd] of Object.entries(scan.scripts)) {
    console.log(`  ${chalk.green(name.padEnd(15))} ${chalk.dim(cmd)}`);
  }
  console.log("");
}

async function cmdRun(script: string | undefined, cwd: string) {
  if (!script) {
    printPlainError(createSetuprError({ code: "MISSING_SCRIPT", command: "run", cwd, details: ["Usage: setup run <script>"] }));
    return;
  }
  if (!/^[a-zA-Z0-9:._-]+$/.test(script)) {
    printPlainError(createSetuprError({ code: "COMMAND_FAILED", command: "run", cwd, details: [`Invalid script name: ${script}`] }));
    return;
  }
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";
  const cmd = `${pm} run ${script}`;
  await runPlainCommand(cmd, cwd, { stepType: "script", stepLabel: script });
}

async function cmdSwitch(version: string | undefined, cwd: string) {
  if (!version) {
    printPlainError(createSetuprError({ code: "MISSING_RUNTIME", command: "switch", cwd, details: ["Usage: setup switch <version>"] }));
    return;
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(version)) {
    printPlainError(createSetuprError({ code: "COMMAND_FAILED", command: "switch", cwd, details: [`Invalid version format: ${version}`] }));
    return;
  }
  console.log(chalk.blue(`Switching to version: ${version}`));
  const result = await runCommand(`nvm use ${version} 2>/dev/null || fnm use ${version} 2>/dev/null || echo "Use 'nvm install ${version}' first"`, cwd);
  console.log(result.stdout || result.stderr);
}

async function cmdAdd(pkg: string | undefined, cwd: string) {
  if (!pkg) {
    printPlainError(createSetuprError({ code: "UNKNOWN_SUBCOMMAND", command: "add", cwd, details: ["Usage: setup add <package>"] }));
    return;
  }
  if (!/^[@a-zA-Z0-9/_.-]+$/.test(pkg)) {
    printPlainError(createSetuprError({ code: "COMMAND_FAILED", command: "add", cwd, details: [`Invalid package name: ${pkg}`] }));
    return;
  }
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";
  const cmds: Record<string, string> = { npm: "npm install", yarn: "yarn add", pnpm: "pnpm add", bun: "bun add" };
  const cmd = `${cmds[pm] || `${pm} install`} ${pkg}`;
  await runPlainCommand(cmd, cwd, { stepType: "deps", stepLabel: `Add ${pkg}` });
}

async function cmdRemove(pkg: string | undefined, cwd: string) {
  if (!pkg) {
    printPlainError(createSetuprError({ code: "UNKNOWN_SUBCOMMAND", command: "remove", cwd, details: ["Usage: setup remove <package>"] }));
    return;
  }
  if (!/^[@a-zA-Z0-9/_.-]+$/.test(pkg)) {
    printPlainError(createSetuprError({ code: "COMMAND_FAILED", command: "remove", cwd, details: [`Invalid package name: ${pkg}`] }));
    return;
  }
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";
  const cmds: Record<string, string> = { npm: "npm uninstall", yarn: "yarn remove", pnpm: "pnpm remove", bun: "bun remove" };
  const cmd = `${cmds[pm] || `${pm} remove`} ${pkg}`;
  await runPlainCommand(cmd, cwd, { stepType: "deps", stepLabel: `Remove ${pkg}` });
}

async function cmdPort(port: string | undefined, cwd: string) {
  const isWin = process.platform === "win32";
  const checkPort = async (p: number | string) => {
    const cmd = isWin
      ? `netstat -ano | findstr :${p}`
      : `lsof -i :${p} -t 2>/dev/null`;
    return runCommand(cmd, cwd);
  };

  if (!port) {
    console.log(chalk.blue("Checking common ports..."));
    for (const p of [3000, 5173, 8080, 4200, 8000]) {
      const result = await checkPort(p);
      if (result.stdout.trim()) {
        console.log(chalk.yellow(`  Port ${p}: IN USE (PID: ${result.stdout.trim().split("\n")[0]})`));
      } else {
        console.log(chalk.green(`  Port ${p}: available`));
      }
    }
    return;
  }
  const result = await checkPort(port);
  if (result.stdout.trim()) {
    const pid = result.stdout.trim().split("\n")[0];
    console.log(chalk.yellow(`Port ${port} in use by PID: ${pid}`));
    console.log(chalk.dim(isWin ? `Kill with: taskkill /PID ${pid} /F` : `Kill with: kill ${pid}`));
  } else {
    console.log(chalk.green(`Port ${port} is available`));
  }
}

async function cmdDeps(cwd: string) {
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";
  console.log(chalk.blue(`Dependencies (${pm}):`));
  const result = await runCommand(`${pm} list --depth=0`, cwd);
  if (result.exitCode !== 0) {
    printPlainError(classifyCommandFailure({ command: `${pm} list --depth=0`, cwd, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }));
  } else {
    console.log(result.stdout || result.stderr);
  }
}

async function cmdConfig(sub: string | undefined, cwd: string, flags?: Flags) {
  const { loadConfig, saveConfig } = await import("../../state/config.js");
  const config = await loadConfig();

  if (!sub || sub === "show") {
    console.log(chalk.blue.bold("\n  Setupr Config\n"));
    console.log(`  AI enabled:     ${chalk.white(String(config.ai.enabled))}`);
    console.log(`  AI model:       ${chalk.white(config.ai.model || "auto-detect")}`);
    console.log(`  Theme:          ${chalk.white(config.preferences.theme)}`);
    console.log(`  Confirm install: ${chalk.white(String(config.preferences.confirmBeforeInstall))}`);
    console.log(`  Auto update:    ${chalk.white(String(config.preferences.autoUpdate))}`);
    console.log("");
    console.log(chalk.dim("  Use 'setup config set <key> <value>' to change"));
    return;
  }

  if (sub === "set") {
    const args: string[] = flags?.args || [];
    const key = args[0];
    const value = args.slice(1).join(" ");

    if (!key || !value) {
      printPlainError(createSetuprError({
        code: "UNKNOWN_SUBCOMMAND",
        command: "config",
        subcommand: "set",
        cwd,
        details: ["Usage: setup config set <key> <value>", "Keys: model, theme, confirm, autoupdate, ai"],
      }));
      return;
    }

    switch (key) {
      case "model":
        config.ai.model = value;
        break;
      case "theme":
        if (value === "dark" || value === "light") {
          config.preferences.theme = value;
        } else {
          printPlainError(createSetuprError({
            code: "PROJECT_CONFIG_INVALID",
            command: "config",
            subcommand: "set",
            cwd,
            details: [`Theme must be 'dark' or 'light'. Received: ${value}`],
          }));
          return;
        }
        break;
      case "confirm":
        config.preferences.confirmBeforeInstall = value === "true" || value === "1" || value === "yes";
        break;
      case "autoupdate":
        config.preferences.autoUpdate = value === "true" || value === "1" || value === "yes";
        break;
      case "ai":
        config.ai.enabled = value === "true" || value === "1" || value === "yes";
        break;
      default:
        printPlainError(createSetuprError({
          code: "PROJECT_CONFIG_INVALID",
          command: "config",
          subcommand: "set",
          cwd,
          details: [`Unknown key: ${key}`, "Valid keys: model, theme, confirm, autoupdate, ai"],
        }));
        return;
    }

    await saveConfig(config);
    console.log(chalk.green(`✓ Set ${key} = ${value}`));
    return;
  }

  if (sub === "reset") {
    await saveConfig({
      ai: { enabled: true, timeoutMs: 30000, maxRetries: 3, retryDelayMs: 1000, rateLimitPerMinute: 20 },
      preferences: { theme: "dark", confirmBeforeInstall: true, autoUpdate: false, telemetry: false, defaultBranch: "main", commitConvention: "conventional", ciPlatform: "auto" },
      plugins: [],
      remembered: {},
    });
    console.log(chalk.green("✓ Config reset to defaults"));
    return;
  }

  if (sub === "models") {
    const { MODELS, PROVIDERS, formatModelPrice, getAvailableModels, getDefaultModel, getProviderEnvValue } = await import("../../ai/models.js");
    const available = getAvailableModels();
    const active = getDefaultModel();
    console.log(chalk.blue.bold("\n  Available AI Models\n"));

    const providers = [...new Set(MODELS.map((m) => m.provider))];
    for (const provider of providers) {
      const providerConfig = PROVIDERS[provider];
      const hasKey = !!getProviderEnvValue(provider);
      const providerModels = MODELS.filter((m) => m.provider === provider);
      const keys = [providerConfig.envKey, ...(providerConfig.envAliases || [])].join(" or ");
      console.log(`  ${hasKey ? chalk.green("●") : chalk.red("○")} ${chalk.white(provider)} ${chalk.dim(`(${keys})`)}`);
      for (const model of providerModels) {
        const isAvailable = available.includes(model);
        const marker = model.id === active.id ? chalk.yellow("★ ") : "  ";
        console.log(`  ${marker}${isAvailable ? chalk.green(model.id) : chalk.dim(model.id)} — ${model.name} ${chalk.dim(formatModelPrice(model))}`);
      }
    }
    console.log(chalk.dim(`\n  ${available.length} models available (set API keys to unlock more)`));
    return;
  }

  printPlainError(createSetuprError({
    code: "UNKNOWN_SUBCOMMAND",
    command: "config",
    subcommand: sub,
    cwd,
    details: ["Valid subcommands: show, set, reset, models."],
  }));
}

async function cmdLock(cwd: string) {
  const { saveCheckpoint } = await import("../../state/checkpoint.js");
  const scan = await scanProject(cwd);
  await saveCheckpoint(cwd, { cwd, scan, steps: [], currentStepIndex: 0, completedSteps: [] });
  console.log(chalk.green("✓ Environment state locked to .setupr/checkpoint.json"));
}

async function cmdDiff(cwd: string) {
  const { loadCheckpoint } = await import("../../state/checkpoint.js");
  const cp = await loadCheckpoint(cwd);
  if (!cp) {
    printPlainError(createSetuprError({ code: "LOCK_STATE_MISSING", command: "diff", cwd }));
    return;
  }
  const scan = await scanProject(cwd);
  console.log(chalk.blue.bold("\n  Environment Diff\n"));
  console.log(chalk.dim(`  Locked at: ${new Date(cp.timestamp).toLocaleString()}`));
  let changes = 0;
  if (cp.scan.language !== scan.language) { console.log(chalk.yellow(`  Language: ${cp.scan.language} → ${scan.language}`)); changes++; }
  if (cp.scan.dependencies.prod !== scan.dependencies.prod) { console.log(chalk.yellow(`  Prod deps: ${cp.scan.dependencies.prod} → ${scan.dependencies.prod}`)); changes++; }
  if (cp.scan.dependencies.dev !== scan.dependencies.dev) { console.log(chalk.yellow(`  Dev deps: ${cp.scan.dependencies.dev} → ${scan.dependencies.dev}`)); changes++; }
  if (changes === 0) console.log(chalk.green("  No major changes detected"));
  console.log("");
}

async function cmdLogs(cwd: string) {
  const logFiles = ["npm-debug.log", "yarn-error.log", "pnpm-debug.log", ".setupr/logs/latest.log"];
  for (const file of logFiles) {
    try {
      const content = await readFile(join(cwd, file), "utf-8");
      console.log(chalk.blue(`\n--- ${file} ---\n`));
      console.log(content.slice(-2000));
      return;
    } catch {}
  }
  printPlainError(createSetuprError({
    code: "LOG_FILE_MISSING",
    command: "logs",
    cwd,
    details: [`Checked: ${logFiles.join(", ")}`],
  }));
}

async function cmdProcessLogs(cwd: string, target?: string) {
  const { readProcessLog } = await import("../../processes/manager.js");
  const result = await readProcessLog(cwd, target, 120);
  if (result.process && result.content.trim()) {
    console.log(chalk.blue.bold(`\n  Logs: ${result.process.name}\n`));
    console.log(result.content);
    return;
  }
  if (target) {
    printPlainError(createSetuprError({
      code: "LOG_FILE_MISSING",
      command: "logs",
      subcommand: target,
      cwd,
      details: [`No managed process log found for ${target}.`],
    }));
    return;
  }
  await cmdLogs(cwd);
}

async function cmdPs(cwd: string, flags: Flags) {
  const { listManagedProcesses } = await import("../../processes/manager.js");
  const processes = await listManagedProcesses(cwd);
  if (flags.json) {
    console.log(JSON.stringify(processes, null, 2));
    return;
  }
  console.log(chalk.blue.bold("\n  Setupr Processes\n"));
  if (processes.length === 0) {
    console.log(chalk.dim("  No Setupr-managed processes."));
    console.log(chalk.dim("  Start one with: setupr start --plain"));
    console.log("");
    return;
  }
  for (const proc of processes) {
    const color = proc.status === "running" ? chalk.green : proc.status === "crashed" ? chalk.red : chalk.dim;
    console.log(`  ${color(proc.status.padEnd(8))} ${chalk.white(proc.id.padEnd(14))} ${proc.pid ? chalk.dim(`pid ${proc.pid}`) : chalk.dim("no pid")}  ${chalk.dim(proc.command)}`);
  }
  console.log("");
}

async function cmdStop(cwd: string, target: string | undefined, flags: Flags) {
  const { stopManagedProcess } = await import("../../processes/manager.js");
  const stopped = await stopManagedProcess(cwd, target, { force: flags.force });
  if (stopped.length === 0) {
    console.log(chalk.dim(target ? `No managed process found for ${target}.` : "No running managed processes."));
    return;
  }
  for (const proc of stopped) {
    console.log(chalk.green(`✓ Stopped ${proc.id}${proc.pid ? ` (pid ${proc.pid})` : ""}`));
  }
}

async function cmdRestart(cwd: string, target: string | undefined, flags: Flags) {
  const { restartManagedProcess } = await import("../../processes/manager.js");
  const proc = await restartManagedProcess(cwd, target, { force: flags.force, autoRestart: Boolean(flags.watch) });
  console.log(chalk.green(`✓ Restarted ${proc.id}`));
  console.log(chalk.dim(`  PID: ${proc.pid || "unknown"}`));
  console.log(chalk.dim(`  Logs: ${proc.logFile}`));
}

async function cmdTest(cwd: string) {
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";
  if (scan.scripts.test) {
    await runPlainCommand(`${pm} run test`, cwd, { stepType: "script", stepLabel: "test" });
  } else {
    printPlainError(createSetuprError({
      code: "MISSING_SCRIPT",
      command: "test",
      cwd,
      details: ["No test script found in package.json."],
    }));
  }
}

async function cmdBuild(cwd: string) {
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";
  if (scan.scripts.build) {
    await runPlainCommand(`${pm} run build`, cwd, { stepType: "script", stepLabel: "build" });
  } else {
    printPlainError(createSetuprError({
      code: "MISSING_SCRIPT",
      command: "build",
      cwd,
      details: ["No build script found in package.json."],
    }));
  }
}

async function cmdDeploy(cwd: string) {
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";
  if (scan.scripts.deploy) {
    await runPlainCommand(`${pm} run deploy`, cwd, { stepType: "script", stepLabel: "deploy" });
  } else {
    printPlainError(createSetuprError({
      code: "MISSING_SCRIPT",
      command: "deploy",
      cwd,
      details: ["No deploy script found. Add a 'deploy' script to package.json."],
    }));
  }
}

async function cmdOpen(target: string | undefined, cwd: string) {
  const openCmd = process.platform === "darwin" ? "open" : "xdg-open";
  switch (target) {
    case "repo": {
      const result = await runCommand("git remote get-url origin 2>/dev/null", cwd);
      const url = result.stdout.trim().replace(/\.git$/, "").replace("git@github.com:", "https://github.com/");
      if (url) {
        await runCommand(`${openCmd} ${url}`, cwd);
        console.log(chalk.green(`Opened: ${url}`));
      } else {
        printPlainError(createSetuprError({
          code: "OPEN_TARGET_MISSING",
          command: "open",
          subcommand: "repo",
          cwd,
          details: ["No git remote origin was found."],
        }));
      }
      break;
    }
    case "ide":
      await runCommand("code .", cwd);
      console.log(chalk.green("Opened in VS Code"));
      break;
    default:
      await runCommand(`${openCmd} http://localhost:3000`, cwd);
      console.log(chalk.green("Opened http://localhost:3000"));
  }
}

async function runPlainCommand(command: string, cwd: string, context: { stepType?: string; stepLabel?: string } = {}) {
  console.log(chalk.blue(`Running: ${command}`));
  const result = await runCommand(command, cwd, (line) => console.log(line));
  if (result.exitCode !== 0) {
    printPlainError(classifyCommandFailure({
      command,
      cwd,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      ...context,
    }));
  }
}

function envReadErrorCode(error: unknown): "ENV_TEMPLATE_MISSING" | "ENV_CHECK_FAILED" {
  const code = (error as { code?: string } | undefined)?.code;
  return code === "ENOENT" ? "ENV_TEMPLATE_MISSING" : "ENV_CHECK_FAILED";
}

function isLikelyInvalid(key: string, value: string): boolean {
  const k = key.toUpperCase();
  const v = value.trim();

  if (v === "your_key_here" || v === "changeme" || v === "TODO" || v === "xxx" || v === "REPLACE_ME") return true;

  if ((k.includes("URL") || k.includes("ENDPOINT") || k.includes("HOST")) && !v.startsWith("http") && !v.startsWith("localhost") && !v.includes(":")) return true;
  if ((k.includes("PORT")) && (isNaN(Number(v)) || Number(v) < 1 || Number(v) > 65535)) return true;
  if ((k.includes("KEY") || k.includes("SECRET") || k.includes("TOKEN")) && v.length < 8) return true;
  if ((k.includes("EMAIL")) && !v.includes("@")) return true;

  return false;
}

function getInvalidReason(key: string, value: string): string {
  const k = key.toUpperCase();
  const v = value.trim();

  if (v === "your_key_here" || v === "changeme" || v === "TODO" || v === "xxx" || v === "REPLACE_ME") return "placeholder value";
  if ((k.includes("URL") || k.includes("ENDPOINT") || k.includes("HOST")) && !v.startsWith("http") && !v.startsWith("localhost") && !v.includes(":")) return "doesn't look like a URL";
  if ((k.includes("PORT")) && (isNaN(Number(v)) || Number(v) < 1 || Number(v) > 65535)) return "invalid port number";
  if ((k.includes("KEY") || k.includes("SECRET") || k.includes("TOKEN")) && v.length < 8) return "too short for a key/secret";
  if ((k.includes("EMAIL")) && !v.includes("@")) return "missing @ symbol";

  return "may be invalid";
}
