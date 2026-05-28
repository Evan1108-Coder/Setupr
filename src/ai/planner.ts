import { chat, hasAIKey, type ChatMessage } from "./client.js";
import type { ScanResult } from "../scanner/index.js";
import { scanResultToDSL } from "./dsl.js";

export interface SetupStep {
  id: string;
  label: string;
  type: "runtime" | "deps" | "env" | "script" | "verify" | "config";
  command?: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  output?: string;
  error?: string;
}

export async function planSteps(scan: ScanResult): Promise<SetupStep[]> {
  if (hasAIKey() && shouldUseAIPlanner(scan)) {
    try {
      return await planStepsWithAI(scan);
    } catch {
      // fallback to heuristic
    }
  }
  return planStepsHeuristic(scan);
}

export function shouldUseAIPlanner(scan: ScanResult): boolean {
  if (!scan.language && !scan.framework && !scan.packageManager && scan.configFiles.length > 0) {
    return true;
  }

  if (scan.configFiles.some((file) => file === ".p-setup.json")) {
    return false;
  }

  const knownSignals = [
    scan.language,
    scan.framework,
    scan.packageManager,
    scan.runtime?.name,
    scan.monorepo?.type,
  ].filter(Boolean);

  return knownSignals.length === 0 && scan.configFiles.length > 0;
}

async function planStepsWithAI(scan: ScanResult): Promise<SetupStep[]> {
  const dsl = scanResultToDSL(scan);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are P-Setup's step planner. Given a project profile, produce a setup plan.
Respond ONLY with a JSON array of steps. Each step: {"id":"unique_id","label":"Human label","type":"runtime|deps|env|script|verify|config","command":"shell command or null"}
Be practical and specific to the detected stack.`,
    },
    {
      role: "user",
      content: `Plan setup steps for: ${dsl}\nScripts available: ${Object.keys(scan.scripts).join(", ") || "none"}\nServices: ${scan.services.join(", ") || "none"}`,
    },
  ];

  const result = await chat(messages, { temperature: 0.1, maxTokens: 1200, timeoutMs: 8000 });

  try {
    const jsonMatch = result.content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array found");
    const steps = JSON.parse(jsonMatch[0]);
    return steps.map((s: any) => ({
      id: s.id || crypto.randomUUID().slice(0, 8),
      label: s.label,
      type: s.type || "script",
      command: s.command || undefined,
      status: "pending" as const,
    }));
  } catch {
    return planStepsHeuristic(scan);
  }
}

export function planStepsHeuristic(scan: ScanResult): SetupStep[] {
  const steps: SetupStep[] = [];

  // Runtime check/install
  if (scan.runtime) {
    steps.push({
      id: "runtime",
      label: `Check ${scan.runtime.name}${scan.runtime.version ? ` ${scan.runtime.version}` : ""} runtime`,
      type: "runtime",
      command: getVersionCheckCommand(scan.runtime.name),
      status: "pending",
    });
  }

  // Install dependencies
  if (scan.packageManager) {
    const installCmd = getInstallCommand(scan.packageManager);
    steps.push({
      id: "deps",
      label: `Install dependencies (${scan.packageManager})`,
      type: "deps",
      command: installCmd,
      status: "pending",
    });
  }

  // Environment setup
  if (scan.configFiles.includes(".env.example")) {
    steps.push({
      id: "env",
      label: "Configure environment variables",
      type: "env",
      status: "pending",
    });
  }

  // Services check
  if (scan.services.length > 0) {
    steps.push({
      id: "services",
      label: `Verify services: ${scan.services.join(", ")}`,
      type: "verify",
      status: "pending",
    });
  }

  // Post-install scripts
  if (scan.scripts.postinstall || scan.scripts.prepare) {
    steps.push({
      id: "postinstall",
      label: "Run post-install scripts",
      type: "script",
      command: scan.scripts.postinstall
        ? `${scan.packageManager || "npm"} run postinstall`
        : `${scan.packageManager || "npm"} run prepare`,
      status: "pending",
    });
  }

  // Build step (if applicable)
  if (scan.scripts.build) {
    steps.push({
      id: "build",
      label: "Run build",
      type: "script",
      command: `${scan.packageManager || "npm"} run build`,
      status: "pending",
    });
  }

  // Verify
  steps.push({
    id: "verify",
    label: "Verify setup",
    type: "verify",
    status: "pending",
  });

  return steps;
}

function getInstallCommand(pm: string): string {
  const cmds: Record<string, string> = {
    npm: "npm install",
    yarn: "yarn install",
    pnpm: "pnpm install",
    bun: "bun install",
    pip: "pip install -r requirements.txt",
    pipenv: "pipenv install",
    poetry: "poetry install",
    cargo: "cargo build",
    go: "go mod download",
    bundler: "bundle install",
    composer: "composer install",
    pub: "dart pub get",
    mix: "mix deps.get",
  };
  return cmds[pm] || `${pm} install`;
}

function getVersionCheckCommand(runtime: string): string {
  const cmds: Record<string, string> = {
    node: "node --version",
    python: "python3 --version",
    ruby: "ruby --version",
    go: "go version",
    rust: "rustc --version",
    java: "java --version",
  };
  return cmds[runtime] || `${runtime} --version`;
}
