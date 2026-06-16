# Setupr Features

## Smart Detection

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

## AI-Powered Intelligence

Setupr uses a 3-tier progressive intelligence system:

1. **Pattern Matching** (Level 0) — Free, instant. Handles ~80% of queries
2. **Cached Responses** (Level 1) — Free after first hit. Smart deduplication
3. **Live AI** (Level 2) — Only for novel situations. Uses compressed DSL for minimal token usage

The compressed DSL is internal-only. Setupr compresses docs, scan facts, and parsed user intent before sending context to a model, but generated explanations, docs, code edits, commands, and TUI messages stay in normal human-readable language.

Supports 7 AI providers (25+ models, plus custom GitHub Models catalog IDs):

| Provider | Models | Env Key |
|----------|--------|---------|
| OpenAI | gpt-5.5-pro, gpt-5.5, gpt-5.5-mini, gpt-5.4-pro, gpt-5.4-mini, gpt-4o, gpt-4o-mini | `OPENAI_API_KEY` |
| Anthropic | claude-opus-4-7, claude-sonnet-4-7, claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5, claude-3.5-sonnet | `ANTHROPIC_API_KEY` |
| Google | gemini-3.1-pro, gemini-3-flash, gemini-2.5-flash-lite | `GOOGLE_API_KEY` |
| Groq (Llama) | llama-4-maverick, llama-4-scout, llama-3.3-70b | `GROQ_API_KEY` |
| MiniMax | minimax-m3, minimax-m2.5, minimax-m2.7 | `MINIMAX_API_KEY` |
| Moonshot (Kimi) | kimi-latest, kimi-k2-thinking, kimi-k2-turbo-preview, kimi-k2.5-vision, moonshot-v1-128k | `MOONSHOT_API_KEY` |
| GitHub Models | openai/gpt-4.1, openai/gpt-4.1-mini, openai/gpt-4o, openai/gpt-4o-mini, or any GitHub catalog ID | `GITHUB_MODELS_API_KEY`, `GITHUB_TOKEN`, or `GITHUB_API_KEY` |

```bash
# Guided setup for provider API keys
setupr auth login

# Save one provider API key globally
setupr auth set-key github

# View configured providers without printing raw keys
setupr auth list

# Test configured providers with tiny requests
setupr auth test

# View available models
setupr auth models

# Set preferred model
setupr auth use openai/gpt-4.1-mini
```

Setupr stores provider API keys globally in `~/.setupr/secrets.json` with file permissions `0600`. Raw keys are never printed.

### AI Director Runtime

Setupr's AI layer is a director runtime, not a one-shot planner:

- Reads bounded project context from README/setup docs, `.env.example`, package scripts, Docker files, CI files, and scanner output
- Compresses setup docs into compact facts before model calls
- Parses user chat into compact intent facts while preserving the exact raw message for AI fallback
- Caches context under `.setupr/cache` so startup stays fast
- Turns failures into structured diagnosis and safe re-planning decisions
- Shows plan diffs when chat steering changes the active plan
- Writes agent workflow checkpoints to `.setupr/agent-workflow.json` so interrupted flows can resume

AI output is not treated as unrestricted shell text. The director proposes structured actions, then Setupr's executor and safety policy decide whether the action is allowed, needs confirmation, or must be blocked.

```bash
setupr chat
setupr chat "how do I start this app?"
setupr chat "what failed last time?"
setupr chat "switch model to moonshot-v1-128k"
setupr chat --new
setupr chat resume
```

## Agent-Guided TUI Flow

The `setup` TUI is an agent workspace, not just a log viewer:

- Before the dashboard opens, Setupr prints a plain-text warning describing what it may do
- Inside the TUI, the main panel shows a time-ordered timeline: system events, AI decisions, user messages, command output, warnings, and confirmations
- When the agent needs input, it pauses with an option card above the persistent chat input
- The AI director can act on natural language while setup is open: change models, fill env values, skip or rewrite plan steps
- `--force` skips safe prompts and uses defaults where possible, but does not invent secrets and still stops for blockers

## Safety Policy

All command-like actions pass through one safety layer. Safe checks and normal dependency installs can run. Medium/high-risk actions require confirmation. Critical actions (root/home wildcard deletion, `curl | sh`, unsafe elevated commands) are blocked. `--force` never bypasses critical safety blockers.

## Environment Management

```bash
setupr env            # Open interactive .env editor TUI
setupr env init       # Create .env from .env.example
setupr env check      # Check for missing variables
setupr env sync       # Sync structure with .env.example
setupr env smart      # Smart reorganize + auto-fill
```

## Checkpoint & Resume

- Progress saved to `.setupr/checkpoint.json`
- Agent workflow state saved to `.setupr/agent-workflow.json`
- Setup stops on the first failed step (non-zero exit in plain mode)
- Persists across terminals and reboots
- Automatically cleaned up on success

## Verification And Security

```bash
setupr test quick                          # Fast local check
setupr test full --report .setupr/test-report.md  # Broader check
setupr test doctor                         # Coverage explanation
setupr security scan                       # Defensive local scan
setupr security deep --report .setupr/security-report.json
```

## Plugin Development

```bash
setupr plugin create team-tools
setupr plugin validate .
setupr plugin doctor
```

Plugins extend Setupr with commands, scanners, planners, doctor checks, fixers, and TUI panels. Plugin-proposed work still routes through Setupr's safety systems.
