import chalk from "chalk";
import { readFile, readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { runCommand } from "../../executor/index.js";
import { createPSetupError, printPlainError } from "../../errors/index.js";
import { scanProject } from "../../scanner/index.js";

interface WorkspaceFlags {
  force?: boolean;
  args?: string[];
  [key: string]: unknown;
}

export async function cmdWorkspace(sub: string | undefined, cwd: string, flags: WorkspaceFlags): Promise<void> {
  switch (sub) {
    case "list": return workspaceList(cwd);
    case "run": return workspaceRun(cwd, flags);
    case "exec": return workspaceExec(cwd, flags);
    case "add": return workspaceAdd(cwd, flags);
    case "info": return workspaceInfo(cwd);
    case "check": return workspaceCheck(cwd);
    default:
      printPlainError(createPSetupError({
        code: "UNKNOWN_SUBCOMMAND",
        command: "workspace",
        subcommand: sub,
        cwd,
        details: ["Valid: list, run <script>, exec <cmd>, add <name>, info, check"],
      }));
  }
}

async function getWorkspacePackages(cwd: string): Promise<{ name: string; path: string; version: string }[]> {
  const scan = await scanProject(cwd);

  if (scan.monorepo?.packages) {
    const packages: { name: string; path: string; version: string }[] = [];
    for (const pkgPath of scan.monorepo.packages) {
      const fullPath = join(cwd, pkgPath);
      try {
        const pkg = JSON.parse(await readFile(join(fullPath, "package.json"), "utf-8"));
        packages.push({ name: pkg.name || pkgPath, path: pkgPath, version: pkg.version || "0.0.0" });
      } catch {}
    }
    return packages;
  }

  try {
    const rootPkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf-8"));
    const workspaces: string[] = Array.isArray(rootPkg.workspaces)
      ? rootPkg.workspaces
      : rootPkg.workspaces?.packages || [];

    const packages: { name: string; path: string; version: string }[] = [];

    for (const pattern of workspaces) {
      const base = pattern.replace(/\/?\*$/, "");
      const dir = join(cwd, base);
      if (!existsSync(dir)) continue;

      const entries = await readdir(dir);
      for (const entry of entries) {
        const pkgJsonPath = join(dir, entry, "package.json");
        if (existsSync(pkgJsonPath)) {
          try {
            const pkg = JSON.parse(await readFile(pkgJsonPath, "utf-8"));
            packages.push({ name: pkg.name || entry, path: join(base, entry), version: pkg.version || "0.0.0" });
          } catch {}
        }
      }
    }

    return packages;
  } catch {
    return [];
  }
}

async function workspaceList(cwd: string): Promise<void> {
  const packages = await getWorkspacePackages(cwd);

  if (packages.length === 0) {
    printPlainError(createPSetupError({ code: "WORKSPACE_NO_PACKAGES", command: "workspace", subcommand: "list", cwd }));
    return;
  }

  console.log(chalk.blue.bold("\n  Workspace Packages\n"));
  for (const pkg of packages) {
    console.log(`  ${chalk.green(pkg.name.padEnd(30))} ${chalk.dim(pkg.version.padEnd(10))} ${chalk.dim(pkg.path)}`);
  }
  console.log(chalk.dim(`\n  ${packages.length} package(s)`));
}

async function workspaceRun(cwd: string, flags: WorkspaceFlags): Promise<void> {
  const script = flags.args?.[0];
  if (!script) {
    console.log(chalk.yellow("Usage: setup workspace run <script> [--filter=<package>]"));
    return;
  }

  const packages = await getWorkspacePackages(cwd);
  if (packages.length === 0) {
    printPlainError(createPSetupError({ code: "WORKSPACE_NO_PACKAGES", command: "workspace", subcommand: "run", cwd }));
    return;
  }

  const filter = flags.args?.[1];
  const targets = filter
    ? packages.filter(p => p.name.includes(filter) || p.path.includes(filter))
    : packages;

  console.log(chalk.blue(`Running "${script}" across ${targets.length} package(s)...\n`));

  let passed = 0;
  let failed = 0;

  for (const pkg of targets) {
    const pkgDir = join(cwd, pkg.path);
    const pkgJson = JSON.parse(await readFile(join(pkgDir, "package.json"), "utf-8"));

    if (!pkgJson.scripts?.[script]) {
      console.log(chalk.dim(`  ○ ${pkg.name} — no "${script}" script`));
      continue;
    }

    const scan = await scanProject(pkgDir);
    const pm = scan.packageManager || "npm";
    const result = await runCommand(`${pm} run ${script}`, pkgDir);

    if (result.exitCode === 0) {
      console.log(chalk.green(`  ✓ ${pkg.name}`));
      passed++;
    } else {
      console.log(chalk.red(`  ✗ ${pkg.name}`));
      if (result.stderr) console.log(chalk.dim(`    ${result.stderr.split("\n")[0]}`));
      failed++;
    }
  }

  console.log("");
  if (failed === 0) {
    console.log(chalk.green(`✓ All ${passed} package(s) passed`));
  } else {
    printPlainError(createPSetupError({
      code: "WORKSPACE_COMMAND_FAILED",
      command: "workspace",
      subcommand: "run",
      cwd,
      details: [`${failed} package(s) failed, ${passed} passed`],
    }));
  }
}

async function workspaceExec(cwd: string, flags: WorkspaceFlags): Promise<void> {
  const cmd = flags.args?.join(" ");
  if (!cmd) {
    console.log(chalk.yellow("Usage: setup workspace exec <command>"));
    return;
  }

  if (!/^[a-zA-Z0-9\s._/-]+$/.test(cmd)) {
    printPlainError(createPSetupError({ code: "COMMAND_FAILED", command: "workspace", subcommand: "exec", cwd, details: ["Invalid command characters."] }));
    return;
  }

  const packages = await getWorkspacePackages(cwd);
  console.log(chalk.blue(`Executing in ${packages.length} package(s): ${cmd}\n`));

  for (const pkg of packages) {
    const pkgDir = join(cwd, pkg.path);
    const result = await runCommand(cmd, pkgDir);
    const icon = result.exitCode === 0 ? chalk.green("✓") : chalk.red("✗");
    console.log(`  ${icon} ${pkg.name}`);
  }
}

async function workspaceAdd(cwd: string, flags: WorkspaceFlags): Promise<void> {
  const name = flags.args?.[0];
  if (!name) {
    console.log(chalk.yellow("Usage: setup workspace add <package-name>"));
    return;
  }

  const { mkdir, writeFile } = await import("fs/promises");
  const rootPkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf-8"));
  const workspaces: string[] = Array.isArray(rootPkg.workspaces)
    ? rootPkg.workspaces
    : rootPkg.workspaces?.packages || [];

  const base = workspaces[0]?.replace(/\/?\*$/, "") || "packages";
  const pkgDir = join(cwd, base, name);

  await mkdir(join(pkgDir, "src"), { recursive: true });
  const pkg = {
    name: `@${rootPkg.name || "workspace"}/${name}`,
    version: "0.1.0",
    type: "module",
    main: "./dist/index.js",
    scripts: { build: "tsc", dev: "tsc --watch", test: "echo 'no tests'" },
  };
  await writeFile(join(pkgDir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  await writeFile(join(pkgDir, "src/index.ts"), `export const ${name} = true;\n`);

  console.log(chalk.green(`✓ Created workspace package: ${pkg.name}`));
  console.log(chalk.dim(`  Path: ${base}/${name}`));
}

async function workspaceInfo(cwd: string): Promise<void> {
  const scan = await scanProject(cwd);
  const packages = await getWorkspacePackages(cwd);

  console.log(chalk.blue.bold("\n  Workspace Info\n"));
  console.log(`  Type:      ${chalk.white(scan.monorepo?.type || "npm workspaces")}`);
  console.log(`  Packages:  ${chalk.white(String(packages.length))}`);
  console.log(`  PM:        ${chalk.white(scan.packageManager || "npm")}`);

  if (packages.length > 0) {
    console.log(chalk.dim("\n  Packages:"));
    for (const pkg of packages.slice(0, 10)) {
      console.log(chalk.dim(`    ${pkg.name} (${pkg.version})`));
    }
    if (packages.length > 10) {
      console.log(chalk.dim(`    ... and ${packages.length - 10} more`));
    }
  }
  console.log("");
}

async function workspaceCheck(cwd: string): Promise<void> {
  const packages = await getWorkspacePackages(cwd);
  if (packages.length === 0) {
    printPlainError(createPSetupError({ code: "WORKSPACE_NO_PACKAGES", command: "workspace", subcommand: "check", cwd }));
    return;
  }

  console.log(chalk.blue.bold("\n  Workspace Health Check\n"));
  let issues = 0;

  for (const pkg of packages) {
    const pkgDir = join(cwd, pkg.path);
    const checks: string[] = [];

    if (!existsSync(join(pkgDir, "package.json"))) { checks.push("missing package.json"); issues++; }
    if (!existsSync(join(pkgDir, "src")) && !existsSync(join(pkgDir, "lib"))) { checks.push("no src/ or lib/"); }

    const icon = checks.length === 0 ? chalk.green("✓") : chalk.yellow("⚠");
    console.log(`  ${icon} ${pkg.name}${checks.length > 0 ? chalk.dim(` — ${checks.join(", ")}`) : ""}`);
  }

  console.log("");
  if (issues === 0) {
    console.log(chalk.green("  ✓ All packages look good"));
  } else {
    console.log(chalk.yellow(`  ${issues} issue(s) found`));
  }
}
