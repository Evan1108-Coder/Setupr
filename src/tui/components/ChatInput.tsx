import React, { useState } from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";
import { BoundedTextInput } from "./BoundedTextInput.js";
import type { FocusBounds, FocusState } from "../hooks/useFocusNavigation.js";
import { stripTerminalControlInput } from "../terminalInput.js";

interface ChatInputProps {
  active: boolean;
  focusState?: FocusState;
  onSubmit: (text: string) => void;
  placeholder?: string;
  isSensitive?: boolean;
  width?: number;
  maxLines?: number;
  scrollBounds?: FocusBounds;
}

export function ChatInput({ active, focusState, onSubmit, placeholder = "Ask anything...", isSensitive = false, width, maxLines = 4, scrollBounds }: ChatInputProps) {
  const [value, setValue] = useState("");
  const focused = focusState === "focused" || active;
  const boxWidth = Math.max(12, (width || 80) - 2);
  const inputWidth = Math.max(8, boxWidth - 6);

  const handleSubmit = (text: string) => {
    const cleanText = stripTerminalControlInput(text).trim();
    if (!cleanText) return;
    onSubmit(cleanText);
    setValue("");
  };

  const handleChange = (text: string) => {
    setValue(stripTerminalControlInput(text));
  };

  return (
    <Box
      borderStyle="round"
      borderColor={focused ? colors.borderActive : colors.border}
      paddingX={1}
      width={boxWidth}
      flexShrink={1}
    >
      <Text color={colors.primary}>❯ </Text>
      <BoundedTextInput
        value={value}
        onChange={handleChange}
        onSubmit={handleSubmit}
        focus={focused}
        placeholder={placeholder}
        mask={isSensitive ? "•" : undefined}
        width={inputWidth}
        maxLines={maxLines}
        scrollBounds={scrollBounds}
      />
    </Box>
  );
}
