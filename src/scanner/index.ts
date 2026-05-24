import { detectFromConfig } from "./configDetector.js";
import { detectLanguage } from "./languageDetector.js";
import { detectFramework } from "./frameworkDetector.js";
import { detectPackageManager } from "./packageManager.js";
import { detectRuntime } from "./runtimeDetector.js";
import { detectServices } from "./serviceDetector.js";
import { detectMonorepo } from "./monorepoDetector.js";

export interface ScanResult {
  language: string | null;
  framework: string | null;
  packageManager: string | null;
  runtime: { name: string; version: string | null } | null;
  services: string[];
  monorepo: { type: string; packages: string[] } | null;
  scripts: Record<string, string>;
  dependencies: { prod: number; dev: number };
  configFiles: string[];
}

export async function scanProject(cwd: string): Promise<ScanResult> {
  const configResult = await detectFromConfig(cwd);

  const [language, framework, packageManager, runtime, services, monorepo] =
    await Promise.all([
      configResult?.language
        ? Promise.resolve(configResult.language)
        : detectLanguage(cwd),
      configResult?.framework
        ? Promise.resolve(configResult.framework)
        : detectFramework(cwd),
      detectPackageManager(cwd),
      detectRuntime(cwd),
      detectServices(cwd),
      detectMonorepo(cwd),
    ]);

  const scripts = await getScripts(cwd, packageManager);
  const deps = await getDependencyCounts(cwd);
  const configFiles = await findConfigFiles(cwd);

  return {
    language: configResult?.language || language,
    framework: configResult?.framework || framework,
    packageManager,
    runtime,
    services,
    monorepo,
    scripts,
    dependencies: deps,
    configFiles,
  };
}

async function getScripts(
  cwd: string,
  pm: string | null
): Promise<Record<string, string>> {
  const { readFile } = await import("fs/promises");
  const { join } = await import("path");
  try {
    if (pm === "npm" || pm === "yarn" || pm === "pnpm" || pm === "bun") {
      const pkg = JSON.parse(
        await readFile(join(cwd, "package.json"), "utf-8")
      );
      return pkg.scripts || {};
    }
  } catch {}
  return {};
}

async function getDependencyCounts(
  cwd: string
): Promise<{ prod: number; dev: number }> {
  const { readFile, access } = await import("fs/promises");
  const { join } = await import("path");

  // Try package.json first
  try {
    const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf-8"));
    const prod = Object.keys(pkg.dependencies || {}).length;
    const dev = Object.keys(pkg.devDependencies || {}).length;
    if (prod > 0 || dev > 0) return { prod, dev };
  } catch {}

  // Try requirements.txt (Python)
  try {
    const content = await readFile(join(cwd, "requirements.txt"), "utf-8");
    const deps = content.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("-"));
    return { prod: deps.length, dev: 0 };
  } catch {}

  // Try Cargo.toml (Rust)
  try {
    const content = await readFile(join(cwd, "Cargo.toml"), "utf-8");
    let prod = 0, dev = 0;
    let section = "";
    for (const line of content.split("\n")) {
      if (line.startsWith("[")) section = line;
      else if (section === "[dependencies]" && line.includes("=") && line.trim() && !line.trim().startsWith("#")) prod++;
      else if (section === "[dev-dependencies]" && line.includes("=") && line.trim() && !line.trim().startsWith("#")) dev++;
    }
    return { prod, dev };
  } catch {}

  // Try go.mod (Go)
  try {
    const content = await readFile(join(cwd, "go.mod"), "utf-8");
    const reqs = content.split("\n").filter((l) => l.trim().startsWith("require") || (l.startsWith("\t") && l.includes("/")));
    return { prod: Math.max(reqs.length - 1, 0), dev: 0 };
  } catch {}

  return { prod: 0, dev: 0 };
}

async function findConfigFiles(cwd: string): Promise<string[]> {
  const { readdir } = await import("fs/promises");
  const configs: string[] = [];
  const known = [
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "next.config.js",
    "next.config.mjs",
    "webpack.config.js",
    ".eslintrc.json",
    ".eslintrc.js",
    "eslint.config.js",
    ".prettierrc",
    "prettier.config.js",
    "jest.config.ts",
    "vitest.config.ts",
    "tailwind.config.js",
    "tailwind.config.ts",
    "postcss.config.js",
    "docker-compose.yml",
    "docker-compose.yaml",
    "Dockerfile",
    ".env.example",
    ".env.local",
    "Makefile",
    "Cargo.toml",
    "go.mod",
    "pyproject.toml",
    "setup.py",
    "requirements.txt",
    "Gemfile",
    "mix.exs",
    "pubspec.yaml",
    "composer.json",
    ".p-setup.json",
  ];
  try {
    const files = await readdir(cwd);
    for (const f of files) {
      if (known.includes(f)) configs.push(f);
    }
  } catch {}
  return configs;
}
