import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { env } from "process";
import { runPlainMode } from "../src/cli/plain.js";

describe("doctor fix workflow", () => {
  const originalEnv = { ...env };
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "setupr-doctor-fix-"));
    env.HOME = join(tempDir, "home");
    await mkdir(env.HOME, { recursive: true });
    await writeFile(join(tempDir, "package.json"), JSON.stringify({
      name: "doctor-fix-fixture",
      scripts: { dev: "vite" },
      dependencies: { vite: "^5.0.0" },
    }));
    await writeFile(join(tempDir, ".env.example"), "PUBLIC_PORT=3000\n");
  });

  afterEach(async () => {
    for (const key of Object.keys(env)) delete env[key];
    Object.assign(env, originalEnv);
    await rm(tempDir, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it("previews safe fixes unless explicitly confirmed", async () => {
    const log = console.log;
    const outputs: string[] = [];
    console.log = (...args: unknown[]) => outputs.push(args.join(" "));
    try {
      await runPlainMode("doctor", tempDir, undefined, { fix: true });
    } finally {
      console.log = log;
    }

    expect(outputs.join("\n")).toContain("Safe fixes are available");
    expect(outputs.join("\n")).toContain("setupr env init");
    expect(existsSync(join(tempDir, ".env"))).toBe(false);
  });
});
