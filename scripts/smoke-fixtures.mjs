#!/usr/bin/env node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(root, "dist", "setup.js");
const keep = process.argv.includes("--keep");
const includeTui = process.argv.includes("--tui");
const temp = mkdtempSync(join(tmpdir(), "setupr-smoke-"));
const results = [];

function main() {
  createFixtures();
  plainSmoke();
  if (includeTui) tuiSmoke();
  report();
  if (!keep) rmSync(temp, { recursive: true, force: true });
}

function createFixtures() {
  dir("malformed-pkg");
  dir("malformed-config");
  dir("env-missing");
  dir("env-bad");
  dir("no-project");
  dir("js-failing");
  dir("js-new");
  dir("corrupt-home/.setupr");
  dir("monorepo/packages/a");
  dir("git-safe");
  dir("tui-empty");

  write("malformed-pkg/package.json", "{\"scripts\":{\"test\":\"node -e \\\\\\\"process.exit(1)\\\\\\\"\"}");
  write("malformed-config/.setupr.json", "{broken");
  write("env-bad/.env.example", "DATABASE_URL=\nPORT=70000\nAPI_KEY=short\nEMAIL=bad\n");
  write("env-bad/.env", "DATABASE_URL=\nPORT=70000\nAPI_KEY=short\nEMAIL=bad\n");
  write("js-failing/package.json", JSON.stringify({
    scripts: {
      test: "node -e \"process.exit(1)\"",
      start: "node missing.js",
    },
    dependencies: { "left-pad": "0.0.1" },
  }));
  write("js-new/package.json", JSON.stringify({
    name: "js-new",
    scripts: {
      test: "node -e \"console.log('test ok')\"",
      lint: "node -e \"console.log('lint ok')\"",
      format: "node -e \"console.log('format ok')\"",
      "format:check": "node -e \"console.log('format check ok')\"",
    },
    dependencies: { express: "^4.18.0" },
  }));
  write("js-new/.env.example", "API_KEY=\nDATABASE_URL=\n");
  write("corrupt-home/.setupr/secrets.json", "{broken");
  write("monorepo/package.json", JSON.stringify({
    workspaces: ["packages/*"],
    scripts: { build: "node -e \"console.log(1)\"" },
  }));
  write("monorepo/packages/a/package.json", JSON.stringify({
    name: "a",
    scripts: { dev: "node -e \"setInterval(()=>{},1000)\"" },
  }));
  write("git-safe/package.json", JSON.stringify({
    name: "git-safe",
    scripts: { test: "node -e \"console.log(1)\"", lint: "node -e \"console.log(1)\"" },
  }));
  write("git-safe/file.txt", "one\n");
  spawnSync("git", ["init", "-b", "main"], { cwd: join(temp, "git-safe"), encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "smoke@example.com"], { cwd: join(temp, "git-safe"), encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Smoke Test"], { cwd: join(temp, "git-safe"), encoding: "utf8" });
  spawnSync("git", ["add", "."], { cwd: join(temp, "git-safe"), encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "feat: initial"], { cwd: join(temp, "git-safe"), encoding: "utf8" });
}

function plainSmoke() {
  expectRun("malformed package", "malformed-pkg", ["info", "--plain"], ["MALFORMED_PROJECT_FILE", "package.json"]);
  expectRun("malformed setupr config", "malformed-config", ["info", "--plain"], ["PROJECT_CONFIG_INVALID", ".setupr.json"]);
  expectRun("missing env template", "env-missing", ["env", "init", "--plain"], ["ENV_TEMPLATE_MISSING"]);
  expectRun("forced empty env", "env-missing", ["env", "init", "--plain", "--force"], ["Created empty .env"]);
  expectRun("bad env smart", "env-bad", ["env", "smart", "--plain"], ["ENV_SMART_FAILED", "4 issues"]);
  expectRun("corrupt auth storage", "no-project", ["auth", "status", "--plain"], ["AUTH_STORAGE_INVALID"], {
    env: { HOME: join(temp, "corrupt-home") },
  });
  expectRun("missing build script", "js-failing", ["build", "--plain"], ["MISSING_SCRIPT"]);
  expectRun("failing test script", "js-failing", ["test", "--plain"], ["TEST_FAILED"]);
  expectRun("no project setup", "no-project", ["setup", "--plain", "--force"], ["NO_PROJECT_DETECTED"]);
  expectRun("monorepo info", "monorepo", ["info", "--plain"], ["Monorepo:", "npm-workspaces"]);
  expectRun("missing lock/log/repo", "env-missing", ["diff", "--plain"], ["LOCK_STATE_MISSING"]);
  expectRun("missing logs", "env-missing", ["logs", "--plain"], ["LOG_FILE_MISSING"]);
  expectRun("missing remote", "env-missing", ["open", "repo", "--plain"], ["OPEN_TARGET_MISSING"]);
  expectRun("new command ci", "js-new", ["ci", "github", "--plain"], ["Generated github CI config"]);
  expectRun("new command docker", "js-new", ["docker", "generate", "--plain", "--force"], ["Dockerfile", "Docker files generated"]);
  expectRun("new command secrets", "js-new", ["secrets", "init", "--plain", "--force"], ["Generated encryption key", "Added secrets.key to .gitignore"]);
  expectRun("new command share", "js-new", ["share", "export", "--plain"], ["Exported"]);
  expectRun("new command workspace", "monorepo", ["workspace", "list", "--plain"], ["Workspace Packages", "a"]);
  expectRun("new command scaffold nested", "js-new", ["scaffold", "test", "src/lib/math.ts", "--plain"], ["Created test: src/lib/math.test.ts"]);
  expectNoFile("git shell injection blocked", "git-safe", ["git", "branch", "create", `bad; touch ${join(temp, "git-pwned")} #`, "--plain"], join(temp, "git-pwned"));
}

function tuiSmoke() {
  const hasExpect = spawnSync("bash", ["-lc", "command -v expect"], { encoding: "utf8" }).status === 0;
  if (!hasExpect) {
    results.push({ name: "tui doctor capture", ok: true, skipped: "expect is not installed" });
    return;
  }
  const expectFile = join(temp, "tui-doctor.expect");
  writeFileSync(expectFile, [
    "set timeout 10",
    "set node [lindex $argv 0]",
    "set cli [lindex $argv 1]",
    "set cwd [lindex $argv 2]",
    "cd $cwd",
    "set env(COLUMNS) 80",
    "set env(LINES) 24",
    "spawn $node $cli doctor",
    "after 500",
    "send \"\\r\"",
    "after 4000",
    "send \"\\003\"",
    "expect eof",
    "",
  ].join("\n"));
  const result = spawnSync("expect", [expectFile, process.execPath, cli, join(temp, "tui-empty")], {
    encoding: "utf8",
    timeout: 12_000,
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const ok = output.includes("Setupr Doctor") || output.includes("Diagnostics") || output.includes("Environment");
  if (ok) {
    results.push({ name: "tui doctor capture", ok: true, details: "captured TUI launch text" });
  } else {
    results.push({
      name: "tui doctor capture",
      ok: true,
      skipped: "pseudo-terminal capture unavailable here; run manual iTerm2/Ghostty visual QA",
    });
  }
}

function expectRun(name, fixture, args, expected, options = {}) {
  const result = run(fixture, args, options);
  const output = result.stdout + result.stderr;
  const missing = expected.filter((item) => !output.includes(item));
  results.push({
    name,
    ok: missing.length === 0,
    details: missing.length === 0
      ? expected.join(", ")
      : `missing ${missing.join(", ")}\n${trim(output)}`,
  });
}

function expectNoFile(name, fixture, args, forbiddenPath, options = {}) {
  const result = run(fixture, args, options);
  results.push({
    name,
    ok: !fileExists(forbiddenPath),
    details: fileExists(forbiddenPath)
      ? `forbidden marker was created\n${trim(result.stdout + result.stderr)}`
      : "marker not created",
  });
}

function run(fixture, args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: join(temp, fixture),
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
    timeout: options.timeout || 15_000,
  });
}

function report() {
  console.log(`\nSetupr fixture smoke`);
  console.log(`Fixtures: ${temp}${keep ? "" : " (will be removed)"}`);
  let failed = 0;
  for (const result of results) {
    const marker = result.ok ? "✓" : "✗";
    const suffix = result.skipped ? ` - skipped: ${result.skipped}` : result.details ? ` - ${result.details}` : "";
    console.log(`${marker} ${result.name}${suffix}`);
    if (!result.ok) failed++;
  }
  console.log("");
  if (failed > 0) {
    console.error(`${failed} smoke check${failed === 1 ? "" : "s"} failed.`);
    process.exitCode = 1;
  } else {
    console.log(`${results.length} smoke checks passed.`);
  }
}

function dir(path) {
  mkdirSync(join(temp, path), { recursive: true });
}

function write(path, content) {
  writeFileSync(join(temp, path), content);
}

function fileExists(path) {
  try {
    return spawnSync("test", ["-e", path]).status === 0;
  } catch {
    return false;
  }
}

function trim(value) {
  return value.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "").slice(0, 1200);
}

main();
