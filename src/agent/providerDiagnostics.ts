import { classifyAIProviderError, type SetuprError } from "../errors/index.js";
import { getAvailableModels, getProviderEnvValue, MODELS, PROVIDERS, type AIModel, type AIProvider } from "../ai/models.js";

export interface ProviderProfile {
  provider: AIProvider;
  timeoutMs: number;
  retries: number;
  fallbackModels: string[];
  retryableStatuses: number[];
}

export const PROVIDER_PROFILES: Record<AIProvider, ProviderProfile> = {
  openai: { provider: "openai", timeoutMs: 30000, retries: 2, fallbackModels: ["gpt-4o-mini", "gpt-4o"], retryableStatuses: [408, 409, 429, 500, 502, 503, 504] },
  anthropic: { provider: "anthropic", timeoutMs: 45000, retries: 2, fallbackModels: ["claude-haiku-4-5", "claude-sonnet-4-6"], retryableStatuses: [408, 429, 500, 502, 503, 504] },
  google: { provider: "google", timeoutMs: 30000, retries: 2, fallbackModels: ["gemini-2.5-flash-lite", "gemini-3-flash"], retryableStatuses: [408, 429, 500, 502, 503, 504] },
  groq: { provider: "groq", timeoutMs: 20000, retries: 2, fallbackModels: ["llama-4-scout", "llama-3.3-70b"], retryableStatuses: [408, 429, 500, 502, 503, 504] },
  minimax: { provider: "minimax", timeoutMs: 30000, retries: 2, fallbackModels: ["minimax-m2.5", "minimax-m2.7"], retryableStatuses: [408, 429, 500, 502, 503, 504] },
  moonshot: { provider: "moonshot", timeoutMs: 45000, retries: 1, fallbackModels: ["kimi-k2-turbo-preview", "moonshot-v1-128k", "kimi-latest"], retryableStatuses: [408, 429, 500, 502, 503, 504] },
  github: { provider: "github", timeoutMs: 30000, retries: 2, fallbackModels: ["openai/gpt-4.1-mini", "openai/gpt-4o-mini", "openai/gpt-4.1"], retryableStatuses: [408, 429, 500, 502, 503, 504] },
};

export interface ProviderDiagnostic {
  provider: AIProvider;
  configured: boolean;
  keyNames: string[];
  profile: ProviderProfile;
  status: "ready" | "missing-key";
}

export function providerDiagnostics(): ProviderDiagnostic[] {
  return (Object.keys(PROVIDERS) as AIProvider[]).map((provider) => {
    const config = PROVIDERS[provider];
    const configured = Boolean(getProviderEnvValue(provider));
    return {
      provider,
      configured,
      keyNames: [config.envKey, ...(config.envAliases || [])],
      profile: PROVIDER_PROFILES[provider],
      status: configured ? "ready" : "missing-key",
    };
  });
}

export function classifyProviderFailure(error: unknown, context: { provider?: AIProvider; model?: string } = {}): SetuprError {
  return classifyAIProviderError(error, {
    details: [
      context.provider ? `Provider: ${context.provider}` : "",
      context.model ? `Model: ${context.model}` : "",
    ].filter(Boolean),
  });
}

export function fallbackModelsFor(model: AIModel): AIModel[] {
  const profile = PROVIDER_PROFILES[model.provider];
  const available = getAvailableModels();
  const preferred = profile.fallbackModels
    .map((id) => MODELS.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is AIModel => Boolean(candidate))
    .filter((candidate) => available.some((item) => item.id === candidate.id));
  const crossProvider = available.filter((candidate) => candidate.provider !== model.provider);
  return [...preferred, ...crossProvider].filter((candidate, index, list) => list.findIndex((item) => item.id === candidate.id) === index);
}
