import OpenAI from "openai";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return null;

  const baseURL = process.env.AI_BASE_URL || "https://api.openai.com/v1";
  client = new OpenAI({ apiKey, baseURL });
  return client;
}

export function hasAIKey(): boolean {
  return !!process.env.AI_API_KEY;
}

export async function chatCompletion(
  messages: ChatMessage[],
  options?: { model?: string; maxTokens?: number }
): Promise<string> {
  const ai = getClient();
  if (!ai) {
    return fallbackResponse(messages);
  }

  const model = options?.model || process.env.AI_MODEL || "gpt-4o-mini";

  try {
    const response = await ai.chat.completions.create({
      model,
      messages,
      max_tokens: options?.maxTokens || 1024,
      temperature: 0.3,
    });
    return response.choices[0]?.message?.content || "";
  } catch (err: any) {
    return `[AI Error: ${err.message}]`;
  }
}

function fallbackResponse(messages: ChatMessage[]): string {
  const lastUser = messages.filter((m) => m.role === "user").pop();
  if (!lastUser) return "Ready to help with your project setup.";

  const content = lastUser.content.toLowerCase();
  if (content.includes("scan") || content.includes("detect")) {
    return "I'll analyze the project structure and detect the stack configuration.";
  }
  if (content.includes("install") || content.includes("setup")) {
    return "I'll proceed with installing dependencies and configuring the environment.";
  }
  return "I understand. Let me help you with that.";
}
