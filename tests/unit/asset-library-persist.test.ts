// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// The AssetLibrary was in-memory only ("storage provided by the caller", and no
// caller provided it), so every saved asset vanished on restart. It now saves
// itself to localStorage and the native key-value store and reloads on first
// read. Shared colours (Colors app <-> PRISM) ride on it.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AssetLibrary } from '../../src/renderer/services/AssetLibrary';
import { saveColor, savedColors, removeColor, isColorSaved, normalizeHex } from '../../src/renderer/services/sharedColors';

beforeEach(() => {
  delete (window as any).dex;
  localStorage.clear();
  AssetLibrary._reset();
});

describe('AssetLibrary persistence', () => {
  it('a saved asset survives a reload', () => {
    AssetLibrary.upsert({ id: 'b1', kind: 'brush', name: 'Soft round', ownerAppId: 'prism', payload: { size: 12 } });
    AssetLibrary.flush();
    AssetLibrary._rehydrate();
    expect(AssetLibrary.get('brush', 'b1')?.name).toBe('Soft round');
  });

  it('writes the native store and loads from it when the bridge is there', async () => {
    const store: Record<string, string> = {};
    (window as any).dex = { invoke: vi.fn(async (ch: string, key: string, val?: string) => {
      if (ch === 'capability:storage:set') { store[key] = val!; return true; }
      if (ch === 'capability:storage:get') return store[key] ?? null;
      return null;
    }) };
    AssetLibrary.upsert({ id: 'l1', kind: 'lut', name: 'Teal', ownerAppId: 'vinx', payload: {} });
    AssetLibrary.flush();
    expect(JSON.parse(store['dex-asset-library-v1'])[0].id).toBe('l1');
    localStorage.clear(); // only the native copy is left
    AssetLibrary._rehydrate();
    await vi.waitFor(() => expect(AssetLibrary.get('lut', 'l1')?.name).toBe('Teal'));
  });

  it('ignores a corrupt saved copy', () => {
    localStorage.setItem('dex-asset-library-v1', '{not json');
    AssetLibrary._rehydrate();
    expect(AssetLibrary.exportAll()).toEqual([]);
  });
});

describe('shared colours', () => {
  it('normalizes and de-duplicates, newest first, and persists', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(saveColor('nope', 'x')).toBe(false);
    saveColor('#FF0000', 'colorpicker');
    saveColor('#00ff00', 'prism');
    saveColor('#ff0000', 'prism'); // same colour again: one entry, moved to the front
    expect(savedColors()).toEqual(['#ff0000', '#00ff00']);
    AssetLibrary.flush();
    AssetLibrary._rehydrate();
    expect(isColorSaved('#00FF00')).toBe(true);
    removeColor('#00ff00');
    expect(savedColors()).toEqual(['#ff0000']);
  });

  it('shows up in asset search', () => {
    saveColor('#123456', 'colorpicker');
    expect(AssetLibrary.search('123456').map((a) => a.kind)).toContain('palette');
  });
});
