import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { loadEnvEditorState, mergeEnvEditorValues, parseEnvPairs, saveEnvEditorEntries, type EnvEditorEntry, type EnvEditorState } from "../../env/index.js";
import { createSetuprError, errorSummary, fromUnknownError, type SetuprError } from "../../errors/index.js";
import { Panel } from "../components/Panel.js";
import { BoundedTextInput } from "../components/BoundedTextInput.js";
import { MetricText, TuiFooter, TuiHeader } from "../components/TuiFrame.js";
import { useFocusNavigation, type FocusBounds, type FocusItem, type FocusState } from "../hooks/useFocusNavigation.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { colors, icons } from "../theme.js";
import { parseSgrMouse, stripTerminalControlInput } from "../terminalInput.js";

interface EnvLayoutProps {
  cwd: string;
}

interface EnvLayoutGeometry {
  width: number;
  height: number;
  bodyHeight: number;
  summaryHeight: number;
  contentHeight: number;
  stacked: boolean;
  listWidth: number;
  sideWidth: number;
  detailsHeight: number;
  editorHeight: number;
  inputMaxLines: number;
  inputBounds: FocusBounds;
  listBounds: FocusBounds;
  detailsBounds: FocusBounds;
  editorBounds: FocusBounds;
  summaryWidths: number[];
  visibleRows: number;
}

export function EnvLayout({ cwd }: EnvLayoutProps) {
  const { exit } = useApp();
  const terminal = useTerminalSize();
  const layout = useMemo(() => buildEnvLayout(terminal.width, terminal.height), [terminal.width, terminal.height]);
  const focus = useFocusNavigation({ items: useMemo(() => buildEnvFocusItems(layout), [layout]), initialId: "input", onQuit: () => exit() });
  const [state, setState] = useState<EnvEditorState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<SetuprError | null>(null);

  useEffect(() => {
    let alive = true;
    loadEnvEditorState(cwd)
      .then((next) => {
        if (!alive) return;
        setState(next);
        setSelectedIndex(0);
        setDraft(next.entries[0]?.value || "");
      })
      .catch((err) => {
        if (alive) setError(fromUnknownError(err, { command: "env", cwd }));
      });
    return () => {
      alive = false;
    };
  }, [cwd]);

  const entries = state?.entries || [];
  const selected = entries[selectedIndex] || null;
  const listOffset = Math.max(0, Math.min(selectedIndex - Math.floor(layout.visibleRows / 2), Math.max(0, entries.length - layout.visibleRows)));
  const visibleEntries = entries.slice(listOffset, listOffset + layout.visibleRows);

  useEffect(() => {
    if (!selected) {
      setDraft("");
      setDirty(false);
      return;
    }
    setDraft(selected.value);
    setDirty(false);
  }, [selected?.key]);

  useInput((input, key) => {
    const mouse = parseSgrMouse(input);
    if (mouse?.action === "press" && state && pointInBounds(mouse.x, mouse.y, layout.listBounds)) {
      const nextIndex = listOffset + Math.max(0, mouse.y - layout.listBounds.y - 2);
      if (nextIndex >= 0 && nextIndex < entries.length) setSelectedIndex(nextIndex);
      return;
    }
    if (!state) return;
    if (focus.activeId === "vars") {
      if (input === "j") {
        setSelectedIndex((current) => Math.min(entries.length - 1, current + 1));
        return;
      }
      if (input === "k") {
        setSelectedIndex((current) => Math.max(0, current - 1));
        return;
      }
    }
    if (key.ctrl && input === "s") {
      void saveDraft();
    }
  });

  const updateEntries = (nextEntries: EnvEditorEntry[], nextSelectedKey?: string) => {
    setState((current) => current ? summarizeState({ ...current, entries: nextEntries, hasEnv: true, source: ".env" }) : current);
    if (nextSelectedKey) {
      const nextIndex = nextEntries.findIndex((entry) => entry.key === nextSelectedKey);
      if (nextIndex >= 0) setSelectedIndex(nextIndex);
    }
  };

  const saveDraft = async (text = draft) => {
    if (!state || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const cleanText = stripTerminalControlInput(text).trim();
      let nextEntries = entries;
      let changed = 0;
      let selectedKey = selected?.key;

      const pastedPairs = parseEnvPairs(cleanText.includes("=") ? cleanText : "");
      if (Object.keys(pastedPairs).length > 0) {
        nextEntries = mergeEnvEditorValues(entries, pastedPairs);
        changed = Object.keys(pastedPairs).length;
        selectedKey = Object.keys(pastedPairs)[0] || selectedKey;
      } else if (selected) {
        nextEntries = mergeEnvEditorValues(entries, { [selected.key]: cleanText });
        changed = 1;
      } else if (cleanText) {
        setError(createSetuprError({
          code: "ENV_CHECK_FAILED",
          command: "env",
          cwd,
          details: ["Empty env files need KEY=value input first."],
          canContinue: true,
        }));
        return;
      }

      await saveEnvEditorEntries(cwd, nextEntries);
      updateEntries(nextEntries, selectedKey);
      setDirty(false);
      setMessage(`Saved ${changed} environment value${changed === 1 ? "" : "s"} to .env.`);
    } catch (err) {
      setError(fromUnknownError(err, { command: "env", cwd, code: "ENV_WRITE_FAILED" }));
    } finally {
      setSaving(false);
    }
  };

  const footer = dirty ? "unsaved" : saving ? "saving..." : message ? "saved" : state ? `${entries.length} vars` : "loading";

  return (
    <Box key={`${terminal.width}x${terminal.height}`} flexDirection="column" width={terminal.width} height={terminal.height}>
      <TuiHeader command="setupr env" cwd={cwd} status={footer} statusColor={dirty ? colors.warning : error ? colors.error : colors.success} right={footer} width={terminal.width} />

      {!state && !error && (
        <Box flexGrow={1}>
          <Text color={colors.textDim}>Loading .env...</Text>
        </Box>
      )}

      {state && (
        <Box flexDirection="column" height={layout.bodyHeight} width="100%" flexGrow={1} overflow="hidden">
          {!layout.stacked && (
            <Box flexDirection="row" width="100%" height={layout.summaryHeight}>
              <Panel title="Env File" focusState={focus.focusState("envfile")} width={layout.summaryWidths[0]} height="100%">
                <MetricText value={state.hasEnv ? ".env" : "none"} label={`${entries.length} vars loaded`} color={state.hasEnv ? colors.success : colors.warning} />
              </Panel>
              <Panel title="Template" focusState={focus.focusState("template")} width={layout.summaryWidths[1]} height="100%">
                <MetricText value={state.hasExample ? ".env.example" : "missing"} label="source template" color={state.hasExample ? colors.success : colors.warning} />
              </Panel>
              <Panel title="Missing" focusState={focus.focusState("missing")} width={layout.summaryWidths[2]} height="100%">
                <MetricText value={state.missing.length} label="vars" color={state.missing.length ? colors.error : colors.success} />
              </Panel>
              <Panel title="Sensitive" focusState={focus.focusState("sensitive")} width={layout.summaryWidths[3]} height="100%">
                <MetricText value={entries.filter((entry) => entry.sensitive).length} label="masked values" color={colors.warning} />
              </Panel>
            </Box>
          )}
          <Box flexDirection={layout.stacked ? "column" : "row"} height={layout.contentHeight} width="100%" flexGrow={1} overflow="hidden">
            <Panel title="Variables" focusState={focus.focusState("vars")} width={layout.stacked ? "100%" : layout.listWidth} height={layout.stacked ? Math.max(7, Math.floor(layout.contentHeight * 0.42)) : "100%"}>
              <VariableList entries={visibleEntries} offset={listOffset} selectedIndex={selectedIndex} />
            </Panel>

            <Box flexDirection="column" width={layout.stacked ? "100%" : layout.sideWidth} height={layout.stacked ? Math.max(10, Math.ceil(layout.contentHeight * 0.58)) : "100%"}>
              <Panel title="Details" focusState={focus.focusState("details")} width="100%" height={layout.detailsHeight}>
                <DetailsPanel state={state} selected={selected} message={message} error={error} />
              </Panel>
              <Panel title="Editor" focusState={focus.focusState("editor")} width="100%" flexGrow={1} minHeight={layout.editorHeight}>
                <EditorPanel
                  selected={selected}
                  draft={draft}
                  dirty={dirty}
                  focusState={focus.focusState("input")}
                  width={layout.stacked ? layout.width - 4 : layout.sideWidth - 4}
                  maxLines={layout.inputMaxLines}
                  scrollBounds={layout.inputBounds}
                  onChange={(value) => {
                    setDraft(value);
                    setDirty(true);
                  }}
                  onSubmit={(value) => void saveDraft(value)}
                />
              </Panel>
            </Box>
          </Box>
        </Box>
      )}

      {!state && error && (
        <Box flexGrow={1}>
          <Panel title="Env Error" focusState="focused" width="100%" height="100%">
            <Text color={colors.error} wrap="wrap">{errorSummary(error)}</Text>
          </Panel>
        </Box>
      )}

      <TuiFooter width={terminal.width} left="Ctrl+C abort · Tab next panel · ←/↑/↓/→ navigate · Enter save · j/k select · paste KEY=value lines" right={footer} />
    </Box>
  );
}

function VariableList({ entries, offset, selectedIndex }: { entries: EnvEditorEntry[]; offset: number; selectedIndex: number }) {
  if (entries.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color={colors.warning}>No variables yet.</Text>
        <Text color={colors.textDim} wrap="wrap">Paste KEY=value lines into the editor and press Enter.</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      {entries.map((entry, visibleIndex) => {
        const index = offset + visibleIndex;
        const selected = index === selectedIndex;
        return (
          <Text key={`${entry.key}-${index}`} color={selected ? colors.textBright : statusColor(entry.status)} bold={selected} wrap="truncate">
            {selected ? icons.arrowRight : statusIcon(entry.status)} {entry.key}
            <Text color={colors.textDim}> {entry.sensitive && entry.value ? maskValue(entry.value) : entry.value || "(empty)"}</Text>
          </Text>
        );
      })}
    </Box>
  );
}

function DetailsPanel({ state, selected, message, error }: { state: EnvEditorState; selected: EnvEditorEntry | null; message: string | null; error: SetuprError | null }) {
  return (
    <Box flexDirection="column">
      <Text color={state.hasEnv ? colors.success : colors.warning}>{state.hasEnv ? "✓ .env present" : "△ .env not loaded"}</Text>
      <Text color={state.hasExample ? colors.success : colors.warning}>{state.hasExample ? "✓ .env.example present" : "△ no .env.example"}</Text>
      <Text color={state.missing.length ? colors.warning : colors.textDim} wrap="truncate">Missing/empty: {state.missing.length ? state.missing.join(", ") : "none"}</Text>
      <Text color={state.extra.length ? colors.info : colors.textDim} wrap="truncate">Extra: {state.extra.length ? state.extra.join(", ") : "none"}</Text>
      {selected && <Text> </Text>}
      {selected && <Text color={colors.heading} bold wrap="truncate">{selected.key}</Text>}
      {selected && <Text color={statusColor(selected.status)}>Status: {selected.status}</Text>}
      {selected?.templateValue && <Text color={colors.textDim} wrap="truncate">Template: {selected.sensitive ? maskValue(selected.templateValue) : selected.templateValue}</Text>}
      {selected?.sensitive && <Text color={colors.warning}>Sensitive value: input is masked.</Text>}
      {message && <Text color={colors.success} wrap="truncate">{message}</Text>}
      {error && <Text color={colors.error} wrap="truncate">{error.code}: {error.title}</Text>}
    </Box>
  );
}

function EditorPanel({
  selected,
  draft,
  dirty,
  focusState,
  width,
  maxLines,
  scrollBounds,
  onChange,
  onSubmit,
}: {
  selected: EnvEditorEntry | null;
  draft: string;
  dirty: boolean;
  focusState?: FocusState;
  width: number;
  maxLines: number;
  scrollBounds: FocusBounds;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}) {
  const inputWidth = Math.max(8, width - 6);
  return (
    <Box flexDirection="column" width="100%" height="100%" justifyContent="flex-end">
      <Box flexGrow={1} flexDirection="column">
        <Text color={colors.textBright} bold wrap="truncate">{selected ? selected.key : "New variable"}</Text>
        <Text color={colors.textDim} wrap="wrap">
          {selected
            ? "Edit the value below. Paste KEY=value lines to update several variables at once."
            : "Paste KEY=value lines below to create variables."}
        </Text>
        {dirty && <Text color={colors.warning}>Unsaved changes. Press Enter to save.</Text>}
      </Box>
      <Box borderStyle="round" borderColor={focusState === "focused" ? colors.borderActive : colors.border} paddingX={1} width={Math.max(12, width - 2)} flexShrink={0}>
        <Text color={colors.primary}>{icons.arrowRight} </Text>
        <BoundedTextInput
          value={draft}
          onChange={onChange}
          onSubmit={onSubmit}
          focus={focusState === "focused"}
          placeholder={selected ? selected.value || "value" : "KEY=value"}
          mask={selected?.sensitive ? "•" : undefined}
          width={inputWidth}
          maxLines={maxLines}
          scrollBounds={scrollBounds}
        />
      </Box>
    </Box>
  );
}

export function buildEnvLayout(width: number, height: number): EnvLayoutGeometry {
  const bodyHeight = Math.max(8, height - 2);
  const stacked = width < 96 || bodyHeight < 20;
  const summaryHeight = stacked ? 0 : clamp(Math.floor(bodyHeight * 0.18), 5, 6);
  const contentHeight = Math.max(8, bodyHeight - summaryHeight);
  const baseInputMaxLines = Math.max(1, Math.min(6, Math.floor(bodyHeight / 4)));
  if (stacked) {
    const editorHeight = clamp(baseInputMaxLines + 5, 6, Math.max(6, Math.floor(bodyHeight * 0.42)));
    const inputMaxLines = Math.max(1, Math.min(baseInputMaxLines, editorHeight - 4));
    const detailsHeight = clamp(Math.floor(bodyHeight * 0.28), 6, Math.max(6, bodyHeight - editorHeight - 5));
    const listHeight = Math.max(5, bodyHeight - detailsHeight - editorHeight);
    const inputY = Math.max(4, height - inputMaxLines - 2);
    return {
      width,
      height,
      bodyHeight,
      summaryHeight,
      contentHeight: bodyHeight,
      stacked,
      listWidth: width,
      sideWidth: width,
      detailsHeight,
      editorHeight,
      inputMaxLines,
      inputBounds: { x: 4, y: inputY, width: Math.max(8, width - 10), height: inputMaxLines + 2 },
      listBounds: { x: 1, y: 2, width, height: listHeight },
      detailsBounds: { x: 1, y: 2 + listHeight, width, height: detailsHeight },
      editorBounds: { x: 1, y: 2 + listHeight + detailsHeight, width, height: editorHeight },
      summaryWidths: [],
      visibleRows: Math.max(1, listHeight - 3),
    };
  }
  const inputMaxLines = baseInputMaxLines;
  const editorHeight = Math.max(7, inputMaxLines + 5);
  const listWidth = Math.max(32, Math.floor(width * 0.38));
  const sideWidth = width - listWidth;
  const detailsHeight = Math.max(8, contentHeight - editorHeight);
  const inputY = Math.max(4, 2 + summaryHeight + detailsHeight + editorHeight - inputMaxLines - 2);
  return {
    width,
    height,
    bodyHeight,
    summaryHeight,
    contentHeight,
    stacked,
    listWidth,
    sideWidth,
    detailsHeight,
    editorHeight,
    inputMaxLines,
    inputBounds: { x: listWidth + 4, y: inputY, width: Math.max(8, sideWidth - 10), height: inputMaxLines + 2 },
    listBounds: { x: 1, y: 2 + summaryHeight, width: listWidth, height: contentHeight },
    detailsBounds: { x: listWidth + 1, y: 2 + summaryHeight, width: sideWidth, height: detailsHeight },
    editorBounds: { x: listWidth + 1, y: 2 + summaryHeight + detailsHeight, width: sideWidth, height: editorHeight },
    summaryWidths: distributeWidths(width, [1, 1, 1, 1], [20, 20, 18, 18]),
    visibleRows: Math.max(1, contentHeight - 3),
  };
}

export function buildEnvFocusItems(layout: EnvLayoutGeometry): FocusItem[] {
  if (layout.stacked) {
    return [
      { id: "vars", row: 0, column: 0, bounds: layout.listBounds },
      { id: "details", row: 1, column: 0, bounds: layout.detailsBounds },
      { id: "editor", row: 2, column: 0, redirectTo: "input", bounds: layout.editorBounds },
      { id: "input", row: 3, column: 0, parentIds: ["editor"], bounds: layout.inputBounds },
    ];
  }
  return [
    { id: "envfile", row: 0, column: 0, bounds: { x: 1, y: 2, width: layout.summaryWidths[0], height: layout.summaryHeight } },
    { id: "template", row: 0, column: 1, bounds: { x: layout.summaryWidths[0] + 1, y: 2, width: layout.summaryWidths[1], height: layout.summaryHeight } },
    { id: "missing", row: 0, column: 2, bounds: { x: layout.summaryWidths[0] + layout.summaryWidths[1] + 1, y: 2, width: layout.summaryWidths[2], height: layout.summaryHeight } },
    { id: "sensitive", row: 0, column: 3, bounds: { x: layout.summaryWidths[0] + layout.summaryWidths[1] + layout.summaryWidths[2] + 1, y: 2, width: layout.summaryWidths[3], height: layout.summaryHeight } },
    { id: "vars", row: 1, column: 0, bounds: layout.listBounds },
    { id: "details", row: 1, column: 1, bounds: layout.detailsBounds },
    { id: "editor", row: 2, column: 1, redirectTo: "input", bounds: layout.editorBounds },
    { id: "input", row: 3, column: 1, parentIds: ["editor"], bounds: layout.inputBounds },
  ];
}

function summarizeState(state: EnvEditorState): EnvEditorState {
  return {
    ...state,
    missing: state.entries.filter((entry) => entry.status === "missing" || entry.status === "empty").map((entry) => entry.key),
    extra: state.entries.filter((entry) => entry.status === "extra").map((entry) => entry.key),
  };
}

function statusColor(status: EnvEditorEntry["status"]): string {
  if (status === "filled") return colors.success;
  if (status === "extra") return colors.info;
  return colors.warning;
}

function statusIcon(status: EnvEditorEntry["status"]): string {
  if (status === "filled") return icons.check;
  if (status === "extra") return icons.info;
  return icons.warning;
}

function maskValue(value: string): string {
  if (!value) return "(empty)";
  if (value.length <= 4) return "••••";
  return `${"•".repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
}

function pointInBounds(x: number, y: number, bounds: FocusBounds): boolean {
  return x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distributeWidths(total: number, weights: number[], mins: number[]): number[] {
  const minTotal = mins.reduce((sum, item) => sum + item, 0);
  if (total <= minTotal) return fitWidths(total, mins.length);
  const extra = total - minTotal;
  const weightTotal = weights.reduce((sum, item) => sum + item, 0);
  const widths = mins.map((min, index) => min + Math.floor(extra * (weights[index] / weightTotal)));
  widths[widths.length - 1] += total - widths.reduce((sum, item) => sum + item, 0);
  return widths;
}

function fitWidths(total: number, count: number): number[] {
  const base = Math.max(1, Math.floor(total / count));
  const widths = Array.from({ length: count }, () => base);
  widths[widths.length - 1] += total - widths.reduce((sum, item) => sum + item, 0);
  return widths;
}
