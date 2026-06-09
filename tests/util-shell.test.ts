import { afterEach, describe, expect, it } from "vitest";
import { shellQuote } from "../src/util/shell.js";
import { stepTimeoutMs } from "../src/executor/index.js";
import type { SetupStep } from "../src/ai/planner.js";

describe("shellQuote", () => {
  it("wraps plain values in single quotes", () => {
    expect(shellQuote("lodash")).toBe("'lodash'");
  });

  it("escapes embedded single quotes safely", () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });

  it("neutralizes shell metacharacters by quoting", () => {
    expect(shellQuote("a; rm -rf /")).toBe("'a; rm -rf /'");
    expect(shellQuote("$(whoami)")).toBe("'$(whoami)'");
  });
});

describe("stepTimeoutMs", () => {
  const step = (type: SetupStep["type"]): SetupStep => ({
    id: "s1",
    label: "step",
    type,
    command: "echo hi",
    status: "pending",
  });

  afterEach(() => {
    delete process.env.SETUPR_STEP_TIMEOUT_MS;
  });

  it("uses generous defaults for slow step types", () => {
    expect(stepTimeoutMs(step("deps"))).toBe(600_000);
    expect(stepTimeoutMs(step("verify"))).toBe(120_000);
  });

  it("honors a positive SETUPR_STEP_TIMEOUT_MS override", () => {
    process.env.SETUPR_STEP_TIMEOUT_MS = "5000";
    expect(stepTimeoutMs(step("deps"))).toBe(5000);
  });

  it("ignores an invalid override and falls back to the default", () => {
    process.env.SETUPR_STEP_TIMEOUT_MS = "not-a-number";
    expect(stepTimeoutMs(step("deps"))).toBe(600_000);
  });
});
