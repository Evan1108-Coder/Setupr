import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";
import type { FocusState } from "../hooks/useFocusNavigation.js";

interface PanelProps {
  title: string;
  active?: boolean;
  focusState?: FocusState;
  width?: number | string;
  height?: number | string;
  minHeight?: number | string;
  flexGrow?: number;
  flexShrink?: number;
  children: React.ReactNode;
}

export function Panel({
  title,
  active = false,
  focusState,
  width,
  height,
  minHeight,
  flexGrow,
  flexShrink,
  children,
}: PanelProps) {
  const state: FocusState = focusState || (active ? "focused" : undefined);
  const focused = state === "focused";
  const ancestor = state === "ancestor";
  const borderColor = focused ? colors.borderActive : ancestor ? colors.accent : colors.border;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      width={width}
      height={height}
      minHeight={minHeight}
      flexGrow={flexGrow}
      flexShrink={flexShrink}
      paddingX={1}
    >
      <Box width="100%" flexShrink={0}>
        <Text color={focused ? colors.textBright : ancestor ? colors.accent : colors.textDim} bold={focused || ancestor}>
          {focused ? "▸ " : ancestor ? "◆ " : "  "}
          {title}
        </Text>
      </Box>
      <Box flexDirection="column" width="100%" minWidth={0} flexShrink={1} overflow="hidden">
        {children}
      </Box>
    </Box>
  );
}
