// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { validateManifestV2, semverCompare, satisfiesRange, canonicalize, type DexPkgManifestV2 } from '../../src/shared/dexpkg/manifestV2';

const goodManifest: DexPkgManifestV2 = {
  magic: 'DEXPKG',
  formatVersion: 2,
  app: 'standalone',
  projectVersion: 1,
  createdAt: '2026-01-01T00:00:00Z',
  modifiedAt: '2026-01-01T00:00:00Z',
  writerVersion: '4.1.1',
  name: 'Sample',
  assets: [],
  thumbnails: [],
  packageId: 'com.example.sample',
  packageVersion: '1.2.3',
  capabilities: ['files.read'],
  dependencies: [{ id: 'com.example.lib', range: '^1.0.0' }],
  signatures: [],
  deltas: [],
  minRuntime: '4.1.0',
  contentRating: 'everyone',
  categories: ['utility'],
};

describe('dexpkg manifest v2', () => {
  it('validates good manifest', () => {
    expect(validateManifestV2(goodManifest)).toEqual([]);
  });
  it('rejects bad packageId', () => {
    expect(validateManifestV2({ ...goodManifest, packageId: 'not-rev-dns' })).toContain('packageId must be reverse-DNS');
  });
  it('semver compare', () => {
    expect(semverCompare('1.2.3', '1.2.4')).toBe(-1);
    expect(semverCompare('2.0.0', '1.99.0')).toBe(1);
    expect(semverCompare('1.0.0', '1.0.0')).toBe(0);
  });
  it('satisfies range', () => {
    expect(satisfiesRange('1.5.0', '^1.0.0')).toBe(true);
    expect(satisfiesRange('2.0.0', '^1.0.0')).toBe(false);
    expect(satisfiesRange('1.2.5', '~1.2.0')).toBe(true);
    expect(satisfiesRange('1.3.0', '~1.2.0')).toBe(false);
    expect(satisfiesRange('1.2.3', '1.2.3')).toBe(true);
  });
  it('canonicalize drops signatures', () => {
    const c = canonicalize({ ...goodManifest, signatures: [{ signerId: 's', publicKey: 'a'.repeat(64), signature: 'b'.repeat(128), signedAt: 'x', role: 'publisher' }] });
    expect(c.includes('signatures')).toBe(false);
  });
});
