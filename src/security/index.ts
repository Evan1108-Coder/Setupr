import { existsSync } from "fs";
import { mkdir, readFile, readdir, stat, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { runCommand } from "../executor/index.js";
import { parseEnvKeys, parseEnvPairs } from "../env/index.js";
import { scanProject } from "../scanner/index.js";
import { appendHistoryEvent, readProjectJson, writeProjectJson } from "../state/project.js";
import { shellQuote } from "../util/shell.js";

export type SecuritySeverity = "info" | "low" | "medium" | "high" | "critical";
export type SecurityCategory = "deps" | "secrets" | "env" | "docker" | "ci" | "code" | "routes" | "auth" | "headers" | "config";

export interface SecurityFinding {
  id: string;
  title: string;
  category: SecurityCategory;
  severity: SecuritySeverity;
  confidence: "low" | "medium" | "high";
  file?: string;
  line?: number;
  evidence?: string;
  recommendation: string;
}

export interface SecurityReport {
  type: "security";
  command: string;
  cwd: string;
  createdAt: number;
  score: number;
  findings: SecurityFinding[];
}

export interface SecurityOptions {
  json?: boolean;
  yes?: boolean;
  force?: boolean;
  report?: string;
  args?: string[];
  url?: string;
}

const SECURITY_REPORT_FILE = "security-runs.json";
const SECURITY_BASELINE_FILE = "security-baseline.json";
const SECURITY_IGNORE_FILE = "security-ignore.json";
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, "OpenAI-style key"],
  [/\bsk-ant-[A-Za-z0-9_-]{16,}\b/g, "Anthropic-style key"],
  [/\bgithub_pat_[A-Za-z0-9_]{16,}\b/g, "GitHub token"],
  [/\bghp_[A-Za-z0-9_]{16,}\b/g, "GitHub token"],
  [/\bAIza[0-9A-Za-z_-]{20,}\b/g, "Google API key"],
  [/-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g, "private key"],
];

export async function runSecurityCommand(cwd: string, sub: string | undefined, options: SecurityOptions = {}): Promise<SecurityReport | null> {
  const command = sub || "scan";
  switch (command) {
    case "scan":
    case "quick":
      return runScan(cwd, "quick", options);
    case "deep":
      return runScan(cwd, "deep", options);
    case "deps":
      return runSingle(cwd, "deps", options);
    case "secrets":
      return runSingle(cwd, "secrets", options);
    case "env":
      return runSingle(cwd, "env", options);
    case "docker":
      return runSingle(cwd, "docker", options);
    case "ci":
      return runSingle(cwd, "ci", options);
    case "code":
      return runSingle(cwd, "code", options);
    case "routes":
      return runSingle(cwd, "routes", options);
    case "auth":
      return runSingle(cwd, "auth", options);
    case "headers":
      return headers(cwd, options);
    case "doctor":
      return doctor(cwd, options);
    case "report":
      return showReport(cwd, options);
    case "baseline":
      return baseline(cwd, options);
    case "ignore":
      return ignore(cwd, options);
    case "fix":
      return fix(cwd, options);
    case "watch":
      return runScan(cwd, "quick", options, "Watch mode is not started in plain one-shot mode; ran quick scan instead.");
    case "test":
      return runScan(cwd, "quick", options, "Security test probes are defensive static checks by default.");
    default:
      return doctor(cwd, { ...options, args: [`Unknown security subcommand: ${command}`] });
  }
}

export async function collectSecuritySummary(cwd: string): Promise<{ score: number; topFindings: SecurityFinding[]; lastRun?: SecurityReport }> {
  const reports = await readReports(cwd);
  const lastRun = reports.at(-1);
  return {
    score: lastRun?.score ?? 100,
    topFindings: lastRun?.findings.slice(0, 5) ?? [],
    lastRun,
  };
}

async function runScan(cwd: string, depth: "quick" | "deep", options: SecurityOptions, note?: string): Promise<SecurityReport> {
  const findings = [
    ...await scanSecrets(cwd, depth),
    ...await scanEnv(cwd),
    ...await scanDocker(cwd),
    ...await scanCI(cwd),
    ...await scanDeps(cwd),
    ...await scanCode(cwd, depth),
    ...await scanRoutes(cwd),
    ...await scanAuth(cwd),
  ];
  if (note) findings.unshift(infoFinding("scan-note", note));
  const filtered = await applyIgnores(cwd, findings);
  return finalize(cwd, { type: "security", command: depth === "deep" ? "deep" : "scan", cwd, createdAt: Date.now(), score: score(filtered), findings: filtered }, options);
}

async function runSingle(cwd: string, category: SecurityCategory, options: SecurityOptions): Promise<SecurityReport> {
  const scanners: Record<SecurityCategory, () => Promise<SecurityFinding[]>> = {
    deps: () => scanDeps(cwd),
    secrets: () => scanSecrets(cwd, "deep"),
    env: () => scanEnv(cwd),
    docker: () => scanDocker(cwd),
    ci: () => scanCI(cwd),
    code: () => scanCode(cwd, "deep"),
    routes: () => scanRoutes(cwd),
    auth: () => scanAuth(cwd),
    headers: () => Promise.resolve([]),
    config: () => Promise.resolve([]),
  };
  const findings = await applyIgnores(cwd, await scanners[category]());
  return finalize(cwd, { type: "security", command: category, cwd, createdAt: Date.now(), score: score(findings), findings }, options);
}

async function scanSecrets(cwd: string, depth: "quick" | "deep"): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  for (const file of await listFiles(cwd, depth === "quick" ? 120 : 500)) {
    if (isNonProductionPath(file)) continue;
    if (!/\.(env|js|jsx|ts|tsx|py|go|rs|json|ya?ml|toml|md|txt|sh)$/i.test(file)) continue;
    const content = await readFile(join(cwd, file), "utf-8").catch(() => "");
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      for (const [pattern, label] of SECRET_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          findings.push({
            id: `secret:${file}:${index + 1}:${label}`,
            title: `Possible leaked ${label}`,
            category: "secrets",
            severity: "critical",
            confidence: "high",
            file,
            line: index + 1,
            evidence: redact(line),
            recommendation: "Remove the secret, rotate it with the provider, and keep only placeholders in committed files.",
          });
        }
      }
    }
  }
  if (existsSync(join(cwd, ".env")) && !existsSync(join(cwd, ".gitignore"))) {
    findings.push(finding("env-not-ignored", ".env may be committed", "secrets", "high", ".env exists but no .gitignore was found.", "Add .env to .gitignore and avoid committing local secrets."));
  }
  return findings;
}

async function scanEnv(cwd: string): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  const example = await readFile(join(cwd, ".env.example"), "utf-8").catch(() => "");
  const env = await readFile(join(cwd, ".env"), "utf-8").catch(() => "");
  if (!example) return [finding("env-template-missing", "No .env.example found", "env", "low", "No environment template was found.", "Add .env.example with placeholders so setup and reviews know required variables.")];
  const exampleKeys = parseEnvKeys(example);
  const envPairs = parseEnvPairs(env);
  for (const key of exampleKeys) {
    const value = envPairs[key];
    if (/SECRET|TOKEN|PASSWORD|PRIVATE|API_?KEY/i.test(key) && value && !/changeme|your_|example|test|dummy/i.test(value) && value.length > 12) {
      findings.push(finding(`env-secret:${key}`, `Local secret value for ${key}`, "env", "medium", `${key} has a non-placeholder local value.`, "Keep real credentials local and ensure .env is ignored. Do not copy this value into examples or reports."));
    }
    if (/^NEXT_PUBLIC_|^VITE_|^PUBLIC_/i.test(key) && /SECRET|TOKEN|PASSWORD|PRIVATE/i.test(key)) {
      findings.push(finding(`public-secret-name:${key}`, `Public variable name looks sensitive: ${key}`, "env", "high", `${key} uses a public client-exposed prefix and sensitive wording.`, "Rename server-only secrets without public prefixes."));
    }
  }
  return findings;
}

async function scanDocker(cwd: string): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  for (const file of ["Dockerfile", "docker-compose.yml", "compose.yml"]) {
    const content = await readFile(join(cwd, file), "utf-8").catch(() => "");
    if (!content) continue;
    if (/USER\s+root\b/i.test(content) || !/\nUSER\s+/i.test(content) && file === "Dockerfile") {
      findings.push(finding(`docker-root:${file}`, "Container may run as root", "docker", "medium", file, "Use a non-root runtime user when possible."));
    }
    if (/privileged:\s*true/i.test(content)) findings.push(finding(`docker-privileged:${file}`, "Privileged container enabled", "docker", "high", file, "Avoid privileged containers for local/dev services unless explicitly required."));
    if (/\.env|API_KEY|SECRET|TOKEN|PASSWORD/i.test(content)) findings.push(finding(`docker-secret:${file}`, "Docker config references secrets", "docker", "medium", file, "Use secret mounts or local env injection; avoid baking secrets into images."));
  }
  return findings;
}

async function scanCI(cwd: string): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  for (const file of (await listFiles(cwd, 300)).filter((item) => /^\.github\/workflows\/|^\.gitlab-ci\.yml$|circle|bitbucket/i.test(item))) {
    const content = await readFile(join(cwd, file), "utf-8").catch(() => "");
    if (/pull_request_target/i.test(content)) findings.push(finding(`ci-pr-target:${file}`, "CI uses pull_request_target", "ci", "high", file, "Use pull_request for untrusted code or restrict token permissions carefully."));
    if (/curl\b.*\|\s*(sh|bash)/i.test(content)) findings.push(finding(`ci-curl-pipe:${file}`, "CI pipes curl into shell", "ci", "high", file, "Pin downloads and verify checksums before executing scripts."));
    if (!/permissions:/i.test(content) && /\.github\/workflows\//.test(file)) findings.push(finding(`ci-permissions:${file}`, "GitHub workflow has no explicit permissions block", "ci", "low", file, "Set least-privilege permissions at workflow or job level."));
  }
  return findings;
}

async function scanDeps(cwd: string): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf-8").catch(() => "{}")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; license?: string };
  const all = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const [name, version] of Object.entries(all)) {
    if (/latest|\*/.test(version)) findings.push(finding(`dep-unpinned:${name}`, `Unpinned dependency: ${name}`, "deps", "medium", `${name}@${version}`, "Use a concrete semver range and lockfile."));
    if (/node-sass|request|left-pad/i.test(name)) findings.push(finding(`dep-risk:${name}`, `Potentially stale dependency: ${name}`, "deps", "low", `${name}@${version}`, "Check whether this package is still maintained and needed."));
  }
  if (!existsSync(join(cwd, "package-lock.json")) && !existsSync(join(cwd, "pnpm-lock.yaml")) && !existsSync(join(cwd, "yarn.lock")) && Object.keys(all).length) {
    findings.push(finding("lockfile-missing", "Dependency lockfile missing", "deps", "medium", "Dependencies exist but no common JS lockfile was found.", "Commit a lockfile for reproducible installs."));
  }
  return findings;
}

async function scanCode(cwd: string, depth: "quick" | "deep"): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  for (const file of await listFiles(cwd, depth === "quick" ? 150 : 700)) {
    if (isNonProductionPath(file)) continue;
    if (!/\.[jt]sx?$|\.py$|\.go$|\.rs$/i.test(file)) continue;
    const content = await readFile(join(cwd, file), "utf-8").catch(() => "");
    const checks: Array<[RegExp, string, SecuritySeverity, string]> = [
      [/\beval\s*\(|new Function\s*\(/, "Dynamic code execution", "high", "Avoid eval/new Function on user-controlled data."],
      [/child_process\.(exec|execSync)\s*\(/, "Shell execution", "medium", "Prefer spawn/execFile with argument arrays and validate inputs."],
      [/jwt\.sign\([^)]*['"]none['"]|algorithm\s*:\s*['"]none['"]/, "JWT none algorithm", "critical", "Never allow unsigned JWTs."],
      [/secure\s*:\s*false|httpOnly\s*:\s*false/, "Weak cookie option", "medium", "Use secure and httpOnly cookies for sessions."],
      [/\b(createHash\s*\(\s*['"](?:md5|sha1)['"]|md5\s*\(|sha1\s*\()/i, "Weak hash usage", "low", "Use modern password hashing or SHA-256+ for non-password integrity."],
    ];
    for (const [pattern, title, severity, recommendation] of checks) {
      const line = content.split(/\r?\n/).findIndex((row) => pattern.test(row));
      if (line >= 0) findings.push({ id: `code:${title}:${file}:${line + 1}`, title, category: "code", severity, confidence: "medium", file, line: line + 1, evidence: redact(content.split(/\r?\n/)[line]), recommendation });
    }
  }
  return findings;
}

async function scanRoutes(cwd: string): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  for (const file of await listFiles(cwd, 500)) {
    if (isNonProductionPath(file)) continue;
    if (!/\.[jt]sx?$|\.py$/i.test(file)) continue;
    const content = await readFile(join(cwd, file), "utf-8").catch(() => "");
    const lines = content.split(/\r?\n/);
    const line = lines.findIndex((row) => (
      /(\/admin|\/internal|\/debug)/i.test(row)
      && /(router|app\.|route|handler|pathname|href|redirect|rewrite|navigate|fetch|axios|\bGET\b|\bPOST\b|\bPUT\b|\bPATCH\b|\bDELETE\b)/i.test(row)
      && !/(auth|authorize|session|permission|requireUser|middleware)/i.test(row)
    ));
    if (line >= 0) {
      findings.push({
        id: `route-admin:${file}:${line + 1}`,
        title: "Sensitive route without nearby auth signal",
        category: "routes",
        severity: "medium",
        confidence: "medium",
        file,
        line: line + 1,
        evidence: redact(lines[line]),
        recommendation: "Confirm this route is protected by middleware or explicit authorization.",
      });
    }
  }
  return findings;
}

async function scanAuth(cwd: string): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  for (const file of await listFiles(cwd, 400)) {
    if (isNonProductionPath(file)) continue;
    if (!/\.[jt]sx?$|\.py$/i.test(file)) continue;
    const content = await readFile(join(cwd, file), "utf-8").catch(() => "");
    const lines = content.split(/\r?\n/);
    const line = lines.findIndex((row) => /password/i.test(row) && /(===|==)/.test(row) && !/hash|bcrypt|argon|scrypt/i.test(row));
    if (line >= 0) {
      findings.push({
        id: `auth-password-compare:${file}:${line + 1}`,
        title: "Plain password comparison signal",
        category: "auth",
        severity: "high",
        confidence: "medium",
        file,
        line: line + 1,
        evidence: redact(lines[line]),
        recommendation: "Use a password hashing library and constant-time verification.",
      });
    }
  }
  return findings;
}

async function headers(cwd: string, options: SecurityOptions): Promise<SecurityReport> {
  const url = options.url || options.args?.[0];
  if (!url) return finalize(cwd, { type: "security", command: "headers", cwd, createdAt: Date.now(), score: 96, findings: [infoFinding("headers-url", "Pass --url <authorized-local-url> to check response security headers.")] }, options);
  if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)/i.test(url) && !options.force) {
    return finalize(cwd, { type: "security", command: "headers", cwd, createdAt: Date.now(), score: 80, findings: [finding("headers-url-scope", "External URL requires explicit authorization", "headers", "medium", url, "Rerun with --force only for systems you are authorized to test.")] }, options);
  }
  const result = await runCommand(`curl -I -L --max-time 5 ${shellQuote(url)}`, cwd);
  const headers = result.stdout + result.stderr;
  const findings = ["content-security-policy", "x-frame-options", "x-content-type-options"].filter((header) => !headers.toLowerCase().includes(header)).map((header) => finding(`missing-header:${header}`, `Missing ${header}`, "headers", "low", url, "Add standard browser security headers where applicable."));
  return finalize(cwd, { type: "security", command: "headers", cwd, createdAt: Date.now(), score: score(findings), findings }, options);
}

async function doctor(cwd: string, options: SecurityOptions): Promise<SecurityReport> {
  const scan = await scanProject(cwd);
  const findings: SecurityFinding[] = [];
  if (!scan.language) findings.push(infoFinding("doctor-no-project", "No project language detected; security scan will be limited."));
  if (!existsSync(join(cwd, ".gitignore"))) findings.push(finding("doctor-gitignore", "No .gitignore found", "config", "low", "Project has no .gitignore.", "Add ignores for .env, caches, build output, and local secret files."));
  if (options.args?.[0]) findings.unshift(infoFinding("doctor-note", options.args[0]));
  return finalize(cwd, { type: "security", command: "doctor", cwd, createdAt: Date.now(), score: score(findings), findings }, options);
}

async function baseline(cwd: string, options: SecurityOptions): Promise<SecurityReport> {
  const report = await runScan(cwd, "quick", { ...options, json: true });
  await writeProjectJson(cwd, SECURITY_BASELINE_FILE, report.findings.map((finding) => finding.id));
  return finalize(cwd, { ...report, command: "baseline", findings: [infoFinding("baseline-saved", `Saved ${report.findings.length} current finding(s) as baseline.`)] }, options);
}

async function ignore(cwd: string, options: SecurityOptions): Promise<SecurityReport> {
  const id = options.args?.[0];
  const ignores = await readProjectJson<string[]>(cwd, SECURITY_IGNORE_FILE, []);
  if (id && !ignores.includes(id)) {
    ignores.push(id);
    await writeProjectJson(cwd, SECURITY_IGNORE_FILE, ignores);
  }
  return finalize(cwd, { type: "security", command: "ignore", cwd, createdAt: Date.now(), score: 100, findings: [infoFinding("ignored-findings", id ? `Ignored finding ${id}.` : `${ignores.length} ignored finding(s).`)] }, options);
}

async function fix(cwd: string, options: SecurityOptions): Promise<SecurityReport> {
  const last = (await readReports(cwd)).at(-1);
  const fixable = last?.findings.filter((finding) => ["env-template-missing", "lockfile-missing", "doctor-gitignore"].includes(finding.id)) || [];
  if (!options.yes && !options.force) {
    return finalize(cwd, { type: "security", command: "fix", cwd, createdAt: Date.now(), score: last?.score ?? 100, findings: fixable.length ? fixable.map((item) => ({ ...item, recommendation: `${item.recommendation} Rerun with --yes to apply safe supported fixes.` })) : [infoFinding("fix-none", "No safe automatic security fixes are available.")] }, options);
  }
  for (const finding of fixable) {
    if (finding.id === "doctor-gitignore") await writeFile(join(cwd, ".gitignore"), ".env\n.setupr/secrets.json\nnode_modules\ndist\ncoverage\n", { flag: "a" });
    if (finding.id === "env-template-missing") await writeFile(join(cwd, ".env.example"), "# Add required project variables here.\n", { flag: "wx" }).catch(() => undefined);
  }
  return finalize(cwd, { type: "security", command: "fix", cwd, createdAt: Date.now(), score: 100, findings: [infoFinding("fix-applied", `Applied ${fixable.length} safe fix(es).`)] }, options);
}

async function showReport(cwd: string, options: SecurityOptions): Promise<SecurityReport | null> {
  const last = (await readReports(cwd)).at(-1);
  if (!last) {
    await finalize(cwd, { type: "security", command: "report", cwd, createdAt: Date.now(), score: 100, findings: [infoFinding("report-missing", "No security report exists yet.")] }, options);
    return null;
  }
  printReport(last, options);
  return last;
}

async function finalize(cwd: string, report: SecurityReport, options: SecurityOptions): Promise<SecurityReport> {
  await saveReport(cwd, report);
  if (options.report) await writeReportFile(cwd, report, options.report);
  await appendHistoryEvent(cwd, { type: "security.scan", message: `security ${report.command}: ${report.findings.length} finding(s)`, data: { score: report.score, findings: report.findings.length } }).catch(() => undefined);
  printReport(report, options);
  return report;
}

function printReport(report: SecurityReport, options: SecurityOptions): void {
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`\n  Setupr Security ${report.command}\n`);
  console.log(`  Score: ${report.score}/100`);
  if (!report.findings.length) console.log("  ✓ No findings.");
  for (const finding of report.findings.slice(0, 50)) {
    const marker = finding.severity === "critical" || finding.severity === "high" ? "✗" : finding.severity === "medium" ? "△" : "•";
    console.log(`  ${marker} ${finding.severity.padEnd(8)} ${finding.title}${finding.file ? ` (${finding.file}${finding.line ? `:${finding.line}` : ""})` : ""}`);
    console.log(`    ${finding.recommendation}`);
  }
  console.log("");
}

async function readReports(cwd: string): Promise<SecurityReport[]> {
  return readProjectJson<SecurityReport[]>(cwd, SECURITY_REPORT_FILE, []);
}

async function saveReport(cwd: string, report: SecurityReport): Promise<void> {
  const reports = await readReports(cwd);
  reports.push(report);
  await writeProjectJson(cwd, SECURITY_REPORT_FILE, reports.slice(-25) as unknown as import("../state/project.js").JsonValue);
}

async function writeReportFile(cwd: string, report: SecurityReport, outputPath: string): Promise<void> {
  const target = join(cwd, outputPath);
  await mkdir(dirname(target), { recursive: true });
  const content = outputPath.endsWith(".json") ? JSON.stringify(report, null, 2) : markdown(report);
  await writeFile(target, `${content}\n`, "utf-8");
}

function markdown(report: SecurityReport): string {
  return [`# Setupr Security Report`, ``, `Score: ${report.score}/100`, `Findings: ${report.findings.length}`, ``, ...report.findings.map((finding) => `- ${finding.severity}: ${finding.title}${finding.file ? ` (${finding.file}${finding.line ? `:${finding.line}` : ""})` : ""} - ${finding.recommendation}`)].join("\n");
}

async function applyIgnores(cwd: string, findings: SecurityFinding[]): Promise<SecurityFinding[]> {
  const ignored = new Set(await readProjectJson<string[]>(cwd, SECURITY_IGNORE_FILE, []));
  const baseline = new Set(await readProjectJson<string[]>(cwd, SECURITY_BASELINE_FILE, []));
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const dedupeKey = [finding.category, finding.title, finding.file || "", finding.line || 0].join(":");
    if (seen.has(dedupeKey)) return false;
    seen.add(dedupeKey);
    return !ignored.has(finding.id) && !baseline.has(finding.id);
  });
}

async function listFiles(cwd: string, max: number): Promise<string[]> {
  const files: string[] = [];
  const ignored = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", "target", ".setupr"]);
  async function walk(dir: string, prefix: string, depth: number): Promise<void> {
    if (depth > 5 || files.length >= max) return;
    let entries: import("fs").Dirent[];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (ignored.has(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path, rel, depth + 1);
      else {
        const info = await stat(path).catch(() => null);
        if (info && info.size < 512_000) files.push(rel);
      }
    }
  }
  await walk(cwd, "", 0);
  return files;
}

function isNonProductionPath(file: string): boolean {
  return /(^|\/)(test|tests|__tests__|__mocks__|fixtures|fixture|examples|example|docs)(\/|$)/i.test(file);
}

function finding(id: string, title: string, category: SecurityCategory, severity: SecuritySeverity, evidence: string, recommendation: string): SecurityFinding {
  return { id, title, category, severity, confidence: "medium", evidence, recommendation };
}

function infoFinding(id: string, detail: string): SecurityFinding {
  return { id, title: detail, category: "config", severity: "info", confidence: "high", recommendation: detail };
}

function score(findings: SecurityFinding[]): number {
  const penalties: Record<SecuritySeverity, number> = { info: 0, low: 2, medium: 8, high: 18, critical: 30 };
  return Math.max(0, 100 - findings.reduce((sum, finding) => sum + penalties[finding.severity], 0));
}

function redact(text: string): string {
  return text.replace(/[A-Za-z0-9_/-]{16,}/g, "****").slice(0, 180);
}
