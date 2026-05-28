import { readFile, access } from "fs/promises";
import { join } from "path";
import { glob } from "glob";

export async function detectMonorepo(
  cwd: string
): Promise<{ type: string; packages: string[] } | null> {
  // pnpm workspaces
  try {
    const content = await readFile(join(cwd, "pnpm-workspace.yaml"), "utf-8");
    const packages = await resolveWorkspacePackages(cwd, parsePnpmWorkspace(content));
    return { type: "pnpm-workspaces", packages };
  } catch {}

  // Turborepo
  try {
    await access(join(cwd, "turbo.json"));
    const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf-8"));
    const patterns = Array.isArray(pkg.workspaces)
      ? pkg.workspaces
      : pkg.workspaces?.packages || ["packages/*", "apps/*"];
    const packages = await resolveWorkspacePackages(cwd, patterns);
    return { type: "turborepo", packages };
  } catch {}

  // npm/yarn workspaces (package.json)
  try {
    const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf-8"));
    if (pkg.workspaces) {
      const patterns = Array.isArray(pkg.workspaces)
        ? pkg.workspaces
        : pkg.workspaces.packages || [];
      const packages = await resolveWorkspacePackages(cwd, patterns);
      return { type: "npm-workspaces", packages };
    }
  } catch {}

  // Lerna
  try {
    const lerna = JSON.parse(await readFile(join(cwd, "lerna.json"), "utf-8"));
    const patterns = lerna.packages || ["packages/*"];
    const packages = await resolveWorkspacePackages(cwd, patterns);
    return { type: "lerna", packages };
  } catch {}

  // Nx
  try {
    await access(join(cwd, "nx.json"));
    const packages = await resolveWorkspacePackages(cwd, ["packages/*", "apps/*", "libs/*"]);
    return { type: "nx", packages };
  } catch {}

  return null;
}

function parsePnpmWorkspace(content: string): string[] {
  const patterns: string[] = [];
  const lines = content.split("\n");
  let inPackages = false;
  for (const line of lines) {
    if (line.trim() === "packages:") {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const match = line.match(/^\s+-\s+['"]?([^'"]+)['"]?/);
      if (match) patterns.push(match[1]);
      else if (!line.startsWith(" ") && !line.startsWith("\t") && line.trim()) break;
    }
  }
  return patterns;
}

async function resolveWorkspacePackages(cwd: string, patterns: string[]): Promise<string[]> {
  const results: string[] = [];
  for (const pattern of patterns) {
    try {
      const matches = await glob(pattern + "/", { cwd });
      for (const match of matches) {
        try {
          await access(join(cwd, match, "package.json"));
          results.push(match);
        } catch {}
      }
    } catch {}
  }
  return results;
}
