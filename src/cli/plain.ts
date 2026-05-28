import chalk from "chalk";
import ora from "ora";
import { scanProject } from "../scanner/index.js";
import { planSteps } from "../ai/planner.js";
import { executeStep, runCommand } from "../executor/index.js";
import { createAppStore } from "../state/store.js";
import { hasProjectSignals } from "../tui/projectSignals.js";
import { createPSetupError, printPlainError, classifyCommandFailure } from "../errors/index.js";
import { deleteCheckpoint, formatCheckpointAge, loadCheckpoint, saveCheckpoint } from "../state/checkpoint.js";

interface PlainOptions {
  force?: boolean;
}

export async function runPlainMode(command: string, cwd: string, sub?: string, _options: PlainOptions = {}): Promise<void> {
  switch (command) {
    case "setup":
      await plainSetup(cwd);
      break;
    case "doctor":
      await plainDoctor(cwd);
      break;
    case "start":
      await plainStart(cwd);
      break;
    case "update":
      await plainUpdate(cwd);
      break;
    case "clean":
      await plainClean(cwd, sub);
      break;
    default:
      printPlainError(createPSetupError({
        code: "UNKNOWN_COMMAND",
        command,
        cwd,
        details: [`Received: ${command}`],
      }));
      return;
  }
}

async function plainSetup(cwd: string): Promise<void> {
  const checkpoint = await loadCheckpoint(cwd);
  let scan;
  let steps;
  let startIndex = 0;

  if (checkpoint) {
    const age = formatCheckpointAge(checkpoint.timestamp);
    const done = checkpoint.completedSteps.length;
    const total = checkpoint.steps.length;
    console.log(chalk.cyan(`\n  ↻  Resuming interrupted setup from ${age} (${done}/${total} steps done)\n`));
    scan = checkpoint.scan;
    steps = checkpoint.steps;
    startIndex = checkpoint.currentStepIndex;
  } else {
    const spinner = ora("Scanning project...").start();
    scan = await scanProject(cwd);
    spinner.succeed(`Detected: ${scan.language || "unknown"}${scan.framework ? ` / ${scan.framework}` : ""}`);
  }

  if (!hasProjectSignals(scan)) {
    printPlainError(createPSetupError({
      code: "NO_PROJECT_DETECTED",
      command: "setup",
      cwd,
      canContinue: false,
    }));
    return;
  }

  console.log(chalk.dim(`  PM: ${scan.packageManager || "none"} | Deps: ${scan.dependencies.prod} prod + ${scan.dependencies.dev} dev`));
  if (scan.services.length) console.log(chalk.dim(`  Services: ${scan.services.join(", ")}`));

  if (!steps) {
    const planSpinner = ora("Planning setup steps...").start();
    steps = await planSteps(scan);
    planSpinner.succeed(`${steps.length} steps planned`);
  }

  const store = createAppStore(cwd);
  store.getState().setScan(scan);
  store.getState().setSteps(steps);

  let failures = 0;
  const completedIds: string[] = checkpoint?.completedSteps || [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (i < startIndex) {
      console.log(chalk.dim(`  ○ ${step.label} (already done)`));
      continue;
    }

    const stepSpinner = ora(step.label).start();
    const result = await executeStep(step, cwd, store);
    if (result.success) {
      stepSpinner.succeed(step.label);
      completedIds.push(step.id);
    } else {
      stepSpinner.fail(`${step.label} — ${result.psetupError?.title || result.error || "failed"}`);
      if (result.psetupError) printPlainError(result.psetupError);
      failures++;
      break;
    }

    try {
      await saveCheckpoint(cwd, {
        cwd,
        scan,
        steps: store.getState().steps,
        currentStepIndex: i + 1,
        completedSteps: completedIds,
      });
    } catch {}
  }

  console.log("");
  if (failures === 0) {
    await deleteCheckpoint(cwd);
    console.log(chalk.green.bold("✓ Setup complete!"));
  } else {
    console.log(chalk.yellow.bold(`⚠ Setup finished with ${failures} failed step${failures > 1 ? "s" : ""}`));
    console.log(chalk.dim("  Run 'setup' again to resume from where it left off."));
    process.exitCode = 1;
  }
}

async function plainDoctor(cwd: string): Promise<void> {
  const spinner = ora("Running diagnostics...").start();
  const scan = await scanProject(cwd);
  spinner.stop();

  console.log(chalk.blue.bold("\n  P-Setup Doctor\n"));

  // Runtime
  if (scan.runtime) {
    const result = await runCommand(`${scan.runtime.name} --version`, cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green(`  ✓ ${scan.runtime.name}: ${result.stdout.trim()}`));
    } else {
      printPlainError(classifyCommandFailure({
        command: `${scan.runtime.name} --version`,
        cwd,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        stepLabel: `${scan.runtime.name} runtime`,
      }));
    }
  }

  // PM
  if (scan.packageManager) {
    const result = await runCommand(`${scan.packageManager} --version`, cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green(`  ✓ ${scan.packageManager}: ${result.stdout.trim()}`));
    } else {
      printPlainError(classifyCommandFailure({
        command: `${scan.packageManager} --version`,
        cwd,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        stepLabel: `${scan.packageManager} package manager`,
      }));
    }
  }

  console.log(chalk.dim(`\n  Language: ${scan.language || "unknown"}`));
  console.log(chalk.dim(`  Framework: ${scan.framework || "none"}`));
  if (scan.services.length) console.log(chalk.dim(`  Services: ${scan.services.join(", ")}`));
}

async function plainStart(cwd: string): Promise<void> {
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";
  let cmd: string | null = null;

  if (scan.scripts.dev) cmd = `${pm} run dev`;
  else if (scan.scripts.start) cmd = `${pm} run start`;

  if (!cmd) {
    printPlainError(createPSetupError({
      code: "MISSING_SCRIPT",
      command: "start",
      cwd,
      details: ["No dev or start script was found in package.json."],
      nextSteps: ["Add a dev or start script, or run a specific script with setup run <script>."],
    }));
    return;
  }

  console.log(chalk.blue(`Running: ${cmd}`));
  const result = await runCommand(cmd, cwd, (line) => console.log(line));
  if (result.exitCode !== 0) {
    printPlainError(classifyCommandFailure({
      command: cmd,
      cwd,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      stepLabel: "Start project",
      stepType: "script",
    }));
  }
}

async function plainUpdate(cwd: string): Promise<void> {
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";
  console.log(chalk.blue(`Checking outdated packages (${pm})...`));

  const result = await runCommand(`${pm} outdated`, cwd);
  if (result.exitCode > 1 || (result.exitCode !== 0 && result.stderr.trim())) {
    printPlainError(classifyCommandFailure({
      command: `${pm} outdated`,
      cwd,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      stepLabel: "Check outdated packages",
    }));
  } else if (result.stdout.trim()) {
    console.log(result.stdout);
  } else {
    console.log(chalk.green("All packages are up to date!"));
  }
}

async function plainClean(cwd: string, mode?: string): Promise<void> {
  const { rm, stat } = await import("fs/promises");
  const { join } = await import("path");

  const targets = mode === "all"
    ? ["node_modules", "dist", "build", ".next", "__pycache__", ".cache", ".env", ".env.local", ".DS_Store"]
    : mode === "share"
      ? [".env", ".env.local", ".DS_Store"]
      : ["node_modules", "__pycache__", "venv", ".venv"];

  console.log(chalk.blue("Cleaning..."));
  for (const target of targets) {
    try {
      await stat(join(cwd, target));
      await rm(join(cwd, target), { recursive: true, force: true });
      console.log(chalk.green(`  ✓ Removed ${target}`));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/ENOENT/.test(message)) {
        printPlainError(createPSetupError({
          code: "CLEAN_TARGET_FAILED",
          command: "clean",
          subcommand: mode || "deps",
          cwd,
          details: [`Target: ${target}`, message],
          canContinue: true,
        }));
      }
    }
  }
  console.log(chalk.green.bold("\n✓ Clean complete!"));
}
