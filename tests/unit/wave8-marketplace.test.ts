// =============================================================================
// Wave 8 marketplace catalog tests
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  CATALOG_VERSION,
  validateCatalog,
  validateEntry,
  validatePublisher,
  canonicalizeForSigning,
  isValidCatalog,
  type MarketplaceCatalog,
} from '../../src/shared/plugin/marketplaceManifest';

const HEX64 = '0'.repeat(64);
const HEX128 = '0'.repeat(128);

function makeCatalog(): MarketplaceCatalog {
  return {
    catalogVersion: CATALOG_VERSION,
    generatedAt: '2026-05-08T00:00:00Z',
    sourceUrl: 'https://catalog.dex.example/v1.json',
    signature: HEX128,
    catalogPublicKey: HEX64,
    publishers: [
      { id: 'com.dex', name: 'DEX', publicKey: HEX64, trusted: true },
    ],
    entries: [
      {
        id: 'com.dex.eq.parametric4',
        name: '4-Band EQ',
        vendor: 'DEX',
        version: '1.0.0',
        category: 'eq',
        tagline: 'Surgical 4-band parametric EQ',
        description: 'EQ with shelves and bells.',
        tags: ['eq', 'mixing'],
        channel: 'free',
        bundleUrl: 'https://catalog.dex.example/eq4.dexplugin',
        bundleBytes: 12345,
        bundleSha256: HEX64,
        signature: HEX128,
        publisherId: 'com.dex',
        publishedAt: '2026-05-08T00:00:00Z',
        minHostVersion: '4.0.0',
      },
    ],
  };
}

describe('Wave 8 — marketplace catalog', () => {
  it('accepts a well-formed catalog', () => {
    const c = makeCatalog();
    expect(validateCatalog(c)).toEqual([]);
    expect(isValidCatalog(c)).toBe(true);
  });

  it('flags wrong catalogVersion', () => {
    const c = makeCatalog();
    (c as { catalogVersion: number }).catalogVersion = 999;
    expect(validateCatalog(c).some(s => s.includes('catalogVersion'))).toBe(true);
  });

  it('rejects non-HTTPS bundleUrl', () => {
    const c = makeCatalog();
    c.entries[0].bundleUrl = 'http://insecure.example/x.dexplugin';
    expect(validateCatalog(c).some(s => s.includes('bundleUrl'))).toBe(true);
  });

  it('rejects bad sha256 length', () => {
    expect(validateEntry({ ...makeCatalog().entries[0], bundleSha256: 'short' }).some(s => s.includes('bundleSha256'))).toBe(true);
  });

  it('requires priceUsdCents on paid channel', () => {
    const e = { ...makeCatalog().entries[0], channel: 'paid' as const };
    expect(validateEntry(e).some(s => s.includes('priceUsdCents'))).toBe(true);
  });

  it('rejects entries pointing at unknown publisher', () => {
    const c = makeCatalog();
    c.entries[0].publisherId = 'com.unknown';
    expect(validateCatalog(c).some(s => s.includes('unknown publisher'))).toBe(true);
  });

  it('rejects publisher with bad public key', () => {
    expect(validatePublisher({ id: 'x', name: 'X', publicKey: 'nothex' }).some(s => s.includes('publicKey'))).toBe(true);
  });

  it('canonicalizes deterministically and excludes signature', () => {
    const c = makeCatalog();
    const a = canonicalizeForSigning(c);
    const b = canonicalizeForSigning({ ...c, signature: 'f'.repeat(128) });
    expect(a).toBe(b);
    // The top-level catalog signature must be stripped (per-entry signatures remain).
    expect(a.startsWith('{"catalogPublicKey"')).toBe(true);
    // Stable across key reorder
    const reordered = JSON.parse(JSON.stringify(c));
    const c2: MarketplaceCatalog = {
      entries: reordered.entries,
      publishers: reordered.publishers,
      catalogPublicKey: reordered.catalogPublicKey,
      signature: reordered.signature,
      sourceUrl: reordered.sourceUrl,
      generatedAt: reordered.generatedAt,
      catalogVersion: reordered.catalogVersion,
    };
    expect(canonicalizeForSigning(c2)).toBe(a);
  });

  it('detects duplicate entry ids', () => {
    const c = makeCatalog();
    c.entries.push({ ...c.entries[0] });
    expect(validateCatalog(c).some(s => s.includes('duplicate entry id'))).toBe(true);
  });
});
