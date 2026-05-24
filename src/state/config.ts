import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

const CONFIG_DIR = join(process.env.HOME || "~", ".p-setup");
const CONFIG_FILE = "config.json";

export interface UserConfig {
  ai: {
    apiKey?: string;
    model?: string;
    enabled: boolean;
  };
  preferences: {
    theme: "dark" | "light";
    confirmBeforeInstall: boolean;
    autoUpdate: boolean;
    telemetry: boolean;
  };
  remembered: Record<string, string>; // "don't ask again" answers
}

const DEFAULT_CONFIG: UserConfig = {
  ai: { enabled: true },
  preferences: {
    theme: "dark",
    confirmBeforeInstall: true,
    autoUpdate: false,
    telemetry: false,
  },
  remembered: {},
};

export async function loadConfig(): Promise<UserConfig> {
  try {
    const raw = await readFile(join(CONFIG_DIR, CONFIG_FILE), "utf-8");
    const parsed = JSON.parse(raw);
    return {
      ai: { ...DEFAULT_CONFIG.ai, ...(parsed.ai || {}) },
      preferences: { ...DEFAULT_CONFIG.preferences, ...(parsed.preferences || {}) },
      remembered: { ...DEFAULT_CONFIG.remembered, ...(parsed.remembered || {}) },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: UserConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(join(CONFIG_DIR, CONFIG_FILE), JSON.stringify(config, null, 2));
}

export async function updateConfig(updates: Partial<UserConfig>): Promise<UserConfig> {
  const current = await loadConfig();
  const merged: UserConfig = {
    ai: { ...current.ai, ...(updates.ai || {}) },
    preferences: { ...current.preferences, ...(updates.preferences || {}) },
    remembered: { ...current.remembered, ...(updates.remembered || {}) },
  };
  await saveConfig(merged);
  return merged;
}

export async function rememberChoice(key: string, value: string): Promise<void> {
  const config = await loadConfig();
  config.remembered[key] = value;
  await saveConfig(config);
}

export async function getRememberedChoice(key: string): Promise<string | null> {
  const config = await loadConfig();
  return config.remembered[key] || null;
}
