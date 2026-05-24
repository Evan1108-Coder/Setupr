import { chat, hasAIKey, type ChatMessage } from "./client.js";
import { getCached, setCache, buildCacheKey } from "./cache.js";
import type { ScanResult } from "../scanner/index.js";

export type IntelligenceLevel = "pattern" | "cached" | "live";

export interface IntelligenceResult {
  response: string;
  level: IntelligenceLevel;
  cost: number;
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
  messages?: ChatMessage[]
): Promise<IntelligenceResult> {
  // Level 0: Pattern matching (free, instant)
  for (const rule of PATTERN_RULES) {
    if (rule.match(query, scan)) {
      return { response: rule.respond(query, scan), level: "pattern", cost: 0 };
    }
  }

  // Level 1: Cache hit (free, instant)
  const cacheKey = buildCacheKey(query, contextDSL);
  const cached = await getCached(cacheKey);
  if (cached) {
    return { response: cached.response, level: "cached", cost: 0 };
  }

  // Level 2: Live AI call
  if (!hasAIKey()) {
    return {
      response: "AI features require an API key. Set one of: MINIMAX_API_KEY, MOONSHOT_API_KEY, OPENAI_API_KEY, GROQ_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY.",
      level: "pattern",
      cost: 0,
    };
  }

  const systemMsg: ChatMessage = {
    role: "system",
    content: `You are P-Setup's AI brain — an intelligent project setup assistant. Context: ${contextDSL}. Be concise, helpful, and specific to this project.`,
  };

  const userMsg: ChatMessage = { role: "user", content: query };
  const allMessages = [systemMsg, ...(messages || []), userMsg];

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
    return {
      response: `AI unavailable: ${err instanceof Error ? err.message : "unknown error"}`,
      level: "pattern",
      cost: 0,
    };
  }
}
