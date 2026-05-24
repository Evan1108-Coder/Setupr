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

export type TUICommand = "setup" | "start" | "doctor" | "update" | "clean";

interface AppProps {
  command: TUICommand;
  cwd: string;
  store: AppStore;
  cleanMode?: "deps" | "share" | "all";
}

export function App({ command, cwd, store, cleanMode = "deps" }: AppProps) {
  useEffect(() => {
    if (command === "setup") {
      runSetupFlow(cwd, store);
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

async function runSetupFlow(cwd: string, store: AppStore) {
  try {
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

    populateKeyDeps(cwd, store, scan);
    populatePorts(store, scan);
    populateServices(store, scan);

    const context = await collectContext(cwd, scan);
    store.getState().setContext(context);

    store.getState().addLog({ content: "Planning setup steps...", type: "info" });
    store.getState().addMessage({ role: "thinking", content: "Planning setup steps..." });
    const steps = await planSteps(scan);
    store.getState().setSteps(steps);
    store.getState().addLog({ content: `Plan ready: ${steps.length} steps to execute.`, type: "success" });
    store.getState().addMessage({
      role: "assistant",
      content: `Plan ready: ${steps.length} steps to execute.`,
      level: hasAIKeyCheck() ? "live" : "pattern",
      cost: 0,
    });

    store.getState().addLog({ content: "Beginning execution...", type: "info" });
    store.getState().setRunning(true);
    await executeAllSteps(steps, cwd, store);
    store.getState().setRunning(false);
    store.getState().setComplete(true);
    store.getState().setCheckpoint(true);

    store.getState().addLog({ content: "Setup complete!", type: "success" });
    store.getState().addMessage({
      role: "assistant",
      content: "Setup complete! You can now chat with me about your project.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    store.getState().addLog({ content: `Fatal error: ${msg}`, type: "error" });
    store.getState().addMessage({ role: "system", content: `Error: ${msg}` });
    store.getState().setRunning(false);
  }
}

function populateKeyDeps(cwd: string, store: AppStore, scan: ScanResult) {
  try {
    const fs = require("fs");
    const pkgPath = `${cwd}/package.json`;
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const important = Object.entries(allDeps).slice(0, 8).map(([name, version]) => ({
        name,
        version: String(version).replace(/[\^~]/, ""),
        status: "ok" as const,
      }));
      store.getState().setKeyDeps(important);
      const total = Object.keys(allDeps).length;
      store.getState().setPackageStats({ total, installed: total, deprecated: 0 });
    }
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
