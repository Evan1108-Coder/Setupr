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

interface StartLayoutProps {
  scan: ScanResult;
  cwd: string;
}

export function StartLayout({ scan, cwd }: StartLayoutProps) {
  const { exit } = useApp();
  const { activePanel } = useNavigation({ panelCount: 3, onQuit: () => exit() });
  const [status, setStatus] = useState<"detecting" | "running" | "failed" | "stopped">("detecting");
  const [command, setCommand] = useState<string | null>(null);
  const [output, setOutput] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<string[]>([]);

  useEffect(() => {
    const abortController = new AbortController();
    const startCmd = detectStartCommand(scan);
    if (startCmd) {
      setCommand(startCmd);
      setStatus("running");
      runCommand(startCmd, cwd, (line) => {
        setOutput((prev) => [...prev.slice(-50), line]);
      }, abortController.signal).then((result) => {
        if (!abortController.signal.aborted) {
          if (result.exitCode !== 0) setStatus("failed");
          else setStatus("stopped");
        }
      });
    } else {
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
    <Box flexDirection="column" width="100%">
      <Box justifyContent="space-between">
        <Text color={colors.primary} bold> P-Setup Start</Text>
        <Text color={status === "running" ? colors.success : status === "failed" ? colors.error : colors.textDim}>
          {status === "running" ? `${icons.dot} LIVE` : status}
        </Text>
      </Box>

      <Box flexDirection="row" flexGrow={1}>
        <Panel title="Output" active={activePanel === 0} width="65%">
          <Box flexDirection="column">
            {status === "detecting" && <Spinner label="Detecting start command..." />}
            {status === "running" && (
              <>
                <Box marginBottom={1}>
                  <Text color={colors.success}>{icons.dot} Running: </Text>
                  <Text color={colors.accent}>{command}</Text>
                </Box>
                {output.slice(-15).map((line, i) => (
                  <Text key={i} color={colors.text} wrap="truncate">{line}</Text>
                ))}
              </>
            )}
            {status === "failed" && (
              <Box flexDirection="column">
                <Text color={colors.error}>{icons.cross} {command ? `Command failed: ${command}` : "No start command found"}</Text>
                {!command && <Text color={colors.textDim}>Add "dev" or "start" script to package.json</Text>}
                {output.slice(-10).map((line, i) => (
                  <Text key={i} color={colors.error}>{line}</Text>
                ))}
              </Box>
            )}
            {status === "stopped" && (
              <Text color={colors.warning}>{icons.warning} Process exited</Text>
            )}
          </Box>
        </Panel>

        <Box flexDirection="column" width="35%">
          <Panel title="Info" active={activePanel === 1}>
            <Box flexDirection="column">
              <Text color={colors.text}>{icons.dot} PM: <Text color={colors.info}>{scan.packageManager || "none"}</Text></Text>
              <Text color={colors.text}>{icons.dot} Framework: <Text color={colors.info}>{scan.framework || "none"}</Text></Text>
              <Text color={colors.text}>{icons.dot} Scripts:</Text>
              {Object.entries(scan.scripts).slice(0, 8).map(([name, cmd]) => (
                <Text key={name} color={colors.textDim}>  {name}: {(cmd as string).slice(0, 25)}</Text>
              ))}
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

      <ChatInput active={activePanel === 2} onSubmit={handleChat} placeholder="Ask about running the project..." />
      <StatusBar
        stepProgress={status === "running" ? `${output.length} lines` : status}
        aiStatus={command || undefined}
      />
    </Box>
  );
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
