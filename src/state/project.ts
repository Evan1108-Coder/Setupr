import { appendFile, mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

export const PROJECT_STATE_DIR = ".setupr";
export const PROJECT_STATE_FILE = "state.json";
export const PROJECT_NOTES_FILE = "notes.json";
export const PROJECT_IMPORTED_CONTEXT_FILE = "imported-context.json";
export const PROJECT_HISTORY_FILE = "history.jsonl";
export const PROJECT_LOG_FILE = "log.jsonl";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface ProjectEvent {
  id?: string;
  type: string;
  timestamp: number;
  message?: string;
  data?: JsonValue;
}

export type ProjectEventInput = Omit<ProjectEvent, "timestamp"> & {
  timestamp?: number;
};

export type ProjectJsonFile = typeof PROJECT_STATE_FILE | typeof PROJECT_NOTES_FILE | typeof PROJECT_IMPORTED_CONTEXT_FILE | string;
export type ProjectJsonlFile = typeof PROJECT_HISTORY_FILE | typeof PROJECT_LOG_FILE;
export type ProjectPersistenceFile = ProjectJsonFile | ProjectJsonlFile;

export function projectStateDir(cwd: string): string {
  return join(cwd, PROJECT_STATE_DIR);
}

export function projectStatePath(cwd: string, fileName: ProjectPersistenceFile): string {
  return join(projectStateDir(cwd), fileName);
}

export async function ensureProjectStateDir(cwd: string): Promise<string> {
  const dir = projectStateDir(cwd);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function readProjectJson<T>(
  cwd: string,
  fileName: ProjectJsonFile,
  fallback: T
): Promise<T> {
  try {
    const raw = await readFile(projectStatePath(cwd, fileName), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeProjectJson(
  cwd: string,
  fileName: ProjectJsonFile,
  value: JsonValue
): Promise<void> {
  await ensureProjectStateDir(cwd);

  await writeFile(projectStatePath(cwd, fileName), `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

export function readProjectState<T>(
  cwd: string,
  fallback: T
): Promise<T> {
  return readProjectJson(cwd, PROJECT_STATE_FILE, fallback);
}

export function writeProjectState(cwd: string, state: JsonValue): Promise<void> {
  return writeProjectJson(cwd, PROJECT_STATE_FILE, state);
}

export async function readProjectJsonl<T>(
  cwd: string,
  fileName: ProjectJsonlFile
): Promise<T[]> {
  try {
    const raw = await readFile(projectStatePath(cwd, fileName), "utf-8");
    const values: T[] = [];

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        values.push(JSON.parse(trimmed) as T);
      } catch {
        continue;
      }
    }

    return values;
  } catch {
    return [];
  }
}

export async function writeProjectJsonl(
  cwd: string,
  fileName: ProjectJsonlFile,
  values: unknown[]
): Promise<void> {
  await ensureProjectStateDir(cwd);

  const content = values
    .map((value) => JSON.stringify(value))
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  await writeFile(projectStatePath(cwd, fileName), content ? `${content}\n` : "", "utf-8");
}

export async function appendProjectEvent(
  cwd: string,
  event: ProjectEventInput,
  fileName: ProjectJsonlFile = PROJECT_HISTORY_FILE
): Promise<ProjectEvent> {
  await ensureProjectStateDir(cwd);

  const stored: ProjectEvent = {
    ...event,
    timestamp: event.timestamp ?? Date.now(),
  };

  await appendFile(projectStatePath(cwd, fileName), `${JSON.stringify(stored)}\n`, "utf-8");
  return stored;
}

export async function readRecentProjectEvents(
  cwd: string,
  limit = 50,
  fileName: ProjectJsonlFile = PROJECT_HISTORY_FILE
): Promise<ProjectEvent[]> {
  if (limit <= 0) return [];

  const events = await readProjectJsonl<ProjectEvent>(cwd, fileName);
  return events.slice(-limit);
}

export function appendHistoryEvent(
  cwd: string,
  event: ProjectEventInput
): Promise<ProjectEvent> {
  return appendProjectEvent(cwd, event, PROJECT_HISTORY_FILE);
}

export function readRecentHistoryEvents(cwd: string, limit = 50): Promise<ProjectEvent[]> {
  return readRecentStoredEvents(cwd, limit, PROJECT_HISTORY_FILE);
}

export function appendLogEvent(
  cwd: string,
  event: ProjectEventInput
): Promise<ProjectEvent> {
  return appendProjectEvent(cwd, event, PROJECT_LOG_FILE);
}

export function readRecentLogEvents(cwd: string, limit = 50): Promise<ProjectEvent[]> {
  return readRecentStoredEvents(cwd, limit, PROJECT_LOG_FILE);
}

async function readRecentStoredEvents(
  cwd: string,
  limit: number,
  fileName: ProjectJsonlFile
): Promise<ProjectEvent[]> {
  if (limit <= 0) return [];
  const events = (await readProjectJsonl<unknown>(cwd, fileName)).slice(-limit);
  return events
    .map((event) => normalizeStoredEvent(event))
    .filter((event): event is ProjectEvent => Boolean(event));
}

function normalizeStoredEvent(event: unknown): ProjectEvent | null {
  if (!event || typeof event !== "object" || Array.isArray(event)) return null;
  const value = event as JsonObject;
  const type = stringValue(value.type)
    || (stringValue(value.status) ? `history.${stringValue(value.status)}` : "")
    || (stringValue(value.command) ? "command" : "history");
  const message = stringValue(value.message) || stringValue(value.command) || type;

  return {
    type,
    timestamp: typeof value.timestamp === "number" ? value.timestamp : Date.now(),
    message,
    data: value.data,
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
