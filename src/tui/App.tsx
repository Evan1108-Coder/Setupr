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
  store.getState().addMessage({
    role: "system",
    content: "Scanning project...",
  });

  // Scan
  const scan = await scanProject(cwd);
  store.getState().setScan(scan);
  store.getState().addMessage({
    role: "assistant",
    content: `Detected: ${scan.language || "unknown"}${scan.framework ? ` / ${scan.framework}` : ""} with ${scan.packageManager || "no"} package manager.`,
    level: "pattern",
    cost: 0,
  });

  // Collect context
  const context = await collectContext(cwd, scan);
  store.getState().setContext(context);

  // Plan steps
  store.getState().addMessage({ role: "thinking", content: "Planning setup steps..." });
  const steps = await planSteps(scan);
  store.getState().setSteps(steps);
  store.getState().addMessage({
    role: "assistant",
    content: `Plan ready: ${steps.length} steps to execute.`,
    level: hasAIKeyCheck() ? "live" : "pattern",
    cost: 0,
  });

  // Execute
  store.getState().addMessage({ role: "system", content: "Beginning execution..." });
  await executeAllSteps(steps, cwd, store);

  store.getState().addMessage({
    role: "assistant",
    content: "Setup complete! You can now chat with me about your project.",
  });
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
