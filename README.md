# p-setup

Intelligent project setup & management CLI. Auto-detects your stack, installs dependencies, configures environments, and keeps projects healthy.

## Features (v0.1)

- **Rich TUI** — Panel layout with keyboard navigation (arrow keys, Tab)
- **AI Agent** — Built-in AI co-pilot that plans and executes setup workflows
- **Project Scanner** — Detects language, runtime, package manager, framework
- **Chat Interface** — Persistent chat input for asking questions or steering the AI
- **Multi-stack** — Node.js, Python, Rust, Go, Ruby detection

## Install

```bash
npm install -g p-setup
```

## Usage

```bash
# Run in any project directory
setup

# Or use the full command name
p-setup

# Show help
setup --help
```

## Commands

| Command | Description |
|---------|-------------|
| `setup` | Full project setup (default) |
| `start` | Detect and run project |
| `doctor` | Diagnose environment health |
| `update` | Update dependencies |
| `clean` | Remove artifacts |

## TUI Navigation

- **Arrow keys** — Move between panels
- **Tab** — Cycle through panels
- **Type in chat** — When chat panel is active, type to talk to AI

## AI Configuration

Set environment variables to enable AI features:

```bash
export AI_API_KEY=sk-...
export AI_MODEL=gpt-4o-mini     # optional, defaults to gpt-4o-mini
export AI_PROVIDER=openai        # optional
```

Works with any OpenAI-compatible endpoint. Without an API key, runs in offline mode with pattern-matching responses.

## Development

```bash
git clone https://github.com/Evan1108-Coder/P-Setup.git
cd P-Setup
npm install
npm run dev    # watch mode
npm run build  # production build
npm test       # run tests
```

## Architecture

```
src/
├── cli.tsx              # Entry point (meow CLI parser)
├── components/          # Ink TUI components
│   ├── App.tsx          # Root layout
│   ├── Panel.tsx        # Reusable panel with active highlighting
│   ├── MainPanel.tsx    # AI agent output (messages, thinking)
│   ├── StatusPanel.tsx  # Setup step progress
│   ├── FilesPanel.tsx   # Project scan results
│   └── ChatInput.tsx    # Persistent user input
├── store/               # Zustand state management
│   ├── appStore.ts      # State types and store factory
│   └── StoreContext.tsx # React context provider
├── agent/               # AI integration
│   ├── aiClient.ts      # OpenAI SDK wrapper + fallback
│   └── orchestrator.ts  # Setup flow + chat message handling
├── scanner/             # Project detection
│   └── projectScanner.ts
└── utils/
```

## License

MIT
