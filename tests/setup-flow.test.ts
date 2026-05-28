import { describe, expect, it } from "vitest";
import type { ScanResult } from "../src/scanner/index.js";
import type { SetupStep } from "../src/ai/planner.js";
import {
  applyPlanTextAdjustment,
  createConfirmationSummary,
  createPlanningSummary,
  createPreExecutionWarning,
  decideForceMode,
  interpretEnvBatch,
  maskEnvVars,
  maskSensitiveValue,
} from "../src/ai/setupFlow.js";

const scan: ScanResult = {
  language: "typescript",
  framework: "vite",
  packageManager: "pnpm",
  runtime: { name: "node", version: ">=20" },
  services: ["postgres"],
  monorepo: { type: "pnpm", packages: ["apps/web", "packages/api"] },
  scripts: { build: "vite build", dev: "vite dev" },
  dependencies: { prod: 7, dev: 4 },
  configFiles: ["package.json", ".env.example"],
};

const steps: SetupStep[] = [
  {
    id: "deps",
    label: "Install dependencies",
    type: "deps",
    command: "pnpm install",
    status: "pending",
  },
  {
    id: "env",
    label: "Configure environment",
    type: "env",
    status: "pending",
  },
  {
    id: "build",
    label: "Build",
    type: "script",
    command: "pnpm run build",
    status: "pending",
  },
];

describe("setup flow helpers", () => {
  it("creates a compact planning summary from scan results and setup steps", () => {
    const summary = createPlanningSummary(scan, steps);

    expect(summary.headline).toBe("3 setup steps planned for typescript / vite / pnpm");
    expect(summary.project.runtime).toBe("node >=20");
    expect(summary.project.monorepo).toBe("pnpm (2 packages)");
    expect(summary.counts).toEqual({
      steps: 3,
      commands: 2,
      envSteps: 1,
      services: 1,
    });
    expect(summary.stepTypes).toMatchObject({ deps: 1, env: 1, script: 1 });
    expect(summary.scripts).toEqual(["build", "dev"]);
    expect(summary.missingEnvFile).toBe(true);
  });

  it("uses safe force-mode defaults and refuses unsafe confirmations", () => {
    expect(
      decideForceMode({
        id: "install",
        kind: "confirm",
        title: "Install dependencies?",
        defaultValue: true,
      })
    ).toMatchObject({ action: "ask" });

    expect(
      decideForceMode(
        {
          id: "install",
          kind: "confirm",
          title: "Install dependencies?",
          defaultValue: true,
        },
        { force: true }
      )
    ).toMatchObject({ action: "use-default", value: true });

    expect(
      decideForceMode(
        {
          id: "delete",
          kind: "confirm",
          title: "Delete files?",
        },
        { force: true }
      )
    ).toMatchObject({ action: "deny" });

    expect(
      decideForceMode(
        {
          id: "api-key",
          kind: "secret",
          title: "API key",
          required: true,
        },
        { force: true, defaults: { "api-key": "sk-test" } }
      )
    ).toMatchObject({ action: "skip" });
  });

  it("interprets pasted env blobs and reports ignored lines and duplicates", () => {
    const parsed = interpretEnvBatch(`
# copied from dashboard
export API_KEY="sk-test"
DATABASE_URL=postgres://localhost/app
API_KEY=override
NOT A KEY=value
NO_EQUALS
EMPTY=
`);

    expect(parsed.vars).toEqual([
      { key: "API_KEY", value: "sk-test", quoted: true, sourceLine: 3 },
      {
        key: "DATABASE_URL",
        value: "postgres://localhost/app",
        quoted: false,
        sourceLine: 4,
      },
      { key: "API_KEY", value: "override", quoted: false, sourceLine: 5 },
      { key: "EMPTY", value: "", quoted: false, sourceLine: 8 },
    ]);
    expect(parsed.duplicates).toEqual(["API_KEY"]);
    expect(parsed.ignored.map((line) => line.reason)).toEqual([
      "blank",
      "comment",
      "invalid-key",
      "missing-equals",
      "blank",
    ]);
  });

  it("interprets space-separated env assignments from terminal paste normalization", () => {
    const parsed = interpretEnvBatch("OPENAI_API_KEY=sk-test DATABASE_URL=postgres://localhost/app APP_NAME=Demo App");
    expect(parsed.vars.map((item) => [item.key, item.value])).toEqual([
      ["OPENAI_API_KEY", "sk-test"],
      ["DATABASE_URL", "postgres://localhost/app"],
      ["APP_NAME", "Demo App"],
    ]);
  });

  it("masks sensitive env values without hiding ordinary config", () => {
    expect(maskSensitiveValue("OPENAI_API_KEY", "sk-1234567890")).toBe("*********7890");
    expect(maskSensitiveValue("APP_NAME", "p-setup")).toBe("p-setup");
    expect(maskEnvVars([
      { key: "APP_NAME", value: "p-setup" },
      { key: "DATABASE_PASSWORD", value: "secretpw" },
    ])).toEqual([
      { key: "APP_NAME", value: "p-setup", masked: false },
      { key: "DATABASE_PASSWORD", value: "****etpw", masked: true },
    ]);
  });

  it("creates confirmation summaries with commands, risks, and masked env values", () => {
    const summary = createConfirmationSummary({
      scan,
      steps,
      env: [
        { key: "APP_NAME", value: "p-setup" },
        { key: "STRIPE_SECRET_KEY", value: "sk_live_123456" },
      ],
      force: true,
    });

    expect(summary.title).toBe("3 setup steps planned for typescript / vite / pnpm");
    expect(summary.commands).toEqual(["pnpm install", "pnpm run build"]);
    expect(summary.env).toEqual([
      { key: "APP_NAME", value: "p-setup", masked: false },
      { key: "STRIPE_SECRET_KEY", value: "**********3456", masked: true },
    ]);
    expect(summary.requiresConfirmation).toBe(true);
    expect(summary.risks).toEqual([
      "Dependency installation can change lockfiles and installed packages.",
      "Environment setup can create or update local .env files.",
      "Force mode skips interactive prompts where safe defaults are available.",
    ]);
  });

  it("summarizes pre-execution warnings and applies text plan adjustments", () => {
    expect(createPreExecutionWarning(scan, "setup", true)).toContain(
      "Force mode: skip safe prompts, still stop for destructive or blocked actions."
    );

    const adjusted = applyPlanTextAdjustment(steps, "skip build and prefer npm");
    expect(adjusted.steps.find((step) => step.id === "build")?.status).toBe("skipped");
    expect(adjusted.steps.find((step) => step.id === "deps")?.command).toBe("npm install");
    expect(adjusted.notes).toEqual([
      "Skipped build because you asked me not to run it.",
      "Adjusted package-manager commands to prefer npm.",
    ]);
  });
});
