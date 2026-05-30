import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { env } from "process";
import { applyPluginPlanners, runPluginDoctorChecks, tryRunPluginCommand } from "../src/plugins/runtime.js";
import { saveConfig } from "../src/state/config.js";
import type { ScanResult } from "../src/scanner/index.js";
import type { SetupStep } from "../src/ai/planner.js";

const scan: ScanResult = {
  language: "JavaScript",
  framework: "React",
  packageManager: "npm",
  runtime: { name: "node", version: "20" },
  services: [],
  monorepo: null,
  scripts: { dev: "vite" },
  dependencies: { prod: 1, dev: 1 },
  configFiles: ["package.json"],
};

describe("plugin runtime", () => {
  const originalEnv = { ...env };
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "setupr-plugin-runtime-"));
    env.HOME = join(tempDir, "home");
    await mkdir(join(env.HOME, ".setupr"), { recursive: true });
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "app", scripts: scan.scripts }));

    const pluginDir = join(tempDir, ".setupr", "plugins", "team");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, "package.json"), JSON.stringify({
      name: "setupr-plugin-team",
      version: "0.1.0",
      type: "module",
      main: "index.js",
      setupr: { apiVersion: "1" },
    }));
    await writeFile(join(pluginDir, "index.js"), `
      export default {
        name: "setupr-plugin-team",
        apiVersion: "1",
        planners: [{ name: "add-verify", plan(_context, steps) {
          return [...steps, { id: "plugin-verify", label: "Plugin verify", type: "verify", command: "node -e \\"console.log('plugin')\\"", status: "pending" }];
        } }],
        doctorChecks: [{ name: "team-check", check() {
          return { status: "warn", message: "Team plugin check", fix: { label: "Run plugin command", command: "team-hello" } };
        } }],
        commands: [{ name: "team-hello", summary: "Hello", run(context, args) {
          context.log("team command " + args.join(","));
        } }],
      };
    `);
    await saveConfig({
      ai: { enabled: true, timeoutMs: 30000, maxRetries: 3, retryDelayMs: 1000, rateLimitPerMinute: 20 },
      preferences: {
        theme: "dark",
        confirmBeforeInstall: true,
        autoUpdate: false,
        telemetry: false,
        defaultBranch: "main",
        commitConvention: "conventional",
        ciPlatform: "auto",
      },
      plugins: [{ name: "setupr-plugin-team", version: "0.1.0", enabled: true, source: ".setupr/plugins/team" }],
      remembered: {},
    });
  });

  afterEach(async () => {
    for (const key of Object.keys(env)) delete env[key];
    Object.assign(env, originalEnv);
    await rm(tempDir, { recursive: true, force: true });
  });

  it("loads enabled plugin planners, doctor checks, and commands", async () => {
    const steps: SetupStep[] = [
      { id: "deps", label: "Install dependencies", type: "deps", command: "npm install", status: "pending" },
    ];
    const plannerResult = await applyPluginPlanners({ cwd: tempDir, scan, steps });
    const doctorChecks = await runPluginDoctorChecks({ cwd: tempDir, scan });
    const logs: string[] = [];
    const commandHandled = await tryRunPluginCommand({
      cwd: tempDir,
      command: "team-hello",
      args: ["one"],
      log: (message) => logs.push(message),
    });

    expect(plannerResult.steps.map((step) => step.id)).toContain("plugin-verify");
    expect(plannerResult.diagnostics.map((item) => item.name)).toContain("setupr-plugin-team:add-verify");
    expect(doctorChecks[0]).toMatchObject({ plugin: "setupr-plugin-team", check: "team-check", status: "warn" });
    expect(commandHandled).toBe(true);
    expect(logs.join("\n")).toContain("team command one");
  });
});
