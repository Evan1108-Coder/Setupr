import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { env } from "process";
import { applyPluginPlanners, loadEnabledPlugins, runPluginDoctorChecks, tryRunPluginCommand } from "../src/plugins/runtime.js";
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

  it("loads plugins that expose an exports object entrypoint", async () => {
    const pluginDir = join(tempDir, ".setupr", "plugins", "exported");
    await mkdir(join(pluginDir, "build"), { recursive: true });
    await writeFile(join(pluginDir, "package.json"), JSON.stringify({
      name: "setupr-plugin-exported",
      version: "0.1.0",
      type: "module",
      exports: { ".": { import: "./build/plugin.js" } },
      setupr: { apiVersion: "1" },
    }));
    await writeFile(join(pluginDir, "build", "plugin.js"), `
      export default {
        name: "setupr-plugin-exported",
        apiVersion: "1",
        commands: [{ name: "exported-ok", summary: "OK", run(context) { context.log("exported command"); } }],
      };
    `);
    await saveConfig(configWithPlugins([
      { name: "setupr-plugin-exported", version: "0.1.0", enabled: true, source: ".setupr/plugins/exported" },
    ]));

    const loaded = await loadEnabledPlugins(tempDir);

    expect(loaded.diagnostics).toContainEqual(expect.objectContaining({ name: "setupr-plugin-exported", status: "loaded" }));
    expect(loaded.plugins.map((item) => item.plugin.name)).toContain("setupr-plugin-exported");
  });

  it("rejects plugin entrypoints that escape the plugin directory", async () => {
    const pluginDir = join(tempDir, ".setupr", "plugins", "escape");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(tempDir, ".setupr", "plugins", "evil.js"), "export default { name: 'evil', apiVersion: '1' };\n");
    await writeFile(join(pluginDir, "package.json"), JSON.stringify({
      name: "setupr-plugin-escape",
      version: "0.1.0",
      type: "module",
      main: "../evil.js",
      setupr: { apiVersion: "1" },
    }));
    await saveConfig(configWithPlugins([
      { name: "setupr-plugin-escape", version: "0.1.0", enabled: true, source: ".setupr/plugins/escape" },
    ]));

    const loaded = await loadEnabledPlugins(tempDir);

    expect(loaded.plugins).toHaveLength(0);
    expect(loaded.diagnostics[0]).toMatchObject({ name: "setupr-plugin-escape", status: "failed" });
    expect(loaded.diagnostics[0].message).toContain("escapes plugin directory");
  });

  it("turns throwing plugin commands into structured plugin errors", async () => {
    const pluginDir = join(tempDir, ".setupr", "plugins", "thrower");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, "package.json"), JSON.stringify({
      name: "setupr-plugin-thrower",
      version: "0.1.0",
      type: "module",
      main: "index.js",
      setupr: { apiVersion: "1" },
    }));
    await writeFile(join(pluginDir, "index.js"), `
      export default {
        name: "setupr-plugin-thrower",
        apiVersion: "1",
        commands: [{ name: "explode", summary: "Fail", run() { throw new Error("plugin boom"); } }],
      };
    `);
    await saveConfig(configWithPlugins([
      { name: "setupr-plugin-thrower", version: "0.1.0", enabled: true, source: ".setupr/plugins/thrower" },
    ]));

    await expect(tryRunPluginCommand({ cwd: tempDir, command: "explode", args: [] }))
      .rejects.toMatchObject({ code: "PLUGIN_LOAD_FAILED", details: expect.arrayContaining(["Plugin: setupr-plugin-thrower", "plugin boom"]) });
  });
});

function configWithPlugins(plugins: Array<{ name: string; version: string; enabled: boolean; source: string }>) {
  return {
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
    plugins,
    remembered: {},
  };
}
