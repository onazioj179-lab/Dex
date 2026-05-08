// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { planInstall, searchCatalog, type CatalogEntry, type StoreCatalog } from '../../src/shared/store/catalog';
import type { DexPkgManifestV2 } from '../../src/shared/dexpkg/manifestV2';

function manifest(over: Partial<DexPkgManifestV2> = {}): DexPkgManifestV2 {
  return {
    magic: 'DEXPKG', formatVersion: 2, app: 'standalone', projectVersion: 1,
    createdAt: 'x', modifiedAt: 'x', writerVersion: '4.1.1', name: 'X',
    assets: [], thumbnails: [],
    packageId: 'com.example.x', packageVersion: '1.0.0',
    capabilities: ['files.read'], dependencies: [], signatures: [],
    deltas: [], minRuntime: '4.0.0', contentRating: 'everyone', categories: ['utility'],
    ...over,
  };
}

const entry: CatalogEntry = {
  manifest: manifest(),
  bundleUrl: 'https://example/bundle.dexpkg',
  bundleBytes: 1000,
  bundleSha256: 'a'.repeat(64),
};

describe('store install planner', () => {
  it('fresh install produces full step list', () => {
    const r = planInstall(entry, { installed: [], hostRuntime: '4.1.0' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pathway).toBe('fresh');
    expect(r.steps.find(s => s.kind === 'download')).toBeDefined();
    expect(r.steps.find(s => s.kind === 'request-caps')).toBeDefined();
    expect(r.steps.find(s => s.kind === 'register')).toBeDefined();
  });
  it('rejects when host runtime too old', () => {
    const r = planInstall(entry, { installed: [], hostRuntime: '3.0.0' });
    expect(r.ok).toBe(false);
  });
  it('skips when already installed at same version', () => {
    const r = planInstall(entry, { installed: [{ packageId: 'com.example.x', version: '1.0.0', installedAt: 0, grantedCaps: ['files.read'] }], hostRuntime: '4.1.0' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pathway).toBe('skip');
  });
  it('uses delta when available', () => {
    const m = manifest({ packageVersion: '2.0.0', deltas: [{ fromVersion: '1.0.0', payloadSha256: 'b'.repeat(64), bytes: 100, algo: 'bsdiff-zstd' }] });
    const e: CatalogEntry = { ...entry, manifest: m, deltaUrls: ['https://example/delta.bin'] };
    const r = planInstall(e, { installed: [{ packageId: 'com.example.x', version: '1.0.0', installedAt: 0, grantedCaps: ['files.read'] }], hostRuntime: '4.1.0' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pathway).toBe('delta');
    expect(r.steps.find(s => s.kind === 'apply-delta')).toBeDefined();
  });
  it('catalog search filters by category and rating', () => {
    const cat: StoreCatalog = { generatedAt: 'x', entries: [
      entry,
      { ...entry, manifest: manifest({ packageId: 'com.example.adult', contentRating: 'adult' }) },
    ]};
    expect(searchCatalog(cat, { maxRating: 'teen' }).length).toBe(1);
  });
});
