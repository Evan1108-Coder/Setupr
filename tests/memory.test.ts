import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync } from "fs";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { knownCommandNames } from "../src/cli/commandRegistry.js";
import { runNonTUICommand } from "../src/commands/plain/router.js";
import { appendHistoryEvent } from "../src/state/project.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "setupr-memory-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  process.exitCode = undefined;
});

describe("project memory commands", () => {
  it("registers project memory commands for the CLI", () => {
    const known = knownCommandNames();
    expect(known.has("notes")).toBe(true);
    expect(known.has("history")).toBe(true);
    expect(known.has("context")).toBe(true);
  });

  it("adds, lists, and removes project notes under .setupr", async () => {
    const outputs = await captureConsole(async () => {
      await runNonTUICommand("notes", "add", tempDir, { args: ["Prefer", "pnpm", "for", "installs"] });
      await runNonTUICommand("notes", "list", tempDir, { args: [] });
    });

    expect(outputs.join("\n")).toContain("n001");
    expect(outputs.join("\n")).toContain("Prefer pnpm for installs");

    const notesPath = join(tempDir, ".setupr", "notes.json");
    expect(existsSync(notesPath)).toBe(true);
    const notesFile = JSON.parse(await readFile(notesPath, "utf-8"));
    expect(notesFile.notes).toMatchObject([{ id: "n001", text: "Prefer pnpm for installs" }]);

    await captureConsole(async () => {
      await runNonTUICommand("notes", "remove", tempDir, { args: ["n001"] });
    });

    const updated = JSON.parse(await readFile(notesPath, "utf-8"));
    expect(updated.notes).toEqual([]);
  });

  it("shows recent project history from the local history stream", async () => {
    await appendHistoryEvent(tempDir, { type: "command.start", timestamp: 1000, message: "setupr setup" });
    await appendHistoryEvent(tempDir, { type: "command.finish", timestamp: 2000, message: "setup finished" });

    const outputs = await captureConsole(async () => {
      await runNonTUICommand("history", "list", tempDir, { args: ["1"] });
    });

    const text = outputs.join("\n");
    expect(text).toContain("command.finish");
    expect(text).toContain("setup finished");
    expect(text).not.toContain("setupr setup");
  });

  it("exports and imports team context without touching plugin files", async () => {
    await captureConsole(async () => {
      await runNonTUICommand("notes", "add", tempDir, { args: ["Docker compose uses postgres on 5433"] });
    });
    await appendHistoryEvent(tempDir, { type: "command.finish", timestamp: 3000, message: "doctor finished" });

    const bundlePath = join(tempDir, "memory.json");
    await captureConsole(async () => {
      await runNonTUICommand("context", "export", tempDir, { args: [bundlePath] });
    });

    const bundle = JSON.parse(await readFile(bundlePath, "utf-8"));
    expect(bundle.kind).toBe("setupr-project-memory");
    expect(bundle.notes).toHaveLength(1);
    expect(bundle.history.some((event: { message?: string }) => event.message === "doctor finished")).toBe(true);

    const targetDir = await mkdtemp(join(tmpdir(), "setupr-memory-import-"));
    try {
      await writeFile(join(targetDir, ".gitkeep"), "");
      await captureConsole(async () => {
        await runNonTUICommand("context", "import", targetDir, { args: [bundlePath] });
      });

      const importedNotes = JSON.parse(await readFile(join(targetDir, ".setupr", "notes.json"), "utf-8"));
      expect(importedNotes.notes).toMatchObject([{ text: "Docker compose uses postgres on 5433" }]);
      expect(existsSync(join(targetDir, ".setupr", "imported-context.json"))).toBe(true);
      expect(existsSync(join(targetDir, ".setupr", "plugins"))).toBe(false);
    } finally {
      await rm(targetDir, { recursive: true, force: true });
    }
  });

  it("reports context summary as json", async () => {
    await captureConsole(async () => {
      await runNonTUICommand("notes", "add", tempDir, { args: ["Use Node 22"] });
    });

    const outputs = await captureConsole(async () => {
      await runNonTUICommand("context", undefined, tempDir, { args: [], json: true });
    });

    expect(JSON.parse(outputs.join("\n"))).toMatchObject({ notes: 1, storage: ".setupr" });
  });
});

async function captureConsole(fn: () => Promise<void>): Promise<string[]> {
  const log = console.log;
  const outputs: string[] = [];
  console.log = (...args: unknown[]) => outputs.push(args.join(" "));
  try {
    await fn();
    return outputs;
  } finally {
    console.log = log;
  }
}
