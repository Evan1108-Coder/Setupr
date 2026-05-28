import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { ScanResult } from "../scanner/index.js";
import type { SetupStep } from "./planner.js";
import { createPSetupError, sanitizeSecret } from "../errors/index.js";

export type SetupTimelineEvent =
  | {
      type: "planning.started";
      message: string;
      at: string;
    }
  | {
      type: "planning.completed";
      message: string;
      at: string;
      summary: PlanningSummary;
    }
  | {
      type: "step.updated";
      message: string;
      at: string;
      stepId: string;
      status: SetupStep["status"];
    }
  | {
      type: "env.detected";
      message: string;
      at: string;
      vars: MaskedEnvVar[];
    }
  | {
      type: "question.asked";
      message: string;
      at: string;
      question: SetupQuestion;
    }
  | {
      type: "confirmation.ready";
      message: string;
      at: string;
      summary: ConfirmationSummary;
    }
  | {
      type: "error";
      message: string;
      at: string;
      recoverable: boolean;
    };

export type SetupQuestionKind = "confirm" | "choice" | "text" | "secret";

export interface SetupQuestionChoice {
  label: string;
  value: string;
  recommended?: boolean;
}

export interface SetupQuestion {
  id: string;
  kind: SetupQuestionKind;
  title: string;
  body?: string;
  choices?: SetupQuestionChoice[];
  defaultValue?: string | boolean;
  required?: boolean;
  sensitive?: boolean;
}

export type SetupPrompt =
  | {
      type: "question";
      question: SetupQuestion;
    }
  | {
      type: "confirmation";
      summary: ConfirmationSummary;
      question: SetupQuestion;
    };

export type ForceModeDecision =
  | {
      action: "ask";
      reason: string;
    }
  | {
      action: "use-default";
      reason: string;
      value: string | boolean;
    }
  | {
      action: "skip";
      reason: string;
    }
  | {
      action: "deny";
      reason: string;
    };

export interface ForceModePolicyOptions {
  force?: boolean;
  allowDestructive?: boolean;
  defaults?: Record<string, string | boolean>;
}

export interface PlanningSummary {
  project: {
    language: string;
    framework: string;
    packageManager: string;
    runtime: string;
    monorepo: string | null;
  };
  counts: {
    steps: number;
    commands: number;
    envSteps: number;
    services: number;
  };
  services: string[];
  scripts: string[];
  stepTypes: Record<SetupStep["type"], number>;
  missingEnvFile: boolean;
  headline: string;
}

export interface ParsedEnvVar {
  key: string;
  value: string;
  quoted: boolean;
  sourceLine: number;
}

export interface IgnoredEnvLine {
  line: number;
  reason: "blank" | "comment" | "invalid-key" | "missing-equals";
  content: string;
}

export interface EnvBatchInterpretation {
  vars: ParsedEnvVar[];
  ignored: IgnoredEnvLine[];
  duplicates: string[];
}

export interface MaskedEnvVar {
  key: string;
  value: string;
  masked: boolean;
}

export interface ConfirmationSummary {
  title: string;
  bullets: string[];
  risks: string[];
  commands: string[];
  env: MaskedEnvVar[];
  requiresConfirmation: boolean;
}

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SENSITIVE_KEY_PATTERN =
  /(TOKEN|SECRET|PASSWORD|PASS|API_?KEY|PRIVATE|CREDENTIAL|AUTH|BEARER|SESSION|COOKIE)/i;

export function createSetupTimelineEvent(
  event: Omit<SetupTimelineEvent, "at">,
  at = new Date()
): SetupTimelineEvent {
  return { ...event, at: at.toISOString() } as SetupTimelineEvent;
}

export function decideForceMode(
  question: SetupQuestion,
  options: ForceModePolicyOptions = {}
): ForceModeDecision {
  if (!options.force) {
    return { action: "ask", reason: "Interactive mode can ask this question." };
  }

  if (question.kind === "secret" || question.sensitive) {
    return { action: "skip", reason: "Force mode does not invent sensitive values." };
  }

  const override = options.defaults?.[question.id];
  if (override !== undefined) {
    return { action: "use-default", reason: "Force mode used a provided default.", value: override };
  }

  if (question.defaultValue !== undefined) {
    return {
      action: "use-default",
      reason: "Force mode used the question default.",
      value: question.defaultValue,
    };
  }

  const recommended = question.choices?.find((choice) => choice.recommended);
  if (recommended) {
    return {
      action: "use-default",
      reason: "Force mode used the recommended choice.",
      value: recommended.value,
    };
  }

  if (question.kind === "confirm") {
    if (options.allowDestructive) {
      return {
        action: "use-default",
        reason: "Force mode confirmed because destructive actions are allowed.",
        value: true,
      };
    }
    return { action: "deny", reason: "Force mode will not confirm without an explicit default." };
  }

  return { action: "skip", reason: "Force mode has no safe value for this prompt." };
}

export function createPlanningSummary(scan: ScanResult, steps: SetupStep[]): PlanningSummary {
  const stepTypes = emptyStepTypeCounts();
  let commands = 0;
  let envSteps = 0;

  for (const step of steps) {
    stepTypes[step.type] += 1;
    if (step.command) commands += 1;
    if (step.type === "env") envSteps += 1;
  }

  const runtime = scan.runtime
    ? `${scan.runtime.name}${scan.runtime.version ? ` ${scan.runtime.version}` : ""}`
    : "unknown";
  const stack = [scan.language, scan.framework, scan.packageManager].filter(Boolean).join(" / ");
  const headline = `${steps.length} setup step${steps.length === 1 ? "" : "s"} planned for ${
    stack || "this project"
  }`;

  return {
    project: {
      language: scan.language || "unknown",
      framework: scan.framework || "unknown",
      packageManager: scan.packageManager || "unknown",
      runtime,
      monorepo: scan.monorepo
        ? `${scan.monorepo.type} (${scan.monorepo.packages.length} packages)`
        : null,
    },
    counts: {
      steps: steps.length,
      commands,
      envSteps,
      services: scan.services.length,
    },
    services: [...scan.services],
    scripts: Object.keys(scan.scripts).sort(),
    stepTypes,
    missingEnvFile: scan.configFiles.includes(".env.example") && !scan.configFiles.includes(".env"),
    headline,
  };
}

export function interpretEnvBatch(input: string): EnvBatchInterpretation {
  const vars: ParsedEnvVar[] = [];
  const ignored: IgnoredEnvLine[] = [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const lines = expandEnvLines(input);

  lines.forEach((line, index) => {
    const sourceLine = index + 1;
    const trimmed = line.trim();

    if (!trimmed) {
      ignored.push({ line: sourceLine, reason: "blank", content: line });
      return;
    }

    if (trimmed.startsWith("#")) {
      ignored.push({ line: sourceLine, reason: "comment", content: line });
      return;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 0) {
      ignored.push({ line: sourceLine, reason: "missing-equals", content: line });
      return;
    }

    const key = trimmed.slice(0, eqIndex).trim().replace(/^export\s+/, "");
    if (!ENV_KEY_PATTERN.test(key)) {
      ignored.push({ line: sourceLine, reason: "invalid-key", content: line });
      return;
    }

    if (seen.has(key)) duplicates.add(key);
    seen.add(key);

    const rawValue = trimmed.slice(eqIndex + 1).trim();
    const { value, quoted } = unquoteEnvValue(rawValue);
    vars.push({ key, value, quoted, sourceLine });
  });

  return { vars, ignored, duplicates: [...duplicates].sort() };
}

function expandEnvLines(input: string): string[] {
  const lines: string[] = [];
  const roughLines = input.replace(/\r\n/g, "\n").split(/[\n;]/);
  const assignmentPattern = /(?:^|\s)(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=/g;

  for (const roughLine of roughLines) {
    const matches = [...roughLine.matchAll(assignmentPattern)];
    if (matches.length <= 1) {
      lines.push(roughLine);
      continue;
    }

    for (let index = 0; index < matches.length; index++) {
      const start = matches[index].index ?? 0;
      const end = matches[index + 1]?.index ?? roughLine.length;
      lines.push(roughLine.slice(start, end).trim());
    }
  }

  return lines;
}

export function maskSensitiveValue(key: string, value: string): string {
  if (!value) return "";
  if (!isSensitiveEnvKey(key)) return value;
  if (value.length <= 4) return "*".repeat(value.length);

  const visibleEnd = 4;
  return `${"*".repeat(Math.max(4, value.length - visibleEnd))}${value.slice(-visibleEnd)}`;
}

export function maskEnvVars(vars: Array<{ key: string; value: string }>): MaskedEnvVar[] {
  return vars.map(({ key, value }) => {
    const sensitive = isSensitiveEnvKey(key);
    return {
      key,
      value: sensitive ? maskSensitiveValue(key, value) : value,
      masked: sensitive,
    };
  });
}

export function createConfirmationSummary(input: {
  scan: ScanResult;
  steps: SetupStep[];
  env?: Array<{ key: string; value: string }>;
  force?: boolean;
}): ConfirmationSummary {
  const planning = createPlanningSummary(input.scan, input.steps);
  const commands = input.steps
    .map((step) => step.command)
    .filter((command): command is string => Boolean(command));
  const env = maskEnvVars(input.env || []);
  const risks = buildRisks(input.steps, env, Boolean(input.force));

  return {
    title: planning.headline,
    bullets: [
      `Runtime: ${planning.project.runtime}`,
      `Package manager: ${planning.project.packageManager}`,
      `Commands: ${commands.length}`,
      `Environment values: ${env.length}`,
    ],
    risks,
    commands,
    env,
    requiresConfirmation: risks.length > 0 || commands.length > 0 || env.length > 0,
  };
}

export function createPreExecutionWarning(scan: ScanResult, command: string, force = false): string[] {
  if (command !== "setup") {
    return commandWarnings(scan, command, force);
  }

  const summary: string[] = [];
  const stack = [scan.framework, scan.language].filter(Boolean).join(" / ") || "detected project";
  summary.push(`Will inspect and prepare ${stack}.`);

  if (scan.packageManager) {
    const depCount = scan.dependencies.prod + scan.dependencies.dev;
    summary.push(
      `Will use ${scan.packageManager}${depCount > 0 ? ` for ${depCount} declared dependencies` : ""}.`
    );
  }

  if (scan.configFiles.includes(".env.example")) {
    summary.push("Will inspect .env.example and create or update local .env when needed.");
  }

  if (scan.scripts.build) summary.push(`May run build script: ${sanitizeSecret(scan.scripts.build)}.`);
  if (scan.scripts.test) summary.push(`May use test script for verification: ${sanitizeSecret(scan.scripts.test)}.`);
  if (scan.services.length > 0) summary.push(`Will account for services: ${scan.services.join(", ")}.`);
  if (scan.monorepo) {
    summary.push(`Monorepo detected: ${scan.monorepo.type} (${scan.monorepo.packages.length} packages).`);
  }
  if (force) summary.push("Force mode: skip safe prompts, still stop for destructive or blocked actions.");

  return summary;
}

export function formatPlanningMessage(scan: ScanResult, steps: SetupStep[], force = false): string {
  const summary = createPlanningSummary(scan, steps);
  const parts = [
    summary.headline,
    `Runtime ${summary.project.runtime}.`,
    `Package manager ${summary.project.packageManager}.`,
  ];
  if (summary.missingEnvFile) parts.push("I found .env.example and will guide missing values.");
  if (summary.services.length > 0) parts.push(`Services noticed: ${summary.services.join(", ")}.`);
  if (force) parts.push("Force mode is active, so I will use safe defaults and ask only for blockers.");
  return parts.join(" ");
}

export function formatConfirmationSummary(summary: ConfirmationSummary): string {
  const lines = [summary.title, "", ...summary.bullets.map((bullet) => `• ${bullet}`)];
  if (summary.commands.length > 0) {
    lines.push("", "Commands:");
    lines.push(...summary.commands.slice(0, 8).map((command) => `• ${command}`));
    if (summary.commands.length > 8) lines.push(`• ... ${summary.commands.length - 8} more`);
  }
  if (summary.env.length > 0) {
    lines.push("", "Environment:");
    lines.push(...summary.env.slice(0, 8).map((item) => `• ${item.key}=${item.value || "(empty)"}`));
    if (summary.env.length > 8) lines.push(`• ... ${summary.env.length - 8} more`);
  }
  if (summary.risks.length > 0) {
    lines.push("", "Risks:");
    lines.push(...summary.risks.map((risk) => `• ${risk}`));
  }
  return lines.join("\n");
}

export function applyPlanTextAdjustment(
  steps: SetupStep[],
  input: string
): { steps: SetupStep[]; notes: string[] } {
  const lower = input.toLowerCase();
  const notes: string[] = [];
  let next = [...steps];
  const clauses = lower
    .split(/\b(?:but|however|though|except)\b|[.;\n]/)
    .map((clause) => clause.trim())
    .filter(Boolean);
  const skipClauses = clauses.filter((clause) => /\b(skip|no|don't|dont|do not|avoid|without)\b/.test(clause));
  const hasSkipIntent = (targets: RegExp[]) =>
    skipClauses.some((clause) => targets.some((target) => target.test(clause)));

  const skipRules: Array<[boolean, SetupStep["type"] | "build", string]> = [
    [hasSkipIntent([/\bbuild\b/]), "build", "Skipped build because you asked me not to run it."],
    [hasSkipIntent([/\binstall\b/, /\bdeps\b/, /\bdependencies\b/]), "deps", "Skipped dependency install because you asked me not to run it."],
    [hasSkipIntent([/\benv\b/, /\benvironment\b/]), "env", "Skipped environment setup because you asked me not to change it."],
    [hasSkipIntent([/\bverify\b/, /\bverification\b/]), "verify", "Skipped verification because you asked me not to run it."],
  ];

  for (const [matched, stepType, note] of skipRules) {
    if (!matched) continue;
    next = next.map((step) => {
      const isBuild = stepType === "build" && /\bbuild\b/i.test(step.id + " " + step.label + " " + (step.command || ""));
      const isType = step.type === stepType;
      return isBuild || isType ? { ...step, status: "skipped" as const } : step;
    });
    notes.push(note);
  }

  const pm = lower.match(/\b(?:use|prefer|switch to)\s+(npm|pnpm|yarn|bun)\b/)?.[1];
  if (pm) {
    next = next.map((step) => (step.command ? { ...step, command: rewritePackageManagerCommand(step.command, pm) } : step));
    notes.push(`Adjusted package-manager commands to prefer ${pm}.`);
  }

  if (/\b(force|continue|proceed|looks good|ok|okay)\b/.test(lower) && notes.length === 0) {
    notes.push("Confirmed. I will continue with the current plan.");
  }

  if (notes.length === 0) {
    notes.push("I recorded your instruction. No direct plan rewrite was needed.");
  }

  return { steps: next, notes };
}

export async function mergeEnvValues(cwd: string, values: Record<string, string>): Promise<void> {
  const envPath = join(cwd, ".env");
  const examplePath = join(cwd, ".env.example");
  const existing = await readFile(envPath, "utf-8").catch(() => "");
  const template = await readFile(examplePath, "utf-8").catch(() => existing || "");
  const current = parseEnvPairs(existing);
  const merged = { ...current, ...values };

  const seen = new Set<string>();
  const lines = template.split("\n").map((line) => {
    const key = parseEnvLineKey(line);
    if (!key) return line;
    seen.add(key);
    return `${key}=${merged[key] ?? ""}`;
  });

  for (const [key, value] of Object.entries(merged)) {
    if (!seen.has(key)) lines.push(`${key}=${value}`);
  }

  try {
    await writeFile(envPath, lines.join("\n").replace(/\n*$/, "\n"));
  } catch (err) {
    throw createPSetupError({
      code: "ENV_WRITE_FAILED",
      cwd,
      details: [err instanceof Error ? err.message : String(err)],
    });
  }
}

export function envInterpretationToRecord(parsed: EnvBatchInterpretation): Record<string, string> {
  const values: Record<string, string> = {};
  for (const item of parsed.vars) values[item.key] = item.value;
  return values;
}

function emptyStepTypeCounts(): Record<SetupStep["type"], number> {
  return {
    runtime: 0,
    deps: 0,
    env: 0,
    script: 0,
    verify: 0,
    config: 0,
  };
}

function isSensitiveEnvKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

function unquoteEnvValue(rawValue: string): { value: string; quoted: boolean } {
  if (rawValue.length < 2) return { value: rawValue, quoted: false };
  const quote = rawValue[0];
  if ((quote !== "\"" && quote !== "'") || rawValue[rawValue.length - 1] !== quote) {
    return { value: rawValue, quoted: false };
  }

  return { value: rawValue.slice(1, -1), quoted: true };
}

function buildRisks(steps: SetupStep[], env: MaskedEnvVar[], force: boolean): string[] {
  const risks: string[] = [];
  if (steps.some((step) => step.type === "deps")) {
    risks.push("Dependency installation can change lockfiles and installed packages.");
  }
  if (steps.some((step) => step.type === "env") || env.length > 0) {
    risks.push("Environment setup can create or update local .env files.");
  }
  if (force) {
    risks.push("Force mode skips interactive prompts where safe defaults are available.");
  }
  return risks;
}

function commandWarnings(scan: ScanResult, command: string, force: boolean): string[] {
  const commandLine = scan.packageManager || "the detected package manager";
  const warnings: Record<string, string[]> = {
    start: scan.scripts.dev
      ? [`Will run the detected dev script with ${commandLine}.`]
      : ["Will detect and run the project's most likely start command."],
    doctor: ["Will check runtimes, package manager, env files, services, and common project health signals."],
    update: ["Will inspect dependencies for updates. It will ask before applying risky changes."],
    clean: ["Will remove generated artifacts for the selected clean mode. Source code is not affected."],
    auth: ["Will show global P-Setup auth status. API keys stay masked and raw secrets are not printed."],
  };
  const lines = warnings[command] || ["Will execute the requested operation."];
  return force ? [...lines, "Force mode: skip safe prompts, still stop for destructive or blocked actions."] : lines;
}

function parseEnvPairs(content: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const key = parseEnvLineKey(line);
    if (!key) continue;
    const value = line.slice(line.indexOf("=") + 1).trim();
    pairs[key] = unquoteEnvValue(value).value;
  }
  return pairs;
}

function parseEnvLineKey(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return null;
  const key = trimmed.slice(0, trimmed.indexOf("=")).trim().replace(/^export\s+/, "");
  return ENV_KEY_PATTERN.test(key) ? key : null;
}

function rewritePackageManagerCommand(command: string, pm: string): string {
  return command
    .replace(/^(npm|pnpm|yarn|bun)\s+install\b/, `${pm} install`)
    .replace(/^(npm|pnpm|yarn|bun)\s+run\s+/, `${pm} run `);
}
