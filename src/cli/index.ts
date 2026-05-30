import meow from "meow";
import { resolve } from "path";
import { showPreWarning } from "./preWarning.js";
import { showTransition } from "./transition.js";
import { launchTUI } from "./launcher.js";
import { runPlainMode } from "./plain.js";
import { withInteractiveScreen } from "./terminalScreen.js";
import { helpPathFromInput, isHelpRequest, showHelp } from "./help.js";
import { createSetuprError, printPlainError } from "../errors/index.js";
import { knownCommandNames, noSubcommandNames, tuiCommandNames } from "./commandRegistry.js";
import { appendHistoryEvent } from "../state/project.js";
import { runSupervisorFromCli } from "../processes/manager.js";

const cli = meow(
  `
  Usage
    $ setup <command> [options]

  Commands
    setup       Full project setup (scan, install, configure)
    start       Detect and run project
    doctor      Diagnose environment health
    update      Check for dependency updates
    clean       Remove artifacts (--deps, --share, --all)

    env         Manage .env files (init, check, sync, smart)
    auth        Manage AI provider API keys and models
    info        Show project summary
    list        List available scripts/commands
    run         Run a project script
    switch      Switch runtime version
    add         Smart add dependency
    remove      Remove dependency
    port        Check/find/kill port
    deps        Dependency tree, outdated, audit
    config      Manage setupr config (show, set, reset, models)
    lock        Snapshot environment state
    diff        Compare current vs locked state
    logs        Tail project logs
    test        Run test suite
    build       Run build command
    deploy      Run deploy scripts
    open        Open in browser/IDE/repo

    git         Git workflows (init, hooks, flow, commit, branch, pr, stash, rebase, tag, release, status, log, sync, clean)
    init        Scaffold a new project (node, python, rust, go, templates)
    migrate     Migrate package manager (npm, yarn, pnpm, bun)
    ci          Generate CI/CD config (github, gitlab, bitbucket, circleci)
    docker      Dockerfile & compose (generate, compose, check)
    secrets     Encrypted secrets management (init, set, get, list, remove, export, import, rotate)
    templates   Project templates (new, list, save, remove)
    workspace   Monorepo workspace commands (list, run, exec, add, info, check)
    health      Project health checks (full, deps, security, outdated, size)
    share       Export/import project config (export, import, inspect)
    plugin      Plugin management (install, remove, list, info, enable, disable)
    lint        Run or setup linting (run, setup, fix)
    format      Run or setup code formatting (run, check, setup)
    scaffold    Generate project files (component, page, api, hook, model, test, service, middleware)

  Options
    --force     Skip all prompts
    --all       Clean everything removable (clean only)
    --deps      Clean installed dependencies (clean only)
    --share     Clean sensitive local files for sharing (clean only)
    --no-tui    Plain terminal output (alias: --plain)
    --plain     Same as --no-tui
    --help      Show help
    --version   Show version

  Examples
    $ setup
    $ setup doctor
    $ setup auth login
    $ setup env smart
    $ setup git flow feature my-feature
    $ setup init --template react-app
    $ setup ci github
    $ setup secrets set API_KEY
    $ setup --force
    $ setup clean --all
`,
  {
    importMeta: import.meta,
    autoHelp: false,
    flags: {
      force: { type: "boolean", default: false },
      all: { type: "boolean", default: false },
      deps: { type: "boolean", default: false },
      share: { type: "boolean", default: false },
      noTui: { type: "boolean", default: false },
      plain: { type: "boolean", default: false },
      key: { type: "string" },
      json: { type: "boolean", default: false },
      tui: { type: "boolean", default: false },
      smart: { type: "boolean", default: false },
      dryRun: { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      fix: { type: "boolean", default: false },
      verbose: { type: "boolean", default: false },
      quiet: { type: "boolean", default: false },
      watch: { type: "boolean", default: false },
      scope: { type: "string" },
      provider: { type: "string" },
      model: { type: "string" },
      timeout: { type: "number" },
      cwd: { type: "string" },
      template: { type: "string" },
      message: { type: "string" },
    },
  }
);

export async function run() {
  const explicitCommand = cli.input[0];
  if (explicitCommand === "_supervise" && await runSupervisorFromCli(cli.input)) {
    return;
  }
  const command = explicitCommand || "dashboard";
  if (isHelpRequest(command, cli.input, Boolean(cli.flags.help))) {
    showHelp(helpPathFromInput(command, cli.input, Boolean(cli.flags.help)));
    return;
  }

  const subCommand = resolveSubCommand(command, cli.input[1], cli.flags);
  const cwd = typeof cli.flags.cwd === "string" ? resolve(cli.flags.cwd) : process.cwd();
  if (!validateCliRequest(command, subCommand, cwd)) return;
  const isPlain = (cli.flags.noTui || cli.flags.plain || !process.stdout.isTTY) && !cli.flags.tui;
  const isBareAuth = command === "auth" && !subCommand;

  await recordCommandStart(cwd, command, subCommand, cli.input);
  try {
    await runCommandPath(command, subCommand, cwd, isPlain, isBareAuth);
    await recordCommandFinish(cwd, command, subCommand);
  } catch (err) {
    await recordCommandError(cwd, command, subCommand, err);
    throw err;
  }
}

async function runCommandPath(command: string, subCommand: string | undefined, cwd: string, isPlain: boolean, isBareAuth: boolean): Promise<void> {
  const tuiCommands = tuiCommandNames();
  const isAuthSubcommand = command === "auth" && Boolean(subCommand);

  if ((tuiCommands.has(command) || isBareAuth) && !isPlain && !isAuthSubcommand) {
    const confirmed = await showPreWarning(command, cwd, cli.flags.force, subCommand);
    if (!confirmed) return;

    await withInteractiveScreen(async () => {
      await showTransition(command);
      await launchTUI(command as any, cwd, { cleanMode: subCommand as any, force: cli.flags.force });
    }, { title: `Setupr ${command}` });
  } else if ((tuiCommands.has(command) || isBareAuth) && isPlain && !isAuthSubcommand) {
    if (command === "auth") {
      const { runNonTUICommand } = await import("../commands/plain/router.js");
      await runNonTUICommand(command, subCommand, cwd, { ...cli.flags, args: cli.input.slice(2) });
      return;
    }
    const needsConfirmation = command === "setup" || command === "clean";
    if (needsConfirmation) {
      const confirmed = await showPreWarning(command, cwd, cli.flags.force, subCommand, {
        requireConfirmation: true,
      });
      if (!confirmed) return;
    }
    await runPlainMode(command, cwd, subCommand, { force: cli.flags.force, json: cli.flags.json, watch: cli.flags.watch, fix: cli.flags.fix, yes: cli.flags.yes });
  } else {
    const { runNonTUICommand } = await import("../commands/plain/router.js");
    await runNonTUICommand(command, subCommand, cwd, { ...cli.flags, args: cli.input.slice(2) });
  }
}

function validateCliRequest(command: string, subCommand: string | undefined, cwd: string): boolean {
  const known = knownCommandNames();
  if (!known.has(command)) {
    return true;
  }

  const cleanFlags = [cli.flags.all, cli.flags.deps, cli.flags.share].filter(Boolean).length;
  if (cleanFlags > 1) {
    printPlainError(createSetuprError({
      code: "INVALID_FLAG_COMBINATION",
      command,
      cwd,
      details: ["Choose only one of --all, --deps, or --share."],
    }));
    return false;
  }
  if (command !== "clean" && cleanFlags > 0) {
    printPlainError(createSetuprError({
      code: "INVALID_FLAG",
      command,
      cwd,
      details: ["--all, --deps, and --share only apply to setup clean."],
    }));
    return false;
  }
  if (cli.flags.key && !(command === "auth" && subCommand === "set-key")) {
    printPlainError(createSetuprError({
      code: "INVALID_FLAG",
      command,
      subcommand: subCommand,
      cwd,
      details: ["--key only applies to setup auth set-key <provider>."],
    }));
    return false;
  }

  const noSubcommand = noSubcommandNames();
  if (subCommand && noSubcommand.has(command)) {
    printPlainError(createSetuprError({
      code: "UNKNOWN_SUBCOMMAND",
      command,
      subcommand: subCommand,
      cwd,
      details: [`${command} does not take a subcommand.`],
    }));
    return false;
  }
  if (command === "clean" && subCommand && !["deps", "share", "all"].includes(subCommand)) {
    printPlainError(createSetuprError({
      code: "CLEAN_MODE_INVALID",
      command: "clean",
      subcommand: subCommand,
      cwd,
    }));
    return false;
  }
  return true;
}

function resolveSubCommand(command: string, positional: string | undefined, flags: typeof cli.flags): string | undefined {
  if (command !== "clean") return positional;
  if (flags.all) return "all";
  if (flags.share) return "share";
  if (flags.deps) return "deps";
  return positional;
}

async function recordCommandStart(cwd: string, command: string, subCommand: string | undefined, input: string[]): Promise<void> {
  await appendHistoryEvent(cwd, {
    type: "command.start",
    message: `setupr ${[command === "dashboard" && input.length === 0 ? "" : command, subCommand].filter(Boolean).join(" ")}`.trim(),
    data: {
      command,
      subCommand: subCommand || null,
      args: input.map(maskArg),
      mode: cli.flags.plain || cli.flags.noTui ? "plain" : cli.flags.tui ? "tui" : "auto",
    },
  }).catch(() => undefined);
}

async function recordCommandFinish(cwd: string, command: string, subCommand: string | undefined): Promise<void> {
  await appendHistoryEvent(cwd, {
    type: "command.finish",
    message: `${command}${subCommand ? ` ${subCommand}` : ""} finished${process.exitCode ? ` with exit ${process.exitCode}` : ""}`,
    data: {
      command,
      subCommand: subCommand || null,
      exitCode: process.exitCode || 0,
    },
  }).catch(() => undefined);
}

async function recordCommandError(cwd: string, command: string, subCommand: string | undefined, err: unknown): Promise<void> {
  await appendHistoryEvent(cwd, {
    type: "command.error",
    message: `${command}${subCommand ? ` ${subCommand}` : ""} failed`,
    data: {
      command,
      subCommand: subCommand || null,
      error: err instanceof Error ? err.message : String(err),
    },
  }).catch(() => undefined);
}

function maskArg(value: string): string {
  if (/^(sk-|sk-ant-|ghp_|github_pat_|gsk_|AIza)/.test(value)) return "****";
  if (/[A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*=/i.test(value)) {
    return value.replace(/=.*/, "=****");
  }
  return value;
}
