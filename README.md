# P-Setup

Intelligent project setup & management CLI. Auto-detects your stack, installs dependencies, configures environments, and keeps projects healthy. Supports 20+ languages with AI-assisted workflows. Features rich TUI with keyboard navigation, real-time status, and smart caching for near-zero AI costs.

## Installation

```bash
npx p-setup
```

Or install globally:

```bash
npm install -g p-setup
```

## Quick Start

```bash
# Full project setup (scan, install, configure, verify)
setup

# With no prompts (CI-friendly)
setup --force

# Plain terminal output (no TUI)
setup --plain
```

## Commands

### TUI Commands (Rich Interactive UI)

| Command | Description |
|---------|-------------|
| `setup` | Full project setup — scan, install runtime, deps, env, verify |
| `start` | Detect and run your project (dev server) |
| `doctor` | Diagnose environment health (runtimes, deps, ports) |
| `update` | Check for dependency updates with breaking change warnings |
| `clean` | Remove artifacts (`--deps`, `--share`, `--all`) |

### Non-TUI Commands (Plain Terminal)

| Command | Description |
|---------|-------------|
| `env [init\|check\|sync\|smart]` | Manage .env files |
| `info` | Show project summary |
| `list` | List available scripts/commands |
| `run <script>` | Run a project script |
| `switch <version>` | Switch runtime version |
| `add <package>` | Smart add dependency |
| `remove <package>` | Remove dependency |
| `port [number]` | Check/find/kill port |
| `deps` | Dependency tree, outdated, audit |
| `config` | Manage p-setup config |
| `lock` | Snapshot environment state |
| `diff` | Compare current vs locked state |
| `logs` | Tail project logs |
| `test` | Detect and run test suite |
| `build` | Detect and run build command |
| `deploy` | Run deploy scripts |
| `open [repo\|ide]` | Open in browser/IDE/repo |

## Features

### Smart Detection

P-Setup automatically detects:
- **Languages**: TypeScript, JavaScript, Python, Rust, Go, Java, Ruby, PHP, Dart, Elixir, Swift, C#, Kotlin, Scala, and more
- **Frameworks**: Next.js, Nuxt, SvelteKit, React, Vue, Angular, Express, Django, Flask, Rails, Spring Boot, and 20+ more
- **Package Managers**: npm, yarn, pnpm, bun, pip, poetry, cargo, go, bundler, composer, pub, mix
- **Services**: PostgreSQL, MySQL, MongoDB, Redis, RabbitMQ, Elasticsearch, Docker
- **Monorepos**: npm workspaces, pnpm workspaces, Turborepo, Lerna, Nx

### Detection Priority

1. `.p-setup.json` config file (explicit, highest priority)
2. `package.json` "p-setup" field
3. File-based scanning (lock files, config files)
4. Content analysis (dependency inspection)
5. AI fallback (novel situations only)

### AI-Powered Intelligence

P-Setup uses a 3-tier progressive intelligence system:

1. **Pattern Matching** (Level 0) — Free, instant. Handles ~80% of queries
2. **Cached Responses** (Level 1) — Free after first hit. Smart deduplication
3. **Live AI** (Level 2) — Only for novel situations. Uses compressed DSL for minimal token usage

Supports 6 AI providers (22 models):

| Provider | Models | Env Key |
|----------|--------|---------|
| OpenAI | gpt-5.4-pro, gpt-5.4-mini, gpt-4o, gpt-4o-mini | `OPENAI_API_KEY` |
| Anthropic | claude-opus-4.6, claude-sonnet-4.6, claude-haiku-4.5, claude-3.5-sonnet | `ANTHROPIC_API_KEY` |
| Google | gemini-3.1-pro, gemini-3-flash, gemini-2.5-flash-lite | `GOOGLE_API_KEY` |
| Groq (Llama) | llama-4-maverick, llama-4-scout, llama-3.3-70b | `GROQ_API_KEY` |
| MiniMax | minimax-m2.7, minimax-m2.5-lightning | `MINIMAX_API_KEY` |
| Moonshot (Kimi) | kimi-latest, kimi-k2-thinking, kimi-k2-turbo, kimi-k2.5-vision, moonshot-v1-128k | `MOONSHOT_API_KEY` |

```bash
# View available models
setup config models

# Set preferred model
setup config set model kimi-k2-turbo-preview
```

### Environment Management

```bash
# Create .env from .env.example
setup env init

# Check for missing variables
setup env check

# Sync structure with .env.example
setup env sync

# Smart reorganize + auto-fill
setup env smart
```

### AI-Driven Setup

When an AI provider is configured, P-Setup provides intelligent guidance throughout the setup process:

- **Plan narration**: AI explains what will happen before execution begins
- **Failure analysis**: When a step fails, AI diagnoses the issue and suggests fixes
- **Completion summary**: AI summarizes everything that was configured

Works without AI too — falls back to deterministic heuristics with zero API calls.

### Checkpoint & Resume

Interrupted setups resume automatically — no progress lost:

- Checkpoint saved after each step to `.p-setup/checkpoint.json`
- On re-run, detects the checkpoint and resumes from where it stopped
- Skips already-completed steps, picks up remaining work
- Cleaned up automatically on successful completion
- Use `--force` to discard a checkpoint and start fresh

## Flags

| Flag | Description |
|------|-------------|
| `--force` | Skip all prompts, install what project specifies (latest if unspecified) |
| `--no-tui` / `--plain` | Plain terminal output for CI/CD, piping, SSH |

## Configuration

Global config stored at `~/.p-setup/config.json`:

```json
{
  "ai": { "enabled": true },
  "preferences": {
    "theme": "dark",
    "confirmBeforeInstall": true
  }
}
```

Project-level config via `.p-setup.json`:

```json
{
  "language": "TypeScript",
  "framework": "Next.js",
  "runtime": "node",
  "packageManager": "pnpm"
}
```

## TUI Navigation

- **Arrow keys / Tab**: Navigate between panels
- **Enter**: Confirm / Submit
- **/** : Focus chat input
- **q**: Quit

## Requirements

- Node.js >= 18.0.0
- Terminal with Unicode support (for TUI mode)

## License

MIT
