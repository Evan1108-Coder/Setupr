import React from "react";
import { render } from "ink";
import meow from "meow";
import { App } from "./components/App.js";
import { scanProject } from "./scanner/projectScanner.js";

const cli = meow(
  `
  Usage
    $ setup [command]

  Commands
    setup     Full project setup (default)
    start     Detect and run project
    doctor    Diagnose environment health
    update    Update dependencies
    clean     Remove artifacts

  Options
    --no-tui  Plain terminal output
    --force   Skip all prompts
    --plain   Alias for --no-tui

  Examples
    $ setup
    $ setup doctor
    $ setup start
`,
  {
    importMeta: import.meta,
    flags: {
      noTui: { type: "boolean", default: false },
      plain: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
    },
  }
);

const command = (cli.input[0] || "setup") as string;
const isPlainMode = cli.flags.noTui || cli.flags.plain;

async function showPreWarning(cmd: string, cwd: string): Promise<void> {
  const scan = await scanProject(cwd);

  const warnings: Record<string, string> = {
    setup: scan.language
      ? `Will scan and configure ${scan.language} project. ${scan.packageManager ? `Dependencies via ${scan.packageManager}.` : ""} ${scan.dependencies > 0 ? `${scan.dependencies} deps found.` : ""}`
      : "Will scan directory to detect project type and configure environment.",
    clean: "This will remove build artifacts and potentially node_modules.",
    update: "Will check for dependency updates. May modify lock files.",
    doctor: "Will diagnose your environment. Read-only, no changes.",
    start: "Will detect and launch your project's dev server.",
  };

  const msg = warnings[cmd] || `Running command: ${cmd}`;
  process.stdout.write(`\n  ⚠  ${msg}\n`);

  if (!cli.flags.force) {
    process.stdout.write("  Press Enter to continue (Ctrl+C to cancel)...\n\n");
    await new Promise<void>((resolve) => {
      if (!process.stdin.isTTY) {
        resolve();
        return;
      }
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.once("data", (data) => {
        const key = data[0];
        if (key === 3) process.exit(0); // Ctrl+C
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        resolve();
      });
    });
  }
}

async function runPlainMode(cmd: string, cwd: string) {
  const scan = await scanProject(cwd);
  process.stdout.write(`\n  P-Setup v0.1.0 — Plain Mode\n`);
  process.stdout.write(`  ─────────────────────────────\n`);
  process.stdout.write(`  Command: ${cmd}\n`);
  process.stdout.write(`  Directory: ${cwd}\n\n`);

  if (scan.language) {
    process.stdout.write(`  Detected: ${scan.language}`);
    if (scan.framework) process.stdout.write(` (${scan.framework})`);
    process.stdout.write(`\n`);
    process.stdout.write(`  Package Manager: ${scan.packageManager || "unknown"}\n`);
    process.stdout.write(`  Dependencies: ${scan.dependencies}\n`);
    process.stdout.write(`  Env: ${scan.hasEnvFile ? ".env present" : "no .env"}\n`);
  } else {
    process.stdout.write(`  No recognized project structure.\n`);
  }
  process.stdout.write(`\n`);
}

async function main() {
  if (isPlainMode) {
    await runPlainMode(command, process.cwd());
    return;
  }

  await showPreWarning(command, process.cwd());

  // Transition animation
  process.stdout.write("\x1B[2J\x1B[H"); // clear screen
  process.stdout.write("\n\n\n      Launching setup... ⠋\n");
  await new Promise((r) => setTimeout(r, 400));
  process.stdout.write("\x1B[2J\x1B[H"); // clear again for TUI

  render(<App command={command} flags={cli.flags} />);
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
