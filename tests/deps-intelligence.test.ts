import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";

const runCommandMock = vi.hoisted(() => vi.fn());

vi.mock("../src/executor/index.js", () => ({
  runCommand: runCommandMock,
}));

import { runNonTUICommand } from "../src/commands/plain/router.js";

const TEST_DIR = join("/tmp", `setupr-deps-${Date.now()}`);

async function writeProject(packageJson: object, packageLock?: object): Promise<void> {
  await writeFile(join(TEST_DIR, "package.json"), JSON.stringify(packageJson, null, 2));
  if (packageLock) {
    await writeFile(join(TEST_DIR, "package-lock.json"), JSON.stringify(packageLock, null, 2));
  }
}

function captureConsole(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  return {
    lines,
    restore: () => {
      console.log = log;
    },
  };
}

beforeEach(async () => {
  runCommandMock.mockReset();
  await rm(TEST_DIR, { recursive: true, force: true });
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe("deps intelligence commands", () => {
  it("keeps setupr deps as the existing dependency list command", async () => {
    await writeProject({
      name: "deps-list",
      version: "1.0.0",
      dependencies: { express: "^4.18.0" },
    });
    runCommandMock.mockResolvedValue({ stdout: "deps-list@1.0.0\n└── express@4.18.2", stderr: "", exitCode: 0 });

    const output = captureConsole();
    try {
      await runNonTUICommand("deps", undefined, TEST_DIR, { args: [] });
    } finally {
      output.restore();
    }

    expect(runCommandMock).toHaveBeenCalledWith("npm list --depth=0", TEST_DIR);
    expect(output.lines.join("\n")).toContain("express@4.18.2");
  });

  it("falls back to package.json declarations when installed dependency tree is unavailable", async () => {
    await writeProject({
      name: "deps-list-missing-install",
      version: "1.0.0",
      dependencies: { express: "^4.18.0" },
      devDependencies: { vitest: "^1.0.0" },
    });
    runCommandMock.mockResolvedValue({ stdout: "", stderr: "npm ERR! missing: express", exitCode: 1 });

    const output = captureConsole();
    try {
      await runNonTUICommand("deps", "list", TEST_DIR, { args: [] });
    } finally {
      output.restore();
    }

    const text = output.lines.join("\n");
    expect(text).toContain("package.json declarations");
    expect(text).toContain("express@^4.18.0");
    expect(text).toContain("vitest@^1.0.0");
  });

  it("summarizes npm audit json without throwing on nonzero audit exit", async () => {
    await writeProject({ name: "deps-audit", version: "1.0.0" }, { name: "deps-audit", lockfileVersion: 3, packages: {} });
    runCommandMock.mockResolvedValue({
      stdout: JSON.stringify({
        metadata: { vulnerabilities: { info: 0, low: 1, moderate: 0, high: 1, critical: 0, total: 2 } },
        vulnerabilities: {
          lodash: { severity: "high", fixAvailable: true },
          minimist: { severity: "low", fixAvailable: false },
        },
      }),
      stderr: "",
      exitCode: 1,
    });

    const output = captureConsole();
    try {
      await runNonTUICommand("deps", "audit", TEST_DIR, { args: [] });
    } finally {
      output.restore();
    }

    const text = output.lines.join("\n");
    expect(runCommandMock).toHaveBeenCalledWith("npm audit --json", TEST_DIR);
    expect(text).toContain("Vulnerabilities: 2");
    expect(text).toContain("high");
    expect(text).toContain("lodash (high, fix available)");
  });

  it("reports audit as unavailable instead of crashing when lockfile or network data is missing", async () => {
    await writeProject({ name: "deps-audit-missing", version: "1.0.0" });
    runCommandMock.mockResolvedValue({
      stdout: "",
      stderr: "npm ERR! audit endpoint failed",
      exitCode: 1,
    });

    const output = captureConsole();
    try {
      await runNonTUICommand("deps", "audit", TEST_DIR, { args: [] });
    } finally {
      output.restore();
    }

    const text = output.lines.join("\n");
    expect(text).toContain("Audit unavailable");
    expect(text).toContain("No package-lock.json found");
  });

  it("explains direct and transitive signals for deps why", async () => {
    await writeProject(
      {
        name: "deps-why",
        version: "1.0.0",
        dependencies: { express: "^4.18.0" },
      },
      {
        name: "deps-why",
        lockfileVersion: 3,
        packages: {
          "": { name: "deps-why", version: "1.0.0", dependencies: { express: "^4.18.0" } },
          "node_modules/express": { version: "4.18.2", dependencies: { accepts: "~1.3.8" } },
          "node_modules/accepts": { version: "1.3.8" },
        },
      }
    );

    const direct = captureConsole();
    try {
      await runNonTUICommand("deps", "why", TEST_DIR, { args: ["express"] });
    } finally {
      direct.restore();
    }
    expect(direct.lines.join("\n")).toContain("Direct dependency");
    expect(direct.lines.join("\n")).toContain("dependencies: ^4.18.0");

    const transitive = captureConsole();
    try {
      await runNonTUICommand("deps", "why", TEST_DIR, { args: ["accepts"] });
    } finally {
      transitive.restore();
    }
    const text = transitive.lines.join("\n");
    expect(text).toContain("Not declared directly");
    expect(text).toContain("accepts@1.3.8");
    expect(text).toContain("express@4.18.2");
  });

  it("flags GPL-family licenses from package-lock metadata deterministically", async () => {
    await writeProject(
      { name: "deps-licenses", version: "1.0.0", license: "MIT" },
      {
        name: "deps-licenses",
        lockfileVersion: 3,
        packages: {
          "": { name: "deps-licenses", version: "1.0.0", license: "MIT" },
          "node_modules/a": { version: "1.0.0", license: "MIT" },
          "node_modules/b": { version: "1.0.0", license: "LGPL-3.0-only" },
          "node_modules/c": { version: "1.0.0", license: "AGPL-3.0-only" },
        },
      }
    );

    const output = captureConsole();
    try {
      await runNonTUICommand("deps", "licenses", TEST_DIR, { args: [] });
    } finally {
      output.restore();
    }

    const text = output.lines.join("\n");
    expect(text).toContain("Restricted/copyleft licenses: 2");
    expect(text.indexOf("b@1.0.0")).toBeLessThan(text.indexOf("c@1.0.0"));
    expect(text).not.toContain("a@1.0.0: MIT");
  });
});
