# Setupr

> AI-powered project-control CLI that detects project stacks, plans setup, installs dependencies, configures environments, and verifies local health.

![Status](https://img.shields.io/badge/status-beta-6b7280) ![License](https://img.shields.io/github/license/Evan1108-Coder/Setupr)

**TypeScript CLI | stack detection | setup automation | project doctor | terminal dashboard**

## At A Glance

- Public npm package: `@evan-coder/setupr`
- Installed commands: `setupr` and legacy `setup`
- Public repo: https://github.com/Evan1108-Coder/Setupr
- Maintenance snapshot: [docs/project-snapshot.md](docs/project-snapshot.md)
- Full command reference: [docs/COMMANDS.md](docs/COMMANDS.md)
- Full feature reference: [docs/FEATURES.md](docs/FEATURES.md)
- Security policy: [SECURITY.md](SECURITY.md)

> Status: beta. Setupr is usable as a CLI today, but stack-specific setup paths should keep getting real-world test coverage before a 1.0-stable claim.

Setupr is for developers who clone projects often and do not want to manually guess install commands, runtime versions, environment files, ports, or verification steps.

## Visual Snapshot

These visuals are generated from the actual repository structure and project workflow, not placeholders.

![Repository file mix](docs/assets/repo-file-mix.svg)

![Project workflow](docs/assets/workflow.svg)

## Screenshots

Real output captured from the Setupr CLI (`@evan-coder/setupr`) running against this repository.

**`setupr status` — project health, git, env, processes, and recent history at a glance:**

![setupr status](docs/images/screenshot-status.png)

**`setupr doctor` — runtime, package-manager, and AI-director environment diagnosis:**

![setupr doctor](docs/images/screenshot-doctor.png)

**`setupr health` — full project health check with a pass/warn/fail score:**

![setupr health](docs/images/screenshot-health.png)

**`setupr status --json` — machine-readable output for CI/CD and scripting:**

![setupr status --json](docs/images/screenshot-json.png)

## Architecture

![Architecture](docs/images/architecture.jpg)

*Stack detection, AI-powered planning, guided TUI setup, and project health monitoring in one CLI.*

## Installation

Run without installing globally:

```bash
npx @evan-coder/setupr
```

Or install globally:

```bash
npm install -g @evan-coder/setupr
```

The npm package is published under the owned scope `@evan-coder/setupr`, but the installed terminal command is still:

```bash
setupr
```

## Quick Start

```bash
# Open the project dashboard / home screen
setupr

# Full project setup: scan, plan, install/configure, verify
setupr setup

# Configure Setupr AI once, globally
setupr auth login

# Use fewer prompts while still stopping for serious blockers
setupr setup --force

# Plain terminal output for CI, SSH, or piping
setupr setup --plain
```

## Key Features

- **Smart Detection** - Detects languages, frameworks, package managers, services, and monorepos.
- **AI Director Runtime** - Reads bounded project context, compresses docs, plans actions, explains decisions, and resumes from checkpoints.
- **Multi-Provider AI** - OpenAI, Anthropic, Google, Groq, MiniMax, Moonshot, and GitHub Models.
- **Project Dashboard** - Health, git, env, process, history, and command summaries in one TUI.
- **Environment Management** - Interactive `.env` editor, `.env.example` sync, validation, and guarded force behavior.
- **Verification & Security** - Test workflows, smoke checks, defensive scans, reports, and local baselines.
- **Process Management** - Start, list, log, restart, and stop Setupr-managed processes.
- **Plugin System** - Extend commands, scanners, planners, doctor checks, fixers, and TUI/dashboard panels.
- **Central Safety Policy** - Medium/high-risk actions require confirmation; critical actions are blocked. `--force` cannot bypass high-risk or critical safety blockers.

See [docs/FEATURES.md](docs/FEATURES.md) for detailed feature documentation.

## Commands

### TUI Commands

| Command | Description |
|---------|-------------|
| `setupr` / `dashboard` | Project dashboard with health, git, env, processes, and history |
| `setup` | Full project setup: scan, install, configure, verify |
| `chat <question>` | AI director chat TUI for project questions and steering |
| `status` | Dashboard/status view with plain, JSON, or TUI output |
| `start` | Start and track a managed project process |
| `doctor` | Diagnose environment health |
| `update` | Check dependency updates |
| `clean` | Review and remove artifacts |
| `env` | Open the `.env` editor TUI |
| `auth` | Manage global AI provider API keys and models |

See [docs/COMMANDS.md](docs/COMMANDS.md) for the full command reference, including non-TUI commands, grouped workflows, flags, and keyboard controls.

## Flags

| Flag | Description |
|------|-------------|
| `--force` | Skip safe prompts, stop for blockers and destructive/high-risk choices |
| `--no-tui` / `--plain` | Plain terminal output for CI/CD, piping, SSH |
| `--deps` | With `clean`, remove dependency/cache artifacts |
| `--share` | With `clean`, remove sensitive/local-only files before sharing |
| `--all` | With `clean`, remove dependencies, build output, caches, and local env files |

## TUI Behavior

- Arrow keys move between neighboring panels.
- Tab and Shift+Tab move focus through panels.
- Mouse focus works in terminals that support SGR mouse events.
- Inputs stay anchored to the bottom of their panel.
- Long input wraps inside the box and scrolls after the line cap.
- Prompt cards can show options, `Other...`, or text/secret input.
- The TUI uses the terminal alternate screen and restores the original shell on exit.
- Setupr does not force a background color; iTerm2, Ghostty, Terminal.app, and other terminal profiles keep their own theme/background.

Setupr TUIs share the same visual grammar: blue uppercase panel titles, thin blue borders, yellow focused borders/actions, green success states, yellow warnings/current work, and red failures. Each command still gets a command-specific board rather than one universal layout.

## Configuration

Global config:

```text
~/.setupr/config.json
```

Global provider API keys:

```text
~/.setupr/secrets.json
```

Manage provider keys with:

```bash
setupr auth login
setupr auth list
setupr auth test
setupr auth use openai/gpt-4.1-mini
```

Project-level config:

```json
{
  "language": "TypeScript",
  "framework": "Next.js",
  "runtime": "node",
  "packageManager": "pnpm"
}
```

## Release Smoke Testing

Before publishing or after touching scanner, error, auth, env, command execution, or TUI code, run:

```bash
npm run typecheck
npm run lint
npm test
npm run smoke:fixtures
npm run smoke:fixtures:tui
```

For local package/install smoke:

```bash
pkg=$(npm pack --silent)
npm exec --yes --package "./$pkg" -- setupr --version
npx --yes "file:$(pwd)/$pkg" --version
npm publish --dry-run
rm -f "$pkg"
```

Use `file:` or `--package` for tarball checks. A bare `npx ./$pkg` is treated like an executable file path and fails with a permission error. Scoped packages must be public when published, so `package.json` includes `publishConfig.access = "public"`.

## Requirements

- Node.js >= 18.0.0 for the published CLI
- Node.js 20+ recommended for repository development and CI test tooling
- Terminal with Unicode support for TUI mode

## License

MIT
