import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { chdir, cwd, env } from "process";
import {
  describeDefaultModelSelection,
  estimateModelWeightedCost,
  getAIEnvValue,
  getDefaultModel,
  getModelById,
  getProviderEnvValue,
  resolveModel,
  selectDefaultModel,
} from "../src/ai/models.js";

const requestedModels = [
  "gpt-5.5-pro",
  "gpt-5.5",
  "gpt-5.5-mini",
  "gpt-5.4-pro",
  "gpt-5.4-mini",
  "gpt-4o",
  "gpt-4o-mini",
  "claude-opus-4-7",
  "claude-sonnet-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-3.5-sonnet",
  "gemini-3.1-pro",
  "gemini-3-flash",
  "gemini-2.5-flash-lite",
  "llama-4-maverick",
  "llama-4-scout",
  "llama-3.3-70b",
  "minimax-m3",
  "minimax-m2.5",
  "minimax-m2.7",
  "kimi-latest",
  "kimi-k2-thinking",
  "kimi-k2-turbo-preview",
  "kimi-k2.5-vision",
  "moonshot-v1-128k",
  "openai/gpt-4.1",
  "openai/gpt-4.1-mini",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
];

describe("AI model configuration", () => {
  const originalCwd = cwd();
  const originalEnv = { ...env };
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "setupr-ai-models-"));
    chdir(tempDir);
    for (const key of Object.keys(env)) {
      if (key.endsWith("_API_KEY") || key === "GITHUB_TOKEN" || key === "P_SETUP_AI_MODEL" || key === "HOME") {
        delete env[key];
      }
    }
    env.HOME = join(tempDir, "home");
  });

  afterEach(async () => {
    chdir(originalCwd);
    for (const key of Object.keys(env)) delete env[key];
    Object.assign(env, originalEnv);
    await rm(tempDir, { recursive: true, force: true });
  });

  it("registers every advertised model id", () => {
    for (const modelId of requestedModels) {
      expect(getModelById(modelId), modelId).toBeTruthy();
    }
  });

  it("reads provider keys and model override from local .env files", async () => {
    await writeFile(
      join(tempDir, ".env"),
      "export OPENAI_API_KEY=sk-test\nP_SETUP_AI_MODEL=gpt-4o-mini\n"
    );

    expect(getAIEnvValue("OPENAI_API_KEY")).toBe("sk-test");
    expect(getDefaultModel().id).toBe("gpt-4o-mini");
  });

  it("uses the saved config model when no env model override is set", async () => {
    const home = env.HOME!;
    await mkdir(join(home, ".setupr"), { recursive: true });
    await writeFile(
      join(home, ".setupr", "config.json"),
      JSON.stringify({ ai: { enabled: true, model: "kimi-k2-turbo-preview" } })
    );
    env.MOONSHOT_API_KEY = "moonshot-test";

    expect(getDefaultModel().id).toBe("kimi-k2-turbo-preview");
  });

  it("supports GitHub Models keys and publisher/model ids", async () => {
    await writeFile(
      join(tempDir, ".env"),
      "GITHUB_MODELS_API_KEY=github-models-test\nP_SETUP_AI_MODEL=openai/gpt-4.1\n"
    );

    expect(getAIEnvValue("GITHUB_MODELS_API_KEY")).toBe("github-models-test");
    expect(getProviderEnvValue("github")).toBe("github-models-test");
    expect(getDefaultModel().id).toBe("openai/gpt-4.1");
  });

  it("supports GITHUB_TOKEN as a GitHub Models alias and custom catalog ids", async () => {
    env.GITHUB_TOKEN = "github-token-test";
    env.P_SETUP_AI_MODEL = "publisher/custom-model";

    expect(getProviderEnvValue("github")).toBe("github-token-test");
    expect(resolveModel("publisher/custom-model")).toMatchObject({
      id: "publisher/custom-model",
      provider: "github",
    });
    expect(getDefaultModel().id).toBe("publisher/custom-model");
  });

  it("supports GITHUB_API_KEY as a GitHub Models alias", () => {
    env.GITHUB_API_KEY = "github-api-key-test";

    expect(getProviderEnvValue("github")).toBe("github-api-key-test");
    expect(getDefaultModel().provider).toBe("github");
  });

  it("auto-selects the cheapest known-price model when several keys are present", () => {
    env.MINIMAX_API_KEY = "minimax-test";
    env.GITHUB_MODELS_API_KEY = "github-test";
    env.OPENAI_API_KEY = "openai-test";

    const selection = selectDefaultModel();
    expect(selection.model.id).toBe("gpt-4o-mini");
    expect(selection.source).toBe("cheapest-known");
    expect(estimateModelWeightedCost(selection.model)).not.toBeNull();
    expect(describeDefaultModelSelection()).toContain("cheapest configured");
  });

  it("uses GitHub Models when it is the only configured provider", () => {
    env.GITHUB_TOKEN = "github-token-test";

    const selection = selectDefaultModel();
    expect(selection.model.provider).toBe("github");
    expect(selection.source).toBe("only-available");
    expect(selection.price).toBe("pricing unknown");
  });
});
