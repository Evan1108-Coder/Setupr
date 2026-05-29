import { spawn } from "child_process";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { basename, dirname, join } from "path";
import { scanProject } from "../scanner/index.js";
import { ensureProjectStateDir } from "../state/project.js";
import { createSetuprError } from "../errors/index.js";

export interface ManagedProcess {
  id: string;
  name: string;
  command: string;
  cwd: string;
  pid?: number;
  status: "starting" | "running" | "stopped" | "crashed";
  startedAt: number;
  stoppedAt?: number;
  exitCode?: number | null;
  autoRestart?: boolean;
  restartCount?: number;
  logFile: string;
}

const PROCESS_FILE = "processes.json";

export async function processRegistryPath(cwd: string): Promise<string> {
  return join(await ensureProjectStateDir(cwd), PROCESS_FILE);
}

export async function processLogDir(cwd: string): Promise<string> {
  const dir = join(await ensureProjectStateDir(cwd), "logs", "processes");
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function listManagedProcesses(cwd: string): Promise<ManagedProcess[]> {
  const processes = await readRegistry(cwd);
  const refreshed = processes.map(refreshProcessStatus);
  if (JSON.stringify(processes) !== JSON.stringify(refreshed)) {
    await writeRegistry(cwd, refreshed);
  }
  return refreshed;
}

export async function startManagedProcess(
  cwd: string,
  target?: string,
  options: { force?: boolean; autoRestart?: boolean } = {}
): Promise<ManagedProcess> {
  const command = await resolveStartCommand(cwd, target);
  const id = safeId(target || "dev");
  const existing = (await listManagedProcesses(cwd)).find((proc) => proc.id === id);
  if (existing?.status === "running" && !options.force) {
    throw createSetuprError({
      code: "PROCESS_ALREADY_RUNNING",
      command: "start",
      cwd,
      details: [`Process ${id} is already running with PID ${existing.pid}.`],
      nextSteps: ["Run setupr ps, setupr logs, or setupr stop first. Use --force to replace it."],
    });
  }
  if (existing?.status === "running" && options.force) {
    await stopManagedProcess(cwd, id, { force: true });
  }

  const logDir = await processLogDir(cwd);
  const logFile = join(logDir, `${id}.log`);
  const supervisor = spawn(process.execPath, [process.argv[1], "_supervise", id, command, logFile, options.autoRestart ? "restart" : "once"], {
    cwd,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, SETUPR_SUPERVISOR_CWD: cwd },
  });
  supervisor.unref();

  const entry: ManagedProcess = {
    id,
    name: target || id || basename(cwd),
    command,
    cwd,
    pid: supervisor.pid,
    status: "running",
    startedAt: Date.now(),
    autoRestart: Boolean(options.autoRestart),
    restartCount: 0,
    logFile,
  };
  await upsertProcess(cwd, entry);
  return entry;
}

export async function stopManagedProcess(cwd: string, idOrName?: string, options: { force?: boolean } = {}): Promise<ManagedProcess[]> {
  const processes = await listManagedProcesses(cwd);
  const targets = idOrName ? processes.filter((proc) => proc.id === idOrName || proc.name === idOrName) : processes.filter((proc) => proc.status === "running");
  const stopped: ManagedProcess[] = [];

  for (const proc of targets) {
    if (proc.pid && isPidRunning(proc.pid)) {
      try {
        process.kill(proc.pid, options.force ? "SIGKILL" : "SIGTERM");
      } catch {}
    }
    stopped.push({ ...proc, status: "stopped", stoppedAt: Date.now() });
  }
  await writeRegistry(cwd, mergeProcesses(processes, stopped));
  return stopped;
}

export async function restartManagedProcess(cwd: string, idOrName?: string, options: { force?: boolean; autoRestart?: boolean } = {}): Promise<ManagedProcess> {
  const current = (await listManagedProcesses(cwd)).find((proc) => !idOrName || proc.id === idOrName || proc.name === idOrName);
  await stopManagedProcess(cwd, current?.id || idOrName, { force: options.force });
  return startManagedProcess(cwd, current?.id || idOrName, options);
}

export async function readProcessLog(cwd: string, idOrName?: string, lines = 80): Promise<{ process?: ManagedProcess; content: string }> {
  const processes = await listManagedProcesses(cwd);
  const proc = idOrName ? processes.find((candidate) => candidate.id === idOrName || candidate.name === idOrName) : processes[0];
  if (!proc) return { content: "" };
  const content = existsSync(proc.logFile) ? await readFile(proc.logFile, "utf-8").catch(() => "") : "";
  return { process: proc, content: content.trimEnd().split(/\r?\n/).slice(-lines).join("\n") };
}

export async function runSupervisorFromCli(args: string[]): Promise<boolean> {
  if (args[0] !== "_supervise") return false;
  const [, id, command, logFile, mode] = args;
  const cwd = process.env.SETUPR_SUPERVISOR_CWD || process.cwd();
  await supervisorLoop(cwd, id, command, logFile, mode === "restart");
  return true;
}

async function supervisorLoop(cwd: string, id: string, command: string, logFile: string, autoRestart: boolean): Promise<void> {
  await mkdir(dirname(logFile), { recursive: true }).catch(() => undefined);
  let restartCount = 0;
  do {
    await appendLog(logFile, `\n[setupr] starting ${command}\n`);
    const exitCode = await runChild(command, cwd, logFile);
    const processes = await readRegistry(cwd);
    const current = processes.find((proc) => proc.id === id);
    const intentionalStop = current?.status === "stopped";
    const next: ManagedProcess = {
      ...(current || {
        id,
        name: id,
        command,
        cwd,
        startedAt: Date.now(),
        logFile,
      }),
      status: intentionalStop || exitCode === 0 ? "stopped" : "crashed",
      exitCode,
      stoppedAt: Date.now(),
      restartCount,
    };
    await upsertProcess(cwd, next);
    await appendLog(logFile, intentionalStop ? "[setupr] stopped\n" : `[setupr] exited with code ${exitCode}\n`);
    if (intentionalStop || !autoRestart || exitCode === 0) break;
    restartCount++;
    await appendLog(logFile, `[setupr] restarting (${restartCount})\n`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } while (restartCount < 20);
}

function runChild(command: string, cwd: string, logFile: string): Promise<number> {
  return new Promise((resolve) => {
    const env = { ...process.env };
    if (!env.NO_COLOR) env.FORCE_COLOR = "1";
    const child = spawn(command, { cwd, shell: true, env });
    const stopChild = () => {
      try {
        child.kill("SIGTERM");
      } catch {}
    };
    process.once("SIGTERM", stopChild);
    process.once("SIGINT", stopChild);
    child.stdout?.on("data", (data) => appendLog(logFile, data.toString()).catch(() => undefined));
    child.stderr?.on("data", (data) => appendLog(logFile, data.toString()).catch(() => undefined));
    child.on("close", (code) => {
      process.off("SIGTERM", stopChild);
      process.off("SIGINT", stopChild);
      resolve(code ?? 1);
    });
    child.on("error", () => {
      process.off("SIGTERM", stopChild);
      process.off("SIGINT", stopChild);
      resolve(1);
    });
  });
}

async function resolveStartCommand(cwd: string, target?: string): Promise<string> {
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";
  if (target) {
    if (!/^[a-zA-Z0-9:._-]+$/.test(target)) {
      throw createSetuprError({ code: "MISSING_SCRIPT", command: "start", cwd, details: [`Invalid script target: ${target}`] });
    }
    if (!scan.scripts[target]) {
      throw createSetuprError({ code: "MISSING_SCRIPT", command: "start", cwd, details: [`No script named ${target} was found.`] });
    }
    return `${pm} run ${target}`;
  }
  const script = ["dev", "start", "serve", "develop", "watch"].find((name) => scan.scripts[name]);
  if (!script) {
    throw createSetuprError({
      code: "MISSING_SCRIPT",
      command: "start",
      cwd,
      details: ["No dev, start, serve, develop, or watch script was found."],
    });
  }
  return `${pm} run ${script}`;
}

async function readRegistry(cwd: string): Promise<ManagedProcess[]> {
  try {
    const raw = await readFile(await processRegistryPath(cwd), "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isManagedProcess) : [];
  } catch {
    return [];
  }
}

async function writeRegistry(cwd: string, processes: ManagedProcess[]): Promise<void> {
  await writeFile(await processRegistryPath(cwd), `${JSON.stringify(processes, null, 2)}\n`, "utf-8");
}

async function upsertProcess(cwd: string, processEntry: ManagedProcess): Promise<void> {
  const processes = await readRegistry(cwd);
  await writeRegistry(cwd, mergeProcesses(processes, [processEntry]));
}

function mergeProcesses(current: ManagedProcess[], updates: ManagedProcess[]): ManagedProcess[] {
  const map = new Map(current.map((proc) => [proc.id, proc]));
  for (const update of updates) map.set(update.id, update);
  return [...map.values()];
}

function refreshProcessStatus(proc: ManagedProcess): ManagedProcess {
  if (proc.status === "running" && proc.pid && !isPidRunning(proc.pid)) {
    return { ...proc, status: "crashed", stoppedAt: proc.stoppedAt || Date.now() };
  }
  return proc;
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isManagedProcess(value: unknown): value is ManagedProcess {
  const proc = value as Partial<ManagedProcess> | undefined;
  return Boolean(proc?.id && proc.command && proc.cwd && proc.logFile && proc.status);
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "dev";
}

async function appendLog(path: string, value: string): Promise<void> {
  const { appendFile } = await import("fs/promises");
  await appendFile(path, value, "utf-8");
}
