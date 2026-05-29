import chalk from "chalk";
import { readFile, writeFile } from "fs/promises";
import { basename, isAbsolute, join } from "path";
import { createSetuprError, printPlainError } from "../../errors/index.js";
import {
  appendHistoryEvent,
  PROJECT_HISTORY_FILE,
  PROJECT_IMPORTED_CONTEXT_FILE,
  PROJECT_NOTES_FILE,
  readProjectJson,
  readProjectJsonl,
  readRecentHistoryEvents,
  writeProjectJson,
  type JsonObject,
  type ProjectEvent,
} from "../../state/project.js";

interface Flags {
  args?: string[];
  force?: boolean;
  json?: boolean;
}

interface ProjectNote {
  id: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
}

interface ProjectNotesFile {
  version: 1;
  notes: ProjectNote[];
}

interface ProjectMemoryBundle {
  kind: "setupr-project-memory";
  version: 1;
  project: string;
  exportedAt: string;
  notes: ProjectNote[];
  history: ProjectEvent[];
}

const EMPTY_NOTES: ProjectNotesFile = { version: 1, notes: [] };

export async function cmdNotes(sub: string | undefined, cwd: string, flags: Flags): Promise<void> {
  switch (sub || "list") {
    case "add":
      await addNote(cwd, flags);
      break;
    case "list":
      await listNotes(cwd, flags);
      break;
    case "remove":
    case "rm":
    case "delete":
      await removeNote(cwd, flags);
      break;
    case "clear":
      await clearNotes(cwd, flags);
      break;
    default:
      printPlainError(createSetuprError({
        code: "UNKNOWN_SUBCOMMAND",
        command: "notes",
        subcommand: sub,
        cwd,
        details: ["Valid subcommands: add, list, remove, clear."],
      }));
  }
}

export async function cmdHistory(sub: string | undefined, cwd: string, flags: Flags): Promise<void> {
  if (sub === "clear") {
    printPlainError(createSetuprError({
      code: "UNKNOWN_SUBCOMMAND",
      command: "history",
      subcommand: sub,
      cwd,
      details: ["History is append-only. Use context export to share it, or remove .setupr/history.jsonl manually if needed."],
    }));
    return;
  }

  if (sub && sub !== "list" && !isPositiveInteger(sub)) {
    printPlainError(createSetuprError({
      code: "UNKNOWN_SUBCOMMAND",
      command: "history",
      subcommand: sub,
      cwd,
      details: ["Valid usage: history [list] [limit]."],
    }));
    return;
  }

  const limit = parseLimit(sub === "list" ? flags.args?.[0] : sub, 20);
  const events = await readRecentHistoryEvents(cwd, limit);

  if (flags.json) {
    console.log(JSON.stringify(events, null, 2));
    return;
  }

  if (events.length === 0) {
    console.log(chalk.dim("No project history recorded yet."));
    return;
  }

  console.log(chalk.blue.bold("\n  Project History\n"));
  for (const event of events) {
    console.log(`  ${chalk.green(formatTime(event.timestamp))} ${event.type}${event.message ? chalk.dim(` - ${event.message}`) : ""}`);
  }
  console.log("");
}

export async function cmdContext(sub: string | undefined, cwd: string, flags: Flags): Promise<void> {
  switch (sub || "show") {
    case "show":
      await showContext(cwd, flags);
      break;
    case "export":
    case "export-memory":
      await exportContext(cwd, flags);
      break;
    case "import":
    case "import-memory":
      await importContext(cwd, flags);
      break;
    default:
      printPlainError(createSetuprError({
        code: "UNKNOWN_SUBCOMMAND",
        command: "context",
        subcommand: sub,
        cwd,
        details: ["Valid subcommands: show, export, import."],
      }));
  }
}

async function addNote(cwd: string, flags: Flags): Promise<void> {
  const text = (flags.args || []).join(" ").trim();
  if (!text) {
    printPlainError(createSetuprError({
      code: "NON_INTERACTIVE_INPUT_REQUIRED",
      command: "notes",
      subcommand: "add",
      cwd,
      details: ["Usage: setupr notes add <text>"],
    }));
    return;
  }

  const notesFile = await readNotes(cwd);
  const now = new Date().toISOString();
  const note: ProjectNote = {
    id: nextNoteId(notesFile.notes),
    text,
    createdAt: now,
  };
  notesFile.notes.push(note);
  await writeNotes(cwd, notesFile);
  await appendHistoryEvent(cwd, {
    type: "memory.note.add",
    message: `Added note ${note.id}`,
    data: { id: note.id, text: note.text },
  }).catch(() => undefined);

  console.log(chalk.green(`✓ Added note ${note.id}`));
}

async function listNotes(cwd: string, flags: Flags): Promise<void> {
  const notesFile = await readNotes(cwd);
  if (flags.json) {
    console.log(JSON.stringify(notesFile, null, 2));
    return;
  }

  if (notesFile.notes.length === 0) {
    console.log(chalk.dim("No project notes yet."));
    return;
  }

  console.log(chalk.blue.bold("\n  Project Notes\n"));
  for (const note of notesFile.notes) {
    console.log(`  ${chalk.green(note.id)} ${note.text}`);
    console.log(chalk.dim(`     ${note.updatedAt ? "updated" : "created"} ${note.updatedAt || note.createdAt}`));
  }
  console.log("");
}

async function removeNote(cwd: string, flags: Flags): Promise<void> {
  const id = flags.args?.[0]?.trim();
  if (!id) {
    printPlainError(createSetuprError({
      code: "NON_INTERACTIVE_INPUT_REQUIRED",
      command: "notes",
      subcommand: "remove",
      cwd,
      details: ["Usage: setupr notes remove <id>"],
    }));
    return;
  }

  const notesFile = await readNotes(cwd);
  const nextNotes = notesFile.notes.filter((note) => note.id !== id);
  if (nextNotes.length === notesFile.notes.length) {
    console.log(chalk.yellow(`No note found with id ${id}.`));
    return;
  }

  await writeNotes(cwd, { version: 1, notes: nextNotes });
  await appendHistoryEvent(cwd, {
    type: "memory.note.remove",
    message: `Removed note ${id}`,
    data: { id },
  }).catch(() => undefined);

  console.log(chalk.green(`✓ Removed note ${id}`));
}

async function clearNotes(cwd: string, flags: Flags): Promise<void> {
  if (!flags.force) {
    printPlainError(createSetuprError({
      code: "NON_INTERACTIVE_CONFIRMATION_REQUIRED",
      command: "notes",
      subcommand: "clear",
      cwd,
      details: ["Rerun with --force to clear project notes."],
    }));
    return;
  }

  await writeNotes(cwd, EMPTY_NOTES);
  await appendHistoryEvent(cwd, {
    type: "memory.note.clear",
    message: "Cleared project notes",
  }).catch(() => undefined);
  console.log(chalk.green("✓ Cleared project notes"));
}

async function showContext(cwd: string, flags: Flags): Promise<void> {
  const notesFile = await readNotes(cwd);
  const history = await readProjectJsonl<ProjectEvent>(cwd, PROJECT_HISTORY_FILE);
  const summary = {
    notes: notesFile.notes.length,
    history: history.length,
    storage: ".setupr",
  };

  if (flags.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(chalk.blue.bold("\n  Project Context\n"));
  console.log(`  Notes:   ${chalk.white(String(summary.notes))}`);
  console.log(`  History: ${chalk.white(String(summary.history))}`);
  console.log(chalk.dim("  Storage: .setupr"));
  console.log("");
}

async function exportContext(cwd: string, flags: Flags): Promise<void> {
  const outputName = flags.args?.[0] || `${basename(cwd)}.setupr-context.json`;
  const outputPath = resolvePath(cwd, outputName);

  try {
    const notesFile = await readNotes(cwd);
    const history = await readProjectJsonl<ProjectEvent>(cwd, PROJECT_HISTORY_FILE);
    const bundle: ProjectMemoryBundle = {
      kind: "setupr-project-memory",
      version: 1,
      project: basename(cwd),
      exportedAt: new Date().toISOString(),
      notes: notesFile.notes,
      history,
    };

    await writeFileStrict(outputPath, bundle);
    console.log(chalk.green(`✓ Exported project context to ${outputName}`));
    console.log(chalk.dim(`  Notes: ${bundle.notes.length}`));
    console.log(chalk.dim(`  History events: ${bundle.history.length}`));
  } catch (err) {
    printPlainError(createSetuprError({
      code: "SHARE_EXPORT_FAILED",
      command: "context",
      subcommand: "export",
      cwd,
      details: [err instanceof Error ? err.message : String(err)],
    }));
  }
}

async function importContext(cwd: string, flags: Flags): Promise<void> {
  const inputName = flags.args?.[0];
  if (!inputName) {
    printPlainError(createSetuprError({
      code: "SHARE_IMPORT_FAILED",
      command: "context",
      subcommand: "import",
      cwd,
      details: ["Usage: setupr context import <file>"],
    }));
    return;
  }

  try {
    const raw = await readFile(resolvePath(cwd, inputName), "utf-8");
    const bundle = parseMemoryBundle(JSON.parse(raw));
    const existing = await readNotes(cwd);
    const merged = mergeNotes(existing.notes, bundle.notes);

    await writeNotes(cwd, { version: 1, notes: merged.notes });
    await writeProjectJson(cwd, PROJECT_IMPORTED_CONTEXT_FILE, bundleToJson(bundle));
    await appendHistoryEvent(cwd, {
      type: "memory.context.import",
      message: `Imported project context from ${inputName}`,
      data: {
        sourceProject: bundle.project,
        importedNotes: merged.imported,
        skippedNotes: merged.skipped,
        sourceHistoryEvents: bundle.history.length,
      },
    }).catch(() => undefined);

    console.log(chalk.green(`✓ Imported project context from ${inputName}`));
    console.log(chalk.dim(`  Added notes: ${merged.imported}`));
    console.log(chalk.dim(`  Skipped duplicate notes: ${merged.skipped}`));
    console.log(chalk.dim("  Saved source bundle to .setupr/imported-context.json"));
  } catch (err) {
    printPlainError(createSetuprError({
      code: "SHARE_IMPORT_FAILED",
      command: "context",
      subcommand: "import",
      cwd,
      details: [err instanceof Error ? err.message : String(err)],
    }));
  }
}

async function readNotes(cwd: string): Promise<ProjectNotesFile> {
  const value = await readProjectJson<unknown>(cwd, PROJECT_NOTES_FILE, EMPTY_NOTES);
  if (!isNotesFile(value)) return { version: 1, notes: [] };
  return { version: 1, notes: value.notes.map((note) => ({ ...note })) };
}

function writeNotes(cwd: string, notesFile: ProjectNotesFile): Promise<void> {
  return writeProjectJson(cwd, PROJECT_NOTES_FILE, notesFileToJson(notesFile));
}

function nextNoteId(notes: ProjectNote[]): string {
  const max = notes.reduce((highest, note) => {
    const match = /^n(\d+)$/.exec(note.id);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `n${String(max + 1).padStart(3, "0")}`;
}

function mergeNotes(existing: ProjectNote[], incoming: ProjectNote[]): { notes: ProjectNote[]; imported: number; skipped: number } {
  const notes = [...existing];
  const seenText = new Set(existing.map((note) => normalizeNoteText(note.text)));
  let imported = 0;
  let skipped = 0;

  for (const note of incoming) {
    const normalized = normalizeNoteText(note.text);
    if (seenText.has(normalized)) {
      skipped += 1;
      continue;
    }

    seenText.add(normalized);
    notes.push({
      ...note,
      id: noteIdAvailable(note.id, notes) ? note.id : nextNoteId(notes),
    });
    imported += 1;
  }

  return { notes, imported, skipped };
}

function noteIdAvailable(id: string, notes: ProjectNote[]): boolean {
  return /^n\d+$/.test(id) && !notes.some((note) => note.id === id);
}

function normalizeNoteText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseMemoryBundle(value: unknown): ProjectMemoryBundle {
  if (!isObject(value) || value.kind !== "setupr-project-memory" || value.version !== 1) {
    throw new Error("Invalid memory bundle: expected kind setupr-project-memory version 1.");
  }

  return {
    kind: "setupr-project-memory",
    version: 1,
    project: typeof value.project === "string" ? value.project : "unknown",
    exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : "",
    notes: Array.isArray(value.notes) ? value.notes.filter(isProjectNote) : [],
    history: Array.isArray(value.history) ? value.history.filter(isProjectEvent) : [],
  };
}

function isNotesFile(value: unknown): value is ProjectNotesFile {
  return isObject(value)
    && value.version === 1
    && Array.isArray(value.notes)
    && value.notes.every(isProjectNote);
}

function isProjectNote(value: unknown): value is ProjectNote {
  return isObject(value)
    && typeof value.id === "string"
    && typeof value.text === "string"
    && value.text.trim().length > 0
    && typeof value.createdAt === "string"
    && (value.updatedAt === undefined || typeof value.updatedAt === "string");
}

function isProjectEvent(value: unknown): value is ProjectEvent {
  return isObject(value)
    && typeof value.type === "string"
    && typeof value.timestamp === "number"
    && (value.message === undefined || typeof value.message === "string");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function notesFileToJson(notesFile: ProjectNotesFile): JsonObject {
  return {
    version: notesFile.version,
    notes: notesFile.notes.map((note) => noteToJson(note)),
  };
}

function bundleToJson(bundle: ProjectMemoryBundle): JsonObject {
  return {
    kind: bundle.kind,
    version: bundle.version,
    project: bundle.project,
    exportedAt: bundle.exportedAt,
    notes: bundle.notes.map((note) => noteToJson(note)),
    history: bundle.history.map(projectEventToJson),
  };
}

function noteToJson(note: ProjectNote): JsonObject {
  return {
    id: note.id,
    text: note.text,
    createdAt: note.createdAt,
    ...(note.updatedAt ? { updatedAt: note.updatedAt } : {}),
  };
}

function projectEventToJson(event: ProjectEvent): JsonObject {
  return {
    ...(event.id ? { id: event.id } : {}),
    type: event.type,
    timestamp: event.timestamp,
    ...(event.message ? { message: event.message } : {}),
    ...(event.data !== undefined ? { data: event.data } : {}),
  };
}

function writeFileStrict(path: string, value: ProjectMemoryBundle): Promise<void> {
  return writeFile(path, `${JSON.stringify(bundleToJson(value), null, 2)}\n`, "utf-8");
}

function resolvePath(cwd: string, file: string): string {
  return isAbsolute(file) ? file : join(cwd, file);
}

function parseLimit(value: string | undefined, fallback: number): number {
  if (!value || !isPositiveInteger(value)) return fallback;
  return Math.max(1, Math.min(500, Number(value)));
}

function isPositiveInteger(value: string): boolean {
  return /^\d+$/.test(value) && Number(value) > 0;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toISOString();
}
