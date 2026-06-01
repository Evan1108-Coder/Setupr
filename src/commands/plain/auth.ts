import chalk from "chalk";
import { createInterface } from "readline";
import { stdin as input, stdout as output } from "process";
import {
  AUTH_PROVIDERS,
  clearStoredProviderKeys,
  getStoredProviderKey,
  isAuthProvider,
  listStoredProviderKeys,
  maskApiKey,
  removeStoredProviderKey,
  setStoredProviderKey,
  secretsPath,
} from "../../auth/secrets.js";
import {
  MODELS,
  PROVIDERS,
  describeDefaultModelSelection,
  formatModelPrice,
  getDefaultModel,
  getProviderEnvValue,
  getProviderKeySource,
  resolveModel,
  type AIProvider,
} from "../../ai/models.js";
import { chat } from "../../ai/client.js";
import { updateConfig } from "../../state/config.js";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { parseEnvPairs } from "../../env/index.js";
import { classifyAIProviderError, createSetuprError, fromUnknownError, printPlainError, type SetuprError } from "../../errors/index.js";
import { fallbackModelsFor, providerDiagnostics } from "../../agent/providerDiagnostics.js";

interface AuthFlags {
  force?: boolean;
  key?: string;
  args?: string[];
}

const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  groq: "Groq",
  minimax: "MiniMax",
  moonshot: "Moonshot",
  github: "GitHub Models",
};

export async function cmdAuth(sub: string | undefined, cwd: string, flags: AuthFlags): Promise<void> {
  try {
    switch (sub || "list") {
      case "list":
        await authList();
        return;
      case "status":
        await authStatus();
        return;
      case "set-key":
        await authSetKey(providerArg(flags), flags);
        return;
      case "remove":
      case "logout":
        await authRemove(providerArg(flags), flags);
        return;
      case "reset":
        await authReset(flags);
        return;
      case "test":
        await authTest(providerArg(flags));
        return;
      case "models":
        await authModels();
        return;
      case "use":
        await authUse(modelArg(flags));
        return;
      case "doctor":
        await authDoctor();
        return;
      case "login":
        await authLogin(flags);
        return;
      case "migrate":
        await authMigrate(cwd, flags);
        return;
      default:
        printPlainError(createSetuprError({
          code: "UNKNOWN_SUBCOMMAND",
          command: "auth",
          subcommand: sub,
          details: ["Run setup help auth for auth commands."],
        }));
    }
  } catch (err) {
    printPlainError(isSetuprError(err) ? err : fromUnknownError(err, { command: "auth", subcommand: sub, cwd }));
  }
}

function isSetuprError(error: unknown): error is SetuprError {
  const value = error as Partial<SetuprError> | undefined;
  return Boolean(value?.code && value.title && value.explanation && value.timestamp);
}

async function authList(): Promise<void> {
  const rows = await listStoredProviderKeys();
  console.log(chalk.blue.bold("\n  Setupr Auth\n"));
  console.log(chalk.dim(`  Global secrets: ${secretsPath()}\n`));
  for (const row of rows) {
    const source = getProviderKeySource(row.provider);
    const sourceText = source === "environment"
      ? "shell env"
      : source === "global-auth"
        ? "global auth"
        : source === "project-env"
          ? "project env"
          : "missing";
    const key = getProviderEnvValue(row.provider);
    const status = key ? chalk.green("configured") : chalk.dim("missing");
    console.log(`  ${chalk.white(PROVIDER_LABELS[row.provider].padEnd(15))} ${status.padEnd(18)} ${key ? chalk.dim(maskApiKey(key)) : ""} ${chalk.dim(sourceText)}`);
  }
  console.log("");
}

async function authStatus(): Promise<void> {
  const model = getDefaultModel();
  const source = getProviderKeySource(model.provider);
  const key = getProviderEnvValue(model.provider);
  console.log(chalk.blue.bold("\n  Setupr Auth Status\n"));
  console.log(`  Active model:   ${chalk.white(model.id)}`);
  console.log(`  Provider:       ${chalk.white(PROVIDER_LABELS[model.provider])}`);
  console.log(`  Key source:     ${chalk.white(source || "missing")}`);
  console.log(`  API key:        ${key ? chalk.dim(maskApiKey(key)) : chalk.red("missing")}`);
  console.log(`  Selection:      ${chalk.dim(describeDefaultModelSelection())}`);
  console.log("");
}

async function authSetKey(provider: string | undefined, flags: AuthFlags): Promise<void> {
  const resolved = requireProvider(provider);
  if (!resolved) return;

  const existing = await getStoredProviderKey(resolved);
  if (existing && !flags.force) {
    console.log(chalk.yellow(`${PROVIDER_LABELS[resolved]} already has a saved API key: ${maskApiKey(existing)}`));
    const confirmed = await confirm("Replace it?");
    if (!confirmed) {
      console.log(chalk.dim("Left the existing key unchanged."));
      return;
    }
  }

  if (flags.key) {
    console.log(chalk.yellow("Warning: inline API keys can be saved in shell history. The hidden prompt is safer."));
  }
  const apiKey = flags.key || await promptSecret(`Enter ${PROVIDER_LABELS[resolved]} API key: `);
  if (!apiKey.trim()) {
    printPlainError(createSetuprError({ code: "AUTH_KEY_EMPTY", command: "auth", subcommand: "set-key" }));
    return;
  }

  await setStoredProviderKey(resolved, apiKey);
  console.log(chalk.green(`✓ Saved ${PROVIDER_LABELS[resolved]} API key globally (${maskApiKey(apiKey)})`));
  console.log(chalk.dim(`  Stored in ${secretsPath()} with file permissions 0600.`));
}

async function authRemove(provider: string | undefined, flags: AuthFlags): Promise<void> {
  const resolved = requireProvider(provider);
  if (!resolved) return;
  const existing = await getStoredProviderKey(resolved);
  if (!existing) {
    console.log(chalk.dim(`${PROVIDER_LABELS[resolved]} has no saved global API key.`));
    return;
  }
  if (!flags.force) {
    const confirmed = await confirm(`Remove saved ${PROVIDER_LABELS[resolved]} API key ${maskApiKey(existing)}?`);
    if (!confirmed) {
      console.log(chalk.dim("Left the key unchanged."));
      return;
    }
  }
  await removeStoredProviderKey(resolved);
  console.log(chalk.green(`✓ Removed ${PROVIDER_LABELS[resolved]} API key from global auth.`));
}

async function authReset(flags: AuthFlags): Promise<void> {
  if (!flags.force) {
    const confirmed = await confirm("Remove every saved Setupr provider API key?");
    if (!confirmed) {
      console.log(chalk.dim("Auth reset cancelled."));
      return;
    }
  }
  await clearStoredProviderKeys();
  console.log(chalk.green("✓ Removed all saved Setupr auth keys."));
}

async function authTest(provider?: string): Promise<void> {
  const providers = provider ? [provider] : AUTH_PROVIDERS;
  console.log(chalk.blue.bold("\n  Setupr Auth Test\n"));
  console.log(chalk.dim("  Sends tiny requests to configured providers; raw keys are never printed.\n"));
  const results = await Promise.all(providers.map(async (name) => {
    const resolved = requireProvider(name, false);
    if (!resolved) {
      return { failure: true, lines: [chalk.red(`  ✗ Unknown provider: ${name}`)] };
    }
    const model = preferredTestModel(resolved);
    if (!getProviderEnvValue(resolved)) {
      return { failure: false, lines: [`  ${chalk.dim("○")} ${PROVIDER_LABELS[resolved].padEnd(15)} ${chalk.dim("missing API key")}`] };
    }
    try {
      const started = Date.now();
      const timeoutMs = authTestTimeoutMs(resolved);
      const result = await chatWithModel(model.id, timeoutMs);
      return {
        failure: false,
        lines: [`  ${chalk.green("✓")} ${PROVIDER_LABELS[resolved].padEnd(15)} ${model.id} ${chalk.dim(`${Date.now() - started}ms, ${result.tokens} tokens`)}`],
      };
    } catch (err) {
      const psetupError = classifyAIProviderError(err, {
        command: "auth",
        subcommand: "test",
        details: [`Provider: ${resolved}`, `Model: ${model.id}`],
      });
      return {
        failure: true,
        lines: [
          `  ${chalk.red("✗")} ${PROVIDER_LABELS[resolved].padEnd(15)} ${model.id} ${chalk.red(psetupError.title)}`,
          chalk.dim(`    ${psetupError.explanation}`),
          ...(psetupError.nextSteps || []).map((step) => chalk.dim(`    • ${step}`)),
        ],
      };
    }
  }));
  let failures = 0;
  for (const result of results) {
    if (result.failure) failures++;
    for (const line of result.lines) console.log(line);
  }
  console.log("");
  if (failures > 0) process.exitCode = 1;
}

async function authModels(): Promise<void> {
  console.log(chalk.blue.bold("\n  Setupr Auth Models\n"));
  const active = getDefaultModel();
  for (const provider of AUTH_PROVIDERS) {
    const hasKey = Boolean(getProviderEnvValue(provider));
    const config = PROVIDERS[provider];
    console.log(`  ${hasKey ? chalk.green("●") : chalk.red("○")} ${chalk.white(PROVIDER_LABELS[provider])} ${chalk.dim([config.envKey, ...(config.envAliases || [])].join(" or "))}`);
    for (const model of MODELS.filter((candidate) => candidate.provider === provider)) {
      const marker = model.id === active.id ? chalk.yellow("★ ") : "  ";
      console.log(`  ${marker}${hasKey ? chalk.green(model.id) : chalk.dim(model.id)} — ${model.name} ${chalk.dim(formatModelPrice(model))}`);
    }
  }
  console.log("");
}

async function authUse(modelId: string | undefined): Promise<void> {
  if (!modelId) {
    printPlainError(createSetuprError({ code: "AI_MODEL_REQUIRED", command: "auth", subcommand: "use" }));
    return;
  }
  const model = resolveModel(modelId);
  if (!model) {
    printPlainError(createSetuprError({
      code: "AI_MODEL_UNKNOWN",
      command: "auth",
      subcommand: "use",
      details: [`Requested: ${modelId}`],
    }));
    return;
  }
  await updateConfig({ ai: { model: model.id, enabled: true } });
  console.log(chalk.green(`✓ Active model set to ${model.id}`));
  if (!getProviderEnvValue(model.provider)) {
    console.log(chalk.yellow(`  ${PROVIDER_LABELS[model.provider]} does not have a configured API key yet.`));
    console.log(chalk.dim(`  Run: setup auth set-key ${model.provider}`));
  }
}

async function authDoctor(): Promise<void> {
  await authStatus();
  await authList();
  console.log(chalk.blue.bold("  Diagnostics\n"));
  console.log(`  Secret file: ${chalk.dim(secretsPath())}`);
  console.log(`  Storage:     ${chalk.dim("global user auth, not project .env")}`);
  console.log(`  Project env: ${chalk.dim("still used for app/project variables; provider keys should be migrated")}`);
  console.log("");
  console.log(chalk.blue.bold("  Provider Robustness\n"));
  for (const diagnostic of providerDiagnostics()) {
    const marker = diagnostic.configured ? chalk.green("●") : chalk.dim("○");
    const fallback = diagnostic.profile.fallbackModels.join(", ");
    console.log(`  ${marker} ${PROVIDER_LABELS[diagnostic.provider].padEnd(15)} timeout ${diagnostic.profile.timeoutMs}ms, retries ${diagnostic.profile.retries}, fallback ${chalk.dim(fallback || "none")}`);
  }
  const active = getDefaultModel();
  const fallbacks = fallbackModelsFor(active).slice(0, 4).map((model) => model.id);
  console.log(chalk.dim(`\n  Active fallback chain: ${fallbacks.length ? fallbacks.join(" -> ") : "none configured"}`));
  console.log("");
}

async function authLogin(flags: AuthFlags): Promise<void> {
  console.log(chalk.blue.bold("\n  Setupr Auth Login\n"));
  const provider = await promptChoice("Provider", AUTH_PROVIDERS);
  await authSetKey(provider, flags);
  await authTest(provider);
}

async function authMigrate(cwd: string, flags: AuthFlags): Promise<void> {
  const envPath = join(cwd, ".env");
  const content = await readFile(envPath, "utf-8").catch(() => "");
  if (!content.trim()) {
    console.log(chalk.dim("No project .env file found to migrate."));
    return;
  }
  const pairs = parseEnvPairs(content);
  const migrated: Array<{ provider: AIProvider; keyName: string; value: string }> = [];
  for (const provider of AUTH_PROVIDERS) {
    const config = PROVIDERS[provider];
    for (const keyName of [config.envKey, ...(config.envAliases || [])]) {
      if (pairs[keyName]?.trim()) {
        migrated.push({ provider, keyName, value: pairs[keyName] });
        break;
      }
    }
  }
  if (migrated.length === 0) {
    console.log(chalk.dim("No Setupr provider API keys were found in project .env."));
    return;
  }
  console.log(chalk.yellow(`Found ${migrated.length} Setupr provider key${migrated.length === 1 ? "" : "s"} in project .env.`));
  for (const item of migrated) {
    console.log(chalk.dim(`  • ${item.keyName} -> ${PROVIDER_LABELS[item.provider]} ${maskApiKey(item.value)}`));
  }
  if (!flags.force) {
    const confirmed = await confirm("Move these keys to global auth and remove them from project .env?");
    if (!confirmed) {
      console.log(chalk.dim("Migration cancelled."));
      return;
    }
  }

  for (const item of migrated) {
    await setStoredProviderKey(item.provider, item.value);
  }
  const keyNames = new Set(migrated.map((item) => item.keyName));
  const next = content
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return true;
      const key = trimmed.slice(0, trimmed.indexOf("=")).trim().replace(/^export\s+/, "");
      return !keyNames.has(key);
    })
    .join("\n")
    .replace(/\n*$/, "\n");
  await writeFile(envPath, next);
  console.log(chalk.green(`✓ Migrated ${migrated.length} provider key${migrated.length === 1 ? "" : "s"} to global auth.`));
  console.log(chalk.dim("  Removed migrated provider keys from project .env; app/project env values were preserved."));
}

function providerArg(flags: AuthFlags): string | undefined {
  return flags.args?.[0];
}

function modelArg(flags: AuthFlags): string | undefined {
  return flags.args?.[0];
}

function requireProvider(provider: string | undefined, setExitCode = true): AIProvider | null {
  if (!provider) {
    printPlainError(createSetuprError({
      code: "AUTH_PROVIDER_REQUIRED",
      command: "auth",
      details: [`Providers: ${AUTH_PROVIDERS.join(", ")}`],
    }));
    if (setExitCode) process.exitCode = 1;
    return null;
  }
  if (!isAuthProvider(provider)) {
    printPlainError(createSetuprError({
      code: "AUTH_PROVIDER_UNKNOWN",
      command: "auth",
      details: [`Received: ${provider}`, `Providers: ${AUTH_PROVIDERS.join(", ")}`],
    }));
    if (setExitCode) process.exitCode = 1;
    return null;
  }
  return provider;
}

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const answer = await ask(`${question} [y/N] `);
  return /^(y|yes)$/i.test(answer.trim());
}

async function promptSecret(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    printPlainError(createSetuprError({
      code: "NON_INTERACTIVE_INPUT_REQUIRED",
      command: "auth",
      subcommand: "set-key",
      details: ["Pass --key <api-key> or rerun in an interactive terminal."],
    }));
    return "";
  }
  return askHidden(question);
}

async function promptChoice(label: string, choices: AIProvider[]): Promise<AIProvider> {
  console.log(chalk.dim(`  ${label}:`));
  choices.forEach((choice, index) => console.log(chalk.dim(`    ${index + 1}. ${PROVIDER_LABELS[choice]} (${choice})`)));
  const answer = await ask("Choose provider: ");
  const numeric = Number(answer.trim());
  if (Number.isInteger(numeric) && choices[numeric - 1]) return choices[numeric - 1];
  const trimmed = answer.trim();
  if (isAuthProvider(trimmed)) return trimmed;
  printPlainError(createSetuprError({
    code: "AUTH_PROVIDER_UNKNOWN",
    command: "auth",
    subcommand: "login",
    details: [`Received: ${trimmed || "(blank)"}`],
    canContinue: true,
  }));
  const fallback = "github";
  console.log(chalk.dim(`Continuing with ${PROVIDER_LABELS[fallback]}. Use setup auth set-key <provider> for a specific provider.`));
  return fallback;
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input, output });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function preferredTestModel(provider: AIProvider) {
  if (provider === "github") return MODELS.find((model) => model.id === "openai/gpt-4.1-mini")!;
  if (provider === "minimax") return MODELS.find((model) => model.id === "minimax-m2.5-lightning")!;
  if (provider === "moonshot") return MODELS.find((model) => model.id === "kimi-latest")!;
  return MODELS.find((model) => model.provider === provider)!;
}

function authTestTimeoutMs(provider: AIProvider): number {
  const diagnostic = providerDiagnostics().find((item) => item.provider === provider);
  return Math.min(diagnostic?.profile.timeoutMs || 8000, 8000);
}

async function chatWithModel(modelId: string, timeoutMs: number) {
  return chat([
    { role: "system", content: "Reply with OK only." },
    { role: "user", content: "Ping." },
  ], { model: modelId, maxTokens: 12, temperature: 0, timeoutMs, maxRetries: 0 });
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    output.write(question);
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    let value = "";

    const onData = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      for (const char of text) {
        if (char === "\u0003") {
          cleanup();
          output.write("\n");
          printPlainError(createSetuprError({
            code: "COMMAND_ABORTED",
            command: "auth",
            subcommand: "set-key",
            exitCode: 130,
          }));
          resolve("");
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          output.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            output.write("\b \b");
          }
          continue;
        }
        if (char >= " ") {
          value += char;
          output.write("•");
        }
      }
    };

    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode?.(wasRaw);
      if (!wasRaw) process.stdin.pause();
    };

    process.stdin.on("data", onData);
  });
}
