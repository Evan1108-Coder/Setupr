import React from "react";
import { Box, Text } from "ink";
import { colors, getBorderStyle, icons } from "../theme.js";
import type { PortInfo, DepInfo, NoticeInfo } from "../../state/store.js";

interface SidebarProps {
  stepNum: number;
  totalSteps: number;
  currentStepLabel: string;
  envSource: string;
  totalVars: number;
  filledVars: number;
  needInput: number;
  elapsed: number;
  ports: PortInfo[];
  keyDeps: DepInfo[];
  notices: NoticeInfo[];
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, "0")}s`;
  return `${sec}s`;
}

export function Sidebar({
  stepNum,
  totalSteps,
  currentStepLabel,
  envSource,
  totalVars,
  filledVars,
  needInput,
  elapsed,
  ports,
  keyDeps,
  notices,
}: SidebarProps) {
  return (
    <Box
      flexDirection="column"
      width="22%"
      borderStyle={getBorderStyle("panel")}
      borderColor={colors.border}
      paddingX={1}
      minWidth={0}
    >
      {/* CURRENT STEP */}
      <Text color={colors.heading} bold>CURRENT STEP</Text>
      <SideRow label="Step" value={`${stepNum}/${totalSteps} ${currentStepLabel}`} />
      {envSource && <SideRow label="Source" value={envSource} />}
      <SideRow label="Total Vars" value={String(totalVars)} />
      <SideRow label="Filled" value={`${filledVars} auto`} />
      <SideRow label="Need Input" value={String(needInput)} />
      <SideRow label="Elapsed" value={formatTime(elapsed)} />
      <Text> </Text>

      {/* PORT MAP */}
      <Text color={colors.heading} bold>PORT MAP</Text>
      {ports.length > 0 ? (
        ports.map((p) => (
            <Box key={p.service} justifyContent="space-between" width="100%" minWidth={0}>
              <Box flexShrink={1} minWidth={0} marginRight={1}>
                <Text color={colors.label} wrap="truncate">{p.service}</Text>
              </Box>
              <Box flexShrink={0}>
              <Text color={colors.value}>:{p.port}</Text>
              <Text color={p.status === "free" ? colors.success : colors.error}>
                {" "}{p.status === "free" ? "✓ free" : "✗ in use"}
              </Text>
            </Box>
          </Box>
        ))
      ) : (
        <Text color={colors.textDim}>No ports detected</Text>
      )}
      {ports.some((p) => p.remapped) && (
        <Text color={colors.warning}>
          {"  "}↳ remapped to :{ports.find((p) => p.remapped)?.remapped}
        </Text>
      )}
      <Text> </Text>

      {/* KEY DEPENDENCIES */}
      <Text color={colors.heading} bold>KEY DEPENDENCIES</Text>
      {keyDeps.length > 0 ? (
        keyDeps.slice(0, 8).map((dep) => (
          <Box key={dep.name} justifyContent="space-between" width="100%" minWidth={0}>
            <Box flexShrink={1} minWidth={0} marginRight={1}>
              <Text color={colors.label} wrap="truncate">{dep.name}</Text>
            </Box>
            <Box flexShrink={0}>
              <Text color={colors.value}>{dep.version}</Text>
              <Text color={colors.success}> {icons.check}</Text>
            </Box>
          </Box>
        ))
      ) : (
        <Text color={colors.textDim}>Scanning...</Text>
      )}
      <Text> </Text>

      {/* NOTICES */}
      <Text color={colors.heading} bold>NOTICES</Text>
      {notices.length > 0 ? (
        notices.map((n, i) => (
          <Text key={i} color={getNoticeColor(n.type)} wrap="truncate">
            {getNoticeIcon(n.type)} {n.message}
          </Text>
        ))
      ) : (
        <Text color={colors.textDim}>No issues</Text>
      )}
    </Box>
  );
}

function SideRow({ label, value }: { label: string; value: string }) {
  return (
    <Box justifyContent="space-between" width="100%" minWidth={0}>
      <Box flexShrink={0} marginRight={1}>
        <Text color={colors.label}>{label}</Text>
      </Box>
      <Box flexShrink={1} minWidth={0}>
        <Text color={colors.value} wrap="truncate">{value}</Text>
      </Box>
    </Box>
  );
}

function getNoticeColor(type: NoticeInfo["type"]): string {
  switch (type) {
    case "warning": return colors.warning;
    case "error": return colors.error;
    case "info": return colors.info;
  }
}

function getNoticeIcon(type: NoticeInfo["type"]): string {
  switch (type) {
    case "warning": return icons.warning;
    case "error": return icons.dot;
    case "info": return icons.info;
  }
}
