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
import { classifyCommandFailure, createSetuprError, sanitizeSecret, type SetuprError } from "../../errors/index.js";
import type { ScanResult } from "../../scanner/index.js";

interface StartLayoutProps {
  scan: ScanResult;
  cwd: string;
}

export function StartLayout({ scan, cwd }: StartLayoutProps) {
  const { exit } = useApp();
  const terminal = useTerminalSize();
  const stacked = terminal.width < 96;
  const mainWidth = stacked ? terminal.width : Math.max(46, Math.floor(terminal.width * 0.66));
  const sideWidth = stacked ? terminal.width : terminal.width - mainWidth;
  const mainPanelHeight = stacked ? Math.max(8, terminal.height - 11) : terminal.height - 2;
  const inputLines = inputLinesForPanel(mainPanelHeight);
  const outputLimit = Math.max(1, mainPanelHeight - inputLines - 6);
  const focusItems = useMemo(
    () => buildFocusItems(terminal.width, terminal.height, mainWidth, sideWidth, stacked),
    [terminal.width, terminal.height, mainWidth, sideWidth, stacked]
  );
  const focus = useFocusNavigation({ items: focusItems, onQuit: () => exit() });
  const [status, setStatus] = useState<"detecting" | "running" | "failed" | "stopped">("detecting");
  const [command, setCommand] = useState<string | null>(null);
  const [error, setError] = useState<SetuprError | null>(null);
  const [output, setOutput] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<string[]>([]);
  const noProject = !hasProjectSignals(scan);

  useEffect(() => {
    const abortController = new AbortController();
    const startCmd = noProject ? null : detectStartCommand(scan);
    if (startCmd) {
      setCommand(startCmd);
      setError(null);
      setStatus("running");
      runCommand(startCmd, cwd, (line) => {
        setOutput((prev) => [...prev.slice(-80), sanitizeSecret(line)]);
      }, abortController.signal).then((result) => {
        if (!abortController.signal.aborted) {
          if (result.exitCode !== 0) {
            setError(classifyCommandFailure({
              command: startCmd,
              cwd,
              exitCode: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr,
              stepLabel: "Start project",
              stepType: "script",
            }));
            setStatus("failed");
          } else {
            setStatus("stopped");
          }
        }
      });
    } else {
      setError(createSetuprError({
        code: noProject ? "NO_PROJECT_DETECTED" : "MISSING_SCRIPT",
        command: "start",
        cwd,
        details: noProject
          ? ["No package.json, pyproject.toml, Cargo.toml, go.mod, or similar file was detected."]
          : ["No dev, start, serve, develop, or watch script was found."],
      }));
      setStatus("failed");
    }
    return () => { abortController.abort(); };
  }, []);

  const handleChat = useCallback(async (text: string) => {
    setChatMessages((prev) => [...prev, `You → ${text}`]);
    const dsl = scanResultToDSL(scan);
    const result = await intelligentResponse(
      `${text}\n\nProject is running: ${command || "none"}\nRecent output: ${output.slice(-5).join("\n")}`,
      scan,
      `[START] ${dsl}`
    );
    setChatMessages((prev) => [...prev, `AI → ${result.response}`]);
  }, [scan, command, output]);

  return (
    <Box flexDirection="column" width={terminal.width} height={terminal.height}>
      <Box height={1} justifyContent="space-between">
        <Text color={colors.primary} bold> Setupr Start</Text>
        <Text color={status === "running" ? colors.success : status === "failed" ? colors.error : colors.textDim}>
          {status === "running" ? `${icons.dot} LIVE` : noProject ? "no project" : status}
        </Text>
      </Box>

      <Box flexDirection={stacked ? "column" : "row"} width="100%" flexGrow={1} minHeight={8}>
        <Panel title="Output" focusState={focus.focusState("output")} width={stacked ? "100%" : mainWidth} height={stacked ? undefined : "100%"} flexGrow={stacked ? 1 : undefined}>
          <Box flexDirection="column" flexGrow={1}>
            <Box flexDirection="column" flexGrow={1}>
              {status === "detecting" && <Spinner label="Detecting start command..." />}
              {status === "running" && (
                <>
                  <Box marginBottom={1}>
                    <Text color={colors.success}>{icons.dot} Running: </Text>
                    <Text color={colors.accent}>{command}</Text>
                  </Box>
                  {output.slice(-outputLimit).map((line, i) => (
                    <Text key={i} color={colors.text} wrap="truncate">{line}</Text>
                  ))}
                </>
              )}
              {status === "failed" && (
                <Box flexDirection="column">
                  <Text color={colors.error}>{icons.cross} {error?.title || (command ? `Command failed: ${command}` : "No start command found")}</Text>
                  {error && <Text color={colors.textDim}>{error.code}</Text>}
                  {error && <Text color={colors.text}>{error.explanation}</Text>}
                  {error?.details?.slice(0, 3).map((detail, i) => (
                    <Text key={`detail-${i}`} color={colors.textDim} wrap="truncate">  {detail}</Text>
                  ))}
                  {output.slice(-Math.min(outputLimit, 10)).map((line, i) => (
                    <Text key={i} color={colors.error} wrap="truncate">{line}</Text>
                  ))}
                </Box>
              )}
              {status === "stopped" && (
                <Text color={colors.warning}>{icons.warning} Process exited</Text>
              )}
            </Box>
            <ChatInput
              active={focus.isActive("input")}
              focusState={focus.focusState("input")}
              onSubmit={handleChat}
              placeholder="Ask about running the project..."
              width={mainWidth}
              maxLines={inputLines}
              scrollBounds={focus.activeItem?.id === "input" ? focus.activeItem.bounds : undefined}
            />
          </Box>
        </Panel>

        <Panel title="Info" focusState={focus.focusState("info")} width={stacked ? "100%" : sideWidth} height={stacked ? 10 : "100%"}>
          <Box flexDirection="column">
            <Text color={colors.text}>{icons.dot} PM: <Text color={colors.info}>{scan.packageManager || "none"}</Text></Text>
            <Text color={colors.text}>{icons.dot} Framework: <Text color={colors.info}>{scan.framework || "none"}</Text></Text>
            <Text color={colors.text}>{icons.dot} Language: <Text color={colors.info}>{scan.language || "unknown"}</Text></Text>
            <Text color={colors.text}>{icons.dot} Scripts:</Text>
            {Object.entries(scan.scripts).slice(0, 8).map(([name, cmd]) => (
              <Text key={name} color={colors.textDim} wrap="truncate">  {name}: {cmd}</Text>
            ))}
            {Object.keys(scan.scripts).length === 0 && <Text color={colors.textDim}>  none</Text>}
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
        stepProgress={status === "running" ? `${output.length} lines` : status}
        aiStatus={command || undefined}
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
      { id: "output", row: 0, column: 0, redirectTo: "input", bounds: { x: 1, y: 2, width, height: mainPanelHeight } },
      { id: "input", row: 1, column: 0, parentIds: ["output"], bounds: { x: 3, y: Math.max(4, 2 + mainPanelHeight - inputHeight - 1), width: width - 4, height: inputHeight } },
      { id: "info", row: 2, column: 0, bounds: { x: 1, y: Math.max(3, height - 9), width, height: 8 } },
    ];
  }
  const mainPanelHeight = height - 2;
  const inputHeight = inputBoundsHeightForPanel(mainPanelHeight);
  return [
    { id: "output", row: 0, column: 0, redirectTo: "input", bounds: { x: 1, y: 2, width: mainWidth, height: mainPanelHeight } },
    { id: "input", row: 1, column: 0, parentIds: ["output"], bounds: { x: 3, y: Math.max(4, height - inputHeight - 1), width: mainWidth - 4, height: inputHeight } },
    { id: "info", row: 0, column: 1, bounds: { x: mainWidth + 1, y: 2, width: sideWidth, height: height - 2 } },
  ];
}

function inputBoundsHeightForPanel(panelHeight: number): number {
  return inputLinesForPanel(panelHeight) + 2;
}

function detectStartCommand(scan: ScanResult): string | null {
  const pm = scan.packageManager || "npm";
  if (scan.scripts.dev) return `${pm} run dev`;
  if (scan.scripts.start) return `${pm} run start`;
  if (scan.scripts.serve) return `${pm} run serve`;
  if (scan.scripts.develop) return `${pm} run develop`;
  if (scan.scripts.watch) return `${pm} run watch`;
  return null;
}
