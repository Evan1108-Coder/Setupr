import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { chdir, cwd, env } from "process";
import { handleDirectorInput } from "../src/ai/director.js";
import { buildDirectorContextPacket } from "../src/ai/directorContext.js";
import { parseUserIntent } from "../src/ai/userIntent.js";
import { createAppStore } from "../src/state/store.js";
import type { ScanResult } from "../src/scanner/index.js";

const scan: ScanResult = {
  language: "JavaScript",
  framework: "React",
  packageManager: "npm",
  runtime: { name: "node", version: "20" },
  services: [],
  monorepo: null,
  scripts: { build: "vite build" },
  dependencies: { prod: 1, dev: 1 },
  configFiles: ["package.json", ".env.example"],
};

describe("AI director", () => {
  const originalCwd = cwd();
  const originalEnv = { ...env };
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "setupr-director-"));
    chdir(tempDir);
    env.HOME = join(tempDir, "home");
    await mkdir(env.HOME, { recursive: true });
    for (const key of Object.keys(env)) {
      if (key.endsWith("_API_KEY") || key === "GITHUB_TOKEN" || key === "P_SETUP_AI_MODEL") {
        delete env[key];
      }
    }
  });

  afterEach(async () => {
    chdir(originalCwd);
    for (const key of Object.keys(env)) delete env[key];
    Object.assign(env, originalEnv);
    await rm(tempDir, { recursive: true, force: true });
  });

  it("can switch the active model from natural-language chat", async () => {
    env.MINIMAX_API_KEY = "minimax-test";
    const store = createAppStore(tempDir);

    await handleDirectorInput({
      text: "please switch the model to minimax-m2.5-lightning",
      cwd: tempDir,
      scan,
      contextDSL: "js/react/npm",
      store,
    });

    expect(env.P_SETUP_AI_MODEL).toBe("minimax-m2.5-lightning");
    expect(store.getState().messages.at(-1)?.content).toContain("Switched to minimax-m2.5-lightning");
  });

  it("can switch to a GitHub Models catalog id mentioned later in the sentence", async () => {
    env.GITHUB_MODELS_API_KEY = "github-test";
    const store = createAppStore(tempDir);

    await handleDirectorInput({
      text: "please use the github model openai/gpt-4.1-mini",
      cwd: tempDir,
      scan,
      contextDSL: "js/react/npm",
      store,
    });

    expect(env.P_SETUP_AI_MODEL).toBe("openai/gpt-4.1-mini");
    expect(store.getState().messages.at(-1)?.content).toContain("Switched to openai/gpt-4.1-mini");
  });

  it("reports current, unknown, unavailable, and cheapest model requests", async () => {
    const store = createAppStore(tempDir);

    const status = await handleDirectorInput({
      text: "what model are you using?",
      cwd: tempDir,
      scan,
      contextDSL: "js/react/npm",
      store,
    });
    expect(status.action).toBe("model.status");
    expect(store.getState().messages.at(-1)?.content).toContain("Current AI model");

    const unknown = await handleDirectorInput({
      text: "switch model to not-a-real-model",
      cwd: tempDir,
      scan,
      contextDSL: "js/react/npm",
      store,
    });
    expect(unknown.action).toBe("model.unknown");
    expect(store.getState().messages.at(-1)?.content).toContain("do not recognize");

    const unavailable = await handleDirectorInput({
      text: "switch model to gpt-4o-mini",
      cwd: tempDir,
      scan,
      contextDSL: "js/react/npm",
      store,
    });
    expect(unavailable.action).toBe("model.unavailable");
    expect(store.getState().messages.at(-1)?.content).toContain("not configured");

    env.GITHUB_MODELS_API_KEY = "github-test";
    const cheapestUnavailable = await handleDirectorInput({
      text: "switch to the cheapest model",
      cwd: tempDir,
      scan,
      contextDSL: "js/react/npm",
      store,
    });
    expect(cheapestUnavailable.action).toBe("model.cheapest.unavailable");

    env.OPENAI_API_KEY = "openai-test";
    const cheapest = await handleDirectorInput({
      text: "switch to the cheapest model",
      cwd: tempDir,
      scan,
      contextDSL: "js/react/npm",
      store,
    });
    expect(cheapest.action).toBe("model.cheapest");
    expect(env.P_SETUP_AI_MODEL).toBe("gpt-4o-mini");
  });

  it("asks for clarification when a model change is ambiguous", async () => {
    const store = createAppStore(tempDir);

    const result = await handleDirectorInput({
      text: "change model",
      cwd: tempDir,
      scan,
      contextDSL: "js/react/npm",
      store,
    });

    expect(result.action).toBe("model.clarify");
    expect(store.getState().pendingPrompt?.id).toBe("director-ambiguous-model");
    expect(store.getState().messages.at(-1)?.content).toContain("Which model should change");
  });

  it("can adjust the setup plan instead of only answering text", async () => {
    const store = createAppStore(tempDir);
    store.getState().setSteps([
      { id: "deps", label: "Install dependencies", type: "deps", command: "npm install", status: "pending" },
      { id: "build", label: "Run build", type: "script", command: "npm run build", status: "pending" },
    ]);

    await handleDirectorInput({
      text: "skip build but keep installing dependencies",
      cwd: tempDir,
      scan,
      contextDSL: "js/react/npm",
      store,
    });

    expect(store.getState().steps.find((step) => step.id === "build")?.status).toBe("skipped");
    expect(store.getState().steps.find((step) => step.id === "deps")?.status).toBe("pending");
  });

  it("normalizes typo-heavy steering while preserving raw user wording for AI fallback", async () => {
    const store = createAppStore(tempDir);
    store.getState().setSteps([
      { id: "deps", label: "Install dependencies", type: "deps", command: "npm install", status: "pending" },
      { id: "db", label: "Run database migration", type: "script", command: "npx prisma migrate dev", status: "pending" },
    ]);
    const raw = "skp databse but keep deps";
    const intent = parseUserIntent(raw);

    await handleDirectorInput({
      text: raw,
      cwd: tempDir,
      scan,
      contextDSL: "js/react/npm",
      store,
    });

    expect(intent.compact).toContain("target=database");
    expect(store.getState().steps.find((step) => step.id === "db")?.status).toBe("skipped");
    expect(store.getState().steps.find((step) => step.id === "deps")?.status).toBe("pending");

    const packet = JSON.parse(buildDirectorContextPacket({ cwd: tempDir, scan, contextDSL: "js/react/npm", store, userText: raw, parsedIntent: intent }));
    expect(packet.userIntent.compact).toContain("target=database");
    expect(packet.userIntent.rawFallback).toBe(raw);
  });

  it("can parse pasted environment values and keep them inside setup state", async () => {
    await writeFile(join(tempDir, ".env.example"), "OPENAI_API_KEY=\nPUBLIC_URL=\n");
    const store = createAppStore(tempDir);
    store.getState().setEnvVars([
      { key: "OPENAI_API_KEY", value: "", status: "pending" },
      { key: "PUBLIC_URL", value: "", status: "pending" },
    ]);

    await handleDirectorInput({
      text: "OPENAI_API_KEY=sk-secret-value\nPUBLIC_URL=http://localhost:3000",
      cwd: tempDir,
      scan,
      contextDSL: "js/react/npm",
      store,
    });

    expect(store.getState().envVars.find((item) => item.key === "OPENAI_API_KEY")?.status).toBe("filled");
    expect(await readFile(join(tempDir, ".env"), "utf-8")).toContain("PUBLIC_URL=http://localhost:3000");
    expect(store.getState().messages.at(-1)?.content).toContain("OPENAI_API_KEY=");
    expect(store.getState().messages.at(-1)?.content).not.toContain("sk-secret-value");
  });

  it("warns about ignored and duplicate pasted environment lines", async () => {
    const store = createAppStore(tempDir);
    store.getState().setEnvVars([
      { key: "API_KEY", value: "", status: "pending" },
      { key: "DATABASE_URL", value: "", status: "pending" },
    ]);

    await handleDirectorInput({
      text: "API_KEY=first\nnot-a-pair\nAPI_KEY=second\nDATABASE_URL=postgres://local/app",
      cwd: tempDir,
      scan,
      contextDSL: "js/react/npm",
      store,
    });

    expect(store.getState().envVars.find((item) => item.key === "API_KEY")?.value).toBe("second");
    expect(store.getState().notices.map((notice) => notice.message).join("\n")).toContain("ignored");
    expect(store.getState().notices.map((notice) => notice.message).join("\n")).toContain("Duplicate env keys");
  });

  it("answers status and pattern questions without consuming a pending prompt", async () => {
    const store = createAppStore(tempDir);
    store.getState().setPendingPrompt({
      id: "confirm-plan",
      type: "confirm",
      title: "Confirm Setup Plan",
      options: [
        { id: "proceed-plan", label: "Proceed" },
        { id: "cancel-plan", label: "Cancel" },
      ],
      includeOther: true,
      createdAt: Date.now(),
    });

    const result = await handleDirectorInput({
      text: "how do I start this app?",
      cwd: tempDir,
      scan,
      contextDSL: "js/react/npm",
      store,
    });

    expect(result.action).toBe("answer");
    expect(store.getState().pendingPrompt?.id).toBe("confirm-plan");
    expect(store.getState().messages.at(-1)?.content).toContain("No start/dev script");
  });

  it("uses active prompts for plan steering instead of leaving prompts stuck", async () => {
    const store = createAppStore(tempDir);
    store.getState().setSteps([
      { id: "deps", label: "Install dependencies", type: "deps", command: "npm install", status: "pending" },
      { id: "build", label: "Run build", type: "script", command: "npm run build", status: "pending" },
    ]);
    store.getState().setPendingPrompt({
      id: "confirm-plan",
      type: "confirm",
      title: "Confirm Setup Plan",
      options: [
        { id: "proceed-plan", label: "Proceed" },
        { id: "cancel-plan", label: "Cancel" },
      ],
      includeOther: true,
      createdAt: Date.now(),
    });

    const result = await handleDirectorInput({
      text: "skip build",
      cwd: tempDir,
      scan,
      contextDSL: "js/react/npm",
      store,
    });

    expect(result.action).toBe("prompt.answer");
    expect(store.getState().promptResponse).toMatchObject({
      promptId: "confirm-plan",
      value: "skip build",
    });
    expect(store.getState().pendingPrompt).toBeNull();
    expect(store.getState().steps.find((step) => step.id === "build")?.status).toBe("pending");
  });

  it("handles prompt options, proceed, cancel, and freeform answers", async () => {
    const store = createAppStore(tempDir);
    const prompt = {
      id: "port-choice",
      type: "choice" as const,
      title: "Choose port",
      options: [
        { id: "port-3000", label: "Port 3000" },
        { id: "port-8080", label: "Port 8080" },
        { id: "skip-port", label: "Skip" },
      ],
      includeOther: true,
      createdAt: Date.now(),
    };

    store.getState().setPendingPrompt(prompt);
    expect((await handleDirectorInput({ text: "8080", cwd: tempDir, scan, contextDSL: "js/react/npm", store })).action).toBe("prompt.answer");
    expect(store.getState().promptResponse).toMatchObject({ optionId: "port-8080" });

    store.getState().clearPromptResponse();
    store.getState().setPendingPrompt(prompt);
    await handleDirectorInput({ text: "yes", cwd: tempDir, scan, contextDSL: "js/react/npm", store });
    expect(store.getState().promptResponse).toMatchObject({ optionId: "port-3000" });

    store.getState().clearPromptResponse();
    store.getState().setPendingPrompt(prompt);
    await handleDirectorInput({ text: "cancel", cwd: tempDir, scan, contextDSL: "js/react/npm", store });
    expect(store.getState().promptResponse).toMatchObject({ optionId: "skip-port" });

    store.getState().clearPromptResponse();
    store.getState().setPendingPrompt(prompt);
    await handleDirectorInput({ text: "use port 5173 instead", cwd: tempDir, scan, contextDSL: "js/react/npm", store });
    expect(store.getState().promptResponse).toMatchObject({ value: "use port 5173 instead" });
  });
});
