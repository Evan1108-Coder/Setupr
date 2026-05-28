import { spawn } from "child_process";
import type { SetupStep } from "../ai/planner.js";
import type { AppStore } from "../state/store.js";
import { createSnapshot } from "./undo.js";
import { initEnvFile } from "../env/index.js";
import { classifyCommandFailure, createPSetupError, errorSummary, type PSetupError } from "../errors/index.js";
import { saveCheckpoint } from "../state/checkpoint.js";

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  psetupError?: PSetupError;
  duration: number;
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

  store.getState().addLog({ content: step.command, type: "command" });

  try {
    const result = await runCommand(step.command, cwd, (line) => {
      store.getState().addLog({ content: line, type: "progress" });
      store.getState().addMessage({
        role: "system",
        content: `[${step.label}] ${line}`,
      });
    });

    const duration = Date.now() - start;
    const durationStr = duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`;

    if (result.exitCode === 0) {
      store.getState().updateStep(step.id, { status: "done", output: result.stdout });
      store.getState().addLog({ content: `✓ ${step.label} — OK (${durationStr})`, type: "success" });
      return { success: true, output: result.stdout, duration };
    } else {
      const psetupError = classifyCommandFailure({
        command: step.command,
        cwd,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        stepLabel: step.label,
        stepType: step.type,
      });
      store.getState().updateStep(step.id, { status: "failed", error: psetupError.title });
      store.getState().addLog({ content: `✗ ${step.label} — ${errorSummary(psetupError)}`, type: "error" });
      store.getState().addMessage({ role: "system", content: errorSummary(psetupError) });
      return { success: false, output: result.stdout, error: result.stderr, psetupError, duration };
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
          const psetupError = createPSetupError({
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
        const psetupError = createPSetupError({
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
}

export function runCommand(
  command: string,
  cwd: string,
  onLine?: (line: string) => void,
  signal?: AbortSignal
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const env = { ...process.env };
    if (!env.NO_COLOR) env.FORCE_COLOR = "1";
    const proc = spawn(command, {
      cwd,
      shell: true,
      env,
    });

    if (signal) {
      signal.addEventListener("abort", () => {
        proc.kill("SIGTERM");
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
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    proc.on("error", (err) => {
      resolve({ stdout, stderr: err.message, exitCode: 1 });
    });
  });
}

export async function executeAllSteps(
  steps: SetupStep[],
  cwd: string,
  store: AppStore,
  startFromIndex = 0
): Promise<{ success: boolean; results: ExecutionResult[] }> {
  const results: ExecutionResult[] = [];
  const scan = store.getState().scan;
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
      store.getState().setRunning(false);
      return { success: false, results };
    }

    store.getState().nextStep();
  }

  store.getState().setRunning(false);
  store.getState().setComplete(true);
  return { success: true, results };
}
