# Environment Variables

## P-Setup Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `MINIMAX_API_KEY` | Minimax API key for AI features | *(none — AI disabled)* |
| `P_SETUP_AI_MODEL` | AI model to use | `MiniMax-Text-01` |
| `P_SETUP_LOG_LEVEL` | Log verbosity (debug, info, warn, error) | `info` |

## How P-Setup Handles Your .env

### Detection

P-Setup detects required environment variables by:
1. Reading `.env.example` as the template
2. Comparing against your `.env` file
3. Reporting missing variables

### Commands

```bash
# Create .env from .env.example
setup env init

# Check for missing variables
setup env check

# Sync .env structure with .env.example (preserves values)
setup env sync

# Smart reorganize: match .env.example structure + attempt auto-fill
setup env smart
```

### `env smart` Behavior

1. Reads `.env.example` as the template (ordering, grouping, comments)
2. Reorganizes your `.env` to match the template structure
3. Preserves all existing values
4. For NEW keys in `.env.example` that aren't in your `.env`:
   - Keeps the example value as placeholder

### Security

- P-Setup **never** sends your `.env` values to any external service
- AI features only receive variable names, never values
- `.env` files are in `.gitignore` by default
