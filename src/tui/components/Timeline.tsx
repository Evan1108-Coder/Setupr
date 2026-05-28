import React from "react";
import { Box, Text } from "ink";
import { colors, icons } from "../theme.js";

export type TimelineEventKind =
  | "user"
  | "assistant"
  | "system"
  | "thinking"
  | "log"
  | "notice"
  | "confirmation"
  | "question";

export type TimelineEventTone = "info" | "success" | "warning" | "error" | "muted";

export interface TimelineEvent {
  id: string;
  kind: TimelineEventKind;
  content: string;
  timestamp?: number;
  tone?: TimelineEventTone;
  title?: string;
  detail?: string;
  sensitive?: boolean;
}

interface TimelineProps {
  events: TimelineEvent[];
  maxItems?: number;
  width?: number;
  emptyText?: string;
  showTime?: boolean;
}

export function Timeline({
  events,
  maxItems = 18,
  width = 80,
  emptyText = "Nothing here yet.",
  showTime = true,
}: TimelineProps) {
  const maxRows = Math.max(1, maxItems);
  const rows = visibleTimelineRows(events.map((event) => eventRows(event, width, showTime)), maxRows);

  if (rows.length === 0) {
    return (
      <Text color={colors.textDim} italic>
        {emptyText}
      </Text>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1} minWidth={0}>
      {rows.map((row, index) => (
        <TimelineRow key={`${row.id}-${index}`} row={row} width={width} />
      ))}
    </Box>
  );
}

function visibleTimelineRows(groups: TimelineRowData[][], maxRows: number): TimelineRowData[] {
  const rows: TimelineRowData[] = [];

  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index];
    if (group.length === 0) continue;

    if (group.length <= maxRows - rows.length) {
      rows.unshift(...group);
      continue;
    }

    if (rows.length === 0) {
      rows.unshift(...group.slice(0, maxRows));
    }
    break;
  }

  return rows;
}

interface TimelineRowData {
  id: string;
  text: string;
  color: string;
  isUser: boolean;
  bold?: boolean;
}

function TimelineRow({ row, width }: { row: TimelineRowData; width: number }) {
  const rowWidth = Math.max(10, width - 6);
  const textWidth = Math.min(rowWidth, Math.max(4, visibleLength(row.text)));

  return (
    <Box width="100%" justifyContent={row.isUser ? "flex-end" : "flex-start"} minWidth={0}>
      <Box width={textWidth} minWidth={0}>
        <Text color={row.color} bold={row.bold} wrap="truncate">
          {row.text}
        </Text>
      </Box>
    </Box>
  );
}

function eventRows(event: TimelineEvent, width: number, showTime: boolean): TimelineRowData[] {
  const style = eventStyle(event);
  const isUser = event.kind === "user";
  const content = event.sensitive ? maskValue(event.content) : event.content;
  const maxWidth = Math.max(16, Math.min(88, width - 6));
  const time = showTime && event.timestamp ? `${formatTime(event.timestamp)} ` : "";
  const title = event.title ? `${event.title}: ` : "";
  const prefix = isUser ? "You: " : `${style.prefix} `;
  const firstPrefix = `${prefix}${time}${title}`;
  const continuationPrefix = " ".repeat(Math.min(firstPrefix.length, 14));

  const contentRows = wrapText(`${firstPrefix}${content}`, maxWidth, continuationPrefix).slice(0, 3);
  const rows = contentRows.map((text, index) => ({
    id: event.id,
    text,
    color: index === 0 ? style.textColor : colors.textDim,
    isUser,
    bold: isUser || event.kind === "question" || event.kind === "confirmation",
  }));

  if (event.detail && rows.length < 4) {
    rows.push({
      id: `${event.id}-detail`,
      text: truncateText(`${continuationPrefix}${event.detail}`, maxWidth),
      color: colors.textDim,
      isUser,
      bold: false,
    });
  }

  return rows.length > 0 ? rows : [{
    id: event.id,
    text: firstPrefix.trimEnd(),
    color: style.textColor,
    isUser,
  }];
}

function wrapText(text: string, width: number, continuationPrefix: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [""];
  const rows: string[] = [];
  let remaining = normalized;

  while (remaining.length > 0) {
    const prefix = rows.length === 0 ? "" : continuationPrefix;
    const available = Math.max(8, width - prefix.length);
    const chunk = takeChunk(remaining, available);
    rows.push(`${prefix}${chunk}`);
    remaining = remaining.slice(chunk.length).trimStart();
  }

  return rows;
}

function takeChunk(text: string, width: number): string {
  if (text.length <= width) return text;
  const slice = text.slice(0, width);
  const space = slice.lastIndexOf(" ");
  if (space > Math.floor(width * 0.55)) return slice.slice(0, space);
  return slice;
}

function truncateText(text: string, width: number): string {
  if (text.length <= width) return text;
  return `${text.slice(0, Math.max(0, width - 1))}…`;
}

function visibleLength(value: string): number {
  return value.length;
}

function eventStyle(event: TimelineEvent): { color: string; textColor: string; prefix: string } {
  if (event.tone) {
    return toneStyle(event.tone, event.kind);
  }

  switch (event.kind) {
    case "user":
      return { color: colors.accent, textColor: colors.textBright, prefix: "You" };
    case "assistant":
      return { color: colors.primary, textColor: colors.text, prefix: `${icons.arrowRight}` };
    case "system":
      return { color: colors.textDim, textColor: colors.textDim, prefix: "sys" };
    case "thinking":
      return { color: colors.keyword, textColor: colors.text, prefix: "..." };
    case "log":
      return { color: colors.info, textColor: colors.text, prefix: "$" };
    case "notice":
      return { color: colors.warning, textColor: colors.text, prefix: icons.warning };
    case "confirmation":
      return { color: colors.success, textColor: colors.textBright, prefix: icons.check };
    case "question":
      return { color: colors.accent, textColor: colors.textBright, prefix: "?" };
  }
}

function toneStyle(tone: TimelineEventTone, kind: TimelineEventKind) {
  const prefix = kind === "log" ? "$" : kind === "question" ? "?" : kind === "confirmation" ? icons.check : icons.info;
  switch (tone) {
    case "success":
      return { color: colors.success, textColor: colors.textBright, prefix: icons.check };
    case "warning":
      return { color: colors.warning, textColor: colors.text, prefix: icons.warning };
    case "error":
      return { color: colors.error, textColor: colors.textBright, prefix: icons.cross };
    case "muted":
      return { color: colors.textDim, textColor: colors.textDim, prefix };
    case "info":
      return { color: colors.info, textColor: colors.text, prefix };
  }
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function maskValue(value: string): string {
  if (value.length === 0) return "";
  return "•".repeat(Math.min(12, Math.max(4, value.length)));
}
