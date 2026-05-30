# Setup Guide

## Prerequisites

- Node.js 18 or later
- A terminal with Unicode support (for TUI features)
- npm, yarn, or pnpm

## Installation

### Via npx (recommended)

```bash
npx setupr
```

This runs Setupr without installing it globally.

### Global Installation

```bash
npm install -g setupr
```

After installation, the `setup` command is available globally:

```bash
setup
setup doctor
setup info
```

### Command Discovery

Use the built-in help tree when you are not sure which workflow to run:

```bash
setup help
setup help git
setup help docker
setup workspace --help
```

The rich help output lists the full command surface, including setup, auth, env, git, CI, Docker, secrets, templates, workspace, health, test, security, share, plugin, lint, format, and scaffold commands.

### Development Setup

```bash
git clone https://github.com/Evan1108-Coder/Setupr.git
cd Setupr
npm install
npm run build
node dist/setup.js --help
```

## First Run

1. Navigate to any project directory
2. Run `setup` (or `npx setupr`)
3. Setupr will:
   - Display a pre-execution warning
   - Ask you to confirm (press Enter)
   - Launch the TUI
   - Scan your project
   - Plan setup steps and show the agent's reasoning in the main panel
   - Ask for missing environment values or risky choices only when needed
   - Confirm the final plan before execution
   - Execute setup steps
   - Show a completion summary

You can steer the agent from the persistent input at the bottom of the TUI. For example, paste multiple environment values as `KEY=value` lines, choose `Other...` to override a decision, or type instructions such as `skip build` before confirming the plan.

## AI Features (Optional)

To enable AI-powered features, save at least one provider key in global Setupr auth storage:

```bash
setup auth login
# Or: setup auth set-key github
```

Project `.env` files are for the app being set up, not Setupr's own API keys. For model preference:

```bash
setup auth use kimi-k2-turbo-preview
# Or temporarily: P_SETUP_AI_MODEL=openai/gpt-4.1 setup
```

Supported model IDs are listed with:

```bash
setup auth models
```

Without an API key, Setupr works fully — it just uses pattern matching and heuristics instead of AI for step planning and chat responses.

## Agent Runtime

Setupr reads project context before planning: README/setup docs, `.env.example`, package scripts, Docker/Compose files, CI files, scanner output, and a bounded file tree. This context is cached in `.setupr/cache`.

For AI calls, Setupr uses compact internal facts for docs and user intent to reduce token usage. The raw user message is still preserved for fallback interpretation, and Setupr instructs the model to answer users in normal language rather than the internal DSL.

If a setup step fails, Setupr records structured output, classifies the failure, tries deterministic recovery for known cases, and can ask the AI director to diagnose or re-plan when a provider is configured. Interrupted AI-directed workflows resume from `.setupr/agent-workflow.json`.

`setupr doctor` adds severity/explanation/fix suggestions, and `setupr start` uses the same context to choose the most likely dev script and warn about blockers before starting a managed process.

## Verification And Security

Use Setupr's grouped commands when you want local confidence checks before committing or publishing:

```bash
setupr test quick
setupr test full --report .setupr/test-report.md
setupr test doctor
setupr security scan
setupr security deep --report .setupr/security-report.md
```

`setupr test` chooses project-native commands from package scripts, Python, Rust, Go, and common build/lint/typecheck names. `setupr test create <file>` previews a starter test file and writes it only with `--yes` or `--force`.

`setupr security` runs defensive checks for likely committed secrets, risky env naming, dependency lockfile/version problems, Docker/CI risks, dangerous code primitives, route/auth smells, and optional local HTTP headers. Reports are saved under `.setupr/`; dashboard/status reads the latest report summary.

## CI/CD Usage

For non-interactive environments:

```bash
setup --force --plain
```

This skips safe prompts and outputs plain text (no TUI). Setupr still avoids inventing secrets and should stop for destructive or blocked actions.

If any setup step fails in plain mode, Setupr stops immediately and returns a non-zero exit code so CI can fail correctly.

## Cleaning Projects

```bash
# Remove dependency/cache artifacts
setup clean --deps

# Remove local-only files before sharing a project
setup clean --share

# Remove dependencies, build output, caches, and local env files
setup clean --all
```

The positional forms also work: `setup clean deps`, `setup clean share`, and `setup clean all`.
