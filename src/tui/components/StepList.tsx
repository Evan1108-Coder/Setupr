import React from "react";
import { Box, Text } from "ink";
import { colors, icons } from "../theme.js";
import type { SetupStep } from "../../ai/planner.js";

interface StepListProps {
  steps: SetupStep[];
  currentIndex: number;
}

export function StepList({ steps, currentIndex }: StepListProps) {
  return (
    <Box flexDirection="column">
      {steps.map((step, i) => (
        <StepItem key={step.id} step={step} isCurrent={i === currentIndex} />
      ))}
    </Box>
  );
}

function StepItem({ step, isCurrent }: { step: SetupStep; isCurrent: boolean }) {
  const icon = getStepIcon(step.status);
  const color = getStepColor(step.status, isCurrent);

  return (
    <Box>
      <Text color={color}>
        {icon} {step.label}
        {step.status === "failed" && step.error ? ` — ${step.error.slice(0, 40)}` : ""}
      </Text>
    </Box>
  );
}

function getStepIcon(status: SetupStep["status"]): string {
  switch (status) {
    case "done": return icons.check;
    case "running": return icons.spinner[0];
    case "failed": return icons.cross;
    case "skipped": return "○";
    default: return "○";
  }
}

function getStepColor(status: SetupStep["status"], isCurrent: boolean): string {
  switch (status) {
    case "done": return colors.success;
    case "running": return colors.accent;
    case "failed": return colors.error;
    case "skipped": return colors.textDim;
    default: return isCurrent ? colors.text : colors.textDim;
  }
}
