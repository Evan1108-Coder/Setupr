import React from "react";
import { Box, Text } from "ink";
import { Panel } from "./Panel.js";
import { useAppStore } from "../store/StoreContext.js";

export function FilesPanel() {
  const scan = useAppStore((s) => s.scan);

  return (
    <Panel id="files" title="Project">
      {!scan ? (
        <Text color="gray">No scan yet</Text>
      ) : (
        <Box flexDirection="column">
          {scan.language && (
            <Text>
              <Text color="cyan" bold>Lang: </Text>
              <Text>{scan.language}</Text>
            </Text>
          )}
          {scan.runtime && (
            <Text>
              <Text color="cyan" bold>Runtime: </Text>
              <Text>{scan.runtime}</Text>
            </Text>
          )}
          {scan.packageManager && (
            <Text>
              <Text color="cyan" bold>PM: </Text>
              <Text>{scan.packageManager}</Text>
            </Text>
          )}
          {scan.framework && (
            <Text>
              <Text color="cyan" bold>Framework: </Text>
              <Text>{scan.framework}</Text>
            </Text>
          )}
          <Text>
            <Text color="cyan" bold>Deps: </Text>
            <Text>{scan.dependencies}</Text>
          </Text>
          <Text>
            <Text color="cyan" bold>Env: </Text>
            <Text>{scan.hasEnvFile ? "✓ .env" : "✗ no .env"}</Text>
          </Text>
        </Box>
      )}
    </Panel>
  );
}
