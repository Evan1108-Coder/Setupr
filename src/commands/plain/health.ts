import chalk from "chalk";
import { existsSync } from "fs";
import { readFile, stat } from "fs/promises";
import { join } from "path";
import { runCommand } from "../../executor/index.js";
import { scanProject } from "../../scanner/index.js";
import { createPSetupError, printPlainError } from "../../errors/index.js";

interface HealthFlags {
  force?: boolean;
  args?: string[];
  [key: string]: unknown;
}

interface HealthCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

export async function cmdHealth(sub: string | undefined, cwd: string, _flags: HealthFlags): Promise<void> {
  const mode = sub || "full";

  switch (mode) {
    case "full": return healthFull(cwd);
    case "deps": return healthDeps(cwd);
    case "security": return healthSecurity(cwd);
    case "outdated": return healthOutdated(cwd);
    case "size": return healthSize(cwd);
    default:
      printPlainError(createPSetupError({
        code: "UNKNOWN_SUBCOMMAND",
        command: "health",
        subcommand: sub,
        cwd,
        details: ["Valid: full, deps, security, outdated, size"],
      }));
  }
}

async function healthFull(cwd: string): Promise<void> {
  console.log(chalk.blue.bold("\n  Project Health Check\n"));
  const checks: HealthCheck[] = [];

  const scan = await scanProject(cwd);

  checks.push(checkProjectFiles(cwd, scan));
  checks.push(await checkGitStatus(cwd));
  checks.push(await checkDependencies(cwd, scan));
  checks.push(checkEnvFiles(cwd));
  checks.push(await checkNodeModules(cwd));
  checks.push(checkScripts(scan));
  checks.push(checkConfigFiles(scan));
  checks.push(await checkDiskUsage(cwd));

  for (const check of checks) {
    const icon = check.status === "pass" ? chalk.green("✓")
      : check.status === "warn" ? chalk.yellow("⚠")
      : chalk.red("✗");
    const color = check.status === "pass" ? chalk.green
      : check.status === "warn" ? chalk.yellow
      : chalk.red;
    console.log(`  ${icon} ${color(check.name.padEnd(25))} ${chalk.dim(check.message)}`);
  }

  const passed = checks.filter(c => c.status === "pass").length;
  const warned = checks.filter(c => c.status === "warn").length;
  const failed = checks.filter(c => c.status === "fail").length;

  console.log("");
  console.log(chalk.dim(`  Score: ${passed}/${checks.length} passed, ${warned} warnings, ${failed} failures`));

  if (failed > 0) {
    printPlainError(createPSetupError({
      code: "HEALTH_CHECK_FAILED",
      command: "health",
      cwd,
      details: [`${failed} check(s) failed. Run setup health <category> for details.`],
    }));
  } else {
    console.log(chalk.green("\n  ✓ Project is healthy!"));
  }
}

function checkProjectFiles(cwd: string, scan: ReturnType<typeof scanProject> extends Promise<infer T> ? T : never): HealthCheck {
  if (scan.language) {
    return { name: "Project detected", status: "pass", message: `${scan.language} / ${scan.framework || "none"}` };
  }
  return { name: "Project detected", status: "fail", message: "No recognizable project files" };
}

async function checkGitStatus(cwd: string): Promise<HealthCheck> {
  if (!existsSync(join(cwd, ".git"))) {
    return { name: "Version control", status: "warn", message: "Not a git repository" };
  }
  const result = await runCommand("git status --porcelain", cwd);
  const changes = result.stdout.trim().split("\n").filter(Boolean).length;
  if (changes === 0) {
    return { name: "Version control", status: "pass", message: "Clean working tree" };
  }
  return { name: "Version control", status: "warn", message: `${changes} uncommitted change(s)` };
}

async function checkDependencies(cwd: string, scan: ReturnType<typeof scanProject> extends Promise<infer T> ? T : never): Promise<HealthCheck> {
  if (!scan.packageManager) {
    return { name: "Dependencies", status: "warn", message: "No package manager detected" };
  }
  if (!existsSync(join(cwd, "node_modules"))) {
    return { name: "Dependencies", status: "fail", message: "node_modules missing — run install" };
  }
  return { name: "Dependencies", status: "pass", message: `${scan.dependencies.prod} prod + ${scan.dependencies.dev} dev` };
}

function checkEnvFiles(cwd: string): HealthCheck {
  const hasExample = existsSync(join(cwd, ".env.example"));
  const hasEnv = existsSync(join(cwd, ".env"));

  if (!hasExample && !hasEnv) {
    return { name: "Environment files", status: "pass", message: "No env files needed" };
  }
  if (hasExample && !hasEnv) {
    return { name: "Environment files", status: "warn", message: ".env.example exists but no .env — run setup env init" };
  }
  if (hasExample && hasEnv) {
    return { name: "Environment files", status: "pass", message: ".env configured from template" };
  }
  return { name: "Environment files", status: "pass", message: ".env present" };
}

async function checkNodeModules(cwd: string): Promise<HealthCheck> {
  const nmPath = join(cwd, "node_modules");
  if (!existsSync(nmPath)) {
    return { name: "Node modules", status: "warn", message: "Not installed" };
  }

  const lockfiles = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb"];
  const hasLock = lockfiles.some(f => existsSync(join(cwd, f)));
  if (!hasLock) {
    return { name: "Node modules", status: "warn", message: "Installed but no lockfile" };
  }
  return { name: "Node modules", status: "pass", message: "Installed with lockfile" };
}

function checkScripts(scan: ReturnType<typeof scanProject> extends Promise<infer T> ? T : never): HealthCheck {
  const essential = ["build", "test", "dev"];
  const present = essential.filter(s => !!scan.scripts[s]);
  if (present.length === essential.length) {
    return { name: "Scripts", status: "pass", message: "build, test, dev all present" };
  }
  const missing = essential.filter(s => !scan.scripts[s]);
  return { name: "Scripts", status: "warn", message: `Missing: ${missing.join(", ")}` };
}

function checkConfigFiles(scan: ReturnType<typeof scanProject> extends Promise<infer T> ? T : never): HealthCheck {
  const hasTypeSafety = scan.configFiles.some(f => f.includes("tsconfig"));
  const hasLint = scan.configFiles.some(f => f.includes("eslint") || f.includes("prettier"));

  if (hasTypeSafety && hasLint) {
    return { name: "Code quality", status: "pass", message: "TypeScript + linting configured" };
  }
  if (hasTypeSafety) {
    return { name: "Code quality", status: "pass", message: "TypeScript configured" };
  }
  return { name: "Code quality", status: "warn", message: "No type checking or linting detected" };
}

async function checkDiskUsage(cwd: string): Promise<HealthCheck> {
  const result = await runCommand("du -sh node_modules 2>/dev/null || echo '0\tnode_modules'", cwd);
  const size = result.stdout.trim().split("\t")[0];
  const sizeNum = parseFloat(size);
  const unit = size.replace(/[0-9.]/g, "").trim();

  if (unit === "G" || (unit === "M" && sizeNum > 500)) {
    return { name: "Disk usage", status: "warn", message: `node_modules: ${size}` };
  }
  return { name: "Disk usage", status: "pass", message: `node_modules: ${size}` };
}

async function healthDeps(cwd: string): Promise<void> {
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";
  console.log(chalk.blue.bold("\n  Dependency Health\n"));

  const auditResult = await runCommand(`${pm} audit --json 2>/dev/null || echo '{}'`, cwd);
  try {
    const audit = JSON.parse(auditResult.stdout);
    const vulns = audit.metadata?.vulnerabilities || audit.vulnerabilities || {};
    const total = Object.values(vulns).reduce((sum: number, v: unknown) => sum + (typeof v === "number" ? v : 0), 0);
    if (total === 0) {
      console.log(chalk.green("  ✓ No known vulnerabilities"));
    } else {
      console.log(chalk.red(`  ✗ ${total} vulnerabilities found`));
      if (vulns.critical) console.log(chalk.red(`    Critical: ${vulns.critical}`));
      if (vulns.high) console.log(chalk.red(`    High: ${vulns.high}`));
      if (vulns.moderate) console.log(chalk.yellow(`    Moderate: ${vulns.moderate}`));
      if (vulns.low) console.log(chalk.dim(`    Low: ${vulns.low}`));
    }
  } catch {
    console.log(chalk.dim("  Could not parse audit results."));
  }
}

async function healthSecurity(cwd: string): Promise<void> {
  console.log(chalk.blue.bold("\n  Security Check\n"));
  const checks: HealthCheck[] = [];

  const gitignorePath = join(cwd, ".gitignore");
  if (existsSync(gitignorePath)) {
    const content = await readFile(gitignorePath, "utf-8");
    const hasEnv = content.includes(".env");
    checks.push({
      name: ".env in .gitignore",
      status: hasEnv ? "pass" : "fail",
      message: hasEnv ? "Environment files are ignored" : ".env might be committed!",
    });
  }

  const envPath = join(cwd, ".env");
  if (existsSync(envPath)) {
    const envStat = await stat(envPath);
    const mode = (envStat.mode & 0o777).toString(8);
    const isRestricted = (envStat.mode & 0o077) === 0;
    checks.push({
      name: ".env permissions",
      status: isRestricted ? "pass" : "warn",
      message: `Mode: ${mode}${isRestricted ? "" : " — consider 600"}`,
    });
  }

  const nmPath = join(cwd, "node_modules", ".package-lock.json");
  if (existsSync(nmPath)) {
    checks.push({ name: "Lockfile integrity", status: "pass", message: "Lockfile present" });
  }

  for (const check of checks) {
    const icon = check.status === "pass" ? chalk.green("✓") : check.status === "warn" ? chalk.yellow("⚠") : chalk.red("✗");
    console.log(`  ${icon} ${check.name}: ${chalk.dim(check.message)}`);
  }
}

async function healthOutdated(cwd: string): Promise<void> {
  const scan = await scanProject(cwd);
  const pm = scan.packageManager || "npm";
  console.log(chalk.blue(`Checking outdated packages (${pm})...\n`));

  const result = await runCommand(`${pm} outdated 2>&1 || true`, cwd);
  if (result.stdout.trim()) {
    console.log(result.stdout);
  } else {
    console.log(chalk.green("  ✓ All packages are up to date"));
  }
}

async function healthSize(cwd: string): Promise<void> {
  console.log(chalk.blue.bold("\n  Project Size Analysis\n"));

  const dirs = ["node_modules", "dist", "build", ".next", "coverage", "src", "tests"];
  for (const dir of dirs) {
    if (existsSync(join(cwd, dir))) {
      const result = await runCommand(`du -sh "${dir}" 2>/dev/null`, cwd);
      const size = result.stdout.trim().split("\t")[0];
      console.log(`  ${chalk.white(dir.padEnd(20))} ${chalk.dim(size)}`);
    }
  }

  const totalResult = await runCommand("du -sh . 2>/dev/null", cwd);
  const total = totalResult.stdout.trim().split("\t")[0];
  console.log(chalk.dim(`\n  Total: ${total}`));
}
