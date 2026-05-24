import { spawn } from "child_process";
import type { SetupStep } from "../ai/planner.js";
import type { AppStore } from "../state/store.js";
import { createSnapshot } from "./undo.js";

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  duration: number;
}

export async function executeStep(
  step: SetupStep,
  cwd: string,
  store: AppStore
): Promise<ExecutionResult> {
  const start = Date.now();

  store.getState().updateStep(step.id, { status: "running" });
  store.getState().addLog({ content: step.label, type: "info", stepIndex: store.getState().currentStepIndex });

  if (step.type === "deps" || step.type === "env" || step.type === "config") {
    await createSnapshot(cwd, step.id);
  }

  if (!step.command) {
    return handleSpecialStep(step, cwd, store);
  }

  store.getState().addLog({ content: `$ ${step.command}`, type: "command" });

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
      const errMsg = result.stderr?.split("\n")[0] || `Exit code: ${result.exitCode}`;
      store.getState().updateStep(step.id, { status: "failed", error: errMsg });
      store.getState().addLog({ content: `✗ ${step.label} — ${errMsg}`, type: "error" });
      return { success: false, output: result.stdout, error: result.stderr, duration };
    }
  } catch (err) {
    const duration = Date.now() - start;
    const error = err instanceof Error ? err.message : "Unknown error";
    store.getState().updateStep(step.id, { status: "failed", error });
    store.getState().addLog({ content: `✗ ${step.label} — ${error}`, type: "error" });
    return { success: false, output: "", error, duration };
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
      store.getState().addLog({ content: "Checking environment variables...", type: "info" });
      store.getState().addMessage({ role: "assistant", content: "Checking environment variables..." });
      store.getState().updateStep(step.id, { status: "done" });
      store.getState().addLog({ content: "✓ Environment check complete", type: "success" });
      return { success: true, output: "Environment check complete", duration: Date.now() - start };

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
    const proc = spawn(command, {
      cwd,
      shell: true,
      env: { ...process.env, FORCE_COLOR: "1" },
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
  store: AppStore
): Promise<{ success: boolean; results: ExecutionResult[] }> {
  const results: ExecutionResult[] = [];
  store.getState().setRunning(true);

  for (const step of steps) {
    const result = await executeStep(step, cwd, store);
    results.push(result);

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
