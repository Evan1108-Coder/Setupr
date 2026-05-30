import chalk from "chalk";
import { runCommand } from "../executor/index.js";
import {
  classifyCommandFailure,
  createSetuprError,
  printPlainError,
  type SetuprError,
} from "../errors/index.js";
import { createProjectEngine, type ProjectEngine } from "./engine.js";

export interface ProjectCommandOperationOptions {
  cwd: string;
  ownerCommand: string;
  ownerSubcommand?: string;
  shellCommand: string;
  stepType?: string;
  stepLabel?: string;
  force?: boolean;
  dryRun?: boolean;
  quiet?: boolean;
  engine?: ProjectEngine;
  onLine?: (line: string) => void;
}

export interface ProjectCommandOperationResult {
  success: boolean;
  skipped?: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: SetuprError;
}

export async function runProjectCommandOperation(options: ProjectCommandOperationOptions): Promise<ProjectCommandOperationResult> {
  const engine = options.engine || createProjectEngine({
    cwd: options.cwd,
    command: options.ownerCommand,
    subcommand: options.ownerSubcommand,
    flags: { force: options.force, dryRun: options.dryRun },
    mode: "plain",
  });

  const safety = engine.evaluateShellCommand(options.shellCommand);
  await engine.log("operation.safety", `${options.ownerCommand}: ${safety.risk} risk`, {
    command: options.shellCommand,
    risk: safety.risk,
    decision: safety.decision,
    reasons: safety.reasons,
  });

  if (safety.decision === "block") {
    const error = createSetuprError({
      code: "COMMAND_ABORTED",
      command: options.ownerCommand,
      subcommand: options.ownerSubcommand,
      cwd: options.cwd,
      details: safety.reasons,
      canContinue: false,
      forceBehavior: "Force mode cannot bypass blocked safety policy actions.",
    });
    if (!options.quiet) printPlainError(error);
    await engine.recordCommand({
      type: "command.error",
      message: `${options.ownerCommand} blocked by safety policy`,
      error: error.title,
      exitCode: error.exitCode,
      extra: { shellCommand: options.shellCommand, safety },
    });
    return { success: false, stdout: "", stderr: "", exitCode: error.exitCode || 1, error };
  }

  if (options.dryRun) {
    const message = `Dry run: ${options.shellCommand}`;
    if (!options.quiet) console.log(chalk.dim(message));
    await engine.log("operation.dry-run", message, { command: options.shellCommand });
    return { success: true, skipped: true, stdout: message, stderr: "", exitCode: 0 };
  }

  if (!options.quiet) console.log(chalk.blue(`Running: ${options.shellCommand}`));
  const result = await runCommand(options.shellCommand, options.cwd, options.onLine || ((line) => {
    if (!options.quiet) console.log(line);
  }));

  if (result.exitCode !== 0) {
    const error = classifyCommandFailure({
      command: options.shellCommand,
      cwd: options.cwd,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      stepType: options.stepType,
      stepLabel: options.stepLabel,
    });
    if (!options.quiet) printPlainError(error);
    await engine.recordCommand({
      type: "command.error",
      message: `${options.ownerCommand}${options.ownerSubcommand ? ` ${options.ownerSubcommand}` : ""} command failed`,
      error: error.title,
      exitCode: result.exitCode,
      extra: {
        shellCommand: options.shellCommand,
        stepType: options.stepType || null,
        stepLabel: options.stepLabel || null,
      },
    });
    return { success: false, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, error };
  }

  await engine.log("operation.success", `${options.ownerCommand}: command completed`, {
    command: options.shellCommand,
    stepType: options.stepType || null,
    stepLabel: options.stepLabel || null,
  });
  return { success: true, stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
}
