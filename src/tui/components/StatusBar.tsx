import React from "react";
import { Box, Text } from "ink";
import { colors, shortcuts } from "../theme.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";

interface StatusBarProps {
  stepProgress: string;
  aiStatus?: string;
}

export function StatusBar({ stepProgress, aiStatus }: StatusBarProps) {
  const { width } = useTerminalSize();
  const compact = width < 130;

  if (compact) {
    return (
      <Box width="100%">
        <Text color={colors.textDim} wrap="truncate">
          <Text color={colors.accent} bold>Ctrl+C</Text> abort  <Text color={colors.accent} bold>Tab</Text> next  <Text color={colors.accent} bold>q</Text> quit outside input
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="row" justifyContent="space-between" width="100%" minWidth={0}>
      <Box gap={2} minWidth={0} flexShrink={1}>
        {shortcuts.map((shortcut) => {
          const s = shortcut.key === "q" ? { ...shortcut, desc: "quit outside input" } : shortcut;
          return (
          <Box key={s.key}>
            <Text color={colors.accent}>{s.key}</Text>
            <Text color={colors.textDim}> {s.desc}</Text>
          </Box>
          );
        })}
      </Box>
      <Box gap={2} flexShrink={1} minWidth={0}>
        {aiStatus && <Text color={colors.info} wrap="truncate">{aiStatus}</Text>}
        <Text color={colors.success} wrap="truncate">{stepProgress}</Text>
      </Box>
    </Box>
  );
}
