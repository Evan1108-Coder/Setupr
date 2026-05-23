import { chatCompletion, hasAIKey, type ChatMessage } from "./aiClient.js";
import { contextToDSL, type ProjectContext } from "../context/contextCollector.js";

export type IntelligenceLevel = "pattern" | "cached" | "live";
export type IntelligenceResult = {
  response: string;
  level: IntelligenceLevel;
  cost: number;
};

const responseCache = new Map<string, string>();

type PatternRule = {
  match: (query: string, ctx?: ProjectContext) => boolean;
  respond: (query: string, ctx?: ProjectContext) => string;
};

const PATTERN_RULES: PatternRule[] = [
  {
    match: (q) => /what (is|are) (the |my )?dep/i.test(q),
    respond: (_, ctx) => {
      if (!ctx?.scan) return "No project scanned yet.";
      return `Your project has ${ctx.scan.dependencies} dependencies managed by ${ctx.scan.packageManager || "unknown PM"}.`;
    },
  },
  {
    match: (q) => /what (framework|stack|language)/i.test(q),
    respond: (_, ctx) => {
      if (!ctx?.scan) return "No project scanned yet.";
      return `Detected: ${ctx.scan.language || "unknown"} project${ctx.scan.framework ? ` using ${ctx.scan.framework}` : ""}. Package manager: ${ctx.scan.packageManager || "unknown"}.`;
    },
  },
  {
    match: (q) => /missing.*env|env.*missing/i.test(q),
    respond: (_, ctx) => {
      if (!ctx) return "No context available.";
      if (ctx.envVars.missing.length === 0) return "All required environment variables are set.";
      return `Missing env vars: ${ctx.envVars.missing.join(", ")}. These are defined in .env.example but not in .env.`;
    },
  },
  {
    match: (q) => /how (to|do I) (start|run|dev)/i.test(q),
    respond: (_, ctx) => {
      if (!ctx?.scan?.scripts) return "I don't see any scripts defined.";
      const scripts = ctx.scan.scripts;
      if (scripts.dev) return `Run: ${ctx.scan.packageManager || "npm"} run dev`;
      if (scripts.start) return `Run: ${ctx.scan.packageManager || "npm"} run start`;
      return "No dev or start script found. Check package.json scripts.";
    },
  },
  {
    match: (q) => /monorepo|workspace/i.test(q),
    respond: (_, ctx) => {
      if (!ctx?.monorepo?.detected) return "This doesn't appear to be a monorepo.";
      return `Monorepo detected: ${ctx.monorepo.type}${ctx.monorepo.packages ? ` with packages: ${ctx.monorepo.packages.join(", ")}` : ""}.`;
    },
  },
  {
    match: (q) => /git|branch|commit/i.test(q),
    respond: (_, ctx) => {
      if (!ctx?.git?.isRepo) return "This is not a git repository.";
      return `Git: branch=${ctx.git.branch || "unknown"}, ${ctx.git.isDirty ? "has uncommitted changes" : "clean working tree"}.`;
    },
  },
];

function getCacheKey(query: string, ctx?: ProjectContext): string {
  const ctxHash = ctx ? `${ctx.scan.language}:${ctx.scan.framework}:${ctx.scan.packageManager}` : "no-ctx";
  return `${query.toLowerCase().trim().slice(0, 100)}::${ctxHash}`;
}

function tryPatternMatch(query: string, ctx?: ProjectContext): string | null {
  for (const rule of PATTERN_RULES) {
    if (rule.match(query, ctx)) {
      return rule.respond(query, ctx);
    }
  }
  return null;
}

function tryCache(query: string, ctx?: ProjectContext): string | null {
  const key = getCacheKey(query, ctx);
  return responseCache.get(key) || null;
}

async function liveAI(
  messages: ChatMessage[],
  ctx?: ProjectContext
): Promise<string> {
  const contextMsg: ChatMessage[] = [];
  if (ctx) {
    contextMsg.push({
      role: "system",
      content: `Project context (compressed DSL): ${contextToDSL(ctx)}\nFull file tree: ${ctx.fileTree.slice(0, 50).join(", ")}`,
    });
  }
  return chatCompletion([...contextMsg, ...messages]);
}

export async function intelligentResponse(
  query: string,
  messages: ChatMessage[],
  ctx?: ProjectContext
): Promise<IntelligenceResult> {
  // Level 0: Pattern matching (free, instant)
  const patternResult = tryPatternMatch(query, ctx);
  if (patternResult) {
    return { response: patternResult, level: "pattern", cost: 0 };
  }

  // Level 1: Cache hit (free, instant)
  const cachedResult = tryCache(query, ctx);
  if (cachedResult) {
    return { response: cachedResult, level: "cached", cost: 0 };
  }

  // Level 2: Live AI call (costs tokens)
  if (!hasAIKey()) {
    return {
      response: "No AI_API_KEY configured. Operating in offline mode with pattern matching only.",
      level: "pattern",
      cost: 0,
    };
  }

  const response = await liveAI(messages, ctx);
  const key = getCacheKey(query, ctx);
  responseCache.set(key, response);

  const estimatedTokens = (messages.reduce((a, m) => a + m.content.length, 0) + response.length) / 4;
  const estimatedCost = estimatedTokens * 0.000001;

  return { response, level: "live", cost: estimatedCost };
}

export function getIntelligenceStats() {
  return {
    cacheSize: responseCache.size,
    patternRulesCount: PATTERN_RULES.length,
  };
}
