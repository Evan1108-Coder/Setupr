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

# Configure P-Setup AI once, globally
setup auth login

# With minimal prompts (CI-friendly, still stops for blockers/destructive risk)
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
| `clean` | Remove artifacts (`--deps`, `--share`, `--all`; positional `deps`, `share`, `all` also work) |
| `auth` | Manage global P-Setup AI provider API keys and models |

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
| `help [command]` | Show global or command-specific help |
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

Supports 7 AI providers (25+ models, plus custom GitHub Models catalog IDs):

| Provider | Models | Env Key |
|----------|--------|---------|
| OpenAI | gpt-5.4-pro, gpt-5.4-mini, gpt-4o, gpt-4o-mini | `OPENAI_API_KEY` |
| Anthropic | claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5, claude-3.5-sonnet | `ANTHROPIC_API_KEY` |
| Google | gemini-3.1-pro, gemini-3-flash, gemini-2.5-flash-lite | `GOOGLE_API_KEY` |
| Groq (Llama) | llama-4-maverick, llama-4-scout, llama-3.3-70b | `GROQ_API_KEY` |
| MiniMax | minimax-m2.7, minimax-m2.5-lightning | `MINIMAX_API_KEY` |
| Moonshot (Kimi) | kimi-latest, kimi-k2-thinking, kimi-k2-turbo-preview, kimi-k2.5-vision, moonshot-v1-128k | `MOONSHOT_API_KEY` |
| GitHub Models | openai/gpt-4.1, openai/gpt-4.1-mini, openai/gpt-4o, openai/gpt-4o-mini, or any GitHub catalog ID | `GITHUB_MODELS_API_KEY`, `GITHUB_TOKEN`, or `GITHUB_API_KEY` |

GitHub Models tokens need GitHub Models access; fine-grained PATs or app tokens need `models: read`.

```bash
# Guided setup for provider API keys
setup auth login

# Save one provider API key globally
setup auth set-key github

# View configured providers without printing raw keys
setup auth list

# Test configured providers with tiny requests
setup auth test

# View available models
setup auth models

# Set preferred model
setup auth use openai/gpt-4.1-mini
```

P-Setup stores provider API keys globally in `~/.p-setup/secrets.json` with file permissions `0600`. Raw keys are never printed; `setup auth list` and `setup auth status` show only masked keys.

P-Setup resolves provider keys in this order:

1. Shell environment variables, useful for CI or temporary overrides
2. Global P-Setup auth storage from `setup auth set-key`
3. Project `.env.local` / `.env` for backward compatibility only

The project `.env` file is for the app being set up, not for P-Setup's own API keys. To migrate old project-local provider keys into global auth:

```bash
setup auth migrate
```

When multiple provider keys are present, `P_SETUP_AI_MODEL` or `setup auth use <model>` wins. If no model is pinned, P-Setup chooses the cheapest configured model from its known local pricing table and shows that choice in the pre-execution warning. GitHub Models catalog/custom pricing is treated as unknown, so GitHub is used automatically only when it is explicitly selected or it is the only configured provider.

P-Setup still accepts `export KEY=value` syntax in project env files for project variables and backward-compatible provider overrides.

### Agent-Guided TUI Flow

The `setup` TUI is an agent workspace, not just a log viewer:

- Before the dashboard opens, P-Setup prints a plain-text warning describing what it may do.
- Inside the TUI, the main panel shows a time-ordered timeline: system events, AI decisions, user messages, command output, warnings, and confirmations.
- When the agent needs input, it pauses with an option card above the persistent chat input. You can pick an option, paste `KEY=value` environment blobs into `Other...`, or type a plan override such as `skip build` or `prefer pnpm`.
- The AI director can also act on natural language while setup is open: change models, answer the current prompt, fill env values from pasted text, skip or rewrite plan steps, summarize status, and continue with the updated plan.
- The AI director stays centered on the current setup task, while still allowing brief adjacent questions, clarifications, and steering without being overly strict.
- For live AI decisions, the director receives a sanitized context packet with project scan data, OS/terminal details, config parameters, current plan, TUI state, notices, dependency/service/port state, terminal diary, and chat history. Secret values are masked before model calls.
- User replies appear on the right side of the timeline; AI reasoning and decisions appear inline before execution.
- `--force` skips safe prompts and uses defaults where possible, but it does not invent secrets and still stops for serious blockers or destructive choices.

### Structured Error Handling

Every command uses the same error format in plain mode and TUI mode:

- a stable error code such as `ENV_TEMPLATE_MISSING`, `AUTH_STORAGE_INVALID`, `MISSING_SCRIPT`, or `AI_PROVIDER_QUOTA_EXHAUSTED`
- a direct explanation of what happened in the current directory/provider/model
- details that are safe to show, with API keys and tokens masked
- next steps and recovery options when P-Setup can continue

Examples:

- `setup env init` stops if `.env.example` is missing, because P-Setup cannot infer required variables. `setup env init --force` creates an empty `.env` and explains that no variables were inferred.
- `setup auth list` stops on a corrupt `~/.p-setup/secrets.json` instead of pretending keys are missing, so existing secrets are not accidentally overwritten.
- command failures are classified as install, build, test, network, permission, timeout, or missing-tool errors when possible.
- `--force` skips ordinary prompts, but it does not ignore failed commands, invalid auth storage, missing secrets, or destructive blockers.

### Environment Management

```bash
# Create .env from .env.example
setup env init

# Overwrite an existing .env from .env.example, or create an empty .env
# when no .env.example exists
setup env init --force

# Check for missing variables
setup env check

# Sync structure with .env.example
setup env sync

# Smart reorganize + auto-fill
setup env smart
```

### Checkpoint & Resume

- Progress saved to `.p-setup/checkpoint.json`
- Setup stops on the first failed step and returns a non-zero exit code in plain mode
- Persists across terminals and reboots
- Automatically cleaned up on success
- Resume interrupted setups seamlessly

## Flags

| Flag | Description |
|------|-------------|
| `--force` | Skip safe prompts, install what project specifies, and stop only for blockers or destructive choices |
| `--no-tui` / `--plain` | Plain terminal output for CI/CD, piping, SSH |
| `--deps` | With `clean`, remove dependency/cache artifacts |
| `--share` | With `clean`, remove sensitive/local-only files before sharing a project |
| `--all` | With `clean`, remove dependencies, build output, caches, and local env files |

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

Provider API keys are stored separately at `~/.p-setup/secrets.json` and should be managed with `setup auth`.

### Help

```bash
setup help
setup help auth
setup auth --help
setup help auth set-key
```

Global help lists every command. Command help shows subcommands, variations, options, and examples for that command.

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

- **Arrow keys**: Move between neighboring panels in the dashboard
- **Tab / Shift+Tab**: Move to the next or previous focusable panel
- **Mouse click**: Focus a panel in terminals that support SGR mouse events
- **Enter**: Confirm / submit focused inputs
- **Esc**: Leave or skip the active input when supported
- **q**: Quit when focus is not inside an input

The TUI runs in the terminal alternate screen, so exiting returns to the original shell history instead of leaving the dashboard printed in the scrollback. It does not set a background color; Terminal, iTerm2, Ghostty, and other terminal profiles keep control of their own theme/background. Panels are drawn with Unicode box-drawing characters because terminal UIs render in character cells rather than graphical window primitives.

## Requirements

- Node.js >= 18.0.0
- Terminal with Unicode support (for TUI mode)
- Recommended for full TUI behavior: alternate screen and SGR mouse support, available in modern Terminal.app, iTerm2, Ghostty, and most current terminal emulators

## Release Smoke Testing

Before publishing or after touching scanner, error, auth, env, command execution, or TUI code, run:

```bash
npm run smoke:fixtures
```

This builds the CLI, creates temporary broken/chaotic fixture projects, and checks malformed project files, env failures, corrupt auth storage, missing scripts, failing scripts, no-project setup, monorepo detection, missing logs/locks/remotes, and structured error codes.

For a best-effort terminal capture smoke on macOS:

```bash
npm run smoke:fixtures:tui
```

That does not replace manual iTerm2/Ghostty visual QA, but it catches obvious TUI launch regressions.

## License

MIT
