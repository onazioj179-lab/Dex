// =============================================================================
// DEX Platform — Phase 2: AppInstaller (host-side, dep-injected)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Drives a CatalogEntry through the install pipeline returned by
 * planInstall(). All side-effects (fs, network, signature verify) are
 * injected so the installer is unit-testable without Electron.
 */

import { planInstall, type CatalogEntry, type PlanContext, type InstallStep, type InstalledApp } from './catalog';
import type { DexPkgManifestV2 } from '../dexpkg/manifestV2';

export interface InstallerHooks {
  /** Download bytes from a URL into a tmp blob. Resolves with the local path. */
  download(url: string, expectedSha256: string, expectedBytes: number): Promise<string>;
  /** Verify a multi-sig manifest against trusted publisher keys. */
  verifySignatures(manifest: DexPkgManifestV2): Promise<boolean>;
  /** Apply a delta payload onto an existing install dir. */
  applyDelta(deltaPath: string, baseInstallId: string): Promise<string>;
  /** Unpack a full bundle; returns the staging dir. */
  unpack(bundlePath: string): Promise<string>;
  /** Snapshot an existing install for rollback. */
  snapshotExisting(packageId: string): Promise<string | null>;
  /** Roll back to a snapshot id. */
  rollback(packageId: string, snapshotId: string): Promise<void>;
  /** Persist registration of the new install. */
  register(app: InstalledApp): Promise<void>;
  /** Prompt the user to grant capabilities. */
  requestCapabilities(packageId: string, caps: string[]): Promise<{ granted: string[]; denied: string[] }>;
}

export interface InstallProgress {
  step: InstallStep;
  index: number;
  total: number;
}

export interface InstallResult {
  ok: boolean;
  packageId: string;
  version?: string;
  error?: string;
  rolledBack?: boolean;
}

export async function runInstall(
  entry: CatalogEntry,
  ctx: PlanContext,
  hooks: InstallerHooks,
  onProgress?: (p: InstallProgress) => void,
  now: () => number = Date.now,
): Promise<InstallResult> {
  const plan = planInstall(entry, ctx);
  if (!plan.ok) return { ok: false, packageId: entry.manifest.packageId, error: plan.reason };
  if (plan.pathway === 'skip') {
    return { ok: true, packageId: entry.manifest.packageId, version: entry.manifest.packageVersion };
  }

  let snapshotId: string | null = null;
  let bundlePath: string | null = null;
  const grantedCaps = new Set<string>();

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]!;
    onProgress?.({ step, index: i, total: plan.steps.length });

    try {
      switch (step.kind) {
        case 'verify-host':
          // already validated by planInstall
          break;
        case 'verify-deps':
          // dependency satisfaction is checked by planInstall against ctx.installed
          break;
        case 'request-caps': {
          const r = await hooks.requestCapabilities(entry.manifest.packageId, step.caps);
          if (r.denied.length > 0) {
            return { ok: false, packageId: entry.manifest.packageId, error: `caps-denied:${r.denied.join(',')}` };
          }
          for (const c of r.granted) grantedCaps.add(c);
          break;
        }
        case 'snapshot-existing':
          snapshotId = await hooks.snapshotExisting(entry.manifest.packageId);
          break;
        case 'download':
          bundlePath = await hooks.download(step.url, step.sha256, step.bytes);
          break;
        case 'apply-delta':
          if (!bundlePath) throw new Error('delta-without-base');
          bundlePath = await hooks.applyDelta(bundlePath, entry.manifest.packageId);
          break;
        case 'verify-signatures': {
          const ok = await hooks.verifySignatures(entry.manifest);
          if (!ok) throw new Error('signature-failed');
          break;
        }
        case 'unpack':
          if (!bundlePath) throw new Error('unpack-without-bundle');
          await hooks.unpack(bundlePath);
          break;
        case 'register':
          await hooks.register({
            packageId: entry.manifest.packageId,
            version: entry.manifest.packageVersion,
            installedAt: now(),
            grantedCaps: Array.from(grantedCaps),
          });
          break;
        case 'rollback-on-fail':
          // Reserved: handled in catch block below.
          break;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      let rolledBack = false;
      if (snapshotId) {
        try { await hooks.rollback(entry.manifest.packageId, snapshotId); rolledBack = true; }
        catch { /* swallow rollback failure; surface original */ }
      }
      return { ok: false, packageId: entry.manifest.packageId, error: msg, rolledBack };
    }
  }

  return { ok: true, packageId: entry.manifest.packageId, version: entry.manifest.packageVersion };
}
