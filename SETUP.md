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
setupr doctor
setupr info
```

### Command Discovery

Use the built-in help tree when you are not sure which workflow to run:

```bash
setupr help
setupr help chat
setupr help git
setupr help docker
setupr workspace --help
```

The rich help output lists the primary project-control surface, including setup, chat, auth, env, git, CI, Docker, secrets, templates, workspace, health, test, security, fix, release, perf, GitHub, registry, share, plugin, lint, and format commands. Advanced inspection/file-generation commands remain directly runnable for compatibility, but they are not advertised in the primary command index.

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
setupr auth login
# Or: setupr auth set-key github
```

Project `.env` files are for the app being set up, not Setupr's own API keys. For model preference:

```bash
setupr auth use kimi-k2-turbo-preview
# Or temporarily: P_SETUP_AI_MODEL=openai/gpt-4.1 setup
```

Supported model IDs are listed with:

```bash
setupr auth models
```

Without an API key, Setupr works fully — it just uses pattern matching and heuristics instead of AI for step planning and chat responses.

You can ask the project-aware director from the chat TUI:

```bash
setupr chat
setupr chat "how do I start this app?"
setupr chat "what failed last time?"
setupr chat "switch model to openai/gpt-4.1-mini"
```

By default, `setupr chat` opens a persistent project chat workspace. A message after `chat` is sent automatically as the first message, then the TUI stays open. Use `setupr chat --plain "question"` or `setupr chat --json "question"` when you need one-shot output for scripts.

The chat command loads scan results, docs, env schema, git state, recent Setupr history, and workflow checkpoints. It saves recoverable chat state under `.setupr/chat/session.json` with secrets redacted before persistence or provider calls.

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

## Release And Project Control

Before publishing Setupr itself or any npm project, use:

```bash
setupr release check
setupr release publish-check
```

For grouped repair flows:

```bash
setupr fix all       # preview
setupr fix all --yes # execute the displayed safe commands
```

For performance work:

```bash
setupr perf startup
setupr perf scan --json
```

## CI/CD Usage

For non-interactive environments:

```bash
setupr --force --plain
```

This skips safe prompts and outputs plain text (no TUI). Setupr still avoids inventing secrets and should stop for destructive or blocked actions.

If any setup step fails in plain mode, Setupr stops immediately and returns a non-zero exit code so CI can fail correctly.

## Cleaning Projects

```bash
# Remove dependency/cache artifacts
setupr clean --deps

# Remove local-only files before sharing a project
setupr clean --share

# Remove dependencies, build output, caches, and local env files
setupr clean --all
```

The positional forms also work: `setupr clean deps`, `setupr clean share`, and `setupr clean all`.

In TUI mode, `setupr clean` opens a safety review before deleting anything. Review the target list, protected-file notes, and risk summary, then type `CLEAN` to confirm. `--force` skips the review prompt and starts cleaning after the target scan, while still reporting exactly what was removed or failed.
