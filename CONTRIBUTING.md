# Contributing to P-Setup

## Development

```bash
git clone https://github.com/Evan1108-Coder/P-Setup.git
cd P-Setup
npm install
npm run dev  # Watch mode
```

## Architecture

```
src/
├── cli/          # CLI entry, routing, pre-warning, transition
├── commands/     # Non-TUI command implementations
├── tui/          # React/Ink TUI components and layouts
├── scanner/      # Project detection (language, framework, PM, services)
├── ai/           # Multi-provider AI client (6 providers), intelligence layers, DSL
├── executor/     # Step execution, checkpoint saving, undo/redo
├── context/      # Environment context collection
├── state/        # Zustand store, checkpoint, config
└── utils/        # Shared utilities
```

## Adding a New Language

1. Add detection signals to `src/scanner/languageDetector.ts`
2. Add install command mapping in `src/ai/planner.ts`
3. Test with a sample project

## Adding a New Framework

1. Add framework signals to `src/scanner/frameworkDetector.ts`
2. Test detection with a real project

## Adding a New Command

### Non-TUI Command
1. Add handler in `src/commands/plain/router.ts`
2. Add to the help text in `src/cli/index.ts`

### TUI Command
1. Create layout in `src/tui/layouts/`
2. Add case in `src/tui/App.tsx`
3. Add to TUI command list in `src/cli/index.ts`

## Testing

```bash
npm test          # Run tests
npm run typecheck # Type check
```

## Code Style

- TypeScript strict mode
- ESM modules
- Functional components for TUI (React/Ink)
- No unnecessary comments — code should be self-documenting

## Pull Requests

1. Create a feature branch
2. Make your changes
3. Ensure `npm run typecheck` passes
4. Ensure `npm test` passes
5. Submit PR with description of changes
