import React, { useEffect } from "react";
import { Box } from "ink";
import { SetupLayout } from "./layouts/SetupLayout.js";
import { DoctorLayout } from "./layouts/DoctorLayout.js";
import { StartLayout } from "./layouts/StartLayout.js";
import { UpdateLayout } from "./layouts/UpdateLayout.js";
import { CleanLayout } from "./layouts/CleanLayout.js";
import type { AppStore } from "../state/store.js";
import type { ScanResult } from "../scanner/index.js";
import { scanProject } from "../scanner/index.js";
import { collectContext } from "../context/collector.js";
import { contextToDSL } from "../ai/dsl.js";
import { planSteps } from "../ai/planner.js";
import { executeAllSteps } from "../executor/index.js";
import { loadCheckpoint, deleteCheckpoint, formatCheckpointAge } from "../state/checkpoint.js";
import { chat, hasAIKey, type ChatMessage } from "../ai/client.js";

export type TUICommand = "setup" | "start" | "doctor" | "update" | "clean";

interface AppProps {
  command: TUICommand;
  cwd: string;
  store: AppStore;
  cleanMode?: "deps" | "share" | "all";
  force?: boolean;
}

export function App({ command, cwd, store, cleanMode = "deps", force = false }: AppProps) {
  useEffect(() => {
    if (command === "setup") {
      runSetupFlow(cwd, store, force);
    }
  }, []);

  const scan = store.getState().scan;

  switch (command) {
    case "setup":
      return <SetupLayout store={store} />;
    case "doctor":
      return scan ? <DoctorLayout scan={scan} cwd={cwd} /> : <SetupLayout store={store} />;
    case "start":
      return scan ? <StartLayout scan={scan} cwd={cwd} /> : <SetupLayout store={store} />;
    case "update":
      return scan ? <UpdateLayout scan={scan} cwd={cwd} /> : <SetupLayout store={store} />;
    case "clean":
      return scan ? <CleanLayout scan={scan} cwd={cwd} mode={cleanMode} /> : <SetupLayout store={store} />;
    default:
      return <SetupLayout store={store} />;
  }
}

async function runSetupFlow(cwd: string, store: AppStore, force = false) {
  try {
    if (force) {
      await deleteCheckpoint(cwd);
    }

    const checkpoint = force ? null : await loadCheckpoint(cwd);

    if (checkpoint) {
      const age = formatCheckpointAge(checkpoint.timestamp);
      const completed = checkpoint.completedSteps.length;
      const total = checkpoint.steps.length;
      const remaining = total - completed;

      store.getState().addLog({ content: `Found checkpoint from ${age} (${completed}/${total} steps done)`, type: "warning" });
      store.getState().addLog({ content: `Resuming — ${remaining} step(s) remaining...`, type: "info" });
      store.getState().addMessage({
        role: "assistant",
        content: `Resuming interrupted setup (${completed}/${total} steps completed ${age}). Picking up where we left off.`,
        level: "pattern",
        cost: 0,
      });

      store.getState().setScan(checkpoint.scan);
      store.getState().setSteps(checkpoint.steps);

      await populateKeyDeps(cwd, store, checkpoint.scan);
      await populateEnvVars(cwd, store);
      populatePorts(store, checkpoint.scan);
      populateServices(store, checkpoint.scan);

      const context = await collectContext(cwd, checkpoint.scan);
      store.getState().setContext(context);

      store.getState().addLog({ content: "Resuming execution...", type: "info" });
      store.getState().setRunning(true);
      const result = await executeAllSteps(checkpoint.steps, cwd, store, checkpoint.currentStepIndex);
      store.getState().setRunning(false);
      store.getState().setComplete(true);
      store.getState().setCheckpoint(true);

      if (result.success) {
        await deleteCheckpoint(cwd);
      }

      finishSetup(store, cwd);
      return;
    }

    store.getState().addLog({ content: "Scanning project structure...", type: "info" });
    store.getState().addMessage({ role: "system", content: "Scanning project..." });

    const scan = await scanProject(cwd);
    store.getState().setScan(scan);

    const stackParts = [scan.framework, scan.language, ...(scan.services || [])].filter(Boolean);
    store.getState().addLog({ content: `Detected: ${stackParts.join(" + ")}`, type: "success" });
    store.getState().addLog({ content: `Found: ${scan.configFiles.join(", ")}`, type: "info" });
    store.getState().addMessage({
      role: "assistant",
      content: `Detected: ${scan.language || "unknown"}${scan.framework ? ` / ${scan.framework}` : ""} with ${scan.packageManager || "no"} package manager.`,
      level: "pattern",
      cost: 0,
    });

    await populateKeyDeps(cwd, store, scan);
    await populateEnvVars(cwd, store);
    populatePorts(store, scan);
    populateServices(store, scan);

    const context = await collectContext(cwd, scan);
    store.getState().setContext(context);

    store.getState().addLog({ content: "Planning setup steps...", type: "info" });
    store.getState().addMessage({ role: "thinking", content: "Planning setup steps..." });
    const steps = await planSteps(scan);
    store.getState().setSteps(steps);
    store.getState().addLog({ content: `Plan ready: ${steps.length} steps to execute.`, type: "success" });

    const stackDesc = [scan.language, scan.framework, ...(scan.services || [])].filter(Boolean).join(" + ");
    const stepNames = steps.map((s) => s.label).join(", ");
    const planNarration = await aiNarrate(
      `Explain the setup plan briefly. Steps: ${stepNames}`,
      `Stack: ${stackDesc}, PM: ${scan.packageManager || "none"}`
    );
    store.getState().addMessage({
      role: "assistant",
      content: planNarration || `Plan ready: ${steps.length} steps to execute.`,
      level: planNarration ? "live" : "pattern",
      cost: 0,
    });

    store.getState().addLog({ content: "Beginning execution...", type: "info" });
    store.getState().setRunning(true);
    const result = await executeAllSteps(steps, cwd, store);
    store.getState().setRunning(false);
    store.getState().setComplete(true);
    store.getState().setCheckpoint(true);

    if (result.success) {
      await deleteCheckpoint(cwd);
      const summary = await aiNarrate(
        `Summarize what was set up. Steps completed: ${stepNames}`,
        `Stack: ${stackDesc}`
      );
      if (summary) {
        store.getState().addMessage({ role: "assistant", content: summary, level: "live", cost: 0 });
      }
    } else {
      const failedStep = steps.find((s) => s.status === "failed");
      if (failedStep) {
        const fix = await aiAnalyzeFailure(
          failedStep.label,
          failedStep.error || "unknown error",
          `Stack: ${stackDesc}, PM: ${scan.packageManager || "none"}`
        );
        if (fix) {
          store.getState().addLog({ content: `AI suggestion: ${fix}`, type: "warning" });
          store.getState().addMessage({ role: "assistant", content: fix, level: "live", cost: 0 });
        }
      }
    }

    finishSetup(store, cwd);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    store.getState().addLog({ content: `Fatal error: ${msg}`, type: "error" });
    store.getState().addMessage({ role: "system", content: `Error: ${msg}` });
    store.getState().setRunning(false);
  }
}

async function finishSetup(store: AppStore, cwd: string) {
  const currentServices = store.getState().services;
  if (currentServices.length > 0) {
    store.getState().setServices(
      currentServices.map((s) => ({ ...s, status: "ready" as const }))
    );
  }

  try {
    const { access: accessCheck } = await import("fs/promises");
    const { join } = await import("path");
    const lockFiles = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb"];
    for (const lf of lockFiles) {
      try {
        await accessCheck(join(cwd, lf));
        store.setState({ lockSynced: true });
        break;
      } catch {}
    }
  } catch {}

  store.getState().addLog({ content: "Setup complete!", type: "success" });
  store.getState().addMessage({
    role: "assistant",
    content: "Setup complete! You can now chat with me about your project.",
  });
}

async function populateKeyDeps(cwd: string, store: AppStore, scan: ScanResult) {
  try {
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    const pkgPath = join(cwd, "package.json");
    const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
    const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const important = Object.entries(allDeps).slice(0, 8).map(([name, version]) => ({
      name,
      version: String(version).replace(/[\^~]/, ""),
      status: "ok" as const,
    }));
    store.getState().setKeyDeps(important);
    const total = Object.keys(allDeps).length;
    store.getState().setPackageStats({ total, installed: total, deprecated: 0 });
  } catch {}
}

async function populateEnvVars(cwd: string, store: AppStore) {
  try {
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    const example = await readFile(join(cwd, ".env.example"), "utf-8");
    const requiredKeys = example
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#"))
      .map((l) => l.split("=")[0].trim())
      .filter(Boolean);

    let currentVars: Record<string, string> = {};
    try {
      const env = await readFile(join(cwd, ".env"), "utf-8");
      for (const line of env.split("\n")) {
        if (line.trim() && !line.startsWith("#")) {
          const [k, ...rest] = line.split("=");
          if (k) currentVars[k.trim()] = rest.join("=").trim();
        }
      }
    } catch {}

    const envVars = requiredKeys.map((key) => ({
      key,
      value: currentVars[key] || "",
      status: (currentVars[key] ? "auto" : process.env[key] ? "auto" : "pending") as "auto" | "pending",
      source: currentVars[key] ? ".env" : process.env[key] ? "system" : undefined,
    }));

    store.getState().setEnvVars(envVars);
  } catch {}
}

function populatePorts(store: AppStore, scan: ScanResult) {
  const ports: Array<{ service: string; port: number; status: "free" | "in_use" }> = [];
  if (scan.framework) {
    const defaultPorts: Record<string, number> = {
      "Next.js": 3000, "React": 3000, "Vue": 5173, "Svelte": 5173,
      "Angular": 4200, "Express": 3000, "Fastify": 3000, "Django": 8000,
      "Flask": 5000, "FastAPI": 8000, "Gin": 8080,
    };
    const port = defaultPorts[scan.framework];
    if (port) ports.push({ service: scan.framework, port, status: "free" });
  }
  for (const svc of scan.services) {
    const svcPorts: Record<string, number> = {
      "PostgreSQL": 5432, "MySQL": 3306, "Redis": 6379, "MongoDB": 27017,
      "Docker": 2375, "Elasticsearch": 9200,
    };
    const port = svcPorts[svc];
    if (port) ports.push({ service: svc, port, status: "free" });
  }
  store.getState().setPorts(ports);
}

function populateServices(store: AppStore, scan: ScanResult) {
  const services = scan.services.map((name) => ({
    name,
    status: "pending" as const,
    port: undefined,
  }));
  store.getState().setServices(services);
}

function hasAIKeyCheck(): boolean {
  return !!(
    process.env.MINIMAX_API_KEY ||
    process.env.MOONSHOT_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GOOGLE_API_KEY
  );
}

async function aiNarrate(prompt: string, context: string): Promise<string | null> {
  if (!hasAIKeyCheck()) return null;
  try {
    const messages: ChatMessage[] = [
      { role: "system", content: `You are P-Setup's AI guide. Be concise (1-2 sentences max). Context: ${context}` },
      { role: "user", content: prompt },
    ];
    const result = await chat(messages, { maxTokens: 150 });
    return result.content;
  } catch {
    return null;
  }
}

async function aiAnalyzeFailure(step: string, error: string, context: string): Promise<string | null> {
  if (!hasAIKeyCheck()) return null;
  try {
    const messages: ChatMessage[] = [
      { role: "system", content: `You are P-Setup's AI troubleshooter. Diagnose the error and suggest a fix in 2-3 sentences. Context: ${context}` },
      { role: "user", content: `Step "${step}" failed with: ${error}` },
    ];
    const result = await chat(messages, { maxTokens: 200 });
    return result.content;
  } catch {
    return null;
  }
}
