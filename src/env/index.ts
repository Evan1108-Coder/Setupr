import { access, copyFile, readFile, writeFile } from "fs/promises";
import { join } from "path";

export interface EnvInitResult {
  created: boolean;
  skipped: boolean;
  source: ".env.example" | "empty";
  reason?: "exists" | "missing-example";
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function initEnvFile(
  cwd: string,
  options: { overwrite?: boolean } = {}
): Promise<EnvInitResult> {
  const envPath = join(cwd, ".env");
  const examplePath = join(cwd, ".env.example");

  if (!options.overwrite && await fileExists(envPath)) {
    return { created: false, skipped: true, source: await fileExists(examplePath) ? ".env.example" : "empty", reason: "exists" };
  }

  if (await fileExists(examplePath)) {
    await copyFile(examplePath, envPath);
    return { created: true, skipped: false, source: ".env.example" };
  }

  if (!options.overwrite) {
    return { created: false, skipped: true, source: "empty", reason: "missing-example" };
  }

  await writeFile(envPath, "# Environment variables\n");
  return { created: true, skipped: false, source: "empty" };
}

export async function parseEnvKeysFromFile(path: string): Promise<string[]> {
  return parseEnvKeys(await readFile(path, "utf-8"));
}

export function parseEnvKeys(content: string): string[] {
  return content
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith("#");
    })
    .map((line) => normalizeEnvKey(line.split("=")[0].trim()))
    .filter(Boolean);
}

export function parseEnvPairs(content: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const line of content.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx > 0) {
      const key = normalizeEnvKey(line.slice(0, eqIdx).trim());
      let value = line.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      pairs[key] = value;
    }
  }
  return pairs;
}

export function normalizeEnvKey(key: string): string {
  return key.replace(/^export\s+/, "").trim();
}
