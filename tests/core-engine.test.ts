import { mkdtemp, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { describe, expect, it } from "vitest";
import { createProjectEngine, redactObject, redactText } from "../src/core/engine.js";
import { runProjectCommandOperation } from "../src/core/operations.js";
import { readRecentHistoryEvents, readRecentLogEvents } from "../src/state/project.js";

async function tempProject() {
  const dir = await mkdtemp(join(tmpdir(), "setupr-core-engine-"));
  await writeFile(join(dir, "package.json"), JSON.stringify({ scripts: { test: "node -e \"console.log('ok')\"" } }, null, 2));
  return dir;
}

describe("ProjectEngine", () => {
  it("loads scan, context, checkpoints, and history through one lazy snapshot", async () => {
    const cwd = await tempProject();
    const engine = createProjectEngine({ cwd, command: "status", mode: "plain" });

    await engine.recordCommand({ type: "command.start", extra: { token: "sk-secret-value" } });
    const snapshot = await engine.snapshot({ includeScan: true, includeContext: true, historyLimit: 5 });

    expect(snapshot.cwd).toBe(cwd);
    expect(snapshot.command.command).toBe("status");
    expect(snapshot.scan?.language).toBe("JavaScript");
    expect(snapshot.context?.cwd).toBe(cwd);
    expect(snapshot.history.at(-1)?.type).toBe("command.start");
    expect(JSON.stringify(snapshot.history)).not.toContain("sk-secret-value");
  });

  it("redacts secrets in text and nested objects before persistence", () => {
    expect(redactText("OPENAI_API_KEY=sk-abcdef123456")).toContain("OPENAI_API_KEY=****");
    expect(redactObject({ nested: { githubToken: "github_pat_abcdef123456" } })).toEqual({
      nested: { githubToken: "github_pat_****" },
    });
  });
});

describe("runProjectCommandOperation", () => {
  it("supports dry-run without executing the shell command", async () => {
    const cwd = await tempProject();
    const target = join(cwd, "should-not-exist");
    const result = await runProjectCommandOperation({
      cwd,
      ownerCommand: "run",
      shellCommand: `node -e "require('fs').writeFileSync('${target}', 'bad')"`,
      dryRun: true,
      quiet: true,
    });

    await expect(readFile(target, "utf-8")).rejects.toThrow();
    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
  });

  it("blocks critical commands through the shared safety policy", async () => {
    const cwd = await tempProject();
    const result = await runProjectCommandOperation({
      cwd,
      ownerCommand: "clean",
      shellCommand: "rm -rf /",
      quiet: true,
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("COMMAND_ABORTED");
    const history = await readRecentHistoryEvents(cwd, 5);
    expect(history.some((event) => event.type === "command.error")).toBe(true);
  });

  it("records successful operation logs without leaking secrets", async () => {
    const cwd = await tempProject();
    const result = await runProjectCommandOperation({
      cwd,
      ownerCommand: "run",
      shellCommand: "node -e \"console.log('TOKEN=sk-secret-value')\"",
      quiet: true,
    });

    expect(result.success).toBe(true);
    const logs = await readRecentLogEvents(cwd, 10);
    expect(JSON.stringify(logs)).not.toContain("sk-secret-value");
  });
});
