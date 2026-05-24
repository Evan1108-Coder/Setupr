import React, { useEffect, useState } from "react";
import { Box, Text, useApp } from "ink";
import { Panel } from "../components/Panel.js";
import { StatusBar } from "../components/StatusBar.js";
import { Spinner } from "../components/Spinner.js";
import { useNavigation } from "../hooks/useNavigation.js";
import { colors, icons } from "../theme.js";
import { runCommand } from "../../executor/index.js";
import type { ScanResult } from "../../scanner/index.js";
import { stat, rm, readdir } from "fs/promises";
import { join } from "path";

interface CleanTarget {
  path: string;
  size: string;
  type: "deps" | "build" | "cache" | "sensitive";
  status: "pending" | "removing" | "done";
}

interface CleanLayoutProps {
  scan: ScanResult;
  cwd: string;
  mode: "deps" | "share" | "all";
}

export function CleanLayout({ scan, cwd, mode }: CleanLayoutProps) {
  const { exit } = useApp();
  const { activePanel } = useNavigation({ panelCount: 2, onQuit: () => exit() });
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
    <Box flexDirection="column" width="100%">
      <Box justifyContent="space-between">
        <Text color={colors.primary} bold> P-Setup Clean</Text>
        <Text color={colors.textDim}>mode: {mode}</Text>
      </Box>

      <Box flexDirection="row" flexGrow={1}>
        <Panel title="Targets" active={activePanel === 0} width="60%">
          <Box flexDirection="column">
            {loading && <Spinner label="Scanning for removable files..." />}
            {targets.map((t) => (
              <Box key={t.path}>
                <Text color={getTargetColor(t)}>
                  {t.status === "done" ? icons.check : t.status === "removing" ? icons.spinner[0] : icons.circle}
                  {" "}{t.path}
                </Text>
                <Text color={colors.textDim}> ({t.size})</Text>
              </Box>
            ))}
            {!loading && targets.length === 0 && (
              <Text color={colors.success}>{icons.check} Nothing to clean!</Text>
            )}
          </Box>
        </Panel>

        <Panel title="Info" active={activePanel === 1} width="40%">
          <Box flexDirection="column">
            <Text color={colors.textBright} bold>Mode: {mode}</Text>
            {mode === "deps" && <Text color={colors.text}>Removes installed dependencies</Text>}
            {mode === "share" && <Text color={colors.text}>Removes sensitive + system files</Text>}
            {mode === "all" && <Text color={colors.text}>Removes everything non-essential</Text>}
          </Box>
        </Panel>
      </Box>

      <StatusBar stepProgress={done ? "clean complete" : cleaning ? "cleaning..." : "scanning"} />
    </Box>
  );
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
    } catch {
      results[i] = { ...results[i], status: "done" };
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
  if (t.status === "removing") return colors.accent;
  return colors.text;
}
