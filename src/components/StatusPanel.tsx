import React from "react";
import { Box, Text } from "ink";
import { Panel } from "./Panel.js";
import { useAppStore } from "../store/StoreContext.js";

const STATUS_ICONS = {
  pending: "○",
  running: "◉",
  done: "✓",
  error: "✗",
  skipped: "–",
} as const;

const STATUS_COLORS = {
  pending: "gray",
  running: "yellow",
  done: "green",
  error: "red",
  skipped: "gray",
} as const;

export function StatusPanel() {
  const steps = useAppStore((s) => s.steps);
  const phase = useAppStore((s) => s.phase);

  return (
    <Panel id="status" title="Status">
      {steps.length === 0 ? (
        <Text color="gray">
          {phase === "idle" ? "Ready" : "Planning..."}
        </Text>
      ) : (
        steps.map((step) => (
          <Box key={step.id}>
            <Text color={STATUS_COLORS[step.status]}>
              {STATUS_ICONS[step.status]}{" "}
            </Text>
            <Text
              color={step.status === "running" ? "white" : "gray"}
              bold={step.status === "running"}
            >
              {step.label}
            </Text>
          </Box>
        ))
      )}
    </Panel>
  );
}
