import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { pathToFileURL } from "url";
import { join, resolve } from "path";
import type { SetupStep } from "../ai/planner.js";
import type { ProjectContext } from "../ai/dsl.js";
import { collectContext } from "../context/collector.js";
import { loadConfig, type PluginEntry } from "../state/config.js";
import { scanProject, type ScanResult } from "../scanner/index.js";
import type {
  SetuprPlugin,
  SetuprPluginContext,
  SetuprPluginDoctorCheck,
  SetuprPluginPanel,
} from "./api.js";

export interface LoadedPlugin {
  plugin: SetuprPlugin;
  dir: string;
}

export interface PluginDiagnostic {
  name: string;
  status: "loaded" | "skipped" | "failed";
  message: string;
}

interface PluginManifest {
  name?: string;
  version?: string;
  main?: string;
  exports?: string | Record<string, unknown>;
  setupr?: {
    apiVersion?: string;
  };
}

export async function loadEnabledPlugins(cwd: string): Promise<{
  plugins: LoadedPlugin[];
  diagnostics: PluginDiagnostic[];
}> {
  const diagnostics: PluginDiagnostic[] = [];
  const plugins: LoadedPlugin[] = [];
  const candidates = await pluginCandidates(cwd);

  for (const candidate of candidates) {
    try {
      const loaded = await loadPluginFromDir(candidate.name, candidate.dir);
      if (!loaded) {
        diagnostics.push({ name: candidate.name, status: "skipped", message: "No loadable plugin entrypoint found." });
        continue;
      }
      plugins.push(loaded);
      diagnostics.push({ name: loaded.plugin.name, status: "loaded", message: `Loaded from ${loaded.dir}` });
    } catch (err) {
      diagnostics.push({
        name: candidate.name,
        status: "failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { plugins, diagnostics };
}

export async function applyPluginPlanners(input: {
  cwd: string;
  scan: ScanResult;
  projectContext?: ProjectContext;
  steps: SetupStep[];
  log?: (message: string) => void;
}): Promise<{ steps: SetupStep[]; diagnostics: PluginDiagnostic[] }> {
  const { plugins, diagnostics } = await loadEnabledPlugins(input.cwd);
  let steps = input.steps;
  for (const { plugin } of plugins) {
    for (const planner of plugin.planners || []) {
      try {
        steps = await planner.plan(await pluginContext(input.cwd, input.scan, input.projectContext, input.log), steps);
        diagnostics.push({ name: `${plugin.name}:${planner.name}`, status: "loaded", message: "Planner applied." });
      } catch (err) {
        diagnostics.push({
          name: `${plugin.name}:${planner.name}`,
          status: "failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return { steps, diagnostics };
}

export async function runPluginDoctorChecks(input: {
  cwd: string;
  scan?: ScanResult;
  projectContext?: ProjectContext;
  log?: (message: string) => void;
}): Promise<Array<{
  plugin: string;
  check: SetuprPluginDoctorCheck["name"];
  status: "pass" | "warn" | "fail";
  message: string;
  fix?: { label: string; command?: string };
}>> {
  const scan = input.scan || await scanProject(input.cwd);
  const context = input.projectContext || await collectContext(input.cwd, scan);
  const { plugins } = await loadEnabledPlugins(input.cwd);
  const results: Array<{
    plugin: string;
    check: string;
    status: "pass" | "warn" | "fail";
    message: string;
    fix?: { label: string; command?: string };
  }> = [];

  for (const { plugin } of plugins) {
    for (const check of plugin.doctorChecks || []) {
      try {
        const result = await check.check(await pluginContext(input.cwd, scan, context, input.log));
        results.push({ plugin: plugin.name, check: check.name, ...result });
      } catch (err) {
        results.push({
          plugin: plugin.name,
          check: check.name,
          status: "fail",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return results;
}

export async function renderPluginPanels(input: {
  cwd: string;
  scan?: ScanResult;
  projectContext?: ProjectContext;
  log?: (message: string) => void;
}): Promise<Array<{ plugin: string; id: SetuprPluginPanel["id"]; title: string; text: string }>> {
  const scan = input.scan || await scanProject(input.cwd);
  const context = input.projectContext || await collectContext(input.cwd, scan);
  const { plugins } = await loadEnabledPlugins(input.cwd);
  const panels: Array<{ plugin: string; id: string; title: string; text: string }> = [];

  for (const { plugin } of plugins) {
    for (const panel of plugin.panels || []) {
      try {
        const text = await panel.renderText(await pluginContext(input.cwd, scan, context, input.log));
        panels.push({ plugin: plugin.name, id: panel.id, title: panel.title, text });
      } catch (err) {
        panels.push({
          plugin: plugin.name,
          id: panel.id,
          title: panel.title,
          text: `Plugin panel failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }
  return panels;
}

export async function tryRunPluginCommand(input: {
  cwd: string;
  command: string;
  args: string[];
  log?: (message: string) => void;
}): Promise<boolean> {
  const scan = await scanProject(input.cwd);
  const context = await collectContext(input.cwd, scan);
  const { plugins } = await loadEnabledPlugins(input.cwd);

  for (const { plugin } of plugins) {
    const command = plugin.commands?.find((candidate) => candidate.name === input.command);
    if (!command) continue;
    await command.run(await pluginContext(input.cwd, scan, context, input.log), input.args);
    return true;
  }

  return false;
}

async function pluginCandidates(cwd: string): Promise<Array<{ name: string; dir: string }>> {
  const config = await loadConfig();
  const enabled = (config.plugins || []).filter((plugin) => plugin.enabled);
  const candidates: Array<{ name: string; dir: string }> = [];
  const seen = new Set<string>();

  for (const plugin of enabled) {
    for (const dir of possiblePluginDirs(cwd, plugin)) {
      if (!existsSync(join(dir, "package.json"))) continue;
      const key = resolve(dir);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ name: plugin.name, dir });
    }
  }

  return candidates;
}

function possiblePluginDirs(cwd: string, plugin: PluginEntry): string[] {
  const name = plugin.name.replace(/[\\/]/g, "__");
  const sourcePath = plugin.source && plugin.source !== "npm" && plugin.source !== "git" ? plugin.source : "";
  return [
    sourcePath ? resolve(cwd, sourcePath) : "",
    join(cwd, ".setupr", "plugins", plugin.name),
    join(cwd, ".setupr", "plugins", name),
    join(process.env.HOME || cwd, ".setupr", "plugins", plugin.name),
    join(process.env.HOME || cwd, ".setupr", "plugins", name),
  ].filter(Boolean);
}

async function loadPluginFromDir(name: string, dir: string): Promise<LoadedPlugin | null> {
  const manifest = JSON.parse(await readFile(join(dir, "package.json"), "utf-8")) as PluginManifest;
  if (manifest.setupr?.apiVersion && manifest.setupr.apiVersion !== "1") {
    throw new Error(`Unsupported Setupr plugin API version: ${manifest.setupr.apiVersion}`);
  }

  const entry = resolveEntrypoint(dir, manifest);
  if (!entry) return null;

  const module = await import(`${pathToFileURL(entry).href}?setupr=${Date.now()}`);
  const plugin = (module.default || module.plugin) as SetuprPlugin | undefined;
  if (!plugin || plugin.apiVersion !== "1" || !plugin.name) {
    throw new Error(`Plugin ${name} did not export a valid SetuprPlugin object.`);
  }
  return { plugin, dir };
}

function resolveEntrypoint(dir: string, manifest: PluginManifest): string | null {
  const candidates = [
    typeof manifest.exports === "string" ? manifest.exports : undefined,
    manifest.main,
    "dist/index.js",
    "index.js",
  ].filter((item): item is string => Boolean(item));

  for (const candidate of candidates) {
    const entry = join(dir, candidate);
    if (existsSync(entry)) return entry;
  }
  return null;
}

async function pluginContext(
  cwd: string,
  scan: ScanResult,
  projectContext: ProjectContext | undefined,
  log: ((message: string) => void) | undefined
): Promise<SetuprPluginContext> {
  return {
    cwd,
    scan,
    projectContext,
    log: log || ((message) => console.log(`[plugin] ${message}`)),
  };
}
