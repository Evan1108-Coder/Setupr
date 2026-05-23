import { describe, it, expect } from "vitest";
import { scanProject } from "../src/scanner/projectScanner.js";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("projectScanner", () => {
  it("detects a Node.js/TypeScript project", async () => {
    const dir = join(tmpdir(), "p-setup-test-node-" + Date.now());
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: "test",
        dependencies: { react: "^18.0.0", next: "^14.0.0" },
        devDependencies: { typescript: "^5.0.0" },
        scripts: { build: "next build", dev: "next dev" },
      })
    );
    await writeFile(join(dir, "package-lock.json"), "{}");

    const result = await scanProject(dir);

    expect(result.language).toBe("TypeScript");
    expect(result.runtime).toBe("Node.js");
    expect(result.packageManager).toBe("npm");
    expect(result.framework).toBe("Next.js");
    expect(result.dependencies).toBe(3);
    expect(result.scripts).toHaveProperty("build");

    await rm(dir, { recursive: true });
  });

  it("detects a Python project", async () => {
    const dir = join(tmpdir(), "p-setup-test-py-" + Date.now());
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "requirements.txt"), "flask==3.0.0\n");
    await writeFile(join(dir, ".env.example"), "SECRET_KEY=\n");

    const result = await scanProject(dir);

    expect(result.language).toBe("Python");
    expect(result.runtime).toBe("Python");
    expect(result.hasEnvExample).toBe(true);
    expect(result.hasEnvFile).toBe(false);

    await rm(dir, { recursive: true });
  });

  it("returns nulls for empty directory", async () => {
    const dir = join(tmpdir(), "p-setup-test-empty-" + Date.now());
    await mkdir(dir, { recursive: true });

    const result = await scanProject(dir);

    expect(result.language).toBeNull();
    expect(result.runtime).toBeNull();
    expect(result.packageManager).toBeNull();

    await rm(dir, { recursive: true });
  });

  it("detects pnpm package manager", async () => {
    const dir = join(tmpdir(), "p-setup-test-pnpm-" + Date.now());
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "test", dependencies: {} })
    );
    await writeFile(join(dir, "pnpm-lock.yaml"), "");

    const result = await scanProject(dir);

    expect(result.packageManager).toBe("pnpm");

    await rm(dir, { recursive: true });
  });
});
