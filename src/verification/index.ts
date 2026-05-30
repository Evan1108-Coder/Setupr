import { existsSync } from "fs";
import { mkdir, rm, writeFile } from "fs/promises";
import { basename, dirname, extname, join } from "path";
import { runCommand } from "../executor/index.js";
import { scanProject, type ScanResult } from "../scanner/index.js";
import { appendHistoryEvent, readProjectJson, writeProjectJson } from "../state/project.js";

export type VerificationStatus = "pass" | "warn" | "fail" | "skip";

export interface VerificationCheck {
  id: string;
  label: string;
  command?: string;
  status: VerificationStatus;
  durationMs?: number;
  output?: string;
  detail?: string;
}

export interface VerificationReport {
  type: "verification";
  command: string;
  cwd: string;
  createdAt: number;
  status: "pass" | "warn" | "fail";
  checks: VerificationCheck[];
}

export interface VerificationOptions {
  json?: boolean;
  yes?: boolean;
  force?: boolean;
  report?: string;
  args?: string[];
}

const TEST_RUNS_FILE = "test-runs.json" as const;
const TEST_CACHE_DIRS = ["coverage", ".nyc_output", ".vitest", ".jest-cache", "test-results", "playwright-report"];

export async function runVerificationCommand(
  cwd: string,
  sub: string | undefined,
  options: VerificationOptions = {}
): Promise<VerificationReport | null> {
  const scan = await scanProject(cwd);
  const target = sub || "run";

  switch (target) {
    case "run":
    case undefined:
      return runReport(cwd, scan, "run", [bestTestCommand(scan)].filter(Boolean) as string[], options);
    case "quick":
      return runReport(cwd, scan, "quick", quickCommands(scan), options);
    case "full":
      return runReport(cwd, scan, "full", fullCommands(scan), options);
    case "ci":
      return runReport(cwd, scan, "ci", ciCommands(scan), options);
    case "smoke":
      return runReport(cwd, scan, "smoke", smokeCommands(scan), options);
    case "unit":
    case "integration":
    case "e2e":
      return runNamedTest(cwd, scan, target, options);
    case "watch":
      return runReport(cwd, scan, "watch", [watchCommand(scan)].filter(Boolean) as string[], options);
    case "coverage":
      return runReport(cwd, scan, "coverage", [coverageCommand(scan)].filter(Boolean) as string[], options);
    case "changed":
      return runChanged(cwd, scan, options);
    case "file":
      return runFile(cwd, scan, options.args?.[0], options);
    case "failed":
      return rerunFailed(cwd, options);
    case "doctor":
      return doctor(cwd, scan, options);
    case "list":
      return listTests(cwd, options);
    case "report":
      return report(cwd, options);
    case "clean":
      return clean(cwd, options);
    case "create":
    case "generate":
      return generateTest(cwd, scan, options.args?.[0], options);
    case "fix":
      return fixAdvice(cwd, options);
    case "security":
      return runSecurityDelegation(cwd, options);
    default:
      return doctor(cwd, scan, options, `Unknown test subcommand: ${target}`);
  }
}

export async function collectVerificationSummary(cwd: string): Promise<{ status: string; lastRun?: VerificationReport }> {
  const runs = await readTestRuns(cwd);
  const lastRun = runs.at(-1);
  return {
    status: lastRun ? `${lastRun.status} (${lastRun.command})` : "no test runs",
    lastRun,
  };
}

function bestTestCommand(scan: ScanResult): string | null {
  const pm = scan.packageManager || "npm";
  if (scan.scripts.test) return `${pm} run test`;
  if (scan.language === "Python") return existsSync("pytest") ? "pytest" : "python -m pytest";
  if (scan.language === "Rust") return "cargo test";
  if (scan.language === "Go") return "go test ./...";
  return scan.scripts.build ? `${pm} run build` : null;
}

function quickCommands(scan: ScanResult): string[] {
  const pm = scan.packageManager || "npm";
  const commands = [
    scriptCommand(scan, "typecheck", pm),
    scriptCommand(scan, "lint", pm),
    bestTestCommand(scan),
  ].filter((cmd): cmd is string => Boolean(cmd));
  return dedupe(commands).slice(0, 3);
}

function fullCommands(scan: ScanResult): string[] {
  const pm = scan.packageManager || "npm";
  return dedupe([
    scriptCommand(scan, "typecheck", pm),
    scriptCommand(scan, "lint", pm),
    bestTestCommand(scan),
    scriptCommand(scan, "build", pm),
  ].filter((cmd): cmd is string => Boolean(cmd)));
}

function ciCommands(scan: ScanResult): string[] {
  const pm = scan.packageManager || "npm";
  const ci = ["ci", "verify", "check"].map((name) => scriptCommand(scan, name, pm)).find(Boolean);
  return ci ? [ci] : fullCommands(scan);
}

function smokeCommands(scan: ScanResult): string[] {
  const pm = scan.packageManager || "npm";
  const smoke = ["smoke", "test:smoke", "e2e"].map((name) => scriptCommand(scan, name, pm)).find(Boolean);
  return smoke ? [smoke] : [bestTestCommand(scan)].filter((cmd): cmd is string => Boolean(cmd));
}

function watchCommand(scan: ScanResult): string | null {
  const pm = scan.packageManager || "npm";
  return scriptCommand(scan, "test:watch", pm) || scriptCommand(scan, "watch", pm) || (scan.scripts.test ? `${pm} run test -- --watch` : null);
}

function coverageCommand(scan: ScanResult): string | null {
  const pm = scan.packageManager || "npm";
  return scriptCommand(scan, "coverage", pm) || scriptCommand(scan, "test:coverage", pm) || (scan.scripts.test ? `${pm} run test -- --coverage` : null);
}

function scriptCommand(scan: ScanResult, script: string, pm = scan.packageManager || "npm"): string | null {
  return scan.scripts[script] ? `${pm} run ${script}` : null;
}

async function runNamedTest(cwd: string, scan: ScanResult, kind: string, options: VerificationOptions): Promise<VerificationReport> {
  const pm = scan.packageManager || "npm";
  const candidates = [`test:${kind}`, kind];
  const command = candidates.map((name) => scriptCommand(scan, name, pm)).find(Boolean);
  return runReport(cwd, scan, kind, command ? [command] : [], options, `No ${kind} test script was detected.`);
}

async function runChanged(cwd: string, scan: ScanResult, options: VerificationOptions): Promise<VerificationReport> {
  const changed = (await runCommand("git diff --name-only --cached && git diff --name-only", cwd)).stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const pm = scan.packageManager || "npm";
  const command = scan.scripts.test && changed.length ? `${pm} run test -- ${changed.map(shellQuote).join(" ")}` : bestTestCommand(scan);
  return runReport(cwd, scan, "changed", command ? [command] : [], options, changed.length ? undefined : "No changed files detected; ran default verification if available.");
}

async function runFile(cwd: string, scan: ScanResult, file: string | undefined, options: VerificationOptions): Promise<VerificationReport> {
  if (!file) return doctor(cwd, scan, options, "Usage: setupr test file <path>");
  const pm = scan.packageManager || "npm";
  const command = scan.scripts.test ? `${pm} run test -- ${shellQuote(file)}` : bestTestCommand(scan);
  return runReport(cwd, scan, `file:${file}`, command ? [command] : [], options);
}

async function rerunFailed(cwd: string, options: VerificationOptions): Promise<VerificationReport> {
  const runs = await readTestRuns(cwd);
  const failed = [...runs].reverse().find((run) => run.status === "fail");
  if (!failed) return emptyReport(cwd, "failed", "No failed test run was recorded.", options);
  const commands = failed.checks.map((check) => check.command).filter((cmd): cmd is string => Boolean(cmd));
  return runReport(cwd, await scanProject(cwd), "failed", commands, options);
}

async function doctor(cwd: string, scan: ScanResult, options: VerificationOptions, extra?: string): Promise<VerificationReport> {
  const checks: VerificationCheck[] = [];
  const testFiles = await findTestFiles(cwd);
  checks.push({
    id: "scripts",
    label: "Test script",
    status: bestTestCommand(scan) ? "pass" : "warn",
    detail: bestTestCommand(scan) || "No default test/build verification command detected.",
  });
  checks.push({
    id: "files",
    label: "Test files",
    status: testFiles.length ? "pass" : "warn",
    detail: testFiles.length ? `${testFiles.length} detected` : "No conventional test files detected.",
  });
  checks.push({
    id: "ci",
    label: "CI verification",
    status: ciCommands(scan).length ? "pass" : "warn",
    detail: ciCommands(scan).join(", ") || "No CI-style verification command detected.",
  });
  if (extra) checks.unshift({ id: "message", label: "Notice", status: "warn", detail: extra });
  return finalizeReport(cwd, { type: "verification", command: "doctor", cwd, createdAt: Date.now(), status: statusFromChecks(checks), checks }, options);
}

async function listTests(cwd: string, options: VerificationOptions): Promise<VerificationReport> {
  const files = await findTestFiles(cwd);
  const checks: VerificationCheck[] = files.slice(0, 100).map((file) => ({ id: file, label: file, status: "pass", detail: "test file" }));
  if (!checks.length) checks.push({ id: "none", label: "No test files", status: "warn", detail: "No conventional test files found." });
  return finalizeReport(cwd, { type: "verification", command: "list", cwd, createdAt: Date.now(), status: statusFromChecks(checks), checks }, options);
}

async function report(cwd: string, options: VerificationOptions): Promise<VerificationReport | null> {
  const runs = await readTestRuns(cwd);
  const last = runs.at(-1);
  if (!last) {
    await emptyReport(cwd, "report", "No test report exists yet.", options);
    return null;
  }
  printReport(last, options);
  return last;
}

async function clean(cwd: string, options: VerificationOptions): Promise<VerificationReport> {
  const checks: VerificationCheck[] = [];
  for (const dir of TEST_CACHE_DIRS) {
    const path = join(cwd, dir);
    if (!existsSync(path)) continue;
    if (options.yes || options.force) {
      await rm(path, { recursive: true, force: true });
      checks.push({ id: dir, label: dir, status: "pass", detail: "removed" });
    } else {
      checks.push({ id: dir, label: dir, status: "warn", detail: "would remove; rerun with --yes" });
    }
  }
  if (!checks.length) checks.push({ id: "clean", label: "Test caches", status: "pass", detail: "No known test cache directories found." });
  return finalizeReport(cwd, { type: "verification", command: "clean", cwd, createdAt: Date.now(), status: statusFromChecks(checks), checks }, options);
}

async function generateTest(cwd: string, scan: ScanResult, sourceFile: string | undefined, options: VerificationOptions): Promise<VerificationReport> {
  if (!sourceFile) return doctor(cwd, scan, options, "Usage: setupr test generate <file>");
  const rel = sourceFile.replace(/^\.\//, "");
  const target = inferTestPath(rel);
  const content = testTemplate(rel, scan);
  if (existsSync(join(cwd, target)) && !options.force) {
    return emptyReport(cwd, "generate", `Test file already exists: ${target}. Use --force to overwrite.`, options);
  }
  if (options.yes || options.force) {
    await mkdir(dirname(join(cwd, target)), { recursive: true });
    await writeFile(join(cwd, target), content, "utf-8");
  }
  return finalizeReport(cwd, {
    type: "verification",
    command: "generate",
    cwd,
    createdAt: Date.now(),
    status: options.yes || options.force ? "pass" : "warn",
    checks: [{ id: "generate", label: target, status: options.yes || options.force ? "pass" : "warn", detail: options.yes || options.force ? "created" : `preview only; rerun with --yes to write\n${content}` }],
  }, options);
}

async function fixAdvice(cwd: string, options: VerificationOptions): Promise<VerificationReport> {
  const runs = await readTestRuns(cwd);
  const failed = [...runs].reverse().find((run) => run.status === "fail");
  return finalizeReport(cwd, {
    type: "verification",
    command: "fix",
    cwd,
    createdAt: Date.now(),
    status: failed ? "warn" : "pass",
    checks: [{
      id: "fix",
      label: "Fix advice",
      status: failed ? "warn" : "pass",
      detail: failed
        ? "Review the failed command output above, run setupr test doctor, and rerun the smallest failing command. AI edits should be previewed before applying."
        : "No failed test run was recorded.",
    }],
  }, options);
}

async function runSecurityDelegation(cwd: string, options: VerificationOptions): Promise<VerificationReport> {
  const { runSecurityCommand } = await import("../security/index.js");
  await runSecurityCommand(cwd, "scan", { ...options, args: [] });
  return emptyReport(cwd, "security", "Delegated to setupr security scan.", options);
}

async function runReport(cwd: string, scan: ScanResult, commandName: string, commands: string[], options: VerificationOptions, fallbackDetail?: string): Promise<VerificationReport> {
  const checks: VerificationCheck[] = [];
  if (!commands.length) {
    checks.push({ id: "missing", label: "Verification command", status: "warn", detail: fallbackDetail || "No verification command detected." });
  }
  for (const command of commands) {
    const started = Date.now();
    const result = await runCommand(command, cwd, (line) => {
      if (!options.json) console.log(line);
    });
    checks.push({
      id: command,
      label: command,
      command,
      status: result.exitCode === 0 ? "pass" : "fail",
      durationMs: Date.now() - started,
      output: `${result.stdout}\n${result.stderr}`.trim().slice(-4000),
      detail: result.exitCode === 0 ? "passed" : `exit ${result.exitCode}`,
    });
  }
  return finalizeReport(cwd, { type: "verification", command: commandName, cwd, createdAt: Date.now(), status: statusFromChecks(checks), checks }, options);
}

async function finalizeReport(cwd: string, report: VerificationReport, options: VerificationOptions): Promise<VerificationReport> {
  await saveTestRun(cwd, report);
  await appendHistoryEvent(cwd, { type: "test.run", message: `test ${report.command}: ${report.status}`, data: { status: report.status, checks: report.checks.length } }).catch(() => undefined);
  if (options.report) await writeReportFile(cwd, report, options.report);
  printReport(report, options);
  if (report.status === "fail") process.exitCode = 1;
  return report;
}

async function emptyReport(cwd: string, command: string, detail: string, options: VerificationOptions): Promise<VerificationReport> {
  return finalizeReport(cwd, {
    type: "verification",
    command,
    cwd,
    createdAt: Date.now(),
    status: "warn",
    checks: [{ id: command, label: command, status: "warn", detail }],
  }, options);
}

function printReport(report: VerificationReport, options: VerificationOptions): void {
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`\n  Setupr Test ${report.command}\n`);
  console.log(`  Status: ${report.status}`);
  for (const check of report.checks) {
    const marker = check.status === "pass" ? "✓" : check.status === "fail" ? "✗" : check.status === "skip" ? "○" : "△";
    console.log(`  ${marker} ${check.label}${check.detail ? ` — ${check.detail.split("\n")[0]}` : ""}`);
  }
  console.log("");
}

async function writeReportFile(cwd: string, report: VerificationReport, outputPath: string): Promise<void> {
  const target = join(cwd, outputPath);
  await mkdir(dirname(target), { recursive: true });
  const content = outputPath.endsWith(".json") ? JSON.stringify(report, null, 2) : markdownReport(report);
  await writeFile(target, `${content}\n`, "utf-8");
}

function markdownReport(report: VerificationReport): string {
  return [`# Setupr Test Report`, ``, `Status: ${report.status}`, `Command: ${report.command}`, ``, ...report.checks.map((check) => `- ${check.status}: ${check.label}${check.detail ? ` - ${check.detail}` : ""}`)].join("\n");
}

async function readTestRuns(cwd: string): Promise<VerificationReport[]> {
  return readProjectJson<VerificationReport[]>(cwd, TEST_RUNS_FILE, []);
}

async function saveTestRun(cwd: string, report: VerificationReport): Promise<void> {
  const runs = await readTestRuns(cwd);
  runs.push(report);
  await writeProjectJson(cwd, TEST_RUNS_FILE, runs.slice(-25) as unknown as import("../state/project.js").JsonValue);
}

async function findTestFiles(cwd: string): Promise<string[]> {
  const files: string[] = [];
  const ignored = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", "target", ".setupr"]);
  async function walk(dir: string, prefix: string, depth: number): Promise<void> {
    if (depth > 5 || files.length > 300) return;
    let entries: import("fs").Dirent[];
    try {
      entries = await import("fs/promises").then((fs) => fs.readdir(dir, { withFileTypes: true }));
    } catch {
      return;
    }
    for (const entry of entries) {
      if (ignored.has(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(join(dir, entry.name), rel, depth + 1);
      else if (/\.(test|spec)\.[jt]sx?$|test_.*\.py$|_test\.go$|.*_test\.rs$/i.test(entry.name) || /(^|\/)(tests?|__tests__)\//.test(rel)) files.push(rel);
    }
  }
  await walk(cwd, "", 0);
  return files.sort();
}

function inferTestPath(file: string): string {
  const ext = extname(file);
  const base = file.slice(0, -ext.length);
  if (ext === ".py") return join("tests", `test_${basename(file)}`);
  if (ext === ".go") return `${base}_test.go`;
  if (ext === ".rs") return `${base}_test.rs`;
  return `${base}.test${ext || ".js"}`;
}

function testTemplate(file: string, scan: ScanResult): string {
  if (file.endsWith(".py")) return `from ${file.replace(/\.py$/, "").replace(/[/\\]/g, ".")} import *\n\n\ndef test_${safeName(file)}_loads():\n    assert True\n`;
  if (file.endsWith(".go")) return `package main\n\nimport "testing"\n\nfunc Test${pascal(safeName(file))}(t *testing.T) {\n}\n`;
  if (file.endsWith(".rs")) return `#[test]\nfn ${safeName(file)}_works() {\n    assert!(true);\n}\n`;
  const runner = scan.dependencies.dev > 0 ? "vitest" : "node:test";
  return runner === "vitest"
    ? `import { describe, expect, it } from "vitest";\n\nimport * as subject from "./${basename(file, extname(file))}";\n\ndescribe("${file}", () => {\n  it("loads", () => {\n    expect(subject).toBeDefined();\n  });\n});\n`
    : `import test from "node:test";\nimport assert from "node:assert/strict";\n\ntest("${file} loads", async () => {\n  assert.ok(true);\n});\n`;
}

function statusFromChecks(checks: VerificationCheck[]): VerificationReport["status"] {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warn")) return "warn";
  return "pass";
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function safeName(file: string): string {
  return basename(file, extname(file)).replace(/[^A-Za-z0-9_]/g, "_");
}

function pascal(value: string): string {
  return value.split(/[_-]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}
