import { scanProject } from "../scanner/projectScanner.js";
import { chatCompletion, hasAIKey, type ChatMessage } from "./aiClient.js";
import { createAppStore, type AppStore } from "../store/appStore.js";

let store: AppStore | null = null;

export function bindStore(s: AppStore) {
  store = s;
}

function getStore(): AppStore {
  if (!store) throw new Error("Store not bound to orchestrator");
  return store;
}

const SYSTEM_PROMPT = `You are P-Setup's AI agent. You help users set up development projects.
You have access to the project scan results and can plan setup steps.
Be concise, helpful, and use rich formatting when appropriate.
When planning steps, output a JSON array of steps like: [{"id":"scan","label":"Scan project"}]
When chatting, respond naturally and helpfully.`;

export async function runSetupFlow() {
  const s = getStore();
  const state = s.getState();

  s.getState().setPhase("scanning");
  s.getState().addMessage({
    role: "assistant",
    content: "Scanning project directory...",
    timestamp: Date.now(),
  });

  const scan = await scanProject(state.cwd);
  s.getState().setScan(scan);

  if (!scan.language) {
    s.getState().addMessage({
      role: "assistant",
      content:
        "No recognized project structure found. Try running this in a project directory, or ask me what you'd like to set up.",
      timestamp: Date.now(),
    });
    s.getState().setPhase("chat");
    return;
  }

  s.getState().addMessage({
    role: "assistant",
    content: `Detected: ${scan.language} project${scan.framework ? ` (${scan.framework})` : ""} with ${scan.packageManager || "unknown"} package manager. ${scan.dependencies} dependencies found.`,
    timestamp: Date.now(),
  });

  s.getState().setPhase("planning");

  const steps = planSteps(scan);
  s.getState().setSteps(steps);

  s.getState().addMessage({
    role: "assistant",
    content: `Setup plan ready with ${steps.length} steps. ${hasAIKey() ? "AI-assisted mode active." : "Running in offline mode (no AI_API_KEY set)."}`,
    timestamp: Date.now(),
  });

  s.getState().setPhase("executing");

  for (const step of steps) {
    s.getState().updateStep(step.id, { status: "running" });
    s.getState().addMessage({
      role: "system",
      content: `▸ ${step.label}...`,
      timestamp: Date.now(),
    });

    await executeStep(step.id, scan);
    s.getState().updateStep(step.id, { status: "done" });
  }

  s.getState().setPhase("complete");
  s.getState().addMessage({
    role: "assistant",
    content: "✓ Setup complete! You can keep chatting with me about your project.",
    timestamp: Date.now(),
  });
  s.getState().setPhase("chat");
}

function planSteps(scan: import("../store/appStore.js").ScanResult) {
  const steps: { id: string; label: string; status: "pending" }[] = [];

  steps.push({ id: "scan", label: "Analyze project structure", status: "pending" });

  if (scan.packageManager) {
    steps.push({ id: "deps", label: "Install dependencies", status: "pending" });
  }

  if (scan.hasEnvExample && !scan.hasEnvFile) {
    steps.push({ id: "env", label: "Configure environment variables", status: "pending" });
  }

  if (scan.scripts?.build) {
    steps.push({ id: "verify", label: "Verify build", status: "pending" });
  }

  steps.push({ id: "summary", label: "Generate summary", status: "pending" });

  return steps;
}

async function executeStep(stepId: string, scan: import("../store/appStore.js").ScanResult) {
  // Simulated execution - in v0.2+ these will run real commands
  await new Promise((r) => setTimeout(r, 800));
}

export async function sendChatMessage(text: string) {
  const s = getStore();
  s.getState().addMessage({ role: "user", content: text, timestamp: Date.now() });
  s.getState().setAiThinking(true);

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  const scan = s.getState().scan;
  if (scan) {
    messages.push({
      role: "system",
      content: `Project context: ${JSON.stringify(scan)}`,
    });
  }

  const history = s.getState().messages.slice(-10);
  for (const msg of history) {
    if (msg.role === "user" || msg.role === "assistant") {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  const response = await chatCompletion(messages);
  s.getState().setAiThinking(false);
  s.getState().addMessage({
    role: "assistant",
    content: response,
    timestamp: Date.now(),
  });
}
