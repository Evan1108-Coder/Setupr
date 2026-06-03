# Setupr

Intelligent project setup & management CLI. Auto-detects your stack, installs dependencies, configures environments, and keeps projects healthy. Supports 20+ languages with AI-assisted workflows. Features rich TUI with keyboard navigation, real-time status, and smart caching for near-zero AI costs.

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

# With minimal prompts (CI-friendly, still stops for blockers/destructive risk)
setupr setup --force

# Plain terminal output (no TUI)
setupr setup --plain
```

## Commands

### TUI Commands (Rich Interactive UI)

| Command | Description |
|---------|-------------|
| `setupr` / `dashboard` | Project dashboard with health, git, env, processes, history, and quick commands |
| `setup` | Full project setup — scan, install runtime, deps, env, verify |
| `chat <question>` | AI director chat TUI for project questions, steering, plans, logs, and context |
| `status` | Dashboard/status view with plain, JSON, or TUI output |
| `start` | Start and track a managed project process |
| `doctor` | Diagnose environment health (runtimes, deps, ports) |
| `update` | Check for dependency updates with breaking change warnings |
| `clean` | Review and remove artifacts (`--deps`, `--share`, `--all`; positional `deps`, `share`, `all` also work) |
| `env` | Open the .env editor TUI or manage project .env files from .env.example |
| `auth` | Manage global Setupr AI provider API keys and models |

### Non-TUI Commands (Plain Terminal)

| Command | Description |
|---------|-------------|
| `env init\|check\|sync\|smart` | Manage .env files in plain mode with subcommands |
| `ps` | List Setupr-managed processes |
| `stop [target]` | Stop one or all managed processes |
| `restart [target]` | Restart a managed process |
| `info` | Show project summary |
| `list` | List available scripts/commands |
| `run <script>` | Run a project script |
| `switch <version>` | Switch runtime version |
| `add <package>` | Smart add dependency |
| `remove <package>` | Remove dependency |
| `port [number]` | Check/find/kill port |
| `deps [list\|audit\|why\|licenses]` | Dependency tree, audit summary, package reasoning, and license checks |
| `config` | Manage setupr config |
| `help [command]` | Show global or command-specific help |
| `lock` | Snapshot environment state |
| `diff` | Compare current vs locked state |
| `logs [target]` | Show managed process logs, falling back to package-manager logs |
| `test [run\|quick\|full\|ci\|smoke\|unit\|integration\|e2e\|watch\|coverage\|changed\|file\|failed\|doctor\|list\|report\|clean\|fix\|security]` | Run verification suites, smoke checks, and reports |
| `security [scan\|quick\|deep\|deps\|secrets\|env\|docker\|ci\|code\|routes\|auth\|headers\|doctor\|report\|baseline\|ignore\|fix\|watch\|test]` | Run defensive security scans, baselines, ignores, and safe fixes |
| `fix [doctor\|env\|lint\|format\|security\|all]` | Preview or run grouped safe fixes |
| `release [check\|publish-check\|notes\|version]` | Release readiness checks, package dry-runs, notes, and version summaries |
| `perf [startup\|scan\|context\|status]` | Measure Setupr scan/context/status performance |
| `github [status\|ci\|pr\|issue]` | Show GitHub repository, Actions, PR, and issue targets |
| `registry <npm\|pypi\|crates> <package>` | Look up package registry information |
| `build` | Detect and run build command |
| `deploy` | Run deploy scripts |
| `open [repo\|ide]` | Open in browser/IDE/repo |
| `git` | Git workflows plus commit-message, PR-description, branch-check, and conflict helper |
| `init` | Scaffold new projects from stacks or templates |
| `migrate <npm\|yarn\|pnpm\|bun>` | Migrate package manager metadata and lockfiles |
| `ci <github\|gitlab\|bitbucket\|circleci>` | Generate CI/CD config |
| `docker <generate\|compose\|check>` | Generate Dockerfile/compose files or check Docker readiness |
| `secrets <init\|set\|get\|list\|remove\|export\|import\|rotate>` | Manage encrypted project-local secrets |
| `templates <new\|list\|save\|remove>` | Create, save, list, or remove templates |
| `workspace <list\|run\|exec\|add\|info\|check>` | Operate on monorepo workspaces |
| `health [full\|deps\|security\|outdated\|size]` | Run project health checks |
| `share <export\|import\|inspect>` | Export/import shareable setup bundles |
| `notes <add\|list\|remove\|clear>` | Manage project-local notes in `.setupr` |
| `history [list] [limit]` | Show recent project-local Setupr history |
| `context <show\|export\|import>` | Export/import notes and history for team handoff |
| `plugin <create\|validate\|doctor\|install\|remove\|list\|info\|enable\|disable>` | Manage Setupr plugins and plugin development |
| `lint <run\|setup\|fix>` | Run or set up linting |
| `format <run\|check\|setup>` | Run or set up formatting |

## Features

### Smart Detection

Setupr automatically detects:
- **Languages**: TypeScript, JavaScript, Python, Rust, Go, Java, Ruby, PHP, Dart, Elixir, Swift, C#, Kotlin, Scala, and more
- **Frameworks**: Next.js, Nuxt, SvelteKit, React, Vue, Angular, Express, Django, Flask, Rails, Spring Boot, and 20+ more
- **Package Managers**: npm, yarn, pnpm, bun, pip, poetry, cargo, go, bundler, composer, pub, mix
- **Services**: PostgreSQL, MySQL, MongoDB, Redis, RabbitMQ, Elasticsearch, Docker
- **Monorepos**: npm workspaces, pnpm workspaces, Turborepo, Lerna, Nx

### Detection Priority

1. `.setupr.json` config file (explicit, highest priority)
2. `package.json` "setupr" field
3. File-based scanning (lock files, config files)
4. Content analysis (dependency inspection)
5. AI fallback (novel situations only)

### AI-Powered Intelligence

Setupr uses a 3-tier progressive intelligence system:

1. **Pattern Matching** (Level 0) — Free, instant. Handles ~80% of queries
2. **Cached Responses** (Level 1) — Free after first hit. Smart deduplication
3. **Live AI** (Level 2) — Only for novel situations. Uses compressed DSL for minimal token usage

The compressed DSL is internal-only. Setupr compresses docs, scan facts, and parsed user intent before sending context to a model, but generated explanations, docs, code edits, commands, and TUI messages stay in normal human-readable language. Raw user input is preserved as the fallback source of truth, so typo-heavy or ambiguous messages can still be interpreted by the AI instead of being lost to the parser.

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

Setupr stores provider API keys globally in `~/.setupr/secrets.json` with file permissions `0600`. Raw keys are never printed; `setup auth list` and `setup auth status` show only masked keys.

`setup auth test` runs configured providers concurrently with short per-provider timeouts. A slow or unavailable provider reports a classified timeout/error without blocking checks for the other configured providers.

Setupr resolves provider keys in this order:

1. Shell environment variables, useful for CI or temporary overrides
2. Global Setupr auth storage from `setup auth set-key`
3. Project `.env.local` / `.env` for backward compatibility only

The project `.env` file is for the app being set up, not for Setupr's own API keys. To migrate old project-local provider keys into global auth:

```bash
setup auth migrate
```

When multiple provider keys are present, `P_SETUP_AI_MODEL` or `setup auth use <model>` wins. If no model is pinned, Setupr chooses the cheapest configured model from its known local pricing table and shows that choice in the pre-execution warning. GitHub Models catalog/custom pricing is treated as unknown, so GitHub is used automatically only when it is explicitly selected or it is the only configured provider.

Setupr still accepts `export KEY=value` syntax in project env files for project variables and backward-compatible provider overrides.

### AI Director Runtime

Setupr's AI layer is now a director runtime, not only a one-shot planner:

- reads bounded project context from README/setup docs, `.env.example`, package scripts, Docker files, CI files, and scanner output
- compresses setup docs into compact facts such as install/run/env/migration/service hints before model calls
- parses user chat into compact intent facts while preserving the exact raw message for AI fallback
- caches context under `.setupr/cache` so startup stays fast
- turns failures into structured diagnosis and safe re-planning decisions
- shows plan diffs when chat steering changes the active plan
- explains env vars, suggests safe local defaults where appropriate, and refuses to invent secrets
- adds AI-style diagnosis, plugin doctor checks, and safe fix suggestions to doctor
- ranks start scripts using project context and warns about blockers before launching managed processes
- writes agent workflow checkpoints to `.setupr/agent-workflow.json` so interrupted flows can resume with the same plan, prompt, answers, and safe output excerpts

AI output is not treated as unrestricted shell text. The director proposes structured actions, then Setupr's executor and safety policy decide whether the action is allowed, needs confirmation, or must be blocked.

You can also use the director from its own chat workspace:

```bash
setupr chat
setupr chat "how do I start this app?"
setupr chat "what failed last time?"
setupr chat "switch model to moonshot-v1-128k"
setupr chat "what env vars still need real values?"
setupr chat --new
setupr chat resume
```

`setupr chat` opens a persistent TUI by default. If you pass a message, Setupr opens the TUI and auto-sends it as the first message. The chat session is saved under `.setupr/chat/session.json` with secrets redacted, so `setupr chat` or `setupr chat resume` can restore the latest project chat. Use `setupr chat --plain "question"` or `setupr chat --json "question"` for one-shot CI/script output.

The chat TUI reads the same bounded project context as setup: scan results, cached docs, env schema, git state, recent Setupr history, and saved checkpoints. It uses pattern/cached answers when possible and only calls a live model for novel questions when a provider key is configured.

### Agent-Guided TUI Flow

The `setup` TUI is an agent workspace, not just a log viewer:

- Before the dashboard opens, Setupr prints a plain-text warning describing what it may do.
- Inside the TUI, the main panel shows a time-ordered timeline: system events, AI decisions, user messages, command output, warnings, and confirmations.
- When the agent needs input, it pauses with an option card above the persistent chat input. You can pick an option, paste `KEY=value` environment blobs into `Other...`, or type a plan override such as `skip build` or `prefer pnpm`.
- The AI director can also act on natural language while setup is open: change models, answer the current prompt, fill env values from pasted text, skip or rewrite plan steps, summarize status, and continue with the updated plan. Common typos and aliases like `skp databse`, `db`, `deps`, and `postgress` are normalized before AI fallback.
- In the chat TUI, normal messages use Enter. Steering instructions use Ctrl+Enter where the terminal supports it, or `/steer ...`; steer messages are stored separately from normal chat so the director can distinguish questions from workflow changes.
- When the director asks a question, the TUI shows a prompt card with options plus `Other...`, or a focused text/secret input when a typed value is needed. Normal chat input is locked while the AI is thinking/running; Esc pauses and Ctrl+R resumes.
- The AI director stays centered on the current setup task, while still allowing brief adjacent questions, clarifications, and steering without being overly strict.
- For live AI decisions, the director receives a sanitized context packet with project scan data, OS/terminal details, config parameters, current plan, TUI state, notices, dependency/service/port state, terminal diary, and chat history. Secret values are masked before model calls.
- The same packet includes Setupr's current command capabilities, so the director can recommend or explain git, Docker, CI, workspace, secrets, template, health, plugin, lint, and format workflows when they are relevant.
- User replies appear on the right side of the timeline; AI reasoning and decisions appear inline before execution.
- `--force` skips safe prompts and uses defaults where possible, but it does not invent secrets and still stops for serious blockers or destructive choices.

### Structured Error Handling

Every command uses the same error format in plain mode and TUI mode:

- a stable error code such as `ENV_TEMPLATE_MISSING`, `AUTH_STORAGE_INVALID`, `MISSING_SCRIPT`, or `AI_PROVIDER_QUOTA_EXHAUSTED`
- a direct explanation of what happened in the current directory/provider/model
- details that are safe to show, with API keys and tokens masked
- next steps and recovery options when Setupr can continue

Examples:

- `setup env init` stops if `.env.example` is missing, because Setupr cannot infer required variables. `setup env init --force` creates an empty `.env` and explains that no variables were inferred.
- `setup auth list` stops on a corrupt `~/.setupr/secrets.json` instead of pretending keys are missing, so existing secrets are not accidentally overwritten.
- command failures are classified as install, build, test, network, permission, timeout, or missing-tool errors when possible.
- `--force` skips ordinary prompts, but it does not ignore failed commands, invalid auth storage, missing secrets, or destructive blockers.

### Verification And Security

Setupr includes grouped verification and security workflows for local development and CI:

```bash
# Fast local confidence check
setupr test quick

# Broader local check: test, build, typecheck, lint, security when detected
setupr test full --report .setupr/test-report.md

# Explain current test coverage and missing scripts
setupr test doctor

# Preview or create a starter test for one source file
setupr test create src/lib/math.ts
setupr test create src/lib/math.ts --yes

# Defensive local security scan
setupr security scan

# Deeper static scan and report
setupr security deep --report .setupr/security-report.json

# Inspect local HTTP security headers
setupr security headers --url http://localhost:3000
```

`test clean`, `test create`, and `security fix` are guarded writes: they preview by default and require `--yes` or `--force` before changing files. Security scans are defensive static checks only. External URL header checks require `--force`; localhost URLs are allowed directly. Findings can be accepted with `setupr security baseline` or ignored individually with `setupr security ignore <finding-id>`.

Verification reports live in `.setupr/test-runs.json`; security reports live in `.setupr/security-runs.json`. The dashboard and `setupr status --plain` summarize the latest test and security state.

### Project Control Commands

These commands strengthen npm-release and day-to-day project control workflows:

```bash
# Preview grouped safe fixes; add --yes to run the displayed commands
setupr fix all
setupr fix all --yes

# Check release readiness and package contents
setupr release check
setupr release publish-check

# Measure Setupr scan/context/status performance
setupr perf startup

# Show GitHub project targets from the git remote
setupr github status

# Look up package registry information
setupr registry npm react
setupr registry pypi fastapi
setupr registry crates serde
```

`fix` previews by default. `release publish-check` runs `npm pack --dry-run` so the npm package contents can be inspected before publishing. `perf` is useful when changing scanner, context, dashboard, or AI-cache code.

### Safety Policy

All command-like actions from setup, doctor, start, plugins, and AI steering pass through one safety layer. Safe checks and normal dependency installs can run. Medium/high-risk actions require confirmation. Critical actions such as root/home wildcard deletion, `curl | sh`, unsafe elevated commands, and secret-like shell text are blocked or stopped before execution. `--force` never bypasses critical safety blockers.

### Environment Management

```bash
# Open the interactive .env editor TUI
setup env

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

Bare `setup env` opens the env editor. If `.env` exists, it opens directly. If only `.env.example` exists, Setupr asks before creating `.env` from the template. If neither file exists, it stops with `ENV_TEMPLATE_MISSING`; `setup env --force` creates an empty `.env` and explains that no variables were inferred.

### Checkpoint & Resume

- Progress saved to `.setupr/checkpoint.json`
- Agent workflow state saved to `.setupr/agent-workflow.json`
- Setup stops on the first failed step and returns a non-zero exit code in plain mode
- Persists across terminals and reboots
- Automatically cleaned up on success
- Resume interrupted setups seamlessly

### Project Memory

```bash
setup notes add "Use pnpm for installs"
setup notes list
setup history 10
setup context export team-context.json
setup context import team-context.json
```

Notes are saved in `.setupr/notes.json`. History uses `.setupr/history.jsonl`, and context export/import moves a deterministic bundle of notes plus history for team handoff.

### Project Dashboard And Processes

```bash
setupr
setupr status --json
setupr start
setupr ps
setupr logs
setupr stop
setupr restart dev --watch
```

`setupr` with no arguments opens the dashboard, not setup execution. The dashboard summarizes real project signals: scanner results, git state, env status, managed processes, recent history, and available commands. `setupr start` runs the detected `dev`, `start`, `serve`, `develop`, or `watch` script under a Setupr supervisor, writes logs under `.setupr/logs/processes`, and exposes it through `ps`, `logs`, `stop`, and `restart`.

### Git, Project Inspection, And Dependency Intelligence

```bash
setupr git commit-message
setupr git pr-description
setupr git branch-check
setupr git conflicts
setupr deps audit
setupr deps why react
setupr deps licenses
```

These commands work offline first. They use deterministic project, file, git, and lockfile signals, then AI-capable flows can layer on `--smart` where supported.

Advanced inspection/file-generation commands from earlier Setupr versions still run directly for existing local workflows, but they are intentionally kept out of the main help surface so Setupr presents as a project-control terminal rather than a coding assistant.

`setupr test watch` is bounded by a readiness window instead of running forever. If the watch script stays alive, Setupr stops it after the timeout and reports that the watch process was able to start.

### Plugin Development

```bash
setupr plugin create team-tools
cd setupr-plugin-team-tools
npm install
npm run build
setupr plugin validate .
setupr plugin doctor
```

Plugins are installed into the project-local `.setupr/plugins` area and registered in global Setupr config. `plugin create` scaffolds a package with a `setupr` manifest block and starter entrypoint; `plugin validate` checks package metadata and entrypoint shape before install/runtime loading. Runtime loading only runs enabled plugins, and `setupr plugin doctor` reports load failures before they affect setup.

Plugin extension points use structured objects and can add commands, scanners, planners, doctor checks, fixers, and TUI/dashboard panels. Planner extensions run during setup planning, doctor checks appear in `setupr doctor`, and plugin commands can be invoked from the plain CLI. Plugin-proposed work still routes through Setupr's context, executor, and safety systems.

Doctor fixes are explicit. `setupr doctor --plain --fix` previews available safe fixes, and `setupr doctor --plain --fix --yes` applies only fixes that pass the central safety policy.

## Flags

| Flag | Description |
|------|-------------|
| `--force` | Skip safe prompts, install what project specifies, and stop only for blockers or destructive choices |
| `--no-tui` / `--plain` | Plain terminal output for CI/CD, piping, SSH |
| `--deps` | With `clean`, remove dependency/cache artifacts |
| `--share` | With `clean`, remove sensitive/local-only files before sharing a project |
| `--all` | With `clean`, remove dependencies, build output, caches, and local env files |

## Configuration

Global config stored at `~/.setupr/config.json`:

```json
{
  "ai": { "enabled": true },
  "preferences": {
    "theme": "dark",
    "confirmBeforeInstall": true
  }
}
```

Provider API keys are stored separately at `~/.setupr/secrets.json` and should be managed with `setup auth`.

### Help

```bash
setup help
setup help auth
setup auth --help
setup help auth set-key
```

Global help lists every command. Command help shows subcommands, variations, options, and examples for that command.

Project-level config via `.setupr.json`:

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
- **Mouse click inside focused input**: Move the text cursor where the terminal reports coordinates accurately
- **Option/Alt+Arrow**: Move by word where the terminal sends a compatible sequence
- **Option/Alt+Delete or Ctrl+W**: Delete the previous word
- **Ctrl+A / Ctrl+E**: Jump to start/end of input
- **Ctrl+U / Ctrl+K**: Clear before/after cursor
- **Enter**: Confirm / submit focused inputs
- **Esc**: Leave or skip the active input when supported
- **q**: Quit when focus is not inside an input

The TUI runs in the terminal alternate screen, so exiting returns to the original shell history instead of leaving the dashboard printed in the scrollback. It enables SGR mouse reporting and bracketed paste while active, then disables both on cleanup. It does not set a background color; Terminal, iTerm2, Ghostty, and other terminal profiles keep control of their own theme/background. Panels are drawn with Unicode box-drawing characters because terminal UIs render in character cells rather than graphical window primitives.

Setupr TUIs share the same terminal-native style: blue uppercase panel titles, thin blue borders, yellow focused borders/actions, green success states, yellow warnings/current work, and red failures. Interactive inputs stay anchored at the bottom of their panel, wrap within the box, and scroll once long input reaches the panel's line cap. `setupr clean` opens a safety review first; type `CLEAN` to delete reviewed targets, or use `--force` only when you intentionally want Setupr to skip the review prompt.

The visual grammar is shared, but each command uses a command-specific board:

- `setupr` and `setupr status --tui` use summary metric cards plus project state, history, processes, env, security, and next-action panels.
- `setupr setup` uses setup progress, project/dependency/env/service cards, a terminal diary, a bottom input, and a right rail for port map, key dependencies, and notices.
- `setupr chat` uses a large conversation panel with a bottom input plus a right rail for the active plan and session context.
- `setupr start` uses managed processes, live logs, current process state, restart policy, and crash info.
- `setupr doctor`, `setupr update`, `setupr clean`, `setupr env`, and `setupr auth` keep their primary action input at the bottom and use side panels for diagnostics, risks, explanations, warnings, provider status, or secure storage state.

## Requirements

- Node.js >= 18.0.0
- Terminal with Unicode support (for TUI mode)
- Recommended for full TUI behavior: alternate screen and SGR mouse support, available in modern Terminal.app, iTerm2, Ghostty, and most current terminal emulators

## Release Smoke Testing

Before publishing or after touching scanner, error, auth, env, command execution, or TUI code, run:

```bash
npm run smoke:fixtures
```

This builds the CLI, creates temporary broken/chaotic fixture projects, and checks malformed project files, env failures, corrupt auth storage, missing scripts, failing scripts, no-project setup, monorepo detection, missing logs/locks/remotes, plugin scaffolds, and real-world-style fixtures for Next.js, Vite, Django, FastAPI, Rust, Go, Docker-heavy projects, and broken lockfiles.

The fixture smoke also exercises the expanded command surface through the built CLI, including CI, Docker, secrets, share, workspace, advanced compatibility commands, and a git shell-injection regression check.

For a best-effort terminal capture smoke on macOS:

```bash
npm run smoke:fixtures:tui
```

That does not replace manual iTerm2/Ghostty visual QA, but it catches obvious TUI launch regressions.

## License

MIT
