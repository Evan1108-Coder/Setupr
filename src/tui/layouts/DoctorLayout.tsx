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
import { classifyCommandFailure, createSetuprError, type SetuprError } from "../../errors/index.js";
import type { ScanResult } from "../../scanner/index.js";

interface Check {
  label: string;
  status: "pass" | "fail" | "warn" | "checking";
  detail?: string;
  error?: SetuprError;
}

interface DoctorLayoutProps {
  scan: ScanResult;
  cwd: string;
}

export function DoctorLayout({ scan, cwd }: DoctorLayoutProps) {
  const { exit } = useApp();
  const terminal = useTerminalSize();
  const stacked = terminal.width < 96;
  const mainWidth = stacked ? terminal.width : Math.max(46, Math.floor(terminal.width * 0.62));
  const sideWidth = stacked ? terminal.width : terminal.width - mainWidth;
  const mainPanelHeight = stacked ? Math.max(8, terminal.height - 11) : terminal.height - 2;
  const inputLines = inputLinesForPanel(mainPanelHeight);
  const checkLimit = Math.max(1, mainPanelHeight - inputLines - 6);
  const noProject = !hasProjectSignals(scan);
  const focusItems = useMemo(
    () => buildFocusItems(terminal.width, terminal.height, mainWidth, sideWidth, stacked),
    [terminal.width, terminal.height, mainWidth, sideWidth, stacked]
  );
  const focus = useFocusNavigation({ items: focusItems, onQuit: () => exit() });
  const [checks, setChecks] = useState<Check[]>([]);
  const [done, setDone] = useState(false);
  const [chatMessages, setChatMessages] = useState<string[]>([]);

  useEffect(() => {
    runDiagnostics(scan, cwd, noProject).then((results) => {
      setChecks(results);
      setDone(true);
    });
  }, []);

  const handleChat = useCallback(async (text: string) => {
    setChatMessages((prev) => [...prev, `You → ${text}`]);
    const dsl = scanResultToDSL(scan);
    const checksContext = checks.map((c) => `${c.label}: ${c.status}${c.detail ? ` (${c.detail})` : ""}`).join(", ");
    const result = await intelligentResponse(
      `${text}\n\nDoctor results: ${checksContext}`,
      scan,
      `[DOCTOR] ${dsl}`
    );
    setChatMessages((prev) => [...prev, `AI → ${result.response}`]);
  }, [scan, checks]);

  const passCount = checks.filter((c) => c.status === "pass").length;
  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const summary = done ? `${passCount}${icons.check} ${failCount}${icons.cross} ${warnCount}${icons.warning}` : "checking...";

  return (
    <Box flexDirection="column" width={terminal.width} height={terminal.height}>
      <Box height={1} justifyContent="space-between">
        <Text color={colors.primary} bold> Setupr Doctor</Text>
        <Text color={noProject ? colors.warning : colors.textDim}>{summary}</Text>
      </Box>

      <Box flexDirection={stacked ? "column" : "row"} width="100%" flexGrow={1} minHeight={8}>
        <Panel title="Diagnostics" focusState={focus.focusState("diagnostics")} width={stacked ? "100%" : mainWidth} height={stacked ? undefined : "100%"} flexGrow={stacked ? 1 : undefined}>
          <Box flexDirection="column" flexGrow={1}>
            <Box flexDirection="column" flexGrow={1}>
              {checks.slice(0, checkLimit).map((c, i) => (
                <Box key={i} minWidth={0}>
                  <Text color={getCheckColor(c.status)} wrap="truncate">
                    {getCheckIcon(c.status)} {c.label}{c.detail ? ` - ${c.detail}` : ""}{c.error ? ` (${c.error.code})` : ""}
                  </Text>
                </Box>
              ))}
              {checks.length > checkLimit && (
                <Text color={colors.textDim}>… {checks.length - checkLimit} more checks</Text>
              )}
              {!done && <Spinner label="Running diagnostics..." />}
            </Box>
            <ChatInput
              active={focus.isActive("input")}
              focusState={focus.focusState("input")}
              onSubmit={handleChat}
              placeholder={noProject ? "Open a project folder, then run doctor again..." : "Ask about the diagnosis..."}
              width={mainWidth}
              maxLines={inputLines}
              scrollBounds={focus.activeItem?.id === "input" ? focus.activeItem.bounds : undefined}
            />
          </Box>
        </Panel>

        <Panel title="Environment" focusState={focus.focusState("environment")} width={stacked ? "100%" : sideWidth} height={stacked ? 9 : "100%"}>
          <Box flexDirection="column">
            <Text color={colors.text}>{icons.dot} OS: <Text color={colors.info}>{process.platform} {process.arch}</Text></Text>
            <Text color={colors.text}>{icons.dot} Node: <Text color={colors.info}>{process.version}</Text></Text>
            <Text color={colors.text}>{icons.dot} Shell: <Text color={colors.info}>{process.env.SHELL || "unknown"}</Text></Text>
            <Text color={colors.text}>{icons.dot} PM: <Text color={colors.info}>{scan.packageManager || "none"}</Text></Text>
            <Text color={colors.text}>{icons.dot} Language: <Text color={colors.info}>{scan.language || "unknown"}</Text></Text>
            <Text color={colors.text}>{icons.dot} Framework: <Text color={colors.info}>{scan.framework || "none"}</Text></Text>
            {scan.services.length > 0 && (
              <Text color={colors.text}>{icons.dot} Services: <Text color={colors.warning}>{scan.services.join(", ")}</Text></Text>
            )}
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

      <StatusBar stepProgress={done ? `${checks.length} checks done` : "checking..."} />
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
      { id: "diagnostics", row: 0, column: 0, redirectTo: "input", bounds: { x: 1, y: 2, width, height: mainPanelHeight } },
      { id: "input", row: 1, column: 0, parentIds: ["diagnostics"], bounds: { x: 3, y: Math.max(4, 2 + mainPanelHeight - inputHeight - 1), width: width - 4, height: inputHeight } },
      { id: "environment", row: 2, column: 0, bounds: { x: 1, y: Math.max(3, height - 9), width, height: 8 } },
    ];
  }
  const mainPanelHeight = height - 2;
  const inputHeight = inputBoundsHeightForPanel(mainPanelHeight);
  return [
    { id: "diagnostics", row: 0, column: 0, redirectTo: "input", bounds: { x: 1, y: 2, width: mainWidth, height: mainPanelHeight } },
    { id: "input", row: 1, column: 0, parentIds: ["diagnostics"], bounds: { x: 3, y: Math.max(4, height - inputHeight - 1), width: mainWidth - 4, height: inputHeight } },
    { id: "environment", row: 0, column: 1, bounds: { x: mainWidth + 1, y: 2, width: sideWidth, height: height - 2 } },
  ];
}

function inputBoundsHeightForPanel(panelHeight: number): number {
  return inputLinesForPanel(panelHeight) + 2;
}

async function runDiagnostics(scan: ScanResult, cwd: string, noProject: boolean): Promise<Check[]> {
  const checks: Check[] = [];

  if (noProject) {
    checks.push({
      label: "Project files",
      status: "warn",
      detail: "none detected in current directory",
      error: createSetuprError({ code: "NO_PROJECT_DETECTED", command: "doctor", cwd, canContinue: true }),
    });
  }

  if (scan.runtime) {
    const result = await runCommand(`${scan.runtime.name} --version`, cwd);
    if (result.exitCode === 0) {
      const version = result.stdout.trim().split("\n")[0];
      if (scan.runtime.version && !versionSatisfies(version, scan.runtime.version)) {
        checks.push({ label: `${scan.runtime.name} runtime`, status: "warn", detail: `${version} (expected ${scan.runtime.version})` });
      } else {
        checks.push({ label: `${scan.runtime.name} runtime`, status: "pass", detail: version });
      }
    } else {
      checks.push({
        label: `${scan.runtime.name} runtime`,
        status: "fail",
        detail: "not found",
        error: classifyCommandFailure({
          command: `${scan.runtime.name} --version`,
          cwd,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          stepLabel: `${scan.runtime.name} runtime`,
        }),
      });
    }
  }

  if (scan.packageManager) {
    const result = await runCommand(`${scan.packageManager} --version`, cwd);
    if (result.exitCode === 0) {
      checks.push({ label: `${scan.packageManager}`, status: "pass", detail: result.stdout.trim().split("\n")[0] });
    } else {
      checks.push({
        label: `${scan.packageManager}`,
        status: "fail",
        detail: "not installed",
        error: classifyCommandFailure({
          command: `${scan.packageManager} --version`,
          cwd,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          stepLabel: `${scan.packageManager} package manager`,
        }),
      });
    }
  }

  if (scan.packageManager === "npm" || scan.packageManager === "yarn" || scan.packageManager === "pnpm" || scan.packageManager === "bun") {
    try {
      const { access } = await import("fs/promises");
      const { join } = await import("path");
      await access(join(cwd, "node_modules"));
      checks.push({ label: "Dependencies installed", status: "pass" });
    } catch {
      checks.push({
        label: "Dependencies installed",
        status: "fail",
        detail: `run '${scan.packageManager} install'`,
        error: createSetuprError({
          code: "INSTALL_FAILED",
          command: "doctor",
          cwd,
          details: [`Missing dependency folder for ${scan.packageManager}.`],
          canContinue: true,
        }),
      });
    }
  }

  try {
    const result = await runCommand("git status --porcelain", cwd);
    if (result.exitCode === 0) {
      const dirty = result.stdout.trim().length > 0;
      checks.push({ label: "Git repository", status: "pass", detail: dirty ? "dirty" : "clean" });
    } else {
      checks.push({ label: "Git repository", status: "warn", detail: "not a git repo" });
    }
  } catch {
    checks.push({ label: "Git repository", status: "warn", detail: "not a git repo" });
  }

  if (scan.configFiles.includes(".env.example")) {
    try {
      const { access } = await import("fs/promises");
      const { join } = await import("path");
      await access(join(cwd, ".env"));
      checks.push({ label: ".env file", status: "pass" });
    } catch {
      checks.push({
        label: ".env file",
        status: "warn",
        detail: "missing - run 'setup env init'",
        error: createSetuprError({ code: "ENV_CHECK_FAILED", command: "doctor", cwd, details: [".env.example exists but .env is missing."], canContinue: true }),
      });
    }
  }

  if (scan.scripts.build) {
    checks.push({ label: "Build script", status: "pass", detail: scan.scripts.build });
  }
  if (scan.scripts.test) {
    checks.push({ label: "Test script", status: "pass", detail: scan.scripts.test });
  }
  if (!scan.scripts.test && !scan.scripts.build && !noProject) {
    checks.push({ label: "Build/test scripts", status: "warn", detail: "none defined" });
  }

  const commonPorts = [3000, 5173, 8080, 4200];
  for (const port of commonPorts) {
    try {
      const result = await runCommand(`lsof -i :${port} -t 2>/dev/null`, cwd);
      if (result.stdout.trim()) {
        checks.push({ label: `Port ${port}`, status: "warn", detail: `in use (PID ${result.stdout.trim().split("\n")[0]})` });
      }
    } catch {}
  }

  try {
    const result = await runCommand("git remote get-url origin 2>/dev/null", cwd);
    if (result.exitCode === 0 && result.stdout.trim()) {
      checks.push({ label: "Remote", status: "pass", detail: result.stdout.trim().replace(/.*\//, "").replace(".git", "") });
    }
  } catch {}

  if (checks.length === 0) {
    checks.push({ label: "Project files", status: "warn", detail: "nothing checkable detected" });
  }

  return checks;
}

function getCheckIcon(status: Check["status"]): string {
  switch (status) {
    case "pass": return icons.check;
    case "fail": return icons.cross;
    case "warn": return icons.warning;
    case "checking": return icons.spinner[0];
  }
}

function getCheckColor(status: Check["status"]): string {
  switch (status) {
    case "pass": return colors.success;
    case "fail": return colors.error;
    case "warn": return colors.warning;
    case "checking": return colors.textDim;
  }
}

function versionSatisfies(actualText: string, expected: string): boolean {
  const actual = parseVersion(actualText);
  if (!actual) return actualText.includes(expected);

  const clauses = expected.split(/\s+/).filter(Boolean);
  if (clauses.length === 0) return true;

  return clauses.every((clause) => {
    const match = clause.match(/^(>=|<=|>|<|=|\^|~)?\s*v?(\d+(?:\.\d+){0,2})/);
    if (!match) return actualText.includes(clause);
    const [, op = "=", version] = match;
    const cmp = compareVersions(actual, normalizeVersion(version));
    switch (op) {
      case ">=": return cmp >= 0;
      case "<=": return cmp <= 0;
      case ">": return cmp > 0;
      case "<": return cmp < 0;
      case "^": return actual[0] === normalizeVersion(version)[0] && cmp >= 0;
      case "~": {
        const target = normalizeVersion(version);
        return actual[0] === target[0] && actual[1] === target[1] && cmp >= 0;
      }
      default: return cmp === 0;
    }
  });
}

function parseVersion(text: string): [number, number, number] | null {
  const match = text.match(/v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)];
}

function normalizeVersion(version: string): [number, number, number] {
  const parsed = parseVersion(version);
  return parsed || [0, 0, 0];
}

function compareVersions(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}
