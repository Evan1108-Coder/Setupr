import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cmdGithub, cmdPerf, cmdRegistry, cmdRelease } from "../src/commands/plain/product.js";
import { runCommand } from "../src/executor/index.js";

let tempDirs: string[] = [];

async function tempProject() {
  const dir = await mkdtemp(join(tmpdir(), "setupr-product-"));
  tempDirs.push(dir);
  await writeFile(join(dir, "package.json"), JSON.stringify({ name: "demo", version: "1.2.3", scripts: { dev: "vite" } }, null, 2));
  await writeFile(join(dir, "README.md"), "# Demo\n");
  await mkdir(join(dir, "dist"), { recursive: true });
  return dir;
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
  tempDirs = [];
});

describe("product control commands", () => {
  it("reports release readiness as JSON", async () => {
    const cwd = await tempProject();
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value?: unknown) => logs.push(String(value ?? "")));

    await cmdRelease("check", cwd, { json: true });

    const parsed = JSON.parse(logs.join("\n")) as { checks: Array<{ label: string; status: string }> };
    expect(parsed.checks.map((check) => check.label)).toContain("package.json");
    expect(parsed.checks.find((check) => check.label === "package.json")?.status).toBe("ok");
  });

  it("measures status performance without crashing", async () => {
    const cwd = await tempProject();
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value?: unknown) => logs.push(String(value ?? "")));

    await cmdPerf("scan", cwd, { json: true });

    const parsed = JSON.parse(logs.join("\n")) as { mode: string; marks: Array<{ label: string }> };
    expect(parsed.mode).toBe("scan");
    expect(parsed.marks[0]?.label).toBe("scan");
  });

  it("prints GitHub targets from a repository remote", async () => {
    const cwd = await tempProject();
    await runCommand("git init && git remote add origin https://github.com/example/demo.git", cwd);
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value?: unknown) => logs.push(String(value ?? "")));

    await cmdGithub("status", cwd, { json: true });

    const parsed = JSON.parse(logs.join("\n")) as { repo: string; actions: string };
    expect(parsed.repo).toBe("example/demo");
    expect(parsed.actions).toBe("https://github.com/example/demo/actions");
  });

  it("returns registry URLs for non-npm registries without network access", async () => {
    const cwd = await tempProject();
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value?: unknown) => logs.push(String(value ?? "")));

    await cmdRegistry("pypi", cwd, { args: ["fastapi"] });

    expect(logs.join("\n")).toContain("https://pypi.org/project/fastapi/");
  });

  it("guides usage when registry is called with no subcommand", async () => {
    const cwd = await tempProject();
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value?: unknown) => logs.push(String(value ?? "")));

    await cmdRegistry(undefined, cwd, {});

    const output = logs.join("\n");
    expect(output).toContain("Unknown subcommand");
    // Must not silently default to npm and mislabel the missing package as the subcommand.
    expect(output).not.toContain("Command: registry npm");
    expect(output).toContain("setupr registry <npm|pypi|crates> <package>");
  });

  it("reports a missing package (not an unknown subcommand) for a valid registry", async () => {
    const cwd = await tempProject();
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value?: unknown) => logs.push(String(value ?? "")));

    await cmdRegistry("npm", cwd, { args: [] });

    const output = logs.join("\n");
    expect(output).toContain("Package name required");
    expect(output).toContain("MISSING_PACKAGE");
  });

  it("rejects an unknown registry as an unknown subcommand", async () => {
    const cwd = await tempProject();
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value?: unknown) => logs.push(String(value ?? "")));

    await cmdRegistry("bogus", cwd, { args: ["pkg"] });

    expect(logs.join("\n")).toContain("Unknown subcommand");
  });
});
