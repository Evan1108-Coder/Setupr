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

**Cause**: Terminal doesn't support Unicode or alternate screen buffer.

**Fix**: Use `--plain` flag for basic terminal output:
```bash
setup --plain
```

### AI features not working

**Cause**: No AI provider API key configured.

**Fix**: Set any one of the supported provider keys:
```bash
export OPENAI_API_KEY=your-key       # or
export ANTHROPIC_API_KEY=your-key    # or
export GOOGLE_API_KEY=your-key       # or
export GROQ_API_KEY=your-key         # or
export MINIMAX_API_KEY=your-key      # or
export MOONSHOT_API_KEY=your-key
```

Check configured providers: `setup config models`

P-Setup works without AI — it falls back to pattern matching and heuristics.

### "Permission denied" on install

**Cause**: Global npm install requires elevated permissions.

**Fix**: Use npx instead:
```bash
npx p-setup
```

Or fix npm permissions: https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally

### Setup fails at "Install dependencies"

**Cause**: Package manager not installed or network issues.

**Fix**:
1. Verify your package manager is installed: `npm --version` / `yarn --version`
2. Check network connectivity
3. Try running the install command manually

### Port conflicts

Use the port command to check:
```bash
setup port 3000
setup port  # Check all common ports
```

### Checkpoint issues

If a checkpoint is corrupted or stale, use `--force` to start fresh:
```bash
setup --force
```

Or manually remove it:
```bash
rm -rf .p-setup/checkpoint.json
setup
```

### Wrong language/framework detected

Override detection with a `.p-setup.json` file:
```json
{
  "language": "TypeScript",
  "framework": "Next.js",
  "packageManager": "pnpm"
}
```

## Getting Help

- Run `setup --help` for command reference
- Run `setup doctor` to diagnose environment issues
- File issues at: https://github.com/Evan1108-Coder/P-Setup/issues
