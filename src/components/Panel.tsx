import React from "react";
import { Box, Text } from "ink";
import type { PanelId } from "../store/appStore.js";
import { useAppStore } from "../store/StoreContext.js";

type Props = {
  id: PanelId;
  title: string;
  children: React.ReactNode;
  height?: number | string;
  flexGrow?: number;
};

export function Panel({ id, title, children, height, flexGrow = 1 }: Props) {
  const activePanel = useAppStore((s) => s.activePanel);
  const isActive = activePanel === id;

  const borderColor = isActive ? "cyan" : "gray";
  const titleColor = isActive ? "cyan" : "white";

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      flexGrow={flexGrow}
      height={height}
      paddingX={1}
    >
      <Box>
        <Text bold color={titleColor}>
          {isActive ? "● " : "○ "}
          {title}
        </Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {children}
      </Box>
    </Box>
  );
}
