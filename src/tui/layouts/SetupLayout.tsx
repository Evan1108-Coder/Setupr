import React, { useEffect, useState, useCallback } from "react";
import { Box, Text, useApp, useStdout } from "ink";
import { ChatInput } from "../components/ChatInput.js";
import { EnvInput } from "../components/EnvInput.js";
import { useNavigation } from "../hooks/useNavigation.js";
import { useAppStore } from "../hooks/useStore.js";
import { colors, icons, shortcuts } from "../theme.js";
import type { AppStore } from "../../state/store.js";
import type { LogEntry } from "../../state/store.js";
import { intelligentResponse } from "../../ai/intelligence.js";
import { contextToDSL } from "../../ai/dsl.js";
import * as os from "os";

interface SetupLayoutProps {
  store: AppStore;
}

export function SetupLayout({ store }: SetupLayoutProps) {
  const { exit } = useApp();
  const { activePanel } = useNavigation({ panelCount: 4, onQuit: () => exit() });
  const { stdout } = useStdout();
  const termWidth = stdout?.columns || 120;

  const steps = useAppStore(store, (s) => s.steps);
  const scan = useAppStore(store, (s) => s.scan);
  const isComplete = useAppStore(store, (s) => s.isComplete);
  const currentStepIndex = useAppStore(store, (s) => s.currentStepIndex);
  const logs = useAppStore(store, (s) => s.logs);
  const envVars = useAppStore(store, (s) => s.envVars);
  const envPromptKey = useAppStore(store, (s) => s.envPromptKey);
  const ports = useAppStore(store, (s) => s.ports);
  const keyDeps = useAppStore(store, (s) => s.keyDeps);
  const services = useAppStore(store, (s) => s.services);
  const notices = useAppStore(store, (s) => s.notices);
  const checkpointSaved = useAppStore(store, (s) => s.checkpointSaved);
  const totalPackages = useAppStore(store, (s) => s.totalPackages);
  const installedPackages = useAppStore(store, (s) => s.installedPackages);
  const deprecatedCount = useAppStore(store, (s) => s.deprecatedCount);
  const vulnerabilities = useAppStore(store, (s) => s.vulnerabilities);
  const lockSynced = useAppStore(store, (s) => s.lockSynced);
  const projectName = useAppStore(store, (s) => s.projectName);

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = store.getState().startTime;
    const timer = setInterval(() => {
      setElapsed(Date.now() - start);
    }, 1000);
    return () => clearInterval(timer);
  }, [store]);

  const handleChat = useCallback(async (text: string) => {
    store.getState().addMessage({ role: "user", content: text });
    const state = store.getState();
    if (state.scan && state.context) {
      const dsl = contextToDSL(state.context);
      const result = await intelligentResponse(text, state.scan, dsl);
      store.getState().addMessage({ role: "assistant", content: result.response, level: result.level, cost: result.cost });
    }
  }, [store]);

  const handleEnvSubmit = useCallback((value: string) => {
    const key = store.getState().envPromptKey;
    if (!key) return;
    const vars = store.getState().envVars.map((v) =>
      v.key === key ? { ...v, value, status: "filled" as const } : v
    );
    store.getState().setEnvVars(vars);
    store.getState().addLog({ content: `✓ ${key} = ${value.slice(0, 3)}${"*".repeat(Math.max(0, value.length - 3))} (manual)`, type: "success" });
    const nextPending = vars.find((v) => v.status === "pending");
    store.getState().setEnvPrompt(nextPending?.key || null);
  }, [store]);

  const handleEnvSkip = useCallback(() => {
    const key = store.getState().envPromptKey;
    if (!key) return;
    const vars = store.getState().envVars.map((v) =>
      v.key === key ? { ...v, status: "skipped" as const } : v
    );
    store.getState().setEnvVars(vars);
    store.getState().addLog({ content: `○ ${key} — skipped`, type: "info" });
    const nextPending = vars.find((v) => v.status === "pending");
    store.getState().setEnvPrompt(nextPending?.key || null);
  }, [store]);

  // Derived values
  const currentStep = steps[currentStepIndex];
  const stack = buildStackString(scan);
  const stepLabel = isComplete ? "Complete" : (currentStep?.label || "Scanning");
  const doneCount = steps.filter((s) => s.status === "done").length;
  const failedCount = steps.filter((s) => s.status === "failed").length;
  const autoFilled = envVars.filter((v) => v.status === "auto").length;
  const needInput = envVars.filter((v) => v.status === "pending").length;
  const remainingEnv = envVars.filter((v) => v.status === "pending").length;

  return (
    <Box flexDirection="column" width={termWidth}>
      {/* ═══ HEADER BAR ═══ */}
      <Box width="100%" justifyContent="space-between">
        <Box>
          <Text color={colors.accent} bold>◆ p-setup</Text>
          <Text color={colors.textDim}> — </Text>
          <Text color={colors.text}>{truncPath(store.getState().cwd)}</Text>
          <Text color={colors.textDim}>{"    "}</Text>
          <Text color={colors.text}>Stack: </Text>
          <Text color={colors.textBright} bold>{stack}</Text>
          <Text color={colors.textDim}>{"    "}</Text>
          <Text color={colors.text}>Step {currentStepIndex + 1}/{steps.length || "?"} — {stepLabel}</Text>
        </Box>
        <Box>
          <Text color={colors.textDim}>Elapsed </Text>
          <Text color={colors.text} bold>{formatTime(elapsed)}</Text>
          {checkpointSaved && (
            <>
              <Text color={colors.textDim}>{"  "}</Text>
              <Text color={colors.success}>Checkpoint ✓ saved</Text>
            </>
          )}
        </Box>
      </Box>

      {/* ═══ INFO PANELS ROW ═══ */}
      <Box flexDirection="row" width="100%" borderStyle="single" borderColor={colors.border}>
        {/* STEPS column */}
        <Box flexDirection="column" borderStyle="single" borderColor={colors.border} borderRight paddingX={1} width={18}>
          <Text color={colors.heading} bold>STEPS</Text>
          {steps.length > 0 ? steps.map((step, i) => {
            const icon = step.status === "done" ? icons.check
              : step.status === "running" ? icons.arrowRight
              : step.status === "failed" ? icons.cross
              : icons.circle;
            const col = step.status === "done" ? colors.success
              : step.status === "running" ? colors.accent
              : step.status === "failed" ? colors.error
              : colors.textDim;
            return (
              <Text key={step.id} color={col}>
                {icon} {step.label.slice(0, 14)}
              </Text>
            );
          }) : <Text color={colors.textDim}>Scanning...</Text>}
        </Box>

        {/* PROJECT column */}
        <Box flexDirection="column" borderStyle="single" borderColor={colors.border} borderRight paddingX={1} width={22}>
          <Text color={colors.heading} bold>PROJECT</Text>
          <KVRow label="Name" value={projectName} w={20} />
          <KVRow label="Root" value={truncPath(store.getState().cwd).slice(0, 14)} w={20} />
          <KVRow label="Framework" value={scan?.framework || "—"} w={20} />
          <KVRow label="Language" value={scan?.language || "—"} w={20} />
          <KVRow label="Pkg Manager" value={scan?.packageManager || "—"} w={20} />
        </Box>

        {/* DEPENDENCIES column */}
        <Box flexDirection="column" borderStyle="single" borderColor={colors.border} borderRight paddingX={1} width={22}>
          <Text color={colors.heading} bold>DEPENDENCIES</Text>
          <KVRow label="Total Pkgs" value={String(totalPackages)} w={20} />
          <KVRow label="Installed" value={`${installedPackages} / ${totalPackages}`} w={20} />
          <KVRow label="Deprecated" value={String(deprecatedCount)} w={20} color={deprecatedCount > 0 ? colors.warning : undefined} />
          <KVRow label="Vulnerabilities" value={vulnStr(vulnerabilities)} w={20} color={vulnerabilities.high > 0 ? colors.error : colors.warning} />
          <KVRow label="Lock File" value={lockSynced ? "✓ synced" : "—"} w={20} color={lockSynced ? colors.success : undefined} />
        </Box>

        {/* ENVIRONMENT column */}
        <Box flexDirection="column" borderStyle="single" borderColor={colors.border} borderRight paddingX={1} width={20}>
          <Text color={colors.heading} bold>ENVIRONMENT</Text>
          <KVRow label="Vars Total" value={String(envVars.length)} w={18} />
          <KVRow label="Auto-filled" value={String(autoFilled)} w={18} />
          <KVRow label="Need Input" value={String(needInput)} w={18} color={needInput > 0 ? colors.warning : undefined} />
          <KVRow label="Skipped" value={String(envVars.filter(v => v.status === "skipped").length)} w={18} />
          <KVRow label=".env File" value={envVars.length > 0 ? "creating" : "—"} w={18} color={colors.info} />
        </Box>

        {/* SERVICES column */}
        <Box flexDirection="column" borderStyle="single" borderColor={colors.border} borderRight paddingX={1} width={20}>
          <Text color={colors.heading} bold>SERVICES</Text>
          {services.length > 0 ? services.map((svc) => (
            <Box key={svc.name} justifyContent="space-between">
              <Text color={colors.label}>{svc.name}</Text>
              <Text color={svc.status === "ready" || svc.status === "running" ? colors.success : svc.status === "starting" ? colors.warning : colors.textDim}>
                {svc.status}
              </Text>
            </Box>
          )) : <Text color={colors.textDim}>None detected</Text>}
        </Box>

        {/* RIGHT SIDEBAR - same row */}
        <Box flexDirection="column" paddingX={1} flexGrow={1}>
          <Text color={colors.heading} bold>CURRENT STEP</Text>
          <KVRow label="Step" value={`${currentStepIndex + 1}/${steps.length || "?"} ${stepLabel}`} w={30} />
          <KVRow label="Total Vars" value={String(envVars.length)} w={30} />
          <KVRow label="Filled" value={`${autoFilled} auto`} w={30} />
          <KVRow label="Need Input" value={String(needInput)} w={30} />
          <KVRow label="Elapsed" value={formatTime(elapsed)} w={30} />
        </Box>
      </Box>

      {/* ═══ EXECUTION LOG (main body) ═══ */}
      <Box flexDirection="row" flexGrow={1} width="100%">
        <Box flexDirection="column" width="78%" paddingX={1}>
          {/* Step header */}
          <Box marginBottom={0}>
            <Text color={isComplete ? colors.success : colors.accent} bold>
              {isComplete
                ? `Setup Complete — ${doneCount} done${failedCount > 0 ? `, ${failedCount} failed` : ""}`
                : currentStep
                  ? `Step ${currentStepIndex + 1} — ${currentStep.label} ${currentStep.status === "done" ? "✓ complete" : "in progress"}`
                  : "Scanning project structure..."}
            </Text>
          </Box>
          {/* Log entries */}
          {logs.slice(-16).map((entry) => (
            <Box key={entry.id}>
              <Text color={colors.textDim}>{fmtTime(entry.timestamp)} </Text>
              <Text color={logColor(entry.type)}>{logPrefix(entry.type)}</Text>
              <Text color={entry.type === "command" ? colors.textBright : colors.text}> {entry.content}</Text>
            </Box>
          ))}
          {logs.length === 0 && <Text color={colors.textDim} italic>Waiting for execution to begin...</Text>}
        </Box>

        {/* Right sidebar continued: PORT MAP, KEY DEPS, NOTICES */}
        <Box flexDirection="column" width="22%" borderStyle="single" borderColor={colors.border} paddingX={1}>
          <Text color={colors.heading} bold>PORT MAP</Text>
          {ports.length > 0 ? ports.map((p) => (
            <Box key={p.service} justifyContent="space-between">
              <Text color={colors.label}>{p.service}</Text>
              <Text color={p.status === "free" ? colors.success : colors.error}>:{p.port} {p.status === "free" ? "✓ free" : "✗ in use"}</Text>
            </Box>
          )) : <Text color={colors.textDim}>No ports</Text>}
          <Text> </Text>
          <Text color={colors.heading} bold>KEY DEPENDENCIES</Text>
          {keyDeps.length > 0 ? keyDeps.slice(0, 6).map((dep) => (
            <Box key={dep.name} justifyContent="space-between">
              <Text color={colors.label}>{dep.name}</Text>
              <Text color={colors.value}>{dep.version} <Text color={colors.success}>✓</Text></Text>
            </Box>
          )) : <Text color={colors.textDim}>Scanning...</Text>}
          <Text> </Text>
          <Text color={colors.heading} bold>NOTICES</Text>
          {notices.length > 0 ? notices.map((n, i) => (
            <Text key={i} color={n.type === "error" ? colors.error : n.type === "warning" ? colors.warning : colors.info}>
              {n.type === "error" ? "●" : n.type === "warning" ? "△" : "ℹ"} {n.message}
            </Text>
          )) : <Text color={colors.textDim}>No issues</Text>}
        </Box>
      </Box>

      {/* ═══ BOTTOM: System Info + Input ═══ */}
      <Box flexDirection="row" width="100%">
        <Box flexDirection="column" width={14}>
          <Text color={colors.textDim}>OS {getOS()}</Text>
          <Text color={colors.textDim}>Node {process.version}</Text>
          <Text color={colors.textDim}>Shell {process.env.SHELL?.split("/").pop() || "sh"}</Text>
          <Text color={colors.textDim}>Arch {os.arch()}</Text>
          <Text color={colors.textDim}>RAM {(os.freemem() / 1073741824).toFixed(1)}/{(os.totalmem() / 1073741824).toFixed(0)} GB</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          {envPromptKey ? (
            <EnvInput
              varKey={envPromptKey}
              remainingCount={remainingEnv - 1}
              onSubmit={handleEnvSubmit}
              onSkip={handleEnvSkip}
            />
          ) : (
            <ChatInput active={activePanel === 3} onSubmit={handleChat} placeholder="Ask anything or paste a value..." />
          )}
        </Box>
      </Box>

      {/* ═══ FOOTER ═══ */}
      <Box width="100%" justifyContent="space-between">
        <Box gap={2}>
          {shortcuts.map((s) => (
            <Box key={s.key}>
              <Text color={colors.accent} bold>{s.key}</Text>
              <Text color={colors.textDim}> {s.desc}</Text>
            </Box>
          ))}
        </Box>
        <Box>
          <Text color={colors.textDim}>v0.1.0 · checkpoint: .p-setup/state.json</Text>
        </Box>
      </Box>
    </Box>
  );
}

// ─── Helpers ───

function KVRow({ label, value, w, color }: { label: string; value: string; w: number; color?: string }) {
  return (
    <Box justifyContent="space-between" width={w}>
      <Text color={colors.label}>{label}</Text>
      <Text color={color || colors.value}>{value}</Text>
    </Box>
  );
}

function buildStackString(scan: { language?: string | null; framework?: string | null; services?: string[] } | null): string {
  if (!scan) return "Detecting...";
  const parts: string[] = [];
  if (scan.framework) parts.push(scan.framework);
  if (scan.language) parts.push(scan.language);
  if (scan.services && scan.services.length > 0) parts.push(...scan.services.slice(0, 3));
  return parts.join(" + ") || "Unknown";
}

function truncPath(cwd: string): string {
  const home = process.env.HOME || "";
  if (cwd.startsWith(home)) return "~" + cwd.slice(home.length);
  return cwd;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, "0")}s`;
  return `${sec}s`;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function logColor(type: LogEntry["type"]): string {
  switch (type) {
    case "success": return colors.success;
    case "warning": return colors.warning;
    case "error": return colors.error;
    case "command": return colors.textBright;
    case "progress": return colors.info;
    case "info": return colors.text;
  }
}

function logPrefix(type: LogEntry["type"]): string {
  switch (type) {
    case "success": return "✓";
    case "warning": return "△";
    case "error": return "✗";
    case "command": return "$";
    case "progress": return "…";
    case "info": return " ";
  }
}

function vulnStr(v: { high: number; moderate: number; low: number }): string {
  if (v.high === 0 && v.moderate === 0) return "none";
  const parts: string[] = [];
  if (v.high > 0) parts.push(`${v.high} high`);
  if (v.moderate > 0) parts.push(`${v.moderate} moderate`);
  return parts.join(", ");
}

function getOS(): string {
  const platform = os.platform();
  if (platform === "darwin") {
    const major = parseInt(os.release().split(".")[0] || "0", 10);
    if (major >= 25) return "macOS 15";
    if (major >= 24) return "macOS 14";
    if (major >= 23) return "macOS 13";
    if (major >= 22) return "macOS 12";
    return "macOS";
  }
  if (platform === "win32") return "Windows";
  return "Linux";
}
