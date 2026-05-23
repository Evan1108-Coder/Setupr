import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useAppStore } from "../store/StoreContext.js";
import { sendChatMessage } from "../agent/orchestrator.js";

export function ChatInput() {
  const [value, setValue] = useState("");
  const activePanel = useAppStore((s) => s.activePanel);
  const isActive = activePanel === "chat";
  const aiThinking = useAppStore((s) => s.aiThinking);

  const handleSubmit = (text: string) => {
    if (!text.trim() || aiThinking) return;
    sendChatMessage(text.trim());
    setValue("");
  };

  return (
    <Box
      borderStyle="round"
      borderColor={isActive ? "cyan" : "gray"}
      paddingX={1}
    >
      <Text color={isActive ? "cyan" : "gray"}>
        {isActive ? "● " : "○ "}
      </Text>
      <Text color="green" bold>
        {"❯ "}
      </Text>
      {isActive ? (
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="Ask AI anything..."
        />
      ) : (
        <Text color="gray">
          {value || "Press ↓ to chat..."}
        </Text>
      )}
    </Box>
  );
}
