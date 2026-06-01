import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { colors } from "../theme.js";
import { parseSgrMouse, stripTerminalControlInput } from "../terminalInput.js";
import type { FocusBounds } from "../hooks/useFocusNavigation.js";

interface BoundedTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string, meta?: { steer?: boolean }) => void;
  focus: boolean;
  placeholder?: string;
  mask?: string;
  width?: number;
  maxLines?: number;
  scrollBounds?: FocusBounds;
}

export function BoundedTextInput({
  value,
  onChange,
  onSubmit,
  focus,
  placeholder = "",
  mask,
  width,
  maxLines = 4,
  scrollBounds,
}: BoundedTextInputProps) {
  const [cursor, setCursor] = useState(value.length);
  const [scrollLine, setScrollLine] = useState(0);
  const wrapWidth = Math.max(8, (width || 80) - 4);

  const displayValue = mask ? mask.repeat(value.length) : value;
  const renderedValue = focus
    ? `${displayValue.slice(0, cursor)}▌${displayValue.slice(cursor)}`
    : displayValue;
  const lines = useMemo(() => wrapLines(renderedValue || placeholder, wrapWidth), [renderedValue, placeholder, wrapWidth]);
  const visibleHeight = Math.min(maxLines, Math.max(1, lines.length));
  const maxScroll = Math.max(0, lines.length - visibleHeight);

  useEffect(() => {
    setCursor((current) => Math.min(current, value.length));
  }, [value.length]);

  useEffect(() => {
    if (scrollLine > maxScroll) setScrollLine(maxScroll);
  }, [maxScroll, scrollLine]);

  useEffect(() => {
    if (!focus) return;
    const cursorLine = findLineForCursor(displayValue, cursor, wrapWidth);
    if (cursorLine < scrollLine) {
      setScrollLine(cursorLine);
    } else if (cursorLine >= scrollLine + visibleHeight) {
      setScrollLine(Math.min(maxScroll, cursorLine - visibleHeight + 1));
    }
  }, [cursor, displayValue, focus, maxScroll, scrollLine, visibleHeight, wrapWidth]);

  useInput((input, key) => {
    const mouse = parseSgrMouse(input);
    if (mouse?.action === "press") {
      if (scrollBounds && pointInBounds(mouse.x, mouse.y, scrollBounds)) {
        const line = clamp(mouse.y - scrollBounds.y + scrollLine, 0, Math.max(0, lines.length - 1));
        const column = clamp(mouse.x - scrollBounds.x, 0, wrapWidth);
        setCursor(cursorForWrappedPosition(value, line, column, wrapWidth));
      }
      return;
    }

    if (mouse?.action === "scroll") {
      if (scrollBounds && !pointInBounds(mouse.x, mouse.y, scrollBounds)) {
        return;
      }
      setScrollLine((current) => clamp(current + (mouse.code === 64 ? -1 : 1), 0, maxScroll));
      return;
    }

    const shortcut = shortcutFromInput(input, key);
    if (shortcut) {
      applyShortcut(shortcut, value, cursor, onChange, setCursor);
      return;
    }

    const cleanInput = stripTerminalControlInput(input).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const returnOnly = key.return || input === "\r" || input === "\n" || cleanInput === "\n";
    if (!cleanInput && !returnOnly && !key.backspace && !key.delete && !key.leftArrow && !key.rightArrow) {
      return;
    }

    if (returnOnly) {
      onSubmit(value, { steer: Boolean(key.ctrl) });
      return;
    }

    if (key.backspace || input === "\x7f") {
      if (cursor === 0) return;
      const next = value.slice(0, cursor - 1) + value.slice(cursor);
      onChange(next);
      setCursor((current) => Math.max(0, current - 1));
      return;
    }

    if (key.delete) {
      if (cursor >= value.length) return;
      onChange(value.slice(0, cursor) + value.slice(cursor + 1));
      return;
    }

    if (key.tab || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow || key.escape || (key.ctrl && input === "c")) {
      return;
    }

    if (cleanInput) {
      const next = value.slice(0, cursor) + cleanInput + value.slice(cursor);
      onChange(next);
      setCursor((current) => current + cleanInput.length);
    }
  }, { isActive: focus });

  const visibleLines = lines.slice(scrollLine, scrollLine + visibleHeight);
  const placeholderColor = value.length === 0 ? colors.textDim : colors.text;

  return (
    <Box flexDirection="column" height={visibleHeight} overflowY="hidden" minWidth={0} flexGrow={1} flexShrink={1}>
      {visibleLines.map((line, index) => (
        <Text key={`${scrollLine}-${index}`} color={placeholderColor} wrap="truncate">
          {line || " "}
        </Text>
      ))}
    </Box>
  );
}

function wrapLines(value: string, width: number): string[] {
  return wrapLineSegments(value, width).map((line) => line.text);
}

function wrapLineSegments(value: string, width: number): Array<{ text: string; start: number }> {
  const rawLines = value.split("\n");
  const lines: Array<{ text: string; start: number }> = [];
  let absoluteIndex = 0;

  for (const rawLine of rawLines) {
    if (rawLine.length === 0) {
      lines.push({ text: "", start: absoluteIndex });
      absoluteIndex += 1;
      continue;
    }
    for (let index = 0; index < rawLine.length; index += width) {
      lines.push({ text: rawLine.slice(index, index + width), start: absoluteIndex + index });
    }
    absoluteIndex += rawLine.length + 1;
  }

  return lines.length > 0 ? lines : [{ text: "", start: 0 }];
}

function findLineForCursor(value: string, cursor: number, width: number): number {
  const beforeCursor = value.slice(0, cursor);
  return wrapLines(beforeCursor, width).length - 1;
}

function cursorForWrappedPosition(value: string, line: number, column: number, width: number): number {
  const segments = wrapLineSegments(value, width);
  const segment = segments[clamp(line, 0, Math.max(0, segments.length - 1))];
  return clamp(segment.start + Math.min(column, segment.text.length), 0, value.length);
}

type InputShortcut =
  | "start"
  | "end"
  | "clear-before"
  | "clear-after"
  | "delete-word-before"
  | "delete-word-after"
  | "delete-forward"
  | "word-left"
  | "word-right";

function shortcutFromInput(input: string, key: { ctrl?: boolean; meta?: boolean; delete?: boolean }): InputShortcut | null {
  if (key.ctrl) {
    if (input === "a" || input === "\x01") return "start";
    if (input === "e" || input === "\x05") return "end";
    if (input === "u" || input === "\x15") return "clear-before";
    if (input === "k" || input === "\x0b") return "clear-after";
    if (input === "w" || input === "\x17") return "delete-word-before";
    if (input === "d" || input === "\x04") return "delete-forward";
  }
  if (input === "\x1b[H" || input === "\x1bOH") return "start";
  if (input === "\x1b[F" || input === "\x1bOF") return "end";
  if (input === "\x17") return "delete-word-before";
  if (input === "\x1bb" || input === "\x1b[1;3D" || input === "\x1b[1;5D" || input === "\x1b[1;9D" || input === "\x1b[5D") return "word-left";
  if (input === "\x1bf" || input === "\x1b[1;3C" || input === "\x1b[1;5C" || input === "\x1b[1;9C" || input === "\x1b[5C") return "word-right";
  if (input === "\x1b\x7f" || input === "\x1b\b" || input === "\x1b[3;3~" || input === "\x1b[3;5~") return "delete-word-before";
  if (input === "\x1bd" || input === "\x1b[3;2~" || input === "\x1b[3;6~") return "delete-word-after";
  if (input === "\x1b[3~" || (input === "\x04" && key.ctrl) || key.delete) return "delete-forward";
  return null;
}

function applyShortcut(
  shortcut: InputShortcut,
  value: string,
  cursor: number,
  onChange: (value: string) => void,
  setCursor: React.Dispatch<React.SetStateAction<number>>
): void {
  if (shortcut === "start") {
    setCursor(0);
    return;
  }
  if (shortcut === "end") {
    setCursor(value.length);
    return;
  }
  if (shortcut === "clear-before") {
    onChange(value.slice(cursor));
    setCursor(0);
    return;
  }
  if (shortcut === "clear-after") {
    onChange(value.slice(0, cursor));
    return;
  }
  if (shortcut === "delete-forward") {
    if (cursor < value.length) onChange(value.slice(0, cursor) + value.slice(cursor + 1));
    return;
  }
  if (shortcut === "word-left") {
    setCursor(previousWordIndex(value, cursor));
    return;
  }
  if (shortcut === "word-right") {
    setCursor(nextWordIndex(value, cursor));
    return;
  }
  if (shortcut === "delete-word-before") {
    const nextCursor = previousWordIndex(value, cursor);
    onChange(value.slice(0, nextCursor) + value.slice(cursor));
    setCursor(nextCursor);
    return;
  }
  if (shortcut === "delete-word-after") {
    const nextCursor = nextWordIndex(value, cursor);
    onChange(value.slice(0, cursor) + value.slice(nextCursor));
  }
}

function previousWordIndex(value: string, cursor: number): number {
  let index = Math.max(0, cursor);
  while (index > 0 && /\s/.test(value[index - 1])) index--;
  while (index > 0 && !/\s/.test(value[index - 1])) index--;
  return index;
}

function nextWordIndex(value: string, cursor: number): number {
  let index = Math.min(value.length, cursor);
  while (index < value.length && /\s/.test(value[index])) index++;
  while (index < value.length && !/\s/.test(value[index])) index++;
  return index;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pointInBounds(x: number, y: number, bounds: FocusBounds): boolean {
  return x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height;
}
