import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { colors } from "../theme.js";
import { parseSgrMouse, stripTerminalControlInput } from "../terminalInput.js";
import type { FocusBounds } from "../hooks/useFocusNavigation.js";

interface BoundedTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
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
    if (mouse?.action === "scroll") {
      if (scrollBounds && !pointInBounds(mouse.x, mouse.y, scrollBounds)) {
        return;
      }
      setScrollLine((current) => clamp(current + (mouse.code === 64 ? -1 : 1), 0, maxScroll));
      return;
    }

    const cleanInput = stripTerminalControlInput(input).replace(/\r?\n/g, " ");
    if (!cleanInput && !key.return && !key.backspace && !key.delete && !key.leftArrow && !key.rightArrow) {
      return;
    }

    if (key.return) {
      onSubmit(value);
      return;
    }

    if (key.backspace || key.delete) {
      if (cursor === 0) return;
      const next = value.slice(0, cursor - 1) + value.slice(cursor);
      onChange(next);
      setCursor((current) => Math.max(0, current - 1));
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
  const rawLines = value.split("\n");
  const lines: string[] = [];

  for (const rawLine of rawLines) {
    if (rawLine.length === 0) {
      lines.push("");
      continue;
    }
    for (let index = 0; index < rawLine.length; index += width) {
      lines.push(rawLine.slice(index, index + width));
    }
  }

  return lines.length > 0 ? lines : [""];
}

function findLineForCursor(value: string, cursor: number, width: number): number {
  const beforeCursor = value.slice(0, cursor);
  return wrapLines(beforeCursor, width).length - 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pointInBounds(x: number, y: number, bounds: FocusBounds): boolean {
  return x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height;
}
