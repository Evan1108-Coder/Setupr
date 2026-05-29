import { scanProject } from "../scanner/index.js";
import { createPreExecutionWarning } from "../ai/setupFlow.js";
import { describeDefaultModelSelection } from "../ai/models.js";
import { createSetuprError, printPlainError } from "../errors/index.js";
import { formatCheckpointAge, loadCheckpoint } from "../state/checkpoint.js";
import chalk from "chalk";

interface PreWarningOptions {
  requireConfirmation?: boolean;
}

export async function showPreWarning(
  command: string,
  cwd: string,
  force: boolean,
  subCommand?: string,
  options: PreWarningOptions = {}
): Promise<boolean> {
  setNeutralTitle(`Setupr ${command}`);
  if (command === "dashboard" || command === "status") {
    return true;
  }
  const scan = await scanProject(cwd);

  console.log("");
  if (command === "setup" && !force) {
    const checkpoint = await loadCheckpoint(cwd);
    if (checkpoint) {
      const age = formatCheckpointAge(checkpoint.timestamp);
      const done = checkpoint.completedSteps.length;
      const total = checkpoint.steps.length;
      console.log(chalk.cyan(`  ↻  Found interrupted setup from ${age} (${done}/${total} steps done). Will resume automatically.`));
      console.log(chalk.dim("     Use --force to start fresh instead."));
      console.log("");
    }
  }
  console.log(chalk.yellow(`  ⚠  Setupr ${command}${subCommand ? ` ${subCommand}` : ""}`));
  for (const line of createPreExecutionWarning(scan, command, force)) {
    console.log(chalk.dim("  • ") + line);
  }
  if (command === "setup") {
    console.log(chalk.dim("  • ") + `AI director model: ${describeDefaultModelSelection()}.`);
  }
  if (command === "clean") {
    const mode = subCommand || "deps";
    const modeMessage = mode === "all"
      ? "Clean mode all can delete dependency folders, build outputs, caches, and local share-sensitive files."
      : mode === "share"
        ? "Clean mode share removes local sensitive files intended to stay off shared machines."
        : "Clean mode deps removes dependency/install artifacts such as node_modules where detected.";
    console.log(chalk.dim("  • ") + chalk.yellow(modeMessage));
  }
  console.log("");

  if (!force) {
    console.log(chalk.dim("  Press Enter to continue, Ctrl+C to cancel..."));
    const confirmed = await waitForEnter();
    if (!confirmed && options.requireConfirmation) {
      printPlainError(createSetuprError({
        code: "NON_INTERACTIVE_CONFIRMATION_REQUIRED",
        command,
        subcommand: subCommand,
        cwd,
        forceBehavior: "With --force, Setupr skips ordinary confirmations but still stops before serious damage.",
      }));
      return false;
    }
  }

  return true;
}

function setNeutralTitle(title: string): void {
  if (!process.stdout.isTTY) return;
  const escape = String.fromCharCode(27);
  const bell = String.fromCharCode(7);
  const clean = title.split(escape).join("").split(bell).join("").slice(0, 80);
  process.stdout.write(`${escape}]0;${clean}${bell}`);
}

function waitForEnter(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
      resolve(false);
      return;
    }
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", (data) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      const key = data.toString();
      if (key === "\x03") {
        console.log("");
        printPlainError(createSetuprError({
          code: "COMMAND_ABORTED",
          details: ["Cancelled before the TUI launched."],
          exitCode: 130,
        }));
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}
