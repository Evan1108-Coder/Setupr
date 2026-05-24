import meow from "meow";
import { showPreWarning } from "./preWarning.js";
import { showTransition } from "./transition.js";
import { launchTUI } from "./launcher.js";
import { runPlainMode } from "./plain.js";

const cli = meow(
  `
  Usage
    $ setup <command> [options]

  Commands
    setup     Full project setup (scan, install, configure)
    start     Detect and run project
    doctor    Diagnose environment health
    update    Check for dependency updates
    clean     Remove artifacts (--deps, --share, --all)
    env       Manage .env files (init, check, sync, smart)
    info      Show project summary
    list      List available scripts/commands
    run       Run a project script
    switch    Switch runtime version
    add       Smart add dependency
    remove    Remove dependency
    port      Check/find/kill port
    deps      Dependency tree, outdated, audit
    config    Manage p-setup config
    lock      Snapshot environment state
    diff      Compare current vs locked state
    logs      Tail project logs
    test      Run test suite
    build     Run build command
    deploy    Run deploy scripts
    open      Open in browser/IDE/repo

  Options
    --force     Skip all prompts
    --no-tui    Plain terminal output (alias: --plain)
    --plain     Same as --no-tui
    --help      Show help
    --version   Show version

  Examples
    $ setup
    $ setup doctor
    $ setup env smart
    $ setup --force
    $ setup clean --all
`,
  {
    importMeta: import.meta,
    flags: {
      force: { type: "boolean", default: false },
      noTui: { type: "boolean", default: false },
      plain: { type: "boolean", default: false },
    },
  }
);

export async function run() {
  const command = cli.input[0] || "setup";
  const subCommand = cli.input[1];
  const cwd = process.cwd();
  const isPlain = cli.flags.noTui || cli.flags.plain || !process.stdout.isTTY;

  // TUI commands
  const tuiCommands = ["setup", "start", "doctor", "update", "clean"];

  if (tuiCommands.includes(command) && !isPlain) {
    // Show pre-warning
    await showPreWarning(command, cwd, cli.flags.force);

    // Transition animation
    await showTransition(command);

    // Launch TUI
    await launchTUI(command as any, cwd, { cleanMode: subCommand as any, force: cli.flags.force });
  } else if (tuiCommands.includes(command) && isPlain) {
    await runPlainMode(command, cwd, subCommand);
  } else {
    // Non-TUI commands
    const { runNonTUICommand } = await import("../commands/plain/router.js");
    await runNonTUICommand(command, subCommand, cwd, { ...cli.flags, args: cli.input.slice(2) });
  }
}
