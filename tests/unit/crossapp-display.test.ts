// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Cross-app + display models (DEX_FEATURE_BACKLOG 09): WHATWG drag dataTransfer
// effect negotiation + data store, Win32 Per-Monitor-v2 DPI rescale + per-display
// window memory, and the Apple-Handoff-style cross-device continuation policy.
import { describe, it, expect } from 'vitest';
import {
  permittedDropEffects, isDropEffectAllowed, resolveDropEffect, normalizeType, DragDataStore,
} from '../../src/shared/crossapp/dragData';
import {
  rescaleForDisplay, logicalToPhysical, physicalToLogical, displayAtPoint, WindowMemory,
  type DisplayInfo,
} from '../../src/shared/display/perDisplay';
import {
  canContinueActivity, isAdvertisementFresh, type UserActivity, type HandoffPolicy,
} from '../../src/shared/crossapp/handoff';

describe('drag dataTransfer effect negotiation (WHATWG)', () => {
  it('maps effectAllowed to the permitted dropEffects', () => {
    expect(permittedDropEffects('copyMove')).toEqual(['copy', 'move']);
    expect(permittedDropEffects('all')).toEqual(['copy', 'link', 'move']);
    expect(permittedDropEffects('none')).toEqual([]);
  });
  it('resolves a requested dropEffect, falling back when disallowed', () => {
    expect(resolveDropEffect('copyMove', 'move')).toBe('move');
    expect(resolveDropEffect('copy', 'move')).toBe('copy');     // move not allowed -> first permitted
    expect(resolveDropEffect('none', 'copy')).toBe('none');
    expect(isDropEffectAllowed('linkMove', 'link')).toBe(true);
    expect(isDropEffectAllowed('linkMove', 'copy')).toBe(false);
    expect(isDropEffectAllowed('none', 'none')).toBe(true);     // "no drop" always representable
  });
});

describe('drag data store', () => {
  it('keeps MIME types lowercased + insertion-ordered, replaces in place', () => {
    const s = new DragDataStore();
    s.setData('Text/Plain', 'hi');
    s.setData('application/json', '{}');
    s.setData('TEXT/PLAIN', 'updated'); // replace in place
    expect(normalizeType('Text/Plain')).toBe('text/plain');
    expect(s.types()).toEqual(['text/plain', 'application/json']);
    expect(s.getData('text/plain')).toBe('updated');
    expect(s.hasType('application/json')).toBe(true);
  });
  it('clears by type or entirely, and round-trips a snapshot', () => {
    const s = new DragDataStore();
    s.setData('a/b', '1'); s.setData('c/d', '2');
    s.clearData('a/b');
    expect(s.types()).toEqual(['c/d']);
    const restored = DragDataStore.fromSnapshot(s.snapshot());
    expect(restored.getData('c/d')).toBe('2');
    s.clearData();
    expect(s.types()).toEqual([]);
  });
});

describe('per-monitor-v2 DPI rescale', () => {
  const d1: DisplayInfo = { id: '1', scale: 1, bounds: { x: 0, y: 0, w: 1920, h: 1080 } };
  const d2: DisplayInfo = { id: '2', scale: 2, bounds: { x: 1920, y: 0, w: 3840, h: 2160 } };
  it('scales window size by the DPI ratio and re-anchors to the target display', () => {
    const win = { x: 100, y: 100, w: 800, h: 600 };
    const moved = rescaleForDisplay(win, d1, d2);
    expect(moved.w).toBe(1600); // 800 * (2/1)
    expect(moved.h).toBe(1200);
    expect(moved.x).toBe(1920 + 200); // target origin + scaled offset
  });
  it('converts logical <-> physical pixels', () => {
    expect(logicalToPhysical(100, d2)).toBe(200);
    expect(physicalToLogical(200, d2)).toBe(100);
  });
  it('finds the display under a point', () => {
    expect(displayAtPoint([d1, d2], 50, 50)?.id).toBe('1');
    expect(displayAtPoint([d1, d2], 2000, 50)?.id).toBe('2');
    expect(displayAtPoint([d1, d2], -10, 0)).toBeNull();
  });
});

describe('per-display window memory', () => {
  it('remembers and recalls a window position per display', () => {
    const m = new WindowMemory();
    m.remember('1', 'notes', { x: 10, y: 20, w: 400, h: 300 });
    m.remember('2', 'notes', { x: 2000, y: 50, w: 800, h: 600 });
    expect(m.recall('1', 'notes')).toEqual({ x: 10, y: 20, w: 400, h: 300 });
    expect(m.recall('2', 'notes')?.x).toBe(2000);
    expect(m.recall('1', 'unknown')).toBeNull();
    const round = WindowMemory.fromJSON(m.toJSON());
    expect(round.recall('2', 'notes')?.w).toBe(800);
  });
});

describe('Handoff continuation policy (Apple)', () => {
  const tag = (a: UserActivity) => `tag:${a.type}:${JSON.stringify(a.payload)}`;
  const base: UserActivity = { type: 'notes.edit', deviceId: 'macA', payload: { doc: 7 }, createdAt: 1000, tag: '' };
  const fresh = (): UserActivity => ({ ...base, tag: tag(base) });
  const policy: HandoffPolicy = { trustedDevices: new Set(['macA']), maxAgeMs: 60_000 };

  it('continues a fresh, trusted, intact activity', () => {
    expect(canContinueActivity(fresh(), policy, 1000 + 5000, tag).ok).toBe(true);
  });
  it('rejects an untrusted origin', () => {
    const a = { ...fresh(), deviceId: 'stranger' };
    expect(canContinueActivity(a, policy, 2000, tag).ok).toBe(false);
  });
  it('rejects a stale advertisement', () => {
    expect(canContinueActivity(fresh(), policy, 1000 + 120_000, tag).ok).toBe(false);
    expect(isAdvertisementFresh(fresh(), 1000 + 120_000)).toBe(false);
  });
  it('rejects a tampered payload', () => {
    const a = { ...fresh(), payload: { doc: 9 } }; // tag no longer matches
    expect(canContinueActivity(a, policy, 2000, tag).ok).toBe(false);
  });
});
