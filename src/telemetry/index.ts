import { loadConfig, saveConfig } from "../state/config.js";

interface TelemetryEvent {
  event: string;
  command?: string;
  timestamp: number;
  duration?: number;
  success?: boolean;
  metadata?: Record<string, string | number | boolean>;
}

let sessionEvents: TelemetryEvent[] = [];
const sessionStart = Date.now();

export function trackEvent(event: string, metadata?: TelemetryEvent["metadata"]): void {
  sessionEvents.push({
    event,
    timestamp: Date.now(),
    metadata,
  });
}

export function trackCommand(command: string, success: boolean, duration: number): void {
  sessionEvents.push({
    event: "command_run",
    command,
    timestamp: Date.now(),
    duration,
    success,
  });
}

export async function isTelemetryEnabled(): Promise<boolean> {
  const config = await loadConfig();
  return config.preferences?.telemetry === true;
}

export async function enableTelemetry(): Promise<void> {
  const config = await loadConfig();
  config.preferences = config.preferences || {};
  config.preferences.telemetry = true;
  if (!config.telemetryId) {
    config.telemetryId = generateAnonymousId();
  }
  await saveConfig(config);
}

export async function disableTelemetry(): Promise<void> {
  const config = await loadConfig();
  config.preferences = config.preferences || {};
  config.preferences.telemetry = false;
  await saveConfig(config);
}

export async function flushTelemetry(): Promise<void> {
  if (sessionEvents.length === 0) return;

  const enabled = await isTelemetryEnabled();
  if (!enabled) {
    sessionEvents = [];
    return;
  }

  const config = await loadConfig();
  const payload = {
    anonymousId: config.telemetryId || "unknown",
    sessionDuration: Date.now() - sessionStart,
    events: sessionEvents.map((e) => ({
      ...e,
      // Strip any potentially identifying info
      metadata: e.metadata
        ? Object.fromEntries(
            Object.entries(e.metadata).filter(
              ([k]) => !k.toLowerCase().includes("path") && !k.toLowerCase().includes("key")
            )
          )
        : undefined,
    })),
  };
  void payload;

  sessionEvents = [];

  // Telemetry endpoint would go here. For now, just silently discard.
  // This is opt-in and anonymous — no PII is collected.
  try {
    // Future: POST to telemetry endpoint
    // await fetch(TELEMETRY_ENDPOINT, { method: "POST", body: JSON.stringify(payload) });
  } catch {
    // Telemetry failures are always silent
  }
}

export function getSessionStats(): { events: number; duration: number } {
  return {
    events: sessionEvents.length,
    duration: Date.now() - sessionStart,
  };
}

function generateAnonymousId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}
