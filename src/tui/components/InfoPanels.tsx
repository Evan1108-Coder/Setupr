import React from "react";
import { Box, Text } from "ink";
import { colors, getBorderStyle, icons } from "../theme.js";
import type { SetupStep } from "../../ai/planner.js";
import type { ScanResult } from "../../scanner/index.js";
import type { EnvVar, ServiceInfo } from "../../state/store.js";

interface InfoPanelsProps {
  steps: SetupStep[];
  currentStepIndex: number;
  scan: ScanResult | null;
  totalPackages: number;
  installedPackages: number;
  deprecatedCount: number;
  vulnerabilities: { high: number; moderate: number; low: number };
  lockSynced: boolean;
  envVars: EnvVar[];
  services: ServiceInfo[];
}

function PanelColumn({ title, children, width }: { title: string; children: React.ReactNode; width?: string }) {
  return (
    <Box flexDirection="column" width={width} borderStyle={getBorderStyle("panel")} borderColor={colors.border} paddingX={1} minWidth={0}>
      <Text color={colors.heading} bold wrap="truncate">{title}</Text>
      {children}
    </Box>
  );
}

function Row({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Box justifyContent="space-between" width="100%" minWidth={0}>
      <Box flexShrink={0} marginRight={1}>
        <Text color={colors.label}>{label}</Text>
      </Box>
      <Box flexShrink={1} minWidth={0}>
        <Text color={color || colors.value} wrap="truncate">{String(value)}</Text>
      </Box>
    </Box>
  );
}

export function InfoPanels({
  steps,
  currentStepIndex,
  scan,
  totalPackages,
  installedPackages,
  deprecatedCount,
  vulnerabilities,
  lockSynced,
  envVars,
  services,
}: InfoPanelsProps) {
  const autoFilled = envVars.filter((v) => v.status === "auto").length;
  const needInput = envVars.filter((v) => v.status === "pending").length;
  const skipped = envVars.filter((v) => v.status === "skipped").length;

  return (
    <Box flexDirection="row" width="100%">
      {/* STEPS column */}
      <Box flexDirection="column" width="14%" borderStyle={getBorderStyle("panel")} borderColor={colors.border} paddingX={1} minWidth={0}>
        <Text color={colors.heading} bold wrap="truncate">STEPS</Text>
        {steps.map((step, i) => {
          const icon = step.status === "done" ? icons.check
            : step.status === "running" ? icons.arrowRight
            : step.status === "failed" ? icons.cross
            : icons.circle;
          const statusColor = step.status === "done" ? colors.success
            : step.status === "running" ? colors.accent
            : step.status === "failed" ? colors.error
            : colors.textDim;
          return (
            <Box key={step.id} minWidth={0}>
              <Text color={statusColor} wrap="truncate">{i === currentStepIndex ? icons.arrowRight : icon} {step.label}</Text>
            </Box>
          );
        })}
      </Box>

      {/* PROJECT column */}
      <PanelColumn title="PROJECT" width="18%">
        <Row label="Name" value={scan?.framework ? scan.framework.toLowerCase() : "project"} />
        <Row label="Root" value={truncPath()} />
        <Row label="Framework" value={scan?.framework || "—"} />
        <Row label="Language" value={scan?.language || "—"} />
        <Row label="Pkg Manager" value={scan?.packageManager || "—"} />
      </PanelColumn>

      {/* DEPENDENCIES column */}
      <PanelColumn title="DEPENDENCIES" width="18%">
        <Row label="Total Pkgs" value={totalPackages} />
        <Row label="Installed" value={`${installedPackages} / ${totalPackages}`} />
        <Row label="Deprecated" value={deprecatedCount} color={deprecatedCount > 0 ? colors.warning : colors.textDim} />
        {(vulnerabilities.high > 0 || vulnerabilities.moderate > 0) && (
          <Row
            label="Vulnerabilities"
            value={`${vulnerabilities.high} high, ${vulnerabilities.moderate} moderate`}
            color={vulnerabilities.high > 0 ? colors.error : colors.warning}
          />
        )}
        <Row label="Lock File" value={lockSynced ? "✓ synced" : "—"} color={lockSynced ? colors.success : colors.textDim} />
      </PanelColumn>

      {/* ENVIRONMENT column */}
      <PanelColumn title="ENVIRONMENT" width="18%">
        <Row label="Vars Total" value={envVars.length} />
        <Row label="Auto-filled" value={autoFilled} />
        <Row label="Need Input" value={needInput} color={needInput > 0 ? colors.warning : colors.textDim} />
        <Row label="Skipped" value={skipped} />
        <Row label=".env File" value={envVars.length > 0 ? "creating" : "—"} color={colors.info} />
      </PanelColumn>

      {/* SERVICES column */}
      <PanelColumn title="SERVICES" width="18%">
        {services.length > 0 ? (
          services.map((svc) => (
            <Box key={svc.name} justifyContent="space-between" width="100%" minWidth={0}>
              <Box flexShrink={1} minWidth={0} marginRight={1}>
                <Text color={colors.label} wrap="truncate">{svc.name}</Text>
              </Box>
              <Text color={getServiceColor(svc.status)} wrap="truncate">
                {svc.status}{svc.port ? ` :${svc.port}` : ""}
              </Text>
            </Box>
          ))
        ) : (
          <Text color={colors.textDim}>No services detected</Text>
        )}
      </PanelColumn>
    </Box>
  );
}

function getServiceColor(status: ServiceInfo["status"]): string {
  switch (status) {
    case "ready": return colors.success;
    case "running": return colors.success;
    case "starting": return colors.warning;
    case "pending": return colors.textDim;
    case "error": return colors.error;
  }
}

function truncPath(): string {
  const cwd = process.cwd();
  const home = process.env.HOME || "";
  if (cwd.startsWith(home)) return "~" + cwd.slice(home.length);
  return cwd;
}
