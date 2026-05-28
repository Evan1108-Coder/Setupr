import chalk from "chalk";
import { ERROR_CATALOG } from "./catalog.js";
import type { PSetupError, PSetupErrorCode, PSetupErrorInput } from "./types.js";

export type { PSetupError, PSetupErrorCode, RecoveryAction } from "./types.js";

export function createPSetupError(input: { code: PSetupErrorCode } & Partial<PSetupErrorInput>): PSetupError {
  const template = ERROR_CATALOG[input.code];
  return {
    ...template,
    ...input,
    code: input.code,
    timestamp: Date.now(),
    details: dedupe([...(template.details || []), ...(input.details || [])]),
    nextSteps: dedupe([...(template.nextSteps || []), ...(input.nextSteps || [])]),
    recovery: [...(template.recovery || []), ...(input.recovery || [])],
    exitCode: input.exitCode ?? template.exitCode ?? 1,
  };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function renderPlainError(error: PSetupError): string {
  const icon = error.severity === "fatal" || error.severity === "error"
    ? "✗"
    : error.severity === "warning"
      ? "⚠"
      : "ℹ";
  const color = error.severity === "fatal" || error.severity === "error"
    ? chalk.red
    : error.severity === "warning"
      ? chalk.yellow
      : chalk.blue;
  const lines = [
    "",
    color(`  ${icon} ${error.title}`),
    chalk.dim(`  Code: ${error.code}${error.command ? ` · Command: ${error.command}${error.subcommand ? ` ${error.subcommand}` : ""}` : ""}`),
    `  ${error.explanation}`,
  ];
  if (error.cwd) lines.push(chalk.dim(`  Directory: ${error.cwd}`));
  if (error.details?.length) {
    lines.push("", chalk.bold("  Details"));
    for (const detail of error.details) lines.push(`  • ${detail}`);
  }
  if (error.canContinue !== undefined || error.forceBehavior) {
    lines.push("", chalk.bold("  What happens now"));
    lines.push(`  • ${error.canContinue ? "P-Setup can continue or recover from this." : "P-Setup should stop before doing more work."}`);
    if (error.forceBehavior) lines.push(`  • ${error.forceBehavior}`);
  }
  if (error.nextSteps?.length) {
    lines.push("", chalk.bold("  Next steps"));
    for (const step of error.nextSteps) lines.push(`  • ${step}`);
  }
  if (error.recovery?.length) {
    lines.push("", chalk.bold("  Recovery options"));
    for (const action of error.recovery) {
      lines.push(`  • ${action.label}${action.command ? chalk.dim(` — ${action.command}`) : ""}`);
    }
  }
  return lines.join("\n");
}

export function printPlainError(error: PSetupError): void {
  console.log(renderPlainError(error));
  if (error.exitCode && error.exitCode > 0) process.exitCode = error.exitCode;
}

export function errorSummary(error: PSetupError): string {
  return `${error.code}: ${error.title} — ${error.explanation}`;
}

export function fromUnknownError(error: unknown, context: Partial<PSetupErrorInput> = {}): PSetupError {
  if (isPSetupError(error)) {
    return createPSetupError({
      ...error,
      ...context,
      code: error.code,
      details: [...(error.details || []), ...(context.details || [])],
      cause: error.cause,
    });
  }
  const message = error instanceof Error ? error.message : String(error || "unknown error");
  return createPSetupError({
    ...context,
    code: "UNKNOWN_ERROR",
    details: [message],
    cause: error,
  });
}

function isPSetupError(error: unknown): error is PSetupError {
  const value = error as Partial<PSetupError> | undefined;
  return Boolean(value?.code && value.title && value.explanation && value.timestamp);
}

export function classifyCommandFailure(input: {
  command: string;
  cwd?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  stepLabel?: string;
  stepType?: string;
}): PSetupError {
  const combined = `${input.stderr || ""}\n${input.stdout || ""}`;
  const lower = combined.toLowerCase();
  let code: PSetupErrorCode = "COMMAND_FAILED";
  if (/command not found|not recognized|enoent/.test(lower)) code = "COMMAND_NOT_FOUND";
  else if (/permission denied|eacces|operation not permitted/.test(lower)) code = "FILESYSTEM_PERMISSION_DENIED";
  else if (/network|econnreset|enotfound|etimedout|timeout|could not resolve|fetch failed/.test(lower)) code = "NETWORK_UNAVAILABLE";
  else if (/peer dep|eresolve|dependency conflict|unable to resolve dependency/.test(lower) || input.stepType === "deps") code = "INSTALL_FAILED";
  else if (input.stepType === "script" && /build/i.test(input.stepLabel || input.command)) code = "BUILD_FAILED";
  else if (input.stepType === "script" && /test/i.test(input.stepLabel || input.command)) code = "TEST_FAILED";

  const excerpt = usefulExcerpt(input.stderr || input.stdout || "");
  return createPSetupError({
    code,
    command: input.command,
    cwd: input.cwd,
    details: [
      input.exitCode !== undefined ? `Exit code: ${input.exitCode}` : "",
      excerpt ? `Output: ${excerpt}` : "",
    ].filter(Boolean),
    canContinue: false,
    forceBehavior: "Force mode does not ignore failed commands; it only skips safe prompts.",
    metadata: {
      exitCode: input.exitCode,
      stdout: trimForMetadata(input.stdout || ""),
      stderr: trimForMetadata(input.stderr || ""),
      stepLabel: input.stepLabel,
      stepType: input.stepType,
    },
  });
}

export function classifyAIProviderError(error: unknown, context: Partial<PSetupErrorInput> = {}): PSetupError {
  const raw = error instanceof Error ? error.message : String(error || "");
  const lower = raw.toLowerCase();
  let code: PSetupErrorCode = "AI_PROVIDER_REQUEST_FAILED";
  if (/timed? out|timeout|abort/.test(lower)) code = "AI_PROVIDER_TIMEOUT";
  else if (/401|unauthorized|invalid api key|authentication/.test(lower)) code = "AI_PROVIDER_AUTH_FAILED";
  else if (/403|forbidden|access denied/.test(lower)) code = "AI_PROVIDER_AUTH_FAILED";
  else if (/429|rate limit|too many requests/.test(lower)) code = "AI_PROVIDER_RATE_LIMITED";
  else if (/quota|credit|insufficient balance|billing|exceeded/.test(lower)) code = "AI_PROVIDER_QUOTA_EXHAUSTED";
  else if (/500|502|503|504|unavailable|overloaded/.test(lower)) code = "AI_PROVIDER_UNAVAILABLE";
  else if (/json|parse|invalid response|protocol/.test(lower)) code = "AI_PROVIDER_PROTOCOL_ERROR";

  return createPSetupError({
    ...context,
    code,
    details: [sanitizeSecret(raw)],
    recovery: [
      { kind: "retry", label: "Retry this provider" },
      { kind: "switch-model", label: "Switch to another configured provider" },
      { kind: "continue", label: "Continue without AI where possible" },
    ],
    cause: error,
  });
}

export function sanitizeSecret(value: string): string {
  let result = value;
  result = result.replace(
    /([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*=)([^\s]+)/gi,
    (_, prefix: string, val: string) => {
      if (/^sk-ant-/i.test(val)) return `${prefix}sk-ant-****`;
      if (/^sk-/i.test(val)) return `${prefix}sk-****`;
      return `${prefix}****`;
    }
  );
  result = result.replace(/\bsk-ant-[A-Za-z0-9_-]{8,}\b/g, "sk-ant-****");
  result = result.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-****");
  result = result.replace(/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/g, "gh_****");
  result = result.replace(/\bgithub_pat_[A-Za-z0-9_]{8,}\b/g, "github_pat_****");
  result = result.replace(/\bgsk_[A-Za-z0-9_]{8,}\b/g, "gsk_****");
  result = result.replace(/\bAIza[A-Za-z0-9_-]{30,}\b/g, "AIza****");
  result = result.replace(/\bxai-[A-Za-z0-9_-]{8,}\b/g, "xai-****");
  return result;
}

function usefulExcerpt(value: string): string {
  return sanitizeSecret(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" | ")
    .slice(0, 600);
}

function trimForMetadata(value: string): string {
  return sanitizeSecret(value).slice(-4000);
}
