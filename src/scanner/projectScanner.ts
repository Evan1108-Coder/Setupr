import { readFile, access, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ScanResult } from "../store/appStore.js";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path: string): Promise<any | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function detectPackageManager(cwd: string, files: string[]): string | null {
  if (files.includes("pnpm-lock.yaml")) return "pnpm";
  if (files.includes("yarn.lock")) return "yarn";
  if (files.includes("bun.lockb")) return "bun";
  if (files.includes("package-lock.json")) return "npm";
  if (files.includes("package.json")) return "npm";
  return null;
}

function detectFramework(pkg: any): string | null {
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  if (deps?.next) return "Next.js";
  if (deps?.nuxt) return "Nuxt";
  if (deps?.svelte || deps?.["@sveltejs/kit"]) return "SvelteKit";
  if (deps?.astro) return "Astro";
  if (deps?.vite) return "Vite";
  if (deps?.react) return "React";
  if (deps?.vue) return "Vue";
  if (deps?.angular || deps?.["@angular/core"]) return "Angular";
  if (deps?.express) return "Express";
  if (deps?.fastify) return "Fastify";
  if (deps?.django) return "Django";
  if (deps?.flask) return "Flask";
  return null;
}

export async function scanProject(cwd: string): Promise<ScanResult> {
  const files = await readdir(cwd).catch(() => [] as string[]);

  const hasPackageJson = files.includes("package.json");
  const hasRequirements = files.includes("requirements.txt") || files.includes("pyproject.toml");
  const hasCargoToml = files.includes("Cargo.toml");
  const hasGoMod = files.includes("go.mod");
  const hasGemfile = files.includes("Gemfile");

  let language: string | null = null;
  let runtime: string | null = null;
  let framework: string | null = null;
  let dependencies = 0;

  const pkg = hasPackageJson ? await readJson(join(cwd, "package.json")) : null;

  if (hasPackageJson && pkg) {
    language = "TypeScript/JavaScript";
    runtime = "Node.js";
    framework = detectFramework(pkg);
    dependencies =
      Object.keys(pkg.dependencies || {}).length +
      Object.keys(pkg.devDependencies || {}).length;

    if (pkg.devDependencies?.typescript) {
      language = "TypeScript";
    }
  } else if (hasRequirements) {
    language = "Python";
    runtime = "Python";
  } else if (hasCargoToml) {
    language = "Rust";
    runtime = "Rust";
  } else if (hasGoMod) {
    language = "Go";
    runtime = "Go";
  } else if (hasGemfile) {
    language = "Ruby";
    runtime = "Ruby";
  }

  const packageManager = detectPackageManager(cwd, files);
  const hasEnvFile = await exists(join(cwd, ".env"));
  const hasEnvExample = await exists(join(cwd, ".env.example"));

  const scripts = pkg?.scripts || {};

  return {
    language,
    runtime,
    packageManager,
    framework,
    hasEnvFile,
    hasEnvExample,
    dependencies,
    scripts,
  };
}
