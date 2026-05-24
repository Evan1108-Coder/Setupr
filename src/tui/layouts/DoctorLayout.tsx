import React, { useEffect, useState, useCallback } from "react";
import { Box, Text, useApp } from "ink";
import { Panel } from "../components/Panel.js";
import { ChatInput } from "../components/ChatInput.js";
import { StatusBar } from "../components/StatusBar.js";
import { Spinner } from "../components/Spinner.js";
import { useNavigation } from "../hooks/useNavigation.js";
import { colors, icons } from "../theme.js";
import { runCommand } from "../../executor/index.js";
import { intelligentResponse } from "../../ai/intelligence.js";
import { scanResultToDSL } from "../../ai/dsl.js";
import type { ScanResult } from "../../scanner/index.js";

interface Check {
  label: string;
  status: "pass" | "fail" | "warn" | "checking";
  detail?: string;
}

interface DoctorLayoutProps {
  scan: ScanResult;
  cwd: string;
}

export function DoctorLayout({ scan, cwd }: DoctorLayoutProps) {
  const { exit } = useApp();
  const { activePanel } = useNavigation({ panelCount: 3, onQuit: () => exit() });
  const [checks, setChecks] = useState<Check[]>([]);
  const [done, setDone] = useState(false);
  const [chatMessages, setChatMessages] = useState<string[]>([]);

  useEffect(() => {
    runDiagnostics(scan, cwd).then((results) => {
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

  return (
    <Box flexDirection="column" width="100%">
      <Box justifyContent="space-between">
        <Text color={colors.primary} bold> P-Setup Doctor</Text>
        <Text color={colors.textDim}>
          {done ? `${passCount}${icons.check} ${failCount}${icons.cross} ${warnCount}${icons.warning}` : "checking..."}
        </Text>
      </Box>

      <Box flexDirection="row" flexGrow={1}>
        <Panel title="Diagnostics" active={activePanel === 0} width="55%">
          <Box flexDirection="column">
            {checks.map((c, i) => (
              <Box key={i}>
                <Text color={getCheckColor(c.status)}>
                  {getCheckIcon(c.status)} {c.label}
                </Text>
                {c.detail && <Text color={colors.textDim}> — {c.detail}</Text>}
              </Box>
            ))}
            {!done && <Spinner label="Running diagnostics..." />}
          </Box>
        </Panel>

        <Box flexDirection="column" width="45%">
          <Panel title="Environment" active={activePanel === 1}>
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
            </Box>
          </Panel>

          {chatMessages.length > 0 && (
            <Panel title="AI Chat" active={false}>
              <Box flexDirection="column">
                {chatMessages.slice(-5).map((msg, i) => (
                  <Text key={i} color={msg.startsWith("AI") ? colors.primary : colors.accent} wrap="truncate">{msg}</Text>
                ))}
              </Box>
            </Panel>
          )}
        </Box>
      </Box>

      <ChatInput active={activePanel === 2} onSubmit={handleChat} placeholder="Ask about the diagnosis..." />
      <StatusBar stepProgress={done ? `${checks.length} checks done` : "checking..."} />
    </Box>
  );
}

async function runDiagnostics(scan: ScanResult, cwd: string): Promise<Check[]> {
  const checks: Check[] = [];

  if (scan.runtime) {
    try {
      const result = await runCommand(`${scan.runtime.name} --version`, cwd);
      const version = result.stdout.trim().split("\n")[0];
      if (scan.runtime.version && !version.includes(scan.runtime.version)) {
        checks.push({ label: `${scan.runtime.name} runtime`, status: "warn", detail: `${version} (expected ${scan.runtime.version})` });
      } else {
        checks.push({ label: `${scan.runtime.name} runtime`, status: "pass", detail: version });
      }
    } catch {
      checks.push({ label: `${scan.runtime.name} runtime`, status: "fail", detail: "not found" });
    }
  }

  if (scan.packageManager) {
    try {
      const result = await runCommand(`${scan.packageManager} --version`, cwd);
      checks.push({ label: `${scan.packageManager}`, status: "pass", detail: result.stdout.trim().split("\n")[0] });
    } catch {
      checks.push({ label: `${scan.packageManager}`, status: "fail", detail: "not installed" });
    }
  }

  if (scan.packageManager === "npm" || scan.packageManager === "yarn" || scan.packageManager === "pnpm" || scan.packageManager === "bun") {
    try {
      const { access } = await import("fs/promises");
      const { join } = await import("path");
      await access(join(cwd, "node_modules"));
      checks.push({ label: "Dependencies installed", status: "pass" });
    } catch {
      checks.push({ label: "Dependencies installed", status: "fail", detail: `run '${scan.packageManager} install'` });
    }
  }

  try {
    const result = await runCommand("git status --porcelain", cwd);
    const dirty = result.stdout.trim().length > 0;
    checks.push({ label: "Git repository", status: "pass", detail: dirty ? "dirty" : "clean" });
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
      checks.push({ label: ".env file", status: "warn", detail: "missing — run 'setup env init'" });
    }
  }

  if (scan.scripts.build) {
    checks.push({ label: "Build script", status: "pass", detail: scan.scripts.build });
  }
  if (scan.scripts.test) {
    checks.push({ label: "Test script", status: "pass", detail: scan.scripts.test });
  }
  if (!scan.scripts.test && !scan.scripts.build) {
    checks.push({ label: "Build/test scripts", status: "warn", detail: "none defined" });
  }

  const commonPorts = [3000, 5173, 8080, 4200];
  for (const port of commonPorts) {
    try {
      const result = await runCommand(`lsof -i :${port} -t 2>/dev/null`, cwd);
      if (result.stdout.trim()) {
        checks.push({ label: `Port ${port}`, status: "warn", detail: `in use (PID ${result.stdout.trim()})` });
      }
    } catch {}
  }

  try {
    const result = await runCommand("git remote get-url origin 2>/dev/null", cwd);
    if (result.stdout.trim()) {
      checks.push({ label: "Remote", status: "pass", detail: result.stdout.trim().replace(/.*\//, "").replace(".git", "") });
    }
  } catch {}

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
