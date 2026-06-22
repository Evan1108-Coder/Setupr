import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { chat, hasAIKey, type ChatMessage } from "../ai/client.js";
import type { ProjectContext } from "../ai/dsl.js";
import { planStepsHeuristic, type SetupStep } from "../ai/planner.js";
import { applyPlanTextAdjustment, isSensitiveEnvKey, maskEnvVars } from "../ai/setupFlow.js";
import type { ScanResult } from "../scanner/index.js";
import type { ExecutionResult } from "../executor/index.js";
import { diffPlans, formatPlanDiff, type PlanDiff } from "./planDiff.js";
import { evaluateStepSafety } from "./safety.js";
import { classifyProviderFailure, fallbackModelsFor } from "./providerDiagnostics.js";
import { getActiveModel } from "../ai/client.js";
import { compactDocumentsBlock } from "../ai/contextCompression.js";

export interface DirectorDecision {
  action: "continue" | "retry" | "skip" | "replan" | "ask-user" | "stop";
  reason: string;
  newSteps?: SetupStep[];
  prompt?: string;
  planDiff?: PlanDiff;
}

export interface EnvVarInsight {
  key: string;
  sensitive: boolean;
  required: boolean;
  safeDefault?: string;
  explanation: string;
  source: "pattern" | "docs" | "ai";
}

export interface DoctorInsight {
  issue: string;
  severity: "info" | "warning" | "error";
  explanation: string;
  fix?: {
    label: string;
    command?: string;
    safe: boolean;
  };
}

export interface StartPlan {
  script?: string;
  command?: string;
  confidence: number;
  reasons: string[];
  blockers: string[];
}

export function buildDirectorContextPrompt(context: ProjectContext): string {
  const docs = compactDocumentsBlock(context.documents, 12);
  const scripts = context.packageScripts
    ?.slice(0, 12)
    .map((script) => `${script.name}: ${script.command} (${script.reason})`)
    .join("\n") || "No package scripts.";
  return [
    `Project root: ${context.cwd}`,
    `Stack: ${[context.scan.language, context.scan.framework, context.scan.packageManager].filter(Boolean).join(" / ") || "unknown"}`,
    `Scripts:\n${scripts}`,
    `Env missing: ${context.envVars.missing.join(", ") || "none"}`,
    `Setup hints: ${context.setupHints?.join("; ") || "none"}`,
    `Compressed document facts:\n${docs}`,
    "Use compressed facts only as internal context. Explain to users in normal natural language, never in DSL form.",
  ].join("\n\n");
}

export async function diagnoseStepFailure(input: {
  cwd: string;
  context: ProjectContext;
  step: SetupStep;
  steps: SetupStep[];
  result: ExecutionResult;
  force?: boolean;
}): Promise<DirectorDecision> {
  const heuristic = diagnoseStepFailureHeuristic(input);
  if (heuristic.action === "replan" || heuristic.action === "ask-user") return heuristic;
  if (!hasAIKey()) return heuristic;

  try {
    const active = getActiveModel();
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: [
          "You are Setupr's AI director. Diagnose a failed setup step and return strict JSON.",
          "Allowed actions: continue, retry, skip, replan, ask-user, stop.",
          "Never propose destructive commands. Prefer safe, local recovery.",
          "Schema: {\"action\":\"...\",\"reason\":\"...\",\"replacementSteps\":[{\"id\":\"...\",\"label\":\"...\",\"type\":\"runtime|deps|env|script|verify|config\",\"command\":\"...\"}]}",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          buildDirectorContextPrompt(input.context),
          `Failed step: ${input.step.label}`,
          `Command: ${input.step.command || "(special step)"}`,
          `Error: ${input.result.setuprError?.title || input.result.error || "unknown"}`,
          `Output: ${(input.result.error || input.result.output || "").slice(0, 2000)}`,
        ].join("\n\n"),
      },
    ];
    const response = await chat(messages, { temperature: 0.1, maxTokens: 900, timeoutMs: 12000, model: active.id });
    const parsed = parseDirectorDecision(response.content, input.steps);
    return parsed || heuristic;
  } catch (err) {
    const classified = classifyProviderFailure(err);
    return {
      ...heuristic,
      reason: `${heuristic.reason} AI diagnosis was unavailable: ${classified.title}.`,
    };
  }
}

function diagnoseStepFailureHeuristic(input: {
  step: SetupStep;
  steps: SetupStep[];
  result: ExecutionResult;
  force?: boolean;
}): DirectorDecision {
  const output = `${input.result.error || ""}\n${input.result.output || ""}`.toLowerCase();
  if (input.step.type === "deps" && /eresolve|peer dep|unable to resolve dependency|dependency conflict/.test(output)) {
    const retryCommand = input.step.command?.startsWith("npm ")
      ? `${input.step.command} --legacy-peer-deps`
      : input.step.command;
    if (retryCommand && retryCommand !== input.step.command) {
      const newSteps = input.steps.map((step) =>
        step.id === input.step.id
          ? { ...step, label: `${step.label} (legacy peer deps retry)`, command: retryCommand, status: "pending" as const }
          : step
      );
      return {
        action: "replan",
        reason: "The install failed with a peer dependency conflict, so Setupr will retry npm install with --legacy-peer-deps.",
        newSteps,
        planDiff: diffPlans(input.steps, newSteps),
      };
    }
  }

  if (/eaddrinuse|address already in use|port.*in use/.test(output)) {
    return {
      action: input.force ? "ask-user" : "ask-user",
      reason: "A port is already in use. The user should choose whether to stop that process, change ports, or skip startup.",
      prompt: "Port already in use. Should I try a different port, stop the existing process, or skip this step?",
    };
  }

  if (/command not found|not recognized|enoent/.test(output)) {
    return {
      action: "stop",
      reason: "A required command is missing from PATH. Installing or switching runtimes is safer than guessing.",
    };
  }

  if (input.step.type === "verify") {
    return { action: "continue", reason: "Verification failed, but setup can continue with a warning." };
  }

  return {
    action: "stop",
    reason: "The failure is not safely recoverable without user input.",
  };
}

function parseDirectorDecision(content: string, originalSteps: SetupStep[]): DirectorDecision | null {
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as {
      action?: DirectorDecision["action"];
      reason?: string;
      replacementSteps?: Array<Partial<SetupStep>>;
      prompt?: string;
    };
    if (!parsed.action || !["continue", "retry", "skip", "replan", "ask-user", "stop"].includes(parsed.action)) return null;
    const newSteps = parsed.replacementSteps?.length
      ? parsed.replacementSteps.map((step, index) => ({
          id: step.id || `ai-step-${index + 1}`,
          label: step.label || `AI step ${index + 1}`,
          type: step.type || "script",
          command: step.command || undefined,
          status: "pending" as const,
        }))
      : undefined;
    return {
      action: parsed.action,
      reason: parsed.reason || "AI director returned a recovery decision.",
      newSteps,
      prompt: parsed.prompt,
      planDiff: newSteps ? diffPlans(originalSteps, newSteps) : undefined,
    };
  } catch {
    return null;
  }
}

export function applySteeringToPlan(steps: SetupStep[], text: string): { steps: SetupStep[]; diff: PlanDiff; notes: string[] } {
  const before = steps.map((step) => ({ ...step }));
  const adjusted = applyPlanTextAdjustment(steps, text);
  return { steps: adjusted.steps, diff: diffPlans(before, adjusted.steps), notes: adjusted.notes };
}

export function analyzeEnvTemplate(context: ProjectContext): EnvVarInsight[] {
  const keys = context.envVars.templateKeys || context.envVars.missing || [];
  const docs = context.documents?.map((doc) => doc.excerpt).join("\n").toLowerCase() || "";
  return keys.map((key) => {
    const sensitive = isSensitiveEnvKey(key);
    const safeDefault = sensitive ? undefined : safeDefaultForEnv(key, context.scan);
    return {
      key,
      sensitive,
      required: context.envVars.missing.includes(key),
      safeDefault,
      explanation: explainEnvKey(key, sensitive, docs),
      source: docs.includes(key.toLowerCase()) ? "docs" : "pattern",
    };
  });
}

function safeDefaultForEnv(key: string, scan: ScanResult): string | undefined {
  if (/PORT$/i.test(key)) return scan.framework === "FastAPI" || scan.framework === "Django" ? "8000" : "3000";
  if (/NODE_ENV/i.test(key)) return "development";
  if (/DATABASE_URL/i.test(key)) return "postgres://localhost:5432/app";
  if (/REDIS_URL/i.test(key)) return "redis://localhost:6379";
  if (/HOST/i.test(key)) return "localhost";
  return undefined;
}

function explainEnvKey(key: string, sensitive: boolean, docs: string): string {
  if (sensitive) return `${key} looks sensitive, so Setupr will ask for a real value and mask it.`;
  if (/DATABASE_URL/i.test(key)) return "Database connection URL used by local app/server code.";
  if (/REDIS_URL/i.test(key)) return "Redis connection URL used for cache or queues.";
  if (/PORT/i.test(key)) return "Local port used by the development server.";
  if (docs.includes(key.toLowerCase())) return `${key} is mentioned in project documentation.`;
  return `${key} is required by the environment template.`;
}

export function createPostSetupSummary(input: {
  context: ProjectContext;
  steps: SetupStep[];
  results: ExecutionResult[];
  envInsights?: EnvVarInsight[];
}): string {
  const done = input.steps.filter((step) => step.status === "done").length;
  const failed = input.steps.filter((step) => step.status === "failed").length;
  const skipped = input.steps.filter((step) => step.status === "skipped").length;
  const start = chooseStartPlan(input.context);
  const envNeeds = input.envInsights?.filter((env) => env.required && env.sensitive).map((env) => env.key) || [];
  const lines = [
    `Setup summary: ${done} done, ${skipped} skipped, ${failed} failed.`,
    start.command ? `Run command: ${start.command}` : "No start command was confidently detected.",
  ];
  if (envNeeds.length) lines.push(`Still needs real credentials: ${envNeeds.join(", ")}.`);
  if (input.context.setupHints?.length) lines.push(`Project notes: ${input.context.setupHints.slice(0, 3).join("; ")}.`);
  lines.push("I can keep answering project questions from the TUI.");
  return lines.join("\n");
}

export function doctorInsights(context: ProjectContext): DoctorInsight[] {
  const insights: DoctorInsight[] = [];
  if (!context.scan.language && !context.scan.framework) {
    insights.push({
      issue: "No recognizable project files",
      severity: "error",
      explanation: "Setupr could not identify a language/framework, so setup/start decisions would be guesses.",
    });
  }
  if (context.envVars.missing.length) {
    insights.push({
      issue: "Missing environment values",
      severity: "warning",
      explanation: `${context.envVars.missing.length} value(s) from .env.example are missing or blank.`,
      fix: { label: "Initialize env file", command: "setupr env init", safe: true },
    });
  }
  if (context.scan.packageManager && !existsSync(join(context.cwd, "node_modules")) && ["npm", "pnpm", "yarn", "bun"].includes(context.scan.packageManager)) {
    insights.push({
      issue: "Dependencies not installed",
      severity: "error",
      explanation: "JavaScript dependencies appear missing, so build/start/test commands may fail.",
      fix: { label: "Install dependencies", command: `${context.scan.packageManager} install`, safe: true },
    });
  }
  if (context.git.isRepo && context.git.isDirty) {
    insights.push({
      issue: "Working tree has local changes",
      severity: "info",
      explanation: "Setupr can continue, but destructive commands should ask before changing files.",
    });
  }
  return insights;
}

export function chooseStartPlan(context: ProjectContext): StartPlan {
  const scripts = context.packageScripts || [];
  const blockers: string[] = [];
  if (context.envVars.missing.length) blockers.push(`missing env values: ${context.envVars.missing.join(", ")}`);
  const preferred = scripts.find((script) => ["dev", "start", "serve", "develop", "watch"].includes(script.name)) || scripts[0];
  if (!preferred) {
    return { confidence: 0, reasons: ["No package start/dev scripts were detected."], blockers };
  }
  const pm = context.scan.packageManager || "npm";
  return {
    script: preferred.name,
    command: `${pm} run ${preferred.name}`,
    confidence: preferred.score,
    reasons: [preferred.reason, ...((context.setupHints || []).slice(0, 2))],
    blockers,
  };
}

export function formatEnvInsights(insights: EnvVarInsight[]): string {
  if (insights.length === 0) return "No environment variables found.";
  return insights
    .slice(0, 12)
    .map((item) => {
      const safe = item.safeDefault ? ` Safe dev default: ${item.safeDefault}.` : "";
      const sensitive = item.sensitive ? " Sensitive." : "";
      return `${item.key}: ${item.explanation}${sensitive}${safe}`;
    })
    .join("\n");
}

export function safePlanFromScan(scan: ScanResult): SetupStep[] {
  return planStepsHeuristic(scan).filter((step) => evaluateStepSafety(step).decision !== "block");
}

export function formatPlanChange(diff: PlanDiff): string {
  return formatPlanDiff(diff);
}

export function maskKeyValues(values: Record<string, string>): string {
  return maskEnvVars(Object.entries(values).map(([key, value]) => ({ key, value })))
    .map((item) => `${item.key}=${item.value}`)
    .join(", ");
}

export async function readProjectInstructions(cwd: string): Promise<string> {
  const paths = ["README.md", "SETUP.md", "CONTRIBUTING.md"];
  const chunks: string[] = [];
  for (const path of paths) {
    const content = await readFile(join(cwd, path), "utf-8").catch(() => "");
    if (content.trim()) chunks.push(`# ${path}\n${content.slice(0, 3000)}`);
  }
  return chunks.join("\n\n");
}

export function fallbackModelsMessage(error: unknown): string {
  const active = getActiveModel();
  const classified = classifyProviderFailure(error, { provider: active.provider, model: active.id });
  const fallback = fallbackModelsFor(active).slice(0, 3).map((model) => model.id).join(", ");
  return fallback
    ? `${classified.title}. Available fallback models: ${fallback}.`
    : `${classified.title}. No configured fallback model is available.`;
}
