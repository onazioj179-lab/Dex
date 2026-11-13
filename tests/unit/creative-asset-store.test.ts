// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mem = new Map<string, unknown>();
let failNextSet = false;
vi.mock('idb-keyval', () => ({
  get: async (k: string) => mem.get(k),
  set: async (k: string, v: unknown) => { if (failNextSet) { failNextSet = false; throw new Error('QuotaExceededError'); } mem.set(k, v); },
  del: async (k: string) => { mem.delete(k); },
}));

import { saveAsset, listAssets, loadAsset, deleteAsset, MAX_ASSET_BYTES, LIBRARY_CHANGED } from '../../src/renderer/services/creativeAssetStore';

const img = (name: string, data = 'data:image/png;base64,AAAA') => ({ kind: 'image' as const, name, sourceApp: 'prism' as const, data, mimeType: 'image/png' });

describe('creative asset library', () => {
  beforeEach(() => { mem.clear(); failNextSet = false; });

  it('saves, lists newest first, loads and deletes', async () => {
    const events: string[] = [];
    window.addEventListener(LIBRARY_CHANGED, () => events.push('x'));
    const a = await saveAsset(img('one'));
    await new Promise(r => setTimeout(r, 2));
    const b = await saveAsset(img('two'));
    expect(a.ok && b.ok).toBe(true);
    expect((await listAssets()).map(e => e.name)).toEqual(['two', 'one']);
    const id = (await listAssets())[1].id;
    const full = await loadAsset(id);
    expect(full?.data).toBe('data:image/png;base64,AAAA');
    expect(full?.kind).toBe('image');
    expect(await deleteAsset(id)).toBe(true);
    expect((await listAssets()).map(e => e.name)).toEqual(['two']);
    expect(await loadAsset(id)).toBeNull();
    expect(events.length).toBe(3);
  });

  it('refuses empty and oversized assets', async () => {
    expect((await saveAsset(img('empty', ''))).ok).toBe(false);
    const huge = 'x'.repeat(MAX_ASSET_BYTES / 2 + 1);
    const r = await saveAsset(img('huge', huge));
    expect(r.ok).toBe(false);
    expect((await listAssets()).length).toBe(0);
  });

  it('reports a storage failure instead of claiming success', async () => {
    failNextSet = true;
    const r = await saveAsset(img('full disk'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Quota/);
    expect((await listAssets()).length).toBe(0);
  });
});
