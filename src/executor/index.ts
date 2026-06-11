import { spawn, type ChildProcess } from "child_process";
import type { SetupStep } from "../ai/planner.js";
import type { AppStore } from "../state/store.js";
import { createSnapshot } from "./undo.js";
import { initEnvFile } from "../env/index.js";
import { classifyCommandFailure, createSetuprError, errorSummary, type SetuprError } from "../errors/index.js";
import { saveCheckpoint } from "../state/checkpoint.js";
import { diagnoseStepFailure, formatPlanChange } from "../agent/runtime.js";
import { evaluateStepSafety } from "../agent/safety.js";
import { saveAgentWorkflowCheckpoint } from "../agent/workflowCheckpoint.js";

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  psetupError?: SetuprError;
  duration: number;
}

// Per-step wall-clock limits so a hung command (stuck install, prompt waiting on stdin,
// unreachable registry) can never block the setup run forever. Override with the
// SETUPR_STEP_TIMEOUT_MS env var (applies to every command step).
const DEFAULT_STEP_TIMEOUT_MS: Record<SetupStep["type"], number> = {
  runtime: 600_000, // installing/switching runtimes can be slow
  deps: 600_000, // package installs on large projects
  script: 600_000, // build/postinstall scripts
  config: 120_000,
  env: 120_000,
  verify: 120_000,
};

export function stepTimeoutMs(step: SetupStep): number {
  const override = Number(process.env.SETUPR_STEP_TIMEOUT_MS);
  if (Number.isFinite(override) && override > 0) return override;
  return DEFAULT_STEP_TIMEOUT_MS[step.type] ?? 300_000;
}

export async function executeStep(
  step: SetupStep,
  cwd: string,
  store: AppStore
): Promise<ExecutionResult> {
  const start = Date.now();

  if (step.status === "skipped") {
    store.getState().addLog({ content: `○ ${step.label} — skipped`, type: "info", stepIndex: store.getState().currentStepIndex });
    return { success: true, output: "Skipped", duration: 0 };
  }

  store.getState().updateStep(step.id, { status: "running" });
  store.getState().addLog({ content: step.label, type: "info", stepIndex: store.getState().currentStepIndex });

  if (step.type === "deps" || step.type === "env" || step.type === "config") {
    await createSnapshot(cwd, step.id);
  }

  if (!step.command) {
    return handleSpecialStep(step, cwd, store);
  }

  const safety = evaluateStepSafety(step);
  if (safety.decision === "block") {
    const psetupError = createSetuprError({
      code: "COMMAND_ABORTED",
      command: step.command,
      cwd,
      details: safety.reasons,
      canContinue: false,
      forceBehavior: "Force mode cannot bypass blocked safety policy actions.",
    });
    store.getState().updateStep(step.id, { status: "failed", error: psetupError.title });
    store.getState().addLog({ content: `✗ ${step.label} — blocked by safety policy`, type: "error" });
    store.getState().addMessage({ role: "system", content: errorSummary(psetupError) });
    return { success: false, output: "", error: psetupError.explanation, psetupError, duration: Date.now() - start };
  }
  if (safety.decision === "confirm") {
    store.getState().addMessage({
      role: "thinking",
      content: `Safety review for "${step.label}": ${safety.risk} risk. ${safety.reasons.join(" ")}`,
    });
  }

  store.getState().addLog({ content: step.command, type: "command" });

  const timeoutMs = stepTimeoutMs(step);

  try {
    const result = await runCommand(step.command, cwd, (line) => {
      store.getState().addLog({ content: line, type: "progress" });
      store.getState().addMessage({
        role: "system",
        content: `[${step.label}] ${line}`,
      });
    }, undefined, { timeoutMs });

    const duration = Date.now() - start;
    const durationStr = duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`;

    if (result.exitCode === 0) {
      store.getState().updateStep(step.id, { status: "done", output: result.stdout });
      store.getState().addLog({ content: `✓ ${step.label} — OK (${durationStr})`, type: "success" });
      return { success: true, output: result.stdout, duration };
    } else {
      if (result.timedOut) {
        store.getState().addLog({
          content: `✗ ${step.label} — timed out after ${Math.round(timeoutMs / 1000)}s and was terminated`,
          type: "error",
        });
      }
      const stderr = result.timedOut
        ? `Command timed out after ${Math.round(timeoutMs / 1000)}s and was terminated.\n${result.stderr}`.trim()
        : result.stderr;
      const psetupError = classifyCommandFailure({
        command: step.command,
        cwd,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr,
        stepLabel: step.label,
        stepType: step.type,
      });
      store.getState().updateStep(step.id, { status: "failed", error: psetupError.title });
      store.getState().addLog({ content: `✗ ${step.label} — ${errorSummary(psetupError)}`, type: "error" });
      store.getState().addMessage({ role: "system", content: errorSummary(psetupError) });
      return { success: false, output: result.stdout, error: stderr, psetupError, duration };
    }
  } catch (err) {
    const duration = Date.now() - start;
    const psetupError = classifyCommandFailure({
      command: step.command,
      cwd,
      stderr: err instanceof Error ? err.message : String(err),
      stepLabel: step.label,
      stepType: step.type,
    });
    store.getState().updateStep(step.id, { status: "failed", error: psetupError.title });
    store.getState().addLog({ content: `✗ ${step.label} — ${errorSummary(psetupError)}`, type: "error" });
    return { success: false, output: "", error: psetupError.explanation, psetupError, duration };
  }
}

async function handleSpecialStep(
  step: SetupStep,
  cwd: string,
  store: AppStore
): Promise<ExecutionResult> {
  const start = Date.now();

  switch (step.type) {
    case "env":
      store.getState().addLog({ content: "Configuring environment variables...", type: "info" });
      store.getState().addMessage({ role: "assistant", content: "Configuring environment variables..." });
      try {
        const result = await initEnvFile(cwd);
        if (result.skipped) {
          const psetupError = createSetuprError({
            code: result.reason === "missing-example" ? "ENV_TEMPLATE_MISSING" : "ENV_ALREADY_EXISTS",
            cwd,
            command: "setup",
            subcommand: "env",
            canContinue: result.reason !== "missing-example",
            forceBehavior: result.reason === "missing-example"
              ? "Force mode creates an empty .env, then continues with a notice that no variables were inferred."
              : "Force mode may overwrite the existing .env when explicitly requested.",
          });
          store.getState().addLog({ content: `${result.reason === "missing-example" ? "✗" : "⚠"} ${errorSummary(psetupError)}`, type: result.reason === "missing-example" ? "error" : "warning" });
          if (result.reason === "missing-example") {
            store.getState().updateStep(step.id, { status: "failed", error: psetupError.title });
            return { success: false, output: "", error: psetupError.explanation, psetupError, duration: Date.now() - start };
          }
          store.getState().updateStep(step.id, { status: "done", error: psetupError.title });
          return { success: true, output: psetupError.explanation, psetupError, duration: Date.now() - start };
        }
        const message = result.skipped
          ? ".env already exists; left unchanged"
          : result.source === ".env.example"
            ? "Created .env from .env.example"
            : "Created empty .env file";
        store.getState().addLog({ content: `✓ ${message}`, type: "success" });
      } catch (err) {
        const psetupError = createSetuprError({
          code: "ENV_WRITE_FAILED",
          cwd,
          command: "setup",
          subcommand: "env",
          details: [err instanceof Error ? err.message : String(err)],
        });
        store.getState().updateStep(step.id, { status: "failed", error: psetupError.title });
        store.getState().addLog({ content: `✗ ${errorSummary(psetupError)}`, type: "error" });
        return { success: false, output: "", error: psetupError.explanation, psetupError, duration: Date.now() - start };
      }
      store.getState().updateStep(step.id, { status: "done" });
      return { success: true, output: "Environment configured", duration: Date.now() - start };

    case "verify":
      store.getState().addLog({ content: "Verifying setup...", type: "info" });
      store.getState().addMessage({ role: "assistant", content: "Verifying setup..." });
      store.getState().updateStep(step.id, { status: "done" });
      store.getState().addLog({ content: "✓ Verification complete", type: "success" });
      return { success: true, output: "Verification complete", duration: Date.now() - start };

    default:
      store.getState().updateStep(step.id, { status: "skipped" });
      store.getState().addLog({ content: `○ ${step.label} — skipped`, type: "info" });
      return { success: true, output: "Skipped", duration: Date.now() - start };
  }
}

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut?: boolean;
  aborted?: boolean;
}

interface RunCommandOptions {
  timeoutMs?: number;
}

export function runCommand(
  command: string,
  cwd: string,
  onLine?: (line: string) => void,
  signal?: AbortSignal,
  options: RunCommandOptions = {}
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const env = { ...process.env };
    if (!env.NO_COLOR) env.FORCE_COLOR = "1";
    const proc = spawn(command, {
      cwd,
      shell: true,
      env,
      detached: process.platform !== "win32",
    });

    let settled = false;
    let timedOut = false;
    let aborted = false;
    let timeout: NodeJS.Timeout | undefined;

    const finish = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve({ ...result, timedOut, aborted });
    };

    if (options.timeoutMs && options.timeoutMs > 0) {
      timeout = setTimeout(() => {
        timedOut = true;
        terminateProcessTree(proc);
      }, options.timeoutMs);
      timeout.unref?.();
    }

    if (signal) {
      signal.addEventListener("abort", () => {
        aborted = true;
        terminateProcessTree(proc);
      }, { once: true });
    }

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      const str = data.toString();
      stdout += str;
      str.split("\n").filter(Boolean).forEach((line: string) => {
        try { onLine?.(line); } catch {}
      });
    });

    proc.stderr?.on("data", (data) => {
      const str = data.toString();
      stderr += str;
      str.split("\n").filter(Boolean).forEach((line: string) => {
        try { onLine?.(line); } catch {}
      });
    });

    proc.on("close", (code) => {
      finish({ stdout, stderr, exitCode: timedOut ? 124 : aborted ? 130 : code ?? 1 });
    });

    proc.on("error", (err) => {
      finish({ stdout, stderr: err.message, exitCode: 1 });
    });
  });
}

export function runCommandArgs(
  command: string,
  args: string[],
  cwd: string,
  onLine?: (line: string) => void,
  signal?: AbortSignal,
  options: RunCommandOptions = {}
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const env = { ...process.env };
    if (!env.NO_COLOR) env.FORCE_COLOR = "1";
    const proc = spawn(command, args, {
      cwd,
      shell: false,
      env,
      detached: process.platform !== "win32",
    });

    let settled = false;
    let timedOut = false;
    let aborted = false;
    let timeout: NodeJS.Timeout | undefined;

    const finish = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve({ ...result, timedOut, aborted });
    };

    if (options.timeoutMs && options.timeoutMs > 0) {
      timeout = setTimeout(() => {
        timedOut = true;
        terminateProcessTree(proc);
      }, options.timeoutMs);
      timeout.unref?.();
    }

    if (signal) {
      signal.addEventListener("abort", () => {
        aborted = true;
        terminateProcessTree(proc);
      }, { once: true });
    }

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      const str = data.toString();
      stdout += str;
      str.split("\n").filter(Boolean).forEach((line: string) => {
        try { onLine?.(line); } catch {}
      });
    });

    proc.stderr?.on("data", (data) => {
      const str = data.toString();
      stderr += str;
      str.split("\n").filter(Boolean).forEach((line: string) => {
        try { onLine?.(line); } catch {}
      });
    });

    proc.on("close", (code) => {
      finish({ stdout, stderr, exitCode: timedOut ? 124 : aborted ? 130 : code ?? 1 });
    });

    proc.on("error", (err) => {
      finish({ stdout, stderr: err.message, exitCode: 1 });
    });
  });
}

function terminateProcessTree(proc: ChildProcess): void {
  if (!proc.pid) return;
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } catch {
      try { proc.kill("SIGTERM"); } catch {}
    }
    return;
  }

  try {
    process.kill(-proc.pid, "SIGTERM");
  } catch {
    try { proc.kill("SIGTERM"); } catch {}
  }

  const forceKill = setTimeout(() => {
    try { process.kill(-proc.pid!, "SIGKILL"); } catch {}
  }, 1500);
  forceKill.unref?.();
}

export async function executeAllSteps(
  steps: SetupStep[],
  cwd: string,
  store: AppStore,
  startFromIndex = 0
): Promise<{ success: boolean; results: ExecutionResult[] }> {
  const results: ExecutionResult[] = [];
  const scan = store.getState().scan;
  const context = store.getState().context;
  store.getState().setRunning(true);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (i < startFromIndex) {
      store.getState().updateStep(step.id, { status: "done" });
      store.getState().nextStep();
      continue;
    }

    const result = await executeStep(step, cwd, store);
    results.push(result);

    const completedIds = steps.slice(0, i + 1).filter((candidate) => candidate.status === "done" || result.success).map((candidate) => candidate.id);
    if (scan) {
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

    if (!result.success && step.type !== "verify") {
      if (scan && context) {
        store.getState().addMessage({ role: "thinking", content: `Diagnosing failure in "${step.label}"...` });
        const decision = await diagnoseStepFailure({ cwd, context, step, steps: store.getState().steps, result });
        store.getState().addMessage({ role: "thinking", content: decision.reason });

        if (decision.planDiff) {
          store.getState().addMessage({ role: "assistant", content: formatPlanChange(decision.planDiff) });
          await saveAgentWorkflowCheckpoint(cwd, {
            cwd,
            command: "setup",
            phase: "diagnosing",
            activeStepId: step.id,
            steps: decision.newSteps || store.getState().steps,
            completedStepIds: store.getState().steps.filter((candidate) => candidate.status === "done").map((candidate) => candidate.id),
            failedStepIds: [step.id],
            skippedStepIds: store.getState().steps.filter((candidate) => candidate.status === "skipped").map((candidate) => candidate.id),
            userAnswers: [],
            lastDecision: decision.reason,
            lastPlanDiff: decision.planDiff,
            safeOutputs: [{
              stepId: step.id,
              excerpt: `${result.error || ""}\n${result.output || ""}`.slice(0, 1200),
              timestamp: Date.now(),
            }],
          }).catch(() => undefined);
        }

        if (decision.action === "continue" || decision.action === "skip") {
          store.getState().updateStep(step.id, { status: decision.action === "skip" ? "skipped" : "done" });
          store.getState().nextStep();
          continue;
        }

        if (decision.action === "replan" && decision.newSteps?.length) {
          store.getState().setSteps(decision.newSteps);
          return executeAllSteps(decision.newSteps, cwd, store, i);
        }

        if (decision.action === "ask-user" && decision.prompt) {
          store.getState().addNotice({ type: "warning", message: decision.prompt });
          store.getState().addMessage({ role: "assistant", content: decision.prompt });
        }
      }
      store.getState().setRunning(false);
      return { success: false, results };
    }

    store.getState().nextStep();
  }

  store.getState().setRunning(false);
  store.getState().setComplete(true);
  if (scan) {
    await saveAgentWorkflowCheckpoint(cwd, {
      cwd,
      command: "setup",
      phase: "complete",
      steps: store.getState().steps,
      completedStepIds: store.getState().steps.filter((step) => step.status === "done").map((step) => step.id),
      failedStepIds: store.getState().steps.filter((step) => step.status === "failed").map((step) => step.id),
      skippedStepIds: store.getState().steps.filter((step) => step.status === "skipped").map((step) => step.id),
      userAnswers: [],
      lastDecision: "Workflow completed.",
      safeOutputs: results.map((result, index) => ({
        stepId: steps[index]?.id || `step-${index + 1}`,
        excerpt: `${result.error || ""}\n${result.output || ""}`.slice(0, 1200),
        timestamp: Date.now(),
      })),
    }).catch(() => undefined);
  }
  return { success: true, results };
}
