import OpenAI from "openai";
import {
  PROVIDERS,
  getDefaultModel,
  getModelById,
  type AIModel,
  type AIProvider,
} from "./models.js";

const clients = new Map<AIProvider, OpenAI>();

function getClientForProvider(provider: AIProvider): OpenAI | null {
  if (clients.has(provider)) return clients.get(provider)!;

  const config = PROVIDERS[provider];
  const apiKey = process.env[config.envKey];

  if (!apiKey) return null;

  const client = new OpenAI({
    apiKey,
    baseURL: config.baseURL,
  });

  clients.set(provider, client);
  return client;
}

export function hasAIKey(): boolean {
  const model = getDefaultModel();
  const config = PROVIDERS[model.provider];
  return !!process.env[config.envKey];
}

export function getModel(): string {
  return getDefaultModel().id;
}

export function getActiveModel(): AIModel {
  return getDefaultModel();
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  stream?: boolean;
}

export async function chat(
  messages: ChatMessage[],
  options?: ChatOptions
): Promise<{ content: string; tokens: number; model: string }> {
  const modelId = options?.model || getModel();
  const model = getModelById(modelId) || getDefaultModel();
  const client = getClientForProvider(model.provider);

  if (!client) {
    const config = PROVIDERS[model.provider];
    throw new Error(
      `No API key for ${model.provider}. Set ${config.envKey} in your environment.`
    );
  }

  if (model.provider === "anthropic") {
    return chatAnthropic(model, messages, options);
  }

  if (model.provider === "google") {
    return chatGoogle(model, messages, options);
  }

  // OpenAI, Groq, MiniMax, Moonshot — all OpenAI-compatible
  return chatOpenAICompatible(client, model, messages, options);
}

async function chatOpenAICompatible(
  client: OpenAI,
  model: AIModel,
  messages: ChatMessage[],
  options?: ChatOptions
): Promise<{ content: string; tokens: number; model: string }> {
  const response = await client.chat.completions.create({
    model: model.id,
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 2048,
  });

  const choice = response.choices[0];
  const usage = response.usage;

  return {
    content: choice?.message?.content || "",
    tokens: (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0),
    model: model.id,
  };
}

async function chatAnthropic(
  model: AIModel,
  messages: ChatMessage[],
  options?: ChatOptions
): Promise<{ content: string; tokens: number; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const systemMsg = messages.find((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  const body: any = {
    model: model.id,
    max_tokens: options?.maxTokens ?? 2048,
    messages: nonSystemMessages.map((m) => ({ role: m.role, content: m.content })),
  };

  if (systemMsg) {
    body.system = systemMsg.content;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${err}`);
  }

  const data = await response.json() as any;
  const content = data.content?.[0]?.text || "";
  const inputTokens = data.usage?.input_tokens || 0;
  const outputTokens = data.usage?.output_tokens || 0;

  return { content, tokens: inputTokens + outputTokens, model: model.id };
}

async function chatGoogle(
  model: AIModel,
  messages: ChatMessage[],
  options?: ChatOptions
): Promise<{ content: string; tokens: number; model: string }> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY not set");

  const systemMsg = messages.find((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  const contents = nonSystemMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body: any = { contents };
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }
  body.generationConfig = {
    temperature: options?.temperature ?? 0.3,
    maxOutputTokens: options?.maxTokens ?? 2048,
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google AI error: ${response.status} ${err}`);
  }

  const data = await response.json() as any;
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const totalTokens = data.usageMetadata?.totalTokenCount || 0;

  return { content, tokens: totalTokens, model: model.id };
}

export function listConfiguredProviders(): AIProvider[] {
  const configured: AIProvider[] = [];
  for (const [provider, config] of Object.entries(PROVIDERS)) {
    if (process.env[config.envKey]) {
      configured.push(provider as AIProvider);
    }
  }
  return configured;
}
