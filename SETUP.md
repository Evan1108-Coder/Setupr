# Setup Guide

## Prerequisites

- Node.js 18 or later
- A terminal with Unicode support (for TUI features)
- npm, yarn, or pnpm

## Installation

### Via npx (recommended)

```bash
npx p-setup
```

This runs P-Setup without installing it globally.

### Global Installation

```bash
npm install -g p-setup
```

After installation, the `setup` command is available globally:

```bash
setup
setup doctor
setup info
```

### Development Setup

```bash
git clone https://github.com/Evan1108-Coder/P-Setup.git
cd P-Setup
npm install
npm run build
node dist/setup.js --help
```

## First Run

1. Navigate to any project directory
2. Run `setup` (or `npx p-setup`)
3. P-Setup will:
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

To enable AI-powered features, save at least one provider key in global P-Setup auth storage:

```bash
setup auth login
# Or: setup auth set-key github
```

Project `.env` files are for the app being set up, not P-Setup's own API keys. For model preference:

```bash
setup auth use kimi-k2-turbo-preview
# Or temporarily: P_SETUP_AI_MODEL=openai/gpt-4.1 setup
```

Supported model IDs are listed with:

```bash
setup auth models
```

Without an API key, P-Setup works fully — it just uses pattern matching and heuristics instead of AI for step planning and chat responses.

## CI/CD Usage

For non-interactive environments:

```bash
setup --force --plain
```

This skips safe prompts and outputs plain text (no TUI). P-Setup still avoids inventing secrets and should stop for destructive or blocked actions.

If any setup step fails in plain mode, P-Setup stops immediately and returns a non-zero exit code so CI can fail correctly.

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
