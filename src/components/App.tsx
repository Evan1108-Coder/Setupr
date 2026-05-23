import React, { useEffect } from "react";
import { Box, useApp } from "ink";
import { StoreProvider, useAppStore } from "../store/StoreContext.js";
import { MainPanel } from "./MainPanel.js";
import { StatusPanel } from "./StatusPanel.js";
import { FilesPanel } from "./FilesPanel.js";
import { ChatInput } from "./ChatInput.js";
import { useKeyboardNav } from "./useKeyboardNav.js";
import { runSetupFlow } from "../agent/orchestrator.js";

type Flags = {
  noTui: boolean;
  force: boolean;
};

function Layout() {
  useKeyboardNav();
  const phase = useAppStore((s) => s.phase);
  const command = useAppStore((s) => s.command);

  useEffect(() => {
    if (command === "setup" && phase === "idle") {
      runSetupFlow();
    }
  }, [command, phase]);

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" flexGrow={1} flexBasis="70%">
          <MainPanel />
        </Box>
        <Box flexDirection="column" flexBasis="30%">
          <StatusPanel />
          <FilesPanel />
        </Box>
      </Box>
      <ChatInput />
    </Box>
  );
}

export function App({ command, flags }: { command: string; flags: Flags }) {
  const cwd = process.cwd();

  return (
    <StoreProvider command={command} cwd={cwd}>
      <Layout />
    </StoreProvider>
  );
}
