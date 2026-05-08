// =============================================================================
// DEX Platform — Wave 8 plugin marketplace catalog format
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Catalog format for the DEX plugin marketplace. A `MarketplaceCatalog`
 * is a signed JSON document that lists available plugins (and their
 * download URLs, signatures, and SHA256 digests). The renderer fetches
 * the catalog, verifies the publisher signature, and presents entries
 * to the user in the Plugin Marketplace surface.
 *
 * Per-plugin signatures and contentSha256 are validated again at
 * download time by the host (see src/shared/audio/pluginHost.ts).
 *
 * Catalog stability: the on-wire format is stable at CATALOG_VERSION = 1.
 */

import type { PluginCategory } from '../audio/pluginHost';

export const CATALOG_VERSION = 1;

export interface MarketplaceEntry {
  /** Reverse-DNS plugin id (matches DexPluginManifest.id). */
  id: string;
  name: string;
  vendor: string;
  /** SemVer of the latest published build. */
  version: string;
  category: PluginCategory | 'video' | 'image' | 'cad' | 'motion' | 'agent' | 'theme';
  /** One-line description shown in the catalog tile. */
  tagline: string;
  /** Long markdown description. */
  description: string;
  /** Author homepage / support URL. */
  homepage?: string;
  /** Tags for search/filtering. */
  tags: string[];
  /** Distribution channel: 'free' | 'paid' | 'trial'. */
  channel: 'free' | 'paid' | 'trial';
  /** Price in USD cents (only for 'paid'). */
  priceUsdCents?: number;
  /** Trial duration in days (only for 'trial'). */
  trialDays?: number;
  /** HTTPS URL of the .dexplugin bundle. */
  bundleUrl: string;
  /** Bundle size in bytes (informational, used for download progress). */
  bundleBytes: number;
  /** SHA256 of the bundle contents — must match after download. */
  bundleSha256: string;
  /** Ed25519 publisher signature over `bundleSha256` (128-char hex). */
  signature: string;
  /** Reverse-DNS publisher id (matches catalog.publishers[*].id). */
  publisherId: string;
  /** ISO8601 timestamp of the build. */
  publishedAt: string;
  /** Min DEX host version required (SemVer). */
  minHostVersion: string;
  /** Optional screenshots/icons (HTTPS URLs). */
  screenshots?: string[];
  iconUrl?: string;
}

export interface MarketplacePublisher {
  /** Reverse-DNS publisher id. */
  id: string;
  /** Display name. */
  name: string;
  /** Ed25519 public key in hex (64 chars). */
  publicKey: string;
  /** Optional verified-author URL. */
  homepage?: string;
  /** True when the publisher is signed off by the DEX team. */
  trusted?: boolean;
}

export interface MarketplaceCatalog {
  /** Format version. Bump when fields change incompatibly. */
  catalogVersion: number;
  /** ISO8601 timestamp of catalog generation. */
  generatedAt: string;
  /** Catalog source URL (used for cache key + integrity prompts). */
  sourceUrl: string;
  /** Ed25519 catalog signature over the SHA256 of the canonicalized payload. */
  signature: string;
  /** Catalog publisher Ed25519 public key (64 hex chars). */
  catalogPublicKey: string;
  /** All publishers referenced in this catalog. */
  publishers: MarketplacePublisher[];
  /** Plugin entries. */
  entries: MarketplaceEntry[];
}

const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;
const HTTPS_URL = /^https:\/\//i;

function pushIf(out: string[], cond: boolean, msg: string): void {
  if (cond) out.push(msg);
}

export function validateEntry(e: unknown): string[] {
  const issues: string[] = [];
  if (!e || typeof e !== 'object') return ['entry is not an object'];
  const x = e as Record<string, unknown>;
  for (const f of ['id', 'name', 'vendor', 'version', 'category', 'tagline', 'description',
    'channel', 'bundleUrl', 'bundleSha256', 'signature', 'publisherId', 'publishedAt', 'minHostVersion'] as const) {
    if (typeof x[f] !== 'string' || (x[f] as string).length === 0) issues.push(`entry: missing/invalid ${f}`);
  }
  if (!Array.isArray(x.tags)) issues.push('entry: tags must be string[]');
  if (typeof x.bundleBytes !== 'number' || (x.bundleBytes as number) < 0) issues.push('entry: bundleBytes must be a non-negative number');
  if (typeof x.bundleSha256 === 'string') pushIf(issues, !HEX64.test(x.bundleSha256 as string), 'entry: bundleSha256 must be 64-char hex');
  if (typeof x.signature === 'string') pushIf(issues, !HEX128.test(x.signature as string), 'entry: signature must be 128-char hex');
  if (typeof x.bundleUrl === 'string') pushIf(issues, !HTTPS_URL.test(x.bundleUrl as string), 'entry: bundleUrl must be HTTPS');
  if (x.channel === 'paid' && (typeof x.priceUsdCents !== 'number' || (x.priceUsdCents as number) < 0)) {
    issues.push('entry: paid channel requires priceUsdCents >= 0');
  }
  if (x.channel === 'trial' && (typeof x.trialDays !== 'number' || (x.trialDays as number) <= 0)) {
    issues.push('entry: trial channel requires trialDays > 0');
  }
  if (Array.isArray(x.screenshots)) {
    for (const s of x.screenshots as unknown[]) {
      if (typeof s !== 'string' || !HTTPS_URL.test(s)) issues.push('entry: screenshots must all be HTTPS URLs');
    }
  }
  return issues;
}

export function validatePublisher(p: unknown): string[] {
  const issues: string[] = [];
  if (!p || typeof p !== 'object') return ['publisher is not an object'];
  const x = p as Record<string, unknown>;
  if (typeof x.id !== 'string' || x.id.length === 0) issues.push('publisher: missing id');
  if (typeof x.name !== 'string' || x.name.length === 0) issues.push('publisher: missing name');
  if (typeof x.publicKey !== 'string' || !HEX64.test(x.publicKey)) issues.push('publisher: publicKey must be 64-char hex');
  return issues;
}

export function validateCatalog(c: unknown): string[] {
  const issues: string[] = [];
  if (!c || typeof c !== 'object') return ['catalog is not an object'];
  const x = c as Record<string, unknown>;
  if (x.catalogVersion !== CATALOG_VERSION) issues.push(`catalog: catalogVersion must be ${CATALOG_VERSION}`);
  for (const f of ['generatedAt', 'sourceUrl', 'signature', 'catalogPublicKey'] as const) {
    if (typeof x[f] !== 'string' || (x[f] as string).length === 0) issues.push(`catalog: missing ${f}`);
  }
  if (typeof x.signature === 'string') pushIf(issues, !HEX128.test(x.signature as string), 'catalog: signature must be 128-char hex');
  if (typeof x.catalogPublicKey === 'string') pushIf(issues, !HEX64.test(x.catalogPublicKey as string), 'catalog: catalogPublicKey must be 64-char hex');
  if (typeof x.sourceUrl === 'string') pushIf(issues, !HTTPS_URL.test(x.sourceUrl as string), 'catalog: sourceUrl must be HTTPS');
  if (!Array.isArray(x.publishers)) issues.push('catalog: publishers must be an array');
  else {
    const seen = new Set<string>();
    for (const p of x.publishers as unknown[]) {
      const sub = validatePublisher(p);
      sub.forEach(s => issues.push(s));
      const id = (p as { id?: string })?.id;
      if (typeof id === 'string') {
        if (seen.has(id)) issues.push(`catalog: duplicate publisher id ${id}`);
        else seen.add(id);
      }
    }
  }
  if (!Array.isArray(x.entries)) issues.push('catalog: entries must be an array');
  else {
    const pubIds = new Set(((x.publishers as unknown[]) ?? [])
      .map(p => (p as { id?: string })?.id)
      .filter((s): s is string => typeof s === 'string'));
    const seen = new Set<string>();
    for (const e of x.entries as unknown[]) {
      const sub = validateEntry(e);
      sub.forEach(s => issues.push(s));
      const id = (e as { id?: string })?.id;
      if (typeof id === 'string') {
        if (seen.has(id)) issues.push(`catalog: duplicate entry id ${id}`);
        else seen.add(id);
      }
      const pubId = (e as { publisherId?: string })?.publisherId;
      if (typeof pubId === 'string' && !pubIds.has(pubId)) {
        issues.push(`catalog: entry ${id ?? '?'} references unknown publisher ${pubId}`);
      }
    }
  }
  return issues;
}

export function isValidCatalog(c: unknown): c is MarketplaceCatalog {
  return validateCatalog(c).length === 0;
}

/**
 * Canonicalize a catalog payload for signing/verification.
 * Strips the `signature` field, then JSON-stringifies with sorted keys.
 */
export function canonicalizeForSigning(c: MarketplaceCatalog): string {
  const { signature: _sig, ...rest } = c;
  void _sig;
  return stableStringify(rest);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k])).join(',') + '}';
}
