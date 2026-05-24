export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
  maxTokens: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  supportsStreaming: boolean;
}

export type AIProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "groq"
  | "minimax"
  | "moonshot";

export interface ProviderConfig {
  provider: AIProvider;
  baseURL: string;
  envKey: string;
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
};

export const MODELS: AIModel[] = [
  // OpenAI
  { id: "gpt-5.4-pro", name: "GPT-5.4 Pro", provider: "openai", maxTokens: 200000, costPer1kInput: 0.01, costPer1kOutput: 0.03, supportsStreaming: true },
  { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", provider: "openai", maxTokens: 200000, costPer1kInput: 0.001, costPer1kOutput: 0.003, supportsStreaming: true },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", maxTokens: 128000, costPer1kInput: 0.005, costPer1kOutput: 0.015, supportsStreaming: true },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", maxTokens: 128000, costPer1kInput: 0.00015, costPer1kOutput: 0.0006, supportsStreaming: true },

  // Anthropic
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
  { id: "minimax-m2.7", name: "MiniMax M2.7", provider: "minimax", maxTokens: 1000000, costPer1kInput: 0.001, costPer1kOutput: 0.001, supportsStreaming: true },
  { id: "minimax-m2.5-lightning", name: "MiniMax M2.5 Lightning", provider: "minimax", maxTokens: 1000000, costPer1kInput: 0.0005, costPer1kOutput: 0.0005, supportsStreaming: true },

  // Moonshot (Kimi)
  { id: "kimi-latest", name: "Kimi Latest", provider: "moonshot", maxTokens: 128000, costPer1kInput: 0.001, costPer1kOutput: 0.002, supportsStreaming: true },
  { id: "kimi-k2-thinking", name: "Kimi K2 Thinking", provider: "moonshot", maxTokens: 128000, costPer1kInput: 0.002, costPer1kOutput: 0.004, supportsStreaming: true },
  { id: "kimi-k2-turbo-preview", name: "Kimi K2 Turbo Preview", provider: "moonshot", maxTokens: 128000, costPer1kInput: 0.0008, costPer1kOutput: 0.0016, supportsStreaming: true },
  { id: "kimi-k2.5-vision", name: "Kimi K2.5 Vision", provider: "moonshot", maxTokens: 128000, costPer1kInput: 0.0015, costPer1kOutput: 0.003, supportsStreaming: true },
  { id: "moonshot-v1-128k", name: "Moonshot V1 128K", provider: "moonshot", maxTokens: 128000, costPer1kInput: 0.001, costPer1kOutput: 0.002, supportsStreaming: true },
];

export function getModelById(id: string): AIModel | undefined {
  return MODELS.find((m) => m.id === id);
}

export function getModelsByProvider(provider: AIProvider): AIModel[] {
  return MODELS.filter((m) => m.provider === provider);
}

export function getAvailableModels(): AIModel[] {
  return MODELS.filter((m) => {
    const config = PROVIDERS[m.provider];
    return !!process.env[config.envKey];
  });
}

export function getDefaultModel(): AIModel {
  const configured = process.env.P_SETUP_AI_MODEL;
  if (configured) {
    const model = getModelById(configured);
    if (model) return model;
  }

  const available = getAvailableModels();
  if (available.length === 0) {
    return MODELS.find((m) => m.id === "minimax-m2.7")!;
  }

  const preferred = ["kimi-k2-turbo-preview", "gpt-4o-mini", "gemini-3-flash", "llama-3.3-70b", "minimax-m2.5-lightning"];
  for (const pref of preferred) {
    const model = available.find((m) => m.id === pref);
    if (model) return model;
  }

  return available[0];
}
