import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp } from "ink";
import { collectDashboardStatus, createDashboardFallbackStatus, type DashboardStatus } from "../../status/collector.js";
import { Panel } from "../components/Panel.js";
import { StatusBar } from "../components/StatusBar.js";
import { Spinner } from "../components/Spinner.js";
import { useFocusNavigation, type FocusItem } from "../hooks/useFocusNavigation.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { colors, icons } from "../theme.js";

interface DashboardLayoutProps {
  cwd: string;
  initialStatus?: DashboardStatus;
}

export function DashboardLayout({ cwd, initialStatus }: DashboardLayoutProps) {
  const { exit } = useApp();
  const terminal = useTerminalSize();
  const [status, setStatus] = useState<DashboardStatus | null>(initialStatus || null);
  const [error, setError] = useState<string | null>(null);
  const stacked = terminal.width < 104;
  const headerHeight = 1;
  const footerHeight = 1;
  const bodyHeight = Math.max(8, terminal.height - headerHeight - footerHeight);
  const leftWidth = stacked ? terminal.width : Math.max(44, Math.floor(terminal.width * 0.46));
  const rightWidth = stacked ? terminal.width : terminal.width - leftWidth;
  const focusItems = useMemo(
    () => buildFocusItems(terminal.width, terminal.height, leftWidth, rightWidth, stacked),
    [terminal.width, terminal.height, leftWidth, rightWidth, stacked]
  );
  const focus = useFocusNavigation({ items: focusItems, onQuit: () => exit() });

  useEffect(() => {
    let alive = true;
    if (initialStatus) return () => {
      alive = false;
    };
    const timer = setTimeout(() => {
      if (alive) {
        setStatus(createDashboardFallbackStatus(cwd, "Status probes timed out in the interactive dashboard."));
      }
    }, 2500);
    collectDashboardStatus(cwd)
      .then((next) => {
        clearTimeout(timer);
        if (alive) setStatus(next);
      })
      .catch((err) => {
        clearTimeout(timer);
        if (alive) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [cwd, initialStatus]);

  return (
    <Box flexDirection="column" width={terminal.width} height={terminal.height}>
      <Box height={headerHeight} justifyContent="space-between">
        <Text color={colors.primary} bold> Setupr Dashboard</Text>
        <Text color={status ? healthColor(status.health.label) : colors.textDim}>
          {status ? `${status.health.score}/100 ${status.health.label}` : "loading"}
        </Text>
      </Box>

      {!status && !error && (
        <Box flexGrow={1}>
          <Spinner label="Collecting project status..." />
        </Box>
      )}

      {error && (
        <Box flexGrow={1}>
          <Panel title="Dashboard Error" focusState="focused" width="100%" height="100%">
            <Text color={colors.error}>{error}</Text>
          </Panel>
        </Box>
      )}

      {status && (
        <Box flexDirection={stacked ? "column" : "row"} flexGrow={1} height={bodyHeight}>
          <Box flexDirection="column" width={stacked ? "100%" : leftWidth} height={stacked ? Math.max(12, Math.floor(bodyHeight * 0.58)) : "100%"}>
            <Panel title="Project" focusState={focus.focusState("project")} width="100%" height={stacked ? Math.max(7, Math.floor(bodyHeight * 0.24)) : Math.max(8, Math.floor(bodyHeight * 0.30))}>
              <ProjectPanel status={status} />
            </Panel>
            <Panel title="Health" focusState={focus.focusState("health")} width="100%" flexGrow={1} minHeight={8}>
              <HealthPanel status={status} limit={stacked ? 5 : 8} />
            </Panel>
          </Box>

          <Box flexDirection="column" width={stacked ? "100%" : rightWidth} height={stacked ? Math.max(12, bodyHeight - Math.max(12, Math.floor(bodyHeight * 0.58))) : "100%"}>
            <Box flexDirection={stacked || rightWidth < 70 ? "column" : "row"} width="100%" height={stacked ? undefined : Math.max(8, Math.floor(bodyHeight * 0.38))}>
              <Panel title="Git" focusState={focus.focusState("git")} width={stacked || rightWidth < 70 ? "100%" : Math.floor(rightWidth * 0.50)} height={stacked ? 8 : "100%"}>
                <GitPanel status={status} />
              </Panel>
              <Panel title="Env + Deps" focusState={focus.focusState("env")} width={stacked || rightWidth < 70 ? "100%" : rightWidth - Math.floor(rightWidth * 0.50)} height={stacked ? 8 : "100%"}>
                <EnvDepsPanel status={status} />
              </Panel>
            </Box>
            <Box flexDirection={stacked || rightWidth < 82 ? "column" : "row"} width="100%" flexGrow={1} minHeight={8}>
              <Panel title="Processes" focusState={focus.focusState("processes")} width={stacked || rightWidth < 82 ? "100%" : Math.floor(rightWidth * 0.46)} height={stacked ? 8 : "100%"}>
                <ProcessPanel status={status} />
              </Panel>
              <Panel title="Actions + History" focusState={focus.focusState("actions")} width={stacked || rightWidth < 82 ? "100%" : rightWidth - Math.floor(rightWidth * 0.46)} height={stacked ? 10 : "100%"}>
                <ActionsPanel status={status} />
              </Panel>
            </Box>
          </Box>
        </Box>
      )}

      <StatusBar stepProgress={status ? `${status.commands.length} commands` : "collecting"} aiStatus={status ? `AI ${status.ai.activeModel}` : undefined} />
    </Box>
  );
}

function ProjectPanel({ status }: { status: DashboardStatus }) {
  const scan = status.scan;
  const lines = [
    ["Name", status.projectName],
    ["Stack", scan ? [scan.language, scan.framework, scan.packageManager].filter(Boolean).join(" / ") || "unknown" : "scan unavailable"],
    ["Runtime", scan?.runtime ? `${scan.runtime.name}${scan.runtime.version ? ` ${scan.runtime.version}` : ""}` : "none"],
    ["Services", scan?.services.length ? scan.services.join(", ") : "none"],
    ["Configs", scan?.configFiles.length ? scan.configFiles.slice(0, 4).join(", ") : "none"],
  ];
  return (
    <Box flexDirection="column">
      {lines.map(([label, value]) => (
        <Text key={label} wrap="truncate">
          <Text color={colors.label}>{label.padEnd(9)}</Text>
          <Text color={colors.text}>{value}</Text>
        </Text>
      ))}
    </Box>
  );
}

function HealthPanel({ status, limit }: { status: DashboardStatus; limit: number }) {
  return (
    <Box flexDirection="column">
      {status.health.checks.slice(0, limit).map((check) => (
        <Text key={check.label} wrap="truncate">
          <Text color={check.status === "ok" ? colors.success : check.status === "warning" ? colors.warning : colors.error}>
            {check.status === "ok" ? icons.check : check.status === "warning" ? icons.warning : icons.cross}
          </Text>
          <Text color={colors.text}> {check.label}: </Text>
          <Text color={colors.textDim}>{check.detail}</Text>
        </Text>
      ))}
    </Box>
  );
}

function GitPanel({ status }: { status: DashboardStatus }) {
  const git = status.git;
  if (!git.isRepo) return <Text color={colors.warning}>{icons.warning} Not a git repository</Text>;
  return (
    <Box flexDirection="column">
      <Text wrap="truncate"><Text color={colors.label}>Branch </Text><Text color={colors.text}>{git.branch || "unknown"}</Text></Text>
      <Text wrap="truncate"><Text color={colors.label}>State  </Text><Text color={git.dirtyFiles > 0 ? colors.warning : colors.success}>{git.dirtyFiles > 0 ? `${git.dirtyFiles} changed` : "clean"}</Text></Text>
      <Text wrap="truncate"><Text color={colors.label}>Staged </Text><Text color={colors.text}>{git.stagedFiles}</Text><Text color={colors.textDim}>  Untracked {git.untrackedFiles}</Text></Text>
      {git.recent.slice(0, 4).map((line) => <Text key={line} color={colors.textDim} wrap="truncate">{line}</Text>)}
    </Box>
  );
}

function EnvDepsPanel({ status }: { status: DashboardStatus }) {
  const env = status.env;
  const deps = status.dependencies;
  return (
    <Box flexDirection="column">
      <Text wrap="truncate"><Text color={colors.label}>Env      </Text><Text color={env.missing.length ? colors.error : env.hasExample ? colors.success : colors.warning}>{env.hasExample ? `${env.defined}/${env.required} defined` : "no .env.example"}</Text></Text>
      {env.missing.slice(0, 2).map((key) => <Text key={key} color={colors.error} wrap="truncate">missing {key}</Text>)}
      <Text wrap="truncate"><Text color={colors.label}>Deps     </Text><Text color={colors.text}>{deps.prod} prod, {deps.dev} dev</Text></Text>
      <Text wrap="truncate"><Text color={colors.label}>PM       </Text><Text color={colors.text}>{deps.packageManager || "none"}</Text></Text>
      <Text wrap="truncate"><Text color={colors.label}>Lockfile </Text><Text color={deps.lockfilePresent ? colors.success : colors.warning}>{deps.lockfile || "missing"}</Text></Text>
    </Box>
  );
}

function ProcessPanel({ status }: { status: DashboardStatus }) {
  if (status.processes.entries.length === 0) {
    return <Text color={colors.textDim}>No Setupr-managed processes yet.</Text>;
  }
  return (
    <Box flexDirection="column">
      <Text color={status.processes.crashed ? colors.error : colors.success}>{status.processes.running}/{status.processes.managed} running</Text>
      {status.processes.entries.slice(0, 5).map((entry) => (
        <Text key={`${entry.name}-${entry.pid || "no-pid"}`} wrap="truncate">
          <Text color={entry.status === "running" ? colors.success : entry.status === "crashed" ? colors.error : colors.textDim}>{icons.dot}</Text>
          <Text color={colors.text}> {entry.name}</Text>
          <Text color={colors.textDim}> {entry.pid ? `pid ${entry.pid}` : entry.status}</Text>
        </Text>
      ))}
    </Box>
  );
}

function ActionsPanel({ status }: { status: DashboardStatus }) {
  const preferred = ["setup", "status", "doctor", "start", "test", "security", "env", "git", "build"];
  const commands = preferred
    .map((name) => status.commands.find((command) => command.name === name))
    .filter((command): command is { name: string; summary: string } => Boolean(command));
  return (
    <Box flexDirection="column">
      {commands.slice(0, 5).map((command, index) => (
        <Text key={command.name} color={colors.text}>{`${index + 1} ${command.name}`.padEnd(70)}</Text>
      ))}
      {status.history.slice(-3).map((event) => (
        <Text key={`${event.timestamp}-${event.type}`} color={colors.textDim}>{shortLine(`${formatTime(event.timestamp)} ${event.message || event.type}`).padEnd(70)}</Text>
      ))}
    </Box>
  );
}

function shortLine(value: string, max = 70): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, Math.max(0, max - 1))}…`;
}

function buildFocusItems(width: number, height: number, leftWidth: number, rightWidth: number, stacked: boolean): FocusItem[] {
  if (stacked) {
    return [
      { id: "project", row: 0, column: 0, bounds: { x: 1, y: 2, width: Math.max(10, width - 2), height: Math.max(6, Math.floor(height * 0.18)) } },
      { id: "health", row: 1, column: 0, bounds: { x: 1, y: Math.max(8, Math.floor(height * 0.20)), width: Math.max(10, width - 2), height: Math.max(6, Math.floor(height * 0.22)) } },
      { id: "git", row: 2, column: 0, bounds: { x: 1, y: Math.max(14, Math.floor(height * 0.42)), width: Math.max(10, width - 2), height: 8 } },
      { id: "env", row: 3, column: 0, bounds: { x: 1, y: Math.max(22, Math.floor(height * 0.54)), width: Math.max(10, width - 2), height: 8 } },
      { id: "processes", row: 4, column: 0, bounds: { x: 1, y: Math.max(30, Math.floor(height * 0.66)), width: Math.max(10, width - 2), height: 8 } },
      { id: "actions", row: 5, column: 0, bounds: { x: 1, y: Math.max(38, Math.floor(height * 0.78)), width: Math.max(10, width - 2), height: 10 } },
    ];
  }
  const bodyY = 2;
  const bodyH = Math.max(8, height - 3);
  return [
    { id: "project", row: 0, column: 0, bounds: { x: 1, y: bodyY, width: leftWidth - 2, height: Math.max(8, Math.floor(bodyH * 0.30)) } },
    { id: "health", row: 1, column: 0, bounds: { x: 1, y: bodyY + Math.max(8, Math.floor(bodyH * 0.30)), width: leftWidth - 2, height: Math.max(8, Math.ceil(bodyH * 0.70)) } },
    { id: "git", row: 0, column: 1, bounds: { x: leftWidth + 1, y: bodyY, width: Math.floor(rightWidth * 0.5) - 2, height: Math.max(8, Math.floor(bodyH * 0.38)) } },
    { id: "env", row: 0, column: 2, bounds: { x: leftWidth + Math.floor(rightWidth * 0.5), y: bodyY, width: Math.ceil(rightWidth * 0.5) - 2, height: Math.max(8, Math.floor(bodyH * 0.38)) } },
    { id: "processes", row: 1, column: 1, bounds: { x: leftWidth + 1, y: bodyY + Math.max(8, Math.floor(bodyH * 0.38)), width: Math.floor(rightWidth * 0.46) - 2, height: Math.max(8, Math.ceil(bodyH * 0.62)) } },
    { id: "actions", row: 1, column: 2, bounds: { x: leftWidth + Math.floor(rightWidth * 0.46), y: bodyY + Math.max(8, Math.floor(bodyH * 0.38)), width: Math.ceil(rightWidth * 0.54) - 2, height: Math.max(8, Math.ceil(bodyH * 0.62)) } },
  ];
}

function healthColor(label: DashboardStatus["health"]["label"]) {
  if (label === "good") return colors.success;
  if (label === "warning") return colors.warning;
  return colors.error;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
