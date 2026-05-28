import chalk from "chalk";
import { createPSetupError, printPlainError } from "../errors/index.js";

interface HelpNode {
  name: string;
  summary: string;
  usage: string;
  commands?: Array<{ name: string; summary: string; usage?: string }>;
  options?: Array<{ name: string; summary: string }>;
  examples?: string[];
}

const GLOBAL_HELP: HelpNode = {
  name: "setup",
  summary: "Intelligent project setup and management CLI.",
  usage: "setup <command> [options]",
  commands: [
    { name: "setup", summary: "Full project setup with agent-guided TUI or plain mode." },
    { name: "start", summary: "Detect and run the project start/dev command." },
    { name: "doctor", summary: "Diagnose runtimes, dependencies, services, env files, and terminal support." },
    { name: "update", summary: "Check dependency updates and warn about risky changes." },
    { name: "clean", summary: "Remove generated artifacts; supports deps, share, and all modes." },
    { name: "env", summary: "Manage project .env files from .env.example." },
    { name: "auth", summary: "Manage P-Setup AI provider API keys and models." },
    { name: "config", summary: "Manage global P-Setup preferences." },
    { name: "info", summary: "Show project summary." },
    { name: "list", summary: "List available project scripts." },
    { name: "run", summary: "Run a project script." },
    { name: "switch", summary: "Switch runtime version." },
    { name: "add", summary: "Install a dependency using the detected package manager." },
    { name: "remove", summary: "Remove a dependency using the detected package manager." },
    { name: "port", summary: "Check common ports or one specific port." },
    { name: "deps", summary: "Show dependency tree and audit information." },
    { name: "lock", summary: "Snapshot environment state." },
    { name: "diff", summary: "Compare current state with a locked state." },
    { name: "logs", summary: "Show recent project logs." },
    { name: "test", summary: "Run the project test script." },
    { name: "build", summary: "Run the project build script." },
    { name: "deploy", summary: "Run the project deploy script." },
    { name: "open", summary: "Open project browser, repository, or IDE target." },
    { name: "help", summary: "Show global or command-specific help." },
  ],
  options: [
    { name: "--force", summary: "Skip safe prompts; still stop for destructive/blocking cases." },
    { name: "--no-tui, --plain", summary: "Disable rich TUI and use plain output." },
    { name: "--help", summary: "Show help." },
    { name: "--version", summary: "Show version." },
  ],
  examples: ["setup", "setup help auth", "setup auth login", "setup env init --force"],
};

const HELP_NODES: Record<string, HelpNode> = {
  setup: {
    name: "setup",
    summary: "Scan, plan, install/configure, verify, and explain a project setup.",
    usage: "setup setup [--force] [--plain|--no-tui]",
    options: [
      { name: "--force", summary: "Use safe defaults and ask only for blockers." },
      { name: "--plain, --no-tui", summary: "Run without the TUI." },
    ],
    examples: ["setup", "setup setup --force", "setup setup --plain --force"],
  },
  auth: {
    name: "auth",
    summary: "Manage global P-Setup AI provider API keys and active model.",
    usage: "setup auth <command> [options]",
    commands: [
      { name: "login", summary: "Guided provider API key setup." },
      { name: "list", summary: "List providers and masked API key status." },
      { name: "status", summary: "Show active model, selected provider, and key source." },
      { name: "set-key", summary: "Save a provider API key globally." },
      { name: "remove", summary: "Remove one saved provider API key." },
      { name: "logout", summary: "Alias for remove." },
      { name: "test", summary: "Send tiny connectivity checks to configured providers." },
      { name: "models", summary: "Show supported models and availability." },
      { name: "use", summary: "Set the active model globally." },
      { name: "doctor", summary: "Run deeper auth diagnostics." },
      { name: "migrate", summary: "Move P-Setup provider keys from project .env into global auth." },
      { name: "reset", summary: "Remove all saved provider API keys after confirmation." },
    ],
    options: [
      { name: "--key <value>", summary: "Provide API key inline; safer to omit and use hidden prompt." },
      { name: "--force", summary: "Skip confirmations for replace/remove/reset and allow empty env creation where supported." },
      { name: "--plain", summary: "Use plain output." },
    ],
    examples: [
      "setup auth login",
      "setup auth set-key github",
      "setup auth test github",
      "setup auth use openai/gpt-4.1-mini",
      "setup auth migrate --force",
    ],
  },
  "auth set-key": {
    name: "auth set-key",
    summary: "Save one provider API key in global P-Setup auth storage.",
    usage: "setup auth set-key <provider> [--key <api-key>] [--force]",
    options: [
      { name: "--key <api-key>", summary: "Use inline value; may be visible in shell history." },
      { name: "--force", summary: "Replace an existing saved key without confirmation." },
    ],
    examples: ["setup auth set-key github", "setup auth set-key minimax --force"],
  },
  "auth test": {
    name: "auth test",
    summary: "Test one or all configured AI providers with tiny requests.",
    usage: "setup auth test [provider]",
    examples: ["setup auth test", "setup auth test github"],
  },
  env: {
    name: "env",
    summary: "Manage the project .env file from .env.example.",
    usage: "setup env <init|check|sync|smart> [--force]",
    commands: [
      { name: "init", summary: "Create .env from .env.example. Without .env.example, requires --force to create empty .env." },
      { name: "check", summary: "Report missing values required by .env.example." },
      { name: "sync", summary: "Reorder/update .env structure from .env.example while preserving values." },
      { name: "smart", summary: "Analyze missing, empty, invalid, extra, and changed env values." },
    ],
    options: [
      { name: "--force", summary: "With init, overwrite existing .env or create empty .env when no .env.example exists." },
    ],
    examples: ["setup env init", "setup env init --force", "setup env check", "setup env smart"],
  },
  clean: {
    name: "clean",
    summary: "Remove generated or local-only artifacts.",
    usage: "setup clean [deps|share|all] [--force] [--plain]",
    options: [
      { name: "--deps", summary: "Remove dependency/install artifacts." },
      { name: "--share", summary: "Remove local sensitive/share-sensitive files." },
      { name: "--all", summary: "Remove dependencies, build outputs, caches, and local env files." },
      { name: "--force", summary: "Skip confirmation." },
    ],
    examples: ["setup clean deps", "setup clean --share --force", "setup clean all --plain --force"],
  },
  config: {
    name: "config",
    summary: "Manage global P-Setup preferences.",
    usage: "setup config <show|set|reset|models>",
    commands: [
      { name: "show", summary: "Show current config." },
      { name: "set", summary: "Set model, theme, confirm, autoupdate, or ai." },
      { name: "reset", summary: "Restore defaults." },
      { name: "models", summary: "Show model catalog. Auth commands are preferred for model/auth work." },
    ],
    examples: ["setup config show", "setup config set theme light", "setup auth models"],
  },
};

export function showHelp(path: string[] = []): boolean {
  const normalized = normalizePath(path);
  const key = normalized.join(" ");
  const node = key ? HELP_NODES[key] || HELP_NODES[normalized[0]] : GLOBAL_HELP;
  if (!node) {
    printPlainError(createPSetupError({
      code: "UNKNOWN_SUBCOMMAND",
      command: "help",
      subcommand: path.join(" "),
      details: ["Run setup help to list all commands."],
    }));
    return false;
  }
  renderHelp(node);
  return true;
}

export function isHelpRequest(command: string, input: string[], helpFlag: boolean): boolean {
  return command === "help" || helpFlag || input.includes("help");
}

export function helpPathFromInput(command: string, input: string[], helpFlag: boolean): string[] {
  if (command === "help") return input.slice(1);
  if (helpFlag) return input.slice(0, 2).filter((item) => item !== "--help");
  const helpIndex = input.indexOf("help");
  return [...input.slice(0, helpIndex), ...input.slice(helpIndex + 1)].slice(0, 2);
}

function renderHelp(node: HelpNode): void {
  console.log(chalk.blue.bold(`\n  ${node.name}`));
  console.log(chalk.white(`  ${node.summary}\n`));
  console.log(chalk.yellow("  Usage"));
  console.log(chalk.dim(`    ${node.usage}\n`));

  if (node.commands?.length) {
    console.log(chalk.yellow("  Commands"));
    for (const command of node.commands) {
      console.log(`    ${chalk.green(command.name.padEnd(12))} ${command.summary}`);
    }
    console.log("");
  }

  if (node.options?.length) {
    console.log(chalk.yellow("  Options"));
    for (const option of node.options) {
      console.log(`    ${chalk.cyan(option.name.padEnd(20))} ${option.summary}`);
    }
    console.log("");
  }

  if (node.examples?.length) {
    console.log(chalk.yellow("  Examples"));
    for (const example of node.examples) {
      console.log(chalk.dim(`    $ ${example}`));
    }
    console.log("");
  }
}

function normalizePath(path: string[]): string[] {
  return path
    .filter(Boolean)
    .filter((item) => item !== "--help" && item !== "-h")
    .slice(0, 2);
}
