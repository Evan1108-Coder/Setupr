import { chat, hasAIKey, type ChatMessage } from "./client.js";
import { getCached, setCache, buildCacheKey } from "./cache.js";
import type { ScanResult } from "../scanner/index.js";
import { classifyAIProviderError, errorSummary } from "../errors/index.js";
import type { ParsedUserIntent } from "./userIntent.js";
import { getActiveModel } from "./client.js";
import { fallbackModelsFor } from "../agent/providerDiagnostics.js";

export type IntelligenceLevel = "pattern" | "cached" | "live";

export interface IntelligenceResult {
  response: string;
  level: IntelligenceLevel;
  cost: number;
}

export interface IntelligenceOptions {
  messages?: ChatMessage[];
  directorContext?: string;
  parsedIntent?: ParsedUserIntent;
}

// Pattern rules: instant, free answers
const PATTERN_RULES: Array<{
  match: (query: string, scan: ScanResult) => boolean;
  respond: (query: string, scan: ScanResult) => string;
}> = [
  {
    match: (q) => /how (to|do I) (install|add) dep/i.test(q),
    respond: (_, scan) => {
      const cmds: Record<string, string> = {
        npm: "npm install <package>",
        yarn: "yarn add <package>",
        pnpm: "pnpm add <package>",
        bun: "bun add <package>",
        pip: "pip install <package>",
        cargo: "cargo add <package>",
        go: "go get <package>",
      };
      return cmds[scan.packageManager || "npm"] || "Install using your package manager";
    },
  },
  {
    match: (q) => /what (is|'s) (the )?(framework|stack)/i.test(q),
    respond: (_, scan) =>
      `This is a ${scan.language || "unknown"} project${scan.framework ? ` using ${scan.framework}` : ""}${scan.packageManager ? ` with ${scan.packageManager}` : ""}.`,
  },
  {
    match: (q) => /how (to|do I) (start|run|dev)/i.test(q),
    respond: (_, scan) => {
      if (scan.scripts.dev) return `Run: ${scan.packageManager || "npm"} run dev`;
      if (scan.scripts.start) return `Run: ${scan.packageManager || "npm"} run start`;
      return "No start/dev script found in package.json.";
    },
  },
  {
    match: (q) => /what scripts/i.test(q),
    respond: (_, scan) => {
      const scripts = Object.keys(scan.scripts);
      if (!scripts.length) return "No scripts found.";
      return `Available scripts:\n${scripts.map((s) => `  • ${s}: ${scan.scripts[s]}`).join("\n")}`;
    },
  },
  {
    match: (q) => /what (services|databases|infra)/i.test(q),
    respond: (_, scan) => {
      if (!scan.services.length) return "No external services detected.";
      return `Detected services: ${scan.services.join(", ")}`;
    },
  },
  {
    match: (q) => /(monorepo|workspace)/i.test(q),
    respond: (_, scan) => {
      if (!scan.monorepo) return "This is not a monorepo.";
      return `Monorepo detected: ${scan.monorepo.type} with ${scan.monorepo.packages.length} packages (${scan.monorepo.packages.slice(0, 5).join(", ")})`;
    },
  },
];

export async function intelligentResponse(
  query: string,
  scan: ScanResult,
  contextDSL: string,
  optionsOrMessages?: ChatMessage[] | IntelligenceOptions
): Promise<IntelligenceResult> {
  const options = Array.isArray(optionsOrMessages)
    ? { messages: optionsOrMessages }
    : optionsOrMessages || {};

  // Level 0: Pattern matching (free, instant)
  for (const rule of PATTERN_RULES) {
    if (rule.match(query, scan)) {
      return { response: rule.respond(query, scan), level: "pattern", cost: 0 };
    }
  }

  // Level 1: Cache hit (free, instant)
  const cacheKey = buildCacheKey(query, `${contextDSL}\n${options.directorContext || ""}`);
  const cached = await getCached(cacheKey);
  if (cached) {
    return { response: cached.response, level: "cached", cost: 0 };
  }

  // Level 2: Live AI call
  if (!hasAIKey()) {
    return {
      response: "AI features require an API key. Run setupr auth login or setupr auth set-key <provider>. Shell environment keys still work for temporary use.",
      level: "pattern",
      cost: 0,
    };
  }

  const systemMsg: ChatMessage = {
    role: "system",
    content: [
      "You are Setupr's AI director — the worker and coordinator for this project setup session.",
      `Project context: ${contextDSL}.`,
      options.parsedIntent
        ? `Parsed user intent: ${options.parsedIntent.compact}. Raw user wording is preserved in the context packet as the fallback source of truth.`
        : "Parsed user intent was not available.",
      options.directorContext
        ? `Full director context packet: ${options.directorContext}.`
        : "Full director context packet was not available for this command.",
      "Stay oriented to the user's current project, setup plan, environment, commands, and troubleshooting.",
      "Internal DSL and compact facts are for your reasoning only. Never answer the user in DSL unless they explicitly ask to inspect internal context.",
      "When parser confidence is low or the parsed intent conflicts with the raw message, trust the raw message and ask a brief clarification before acting.",
      "If the user asks something adjacent, answer briefly and connect it back to the project when useful.",
      "If the user asks something clearly unrelated, be friendly, keep it short, and gently return focus to the setup work.",
      "Do not be rigid: useful clarification, small explanations, and user steering are part of staying on task.",
    ].join(" "),
  };

  const userMsg: ChatMessage = { role: "user", content: query };
  const allMessages = [systemMsg, ...(options.messages || []), userMsg];

  try {
    const result = await chat(allMessages);
    await setCache(cacheKey, result.content, result.tokens);
    const costPerToken = 0.000001; // approximate
    return {
      response: result.content,
      level: "live",
      cost: result.tokens * costPerToken,
    };
  } catch (err) {
    const fallback = await tryFallbackModels(allMessages, err);
    if (fallback) {
      await setCache(cacheKey, fallback.content, fallback.tokens);
      return {
        response: `${fallback.content}\n\n(Fell back from ${fallback.originalModel} to ${fallback.model} after the first provider failed.)`,
        level: "live",
        cost: fallback.tokens * 0.000001,
      };
    }
    const setuprError = classifyAIProviderError(err, { command: "ai-director" });
    return {
      response: `AI unavailable: ${errorSummary(setuprError)} ${setuprError.nextSteps?.join(" ") || ""}`,
      level: "pattern",
      cost: 0,
    };
  }
}

async function tryFallbackModels(
  messages: ChatMessage[],
  originalError: unknown
): Promise<{ content: string; tokens: number; model: string; originalModel: string } | null> {
  const active = getActiveModel();
  const original = classifyAIProviderError(originalError, { command: "ai-director", details: [`Model: ${active.id}`] });
  if (!["AI_PROVIDER_TIMEOUT", "AI_PROVIDER_RATE_LIMITED", "AI_PROVIDER_QUOTA_EXHAUSTED", "AI_PROVIDER_UNAVAILABLE", "AI_PROVIDER_REQUEST_FAILED"].includes(original.code)) {
    return null;
  }
  const fallbacks = fallbackModelsFor(active)
    .sort((a, b) => Number(a.provider === active.provider) - Number(b.provider === active.provider))
    .slice(0, 4);
  for (const model of fallbacks) {
    try {
      const result = await chat(messages, { model: model.id, timeoutMs: 18000, maxTokens: 900, temperature: 0.2 });
      return { ...result, originalModel: active.id };
    } catch {
      continue;
    }
  }
  return null;
}
