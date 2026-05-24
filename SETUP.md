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
   - Plan and execute setup steps
   - Show a completion summary

## AI Features (Optional)

P-Setup supports 6 AI providers. Set any one of these environment variables:

```bash
export OPENAI_API_KEY=your-key       # OpenAI (GPT-5.4, GPT-4o)
export ANTHROPIC_API_KEY=your-key    # Anthropic (Claude Opus, Sonnet, Haiku)
export GOOGLE_API_KEY=your-key       # Google (Gemini 3.1 Pro, Flash)
export GROQ_API_KEY=your-key         # Groq (Llama 4 Maverick/Scout)
export MINIMAX_API_KEY=your-key      # MiniMax (M2.7, M2.5)
export MOONSHOT_API_KEY=your-key     # Moonshot (Kimi K2)
```

Add it to your shell profile (`~/.zshrc` / `~/.bashrc`) for persistence.

With AI enabled, P-Setup provides:
- Intelligent step planning tailored to your project
- Plan narration explaining what will happen
- Failure diagnosis with fix suggestions
- Post-setup summary
- Interactive chat about your project

Without an API key, P-Setup works fully — it uses pattern matching and heuristics instead.

## Checkpoint & Resume

If a setup is interrupted (Ctrl+C, crash, closed terminal), just run `setup` again in the same directory. P-Setup automatically detects the checkpoint and resumes from where it stopped.

```bash
# Resume interrupted setup
setup

# Discard checkpoint and start fresh
setup --force
```

## CI/CD Usage

For non-interactive environments:

```bash
setup --force --plain
```

This skips all prompts and outputs plain text (no TUI).
