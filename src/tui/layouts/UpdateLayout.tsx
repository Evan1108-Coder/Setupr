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

interface OutdatedPkg {
  name: string;
  current: string;
  latest: string;
  type: "major" | "minor" | "patch";
}

interface UpdateLayoutProps {
  scan: ScanResult;
  cwd: string;
}

export function UpdateLayout({ scan, cwd }: UpdateLayoutProps) {
  const { exit } = useApp();
  const { activePanel } = useNavigation({ panelCount: 3, onQuit: () => exit() });
  const [packages, setPackages] = useState<OutdatedPkg[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatMessages, setChatMessages] = useState<string[]>([]);

  useEffect(() => {
    checkOutdated(scan, cwd).then((pkgs) => {
      setPackages(pkgs);
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
    <Box flexDirection="column" width="100%">
      <Box justifyContent="space-between">
        <Text color={colors.primary} bold> P-Setup Update</Text>
        <Text color={colors.textDim}>
          {loading ? "scanning..." : `${packages.length} outdated`}
        </Text>
      </Box>

      <Box flexDirection="row" flexGrow={1}>
        <Panel title="Outdated Dependencies" active={activePanel === 0} width="60%">
          <Box flexDirection="column">
            {loading && <Spinner label="Checking for updates..." />}
            {!loading && packages.length === 0 && (
              <Text color={colors.success}>{icons.check} All dependencies up to date!</Text>
            )}
            {packages.slice(0, 20).map((pkg) => (
              <Box key={pkg.name}>
                <Text color={getTypeColor(pkg.type)}>
                  {pkg.type === "major" ? icons.warning : icons.dot} {pkg.name.slice(0, 30).padEnd(30)}
                </Text>
                <Text color={colors.textDim}> {pkg.current.padEnd(10)} → </Text>
                <Text color={getTypeColor(pkg.type)}>{pkg.latest}</Text>
              </Box>
            ))}
            {packages.length > 20 && (
              <Text color={colors.textDim}>  ... and {packages.length - 20} more</Text>
            )}
          </Box>
        </Panel>

        <Box flexDirection="column" width="40%">
          <Panel title="Summary" active={activePanel === 1}>
            <Box flexDirection="column">
              <Text color={colors.error}>{icons.dot} Major: <Text bold>{majorCount}</Text>{majorCount > 0 ? " ⚠ BREAKING" : ""}</Text>
              <Text color={colors.warning}>{icons.dot} Minor: <Text bold>{minorCount}</Text></Text>
              <Text color={colors.success}>{icons.dot} Patch: <Text bold>{patchCount}</Text></Text>
              <Text color={colors.textDim}> </Text>
              <Text color={colors.text}>{icons.dot} PM: {scan.packageManager || "npm"}</Text>
              <Text color={colors.text}>{icons.dot} Total deps: {scan.dependencies.prod + scan.dependencies.dev}</Text>
            </Box>
          </Panel>

          {chatMessages.length > 0 && (
            <Panel title="AI Chat" active={false}>
              <Box flexDirection="column">
                {chatMessages.slice(-4).map((msg, i) => (
                  <Text key={i} color={msg.startsWith("AI") ? colors.primary : colors.accent} wrap="truncate">{msg}</Text>
                ))}
              </Box>
            </Panel>
          )}
        </Box>
      </Box>

      <ChatInput active={activePanel === 2} onSubmit={handleChat} placeholder="Ask about updates (e.g. 'is it safe to update react?')..." />
      <StatusBar
        stepProgress={loading ? "checking..." : `${packages.length} outdated`}
        aiStatus={majorCount > 0 ? `${majorCount} breaking changes` : undefined}
      />
    </Box>
  );
}

async function checkOutdated(scan: ScanResult, cwd: string): Promise<OutdatedPkg[]> {
  const pm = scan.packageManager || "npm";
  try {
    const result = await runCommand(`${pm} outdated --json 2>/dev/null`, cwd);
    const raw = result.stdout || result.stderr || "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const data = JSON.parse(jsonMatch[0]);
    return Object.entries(data).map(([name, info]: [string, any]) => ({
      name,
      current: info.current || "?",
      latest: info.latest || info.wanted || "?",
      type: classifyUpdate(info.current || "0.0.0", info.latest || info.wanted || "0.0.0"),
    }));
  } catch {
    return [];
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
