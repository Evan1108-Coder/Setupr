import { mkdir, writeFile, readFile, readdir, rm } from "fs/promises";
import { join } from "path";

const SNAPSHOT_DIR = ".p-setup/snapshots";

interface Snapshot {
  id: string;
  stepId: string;
  timestamp: number;
  files: string[];
}

export async function createSnapshot(cwd: string, stepId: string): Promise<string> {
  const snapshotDir = join(cwd, SNAPSHOT_DIR);
  await mkdir(snapshotDir, { recursive: true });

  const id = `snap_${Date.now()}_${stepId}`;
  const snapPath = join(snapshotDir, id);
  await mkdir(snapPath, { recursive: true });

  // Save metadata
  const meta: Snapshot = {
    id,
    stepId,
    timestamp: Date.now(),
    files: [],
  };

  // Snapshot key files that might be modified
  const filesToSnapshot = [
    "package.json",
    "package-lock.json",
    ".env",
    ".env.local",
    "yarn.lock",
    "pnpm-lock.yaml",
  ];

  for (const file of filesToSnapshot) {
    try {
      const content = await readFile(join(cwd, file), "utf-8");
      await writeFile(join(snapPath, file), content);
      meta.files.push(file);
    } catch {}
  }

  await writeFile(join(snapPath, "meta.json"), JSON.stringify(meta, null, 2));
  return id;
}

export async function restoreSnapshot(cwd: string, snapshotId: string): Promise<boolean> {
  const snapPath = join(cwd, SNAPSHOT_DIR, snapshotId);

  try {
    const meta: Snapshot = JSON.parse(
      await readFile(join(snapPath, "meta.json"), "utf-8")
    );

    for (const file of meta.files) {
      const content = await readFile(join(snapPath, file), "utf-8");
      await writeFile(join(cwd, file), content);
    }

    return true;
  } catch {
    return false;
  }
}

export async function listSnapshots(cwd: string): Promise<Snapshot[]> {
  const snapshotDir = join(cwd, SNAPSHOT_DIR);
  try {
    const dirs = await readdir(snapshotDir);
    const snapshots: Snapshot[] = [];
    for (const dir of dirs) {
      try {
        const meta = JSON.parse(
          await readFile(join(snapshotDir, dir, "meta.json"), "utf-8")
        );
        snapshots.push(meta);
      } catch {}
    }
    return snapshots.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

export async function clearSnapshots(cwd: string): Promise<void> {
  try {
    await rm(join(cwd, SNAPSHOT_DIR), { recursive: true, force: true });
  } catch {}
}
