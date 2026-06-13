import React, { useState } from "react";
import { Box, Text } from "ink";
import { colors, getBorderStyle } from "../theme.js";
import { BoundedTextInput } from "./BoundedTextInput.js";
import type { FocusBounds, FocusState } from "../hooks/useFocusNavigation.js";
import { stripTerminalControlInput } from "../terminalInput.js";

interface ChatInputProps {
  active: boolean;
  focusState?: FocusState;
  onSubmit: (text: string, meta?: { steer?: boolean }) => void;
  placeholder?: string;
  isSensitive?: boolean;
  width?: number;
  maxLines?: number;
  scrollBounds?: FocusBounds;
  disabled?: boolean;
  disabledText?: string;
}

export function ChatInput({
  active,
  focusState,
  onSubmit,
  placeholder = "Ask anything...",
  isSensitive = false,
  width,
  maxLines = 4,
  scrollBounds,
  disabled = false,
  disabledText = "AI is working. Esc pauses, Ctrl+R resumes.",
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const focused = focusState === "focused" || active;
  const boxWidth = Math.max(12, width || 80);
  const inputWidth = Math.max(1, boxWidth - 6);

  const handleSubmit = (text: string, meta?: { steer?: boolean }) => {
    const cleanText = stripTerminalControlInput(text).trim();
    if (!cleanText) return;
    const slashSteer = cleanText.match(/^\/(?:st|steer)\s+(.+)/i);
    onSubmit(slashSteer?.[1]?.trim() || cleanText, { steer: Boolean(meta?.steer || slashSteer) });
    setValue("");
  };

  const handleChange = (text: string) => {
    setValue(stripTerminalControlInput(text));
  };

  return (
    <Box
      borderStyle={getBorderStyle("input")}
      borderColor={disabled ? colors.textDim : focused ? colors.borderActive : colors.border}
      paddingX={1}
      width={boxWidth}
      flexShrink={0}
    >
      <Text color={disabled ? colors.textDim : colors.primary}>❯ </Text>
      {disabled ? (
        <Box width={inputWidth} minWidth={0} overflow="hidden">
          <Text color={colors.textDim} wrap="truncate">{disabledText}</Text>
        </Box>
      ) : (
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
      )}
    </Box>
  );
}
