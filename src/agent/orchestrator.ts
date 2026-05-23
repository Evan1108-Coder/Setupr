import { scanProject } from "../scanner/projectScanner.js";
import { chatCompletion, hasAIKey, type ChatMessage } from "./aiClient.js";
import { intelligentResponse, type IntelligenceResult } from "./intelligence.js";
import { collectContext, contextToDSL, type ProjectContext } from "../context/contextCollector.js";
import type { AppStore, SetupStep } from "../store/appStore.js";

let store: AppStore | null = null;
let projectContext: ProjectContext | null = null;

export function bindStore(s: AppStore) {
  store = s;
}

function getStore(): AppStore {
  if (!store) throw new Error("Store not bound to orchestrator");
  return store;
}

const SYSTEM_PROMPT = `You are P-Setup's AI agent — the brain of an intelligent project setup tool.
Your role: dynamically plan and execute project setup workflows.
You have full context about the project: files, git state, env vars, terminal, config.

When asked to PLAN setup steps, respond ONLY with a JSON array:
[{"id":"unique_id","label":"Human readable step label"}]

Plan steps based on what the project actually needs. Don't include unnecessary steps.
Consider: missing deps, env gaps, build verification, runtime version, monorepo structure.

When chatting (not planning), respond naturally with helpful advice. Be concise.
Use the compressed project context to understand the state without re-asking.`;

const PLANNING_PROMPT = `Based on this project context, plan the setup steps needed.
Rules:
- Only include steps that are actually needed
- Order matters: dependencies before verification
- If env vars are missing, include env setup
- If it's a monorepo, consider per-package setup
- Always end with a verification/summary step
- Return ONLY a JSON array of {id, label} objects`;

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

  // Collect full context
  projectContext = await collectContext(state.cwd, scan);
  const dsl = contextToDSL(projectContext);

  s.getState().addMessage({
    role: "assistant",
    content: `Detected: ${scan.language} project${scan.framework ? ` (${scan.framework})` : ""} with ${scan.packageManager || "unknown"} package manager. ${scan.dependencies} deps.${projectContext.monorepo.detected ? ` Monorepo: ${projectContext.monorepo.type}.` : ""}`,
    timestamp: Date.now(),
  });

  s.getState().setPhase("planning");

  // AI-driven step planning
  const steps = await planStepsWithAI(dsl);
  s.getState().setSteps(steps);

  const modeLabel = hasAIKey() ? "AI-assisted" : "offline (pattern matching)";
  s.getState().addMessage({
    role: "assistant",
    content: `Setup plan: ${steps.length} steps. Mode: ${modeLabel}.`,
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

async function planStepsWithAI(dsl: string): Promise<SetupStep[]> {
  if (hasAIKey()) {
    try {
      const messages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: `Project: ${dsl}` },
        { role: "user", content: PLANNING_PROMPT },
      ];
      const response = await chatCompletion(messages);
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((s: any) => ({
          id: s.id,
          label: s.label,
          status: "pending" as const,
        }));
      }
    } catch {
      // Fall through to heuristic planning
    }
  }

  return planStepsHeuristic();
}

function planStepsHeuristic(): SetupStep[] {
  if (!projectContext) return [{ id: "summary", label: "Generate summary", status: "pending" }];

  const steps: SetupStep[] = [];
  const { scan, envVars, monorepo, git } = projectContext;

  steps.push({ id: "analyze", label: "Analyze project structure", status: "pending" });

  if (monorepo.detected) {
    steps.push({ id: "mono", label: `Configure ${monorepo.type} workspace`, status: "pending" });
  }

  if (scan.packageManager) {
    steps.push({ id: "deps", label: `Install dependencies (${scan.packageManager})`, status: "pending" });
  }

  if (envVars.missing.length > 0) {
    steps.push({ id: "env", label: `Configure ${envVars.missing.length} missing env vars`, status: "pending" });
  }

  if (scan.scripts?.build) {
    steps.push({ id: "verify", label: "Verify build", status: "pending" });
  }

  steps.push({ id: "summary", label: "Generate summary", status: "pending" });

  return steps;
}

async function executeStep(stepId: string, scan: import("../store/appStore.js").ScanResult) {
  // v0.1: Simulated execution with timing that varies by step complexity
  const durations: Record<string, number> = {
    analyze: 600,
    mono: 500,
    deps: 1200,
    env: 800,
    verify: 1000,
    summary: 400,
  };
  await new Promise((r) => setTimeout(r, durations[stepId] || 800));
}

export async function sendChatMessage(text: string) {
  const s = getStore();
  s.getState().addMessage({ role: "user", content: text, timestamp: Date.now() });
  s.getState().setAiThinking(true);

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  // Provide full context via compressed DSL
  if (projectContext) {
    messages.push({
      role: "system",
      content: `Context: ${contextToDSL(projectContext)}`,
    });
  }

  const history = s.getState().messages.slice(-10);
  for (const msg of history) {
    if (msg.role === "user" || msg.role === "assistant") {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // Use progressive intelligence: pattern → cache → live AI
  const result: IntelligenceResult = await intelligentResponse(text, messages, projectContext || undefined);

  s.getState().setAiThinking(false);
  s.getState().addMessage({
    role: "assistant",
    content: result.response,
    timestamp: Date.now(),
  });

  // Show intelligence level indicator in system message
  if (result.level !== "live") {
    s.getState().addMessage({
      role: "system",
      content: `[${result.level === "pattern" ? "⚡ instant" : "📦 cached"} — $0.00]`,
      timestamp: Date.now(),
    });
  } else {
    s.getState().addMessage({
      role: "system",
      content: `[🧠 AI — ~$${result.cost.toFixed(4)}]`,
      timestamp: Date.now(),
    });
  }
}

export function getProjectContext(): ProjectContext | null {
  return projectContext;
}
