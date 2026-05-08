// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi } from 'vitest';
import { runInstall, type InstallerHooks } from '../../src/shared/store/installer';
import type { CatalogEntry } from '../../src/shared/store/catalog';
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

function happyHooks(over: Partial<InstallerHooks> = {}): InstallerHooks {
  return {
    download: vi.fn(async () => '/tmp/bundle'),
    verifySignatures: vi.fn(async () => true),
    applyDelta: vi.fn(async (p) => p + '.patched'),
    unpack: vi.fn(async () => '/tmp/staged'),
    snapshotExisting: vi.fn(async () => 's-1'),
    rollback: vi.fn(async () => undefined),
    register: vi.fn(async () => undefined),
    requestCapabilities: vi.fn(async (_id, caps) => ({ granted: caps, denied: [] })),
    ...over,
  };
}

describe('AppInstaller', () => {
  it('runs fresh install end-to-end', async () => {
    const hooks = happyHooks();
    const r = await runInstall(entry, { installed: [], hostRuntime: '4.1.0' }, hooks);
    expect(r.ok).toBe(true);
    expect(hooks.download).toHaveBeenCalled();
    expect(hooks.register).toHaveBeenCalled();
  });

  it('returns skip without running hooks', async () => {
    const hooks = happyHooks();
    const r = await runInstall(entry, {
      installed: [{ packageId: 'com.example.x', version: '1.0.0', installedAt: 0, grantedCaps: ['files.read'] }],
      hostRuntime: '4.1.0',
    }, hooks);
    expect(r.ok).toBe(true);
    expect(hooks.download).not.toHaveBeenCalled();
  });

  it('aborts on caps denied', async () => {
    const hooks = happyHooks({
      requestCapabilities: vi.fn(async () => ({ granted: [], denied: ['files.read'] })),
    });
    const r = await runInstall(entry, { installed: [], hostRuntime: '4.1.0' }, hooks);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('caps-denied');
  });

  it('rolls back on signature failure when snapshot was taken', async () => {
    const m = manifest({ packageVersion: '2.0.0' });
    const e2: CatalogEntry = { ...entry, manifest: m };
    const hooks = happyHooks({ verifySignatures: vi.fn(async () => false) });
    const r = await runInstall(e2, {
      installed: [{ packageId: 'com.example.x', version: '1.0.0', installedAt: 0, grantedCaps: ['files.read'] }],
      hostRuntime: '4.1.0',
    }, hooks);
    expect(r.ok).toBe(false);
    expect(r.rolledBack).toBe(true);
    expect(hooks.rollback).toHaveBeenCalled();
  });

  it('rejects if planInstall returns ok:false (host too old)', async () => {
    const hooks = happyHooks();
    const r = await runInstall(entry, { installed: [], hostRuntime: '3.0.0' }, hooks);
    expect(r.ok).toBe(false);
    expect(hooks.download).not.toHaveBeenCalled();
  });
});
