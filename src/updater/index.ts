import chalk from "chalk";
import { loadConfig, saveConfig } from "../state/config.js";

const PACKAGE_NAME = "p-setup";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface VersionInfo {
  current: string;
  latest: string;
  hasUpdate: boolean;
}

export async function checkForUpdates(silent = false): Promise<VersionInfo | null> {
  const config = await loadConfig();

  // Respect autoUpdate preference
  if (!config.preferences?.autoUpdate && silent) {
    return null;
  }

  // Rate limit checks to once per day
  const lastCheck = config.lastUpdateCheck || 0;
  if (silent && Date.now() - lastCheck < CHECK_INTERVAL_MS) {
    return null;
  }

  try {
    const currentVersion = await getCurrentVersion();
    const latestVersion = await fetchLatestVersion();

    // Update last check timestamp
    config.lastUpdateCheck = Date.now();
    await saveConfig(config);

    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

    if (hasUpdate && !silent) {
      printUpdateNotice(currentVersion, latestVersion);
    }

    return { current: currentVersion, latest: latestVersion, hasUpdate };
  } catch {
    if (!silent) {
      console.log(chalk.dim("Could not check for updates."));
    }
    return null;
  }
}

export async function getCurrentVersion(): Promise<string> {
  try {
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    const pkg = require("../../package.json");
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function fetchLatestVersion(): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    if (!res.ok) return "0.0.0";
    const data = (await res.json()) as { version?: string };
    return data.version || "0.0.0";
  } catch {
    clearTimeout(timeout);
    return "0.0.0";
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function printUpdateNotice(current: string, latest: string): void {
  console.log("");
  console.log(chalk.yellow("  ┌──────────────────────────────────────────┐"));
  console.log(chalk.yellow("  │") + chalk.white("  Update available! ") + chalk.dim(`${current}`) + chalk.white(" → ") + chalk.green(`${latest}`) + chalk.yellow("      │"));
  console.log(chalk.yellow("  │") + chalk.dim(`  Run: npm install -g ${PACKAGE_NAME}`) + chalk.yellow("        │"));
  console.log(chalk.yellow("  └──────────────────────────────────────────┘"));
  console.log("");
}
