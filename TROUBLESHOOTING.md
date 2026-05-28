# Troubleshooting

## Common Issues

### "Cannot find module" errors

**Cause**: Dependencies not installed or build not run.

**Fix**:
```bash
npm install
npm run build
```

### TUI doesn't render properly

**Cause**: Terminal doesn't support Unicode, the alternate screen buffer, or SGR mouse reporting.

**Fix**: Use `--plain` flag for basic terminal output:
```bash
setup --plain
```

For the full TUI, use a modern terminal such as Terminal.app, iTerm2, Ghostty, WezTerm, Alacritty, or Kitty. Setupr does not force a background color; it inherits the active terminal profile. If the screen looks stuck after an interrupted run, reset the terminal with:

```bash
printf '\033[0m\033[?1000l\033[?1006l\033[?25h\033[?1049l'
clear
```

The TUI uses Unicode box-drawing characters. Small visual gaps in vertical lines usually come from the terminal font or line-height settings rather than Setupr drawing separate graphical rectangles.

### Mouse or scroll codes appear in the input

If you see text like `[<0;78;17m` after clicking or scrolling, the terminal left mouse reporting enabled after an interrupted process. Setupr disables mouse reporting on exit and strips those reports from inputs, but you can manually reset the terminal with:

```bash
printf '\033[?1000l\033[?1002l\033[?1003l\033[?1006l'
```

Modern Terminal.app, iTerm2, and Ghostty all support the mouse protocol Setupr uses.

### AI features not working

**Cause**: Missing API key.

**Fix**: Save at least one AI provider key in global Setupr auth storage:

```bash
setup auth login
# Or: setup auth set-key github
```

You can test provider connectivity and select a specific model with:

```bash
setup auth test
setup auth use kimi-k2-turbo-preview
```

Setupr works without AI — it falls back to pattern matching and heuristics.

### Error codes

Setupr errors include a stable code, explanation, details, and next steps. Useful examples:

| Code | Meaning |
|------|---------|
| `ENV_TEMPLATE_MISSING` | `.env.example` is missing, so Setupr cannot infer app env variables |
| `ENV_CHECK_FAILED` | required env values are missing, empty, or invalid |
| `AUTH_STORAGE_INVALID` | `~/.setupr/secrets.json` is corrupt or not valid JSON |
| `AUTH_STORAGE_FAILED` | Setupr could not read or write global auth storage |
| `AI_PROVIDER_AUTH_FAILED` | provider rejected the API key |
| `AI_PROVIDER_QUOTA_EXHAUSTED` | provider reported no remaining credits/quota |
| `COMMAND_NOT_FOUND` | a required command is not available on PATH |
| `INSTALL_FAILED`, `BUILD_FAILED`, `TEST_FAILED` | project command failed in that phase |
| `CLEAN_TARGET_FAILED` | a clean target could not be removed |

If `AUTH_STORAGE_INVALID` appears, Setupr stops rather than treating all keys as missing. Fix the JSON file or move it aside:

```bash
mv ~/.setupr/secrets.json ~/.setupr/secrets.json.broken
setup auth login
```

Raw API keys and token-like values are masked in error output and AI context.

### "Permission denied" on install

**Cause**: Global npm install requires elevated permissions.

**Fix**: Use npx instead:
```bash
npx setupr
```

Or fix npm permissions: https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally

### Setup fails at "Install dependencies"

**Cause**: Package manager not installed or network issues.

**Fix**:
1. Verify your package manager is installed: `npm --version` / `yarn --version`
2. Check network connectivity
3. Try running the install command manually

In `--plain` mode, setup stops after the failed step and exits non-zero. Fix the failing command, then rerun `setup --plain`.

### `.env` was not created

Setupr creates `.env` from `.env.example` when a template is present. If `.env` already exists, `setup env init` leaves it unchanged unless you pass:

```bash
setup env init --force
```

### Port conflicts

Use the port command to check:
```bash
setup port 3000
setup port  # Check all common ports
```

### Checkpoint issues

If a checkpoint is corrupted or stale:
```bash
rm -rf .setupr/checkpoint.json
setup  # Start fresh
```

### Wrong language/framework detected

Override detection with a `.setupr.json` file:
```json
{
  "language": "TypeScript",
  "framework": "Next.js",
  "runtime": "node",
  "packageManager": "pnpm"
}
```

## Getting Help

- Run `setup --help` for command reference
- Run `setup doctor` to diagnose environment issues
- Run `npm run smoke:fixtures` from the repository before publishing or after large error/TUI/auth/env/command-execution changes
- File issues at: https://github.com/Evan1108-Coder/Setupr/issues
