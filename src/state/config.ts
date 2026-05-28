import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

const CONFIG_FILE = "config.json";

export interface AIConfig {
  apiKey?: string;
  model?: string;
  enabled: boolean;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  rateLimitPerMinute: number;
}

export interface PluginEntry {
  name: string;
  version: string;
  enabled: boolean;
  source: string;
}

export interface UserConfig {
  ai: AIConfig;
  preferences: {
    theme: "dark" | "light";
    confirmBeforeInstall: boolean;
    autoUpdate: boolean;
    telemetry: boolean;
    defaultBranch: string;
    commitConvention: "conventional" | "angular" | "none";
    ciPlatform: "github" | "gitlab" | "bitbucket" | "circleci" | "auto";
  };
  plugins: PluginEntry[];
  telemetryId?: string;
  lastUpdateCheck?: number;
  remembered: Record<string, string>;
}

const DEFAULT_CONFIG: UserConfig = {
  ai: {
    enabled: true,
    timeoutMs: 30000,
    maxRetries: 3,
    retryDelayMs: 1000,
    rateLimitPerMinute: 20,
  },
  preferences: {
    theme: "dark",
    confirmBeforeInstall: true,
    autoUpdate: false,
    telemetry: false,
    defaultBranch: "main",
    commitConvention: "conventional",
    ciPlatform: "auto",
  },
  plugins: [],
  remembered: {},
};

export async function loadConfig(): Promise<UserConfig> {
  try {
    const raw = await readFile(configPath(), "utf-8");
    const parsed = JSON.parse(raw);
    return {
      ai: { ...DEFAULT_CONFIG.ai, ...(parsed.ai || {}) },
      preferences: { ...DEFAULT_CONFIG.preferences, ...(parsed.preferences || {}) },
      plugins: Array.isArray(parsed.plugins) ? parsed.plugins : DEFAULT_CONFIG.plugins,
      telemetryId: parsed.telemetryId,
      lastUpdateCheck: parsed.lastUpdateCheck,
      remembered: { ...DEFAULT_CONFIG.remembered, ...(parsed.remembered || {}) },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config: UserConfig): Promise<void> {
  await mkdir(configDir(), { recursive: true });
  await writeFile(configPath(), JSON.stringify(config, null, 2));
}

export type UserConfigUpdates = {
  ai?: Partial<UserConfig["ai"]>;
  preferences?: Partial<UserConfig["preferences"]>;
  plugins?: PluginEntry[];
  telemetryId?: string;
  lastUpdateCheck?: number;
  remembered?: Record<string, string>;
};

export async function updateConfig(updates: UserConfigUpdates): Promise<UserConfig> {
  const current = await loadConfig();
  const merged: UserConfig = {
    ai: { ...current.ai, ...(updates.ai || {}) },
    preferences: { ...current.preferences, ...(updates.preferences || {}) },
    plugins: updates.plugins ?? current.plugins,
    telemetryId: updates.telemetryId ?? current.telemetryId,
    lastUpdateCheck: updates.lastUpdateCheck ?? current.lastUpdateCheck,
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

function configDir(): string {
  return join(process.env.HOME || homedir() || process.cwd(), ".p-setup");
}

function configPath(): string {
  return join(configDir(), CONFIG_FILE);
}
