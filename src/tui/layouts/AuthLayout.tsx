import React, { useMemo } from "react";
import { Box, Text, useApp } from "ink";
import { getDefaultModel, getProviderEnvValue, getProviderKeySource, MODELS, PROVIDERS, type AIProvider } from "../../ai/models.js";
import { AUTH_PROVIDERS, maskApiKey } from "../../auth/secrets.js";
import { Panel } from "../components/Panel.js";
import { StatusBar } from "../components/StatusBar.js";
import { useFocusNavigation, type FocusItem } from "../hooks/useFocusNavigation.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { colors } from "../theme.js";

const LABELS: Record<AIProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  groq: "Groq",
  minimax: "MiniMax",
  moonshot: "Moonshot",
  github: "GitHub Models",
};

export function AuthLayout() {
  const { exit } = useApp();
  const terminal = useTerminalSize();
  const layout = buildAuthLayout(terminal.width, terminal.height);
  const activeModel = getDefaultModel();
  const rows = AUTH_PROVIDERS.map((provider) => {
    const key = getProviderEnvValue(provider);
    return {
      provider,
      label: LABELS[provider],
      key,
      source: getProviderKeySource(provider),
      configured: Boolean(key),
    };
  });
  const availableModels = MODELS.filter((model) => getProviderEnvValue(model.provider));
  const focusItems = useMemo(
    () => buildFocusItems(layout),
    [layout]
  );
  const focus = useFocusNavigation({ items: focusItems, onQuit: () => exit() });

  if (layout.mode === "compact") {
    return (
      <Box key={`${terminal.width}x${terminal.height}`} flexDirection="column" width={terminal.width} height={terminal.height}>
        <Box height={1} justifyContent="space-between">
          <Text color={colors.primary} bold> P-Setup Auth</Text>
          <Text color={colors.textDim} wrap="truncate">masked keys only</Text>
        </Box>

        <Panel title="Auth Overview" focusState={focus.focusState("overview")} width="100%" height={layout.contentHeight}>
          <Box flexDirection="column" width="100%" minWidth={0}>
            <Text color={colors.heading} bold>PROVIDERS</Text>
            {rows.slice(0, layout.providerLimit).map((row) => (
              <ProviderRow key={row.provider} row={row} compact />
            ))}
            {rows.length > layout.providerLimit && (
              <Text color={colors.textDim} wrap="truncate">… {rows.length - layout.providerLimit} more providers</Text>
            )}
            {layout.contentHeight >= 13 && <Text> </Text>}
            {layout.contentHeight >= 10 && <Text color={colors.heading} bold>MODEL</Text>}
            {layout.contentHeight >= 10 && <Text color={colors.textBright} wrap="truncate">{activeModel.id}</Text>}
            {layout.contentHeight >= 15 && <Text color={colors.heading} bold>ACTIONS</Text>}
            {layout.contentHeight >= 15 && <Text color={colors.textDim} wrap="truncate">setup auth set-key github · setup auth test · setup auth use &lt;model&gt;</Text>}
          </Box>
        </Panel>

        <StatusBar stepProgress={`${rows.filter((row) => row.configured).length} providers configured`} />
      </Box>
    );
  }

  return (
    <Box key={`${terminal.width}x${terminal.height}`} flexDirection="column" width={terminal.width} height={terminal.height}>
      <Box height={1} justifyContent="space-between">
        <Text color={colors.primary} bold> P-Setup Auth</Text>
        <Text color={colors.textDim}>global auth · masked keys only</Text>
      </Box>

      <Box flexDirection={layout.stacked ? "column" : "row"} width="100%" height={layout.contentHeight} flexShrink={1} overflow="hidden">
        <Panel title="Providers" focusState={focus.focusState("providers")} width={layout.stacked ? "100%" : layout.providers.width} height={layout.providers.height}>
          <Box flexDirection="column">
            {rows.slice(0, layout.providerLimit).map((row) => (
              <ProviderRow key={row.provider} row={row} compact={layout.stacked} />
            ))}
            {rows.length > layout.providerLimit && (
              <Text color={colors.textDim}>… {rows.length - layout.providerLimit} more</Text>
            )}
          </Box>
        </Panel>

        <Panel title="Model" focusState={focus.focusState("model")} width={layout.stacked ? "100%" : layout.model.width} height={layout.model.height}>
          <Box flexDirection="column">
            <Text color={colors.heading} bold>ACTIVE</Text>
            <Text color={colors.textBright} wrap="truncate">{activeModel.id}</Text>
            {layout.model.height >= 7 && <Text color={colors.textDim} wrap="truncate">{LABELS[activeModel.provider]} · {activeModel.name}</Text>}
            {layout.model.height >= 8 && <Text> </Text>}
            {layout.model.height >= 6 && <Text color={colors.heading} bold>AVAILABLE</Text>}
            {availableModels.length > 0 ? availableModels.slice(0, layout.modelLimit).map((model) => (
              <Text key={model.id} color={model.id === activeModel.id ? colors.accent : colors.text} wrap="truncate">
                {model.id === activeModel.id ? "★" : "•"} {model.id}
              </Text>
            )) : <Text color={colors.warning}>No provider keys configured</Text>}
          </Box>
        </Panel>

        <Panel title="Actions" focusState={focus.focusState("actions")} width={layout.stacked ? "100%" : layout.actions.width} height={layout.actions.height}>
          <Box flexDirection="column">
            <Text color={colors.heading} bold>COMMANDS</Text>
            <Text color={colors.text} wrap="truncate">setup auth set-key github</Text>
            <Text color={colors.text} wrap="truncate">setup auth test</Text>
            <Text color={colors.text} wrap="truncate">setup auth use &lt;model&gt;</Text>
            {layout.actions.height >= 8 && <Text color={colors.text} wrap="truncate">setup auth migrate</Text>}
            {layout.actions.height >= 10 && <Text> </Text>}
            {layout.actions.height >= 7 && <Text color={colors.heading} bold>STORAGE</Text>}
            {layout.actions.height >= 7 && <Text color={colors.textDim} wrap="truncate">~/.p-setup/secrets.json</Text>}
            {layout.actions.height >= 9 && <Text color={colors.textDim} wrap="truncate">mode 0600 · project .env stays app-only</Text>}
          </Box>
        </Panel>
      </Box>

      <StatusBar stepProgress={`${rows.filter((row) => row.configured).length} providers configured`} />
    </Box>
  );
}

function ProviderRow({ row, compact = false }: { row: { provider: AIProvider; label: string; key?: string; source: string | null; configured: boolean }; compact?: boolean }) {
  const config = PROVIDERS[row.provider];
  const source = row.source ? ` ${row.source}` : "";
  if (compact) {
    return (
      <Text color={row.configured ? colors.success : colors.textDim} wrap="truncate">
        {row.configured ? "✓" : "○"} {row.label} · {row.key ? maskApiKey(row.key) : "missing"}{source}
      </Text>
    );
  }

  return (
    <Box justifyContent="space-between" width="100%" minWidth={0}>
      <Box flexShrink={1} minWidth={0} marginRight={1}>
        <Text color={row.configured ? colors.success : colors.textDim} wrap="truncate">
          {row.configured ? "✓" : "○"} {row.label}
        </Text>
        <Text color={colors.textDim} wrap="truncate"> {config.envKey.replace("_API_KEY", "")}</Text>
      </Box>
      <Box flexShrink={0}>
        <Text color={row.configured ? colors.value : colors.textDim}>
          {row.key ? maskApiKey(row.key) : "missing"}
        </Text>
        <Text color={colors.textDim}> {row.source || ""}</Text>
      </Box>
    </Box>
  );
}

interface AuthLayoutGeometry {
  width: number;
  height: number;
  contentHeight: number;
  mode: "compact" | "stacked" | "columns";
  stacked: boolean;
  providerLimit: number;
  modelLimit: number;
  providers: { x: number; y: number; width: number; height: number };
  model: { x: number; y: number; width: number; height: number };
  actions: { x: number; y: number; width: number; height: number };
}

function buildAuthLayout(width: number, height: number): AuthLayoutGeometry {
  const contentHeight = Math.max(8, height - 2);
  const compact = width < 96 || contentHeight < 18;
  if (compact) {
    return {
      width,
      height,
      contentHeight,
      mode: "compact",
      stacked: true,
      providerLimit: Math.max(1, Math.min(AUTH_PROVIDERS.length, contentHeight - 6)),
      modelLimit: 1,
      providers: { x: 1, y: 2, width, height: contentHeight },
      model: { x: 1, y: 2, width, height: contentHeight },
      actions: { x: 1, y: 2, width, height: contentHeight },
    };
  }

  const stacked = width < 118 || contentHeight < 22;
  if (stacked) {
    const providerHeight = clamp(Math.floor(contentHeight * 0.42), 6, Math.max(6, contentHeight - 8));
    const modelHeight = clamp(Math.floor(contentHeight * 0.30), 5, Math.max(5, contentHeight - providerHeight - 4));
    const actionsHeight = Math.max(4, contentHeight - providerHeight - modelHeight);
    return {
      width,
      height,
      contentHeight,
      mode: "stacked",
      stacked: true,
      providerLimit: Math.max(1, providerHeight - 3),
      modelLimit: Math.max(1, modelHeight - 6),
      providers: { x: 1, y: 2, width, height: providerHeight },
      model: { x: 1, y: providerHeight + 2, width, height: modelHeight },
      actions: { x: 1, y: providerHeight + modelHeight + 2, width, height: actionsHeight },
    };
  }

  const [providersWidth, modelWidth, actionsWidth] = distributeWidths(width, [0.45, 0.32, 0.23], [34, 30, 24]);
  return {
    width,
    height,
    contentHeight,
    mode: "columns",
    stacked: false,
    providerLimit: Math.max(1, contentHeight - 3),
    modelLimit: Math.max(1, contentHeight - 7),
    providers: { x: 1, y: 2, width: providersWidth, height: contentHeight },
    model: { x: providersWidth + 1, y: 2, width: modelWidth, height: contentHeight },
    actions: { x: providersWidth + modelWidth + 1, y: 2, width: actionsWidth, height: contentHeight },
  };
}

function buildFocusItems(layout: AuthLayoutGeometry): FocusItem[] {
  if (layout.mode === "compact") {
    return [
      { id: "overview", row: 0, column: 0, bounds: layout.providers },
    ];
  }
  if (layout.stacked) {
    return [
      { id: "providers", row: 0, column: 0, bounds: layout.providers },
      { id: "model", row: 1, column: 0, bounds: layout.model },
      { id: "actions", row: 2, column: 0, bounds: layout.actions },
    ];
  }
  return [
    { id: "providers", row: 0, column: 0, bounds: layout.providers },
    { id: "model", row: 0, column: 1, bounds: layout.model },
    { id: "actions", row: 0, column: 2, bounds: layout.actions },
  ];
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
