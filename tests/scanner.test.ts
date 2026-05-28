import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { scanProject } from "../src/scanner/index.js";

describe("Scanner", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "p-setup-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("detects a TypeScript/Next.js project", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({
        dependencies: { next: "14.0.0", react: "18.0.0" },
        devDependencies: { typescript: "5.0.0" },
        scripts: { dev: "next dev", build: "next build" },
      })
    );
    await writeFile(join(tempDir, "tsconfig.json"), "{}");

    const result = await scanProject(tempDir);
    expect(result.language).toBe("TypeScript");
    expect(result.framework).toBe("Next.js");
    expect(result.packageManager).toBe("npm");
  });

  it("detects a Python/Flask project", async () => {
    await writeFile(join(tempDir, "requirements.txt"), "flask==3.0.0\nredis==5.0.0\n");
    await writeFile(join(tempDir, "app.py"), "from flask import Flask\n");
    await writeFile(join(tempDir, ".python-version"), "3.11.0");

    const result = await scanProject(tempDir);
    expect(result.language).toBe("Python");
    expect(result.framework).toBe("Flask");
    expect(result.packageManager).toBe("pip");
    expect(result.runtime?.name).toBe("python");
    expect(result.runtime?.version).toBe("3.11.0");
  });

  it("detects a Rust project", async () => {
    await writeFile(
      join(tempDir, "Cargo.toml"),
      '[package]\nname = "test"\nversion = "0.1.0"\n'
    );

    const result = await scanProject(tempDir);
    expect(result.language).toBe("Rust");
    expect(result.packageManager).toBe("cargo");
    expect(result.runtime?.name).toBe("rust");
  });

  it("detects a Go project", async () => {
    await writeFile(join(tempDir, "go.mod"), "module test\n\ngo 1.22.0\n");

    const result = await scanProject(tempDir);
    expect(result.language).toBe("Go");
    expect(result.packageManager).toBe("go");
    expect(result.runtime?.name).toBe("go");
    expect(result.runtime?.version).toBe("1.22.0");
  });

  it("detects services from package.json", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({
        dependencies: { pg: "8.0.0", redis: "4.0.0", mongoose: "7.0.0" },
      })
    );

    const result = await scanProject(tempDir);
    expect(result.services).toContain("PostgreSQL");
    expect(result.services).toContain("Redis");
    expect(result.services).toContain("MongoDB");
  });

  it("does not treat generic EMAIL env keys as a mail service", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(join(tempDir, ".env.example"), "EMAIL=person@example.com\nAPI_KEY=abc\n");

    const result = await scanProject(tempDir);
    expect(result.services).not.toContain("Mail");
  });

  it("detects mail services from SMTP env keys", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(join(tempDir, ".env.example"), "SMTP_HOST=smtp.example.com\n");

    const result = await scanProject(tempDir);
    expect(result.services).toContain("Mail");
  });

  it("detects monorepo with npm workspaces", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ workspaces: ["packages/*"] })
    );
    await mkdir(join(tempDir, "packages/app"), { recursive: true });
    await writeFile(join(tempDir, "packages/app/package.json"), "{}");

    const result = await scanProject(tempDir);
    expect(result.monorepo).not.toBeNull();
    expect(result.monorepo?.type).toBe("npm-workspaces");
  });

  it("respects .p-setup.json config", async () => {
    await writeFile(
      join(tempDir, ".p-setup.json"),
      JSON.stringify({ language: "Elixir", framework: "Phoenix" })
    );
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ dependencies: { react: "18" } }));

    const result = await scanProject(tempDir);
    expect(result.language).toBe("Elixir");
    expect(result.framework).toBe("Phoenix");
  });

  it("respects runtime and package manager overrides from .p-setup.json", async () => {
    await writeFile(
      join(tempDir, ".p-setup.json"),
      JSON.stringify({ runtime: "python", packageManager: "pip" })
    );
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { react: "18" } })
    );

    const result = await scanProject(tempDir);
    expect(result.packageManager).toBe("pip");
    expect(result.runtime?.name).toBe("python");
  });

  it("respects package.json p-setup runtime and package manager overrides", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({
        packageManager: "pnpm@9.0.0",
        dependencies: { react: "18" },
        "p-setup": {
          language: "Python",
          framework: "FastAPI",
          runtime: { name: "python", version: ">=3.11" },
          packageManager: "pip",
        },
      })
    );

    const result = await scanProject(tempDir);
    expect(result.language).toBe("Python");
    expect(result.framework).toBe("FastAPI");
    expect(result.packageManager).toBe("pip");
    expect(result.runtime?.name).toBe("python");
    expect(result.runtime?.version).toBe(">=3.11");
  });

  it("handles empty directory gracefully", async () => {
    const result = await scanProject(tempDir);
    expect(result.language).toBeNull();
    expect(result.framework).toBeNull();
    expect(result.packageManager).toBeNull();
    expect(result.services).toHaveLength(0);
  });

  it("detects package manager from lock files", async () => {
    await writeFile(join(tempDir, "package.json"), "{}");
    await writeFile(join(tempDir, "pnpm-lock.yaml"), "lockfileVersion: 9.0\n");

    const result = await scanProject(tempDir);
    expect(result.packageManager).toBe("pnpm");
  });

  it("lists pnpm-workspace.yaml as a config file", async () => {
    await writeFile(join(tempDir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    await mkdir(join(tempDir, "packages/app"), { recursive: true });
    await writeFile(join(tempDir, "packages/app/package.json"), "{}");

    const result = await scanProject(tempDir);
    expect(result.packageManager).toBe("pnpm");
    expect(result.monorepo?.type).toBe("pnpm-workspaces");
    expect(result.configFiles).toContain("pnpm-workspace.yaml");
  });

  it("prefers Turborepo detection over generic npm workspaces", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ workspaces: ["apps/*"] })
    );
    await writeFile(join(tempDir, "turbo.json"), "{}");
    await mkdir(join(tempDir, "apps/web"), { recursive: true });
    await writeFile(join(tempDir, "apps/web/package.json"), "{}");

    const result = await scanProject(tempDir);
    expect(result.monorepo?.type).toBe("turborepo");
  });

  it("detects node version from .nvmrc", async () => {
    await writeFile(join(tempDir, "package.json"), "{}");
    await writeFile(join(tempDir, ".nvmrc"), "20.11.1");

    const result = await scanProject(tempDir);
    expect(result.runtime?.name).toBe("node");
    expect(result.runtime?.version).toBe("20.11.1");
  });
});
