import type { SetupStep } from "../ai/planner.js";

export type SafetyRisk = "none" | "low" | "medium" | "high" | "critical";
export type SafetyDecision = "allow" | "confirm" | "block";

export interface SafetyEvaluation {
  decision: SafetyDecision;
  risk: SafetyRisk;
  reasons: string[];
  forceCanSkipConfirmation: boolean;
}

// Flag only commands that actually embed a secret: an inline `NAME=value` assignment to a
// credential-shaped variable, or a recognizable secret value literal. Matching bare words like
// "auth" or "token" produced false positives on legitimate commands (e.g. `npm i next-auth`).
const SECRET_ASSIGNMENT_PATTERN = /\b(?:API[_-]?KEY|ACCESS[_-]?KEY|AUTH[_-]?TOKEN|TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE[_-]?KEY|CREDENTIALS?)\s*=\s*[^\s'"]{6,}/i;
const SECRET_VALUE_PATTERN = /\b(?:sk-ant-[A-Za-z0-9-]{16,}|sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{16,}|gho_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|AIza[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{10,})\b|-----BEGIN[A-Z ]+PRIVATE KEY-----/;
const SHELL_META_PATTERN = /(;|&&|\|\||`|\$\(|>\s*\/|rm\s+-rf\s+(?:\/|\*|~|\$HOME))/;
const DESTRUCTIVE_PATTERN = /\b(rm|del|rmdir|trash|git\s+reset|git\s+clean|docker\s+system\s+prune)\b/i;
const INSTALL_PATTERN = /\b(npm|pnpm|yarn|bun|pip|poetry|cargo|go)\b.*\b(install|add|get|download|build)\b/i;

export function evaluateCommandSafety(command: string, options: { force?: boolean } = {}): SafetyEvaluation {
  const reasons: string[] = [];
  let risk: SafetyRisk = "none";
  let decision: SafetyDecision = "allow";

  if (SECRET_ASSIGNMENT_PATTERN.test(command) || SECRET_VALUE_PATTERN.test(command)) {
    risk = maxRisk(risk, "high");
    reasons.push("The command appears to embed a secret value or credential assignment in plaintext.");
  }

  if (SHELL_META_PATTERN.test(command)) {
    risk = maxRisk(risk, "medium");
    reasons.push("The command contains shell metacharacters or redirection.");
  }

  if (DESTRUCTIVE_PATTERN.test(command)) {
    risk = maxRisk(risk, "high");
    reasons.push("The command can delete files, reset git state, or prune local resources.");
  }

  if (/rm\s+-rf\s+(?:\/|\*|~|\$HOME)(?:\s|$)/i.test(command)) {
    risk = maxRisk(risk, "critical");
    reasons.push("The command targets a root, home, or wildcard delete.");
  }

  if (INSTALL_PATTERN.test(command)) {
    risk = maxRisk(risk, "low");
    reasons.push("The command can modify dependency state.");
  }

  if (/sudo\b|chmod\s+777|chown\s+-R|\bcurl\b.*\|\s*(sh|bash)/i.test(command)) {
    risk = maxRisk(risk, "critical");
    reasons.push("The command requires elevated or highly risky shell behavior.");
  }

  if (risk === "critical") decision = "block";
  // High risk always requires confirmation; --force cannot bypass it.
  else if (risk === "high") decision = "confirm";
  // Medium risk confirms by default, but --force may proceed with safe defaults.
  else if (risk === "medium") decision = options.force ? "allow" : "confirm";

  return {
    decision,
    risk,
    reasons,
    // --force only skips a confirmation it would otherwise raise (medium risk). Low/none have no
    // confirmation to skip; high/critical can never be skipped by force.
    forceCanSkipConfirmation: risk === "medium",
  };
}

export function evaluateStepSafety(step: SetupStep, options: { force?: boolean } = {}): SafetyEvaluation {
  if (!step.command) {
    return { decision: "allow", risk: "none", reasons: [], forceCanSkipConfirmation: true };
  }
  return evaluateCommandSafety(step.command, options);
}

function maxRisk(a: SafetyRisk, b: SafetyRisk): SafetyRisk {
  const order: SafetyRisk[] = ["none", "low", "medium", "high", "critical"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}
