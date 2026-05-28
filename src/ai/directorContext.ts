import type { ScanResult } from "../scanner/index.js";
import type { AppMessage, AppStore, EnvVar, LogEntry } from "../state/store.js";
import { describeDefaultModelSelection, getProviderEnvValue, PROVIDERS, type AIProvider } from "./models.js";
import { maskSensitiveValue } from "./setupFlow.js";

export interface DirectorContextInput {
  cwd: string;
  scan: ScanResult;
  contextDSL: string;
  store: AppStore;
  userText: string;
}

const SECRET_KEY_PATTERN =
  /(TOKEN|SECRET|PASSWORD|PASS|API_?KEY|PRIVATE|CREDENTIAL|AUTH|BEARER|SESSION|COOKIE)/i;

const COMMAND_CAPABILITIES = [
  { command: "setup", mode: "tui/plain", summary: "scan, plan, install, configure, verify, and explain setup" },
  { command: "start", mode: "tui/plain", summary: "detect and run the project start/dev command" },
  { command: "doctor", mode: "tui/plain", summary: "diagnose runtimes, dependencies, services, env, git, and terminal support" },
  { command: "update", mode: "tui/plain", summary: "check dependency updates and risky changes" },
  { command: "clean", mode: "tui/plain", summary: "remove dependencies, caches, build output, or share-sensitive files" },
  { command: "auth", mode: "tui/plain", summary: "manage AI provider keys and active model" },
  { command: "env", mode: "plain", summary: "init, check, sync, and smart-analyze project env files" },
  { command: "git", mode: "plain", summary: "git init, hooks, flow, commit, branch, pr, stash, rebase, tag, release, status, log, sync, clean, ignore, changelog, blame, cherry-pick, worktree, bisect, contributors, undo" },
  { command: "init", mode: "plain", summary: "scaffold a project from built-in stacks or templates" },
  { command: "migrate", mode: "plain", summary: "migrate package managers between npm, yarn, pnpm, and bun" },
  { command: "ci", mode: "plain", summary: "generate github, gitlab, bitbucket, or circleci config" },
  { command: "docker", mode: "plain", summary: "generate Dockerfile, compose files, and check Docker readiness" },
  { command: "secrets", mode: "plain", summary: "manage encrypted project-local secrets" },
  { command: "templates", mode: "plain", summary: "new, list, save, and remove project templates" },
  { command: "workspace", mode: "plain", summary: "list, run, exec, add, info, and check monorepo workspaces" },
  { command: "health", mode: "plain", summary: "run full, deps, security, outdated, and size health checks" },
  { command: "share", mode: "plain", summary: "export, import, and inspect shareable setup bundles" },
  { command: "plugin", mode: "plain", summary: "install, remove, list, inspect, enable, and disable plugins" },
  { command: "lint", mode: "plain", summary: "run, fix, or set up linting" },
  { command: "format", mode: "plain", summary: "run, check, or set up formatting" },
  { command: "scaffold", mode: "plain", summary: "generate components, pages, APIs, hooks, models, tests, services, and middleware" },
];

export function buildDirectorContextPacket(input: DirectorContextInput): string {
  const state = input.store.getState();
  const ctx = state.context;
  const packet = {
    kind: "p-setup-director-context",
    note: "Sanitized current snapshot. Secret values are masked before being sent to the live AI model.",
    userRequest: sanitizeForAI(input.userText),
    project: {
      cwd: input.cwd,
      projectName: state.projectName,
      dsl: input.contextDSL,
      scan: input.scan,
      fileTree: ctx?.fileTree || [],
      git: ctx?.git || { isRepo: false },
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      shell: process.env.SHELL || "unknown",
      term: process.env.TERM || "unknown",
      termProgram: process.env.TERM_PROGRAM || "unknown",
      columns: process.stdout.columns || ctx?.terminal.columns || 80,
      rows: process.stdout.rows || ctx?.terminal.rows || 24,
      locale: process.env.LANG || process.env.LC_ALL || "unknown",
      safeEnvironment: collectSafeEnvironmentSummary(),
    },
    ai: {
      activeModel: describeDefaultModelSelection(),
      configuredProviders: configuredProviders(),
    },
    capabilities: {
      help: ["setup help", "setup help <command>", "setup <command> --help"],
      commands: COMMAND_CAPABILITIES,
    },
    session: {
      activePanel: state.activePanel,
      panelCount: state.panelCount,
      isRunning: state.isRunning,
      isComplete: state.isComplete,
      elapsedMs: Date.now() - state.startTime,
      checkpointSaved: state.checkpointSaved,
      checkpointPath: state.checkpointPath,
      pendingPrompt: state.pendingPrompt
        ? {
            id: state.pendingPrompt.id,
            type: state.pendingPrompt.type,
            title: state.pendingPrompt.title,
            message: sanitizeForAI(state.pendingPrompt.message || ""),
            options: state.pendingPrompt.options?.map((option) => ({
              id: option.id,
              label: option.label,
              description: option.description,
              sensitive: option.sensitive,
            })),
            includeOther: state.pendingPrompt.includeOther,
            sensitive: state.pendingPrompt.sensitive,
          }
        : null,
    },
    plan: {
      currentStepIndex: state.currentStepIndex,
      steps: state.steps.map((step) => ({
        id: step.id,
        label: step.label,
        type: step.type,
        command: sanitizeForAI(step.command || ""),
        status: step.status,
        output: step.output ? sanitizeForAI(step.output) : undefined,
        error: step.error ? sanitizeForAI(step.error) : undefined,
      })),
    },
    tuiState: {
      envVars: state.envVars.map(maskEnvVarForContext),
      ports: state.ports,
      keyDeps: state.keyDeps,
      services: state.services,
      notices: state.notices.map((notice) => ({ ...notice, message: sanitizeForAI(notice.message) })),
      packageStats: {
        total: state.totalPackages,
        installed: state.installedPackages,
        deprecated: state.deprecatedCount,
        vulnerabilities: state.vulnerabilities,
        lockSynced: state.lockSynced,
      },
    },
    terminalDiary: state.logs.map(maskLogForContext),
    chatHistory: state.messages.map(maskMessageForContext),
  };

  return JSON.stringify(packet);
}

export function sanitizeForAI(text: string): string {
  return maskKnownSecretTokens(maskEnvAssignments(text));
}

function maskEnvVarForContext(envVar: EnvVar) {
  return {
    key: envVar.key,
    value: shouldMaskKey(envVar.key) ? maskSensitiveValue(envVar.key, envVar.value) : envVar.value,
    status: envVar.status,
    source: envVar.source,
  };
}

function maskLogForContext(log: LogEntry) {
  return {
    id: log.id,
    timestamp: log.timestamp,
    type: log.type,
    stepIndex: log.stepIndex,
    content: sanitizeForAI(log.content),
  };
}

function maskMessageForContext(message: AppMessage) {
  return {
    id: message.id,
    role: message.role,
    timestamp: message.timestamp,
    level: message.level,
    cost: message.cost,
    content: sanitizeForAI(message.content),
  };
}

function collectSafeEnvironmentSummary() {
  const visibleKeys = [
    "SHELL",
    "TERM",
    "TERM_PROGRAM",
    "COLORTERM",
    "LANG",
    "LC_ALL",
    "PWD",
    "HOME",
    "USER",
  ];
  const values: Record<string, string> = {};
  for (const key of visibleKeys) {
    if (process.env[key]) values[key] = key === "HOME" ? "~" : String(process.env[key]);
  }

  const secretLikeKeys = Object.keys(process.env)
    .filter((key) => shouldMaskKey(key))
    .sort();

  return {
    values,
    secretLikeKeysPresent: secretLikeKeys,
  };
}

function configuredProviders(): AIProvider[] {
  return (Object.keys(PROVIDERS) as AIProvider[]).filter((provider) => Boolean(getProviderEnvValue(provider)));
}

function maskEnvAssignments(text: string): string {
  return text.replace(
    /((?:^|[\s;])(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*)([^\s;]+)/g,
    (match, prefix: string, key: string, rawValue: string) => {
      if (!shouldMaskKey(key)) return match;
      const quote = rawValue[0] === "\"" || rawValue[0] === "'" ? rawValue[0] : "";
      const unquoted = quote && rawValue.endsWith(quote) ? rawValue.slice(1, -1) : rawValue;
      const masked = maskSensitiveValue(key, unquoted);
      return `${prefix}${quote}${masked}${quote}`;
    }
  );
}

function maskKnownSecretTokens(text: string): string {
  return text
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-****")
    .replace(/\bsk-ant-[A-Za-z0-9_-]{8,}\b/g, "sk-ant-****")
    .replace(/\bghp_[A-Za-z0-9_]{8,}\b/g, "ghp_****")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{8,}\b/g, "github_pat_****")
    .replace(/\bgsk_[A-Za-z0-9_]{8,}\b/g, "gsk_****");
}

function shouldMaskKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}
