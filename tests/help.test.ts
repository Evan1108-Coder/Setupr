import { describe, expect, it, vi, afterEach } from "vitest";
import { helpPathFromInput, showHelp } from "../src/cli/help.js";

describe("help routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("supports setup help, setup help auth, and nested auth help paths", () => {
    expect(helpPathFromInput("help", ["help"], false)).toEqual([]);
    expect(helpPathFromInput("help", ["help", "auth"], false)).toEqual(["auth"]);
    expect(helpPathFromInput("help", ["help", "auth", "set-key"], false)).toEqual(["auth", "set-key"]);
    expect(helpPathFromInput("auth", ["auth"], true)).toEqual(["auth"]);
  });

  it("renders known topics and errors on unknown topics", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    expect(showHelp(["auth"])).toBe(true);
    expect(showHelp(["auth", "set-key"])).toBe(true);
    expect(showHelp(["git"])).toBe(true);
    expect(showHelp(["docker"])).toBe(true);
    expect(showHelp(["workspace"])).toBe(true);
    expect(showHelp(["not-real"])).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(log).toHaveBeenCalled();
  });

  it("keeps the rich help index aligned with the expanded command surface", () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => {
      lines.push(String(line));
    });

    expect(showHelp()).toBe(true);
    const output = lines.join("\n");
    for (const command of [
      "git",
      "init",
      "migrate",
      "ci",
      "docker",
      "secrets",
      "templates",
      "workspace",
      "health",
      "share",
      "plugin",
      "lint",
      "format",
      "scaffold",
    ]) {
      expect(output).toContain(command);
    }
  });
});
