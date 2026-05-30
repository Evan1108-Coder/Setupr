import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { runNonTUICommand } from "../src/commands/plain/router.js";
import { collectDashboardStatus } from "../src/status/collector.js";
import { collectSecuritySummary, runSecurityCommand } from "../src/security/index.js";
import { collectVerificationSummary, runVerificationCommand } from "../src/verification/index.js";

describe("verification and security command groups", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "setupr-verify-security-"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it("runs detected tests, records project history, and writes reports", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({
      scripts: {
        test: "node -e \"console.log('unit ok')\"",
        build: "node -e \"console.log('build ok')\"",
        lint: "node -e \"console.log('lint ok')\"",
      },
      dependencies: { leftpad: "latest" },
    }, null, 2));

    const report = await runVerificationCommand(tempDir, "quick", { report: ".setupr/test.md" });

    expect(report?.status).toBe("pass");
    expect(report?.checks.some((check) => check.command?.includes("npm run test"))).toBe(true);
    await expect(readFile(join(tempDir, ".setupr", "test.md"), "utf-8")).resolves.toContain("Setupr Test Report");
    const summary = await collectVerificationSummary(tempDir);
    expect(summary.status).toContain("quick");
  });

  it("guards test clean/create writes unless explicitly confirmed", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ scripts: { test: "node -e \"console.log('ok')\"" } }));
    await writeFile(join(tempDir, "math.ts"), "export const add = (a: number, b: number) => a + b;\n");

    const preview = await runVerificationCommand(tempDir, "create", { args: ["math.ts"] });
    expect(preview?.status).toBe("warn");
    expect(existsSync(join(tempDir, "math.test.ts"))).toBe(false);

    const created = await runVerificationCommand(tempDir, "create", { args: ["math.ts"], yes: true });
    expect(created?.status).toBe("pass");
    expect(existsSync(join(tempDir, "math.test.ts"))).toBe(true);
  });

  it("marks failed verification runs with a non-zero process exit code", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ scripts: { test: "node -e \"process.exit(1)\"" } }));

    const report = await runVerificationCommand(tempDir, "run", {});

    expect(report?.status).toBe("fail");
    expect(process.exitCode).toBe(1);
  });

  it("detects defensive security findings, supports ignore, and updates dashboard health", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ dependencies: { request: "*" } }, null, 2));
    await writeFile(join(tempDir, ".env.example"), "NEXT_PUBLIC_SECRET_TOKEN=\nDATABASE_URL=\n");
    await writeFile(join(tempDir, ".env"), "NEXT_PUBLIC_SECRET_TOKEN=not-a-real-demo-token-value\nDATABASE_URL=postgres://localhost/app\n");
    await writeFile(join(tempDir, "src.js"), "const token = 'ghp_DEMO1234567890abcdef'; eval('1+1');\n");
    await writeFile(join(tempDir, "Dockerfile"), "FROM node:22\nCMD node src.js\n");

    const report = await runSecurityCommand(tempDir, "deep", { report: ".setupr/security.json" });

    expect(report?.findings.some((finding) => finding.category === "secrets")).toBe(true);
    expect(report?.findings.some((finding) => finding.category === "deps")).toBe(true);
    expect(report?.score).toBeLessThan(100);
    await expect(readFile(join(tempDir, ".setupr", "security.json"), "utf-8")).resolves.toContain("\"type\": \"security\"");

    const firstId = report?.findings[0]?.id;
    expect(firstId).toBeTruthy();
    await runSecurityCommand(tempDir, "ignore", { args: [String(firstId)] });
    const summary = await collectSecuritySummary(tempDir);
    expect(summary.lastRun?.findings.length).toBeGreaterThan(0);

    const status = await collectDashboardStatus(tempDir);
    expect(status.security.findings).toBeGreaterThan(0);
    expect(status.health.checks.some((check) => check.label === "Security")).toBe(true);
  });

  it("routes CLI test/security commands through the plain command router", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ scripts: { test: "node -e \"console.log('ok')\"" } }));

    await runNonTUICommand("test", "doctor", tempDir, {});
    await runNonTUICommand("security", "quick", tempDir, {});

    expect((await collectVerificationSummary(tempDir)).lastRun?.command).toBe("doctor");
    expect((await collectSecuritySummary(tempDir)).lastRun?.command).toBe("scan");
  });
});
