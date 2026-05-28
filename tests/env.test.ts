import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { initEnvFile, parseEnvKeys, parseEnvPairs } from "../src/env/index.js";
import { runNonTUICommand } from "../src/commands/plain/router.js";

describe("Environment helpers", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "p-setup-env-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it("creates .env from .env.example", async () => {
    await writeFile(join(tempDir, ".env.example"), "API_KEY=example\n");

    const result = await initEnvFile(tempDir);

    expect(result.created).toBe(true);
    expect(result.source).toBe(".env.example");
    await expect(readFile(join(tempDir, ".env"), "utf-8")).resolves.toBe("API_KEY=example\n");
  });

  it("does not create .env without .env.example unless forced", async () => {
    const result = await initEnvFile(tempDir);

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("missing-example");
    await expect(readFile(join(tempDir, ".env"), "utf-8")).rejects.toThrow();

    const forced = await initEnvFile(tempDir, { overwrite: true });
    expect(forced.created).toBe(true);
    expect(forced.source).toBe("empty");
    await expect(readFile(join(tempDir, ".env"), "utf-8")).resolves.toContain("# Environment variables");
  });

  it("does not overwrite an existing .env unless forced", async () => {
    await writeFile(join(tempDir, ".env.example"), "API_KEY=example\n");
    await writeFile(join(tempDir, ".env"), "API_KEY=secret\n");

    const result = await initEnvFile(tempDir);

    expect(result.skipped).toBe(true);
    await expect(readFile(join(tempDir, ".env"), "utf-8")).resolves.toBe("API_KEY=secret\n");

    await initEnvFile(tempDir, { overwrite: true });
    await expect(readFile(join(tempDir, ".env"), "utf-8")).resolves.toBe("API_KEY=example\n");
  });

  it("parses export-prefixed env variables consistently", () => {
    const content = "export API_KEY=abc\nNORMAL=value\n";

    expect(parseEnvKeys(content)).toEqual(["API_KEY", "NORMAL"]);
    expect(parseEnvPairs(content)).toEqual({ API_KEY: "abc", NORMAL: "value" });
  });

  it("sync preserves export-prefixed keys while using existing values", async () => {
    await writeFile(join(tempDir, ".env.example"), "export API_KEY=\nNORMAL=example\n");
    await writeFile(join(tempDir, ".env"), "API_KEY=secret\nNORMAL=real\n");
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runNonTUICommand("env", "sync", tempDir, {});

    await expect(readFile(join(tempDir, ".env"), "utf-8")).resolves.toBe("export API_KEY=secret\nNORMAL=real\n\n");
  });

  it("env smart does not write unresolved variables in non-interactive mode", async () => {
    await writeFile(join(tempDir, ".env.example"), "API_KEY=\n");
    const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      await runNonTUICommand("env", "smart", tempDir, {});
    } finally {
      if (originalIsTTY) {
        Object.defineProperty(process.stdin, "isTTY", originalIsTTY);
      } else {
        delete (process.stdin as { isTTY?: boolean }).isTTY;
      }
    }

    expect(process.exitCode).toBe(1);
    await expect(readFile(join(tempDir, ".env"), "utf-8")).rejects.toThrow();
  });
});
