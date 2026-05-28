import type { ScanResult } from "../scanner/index.js";

export function hasProjectSignals(scan: ScanResult | null): boolean {
  if (!scan) return false;
  return Boolean(
    scan.language ||
      scan.framework ||
      scan.packageManager ||
      scan.runtime ||
      scan.services.length > 0 ||
      scan.monorepo ||
      Object.keys(scan.scripts).length > 0 ||
      scan.dependencies.prod > 0 ||
      scan.dependencies.dev > 0 ||
      scan.configFiles.length > 0
  );
}
