import React from "react";
import { render } from "ink";
import meow from "meow";
import { App } from "./components/App.js";

const cli = meow(
  `
  Usage
    $ setup [command]

  Commands
    setup     Full project setup (default)
    start     Detect and run project
    doctor    Diagnose environment health
    update    Update dependencies
    clean     Remove artifacts

  Options
    --no-tui  Plain terminal output
    --force   Skip all prompts

  Examples
    $ setup
    $ setup doctor
    $ setup start
`,
  {
    importMeta: import.meta,
    flags: {
      noTui: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
    },
  }
);

const command = (cli.input[0] || "setup") as string;

render(<App command={command} flags={cli.flags} />);
