// =============================================================================
// DEX Platform — Track B1: .dexpkg v2 manifest extension
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * v2 layers atop the existing v1 manifest with: dependencies, capabilities,
 * Ed25519 multi-sig (publisher + DEX co-sign), binary deltas, content
 * rating, and store category. v1 packages remain readable; v2 produces a
 * superset object so loaders pick whichever surface they need.
 */

import type { AppCapability } from '../runtime/appContainer';
import type { DexPkgManifest } from './manifest';

export const DEXPKG_V2_VERSION = 2;

export type ContentRating =
  | 'everyone' | 'teen' | 'mature' | 'adult';

export type StoreCategory =
  | 'creative' | 'productivity' | 'developer' | 'utility'
  | 'communication' | 'media' | 'game' | 'education' | 'health';

export interface SemverDep {
  /** Reverse-DNS id of the depended package. */
  id: string;
  /** SemVer range (e.g. ^1.2.0). */
  range: string;
  optional?: boolean;
}

export interface PackageSignature {
  /** Reverse-DNS signer id. */
  signerId: string;
  /** Ed25519 public key (64 hex). */
  publicKey: string;
  /** Ed25519 sig over canonical manifest (128 hex). */
  signature: string;
  /** ISO timestamp of signing. */
  signedAt: string;
  /** 'publisher' = author. 'cosign' = DEX co-signer. 'reviewer' = audit. */
  role: 'publisher' | 'cosign' | 'reviewer';
}

export interface DeltaRef {
  /** Source version (semver). */
  fromVersion: string;
  /** SHA-256 of the binary delta payload. */
  payloadSha256: string;
  /** Size of the delta in bytes. */
  bytes: number;
  /** Algorithm. Currently only 'bsdiff-zstd'. */
  algo: 'bsdiff-zstd';
}

export interface DexPkgManifestV2 extends DexPkgManifest {
  formatVersion: 2;
  /** Reverse-DNS package id (e.g. com.example.cool-tool). */
  packageId: string;
  /** SemVer of the package itself. */
  packageVersion: string;
  /** Required runtime capabilities. */
  capabilities: AppCapability[];
  /** Other packages this one needs at runtime. */
  dependencies: SemverDep[];
  /** Multi-sig stack. Empty array = unsigned. */
  signatures: PackageSignature[];
  /** Available delta updates pointing back to older versions. */
  deltas: DeltaRef[];
  /** Min host runtime version (semver). */
  minRuntime: string;
  /** Content rating for storefront filters. */
  contentRating: ContentRating;
  /** Categories for storefront browse. */
  categories: StoreCategory[];
}

const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/;
const REVDNS = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function validateManifestV2(m: unknown): string[] {
  const issues: string[] = [];
  if (!m || typeof m !== 'object') return ['manifest is not an object'];
  const x = m as Record<string, unknown>;
  if (x.formatVersion !== 2) issues.push('formatVersion must be 2');
  if (typeof x.packageId !== 'string' || !REVDNS.test(x.packageId as string)) {
    issues.push('packageId must be reverse-DNS');
  }
  if (typeof x.packageVersion !== 'string' || !SEMVER.test(x.packageVersion as string)) {
    issues.push('packageVersion must be semver');
  }
  if (typeof x.minRuntime !== 'string' || !SEMVER.test(x.minRuntime as string)) {
    issues.push('minRuntime must be semver');
  }
  if (!Array.isArray(x.capabilities)) issues.push('capabilities must be array');
  if (!Array.isArray(x.dependencies)) issues.push('dependencies must be array');
  if (!Array.isArray(x.signatures)) issues.push('signatures must be array');
  if (!Array.isArray(x.deltas)) issues.push('deltas must be array');
  if (!Array.isArray(x.categories)) issues.push('categories must be array');
  if (Array.isArray(x.signatures)) {
    for (const sRaw of x.signatures) {
      const s = sRaw as PackageSignature;
      if (!HEX64.test(s.publicKey ?? '')) issues.push('signature.publicKey must be 64 hex');
      if (!HEX128.test(s.signature ?? '')) issues.push('signature.signature must be 128 hex');
    }
  }
  if (Array.isArray(x.deltas)) {
    for (const dRaw of x.deltas) {
      const d = dRaw as DeltaRef;
      if (!HEX64.test(d.payloadSha256 ?? '')) issues.push('delta.payloadSha256 must be 64 hex');
      if (!SEMVER.test(d.fromVersion ?? '')) issues.push('delta.fromVersion must be semver');
    }
  }
  return issues;
}

/** Canonical (sig-stable) JSON — sort keys, drop signatures field. */
export function canonicalize(m: DexPkgManifestV2): string {
  const { signatures: _omit, ...rest } = m;
  void _omit;
  return JSON.stringify(rest, Object.keys(rest).sort());
}

export function semverCompare(a: string, b: string): number {
  const pa = a.split('.').map(s => parseInt(s, 10));
  const pb = b.split('.').map(s => parseInt(s, 10));
  for (let i = 0; i < 3; i++) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
}

export function satisfiesRange(version: string, range: string): boolean {
  // Minimal subset: '^1.2.3' (compatible-with), '~1.2.3' (patch), '1.2.3' (exact).
  const r = range.trim();
  if (r.startsWith('^')) {
    const base = r.slice(1);
    if (semverCompare(version, base) < 0) return false;
    const major = base.split('.')[0]!;
    return version.split('.')[0] === major;
  }
  if (r.startsWith('~')) {
    const base = r.slice(1);
    if (semverCompare(version, base) < 0) return false;
    const [maj, min] = base.split('.');
    const [vm, vn] = version.split('.');
    return vm === maj && vn === min;
  }
  return version === r;
}
