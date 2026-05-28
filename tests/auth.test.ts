import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { chdir, cwd, env } from "process";
import {
  clearStoredProviderKeys,
  getStoredProviderKey,
  maskApiKey,
  removeStoredProviderKey,
  secretsPath,
  setStoredProviderKey,
} from "../src/auth/secrets.js";
import { getProviderEnvValue, getProviderKeySource } from "../src/ai/models.js";
import { runNonTUICommand } from "../src/commands/plain/router.js";

describe("auth secrets", () => {
  const originalEnv = { ...env };
  const originalCwd = cwd();
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "p-setup-auth-test-"));
    chdir(tempDir);
    env.HOME = join(tempDir, "home");
    await mkdir(env.HOME, { recursive: true });
    for (const key of Object.keys(env)) {
      if (key.endsWith("_API_KEY") || key === "GITHUB_TOKEN" || key === "P_SETUP_AI_MODEL") delete env[key];
    }
  });

  afterEach(async () => {
    chdir(originalCwd);
    for (const key of Object.keys(env)) delete env[key];
    Object.assign(env, originalEnv);
    process.exitCode = undefined;
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("stores provider API keys globally with restrictive file permissions", async () => {
    await setStoredProviderKey("github", "ghp_example_secret_1234567890");

    expect(await getStoredProviderKey("github")).toBe("ghp_example_secret_1234567890");
    expect(getProviderEnvValue("github")).toBe("ghp_example_secret_1234567890");
    expect(getProviderKeySource("github")).toBe("global-auth");
    expect((await stat(secretsPath())).mode & 0o777).toBe(0o600);
  });

  it("masks keys without exposing the raw value", () => {
    const masked = maskApiKey("ghp_example_secret_1234567890");

    expect(masked).toContain("ghp_");
    expect(masked).toContain("7890");
    expect(masked).not.toContain("example_secret");
  });

  it("removes and resets stored keys", async () => {
    await setStoredProviderKey("minimax", "mini-secret");
    expect(await removeStoredProviderKey("minimax")).toBe(true);
    expect(await getStoredProviderKey("minimax")).toBeUndefined();

    await setStoredProviderKey("github", "ghp_secret");
    await clearStoredProviderKeys();
    expect(await getStoredProviderKey("github")).toBeUndefined();
  });

  it("migrates provider keys from project .env into global auth and removes them from .env", async () => {
    await writeFile(join(tempDir, ".env"), [
      "GITHUB_MODELS_API_KEY=ghp_secret_value",
      "MOONSHOT_API_KEY=moonshot_secret_value",
      "DATABASE_URL=postgres://localhost/app",
      "",
    ].join("\n"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runNonTUICommand("auth", "migrate", tempDir, { force: true, args: [] });

    expect(await getStoredProviderKey("github")).toBe("ghp_secret_value");
    expect(await getStoredProviderKey("moonshot")).toBe("moonshot_secret_value");
    const envFile = await readFile(join(tempDir, ".env"), "utf-8");
    expect(envFile).toContain("DATABASE_URL=postgres://localhost/app");
    expect(envFile).not.toContain("GITHUB_MODELS_API_KEY");
    expect(envFile).not.toContain("MOONSHOT_API_KEY");
  });

  it("stops on invalid secrets files instead of pretending keys are missing", async () => {
    await mkdir(join(env.HOME!, ".p-setup"), { recursive: true });
    await writeFile(secretsPath(), "{broken");
    await chmod(secretsPath(), 0o600);

    await expect(getStoredProviderKey("github")).rejects.toMatchObject({ code: "AUTH_STORAGE_INVALID" });
  });
});
