import { chmodSync, existsSync, readFileSync } from "fs";
import { chmod, mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import type { AIProvider } from "../ai/models.js";
import { createPSetupError } from "../errors/index.js";

export interface StoredProviderSecret {
  apiKey: string;
  updatedAt: string;
}

export interface AuthSecretsFile {
  version: 1;
  providers: Partial<Record<AIProvider, StoredProviderSecret>>;
}

export interface ProviderSecretInfo {
  provider: AIProvider;
  configured: boolean;
  maskedKey?: string;
  updatedAt?: string;
  source?: "global-auth";
}

const SECRET_FILE = "secrets.json";
const SECRET_FILE_MODE = 0o600;
const SECRET_DIR_MODE = 0o700;

export const AUTH_PROVIDERS: AIProvider[] = [
  "openai",
  "anthropic",
  "google",
  "groq",
  "minimax",
  "moonshot",
  "github",
];

export function authDir(): string {
  return join(process.env.HOME || homedir() || process.cwd(), ".p-setup");
}

export function secretsPath(): string {
  return join(authDir(), SECRET_FILE);
}

export function loadAuthSecretsSync(): AuthSecretsFile {
  if (!existsSync(secretsPath())) return emptySecrets();
  try {
    const parsed = JSON.parse(readFileSync(secretsPath(), "utf-8")) as Partial<AuthSecretsFile>;
    return {
      version: 1,
      providers: sanitizeProviders(parsed.providers || {}),
    };
  } catch (err) {
    throw authStorageError(err);
  }
}

export async function loadAuthSecrets(): Promise<AuthSecretsFile> {
  try {
    const parsed = JSON.parse(await readFile(secretsPath(), "utf-8")) as Partial<AuthSecretsFile>;
    return {
      version: 1,
      providers: sanitizeProviders(parsed.providers || {}),
    };
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") return emptySecrets();
    throw authStorageError(err);
  }
}

export function getStoredProviderKeySync(provider: AIProvider): string | undefined {
  const key = loadAuthSecretsSync().providers[provider]?.apiKey;
  return key?.trim() || undefined;
}

export async function getStoredProviderKey(provider: AIProvider): Promise<string | undefined> {
  const key = (await loadAuthSecrets()).providers[provider]?.apiKey;
  return key?.trim() || undefined;
}

export async function setStoredProviderKey(provider: AIProvider, apiKey: string): Promise<void> {
  const clean = apiKey.trim();
  if (!clean) throw new Error("API key cannot be empty.");
  const secrets = await loadAuthSecrets();
  secrets.providers[provider] = { apiKey: clean, updatedAt: new Date().toISOString() };
  await saveAuthSecrets(secrets);
}

export async function removeStoredProviderKey(provider: AIProvider): Promise<boolean> {
  const secrets = await loadAuthSecrets();
  const existed = Boolean(secrets.providers[provider]);
  delete secrets.providers[provider];
  await saveAuthSecrets(secrets);
  return existed;
}

export async function clearStoredProviderKeys(): Promise<void> {
  await saveAuthSecrets(emptySecrets());
}

export async function listStoredProviderKeys(): Promise<ProviderSecretInfo[]> {
  const secrets = await loadAuthSecrets();
  return AUTH_PROVIDERS.map((provider) => {
    const item = secrets.providers[provider];
    return {
      provider,
      configured: Boolean(item?.apiKey),
      maskedKey: item?.apiKey ? maskApiKey(item.apiKey) : undefined,
      updatedAt: item?.updatedAt,
      source: item?.apiKey ? "global-auth" : undefined,
    };
  });
}

export function maskApiKey(value: string): string {
  const key = value.trim();
  if (!key) return "";
  const prefixMatch = key.match(/^[A-Za-z0-9]+[_-]/);
  const prefix = prefixMatch?.[0] || "";
  const tail = key.slice(-4);
  const visiblePrefix = prefix || key.slice(0, Math.min(3, key.length));
  if (key.length <= visiblePrefix.length + 4) return `${visiblePrefix}${"*".repeat(Math.max(4, key.length - visiblePrefix.length))}`;
  return `${visiblePrefix}${"*".repeat(4)}${tail}`;
}

export function isAuthProvider(value: string): value is AIProvider {
  return AUTH_PROVIDERS.includes(value as AIProvider);
}

async function saveAuthSecrets(secrets: AuthSecretsFile): Promise<void> {
  try {
    await mkdir(authDir(), { recursive: true, mode: SECRET_DIR_MODE });
    await writeFile(secretsPath(), JSON.stringify({
      version: 1,
      providers: sanitizeProviders(secrets.providers),
    }, null, 2));
    await chmod(secretsPath(), SECRET_FILE_MODE);
  } catch (err) {
    throw createPSetupError({
      code: "AUTH_STORAGE_FAILED",
      details: [err instanceof Error ? err.message : String(err)],
    });
  }
}

function sanitizeProviders(input: Partial<Record<AIProvider, StoredProviderSecret>>): Partial<Record<AIProvider, StoredProviderSecret>> {
  const providers: Partial<Record<AIProvider, StoredProviderSecret>> = {};
  for (const provider of AUTH_PROVIDERS) {
    const item = input[provider];
    if (item?.apiKey?.trim()) {
      providers[provider] = {
        apiKey: item.apiKey.trim(),
        updatedAt: item.updatedAt || new Date(0).toISOString(),
      };
    }
  }
  return providers;
}

function emptySecrets(): AuthSecretsFile {
  return { version: 1, providers: {} };
}

export function ensureAuthFileModeSync(): void {
  if (!existsSync(secretsPath())) return;
  chmodSync(secretsPath(), SECRET_FILE_MODE);
}

function authStorageError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const code = /json|parse|unexpected|position/i.test(message)
    ? "AUTH_STORAGE_INVALID"
    : "AUTH_STORAGE_FAILED";
  return createPSetupError({
    code,
    details: [`Path: ${secretsPath()}`, message],
  });
}
