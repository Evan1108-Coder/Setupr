# Environment Variables

## P-Setup AI Provider Keys

P-Setup provider API keys should be stored globally with `setup auth`, not in a project `.env` file:

```bash
setup auth login
setup auth set-key github
setup auth list
setup auth test
setup auth use openai/gpt-4.1-mini
```

Keys are stored at `~/.p-setup/secrets.json` with file permissions `0600`, and P-Setup only displays masked values.

Supported provider environment variable names are still accepted for CI, temporary overrides, and backward compatibility:

| Variable | Provider | Models |
|----------|----------|--------|
| `OPENAI_API_KEY` | OpenAI | gpt-5.4-pro, gpt-5.4-mini, gpt-4o, gpt-4o-mini |
| `ANTHROPIC_API_KEY` | Anthropic | claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5, claude-3.5-sonnet |
| `GOOGLE_API_KEY` | Google | gemini-3.1-pro, gemini-3-flash, gemini-2.5-flash-lite |
| `GROQ_API_KEY` | Groq (Llama) | llama-4-maverick, llama-4-scout, llama-3.3-70b |
| `MINIMAX_API_KEY` | MiniMax | minimax-m2.7, minimax-m2.5-lightning |
| `MOONSHOT_API_KEY` | Moonshot (Kimi) | kimi-latest, kimi-k2-thinking, kimi-k2-turbo-preview, kimi-k2.5-vision, moonshot-v1-128k |
| `GITHUB_MODELS_API_KEY` | GitHub Models | openai/gpt-4.1, openai/gpt-4.1-mini, openai/gpt-4o, openai/gpt-4o-mini, or any GitHub catalog ID |
| `GITHUB_TOKEN` | GitHub Models alias | Same as above; token needs GitHub Models access |
| `GITHUB_API_KEY` | GitHub Models alias | Same as above; accepted for users who label the token as an API key |

For GitHub Models, use a token that can read GitHub Models. Fine-grained PATs or app tokens need the `models: read` permission.

P-Setup resolves provider keys in this order:

1. Shell environment variables
2. Global auth storage from `setup auth set-key`
3. Local `.env.local`
4. Local `.env`
5. Saved model preference from `setup auth use` (for model selection only)

To migrate old provider keys out of a project `.env`:

```bash
setup auth migrate
```

Project `.env`, `.env.local`, and `.env.example` should primarily describe the app being set up, such as `DATABASE_URL`, `PORT`, or `NEXT_PUBLIC_API_URL`.

## P-Setup Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `P_SETUP_AI_MODEL` | Project-local override for AI model selection | *(auto-detect cheapest available)* |
| `P_SETUP_LOG_LEVEL` | Log verbosity (debug, info, warn, error) | `info` |

If several provider keys are set, the selected model is deterministic:

1. `P_SETUP_AI_MODEL` or `setup auth use ...` wins.
2. Otherwise P-Setup picks the cheapest configured model from its known local pricing table.
3. GitHub Models catalog pricing is treated as unknown, so GitHub is picked automatically only if explicitly selected or if it is the only configured provider.
4. The setup pre-warning and TUI timeline show which model the AI director is using.

## How P-Setup Handles Your .env

### Detection

P-Setup detects required environment variables by:
1. Reading `.env.example` as the template
2. Comparing against your `.env` file
3. Validating values (URLs, ports, key lengths, placeholders)
4. Reporting missing, empty, and invalid variables

### Commands

```bash
# Create .env from .env.example
setup env init

# Recreate .env from .env.example even if .env already exists.
# If no .env.example exists, --force creates an empty .env with a warning.
setup env init --force

# Check for missing variables
setup env check

# Sync .env structure with .env.example (preserves values)
setup env sync

# Smart analysis: detect issues + interactive fix
setup env smart
```

### `env smart` Behavior

1. Reads `.env.example` as the template
2. Detects issues: missing vars, empty values, invalid values (bad URLs, short keys, placeholder text)
3. Reports extra vars not in .env.example
4. In interactive mode (TTY), prompts you to fix each issue
5. Reorganizes .env to match .env.example ordering
6. Preserves all existing valid values and extra vars

### Safety Defaults

- `setup env init` never overwrites an existing `.env` unless you pass `--force`
- `setup env init` does not create `.env` when `.env.example` is missing unless you pass `--force`; without force it returns `ENV_TEMPLATE_MISSING`
- with `--force`, a missing `.env.example` creates an empty `.env` and reports that no variables were inferred
- `setup` creates a missing `.env` from `.env.example` during the environment step
- `setup env check` exits non-zero when required variables are missing
- Plain-mode setup stops and exits non-zero if install, env setup, build, or verification fails

### Validation Rules

- **URLs**: Must start with `http` or `localhost` or contain `:`
- **Ports**: Must be a number between 1-65535
- **Keys/Secrets/Tokens**: Must be at least 8 characters
- **Emails**: Must contain `@`
- **Placeholders**: Detects `changeme`, `your_key_here`, `TODO`, `xxx`, `REPLACE_ME`

### Security

- P-Setup provider API keys should live in global auth storage, not project `.env`
- P-Setup masks sensitive env values before AI context is built
- `.env` files are in `.gitignore` by default
