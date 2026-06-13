import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";

interface HeaderBarProps {
  projectName: string;
  stack: string;
  currentStep: string;
  stepNum: number;
  totalSteps: number;
  elapsed: number;
  eta?: number;
  checkpointSaved: boolean;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, "0")}s`;
  return `${sec}s`;
}

export function HeaderBar({
  projectName,
  stack,
  currentStep,
  stepNum,
  totalSteps,
  elapsed,
  eta,
  checkpointSaved,
}: HeaderBarProps) {
  return (
    <Box width="100%" minWidth={0} justifyContent="space-between">
      <Box minWidth={0} flexShrink={1}>
        <Text color={colors.accent}>◆ </Text>
        <Text color={colors.textBright} bold>{projectName}</Text>
        <Text color={colors.textDim}>{"  "}</Text>
        <Text color={colors.text}>Stack: </Text>
        <Text color={colors.textBright} bold>{stack}</Text>
        <Text color={colors.textDim}>{"  "}</Text>
        <Text color={colors.text}>Step {stepNum}/{totalSteps} — {currentStep}</Text>
      </Box>
      <Box flexShrink={0}>
        <Text color={colors.textDim}>Elapsed </Text>
        <Text color={colors.text}>{formatTime(elapsed)}</Text>
        {eta !== undefined && (
          <>
            <Text color={colors.textDim}>{"  "}ETA </Text>
            <Text color={colors.text}>~{formatTime(eta)}</Text>
          </>
        )}
        {checkpointSaved && (
          <>
            <Text color={colors.textDim}>{"  "}</Text>
            <Text color={colors.success}>Checkpoint </Text>
            <Text color={colors.success}>✓ saved</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
