import chalk from "chalk";
import { scanProject } from "../../scanner/index.js";
import { runCommand } from "../../executor/index.js";
import { readFile, writeFile, access, readdir, stat } from "fs/promises";
import { join } from "path";

interface Flags {
  force?: boolean;
  [key: string]: any;
}

export async function runNonTUICommand(
  command: string,
  sub: string | undefined,
  cwd: string,
  flags: Flags
): Promise<void> {
  switch (command) {
    case "env":
      await cmdEnv(sub, cwd);
      break;
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
      await cmdConfig(sub, cwd);
      break;
    case "lock":
      await cmdLock(cwd);
      break;
    case "diff":
      await cmdDiff(cwd);
      break;
    case "logs":
      await cmdLogs(cwd);
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
    default:
      console.log(chalk.red(`Unknown command: ${command}`));
      console.log(chalk.dim("Run 'setup --help' for available commands."));
      process.exit(1);
  }
}

async function cmdEnv(sub: string | undefined, cwd: string) {
  const envPath = join(cwd, ".env");
  const examplePath = join(cwd, ".env.example");

  switch (sub) {
    case "init": {
      try {
        await access(examplePath);
        const content = await readFile(examplePath, "utf-8");
        await writeFile(envPath, content);
        console.log(chalk.green("✓ Created .env from .env.example"));
      } catch {
        await writeFile(envPath, "# Environment variables\n");
        console.log(chalk.green("✓ Created empty .env file"));
      }
      break;
    }
    case "check": {
      try {
        const example = await readFile(examplePath, "utf-8");
        const env = await readFile(envPath, "utf-8").catch(() => "");
        const required = parseEnvKeys(example);
        const defined = parseEnvKeys(env);
        const missing = required.filter((k) => !defined.includes(k));
        if (missing.length === 0) {
          console.log(chalk.green("✓ All environment variables are set"));
        } else {
          console.log(chalk.yellow(`⚠ Missing ${missing.length} variables:`));
          missing.forEach((k) => console.log(chalk.dim(`  • ${k}`)));
        }
      } catch {
        console.log(chalk.dim("No .env.example found"));
      }
      break;
    }
    case "sync": {
      try {
        const example = await readFile(examplePath, "utf-8");
        const env = await readFile(envPath, "utf-8").catch(() => "");
        const required = parseEnvKeys(example);
        const currentPairs = parseEnvPairs(env);
        let newContent = "";
        for (const line of example.split("\n")) {
          const key = line.split("=")[0].trim();
          if (key && !key.startsWith("#") && currentPairs[key]) {
            newContent += `${key}=${currentPairs[key]}\n`;
          } else {
            newContent += line + "\n";
          }
        }
        await writeFile(envPath, newContent);
        console.log(chalk.green("✓ Synced .env with .env.example structure"));
      } catch (e) {
        console.log(chalk.red("Failed to sync: " + (e as Error).message));
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

        if (issues === 0) {
          console.log(chalk.green("  ✓ All environment variables look good!"));
          if (extra.length > 0) {
            console.log(chalk.dim(`    (${extra.length} extra vars present, not in .env.example)`));
          }
        } else {
          console.log(chalk.yellow(`  Summary: ${issues} issue${issues > 1 ? "s" : ""} found`));
          console.log(chalk.dim("  Run 'setup env sync' to auto-fill missing vars from .env.example defaults"));
          console.log(chalk.dim("  Run 'setup env check' to see required vs defined"));
        }

        let output = "";
        for (const line of example.split("\n")) {
          if (!line.trim() || line.startsWith("#")) {
            output += line + "\n";
            continue;
          }
          const key = line.split("=")[0].trim();
          if (currentPairs[key]) {
            output += `${key}=${currentPairs[key]}\n`;
          } else {
            output += line + "\n";
          }
        }
        for (const key of extra) {
          output += `${key}=${currentPairs[key]}\n`;
        }
        await writeFile(envPath, output);
        console.log(chalk.green("\n  ✓ Reorganized .env (preserved all values, matched .env.example order)"));
      } catch {
        console.log(chalk.red("No .env.example found for smart analysis"));
        console.log(chalk.dim("  Create a .env.example with required variable names to enable smart mode"));
      }
      break;
    }
    default:
      console.log(chalk.blue("Usage: setup env [init|check|sync|smart]"));
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
    console.log(chalk.red("Usage: setup run <script>"));
    return;
  }
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";
  const cmd = `${pm} run ${script}`;
  console.log(chalk.blue(`Running: ${cmd}`));
  const { spawn } = await import("child_process");
  const proc = spawn(cmd, { shell: true, cwd, stdio: "inherit" });
  proc.on("exit", (code) => process.exit(code || 0));
}

async function cmdSwitch(version: string | undefined, cwd: string) {
  if (!version) {
    console.log(chalk.red("Usage: setup switch <version>"));
    return;
  }
  console.log(chalk.blue(`Switching to version: ${version}`));
  const result = await runCommand(`nvm use ${version} 2>/dev/null || fnm use ${version} 2>/dev/null || echo "Use 'nvm install ${version}' first"`, cwd);
  console.log(result.stdout || result.stderr);
}

async function cmdAdd(pkg: string | undefined, cwd: string) {
  if (!pkg) {
    console.log(chalk.red("Usage: setup add <package>"));
    return;
  }
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";
  const cmds: Record<string, string> = { npm: "npm install", yarn: "yarn add", pnpm: "pnpm add", bun: "bun add" };
  const cmd = `${cmds[pm] || `${pm} install`} ${pkg}`;
  console.log(chalk.blue(`Running: ${cmd}`));
  const { spawn } = await import("child_process");
  const proc = spawn(cmd, { shell: true, cwd, stdio: "inherit" });
  proc.on("exit", (code) => process.exit(code || 0));
}

async function cmdRemove(pkg: string | undefined, cwd: string) {
  if (!pkg) {
    console.log(chalk.red("Usage: setup remove <package>"));
    return;
  }
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";
  const cmds: Record<string, string> = { npm: "npm uninstall", yarn: "yarn remove", pnpm: "pnpm remove", bun: "bun remove" };
  const cmd = `${cmds[pm] || `${pm} remove`} ${pkg}`;
  console.log(chalk.blue(`Running: ${cmd}`));
  const { spawn } = await import("child_process");
  const proc = spawn(cmd, { shell: true, cwd, stdio: "inherit" });
  proc.on("exit", (code) => process.exit(code || 0));
}

async function cmdPort(port: string | undefined, cwd: string) {
  if (!port) {
    console.log(chalk.blue("Checking common ports..."));
    for (const p of [3000, 5173, 8080, 4200, 8000]) {
      const result = await runCommand(`lsof -i :${p} -t 2>/dev/null`, cwd);
      if (result.stdout.trim()) {
        console.log(chalk.yellow(`  Port ${p}: IN USE (PID: ${result.stdout.trim()})`));
      } else {
        console.log(chalk.green(`  Port ${p}: available`));
      }
    }
    return;
  }
  const result = await runCommand(`lsof -i :${port} -t 2>/dev/null`, cwd);
  if (result.stdout.trim()) {
    console.log(chalk.yellow(`Port ${port} in use by PID: ${result.stdout.trim()}`));
    console.log(chalk.dim(`Kill with: kill ${result.stdout.trim()}`));
  } else {
    console.log(chalk.green(`Port ${port} is available`));
  }
}

async function cmdDeps(cwd: string) {
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";
  console.log(chalk.blue(`Dependencies (${pm}):`));
  const result = await runCommand(`${pm} list --depth=0`, cwd);
  console.log(result.stdout || result.stderr);
}

async function cmdConfig(sub: string | undefined, cwd: string) {
  const { loadConfig, saveConfig } = await import("../../state/config.js");
  const config = await loadConfig();
  if (!sub || sub === "show") {
    console.log(chalk.blue.bold("\n  P-Setup Config\n"));
    console.log(JSON.stringify(config, null, 2));
  } else {
    console.log(chalk.dim("Usage: setup config [show]"));
  }
}

async function cmdLock(cwd: string) {
  const { saveCheckpoint } = await import("../../state/checkpoint.js");
  const scan = await scanProject(cwd);
  await saveCheckpoint(cwd, { cwd, scan, steps: [], currentStepIndex: 0, completedSteps: [] });
  console.log(chalk.green("✓ Environment state locked to .p-setup/checkpoint.json"));
}

async function cmdDiff(cwd: string) {
  const { loadCheckpoint } = await import("../../state/checkpoint.js");
  const cp = await loadCheckpoint(cwd);
  if (!cp) {
    console.log(chalk.dim("No locked state found. Run 'setup lock' first."));
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
  const logFiles = ["npm-debug.log", "yarn-error.log", "pnpm-debug.log", ".p-setup/logs/latest.log"];
  for (const file of logFiles) {
    try {
      const content = await readFile(join(cwd, file), "utf-8");
      console.log(chalk.blue(`\n--- ${file} ---\n`));
      console.log(content.slice(-2000));
      return;
    } catch {}
  }
  console.log(chalk.dim("No log files found."));
}

async function cmdTest(cwd: string) {
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";
  if (scan.scripts.test) {
    console.log(chalk.blue(`Running: ${pm} run test`));
    const { spawn } = await import("child_process");
    const proc = spawn(`${pm} run test`, { shell: true, cwd, stdio: "inherit" });
    proc.on("exit", (code) => process.exit(code || 0));
  } else {
    console.log(chalk.dim("No test script found in package.json."));
  }
}

async function cmdBuild(cwd: string) {
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";
  if (scan.scripts.build) {
    console.log(chalk.blue(`Running: ${pm} run build`));
    const { spawn } = await import("child_process");
    const proc = spawn(`${pm} run build`, { shell: true, cwd, stdio: "inherit" });
    proc.on("exit", (code) => process.exit(code || 0));
  } else {
    console.log(chalk.dim("No build script found."));
  }
}

async function cmdDeploy(cwd: string) {
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";
  if (scan.scripts.deploy) {
    console.log(chalk.blue(`Running: ${pm} run deploy`));
    const { spawn } = await import("child_process");
    const proc = spawn(`${pm} run deploy`, { shell: true, cwd, stdio: "inherit" });
    proc.on("exit", (code) => process.exit(code || 0));
  } else {
    console.log(chalk.dim("No deploy script found. Add a 'deploy' script to package.json."));
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
        console.log(chalk.dim("No git remote found."));
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

function parseEnvKeys(content: string): string[] {
  return content
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => l.split("=")[0].trim())
    .filter(Boolean);
}

function parseEnvPairs(content: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const line of content.split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx > 0) {
      pairs[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim();
    }
  }
  return pairs;
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
