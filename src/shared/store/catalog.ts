// =============================================================================
// DEX Platform — Track B2: DEX Store catalog + install planner
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Pure planning logic for the in-app DEX Store. Takes a catalog + a user
 * action ("install X") and produces a deterministic step list the
 * AppInstaller (main process) executes. Also handles update path
 * selection: full vs. delta vs. skip.
 */

import {
  type DexPkgManifestV2,
  satisfiesRange,
  semverCompare,
  validateManifestV2,
} from '../dexpkg/manifestV2';

export interface CatalogEntry {
  manifest: DexPkgManifestV2;
  /** HTTPS URL for the full bundle. */
  bundleUrl: string;
  bundleBytes: number;
  bundleSha256: string;
  /** Optional URLs for each delta in manifest.deltas (same index). */
  deltaUrls?: string[];
  /** Storefront metadata. */
  iconUrl?: string;
  screenshots?: string[];
  reviewSummary?: { count: number; avg: number };
  /** Announced but not yet installable (no published bundle). Shown, not installable. */
  comingSoon?: boolean;
}

export interface StoreCatalog {
  generatedAt: string;
  entries: CatalogEntry[];
}

export interface InstalledApp {
  packageId: string;
  version: string;
  installedAt: number;
  /** Capabilities the user already granted. */
  grantedCaps: string[];
  /** Storefront metadata captured at install time so the app shows a real
   *  name/icon in the grid even if it later leaves the catalog. */
  name?: string;
  description?: string;
  iconUrl?: string;
  categories?: string[];
}

/** True when a catalog entry can actually be installed (has a published bundle). */
export function isInstallable(entry: CatalogEntry): boolean {
  return !entry.comingSoon && typeof entry.bundleUrl === 'string' && entry.bundleUrl.length > 0;
}

/**
 * Capture storefront metadata onto an InstalledApp record at install time so the
 * installed app renders a real name/icon/category in the grid. Pure.
 */
export function enrichInstalledApp(base: InstalledApp, entry: CatalogEntry): InstalledApp {
  return {
    ...base,
    name: entry.manifest.name || base.name || base.packageId,
    description: entry.manifest.description ?? base.description,
    iconUrl: entry.iconUrl ?? base.iconUrl,
    categories: entry.manifest.categories ? [...entry.manifest.categories] : base.categories,
  };
}

export type InstallStep =
  | { kind: 'verify-host'; minRuntime: string }
  | { kind: 'verify-deps'; deps: { id: string; range: string }[] }
  | { kind: 'request-caps'; caps: string[] }
  | { kind: 'download'; url: string; bytes: number; sha256: string }
  | { kind: 'apply-delta'; from: string; payloadSha256: string }
  | { kind: 'verify-signatures'; required: number }
  | { kind: 'unpack'; targetDir: string }
  | { kind: 'snapshot-existing'; packageId: string }
  | { kind: 'register'; packageId: string; version: string }
  | { kind: 'rollback-on-fail'; packageId: string };

export interface PlanContext {
  installed: InstalledApp[];
  hostRuntime: string;
  /** Minimum signatures we require (default 1). */
  minSignatures?: number;
}

export type PlanResult =
  | { ok: true; steps: InstallStep[]; pathway: 'fresh' | 'delta' | 'full-update' | 'skip' }
  | { ok: false; reason: string };

export function planInstall(entry: CatalogEntry, ctx: PlanContext): PlanResult {
  const issues = validateManifestV2(entry.manifest);
  if (issues.length) return { ok: false, reason: `manifest invalid: ${issues[0]}` };

  if (semverCompare(ctx.hostRuntime, entry.manifest.minRuntime) < 0) {
    return { ok: false, reason: `host ${ctx.hostRuntime} < required ${entry.manifest.minRuntime}` };
  }

  // Dependency check
  const missing: { id: string; range: string }[] = [];
  for (const d of entry.manifest.dependencies) {
    if (d.optional) continue;
    const inst = ctx.installed.find(i => i.packageId === d.id);
    if (!inst || !satisfiesRange(inst.version, d.range)) missing.push({ id: d.id, range: d.range });
  }

  const existing = ctx.installed.find(i => i.packageId === entry.manifest.packageId);
  let pathway: 'fresh' | 'delta' | 'full-update' | 'skip' = 'fresh';
  const steps: InstallStep[] = [
    { kind: 'verify-host', minRuntime: entry.manifest.minRuntime },
  ];
  if (missing.length) steps.push({ kind: 'verify-deps', deps: missing });

  if (existing) {
    const cmp = semverCompare(existing.version, entry.manifest.packageVersion);
    if (cmp >= 0) return { ok: true, steps: [], pathway: 'skip' };
    // Try delta first
    const delta = entry.manifest.deltas.find(d => d.fromVersion === existing.version);
    if (delta && entry.deltaUrls?.[entry.manifest.deltas.indexOf(delta)]) {
      pathway = 'delta';
      steps.push({ kind: 'snapshot-existing', packageId: entry.manifest.packageId });
      steps.push({
        kind: 'download',
        url: entry.deltaUrls[entry.manifest.deltas.indexOf(delta)]!,
        bytes: delta.bytes,
        sha256: delta.payloadSha256,
      });
      steps.push({ kind: 'apply-delta', from: delta.fromVersion, payloadSha256: delta.payloadSha256 });
    } else {
      pathway = 'full-update';
      steps.push({ kind: 'snapshot-existing', packageId: entry.manifest.packageId });
      steps.push({ kind: 'download', url: entry.bundleUrl, bytes: entry.bundleBytes, sha256: entry.bundleSha256 });
    }
  } else {
    steps.push({ kind: 'download', url: entry.bundleUrl, bytes: entry.bundleBytes, sha256: entry.bundleSha256 });
  }

  // Caps the user has not granted yet
  const granted = new Set(existing?.grantedCaps ?? []);
  const newCaps = entry.manifest.capabilities.filter(c => !granted.has(c));
  if (newCaps.length) steps.push({ kind: 'request-caps', caps: newCaps });

  steps.push({ kind: 'verify-signatures', required: ctx.minSignatures ?? 1 });
  steps.push({ kind: 'unpack', targetDir: `apps/${entry.manifest.packageId}/${entry.manifest.packageVersion}` });
  steps.push({ kind: 'register', packageId: entry.manifest.packageId, version: entry.manifest.packageVersion });
  steps.push({ kind: 'rollback-on-fail', packageId: entry.manifest.packageId });

  return { ok: true, steps, pathway };
}

export interface CatalogQuery {
  text?: string;
  category?: string;
  maxRating?: 'everyone' | 'teen' | 'mature' | 'adult';
  freeOnly?: boolean;
}

const RATING_ORDER = ['everyone', 'teen', 'mature', 'adult'] as const;

export function searchCatalog(catalog: StoreCatalog, q: CatalogQuery): CatalogEntry[] {
  const max = q.maxRating ? RATING_ORDER.indexOf(q.maxRating) : RATING_ORDER.length - 1;
  return catalog.entries.filter(e => {
    if (q.category && !e.manifest.categories.includes(q.category as never)) return false;
    if (RATING_ORDER.indexOf(e.manifest.contentRating) > max) return false;
    if (q.text) {
      const hay = `${e.manifest.name} ${e.manifest.description ?? ''} ${e.manifest.packageId}`.toLowerCase();
      if (!hay.includes(q.text.toLowerCase())) return false;
    }
    return true;
  });
}
