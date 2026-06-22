import { describe, expect, it } from "vitest";
import {
  classifyAIProviderError,
  classifyCommandFailure,
  createSetuprError,
  renderPlainError,
  sanitizeSecret,
  fromUnknownError,
} from "../src/errors/index.js";

describe("centralized error system", () => {
  it("renders clear contextual plain errors with recovery information", () => {
    const error = createSetuprError({
      code: "ENV_TEMPLATE_MISSING",
      command: "env",
      subcommand: "init",
      cwd: "/tmp/project",
      forceBehavior: "With --force, Setupr creates an empty .env and explains why.",
      recovery: [{ kind: "run-command", label: "Create an empty env file", command: "setup env init --force" }],
    });

    const rendered = renderPlainError(error);
    expect(rendered).toContain("ENV_TEMPLATE_MISSING");
    expect(rendered).toContain("Command: env init");
    expect(rendered).toContain("/tmp/project");
    expect(rendered).toContain("Next steps");
    expect(rendered).toContain("Recovery options");
  });

  it("classifies command failures and preserves useful output without secrets", () => {
    const error = classifyCommandFailure({
      command: "npm run build",
      cwd: "/tmp/app",
      exitCode: 1,
      stderr: "Build failed\nOPENAI_API_KEY=sk-supersecretvalue\nCannot resolve entry module index.html",
      stepLabel: "Run build",
      stepType: "script",
    });

    expect(error.code).toBe("BUILD_FAILED");
    expect(error.metadata?.stderr).not.toContain("sk-supersecretvalue");
    expect(error.details?.join("\n")).toContain("Cannot resolve entry module index.html");
  });

  it("classifies provider errors into recovery-friendly AI failures", () => {
    expect(classifyAIProviderError(new Error("Request timed out")).code).toBe("AI_PROVIDER_TIMEOUT");
    expect(classifyAIProviderError(new Error("401 invalid api key")).code).toBe("AI_PROVIDER_AUTH_FAILED");
    expect(classifyAIProviderError(new Error("429 rate limit exceeded")).code).toBe("AI_PROVIDER_RATE_LIMITED");
    expect(classifyAIProviderError(new Error("insufficient credits quota exceeded")).code).toBe("AI_PROVIDER_QUOTA_EXHAUSTED");
    expect(classifyAIProviderError(new Error("503 unavailable")).code).toBe("AI_PROVIDER_UNAVAILABLE");
    expect(classifyAIProviderError(new Error("invalid json response")).code).toBe("AI_PROVIDER_PROTOCOL_ERROR");
  });

  it("classifies structured provider errors from SDK status and code fields", () => {
    expect(classifyAIProviderError(Object.assign(new Error("provider refused request"), { status: 401 })).code)
      .toBe("AI_PROVIDER_AUTH_FAILED");
    expect(classifyAIProviderError(Object.assign(new Error("too many requests"), { status: 429 })).code)
      .toBe("AI_PROVIDER_RATE_LIMITED");
    expect(classifyAIProviderError(Object.assign(new Error("too many requests"), { status: 429, code: "insufficient_quota" })).code)
      .toBe("AI_PROVIDER_QUOTA_EXHAUSTED");
    expect(classifyAIProviderError({ response: { status: 502, statusText: "Bad Gateway" } }).code)
      .toBe("AI_PROVIDER_UNAVAILABLE");
  });

  it("sanitizes common secret formats", () => {
    const value = sanitizeSecret("OPENAI_API_KEY=sk-abcdef1234567890 GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz");

    expect(value).not.toContain("abcdef1234567890");
    expect(value).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(value).toContain("OPENAI_API_KEY=sk-****");
    expect(value).toContain("GITHUB_TOKEN=****");
  });

  it("exposes catalog entries for invalid cwd and missing package usage errors", () => {
    const cwdError = createSetuprError({ code: "INVALID_CWD", command: "status", cwd: "/missing" });
    expect(cwdError.category).toBe("usage");
    expect(cwdError.exitCode).toBe(1);
    expect(renderPlainError(cwdError)).toContain("Directory not found");

    const pkgError = createSetuprError({ code: "MISSING_PACKAGE", command: "add" });
    expect(pkgError.exitCode).toBe(1);
    expect(renderPlainError(pkgError)).toContain("Package name required");
  });

  it("does not wrap already structured errors as unknown failures", () => {
    const original = createSetuprError({
      code: "MALFORMED_PROJECT_FILE",
      cwd: "/tmp/bad",
      details: ["File: package.json"],
    });

    const rendered = fromUnknownError(original, { command: "info" });

    expect(rendered.code).toBe("MALFORMED_PROJECT_FILE");
    expect(rendered.command).toBe("info");
    expect(rendered.details).toContain("File: package.json");
  });

  it("does not let fallback context overwrite the error's real cwd/command", () => {
    // A command-specific error already knows the resolved --cwd target. The
    // top-level catch passes process.cwd() and the raw argv as fallbacks; these
    // must only fill missing fields, never clobber the accurate values.
    const original = createSetuprError({
      code: "MALFORMED_PROJECT_FILE",
      cwd: "/tmp/sclaw-fix/broken",
      command: "info",
      details: ["File: package.json"],
    });

    const rendered = fromUnknownError(original, {
      cwd: "/some/other/process/cwd",
      command: "--cwd /tmp/sclaw-fix/broken info --plain",
    });

    expect(rendered.cwd).toBe("/tmp/sclaw-fix/broken");
    expect(rendered.command).toBe("info");
    expect(renderPlainError(rendered)).toContain("Directory: /tmp/sclaw-fix/broken");
  });

  it("fills missing context fields on a structured error from fallbacks", () => {
    const original = createSetuprError({
      code: "MALFORMED_PROJECT_FILE",
      details: ["File: package.json"],
    });

    const rendered = fromUnknownError(original, { cwd: "/fallback/cwd", command: "info" });

    expect(rendered.cwd).toBe("/fallback/cwd");
    expect(rendered.command).toBe("info");
  });
});
