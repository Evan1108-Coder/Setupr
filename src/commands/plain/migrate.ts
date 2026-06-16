import chalk from "chalk";
import { existsSync } from "fs";
import { readFile, writeFile, rm } from "fs/promises";
import { join } from "path";
import { runCommand } from "../../executor/index.js";
import { createSetuprError, printPlainError } from "../../errors/index.js";
import { scanProject } from "../../scanner/index.js";

interface MigrateFlags {
  force?: boolean;
  args?: string[];
  [key: string]: unknown;
}

type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

const LOCKFILES: Record<PackageManager, string> = {
  npm: "package-lock.json",
  yarn: "yarn.lock",
  pnpm: "pnpm-lock.yaml",
  bun: "bun.lockb",
};

const INSTALL_CMD: Record<PackageManager, string> = {
  npm: "npm install",
  yarn: "yarn install",
  pnpm: "pnpm install",
  bun: "bun install",
};

export async function cmdMigrate(sub: string | undefined, cwd: string, flags: MigrateFlags): Promise<void> {
  if (!sub) {
    printPlainError(createSetuprError({
      code: "MIGRATE_UNSUPPORTED",
      command: "migrate",
      cwd,
      details: ["Usage: setupr migrate <target-pm>", "Supported: npm, yarn, pnpm, bun"],
    }));
    return;
  }

  const target = sub as PackageManager;
  if (!LOCKFILES[target]) {
    printPlainError(createSetuprError({
      code: "MIGRATE_UNSUPPORTED",
      command: "migrate",
      cwd,
      details: [`"${sub}" is not a supported package manager.`, "Supported: npm, yarn, pnpm, bun"],
    }));
    return;
  }

  const scan = await scanProject(cwd);
  const current = scan.packageManager as PackageManager | null;

  if (!current) {
    printPlainError(createSetuprError({
      code: "MISSING_PACKAGE_JSON",
      command: "migrate",
      cwd,
      details: ["No package.json found. Cannot determine current package manager."],
    }));
    return;
  }

  if (current === target) {
    console.log(chalk.green(`✓ Already using ${target}.`));
    return;
  }

  const verifyResult = await runCommand(`${target} --version`, cwd);
  if (verifyResult.exitCode !== 0) {
    printPlainError(createSetuprError({
      code: "MISSING_PACKAGE_MANAGER",
      command: "migrate",
      cwd,
      details: [`${target} is not installed or not on PATH.`],
    }));
    return;
  }

  console.log(chalk.blue.bold(`\n  Migrating: ${current} → ${target}\n`));

  const currentLockfile = LOCKFILES[current];
  if (existsSync(join(cwd, currentLockfile))) {
    if (!flags.force) {
      const otherLocks = Object.entries(LOCKFILES)
        .filter(([pm]) => pm !== current && pm !== target)
        .filter(([, file]) => existsSync(join(cwd, file)));

      if (otherLocks.length > 0) {
        printPlainError(createSetuprError({
          code: "MIGRATE_LOCKFILE_CONFLICT",
          command: "migrate",
          cwd,
          details: [`Found extra lockfiles: ${otherLocks.map(([, f]) => f).join(", ")}`, "Use --force to proceed anyway."],
        }));
        return;
      }
    }

    await rm(join(cwd, currentLockfile), { force: true });
    console.log(chalk.green(`  ✓ Removed ${currentLockfile}`));
  }

  if (existsSync(join(cwd, "node_modules"))) {
    await rm(join(cwd, "node_modules"), { recursive: true, force: true });
    console.log(chalk.green("  ✓ Removed node_modules"));
  }

  const pkgPath = join(cwd, "package.json");
  try {
    const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
    if (target === "pnpm" && !pkg.packageManager) {
      const vResult = await runCommand(`${target} --version`, cwd);
      pkg.packageManager = `pnpm@${vResult.stdout.trim()}`;
    } else if (target !== "pnpm" && pkg.packageManager) {
      delete pkg.packageManager;
    }
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  } catch {}

  console.log(chalk.blue(`  Installing with ${target}...`));
  const installResult = await runCommand(INSTALL_CMD[target], cwd);
  if (installResult.exitCode !== 0) {
    printPlainError(createSetuprError({
      code: "MIGRATE_FAILED",
      command: "migrate",
      cwd,
      details: [installResult.stderr.slice(0, 500)],
    }));
    return;
  }

  console.log(chalk.green(`  ✓ Installed dependencies with ${target}`));
  console.log(chalk.green(`\n✓ Migration complete: ${current} → ${target}`));
  console.log(chalk.dim(`  New lockfile: ${LOCKFILES[target]}`));
}
