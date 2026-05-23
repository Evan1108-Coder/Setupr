import React from "react";
import { Box, Text } from "ink";
import { Panel } from "./Panel.js";
import { useAppStore } from "../store/StoreContext.js";
import type { AIMessage } from "../store/appStore.js";

function MessageView({ msg }: { msg: AIMessage }) {
  if (msg.role === "assistant") {
    return (
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          AI:{" "}
        </Text>
        <Text wrap="wrap">{msg.content}</Text>
      </Box>
    );
  }
  if (msg.role === "user") {
    return (
      <Box marginBottom={1}>
        <Text color="green" bold>
          You:{" "}
        </Text>
        <Text>{msg.content}</Text>
      </Box>
    );
  }
  return (
    <Box marginBottom={1}>
      <Text color="gray" dimColor>
        {msg.content}
      </Text>
    </Box>
  );
}

export function MainPanel() {
  const messages = useAppStore((s) => s.messages);
  const aiThinking = useAppStore((s) => s.aiThinking);
  const phase = useAppStore((s) => s.phase);

  return (
    <Panel id="main" title="AI Agent">
      {messages.length === 0 && phase === "idle" && (
        <Text color="gray">Waiting to start...</Text>
      )}
      {messages.map((msg, i) => (
        <MessageView key={i} msg={msg} />
      ))}
      {aiThinking && (
        <Box>
          <Text color="yellow">⠋ Thinking...</Text>
        </Box>
      )}
    </Panel>
  );
}
