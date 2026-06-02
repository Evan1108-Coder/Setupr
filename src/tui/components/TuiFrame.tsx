import React from "react";
import { Box, Text } from "ink";
import { colors, icons, shortcuts } from "../theme.js";

interface TuiHeaderProps {
  command: string;
  title?: string;
  cwd?: string;
  stack?: string;
  status?: string;
  statusColor?: string;
  right?: string;
  width: number;
}

export function TuiHeader({ command, title, cwd, stack, status, statusColor, right, width }: TuiHeaderProps) {
  const compact = width < 118;
  const leftText = compact
    ? `${icons.diamond} ${command}${title ? ` · ${title}` : ""}`
    : `${icons.diamond} ${command}${title ? `  ${title}` : ""}${stack ? `  Stack: ${stack}` : ""}${cwd ? `  ${shortPath(cwd, Math.max(12, width - 82))}` : ""}`;
  const rightText = right || status || "";
  const rightWidth = rightText ? Math.min(width - 8, Math.max(8, rightText.length + 2)) : 0;
  const leftWidth = Math.max(8, width - rightWidth);

  return (
    <Box width="100%" height={1}>
      <Box width={leftWidth} minWidth={0} flexShrink={1}>
        <Text color={colors.primary} bold wrap="truncate">{leftText}</Text>
      </Box>
      {rightWidth > 0 && (
        <Box width={rightWidth} justifyContent="flex-end" flexShrink={0}>
          <Text color={statusColor || colors.textDim} bold={Boolean(statusColor)} wrap="truncate">{rightText}</Text>
        </Box>
      )}
    </Box>
  );
}

interface TuiFooterProps {
  width: number;
  left?: string;
  right?: string;
}

export function TuiFooter({ width, left, right }: TuiFooterProps) {
  const compact = width < 110;
  const leftText = left || (compact
    ? "Ctrl+C abort · Tab next · q quit"
    : shortcuts.map((shortcut) => `${shortcut.key} ${shortcut.desc}`).join(" · "));

  return (
    <Box width="100%" height={1} justifyContent="space-between">
      <Box minWidth={0} flexShrink={1}>
        <Text color={colors.textDim} wrap="truncate">{highlightShortcuts(leftText)}</Text>
      </Box>
      {right && (
        <Box flexShrink={0} marginLeft={1}>
          <Text color={colors.textDim} wrap="truncate">{right}</Text>
        </Box>
      )}
    </Box>
  );
}

export function KVRow({ label, value, color, dim = false }: { label: string; value: string | number; color?: string; dim?: boolean }) {
  return (
    <Box justifyContent="space-between" width="100%" minWidth={0}>
      <Box flexShrink={0} marginRight={1}>
        <Text color={dim ? colors.textDim : colors.label}>{label}</Text>
      </Box>
      <Box flexShrink={1} minWidth={0}>
        <Text color={color || (dim ? colors.textDim : colors.value)} wrap="truncate">{String(value)}</Text>
      </Box>
    </Box>
  );
}

export function MetricText({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <Box flexDirection="column">
      <Text color={color || colors.textBright} bold>{String(value)}</Text>
      <Text color={colors.textDim} wrap="truncate">{label}</Text>
    </Box>
  );
}

export function toneColor(tone?: "success" | "warning" | "error" | "info" | "muted") {
  if (tone === "success") return colors.success;
  if (tone === "warning") return colors.warning;
  if (tone === "error") return colors.error;
  if (tone === "muted") return colors.textDim;
  return colors.info;
}

export function statusColor(status: string | undefined) {
  const value = (status || "").toLowerCase();
  if (/\b(fail|error|crash|missing|high|invalid|blocked)\b/.test(value)) return colors.error;
  if (/\b(warn|moderate|pending|dirty|behind|timeout|skipped|in_use)\b/.test(value)) return colors.warning;
  if (/\b(pass|ok|good|ready|running|clean|saved|complete|free|loaded|synced)\b/.test(value)) return colors.success;
  return colors.text;
}

export function shortPath(cwd: string, max = 34): string {
  const home = process.env.HOME || "";
  const path = home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
  if (path.length <= max) return path;
  return `…${path.slice(Math.max(0, path.length - max + 1))}`;
}

export function formatAge(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(delta / 60000);
  if (minutes <= 0) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function highlightShortcuts(text: string) {
  const parts = text.split(/(Ctrl\+[A-Za-z]|Tab|Esc|Enter|q|←\/↑\/↓\/→|↑\/↓|Click)/g);
  return (
    <>
      {parts.map((part, index) => {
        const isKey = /^(Ctrl\+[A-Za-z]|Tab|Esc|Enter|q|←\/↑\/↓\/→|↑\/↓|Click)$/.test(part);
        return <Text key={`${part}-${index}`} color={isKey ? colors.accent : colors.textDim} bold={isKey}>{part}</Text>;
      })}
    </>
  );
}
