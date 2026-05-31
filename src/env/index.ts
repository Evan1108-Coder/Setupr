import { access, copyFile, readFile, writeFile } from "fs/promises";
import { join } from "path";

export interface EnvInitResult {
  created: boolean;
  skipped: boolean;
  source: ".env.example" | "empty";
  reason?: "exists" | "missing-example";
}

export interface EnvEditorEntry {
  key: string;
  value: string;
  templateValue?: string;
  fromTemplate: boolean;
  fromEnv: boolean;
  sensitive: boolean;
  status: "filled" | "missing" | "empty" | "extra";
}

export interface EnvEditorState {
  hasEnv: boolean;
  hasExample: boolean;
  entries: EnvEditorEntry[];
  missing: string[];
  extra: string[];
  source: ".env" | ".env.example" | "empty";
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

export async function loadEnvEditorState(cwd: string): Promise<EnvEditorState> {
  const envPath = join(cwd, ".env");
  const examplePath = join(cwd, ".env.example");
  const hasEnv = await fileExists(envPath);
  const hasExample = await fileExists(examplePath);
  const envContent = hasEnv ? await readFile(envPath, "utf-8") : "";
  const exampleContent = hasExample ? await readFile(examplePath, "utf-8") : "";
  const envPairs = parseEnvPairs(envContent);
  const examplePairs = parseEnvPairs(exampleContent);
  const envKeys = parseEnvKeys(envContent);
  const exampleKeys = parseEnvKeys(exampleContent);
  const orderedKeys = unique([...exampleKeys, ...envKeys]);

  const entries = orderedKeys.map((key) => {
    const fromTemplate = exampleKeys.includes(key);
    const fromEnv = envKeys.includes(key);
    const value = fromEnv ? envPairs[key] || "" : examplePairs[key] || "";
    const status: EnvEditorEntry["status"] = !fromTemplate
      ? "extra"
      : !fromEnv
        ? "missing"
        : value.trim()
          ? "filled"
          : "empty";
    return {
      key,
      value,
      templateValue: fromTemplate ? examplePairs[key] || "" : undefined,
      fromTemplate,
      fromEnv,
      sensitive: isSensitiveEnvKey(key),
      status,
    };
  });

  return {
    hasEnv,
    hasExample,
    entries,
    missing: entries.filter((entry) => entry.status === "missing" || entry.status === "empty").map((entry) => entry.key),
    extra: entries.filter((entry) => entry.status === "extra").map((entry) => entry.key),
    source: hasEnv ? ".env" : hasExample ? ".env.example" : "empty",
  };
}

export async function saveEnvEditorEntries(cwd: string, entries: EnvEditorEntry[]): Promise<void> {
  const envPath = join(cwd, ".env");
  const examplePath = join(cwd, ".env.example");
  const hasExample = await fileExists(examplePath);
  const hasEnv = await fileExists(envPath);
  const templateContent = hasExample ? await readFile(examplePath, "utf-8") : "";
  const envContent = hasEnv ? await readFile(envPath, "utf-8") : "";
  await writeFile(envPath, serializeEnvEntries(entries, templateContent, envContent));
}

export function mergeEnvEditorValues(entries: EnvEditorEntry[], values: Record<string, string>): EnvEditorEntry[] {
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  const next = entries.map((entry) => {
    if (!(entry.key in values)) return entry;
    const value = normalizeEnvValue(values[entry.key]);
    return {
      ...entry,
      value,
      fromEnv: true,
      status: entry.fromTemplate ? value.trim() ? "filled" as const : "empty" as const : "extra" as const,
    };
  });

  for (const [rawKey, rawValue] of Object.entries(values)) {
    const key = normalizeEnvKey(rawKey);
    if (!key || byKey.has(key)) continue;
    const value = normalizeEnvValue(rawValue);
    next.push({
      key,
      value,
      fromTemplate: false,
      fromEnv: true,
      sensitive: isSensitiveEnvKey(key),
      status: "extra",
    });
  }

  return next;
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

function serializeEnvEntries(entries: EnvEditorEntry[], templateContent: string, envContent: string): string {
  const values = new Map(entries.map((entry) => [entry.key, normalizeEnvValue(entry.value)]));
  const used = new Set<string>();
  const source = templateContent || envContent;
  const lines = source.split("\n");
  const output: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (index === lines.length - 1 && line === "") continue;
    if (!line.trim() || line.trim().startsWith("#")) {
      output.push(line);
      continue;
    }
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) {
      output.push(line);
      continue;
    }
    const rawKey = line.slice(0, eqIdx).trim();
    const key = normalizeEnvKey(rawKey);
    if (!key || !values.has(key)) {
      output.push(line);
      continue;
    }
    const prefix = rawKey.startsWith("export ") ? "export " : "";
    output.push(`${prefix}${key}=${values.get(key) || ""}`);
    used.add(key);
  }

  for (const entry of entries) {
    if (used.has(entry.key)) continue;
    output.push(`${entry.key}=${normalizeEnvValue(entry.value)}`);
  }

  const compact = output.join("\n").replace(/\n{3,}$/g, "\n\n");
  return compact.endsWith("\n") ? compact : `${compact}\n`;
}

function normalizeEnvValue(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").join("\\n").trim();
}

function isSensitiveEnvKey(key: string): boolean {
  return /(?:API_?KEY|TOKEN|SECRET|PASSWORD|PRIVATE|CREDENTIAL|AUTH)/i.test(key);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
