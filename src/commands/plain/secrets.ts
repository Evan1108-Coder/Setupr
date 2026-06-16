import chalk from "chalk";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";
import { createSetuprError, fromUnknownError, printPlainError, type SetuprError } from "../../errors/index.js";

interface SecretsFlags {
  force?: boolean;
  args?: string[];
  key?: string;
  [key: string]: unknown;
}

function isSetuprError(error: unknown): error is SetuprError {
  const value = error as Partial<SetuprError> | undefined;
  return Boolean(value?.code && value.title && value.explanation && value.timestamp);
}

const SECRETS_DIR = ".setupr";
const SECRETS_FILE = "secrets.enc";
const KEY_FILE = "secrets.key";
const ALGORITHM = "aes-256-gcm";

export async function cmdSecrets(sub: string | undefined, cwd: string, flags: SecretsFlags): Promise<void> {
  try {
    switch (sub) {
      case "init": return await secretsInit(cwd, flags);
      case "set": return await secretsSet(cwd, flags);
      case "get": return await secretsGet(cwd, flags);
      case "list": return await secretsList(cwd);
      case "remove": return await secretsRemove(cwd, flags);
      case "export": return await secretsExport(cwd, flags);
      case "import": return await secretsImport(cwd, flags);
      case "rotate": return await secretsRotate(cwd);
      default:
        printPlainError(createSetuprError({
          code: "UNKNOWN_SUBCOMMAND",
          command: "secrets",
          subcommand: sub,
          cwd,
          details: ["Valid: init, set, get, list, remove, export, import, rotate"],
        }));
    }
  } catch (err) {
    printPlainError(isSetuprError(err) ? err : fromUnknownError(err, { command: "secrets", subcommand: sub, cwd }));
  }
}

async function secretsInit(cwd: string, flags: SecretsFlags): Promise<void> {
  const dir = join(cwd, SECRETS_DIR);
  await mkdir(dir, { recursive: true });

  const keyPath = join(dir, KEY_FILE);
  if (existsSync(keyPath) && !flags.force) {
    console.log(chalk.yellow("Encryption key already exists. Use --force to regenerate (will invalidate existing secrets)."));
    return;
  }

  const key = randomBytes(32).toString("hex");
  await writeFile(keyPath, key, { mode: 0o600 });
  console.log(chalk.green("✓ Generated encryption key"));
  console.log(chalk.dim("  The .setupr/secrets.enc file IS safe to commit."));

  const gitignorePath = join(cwd, ".gitignore");
  const content = existsSync(gitignorePath) ? await readFile(gitignorePath, "utf-8") : "";
  if (!content.includes(".setupr/secrets.key")) {
    const next = content.trimEnd()
      ? `${content.trimEnd()}\n.setupr/secrets.key\n`
      : ".setupr/secrets.key\n";
    await writeFile(gitignorePath, next);
    console.log(chalk.green("  ✓ Added secrets.key to .gitignore"));
  }
}

async function secretsSet(cwd: string, flags: SecretsFlags): Promise<void> {
  const name = flags.args?.[0];
  let value = flags.args?.[1];

  if (!name) {
    printPlainError(createSetuprError({
      code: "SECRETS_ENCRYPTION_FAILED",
      command: "secrets",
      subcommand: "set",
      cwd,
      details: ["Usage: setupr secrets set <name> [value]"],
    }));
    return;
  }

  if (!value && process.stdin.isTTY) {
    const { createInterface } = await import("readline");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    value = await new Promise<string>((r) => rl.question(`  Value for ${name}: `, r));
    rl.close();
  }

  if (!value) {
    console.log(chalk.yellow("No value provided."));
    return;
  }

  const secrets = await loadSecrets(cwd);
  secrets[name] = value;
  await saveSecrets(cwd, secrets);
  console.log(chalk.green(`✓ Set secret: ${name}`));
}

async function secretsGet(cwd: string, flags: SecretsFlags): Promise<void> {
  const name = flags.args?.[0];
  if (!name) {
    printPlainError(createSetuprError({
      code: "SECRETS_DECRYPTION_FAILED",
      command: "secrets",
      subcommand: "get",
      cwd,
      details: ["Usage: setupr secrets get <name>"],
    }));
    return;
  }

  const secrets = await loadSecrets(cwd);
  if (name in secrets) {
    console.log(secrets[name]);
  } else {
    console.log(chalk.yellow(`Secret "${name}" not found.`));
  }
}

async function secretsList(cwd: string): Promise<void> {
  const secrets = await loadSecrets(cwd);
  const keys = Object.keys(secrets);

  if (keys.length === 0) {
    console.log(chalk.dim("No secrets stored."));
    return;
  }

  console.log(chalk.blue.bold("\n  Stored Secrets\n"));
  for (const key of keys) {
    const masked = secrets[key].length > 4
      ? secrets[key].slice(0, 4) + "****"
      : "****";
    console.log(`  ${chalk.green(key.padEnd(30))} ${chalk.dim(masked)}`);
  }
  console.log(chalk.dim(`\n  ${keys.length} secret(s) stored`));
}

async function secretsRemove(cwd: string, flags: SecretsFlags): Promise<void> {
  const name = flags.args?.[0];
  if (!name) return;

  const secrets = await loadSecrets(cwd);
  if (!(name in secrets)) {
    console.log(chalk.yellow(`Secret "${name}" not found.`));
    return;
  }

  delete secrets[name];
  await saveSecrets(cwd, secrets);
  console.log(chalk.green(`✓ Removed secret: ${name}`));
}

async function secretsExport(cwd: string, flags: SecretsFlags): Promise<void> {
  const secrets = await loadSecrets(cwd);
  const target = flags.args?.[0] || ".env";
  const envPath = join(cwd, target);

  let existing = "";
  if (existsSync(envPath)) {
    existing = await readFile(envPath, "utf-8");
  }

  const lines = existing.split("\n");
  for (const [key, value] of Object.entries(secrets)) {
    const idx = lines.findIndex(l => l.startsWith(`${key}=`));
    if (idx >= 0) {
      lines[idx] = `${key}=${value}`;
    } else {
      lines.push(`${key}=${value}`);
    }
  }

  await writeFile(envPath, lines.join("\n").replace(/\n*$/, "\n"));
  console.log(chalk.green(`✓ Exported ${Object.keys(secrets).length} secrets to ${target}`));
}

async function secretsImport(cwd: string, flags: SecretsFlags): Promise<void> {
  const source = flags.args?.[0] || ".env";
  const envPath = join(cwd, source);

  if (!existsSync(envPath)) {
    console.log(chalk.yellow(`File not found: ${source}`));
    return;
  }

  const content = await readFile(envPath, "utf-8");
  const secrets = await loadSecrets(cwd);
  let count = 0;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).replace(/^export\s+/, "").trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && value && (key.includes("KEY") || key.includes("SECRET") || key.includes("TOKEN") || key.includes("PASSWORD"))) {
      secrets[key] = value;
      count++;
    }
  }

  await saveSecrets(cwd, secrets);
  console.log(chalk.green(`✓ Imported ${count} secrets from ${source}`));
}

async function secretsRotate(cwd: string): Promise<void> {
  const secrets = await loadSecrets(cwd);
  const keyPath = join(cwd, SECRETS_DIR, KEY_FILE);

  const newKey = randomBytes(32).toString("hex");
  await writeFile(keyPath, newKey, { mode: 0o600 });
  await saveSecrets(cwd, secrets);
  console.log(chalk.green("✓ Rotated encryption key and re-encrypted all secrets"));
}

function getEncryptionKey(cwd: string): Buffer {
  const keyPath = join(cwd, SECRETS_DIR, KEY_FILE);
  if (!existsSync(keyPath)) {
    throw createSetuprError({ code: "SECRETS_KEY_MISSING", command: "secrets", cwd });
  }
  const hex = readFileSync(keyPath, "utf-8").trim();
  return scryptSync(hex, "setupr-salt", 32);
}

async function loadSecrets(cwd: string): Promise<Record<string, string>> {
  const filePath = join(cwd, SECRETS_DIR, SECRETS_FILE);
  if (!existsSync(filePath)) return {};

  try {
    const key = getEncryptionKey(cwd);
    const raw = await readFile(filePath, "utf-8");
    const { iv, tag, data } = JSON.parse(raw);

    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "hex"));
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    let decrypted = decipher.update(data, "hex", "utf-8");
    decrypted += decipher.final("utf-8");
    return JSON.parse(decrypted);
  } catch (err) {
    throw createSetuprError({
      code: "SECRETS_FILE_CORRUPT",
      command: "secrets",
      cwd,
      details: [err instanceof Error ? err.message : String(err)],
    });
  }
}

async function saveSecrets(cwd: string, secrets: Record<string, string>): Promise<void> {
  const dir = join(cwd, SECRETS_DIR);
  await mkdir(dir, { recursive: true });

  const key = getEncryptionKey(cwd);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(JSON.stringify(secrets), "utf-8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");

  const payload = JSON.stringify({ iv: iv.toString("hex"), tag, data: encrypted });
  await writeFile(join(dir, SECRETS_FILE), payload, { mode: 0o600 });
}
