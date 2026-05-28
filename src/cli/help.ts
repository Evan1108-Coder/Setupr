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
    { name: "git", summary: "Git workflows, release helpers, hooks, branches, PRs, and history tools." },
    { name: "init", summary: "Scaffold a new project from built-in stacks or templates." },
    { name: "migrate", summary: "Migrate the project package manager." },
    { name: "ci", summary: "Generate CI/CD configuration." },
    { name: "docker", summary: "Generate Dockerfile and compose files, or check Docker readiness." },
    { name: "secrets", summary: "Manage encrypted project secrets." },
    { name: "templates", summary: "Create, list, save, and remove project templates." },
    { name: "workspace", summary: "Inspect and operate on monorepo workspaces." },
    { name: "health", summary: "Run project health, dependency, security, size, and outdated checks." },
    { name: "share", summary: "Export, import, or inspect shareable project setup bundles." },
    { name: "plugin", summary: "Install, remove, inspect, enable, or disable P-Setup plugins." },
    { name: "lint", summary: "Run, fix, or set up linting." },
    { name: "format", summary: "Run, check, or set up formatting." },
    { name: "scaffold", summary: "Generate common files such as components, pages, APIs, tests, and services." },
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
  git: {
    name: "git",
    summary: "Git workflows and repository helpers.",
    usage: "setup git <command> [options]",
    commands: [
      { name: "init", summary: "Initialize git and generate a stack-aware .gitignore." },
      { name: "hooks", summary: "Install or remove useful git hooks." },
      { name: "flow", summary: "Create and finish feature, hotfix, and release branches." },
      { name: "commit", summary: "Stage and commit changes with optional conventional messages." },
      { name: "branch", summary: "Create, list, delete, or clean branches." },
      { name: "pr", summary: "Open or prepare pull request flows." },
      { name: "stash", summary: "Save, list, pop, or drop stashes." },
      { name: "rebase", summary: "Run guided rebase workflows." },
      { name: "tag", summary: "Create and list tags." },
      { name: "release", summary: "Prepare a release commit/tag flow." },
      { name: "status", summary: "Show concise repository status." },
      { name: "log", summary: "Show recent history." },
      { name: "sync", summary: "Pull and push the current branch." },
      { name: "clean", summary: "Clean git-ignored files after confirmation." },
      { name: "ignore", summary: "Generate or update .gitignore." },
      { name: "changelog", summary: "Generate changelog content from commits." },
      { name: "blame", summary: "Show blame for a file." },
      { name: "cherry-pick", summary: "Cherry-pick a commit." },
      { name: "worktree", summary: "Manage git worktrees." },
      { name: "bisect", summary: "Start or continue bisect workflows." },
      { name: "contributors", summary: "Show repository contributors." },
      { name: "undo", summary: "Undo commit, stage, or local changes with safeguards." },
    ],
    options: [
      { name: "--force", summary: "Skip ordinary confirmations where the git command supports it." },
    ],
    examples: ["setup git status", "setup git flow feature ui-polish", "setup git commit --force", "setup git undo stage"],
  },
  init: {
    name: "init",
    summary: "Scaffold a new project.",
    usage: "setup init [stack|name] [options]",
    options: [
      { name: "--template <name>", summary: "Use a named template when supported." },
      { name: "--force", summary: "Overwrite generated files where supported." },
    ],
    examples: ["setup init node", "setup init python", "setup init --template react-app"],
  },
  migrate: {
    name: "migrate",
    summary: "Migrate package manager metadata and lockfiles.",
    usage: "setup migrate <npm|yarn|pnpm|bun> [--force]",
    options: [
      { name: "--force", summary: "Proceed through supported destructive replacement steps." },
    ],
    examples: ["setup migrate pnpm", "setup migrate npm --force"],
  },
  ci: {
    name: "ci",
    summary: "Generate CI/CD configuration for the current project.",
    usage: "setup ci <github|gitlab|bitbucket|circleci>",
    examples: ["setup ci github", "setup ci gitlab"],
  },
  docker: {
    name: "docker",
    summary: "Generate Docker assets and check Docker readiness.",
    usage: "setup docker <generate|compose|check> [options]",
    commands: [
      { name: "generate", summary: "Generate a Dockerfile for the detected stack." },
      { name: "compose", summary: "Generate docker-compose.yml for app services." },
      { name: "check", summary: "Check Docker availability and project Docker files." },
    ],
    options: [
      { name: "--force", summary: "Overwrite existing generated Docker files." },
    ],
    examples: ["setup docker generate", "setup docker compose --force", "setup docker check"],
  },
  secrets: {
    name: "secrets",
    summary: "Encrypted project-local secrets management.",
    usage: "setup secrets <init|set|get|list|remove|export|import|rotate> [name] [value]",
    commands: [
      { name: "init", summary: "Initialize encrypted secret storage." },
      { name: "set", summary: "Store a secret value." },
      { name: "get", summary: "Read a secret value." },
      { name: "list", summary: "List stored secret names without values." },
      { name: "remove", summary: "Remove a secret." },
      { name: "export", summary: "Export secrets for migration." },
      { name: "import", summary: "Import exported secrets." },
      { name: "rotate", summary: "Rotate the local encryption key." },
    ],
    examples: ["setup secrets init", "setup secrets set API_KEY", "setup secrets list"],
  },
  templates: {
    name: "templates",
    summary: "Project template management.",
    usage: "setup templates <new|list|save|remove> [name-or-url]",
    commands: [
      { name: "new", summary: "Create a project from a GitHub repo or saved template." },
      { name: "list", summary: "List saved templates." },
      { name: "save", summary: "Save the current project as a reusable template." },
      { name: "remove", summary: "Remove a saved template." },
    ],
    examples: ["setup templates list", "setup templates new user/repo", "setup templates save api-starter"],
  },
  workspace: {
    name: "workspace",
    summary: "Monorepo workspace commands.",
    usage: "setup workspace <list|run|exec|add|info|check> [args]",
    commands: [
      { name: "list", summary: "List workspace packages." },
      { name: "run", summary: "Run a script across workspaces." },
      { name: "exec", summary: "Execute a command across workspaces." },
      { name: "add", summary: "Add a dependency to a workspace." },
      { name: "info", summary: "Show workspace metadata." },
      { name: "check", summary: "Check workspace consistency." },
    ],
    examples: ["setup workspace list", "setup workspace run test", "setup workspace check"],
  },
  health: {
    name: "health",
    summary: "Project health checks.",
    usage: "setup health [full|deps|security|outdated|size]",
    commands: [
      { name: "full", summary: "Run all health checks." },
      { name: "deps", summary: "Check dependency health." },
      { name: "security", summary: "Run security-oriented checks." },
      { name: "outdated", summary: "Check outdated dependencies." },
      { name: "size", summary: "Report project size signals." },
    ],
    examples: ["setup health", "setup health security", "setup health size"],
  },
  share: {
    name: "share",
    summary: "Export and import shareable setup bundles.",
    usage: "setup share <export|import|inspect> [file]",
    commands: [
      { name: "export", summary: "Create a shareable project setup bundle." },
      { name: "import", summary: "Apply a setup bundle." },
      { name: "inspect", summary: "Inspect a setup bundle before applying it." },
    ],
    examples: ["setup share export", "setup share inspect p-setup-share.json", "setup share import p-setup-share.json"],
  },
  plugin: {
    name: "plugin",
    summary: "P-Setup plugin management.",
    usage: "setup plugin <install|remove|list|info|enable|disable> [name-or-url]",
    commands: [
      { name: "install", summary: "Install a plugin from npm or git." },
      { name: "remove", summary: "Remove an installed plugin." },
      { name: "list", summary: "List installed plugins." },
      { name: "info", summary: "Show plugin metadata." },
      { name: "enable", summary: "Enable a plugin." },
      { name: "disable", summary: "Disable a plugin." },
    ],
    examples: ["setup plugin list", "setup plugin install p-setup-plugin-example", "setup plugin disable my-plugin"],
  },
  lint: {
    name: "lint",
    summary: "Run or configure linting.",
    usage: "setup lint <run|setup|fix> [--force]",
    commands: [
      { name: "run", summary: "Run the detected lint command." },
      { name: "setup", summary: "Set up linting for the detected stack." },
      { name: "fix", summary: "Run lint fixes where supported." },
    ],
    examples: ["setup lint run", "setup lint fix", "setup lint setup --force"],
  },
  format: {
    name: "format",
    summary: "Run or configure formatting.",
    usage: "setup format <run|check|setup> [--force]",
    commands: [
      { name: "run", summary: "Format files with the detected formatter." },
      { name: "check", summary: "Check formatting without writing changes." },
      { name: "setup", summary: "Set up formatting for the detected stack." },
    ],
    examples: ["setup format run", "setup format check", "setup format setup"],
  },
  scaffold: {
    name: "scaffold",
    summary: "Generate common project files.",
    usage: "setup scaffold <component|page|api|hook|model|test|service|middleware> <name>",
    commands: [
      { name: "component", summary: "Generate a UI component." },
      { name: "page", summary: "Generate a page/route file." },
      { name: "api", summary: "Generate an API route/handler." },
      { name: "hook", summary: "Generate a hook." },
      { name: "model", summary: "Generate a model." },
      { name: "test", summary: "Generate a test file." },
      { name: "service", summary: "Generate a service module." },
      { name: "middleware", summary: "Generate middleware." },
    ],
    examples: ["setup scaffold component Button", "setup scaffold api users", "setup scaffold test src/lib/math.ts"],
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
