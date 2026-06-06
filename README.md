# Setupr

> Status: beta. Setupr is usable as a CLI today, but some stack-specific setup paths still need more real-world testing.

Setupr is for developers who clone projects often and do not want to manually guess install commands, runtime versions, environment files, ports, or verification steps.

## Why Use Setupr?

- Detects the project stack before running setup commands.
- Creates a setup plan instead of blindly installing dependencies.
- Helps configure environment files from examples.
- Verifies the project after setup so failures are visible early.
- Keeps useful project health, process, and history context in one CLI.

## Current Limitations

- AI-assisted flows require provider configuration.
- Unusual private/internal stacks may need manual confirmation.
- Destructive or ambiguous actions should still be reviewed before accepting them.

Intelligent project setup & management CLI. Auto-detects your stack, installs dependencies, configures environments, and keeps projects healthy. Supports 20+ languages with AI-assisted workflows. Features rich TUI with keyboard navigation, real-time status, and smart caching for near-zero AI costs.

## Architecture

![Architecture](docs/images/architecture.jpg)

*Stack detection, AI-powered planning, guided TUI setup, and project health monitoring in one CLI.*

## Installation

```bash
npx setupr
```

Or install globally:

```bash
npm install -g setupr
```

## Quick Start

```bash
# Open the project dashboard / home screen
setupr

# Full project setup (scan, plan, install/configure, verify)
setupr setup

# Configure Setupr AI once, globally
setupr auth login

# With minimal prompts (CI-friendly)
setupr setup --force

# Plain terminal output (no TUI)
setupr setup --plain
```

## Key Features

- **Smart Detection** — Auto-detects 20+ languages, 20+ frameworks, package managers, services, and monorepos
- **3-Tier AI Intelligence** — Pattern matching (free) → cached responses (free) → live AI (only for novel situations)
- **7 AI Providers** — OpenAI, Anthropic, Google, Groq, MiniMax, Moonshot, GitHub Models (25+ models)
- **AI Director Runtime** — Reads project context, compresses docs, proposes structured actions, resumes from checkpoints
- **Agent-Guided TUI** — Interactive timeline with AI decisions, user messages, option cards, and plan steering
- **Safety Policy** — Safe installs run freely, medium/high-risk actions require confirmation, critical actions are blocked
- **Environment Management** — Interactive `.env` editor, init from `.env.example`, missing-variable checks, smart auto-fill
- **Checkpoint & Resume** — Setup state persists across terminals and reboots
- **Verification & Security** — Test suites, smoke checks, defensive security scans, and reports
- **Plugin System** — Extend with commands, scanners, planners, doctor checks, and TUI panels
- **Project Dashboard** — Health, git, env, processes, history, and quick commands in one view

See [docs/FEATURES.md](docs/FEATURES.md) for detailed feature documentation.

## Commands

### TUI Commands (Rich Interactive UI)

| Command | Description |
|---------|-------------|
| `setupr` / `dashboard` | Project dashboard with health, git, env, processes, history |
| `setup` | Full project setup — scan, install, configure, verify |
| `chat <question>` | AI director chat TUI for project questions and steering |
| `status` | Dashboard/status view (plain, JSON, or TUI) |
| `start` | Start and track a managed project process |
| `doctor` | Diagnose environment health |
| `update` | Check for dependency updates |
| `clean` | Review and remove artifacts |
| `env` | Open the .env editor TUI |
| `auth` | Manage global AI provider API keys and models |

See [docs/COMMANDS.md](docs/COMMANDS.md) for the full command reference including all non-TUI commands.

## Flags

| Flag | Description |
|------|-------------|
| `--force` | Skip safe prompts, stop only for blockers or destructive choices |
| `--no-tui` / `--plain` | Plain terminal output for CI/CD, piping, SSH |
| `--deps` | With `clean`, remove dependency/cache artifacts |
| `--share` | With `clean`, remove sensitive/local-only files before sharing |
| `--all` | With `clean`, remove dependencies, build output, caches, and local env files |

## Configuration

Global config: `~/.setupr/config.json`. Provider API keys: `~/.setupr/secrets.json` (managed with `setupr auth`).

Project-level config via `.setupr.json`:

```json
{
  "language": "TypeScript",
  "framework": "Next.js",
  "runtime": "node",
  "packageManager": "pnpm"
}
```

## Requirements

- Node.js >= 18.0.0
- Terminal with Unicode support (for TUI mode)

## License

MIT
