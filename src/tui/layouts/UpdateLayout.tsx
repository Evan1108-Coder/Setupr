import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, useApp } from "ink";
import { Panel } from "../components/Panel.js";
import { ChatInput } from "../components/ChatInput.js";
import { StatusBar } from "../components/StatusBar.js";
import { Spinner } from "../components/Spinner.js";
import { useFocusNavigation, type FocusItem } from "../hooks/useFocusNavigation.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { colors, icons } from "../theme.js";
import { hasProjectSignals } from "../projectSignals.js";
import { runCommand } from "../../executor/index.js";
import { intelligentResponse } from "../../ai/intelligence.js";
import { scanResultToDSL } from "../../ai/dsl.js";
import { classifyCommandFailure, createSetuprError, fromUnknownError, type SetuprError } from "../../errors/index.js";
import type { ScanResult } from "../../scanner/index.js";

interface OutdatedPkg {
  name: string;
  current: string;
  latest: string;
  type: "major" | "minor" | "patch";
}

interface UpdateResult {
  packages: OutdatedPkg[];
  notice?: string;
  error?: SetuprError;
}

interface UpdateLayoutProps {
  scan: ScanResult;
  cwd: string;
}

export function UpdateLayout({ scan, cwd }: UpdateLayoutProps) {
  const { exit } = useApp();
  const terminal = useTerminalSize();
  const stacked = terminal.width < 96;
  const mainWidth = stacked ? terminal.width : Math.max(46, Math.floor(terminal.width * 0.62));
  const sideWidth = stacked ? terminal.width : terminal.width - mainWidth;
  const mainPanelHeight = stacked ? Math.max(8, terminal.height - 11) : terminal.height - 2;
  const inputLines = inputLinesForPanel(mainPanelHeight);
  const packageLimit = Math.max(1, mainPanelHeight - inputLines - 7);
  const focusItems = useMemo(
    () => buildFocusItems(terminal.width, terminal.height, mainWidth, sideWidth, stacked),
    [terminal.width, terminal.height, mainWidth, sideWidth, stacked]
  );
  const focus = useFocusNavigation({ items: focusItems, onQuit: () => exit() });
  const [packages, setPackages] = useState<OutdatedPkg[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<SetuprError | null>(null);
  const [chatMessages, setChatMessages] = useState<string[]>([]);
  const noProject = !hasProjectSignals(scan);

  useEffect(() => {
    checkOutdated(scan, cwd, noProject).then((result) => {
      setPackages(result.packages);
      setNotice(result.notice || null);
      setError(result.error || null);
      setLoading(false);
    });
  }, []);

  const handleChat = useCallback(async (text: string) => {
    setChatMessages((prev) => [...prev, `You → ${text}`]);
    const dsl = scanResultToDSL(scan);
    const outdatedContext = packages.map((p) => `${p.name}: ${p.current}→${p.latest} (${p.type})`).join(", ");
    const result = await intelligentResponse(
      `${text}\n\nOutdated packages: ${outdatedContext || "none"}`,
      scan,
      `[UPDATE] ${dsl}`
    );
    setChatMessages((prev) => [...prev, `AI → ${result.response}`]);
  }, [scan, packages]);

  const majorCount = packages.filter((p) => p.type === "major").length;
  const minorCount = packages.filter((p) => p.type === "minor").length;
  const patchCount = packages.filter((p) => p.type === "patch").length;

  return (
    <Box flexDirection="column" width={terminal.width} height={terminal.height}>
      <Box height={1} justifyContent="space-between">
        <Text color={colors.primary} bold> Setupr Update</Text>
        <Text color={noProject ? colors.warning : colors.textDim}>
          {noProject ? "no project" : loading ? "scanning..." : `${packages.length} outdated`}
        </Text>
      </Box>

      <Box flexDirection={stacked ? "column" : "row"} width="100%" flexGrow={1} minHeight={8}>
        <Panel title="Outdated Dependencies" focusState={focus.focusState("packages")} width={stacked ? "100%" : mainWidth} height={stacked ? undefined : "100%"} flexGrow={stacked ? 1 : undefined}>
          <Box flexDirection="column" flexGrow={1}>
            <Box flexDirection="column" flexGrow={1}>
              {loading && <Spinner label="Checking for updates..." />}
              {!loading && noProject && (
                <Text color={colors.warning}>{icons.warning} {error?.title || "No project files detected in this directory."}</Text>
              )}
              {!loading && error && (
                <Box flexDirection="column">
                  <Text color={error.severity === "info" ? colors.info : colors.warning}>{icons.warning} {error.code}</Text>
                  <Text color={colors.text}>{error.explanation}</Text>
                  {error.details?.slice(0, 3).map((detail, i) => (
                    <Text key={i} color={colors.textDim} wrap="truncate">  {detail}</Text>
                  ))}
                </Box>
              )}
              {!loading && notice && (
                <Text color={colors.warning}>{icons.warning} {notice}</Text>
              )}
              {!loading && !noProject && !notice && !error && packages.length === 0 && (
                <Text color={colors.success}>{icons.check} All dependencies up to date!</Text>
              )}
              {packages.slice(0, packageLimit).map((pkg) => (
                <Box key={pkg.name} minWidth={0}>
                  <Text color={getTypeColor(pkg.type)} wrap="truncate">
                    {pkg.type === "major" ? icons.warning : icons.dot} {pkg.name}
                  </Text>
                  <Text color={colors.textDim}> {pkg.current} → </Text>
                  <Text color={getTypeColor(pkg.type)}>{pkg.latest}</Text>
                </Box>
              ))}
              {packages.length > packageLimit && (
                <Text color={colors.textDim}>  ... and {packages.length - packageLimit} more</Text>
              )}
            </Box>
            <ChatInput
              active={focus.isActive("input")}
              focusState={focus.focusState("input")}
              onSubmit={handleChat}
              placeholder="Ask about updates..."
              width={mainWidth}
              maxLines={inputLines}
              scrollBounds={focus.activeItem?.id === "input" ? focus.activeItem.bounds : undefined}
            />
          </Box>
        </Panel>

        <Panel title="Summary" focusState={focus.focusState("summary")} width={stacked ? "100%" : sideWidth} height={stacked ? 10 : "100%"}>
          <Box flexDirection="column">
            <Text color={colors.error}>{icons.dot} Major: <Text bold>{majorCount}</Text>{majorCount > 0 ? " BREAKING" : ""}</Text>
            <Text color={colors.warning}>{icons.dot} Minor: <Text bold>{minorCount}</Text></Text>
            <Text color={colors.success}>{icons.dot} Patch: <Text bold>{patchCount}</Text></Text>
            <Text color={colors.textDim}> </Text>
            <Text color={colors.text}>{icons.dot} PM: {scan.packageManager || "none"}</Text>
            <Text color={colors.text}>{icons.dot} Total deps: {scan.dependencies.prod + scan.dependencies.dev}</Text>
            {chatMessages.length > 0 && (
              <>
                <Text> </Text>
                <Text color={colors.heading} bold>AI CHAT</Text>
                {chatMessages.slice(-4).map((msg, i) => (
                  <Text key={i} color={msg.startsWith("AI") ? colors.primary : colors.accent} wrap="truncate">{msg}</Text>
                ))}
              </>
            )}
          </Box>
        </Panel>
      </Box>

      <StatusBar
        stepProgress={noProject ? "no project" : loading ? "checking..." : `${packages.length} outdated`}
        aiStatus={majorCount > 0 ? `${majorCount} breaking changes` : undefined}
      />
    </Box>
  );
}

function inputLinesForPanel(panelHeight: number): number {
  return Math.max(1, Math.floor(panelHeight / 4));
}

function buildFocusItems(width: number, height: number, mainWidth: number, sideWidth: number, stacked: boolean): FocusItem[] {
  if (stacked) {
    const mainPanelHeight = Math.max(8, height - 11);
    const inputHeight = inputBoundsHeightForPanel(mainPanelHeight);
    return [
      { id: "packages", row: 0, column: 0, redirectTo: "input", bounds: { x: 1, y: 2, width, height: mainPanelHeight } },
      { id: "input", row: 1, column: 0, parentIds: ["packages"], bounds: { x: 3, y: Math.max(4, 2 + mainPanelHeight - inputHeight - 1), width: width - 4, height: inputHeight } },
      { id: "summary", row: 2, column: 0, bounds: { x: 1, y: Math.max(3, height - 9), width, height: 8 } },
    ];
  }
  const mainPanelHeight = height - 2;
  const inputHeight = inputBoundsHeightForPanel(mainPanelHeight);
  return [
    { id: "packages", row: 0, column: 0, redirectTo: "input", bounds: { x: 1, y: 2, width: mainWidth, height: mainPanelHeight } },
    { id: "input", row: 1, column: 0, parentIds: ["packages"], bounds: { x: 3, y: Math.max(4, height - inputHeight - 1), width: mainWidth - 4, height: inputHeight } },
    { id: "summary", row: 0, column: 1, bounds: { x: mainWidth + 1, y: 2, width: sideWidth, height: height - 2 } },
  ];
}

function inputBoundsHeightForPanel(panelHeight: number): number {
  return inputLinesForPanel(panelHeight) + 2;
}

async function checkOutdated(scan: ScanResult, cwd: string, noProject: boolean): Promise<UpdateResult> {
  if (noProject) {
    return {
      packages: [],
      error: createSetuprError({ code: "NO_PROJECT_DETECTED", command: "update", cwd, canContinue: false }),
    };
  }
  if (!scan.packageManager) {
    return {
      packages: [],
      error: createSetuprError({ code: "MISSING_PACKAGE_MANAGER", command: "update", cwd, details: ["No npm, yarn, pnpm, bun, pip, cargo, or go package manager was detected."] }),
    };
  }
  const pm = scan.packageManager;
  const abortController = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, 12_000);

  try {
    const result = await runCommand(`${pm} outdated --json 2>/dev/null`, cwd, undefined, abortController.signal);
    if (timedOut) {
      return {
        packages: [],
        error: createSetuprError({ code: "COMMAND_TIMEOUT", command: "update", cwd, details: [`Command: ${pm} outdated --json`] }),
      };
    }
    const raw = result.stdout || result.stderr || "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return result.exitCode === 0
        ? { packages: [] }
        : {
            packages: [],
            error: classifyCommandFailure({
              command: `${pm} outdated --json`,
              cwd,
              exitCode: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr,
              stepLabel: "Dependency update check",
              stepType: "deps",
            }),
          };
    }
    const data = JSON.parse(jsonMatch[0]);
    return {
      packages: Object.entries(data).map(([name, info]: [string, any]) => ({
        name,
        current: info.current || "?",
        latest: info.latest || info.wanted || "?",
        type: classifyUpdate(info.current || "0.0.0", info.latest || info.wanted || "0.0.0"),
      })),
    };
  } catch (err) {
    return { packages: [], error: fromUnknownError(err, { command: "update", cwd }) };
  } finally {
    clearTimeout(timer);
  }
}

function classifyUpdate(current: string, latest: string): "major" | "minor" | "patch" {
  const curr = current.replace(/[^0-9.]/g, "").split(".");
  const lat = latest.replace(/[^0-9.]/g, "").split(".");
  if (curr[0] !== lat[0]) return "major";
  if (curr[1] !== lat[1]) return "minor";
  return "patch";
}

function getTypeColor(type: OutdatedPkg["type"]): string {
  switch (type) {
    case "major": return colors.error;
    case "minor": return colors.warning;
    case "patch": return colors.success;
  }
}
