import { readFileSync } from "fs";
import { join } from "path";
import { getStoredProviderKeySync } from "../auth/secrets.js";

export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
  maxTokens: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  pricingKnown?: boolean;
  supportsStreaming: boolean;
  upstreamId?: string;
}

export interface ModelSelection {
  model: AIModel;
  source: "configured" | "cheapest-known" | "only-available" | "fallback";
  reason: string;
  price: string;
}

export type AIProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "groq"
  | "minimax"
  | "moonshot"
  | "github";

export interface ProviderConfig {
  provider: AIProvider;
  baseURL: string;
  envKey: string;
  envAliases?: string[];
  headerFormat: "bearer" | "x-api-key";
}

export const PROVIDERS: Record<AIProvider, ProviderConfig> = {
  openai: {
    provider: "openai",
    baseURL: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
    headerFormat: "bearer",
  },
  anthropic: {
    provider: "anthropic",
    baseURL: "https://api.anthropic.com/v1",
    envKey: "ANTHROPIC_API_KEY",
    headerFormat: "x-api-key",
  },
  google: {
    provider: "google",
    baseURL: "https://generativelanguage.googleapis.com/v1beta",
    envKey: "GOOGLE_API_KEY",
    headerFormat: "bearer",
  },
  groq: {
    provider: "groq",
    baseURL: "https://api.groq.com/openai/v1",
    envKey: "GROQ_API_KEY",
    headerFormat: "bearer",
  },
  minimax: {
    provider: "minimax",
    baseURL: "https://api.minimaxi.chat/v1",
    envKey: "MINIMAX_API_KEY",
    headerFormat: "bearer",
  },
  moonshot: {
    provider: "moonshot",
    baseURL: "https://api.moonshot.cn/v1",
    envKey: "MOONSHOT_API_KEY",
    headerFormat: "bearer",
  },
  github: {
    provider: "github",
    baseURL: "https://models.github.ai/inference",
    envKey: "GITHUB_MODELS_API_KEY",
    envAliases: ["GITHUB_TOKEN", "GITHUB_API_KEY"],
    headerFormat: "bearer",
  },
};

export const MODELS: AIModel[] = [
  // OpenAI
  { id: "gpt-5.5-pro", name: "GPT-5.5 Pro", provider: "openai", maxTokens: 200000, costPer1kInput: 0.01, costPer1kOutput: 0.03, supportsStreaming: true },
  { id: "gpt-5.5", name: "GPT-5.5", provider: "openai", maxTokens: 200000, costPer1kInput: 0.005, costPer1kOutput: 0.015, supportsStreaming: true },
  { id: "gpt-5.5-mini", name: "GPT-5.5 Mini", provider: "openai", maxTokens: 200000, costPer1kInput: 0.001, costPer1kOutput: 0.003, supportsStreaming: true },
  { id: "gpt-5.4-pro", name: "GPT-5.4 Pro", provider: "openai", maxTokens: 200000, costPer1kInput: 0.01, costPer1kOutput: 0.03, supportsStreaming: true },
  { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", provider: "openai", maxTokens: 200000, costPer1kInput: 0.001, costPer1kOutput: 0.003, supportsStreaming: true },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", maxTokens: 128000, costPer1kInput: 0.005, costPer1kOutput: 0.015, supportsStreaming: true },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", maxTokens: 128000, costPer1kInput: 0.00015, costPer1kOutput: 0.0006, supportsStreaming: true },

  // Anthropic
  { id: "claude-opus-4-7", name: "Claude Opus 4.7", provider: "anthropic", maxTokens: 200000, costPer1kInput: 0.015, costPer1kOutput: 0.075, supportsStreaming: true },
  { id: "claude-sonnet-4-7", name: "Claude Sonnet 4.7", provider: "anthropic", maxTokens: 200000, costPer1kInput: 0.003, costPer1kOutput: 0.015, supportsStreaming: true },
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", provider: "anthropic", maxTokens: 200000, costPer1kInput: 0.015, costPer1kOutput: 0.075, supportsStreaming: true },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "anthropic", maxTokens: 200000, costPer1kInput: 0.003, costPer1kOutput: 0.015, supportsStreaming: true },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", provider: "anthropic", maxTokens: 200000, costPer1kInput: 0.0008, costPer1kOutput: 0.004, supportsStreaming: true },
  { id: "claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "anthropic", maxTokens: 200000, costPer1kInput: 0.003, costPer1kOutput: 0.015, supportsStreaming: true },

  // Google
  { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", provider: "google", maxTokens: 2000000, costPer1kInput: 0.00125, costPer1kOutput: 0.005, supportsStreaming: true },
  { id: "gemini-3-flash", name: "Gemini 3 Flash", provider: "google", maxTokens: 1000000, costPer1kInput: 0.0001, costPer1kOutput: 0.0004, supportsStreaming: true },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", provider: "google", maxTokens: 1000000, costPer1kInput: 0.00005, costPer1kOutput: 0.0002, supportsStreaming: true },

  // Groq (Llama)
  { id: "llama-4-maverick", name: "Llama 4 Maverick", provider: "groq", maxTokens: 128000, costPer1kInput: 0.0005, costPer1kOutput: 0.001, supportsStreaming: true },
  { id: "llama-4-scout", name: "Llama 4 Scout", provider: "groq", maxTokens: 128000, costPer1kInput: 0.0003, costPer1kOutput: 0.0006, supportsStreaming: true },
  { id: "llama-3.3-70b", name: "Llama 3.3 70B", provider: "groq", maxTokens: 128000, costPer1kInput: 0.00059, costPer1kOutput: 0.00079, supportsStreaming: true },

  // MiniMax
  { id: "minimax-m3", name: "MiniMax M3", provider: "minimax", maxTokens: 1000000, costPer1kInput: 0.001, costPer1kOutput: 0.001, supportsStreaming: true, upstreamId: "MiniMax-M3" },
  { id: "minimax-m2.5", name: "MiniMax M2.5", provider: "minimax", maxTokens: 1000000, costPer1kInput: 0.001, costPer1kOutput: 0.001, supportsStreaming: true, upstreamId: "MiniMax-M2.5" },
  { id: "minimax-m2.7", name: "MiniMax M2.7", provider: "minimax", maxTokens: 1000000, costPer1kInput: 0.001, costPer1kOutput: 0.001, supportsStreaming: true, upstreamId: "MiniMax-M2.7" },

  // Moonshot (Kimi)
  { id: "kimi-latest", name: "Kimi Latest", provider: "moonshot", maxTokens: 128000, costPer1kInput: 0.001, costPer1kOutput: 0.002, supportsStreaming: true },
  { id: "kimi-k2-thinking", name: "Kimi K2 Thinking", provider: "moonshot", maxTokens: 128000, costPer1kInput: 0.002, costPer1kOutput: 0.004, supportsStreaming: true },
  { id: "kimi-k2-turbo-preview", name: "Kimi K2 Turbo Preview", provider: "moonshot", maxTokens: 128000, costPer1kInput: 0.0008, costPer1kOutput: 0.0016, supportsStreaming: true },
  { id: "kimi-k2.5-vision", name: "Kimi K2.5 Vision", provider: "moonshot", maxTokens: 128000, costPer1kInput: 0.0015, costPer1kOutput: 0.003, supportsStreaming: true },
  { id: "moonshot-v1-128k", name: "Moonshot V1 128K", provider: "moonshot", maxTokens: 128000, costPer1kInput: 0.001, costPer1kOutput: 0.002, supportsStreaming: true },

  // GitHub Models. GitHub model IDs use publisher/model-name form.
  { id: "openai/gpt-4.1", name: "GitHub Models: GPT-4.1", provider: "github", maxTokens: 128000, costPer1kInput: 0, costPer1kOutput: 0, pricingKnown: false, supportsStreaming: true },
  { id: "openai/gpt-4.1-mini", name: "GitHub Models: GPT-4.1 Mini", provider: "github", maxTokens: 128000, costPer1kInput: 0, costPer1kOutput: 0, pricingKnown: false, supportsStreaming: true },
  { id: "openai/gpt-4o", name: "GitHub Models: GPT-4o", provider: "github", maxTokens: 128000, costPer1kInput: 0, costPer1kOutput: 0, pricingKnown: false, supportsStreaming: true },
  { id: "openai/gpt-4o-mini", name: "GitHub Models: GPT-4o Mini", provider: "github", maxTokens: 128000, costPer1kInput: 0, costPer1kOutput: 0, pricingKnown: false, supportsStreaming: true },
];

export function getModelById(id: string): AIModel | undefined {
  return MODELS.find((m) => m.id === id);
}

export function resolveModel(id: string): AIModel | undefined {
  return getModelById(id) || createGitHubCatalogModel(id);
}

export function getModelsByProvider(provider: AIProvider): AIModel[] {
  return MODELS.filter((m) => m.provider === provider);
}

export function getAvailableModels(): AIModel[] {
  return MODELS.filter((m) => {
    return !!getProviderEnvValue(m.provider);
  });
}

export function getDefaultModel(): AIModel {
  return selectDefaultModel().model;
}

export function selectDefaultModel(): ModelSelection {
  const configured = getConfiguredModelId();
  if (configured) {
    const model = resolveModel(configured);
    if (model) {
      return {
        model,
        source: "configured",
        reason: "selected by SETUPR_AI_MODEL or saved config",
        price: formatModelPrice(model),
      };
    }
  }

  const available = getAvailableModels();
  if (available.length === 0) {
    const model = MODELS.find((m) => m.id === "minimax-m2.7")!;
    return {
      model,
      source: "fallback",
      reason: "no configured AI provider key was found",
      price: formatModelPrice(model),
    };
  }

  const cheapest = getCheapestKnownPricedModel(available);
  if (cheapest) {
    return {
      model: cheapest,
      source: "cheapest-known",
      reason: "auto-selected as the cheapest configured model with known pricing",
      price: formatModelPrice(cheapest),
    };
  }

  const preferred = ["openai/gpt-4.1-mini", "openai/gpt-4o-mini", "openai/gpt-4.1", "openai/gpt-4o"];
  for (const pref of preferred) {
    const model = available.find((m) => m.id === pref);
    if (model) {
      return {
        model,
        source: "only-available",
        reason: "only configured providers have unknown/catalog pricing",
        price: formatModelPrice(model),
      };
    }
  }
  return {
    model: available[0],
    source: "only-available",
    reason: "only configured providers have unknown/catalog pricing",
    price: formatModelPrice(available[0]),
  };
}

export function describeDefaultModelSelection(): string {
  const selection = selectDefaultModel();
  return `${selection.model.id} via ${selection.model.provider} (${selection.reason}, ${selection.price})`;
}

export function formatModelPrice(model: AIModel): string {
  if (!isKnownPriced(model)) return "pricing unknown";
  return `$${model.costPer1kInput}/1K input, $${model.costPer1kOutput}/1K output`;
}

export function isModelAvailable(model: AIModel): boolean {
  return !!getProviderEnvValue(model.provider);
}

export function isKnownPricedModel(model: AIModel): boolean {
  return isKnownPriced(model);
}

export function estimateModelWeightedCost(model: AIModel): number | null {
  return isKnownPriced(model) ? estimatedModelCost(model) : null;
}

export function getAIEnvValue(key: string): string | undefined {
  const direct = process.env[key];
  if (direct?.trim()) return direct.trim();

  const stored = getStoredKeyForEnvName(key);
  if (stored?.trim()) return stored.trim();

  const fromLocal = readEnvValue(join(process.cwd(), ".env.local"), key);
  if (fromLocal?.trim()) return fromLocal.trim();

  const fromEnv = readEnvValue(join(process.cwd(), ".env"), key);
  if (fromEnv?.trim()) return fromEnv.trim();

  return undefined;
}

export function getProviderEnvValue(provider: AIProvider): string | undefined {
  const config = PROVIDERS[provider];
  return getAIEnvValue(config.envKey) || config.envAliases?.map(getAIEnvValue).find(Boolean);
}

export function getProviderKeySource(provider: AIProvider): "environment" | "global-auth" | "project-env" | null {
  const config = PROVIDERS[provider];
  const keys = [config.envKey, ...(config.envAliases || [])];
  if (keys.some((key) => process.env[key]?.trim())) return "environment";
  if (getStoredProviderKeySync(provider)) return "global-auth";
  if (keys.some((key) => readEnvValue(join(process.cwd(), ".env.local"), key)?.trim())) return "project-env";
  if (keys.some((key) => readEnvValue(join(process.cwd(), ".env"), key)?.trim())) return "project-env";
  return null;
}

function getConfiguredModelId(): string | undefined {
  // SETUPR_AI_MODEL is the canonical override. P_SETUP_AI_MODEL is kept as a
  // backward-compatible alias for setups configured before the Setupr rename.
  return getAIEnvValue("SETUPR_AI_MODEL") || getAIEnvValue("P_SETUP_AI_MODEL") || readSavedModelId();
}

function readSavedModelId(): string | undefined {
  const home = process.env.HOME;
  if (!home) return undefined;

  try {
    const raw = readFileSync(join(home, ".setupr", "config.json"), "utf-8");
    const config = JSON.parse(raw) as { ai?: { model?: string } };
    return config.ai?.model;
  } catch {
    return undefined;
  }
}

function readEnvValue(path: string, key: string): string | undefined {
  try {
    const content = readFileSync(path, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex <= 0) continue;
      const envKey = trimmed.slice(0, eqIndex).trim().replace(/^export\s+/, "");
      if (envKey !== key) continue;
      return stripQuotes(trimmed.slice(eqIndex + 1).trim());
    }
  } catch {}
  return undefined;
}

function getStoredKeyForEnvName(key: string): string | undefined {
  for (const config of Object.values(PROVIDERS)) {
    if (config.envKey === key || config.envAliases?.includes(key)) {
      return getStoredProviderKeySync(config.provider);
    }
  }
  return undefined;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function createGitHubCatalogModel(id: string): AIModel | undefined {
  if (!id.includes("/") || !getProviderEnvValue("github")) return undefined;
  return {
    id,
    name: `GitHub Models: ${id}`,
    provider: "github",
    maxTokens: 128000,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    pricingKnown: false,
    supportsStreaming: true,
  };
}

function getCheapestKnownPricedModel(models: AIModel[]): AIModel | undefined {
  const priced = models.filter(isKnownPriced);
  if (priced.length === 0) return undefined;
  return [...priced].sort((a, b) => estimatedModelCost(a) - estimatedModelCost(b))[0];
}

function estimatedModelCost(model: AIModel): number {
  // Setup-agent chats usually produce more output than input per request.
  return model.costPer1kInput + model.costPer1kOutput * 3;
}

function isKnownPriced(model: AIModel): boolean {
  return model.pricingKnown !== false && Number.isFinite(model.costPer1kInput) && Number.isFinite(model.costPer1kOutput);
}
