import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp } from "ink";
import { Panel } from "../components/Panel.js";
import { StatusBar } from "../components/StatusBar.js";
import { Spinner } from "../components/Spinner.js";
import { useFocusNavigation, type FocusItem } from "../hooks/useFocusNavigation.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { colors, icons } from "../theme.js";
import type { ScanResult } from "../../scanner/index.js";
import { stat, rm } from "fs/promises";
import { join } from "path";
import { createPSetupError, type PSetupError } from "../../errors/index.js";

interface CleanTarget {
  path: string;
  size: string;
  type: "deps" | "build" | "cache" | "sensitive";
  status: "pending" | "removing" | "done" | "failed";
  error?: PSetupError;
}

interface CleanLayoutProps {
  scan: ScanResult;
  cwd: string;
  mode: "deps" | "share" | "all";
}

export function CleanLayout({ cwd, mode }: CleanLayoutProps) {
  const { exit } = useApp();
  const terminal = useTerminalSize();
  const stacked = terminal.width < 90;
  const mainWidth = stacked ? terminal.width : Math.max(44, Math.floor(terminal.width * 0.64));
  const sideWidth = stacked ? terminal.width : terminal.width - mainWidth;
  const focusItems = useMemo(
    () => buildFocusItems(terminal.width, terminal.height, mainWidth, sideWidth, stacked),
    [terminal.width, terminal.height, mainWidth, sideWidth, stacked]
  );
  const focus = useFocusNavigation({ items: focusItems, onQuit: () => exit() });
  const [targets, setTargets] = useState<CleanTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    findCleanTargets(cwd, mode).then((t) => {
      setTargets(t);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!loading && targets.length > 0 && !cleaning && !done) {
      setCleaning(true);
      cleanTargets(cwd, targets).then((results) => {
        setTargets(results);
        setDone(true);
        setCleaning(false);
      });
    }
  }, [loading, targets.length, cleaning, done]);

  return (
    <Box flexDirection="column" width={terminal.width} height={terminal.height}>
      <Box height={1} justifyContent="space-between">
        <Text color={colors.primary} bold> P-Setup Clean</Text>
        <Text color={colors.textDim}>mode: {mode}</Text>
      </Box>

      <Box flexDirection={stacked ? "column" : "row"} width="100%" flexGrow={1} minHeight={8}>
        <Panel title="Targets" focusState={focus.focusState("targets")} width={stacked ? "100%" : mainWidth} height={stacked ? undefined : "100%"} flexGrow={stacked ? 1 : undefined}>
          <Box flexDirection="column">
            {loading && <Spinner label="Scanning for removable files..." />}
            {targets.map((t) => (
              <Box key={t.path} minWidth={0}>
                <Text color={getTargetColor(t)} wrap="truncate">
                  {t.status === "done" ? icons.check : t.status === "failed" ? icons.cross : t.status === "removing" ? icons.spinner[0] : icons.circle}
                  {" "}{t.path}
                </Text>
                <Text color={colors.textDim}> ({t.size})</Text>
                {t.error && <Text color={colors.error} wrap="truncate"> {t.error.code}</Text>}
              </Box>
            ))}
            {!loading && targets.length === 0 && (
              <Text color={colors.success}>{icons.check} Nothing to clean!</Text>
            )}
          </Box>
        </Panel>

        <Panel title="Info" focusState={focus.focusState("info")} width={stacked ? "100%" : sideWidth} height={stacked ? 9 : "100%"}>
          <Box flexDirection="column">
            <Text color={colors.textBright} bold>Mode: {mode}</Text>
            {mode === "deps" && <Text color={colors.text}>Removes installed dependencies and dependency caches.</Text>}
            {mode === "share" && <Text color={colors.text}>Removes sensitive and system-local files.</Text>}
            {mode === "all" && <Text color={colors.text}>Removes dependencies, build output, caches, and local env files.</Text>}
            <Text> </Text>
            <Text color={colors.heading} bold>STATE</Text>
            <Text color={colors.text}>Targets: {targets.length}</Text>
            <Text color={targets.some((target) => target.status === "failed") ? colors.error : colors.textDim}>
              Failed: {targets.filter((target) => target.status === "failed").length}
            </Text>
            <Text color={cleaning ? colors.warning : done ? colors.success : colors.textDim}>
              {done ? "Complete" : cleaning ? "Cleaning..." : loading ? "Scanning..." : "Ready"}
            </Text>
          </Box>
        </Panel>
      </Box>

      <StatusBar stepProgress={done ? "clean complete" : cleaning ? "cleaning..." : "scanning"} />
    </Box>
  );
}

function buildFocusItems(width: number, height: number, mainWidth: number, sideWidth: number, stacked: boolean): FocusItem[] {
  if (stacked) {
    return [
      { id: "targets", row: 0, column: 0, bounds: { x: 1, y: 2, width, height: Math.max(8, height - 10) } },
      { id: "info", row: 1, column: 0, bounds: { x: 1, y: Math.max(3, height - 8), width, height: 7 } },
    ];
  }
  return [
    { id: "targets", row: 0, column: 0, bounds: { x: 1, y: 2, width: mainWidth, height: height - 2 } },
    { id: "info", row: 0, column: 1, bounds: { x: mainWidth + 1, y: 2, width: sideWidth, height: height - 2 } },
  ];
}

async function findCleanTargets(cwd: string, mode: string): Promise<CleanTarget[]> {
  const targets: CleanTarget[] = [];

  const depsDirs = ["node_modules", "__pycache__", "venv", ".venv", "vendor", "target/debug"];
  const buildDirs = ["dist", "build", ".next", ".nuxt", ".output", "out"];
  const cacheDirs = [".cache", ".turbo", ".parcel-cache", ".vite"];
  const sensitiveFiles = [".env", ".env.local", ".DS_Store", "*.log"];

  if (mode === "deps" || mode === "all") {
    for (const dir of depsDirs) {
      const size = await getDirSize(join(cwd, dir));
      if (size) targets.push({ path: dir, size, type: "deps", status: "pending" });
    }
  }

  if (mode === "all") {
    for (const dir of [...buildDirs, ...cacheDirs]) {
      const size = await getDirSize(join(cwd, dir));
      if (size) targets.push({ path: dir, size, type: "build", status: "pending" });
    }
  }

  if (mode === "share" || mode === "all") {
    for (const file of sensitiveFiles) {
      if (!file.includes("*")) {
        const size = await getFileSize(join(cwd, file));
        if (size) targets.push({ path: file, size, type: "sensitive", status: "pending" });
      }
    }
  }

  return targets;
}

async function cleanTargets(cwd: string, targets: CleanTarget[]): Promise<CleanTarget[]> {
  const results = [...targets];
  for (let i = 0; i < results.length; i++) {
    results[i] = { ...results[i], status: "removing" };
    try {
      await rm(join(cwd, results[i].path), { recursive: true, force: true });
      results[i] = { ...results[i], status: "done" };
    } catch (err) {
      results[i] = {
        ...results[i],
        status: "failed",
        error: createPSetupError({
          code: "CLEAN_TARGET_FAILED",
          command: "clean",
          cwd,
          details: [`Target: ${results[i].path}`, err instanceof Error ? err.message : String(err)],
        }),
      };
    }
  }
  return results;
}

async function getDirSize(path: string): Promise<string | null> {
  try {
    const s = await stat(path);
    if (!s.isDirectory()) return null;
    return formatSize(s.size || 4096);
  } catch {
    return null;
  }
}

async function getFileSize(path: string): Promise<string | null> {
  try {
    const s = await stat(path);
    return formatSize(s.size);
  } catch {
    return null;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

function getTargetColor(t: CleanTarget): string {
  if (t.status === "done") return colors.success;
  if (t.status === "failed") return colors.error;
  if (t.status === "removing") return colors.accent;
  return colors.text;
}
