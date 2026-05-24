import { readFile, writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import type { SetupStep } from "../ai/planner.js";
import type { ScanResult } from "../scanner/index.js";

const CHECKPOINT_DIR = ".p-setup";
const CHECKPOINT_FILE = "checkpoint.json";

export interface Checkpoint {
  version: 1;
  timestamp: number;
  cwd: string;
  scan: ScanResult;
  steps: SetupStep[];
  currentStepIndex: number;
  completedSteps: string[];
}

export async function saveCheckpoint(
  cwd: string,
  data: Omit<Checkpoint, "version" | "timestamp">
): Promise<void> {
  const dir = join(cwd, CHECKPOINT_DIR);
  await mkdir(dir, { recursive: true });

  const checkpoint: Checkpoint = {
    version: 1,
    timestamp: Date.now(),
    ...data,
  };

  await writeFile(
    join(dir, CHECKPOINT_FILE),
    JSON.stringify(checkpoint, null, 2)
  );
}

export async function loadCheckpoint(cwd: string): Promise<Checkpoint | null> {
  try {
    const raw = await readFile(join(cwd, CHECKPOINT_DIR, CHECKPOINT_FILE), "utf-8");
    const checkpoint: Checkpoint = JSON.parse(raw);
    if (checkpoint.version !== 1) return null;
    return checkpoint;
  } catch {
    return null;
  }
}

export async function deleteCheckpoint(cwd: string): Promise<void> {
  try {
    await rm(join(cwd, CHECKPOINT_DIR, CHECKPOINT_FILE), { force: true });
  } catch {}
}

export async function hasCheckpoint(cwd: string): Promise<boolean> {
  const cp = await loadCheckpoint(cwd);
  return cp !== null;
}

export function formatCheckpointAge(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
