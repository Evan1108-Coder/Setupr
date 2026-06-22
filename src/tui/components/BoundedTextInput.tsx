import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { colors } from "../theme.js";
import { createTerminalControlInputStripper, parseSgrMouse } from "../terminalInput.js";
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
  const controlStripper = useMemo(() => createTerminalControlInputStripper(), []);
  const wrapWidth = Math.max(1, width || 80);

  // The controlled `value` prop only updates after a React render. A burst of
  // keystrokes that arrives before the next render would otherwise all read the
  // same stale `value`/`cursor` from this closure, dropping or scrambling
  // characters. We keep ref copies that are mutated synchronously on every edit
  // so consecutive keystrokes compose against the live text, not a stale snapshot.
  const valueRef = useRef(value);
  const cursorRef = useRef(cursor);
  // Values we have emitted via onChange but not yet seen reflected back through
  // the `value` prop. Used to tell our own (possibly batched/stale) prop echoes
  // apart from a genuine parent-driven change such as a reset after submit.
  const pendingEmitsRef = useRef<Set<string>>(new Set());

  // Reconcile the controlled prop with our live ref state. A prop value we
  // recently emitted is just an echo of our own edit (React may coalesce a burst
  // into a single render, skipping intermediates), so we keep the live refs. Any
  // other value is a genuine external change (e.g. the parent clearing the field
  // after submit) and is adopted.
  useEffect(() => {
    // Already in sync with our live edit state — nothing to adopt.
    if (value === valueRef.current) {
      pendingEmitsRef.current.delete(value);
      return;
    }
    // A lagging echo of a value we emitted (React may render intermediate burst
    // states). Drop just that entry; never rewind the live refs backward.
    if (pendingEmitsRef.current.has(value)) {
      pendingEmitsRef.current.delete(value);
      return;
    }
    // Genuine external change (e.g. parent reset after submit).
    pendingEmitsRef.current.clear();
    valueRef.current = value;
    cursorRef.current = Math.min(cursorRef.current, value.length);
    setCursor(cursorRef.current);
  }, [value]);

  const displayValue = mask ? mask.repeat(value.length) : value;
  const renderedValue = focus
    ? `${displayValue.slice(0, cursor)}▌${displayValue.slice(cursor)}`
    : displayValue;
  const lines = useMemo(() => wrapLines(renderedValue || placeholder, wrapWidth), [renderedValue, placeholder, wrapWidth]);
  const visibleHeight = Math.min(maxLines, Math.max(1, lines.length));
  const maxScroll = Math.max(0, lines.length - visibleHeight);

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

  // Apply a text edit synchronously against the live ref state, then notify the
  // parent and schedule the visible caret update.
  const commit = (nextValue: string, nextCursor: number) => {
    valueRef.current = nextValue;
    cursorRef.current = clamp(nextCursor, 0, nextValue.length);
    pendingEmitsRef.current.add(nextValue);
    setCursor(cursorRef.current);
    onChange(nextValue);
  };

  const moveCursor = (nextCursor: number) => {
    cursorRef.current = clamp(nextCursor, 0, valueRef.current.length);
    setCursor(cursorRef.current);
  };

  useInput((input, key) => {
    const mouse = parseSgrMouse(input);
    if (mouse?.action === "press") {
      if (scrollBounds && pointInBounds(mouse.x, mouse.y, scrollBounds)) {
        const line = clamp(mouse.y - scrollBounds.y + scrollLine, 0, Math.max(0, lines.length - 1));
        const column = clamp(mouse.x - scrollBounds.x, 0, wrapWidth);
        moveCursor(cursorForWrappedPosition(valueRef.current, line, column, wrapWidth));
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

    const liveValue = valueRef.current;
    const liveCursor = clamp(cursorRef.current, 0, liveValue.length);

    const shortcut = shortcutFromInput(input, key);
    if (shortcut) {
      applyShortcut(shortcut, liveValue, liveCursor, commit, moveCursor);
      return;
    }

    const cleanInput = controlStripper.strip(input).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const returnOnly = key.return || input === "\r" || input === "\n" || cleanInput === "\n";
    if (!cleanInput && !returnOnly && !key.backspace && !key.delete && !key.leftArrow && !key.rightArrow && !key.upArrow && !key.downArrow) {
      return;
    }

    if (returnOnly) {
      onSubmit(liveValue, { steer: Boolean(key.ctrl) });
      return;
    }

    // macOS Backspace sends \x7f, which Ink reports as `key.delete` with an empty
    // `input`; Fn+Delete (\x1b[3~) is reported identically. Both are treated as a
    // backward delete because that is what the dominant Backspace key should do.
    // Forward delete remains available via Ctrl+D (handled as a shortcut above).
    if (key.backspace || key.delete || input === "\x7f") {
      if (liveCursor === 0) return;
      commit(liveValue.slice(0, liveCursor - 1) + liveValue.slice(liveCursor), liveCursor - 1);
      return;
    }

    if (key.leftArrow) {
      moveCursor(liveCursor - 1);
      return;
    }

    if (key.rightArrow) {
      moveCursor(liveCursor + 1);
      return;
    }

    if (key.upArrow) {
      setScrollLine((current) => clamp(current - 1, 0, maxScroll));
      return;
    }

    if (key.downArrow) {
      setScrollLine((current) => clamp(current + 1, 0, maxScroll));
      return;
    }

    if (key.tab || key.escape || (key.ctrl && input === "c")) {
      return;
    }

    if (cleanInput) {
      commit(liveValue.slice(0, liveCursor) + cleanInput + liveValue.slice(liveCursor), liveCursor + cleanInput.length);
    }
  }, { isActive: focus });

  const visibleLines = lines.slice(scrollLine, scrollLine + visibleHeight);
  const placeholderColor = value.length === 0 ? colors.textDim : colors.text;

  return (
    <Box flexDirection="column" height={visibleHeight} overflowY="hidden" width={wrapWidth} minWidth={0} flexShrink={1}>
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
  // Note: a bare delete key (\x7f / \x1b[3~) is intentionally NOT a forward delete;
  // it is handled as a backward Backspace in the main handler. Only Ctrl+D
  // (matched above) performs a forward delete.
  return null;
}

function applyShortcut(
  shortcut: InputShortcut,
  value: string,
  cursor: number,
  commit: (value: string, cursor: number) => void,
  moveCursor: (cursor: number) => void
): void {
  if (shortcut === "start") {
    moveCursor(0);
    return;
  }
  if (shortcut === "end") {
    moveCursor(value.length);
    return;
  }
  if (shortcut === "clear-before") {
    commit(value.slice(cursor), 0);
    return;
  }
  if (shortcut === "clear-after") {
    commit(value.slice(0, cursor), cursor);
    return;
  }
  if (shortcut === "delete-forward") {
    if (cursor < value.length) commit(value.slice(0, cursor) + value.slice(cursor + 1), cursor);
    return;
  }
  if (shortcut === "word-left") {
    moveCursor(previousWordIndex(value, cursor));
    return;
  }
  if (shortcut === "word-right") {
    moveCursor(nextWordIndex(value, cursor));
    return;
  }
  if (shortcut === "delete-word-before") {
    const nextCursor = previousWordIndex(value, cursor);
    commit(value.slice(0, nextCursor) + value.slice(cursor), nextCursor);
    return;
  }
  if (shortcut === "delete-word-after") {
    const nextCursor = nextWordIndex(value, cursor);
    commit(value.slice(0, cursor) + value.slice(nextCursor), cursor);
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
