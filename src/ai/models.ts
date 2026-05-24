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
  | "mistral"
  | "groq"
  | "deepseek"
  | "minimax"
  | "together"
  | "openrouter"
  | "local";

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
    envKey: "GOOGLE_AI_KEY",
    headerFormat: "bearer",
  },
  mistral: {
    provider: "mistral",
    baseURL: "https://api.mistral.ai/v1",
    envKey: "MISTRAL_API_KEY",
    headerFormat: "bearer",
  },
  groq: {
    provider: "groq",
    baseURL: "https://api.groq.com/openai/v1",
    envKey: "GROQ_API_KEY",
    headerFormat: "bearer",
  },
  deepseek: {
    provider: "deepseek",
    baseURL: "https://api.deepseek.com/v1",
    envKey: "DEEPSEEK_API_KEY",
    headerFormat: "bearer",
  },
  minimax: {
    provider: "minimax",
    baseURL: "https://api.minimaxi.chat/v1",
    envKey: "MINIMAX_API_KEY",
    headerFormat: "bearer",
  },
  together: {
    provider: "together",
    baseURL: "https://api.together.xyz/v1",
    envKey: "TOGETHER_API_KEY",
    headerFormat: "bearer",
  },
  openrouter: {
    provider: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    envKey: "OPENROUTER_API_KEY",
    headerFormat: "bearer",
  },
  local: {
    provider: "local",
    baseURL: "http://localhost:11434/v1",
    envKey: "OLLAMA_HOST",
    headerFormat: "bearer",
  },
};

export const MODELS: AIModel[] = [
  // OpenAI
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", maxTokens: 128000, costPer1kInput: 0.005, costPer1kOutput: 0.015, supportsStreaming: true },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", maxTokens: 128000, costPer1kInput: 0.00015, costPer1kOutput: 0.0006, supportsStreaming: true },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", provider: "openai", maxTokens: 128000, costPer1kInput: 0.01, costPer1kOutput: 0.03, supportsStreaming: true },
  { id: "o1", name: "O1", provider: "openai", maxTokens: 200000, costPer1kInput: 0.015, costPer1kOutput: 0.06, supportsStreaming: false },
  { id: "o1-mini", name: "O1 Mini", provider: "openai", maxTokens: 128000, costPer1kInput: 0.003, costPer1kOutput: 0.012, supportsStreaming: false },

  // Anthropic
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", provider: "anthropic", maxTokens: 200000, costPer1kInput: 0.015, costPer1kOutput: 0.075, supportsStreaming: true },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "anthropic", maxTokens: 200000, costPer1kInput: 0.003, costPer1kOutput: 0.015, supportsStreaming: true },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", provider: "anthropic", maxTokens: 200000, costPer1kInput: 0.0008, costPer1kOutput: 0.004, supportsStreaming: true },

  // Google
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "google", maxTokens: 1048576, costPer1kInput: 0.0001, costPer1kOutput: 0.0004, supportsStreaming: true },
  { id: "gemini-2.0-pro", name: "Gemini 2.0 Pro", provider: "google", maxTokens: 2097152, costPer1kInput: 0.00125, costPer1kOutput: 0.005, supportsStreaming: true },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", provider: "google", maxTokens: 1048576, costPer1kInput: 0.000075, costPer1kOutput: 0.0003, supportsStreaming: true },

  // Mistral
  { id: "mistral-large-latest", name: "Mistral Large", provider: "mistral", maxTokens: 128000, costPer1kInput: 0.002, costPer1kOutput: 0.006, supportsStreaming: true },
  { id: "mistral-small-latest", name: "Mistral Small", provider: "mistral", maxTokens: 128000, costPer1kInput: 0.0002, costPer1kOutput: 0.0006, supportsStreaming: true },
  { id: "codestral-latest", name: "Codestral", provider: "mistral", maxTokens: 32000, costPer1kInput: 0.0003, costPer1kOutput: 0.0009, supportsStreaming: true },

  // Groq (fast inference)
  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", provider: "groq", maxTokens: 128000, costPer1kInput: 0.00059, costPer1kOutput: 0.00079, supportsStreaming: true },
  { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", provider: "groq", maxTokens: 128000, costPer1kInput: 0.00005, costPer1kOutput: 0.00008, supportsStreaming: true },
  { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", provider: "groq", maxTokens: 32768, costPer1kInput: 0.00024, costPer1kOutput: 0.00024, supportsStreaming: true },

  // DeepSeek
  { id: "deepseek-chat", name: "DeepSeek V3", provider: "deepseek", maxTokens: 128000, costPer1kInput: 0.00014, costPer1kOutput: 0.00028, supportsStreaming: true },
  { id: "deepseek-reasoner", name: "DeepSeek R1", provider: "deepseek", maxTokens: 128000, costPer1kInput: 0.00055, costPer1kOutput: 0.0022, supportsStreaming: true },

  // Minimax
  { id: "MiniMax-Text-01", name: "MiniMax Text 01", provider: "minimax", maxTokens: 1000000, costPer1kInput: 0.001, costPer1kOutput: 0.001, supportsStreaming: true },

  // Together AI
  { id: "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo", name: "Llama 3.1 405B", provider: "together", maxTokens: 128000, costPer1kInput: 0.003, costPer1kOutput: 0.003, supportsStreaming: true },
  { id: "Qwen/Qwen2.5-72B-Instruct-Turbo", name: "Qwen 2.5 72B", provider: "together", maxTokens: 128000, costPer1kInput: 0.0012, costPer1kOutput: 0.0012, supportsStreaming: true },

  // Local (Ollama)
  { id: "llama3.2", name: "Llama 3.2 (Local)", provider: "local", maxTokens: 128000, costPer1kInput: 0, costPer1kOutput: 0, supportsStreaming: true },
  { id: "qwen2.5-coder", name: "Qwen 2.5 Coder (Local)", provider: "local", maxTokens: 32000, costPer1kInput: 0, costPer1kOutput: 0, supportsStreaming: true },
  { id: "deepseek-r1:14b", name: "DeepSeek R1 14B (Local)", provider: "local", maxTokens: 128000, costPer1kInput: 0, costPer1kOutput: 0, supportsStreaming: true },
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
    if (m.provider === "local") return true;
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
    return MODELS.find((m) => m.id === "MiniMax-Text-01")!;
  }

  const preferred = ["deepseek-chat", "gpt-4o-mini", "gemini-2.0-flash", "llama-3.3-70b-versatile", "mistral-small-latest"];
  for (const pref of preferred) {
    const model = available.find((m) => m.id === pref);
    if (model) return model;
  }

  return available[0];
}
