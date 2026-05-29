import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { listManagedProcesses, readProcessLog, stopManagedProcess } from "../src/processes/manager.js";

describe("managed process registry", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "setupr-process-registry-"));
    await mkdir(join(tempDir, ".setupr", "logs", "processes"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("lists process registry entries and marks dead pids as crashed", async () => {
    await writeFile(join(tempDir, ".setupr", "processes.json"), JSON.stringify([
      {
        id: "dev",
        name: "dev",
        command: "npm run dev",
        cwd: tempDir,
        pid: 99999999,
        status: "running",
        startedAt: Date.now(),
        logFile: join(tempDir, ".setupr", "logs", "processes", "dev.log"),
      },
    ]));

    const processes = await listManagedProcesses(tempDir);

    expect(processes[0].status).toBe("crashed");
  });

  it("reads managed process logs and stops registry entries", async () => {
    const logFile = join(tempDir, ".setupr", "logs", "processes", "dev.log");
    await writeFile(logFile, "one\ntwo\nthree\n");
    await writeFile(join(tempDir, ".setupr", "processes.json"), JSON.stringify([
      {
        id: "dev",
        name: "dev",
        command: "npm run dev",
        cwd: tempDir,
        status: "crashed",
        startedAt: Date.now(),
        logFile,
      },
    ]));

    const log = await readProcessLog(tempDir, "dev", 2);
    expect(log.content).toBe("two\nthree");

    const stopped = await stopManagedProcess(tempDir, "dev", { force: true });
    expect(stopped[0].status).toBe("stopped");
  });
});
