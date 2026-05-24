# Environment Variables

## AI Provider Keys

Set one or more to enable AI features:

| Variable | Provider | Models |
|----------|----------|--------|
| `OPENAI_API_KEY` | OpenAI | gpt-5.4-pro, gpt-5.4-mini, gpt-4o, gpt-4o-mini |
| `ANTHROPIC_API_KEY` | Anthropic | claude-opus-4.6, claude-sonnet-4.6, claude-haiku-4.5, claude-3.5-sonnet |
| `GOOGLE_API_KEY` | Google | gemini-3.1-pro, gemini-3-flash, gemini-2.5-flash-lite |
| `GROQ_API_KEY` | Groq (Llama) | llama-4-maverick, llama-4-scout, llama-3.3-70b |
| `MINIMAX_API_KEY` | MiniMax | minimax-m2.7, minimax-m2.5-lightning |
| `MOONSHOT_API_KEY` | Moonshot (Kimi) | kimi-latest, kimi-k2-thinking, kimi-k2-turbo, kimi-k2.5-vision, moonshot-v1-128k |

## P-Setup Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `P_SETUP_AI_MODEL` | Override AI model selection | *(auto-detect cheapest available)* |
| `P_SETUP_LOG_LEVEL` | Log verbosity (debug, info, warn, error) | `info` |

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

### Validation Rules

- **URLs**: Must start with `http` or `localhost` or contain `:`
- **Ports**: Must be a number between 1-65535
- **Keys/Secrets/Tokens**: Must be at least 8 characters
- **Emails**: Must contain `@`
- **Placeholders**: Detects `changeme`, `your_key_here`, `TODO`, `xxx`, `REPLACE_ME`

### Security

- P-Setup **never** sends your `.env` values to any external service
- AI features only receive variable names, never values
- `.env` files are in `.gitignore` by default
