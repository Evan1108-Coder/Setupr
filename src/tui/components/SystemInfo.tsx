import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";
import * as os from "os";

export function SystemInfo() {
  const platform = os.platform();
  const release = os.release();
  const nodeVersion = process.version;
  const arch = os.arch();
  const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(0);
  const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(1);
  const shell = process.env.SHELL?.split("/").pop() || "sh";

  let osLabel = "Linux";
  if (platform === "darwin") osLabel = `macOS ${getMacVersion(release)}`;
  else if (platform === "win32") osLabel = `Windows`;

  return (
    <Box flexDirection="column" width="12%">
      <Text color={colors.textDim}>OS {osLabel}</Text>
      <Text color={colors.textDim}>Node {nodeVersion}</Text>
      <Text color={colors.textDim}>Shell {shell}</Text>
      <Text color={colors.textDim}>Arch {arch}</Text>
      <Text color={colors.textDim}>RAM {freeMem}/{totalMem} GB</Text>
    </Box>
  );
}

function getMacVersion(release: string): string {
  const major = parseInt(release.split(".")[0] || "0", 10);
  if (major >= 25) return "15";
  if (major >= 24) return "14";
  if (major >= 23) return "13";
  if (major >= 22) return "12";
  return "";
}
