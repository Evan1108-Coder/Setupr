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

// Detection Priority: Explicit config > File scanning > Content analysis > AI fallback
// This implements levels 1-3; AI fallback is handled by the orchestrator.

// Level 1: Explicit config (.p-setup.json or package.json "p-setup" field)
async function detectFromConfig(cwd: string): Promise<Partial<ScanResult> | null> {
  const configPath = join(cwd, ".p-setup.json");
  const config = await readJson(configPath);
  if (config) {
    return {
      language: config.language || null,
      runtime: config.runtime || null,
      packageManager: config.packageManager || null,
      framework: config.framework || null,
    };
  }

  const pkg = await readJson(join(cwd, "package.json"));
  if (pkg?.["p-setup"]) {
    const ps = pkg["p-setup"];
    return {
      language: ps.language || null,
      runtime: ps.runtime || null,
      packageManager: ps.packageManager || null,
      framework: ps.framework || null,
    };
  }

  return null;
}

// Level 2: File scanning (lock files, config files, project markers)
function detectPackageManager(files: string[]): string | null {
  if (files.includes("pnpm-lock.yaml")) return "pnpm";
  if (files.includes("yarn.lock")) return "yarn";
  if (files.includes("bun.lockb") || files.includes("bun.lock")) return "bun";
  if (files.includes("package-lock.json")) return "npm";
  if (files.includes("package.json")) return "npm";
  if (files.includes("Pipfile.lock")) return "pipenv";
  if (files.includes("poetry.lock")) return "poetry";
  if (files.includes("Gemfile.lock")) return "bundler";
  return null;
}

// Level 3: Content analysis (read file contents to detect framework, etc.)
function detectFramework(pkg: any): string | null {
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  if (deps?.next) return "Next.js";
  if (deps?.nuxt) return "Nuxt";
  if (deps?.svelte || deps?.["@sveltejs/kit"]) return "SvelteKit";
  if (deps?.astro) return "Astro";
  if (deps?.vite && !deps?.react && !deps?.vue) return "Vite";
  if (deps?.react && deps?.["react-native"]) return "React Native";
  if (deps?.react) return "React";
  if (deps?.vue) return "Vue";
  if (deps?.angular || deps?.["@angular/core"]) return "Angular";
  if (deps?.express) return "Express";
  if (deps?.fastify) return "Fastify";
  if (deps?.hono) return "Hono";
  if (deps?.elysia) return "Elysia";
  if (deps?.django) return "Django";
  if (deps?.flask) return "Flask";
  return null;
}

function detectLanguageFromFiles(files: string[]): { language: string; runtime: string } | null {
  const hasTsConfig = files.includes("tsconfig.json");
  const hasPackageJson = files.includes("package.json");
  const hasRequirements = files.includes("requirements.txt") || files.includes("pyproject.toml") || files.includes("Pipfile");
  const hasCargoToml = files.includes("Cargo.toml");
  const hasGoMod = files.includes("go.mod");
  const hasGemfile = files.includes("Gemfile");
  const hasMix = files.includes("mix.exs");
  const hasComposer = files.includes("composer.json");
  const hasPubspec = files.includes("pubspec.yaml");

  if (hasTsConfig && hasPackageJson) return { language: "TypeScript", runtime: "Node.js" };
  if (hasPackageJson) return { language: "JavaScript", runtime: "Node.js" };
  if (hasRequirements) return { language: "Python", runtime: "Python" };
  if (hasCargoToml) return { language: "Rust", runtime: "Rust" };
  if (hasGoMod) return { language: "Go", runtime: "Go" };
  if (hasGemfile) return { language: "Ruby", runtime: "Ruby" };
  if (hasMix) return { language: "Elixir", runtime: "Elixir" };
  if (hasComposer) return { language: "PHP", runtime: "PHP" };
  if (hasPubspec) return { language: "Dart", runtime: "Dart" };

  return null;
}

export async function scanProject(cwd: string): Promise<ScanResult> {
  const files = await readdir(cwd).catch(() => [] as string[]);

  // Priority 1: Explicit config
  const configResult = await detectFromConfig(cwd);

  // Priority 2: File scanning
  const langFromFiles = detectLanguageFromFiles(files);
  const packageManager = detectPackageManager(files);

  // Priority 3: Content analysis
  const pkg = files.includes("package.json") ? await readJson(join(cwd, "package.json")) : null;
  const framework = detectFramework(pkg);
  const dependencies = pkg
    ? Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length
    : 0;

  // Refine language: if pkg has typescript dep, upgrade to TypeScript
  const hasTypescriptDep = !!(pkg?.devDependencies?.typescript || pkg?.dependencies?.typescript);
  if (langFromFiles && hasTypescriptDep) {
    langFromFiles.language = "TypeScript";
  }

  const hasEnvFile = await exists(join(cwd, ".env"));
  const hasEnvExample = await exists(join(cwd, ".env.example"));
  const scripts = pkg?.scripts || {};

  // Merge with config taking priority
  return {
    language: configResult?.language || langFromFiles?.language || null,
    runtime: configResult?.runtime || langFromFiles?.runtime || null,
    packageManager: configResult?.packageManager || packageManager,
    framework: configResult?.framework || framework,
    hasEnvFile,
    hasEnvExample,
    dependencies,
    scripts,
  };
}
