import { execSync } from "child_process";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import type { ScanResult } from "../scanner/index.js";
import { type ProjectContext } from "../ai/dsl.js";

export async function collectContext(cwd: string, scan: ScanResult): Promise<ProjectContext> {
  const [git, envVars, fileTree, terminal] = await Promise.all([
    collectGitInfo(cwd),
    collectEnvVars(cwd),
    collectFileTree(cwd),
    collectTerminalInfo(),
  ]);

  return { cwd, scan, git, envVars, fileTree, terminal };
}

async function collectGitInfo(cwd: string): Promise<ProjectContext["git"]> {
  try {
    execSync("git rev-parse --git-dir", { cwd, stdio: "pipe" });
  } catch {
    return { isRepo: false };
  }

  try {
    const branch = execSync("git branch --show-current", { cwd, stdio: "pipe" })
      .toString()
      .trim();
    let remoteUrl: string | undefined;
    try {
      remoteUrl = execSync("git remote get-url origin", { cwd, stdio: "pipe" })
        .toString()
        .trim();
    } catch {}
    const isDirty =
      execSync("git status --porcelain", { cwd, stdio: "pipe" })
        .toString()
        .trim().length > 0;
    return { isRepo: true, branch, remoteUrl, isDirty };
  } catch {
    return { isRepo: true };
  }
}

async function collectEnvVars(cwd: string): Promise<ProjectContext["envVars"]> {
  const defined: string[] = [];
  const missing: string[] = [];

  try {
    const example = await readFile(join(cwd, ".env.example"), "utf-8");
    const requiredVars = example
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#"))
      .map((l) => l.split("=")[0].trim())
      .filter(Boolean);

    let currentVars: Set<string> = new Set();
    try {
      const env = await readFile(join(cwd, ".env"), "utf-8");
      currentVars = new Set(
        env
          .split("\n")
          .filter((l) => l.trim() && !l.startsWith("#"))
          .map((l) => l.split("=")[0].trim())
          .filter(Boolean)
      );
    } catch {}

    for (const v of requiredVars) {
      if (currentVars.has(v) || process.env[v]) {
        defined.push(v);
      } else {
        missing.push(v);
      }
    }
  } catch {}

  return { defined, missing };
}

async function collectFileTree(cwd: string): Promise<string[]> {
  const files: string[] = [];
  const ignore = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__", "venv", ".venv", "target"]);

  async function walk(dir: string, prefix: string, depth: number) {
    if (depth > 3) return;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries.slice(0, 200)) {
        if (ignore.has(entry.name)) continue;
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        files.push(path);
        if (entry.isDirectory()) {
          await walk(join(dir, entry.name), path, depth + 1);
        }
      }
    } catch {}
  }

  await walk(cwd, "", 0);
  return files.slice(0, 200);
}

function collectTerminalInfo(): ProjectContext["terminal"] {
  return {
    shell: process.env.SHELL || "unknown",
    term: process.env.TERM || "unknown",
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
    platform: process.platform,
    nodeVersion: process.version,
  };
}
