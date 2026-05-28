import { describe, expect, it } from "vitest";
import { buildDirectorContextPacket, sanitizeForAI } from "../src/ai/directorContext.js";
import { createAppStore } from "../src/state/store.js";
import type { ScanResult } from "../src/scanner/index.js";

const scan: ScanResult = {
  language: "TypeScript",
  framework: "React",
  packageManager: "npm",
  runtime: { name: "node", version: "20" },
  services: ["PostgreSQL"],
  monorepo: null,
  scripts: { dev: "vite", build: "vite build" },
  dependencies: { prod: 3, dev: 2 },
  configFiles: ["package.json", ".env.example"],
};

describe("director context packet", () => {
  it("includes project, system, TUI, diary, chat, and plan state without raw secrets", () => {
    const store = createAppStore("/tmp/project");
    store.getState().setScan(scan);
    store.getState().setSteps([
      { id: "deps", label: "Install dependencies", type: "deps", command: "npm install", status: "pending" },
    ]);
    store.getState().setEnvVars([
      { key: "OPENAI_API_KEY", value: "sk-secret-value", status: "filled", source: "chat" },
      { key: "PUBLIC_URL", value: "http://localhost:3000", status: "filled", source: ".env" },
    ]);
    store.getState().addLog({ type: "command", content: "OPENAI_API_KEY=sk-secret-value npm run build" });
    store.getState().addMessage({ role: "user", content: "OPENAI_API_KEY=sk-secret-value" });

    const packet = buildDirectorContextPacket({
      cwd: "/tmp/project",
      scan,
      contextDSL: "[PRJ lang=TypeScript fw=React]",
      store,
      userText: "OPENAI_API_KEY=sk-secret-value",
    });
    const parsed = JSON.parse(packet);

    expect(parsed.project.scan.framework).toBe("React");
    expect(parsed.system.nodeVersion).toBe(process.version);
    expect(parsed.capabilities.commands.map((item: { command: string }) => item.command)).toContain("git");
    expect(parsed.capabilities.commands.map((item: { command: string }) => item.command)).toContain("docker");
    expect(parsed.capabilities.commands.map((item: { command: string }) => item.command)).toContain("workspace");
    expect(parsed.plan.steps[0].command).toBe("npm install");
    expect(parsed.tuiState.envVars[0].value).not.toContain("sk-secret-value");
    expect(parsed.terminalDiary[0].content).not.toContain("sk-secret-value");
    expect(parsed.chatHistory[0].content).not.toContain("sk-secret-value");
    expect(packet).toContain("PUBLIC_URL");
    expect(packet).not.toContain("sk-secret-value");
  });

  it("masks secret-looking assignments and provider tokens", () => {
    expect(sanitizeForAI("GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz")).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(sanitizeForAI("hello sk-abcdefghijklmnopqrstuvwxyz")).toContain("sk-****");
  });
});
