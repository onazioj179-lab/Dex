// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 500-improvement wave 2 tests.
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  computeSlice,
  LRU,
  commandPalette, shortcuts, liveRegion, secureClipboard,
  IdleDetector,
} from '../../src/renderer/improvements500';

describe('virtualList.computeSlice', () => {
  it('returns empty slice for zero items', () => {
    expect(computeSlice(0, 32, 0, 400)).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0, totalHeight: 0 });
  });

  it('first page when scrollTop=0', () => {
    const s = computeSlice(1000, 40, 0, 400, 2);
    expect(s.start).toBe(0);
    expect(s.end).toBeGreaterThanOrEqual(10);
    expect(s.padTop).toBe(0);
    expect(s.totalHeight).toBe(40000);
  });

  it('mid scroll respects buffer', () => {
    const s = computeSlice(1000, 40, 4000, 400, 4);
    expect(s.start).toBe(96);
    expect(s.padTop).toBe(96 * 40);
  });

  it('end of list clips to itemCount', () => {
    const s = computeSlice(50, 40, 99999, 400);
    expect(s.end).toBe(50);
    expect(s.padBottom).toBe(0);
  });
});

describe('LRU', () => {
  it('evicts oldest when over capacity', () => {
    const lru = new LRU<string, number>(2);
    lru.set('a', 1); lru.set('b', 2); lru.set('c', 3);
    expect(lru.has('a')).toBe(false);
    expect(lru.has('b')).toBe(true);
    expect(lru.has('c')).toBe(true);
  });

  it('get bumps recency', () => {
    const lru = new LRU<string, number>(2);
    lru.set('a', 1); lru.set('b', 2);
    lru.get('a');
    lru.set('c', 3);
    expect(lru.has('a')).toBe(true);
    expect(lru.has('b')).toBe(false);
  });

  it('throws on bad capacity', () => {
    expect(() => new LRU(0)).toThrow();
  });
});

describe('commandPalette', () => {
  beforeEach(() => commandPalette._reset());

  it('register/list', () => {
    commandPalette.registerCommand({ id: 'x', title: 'Open Files', run: () => {} });
    expect(commandPalette.listCommands().map((c) => c.id)).toEqual(['x']);
  });

  it('unregister via returned dispose', () => {
    const dispose = commandPalette.registerCommand({ id: 'a', title: 'A', run: () => {} });
    dispose();
    expect(commandPalette.listCommands()).toHaveLength(0);
  });

  it('fuzzy search ranks consecutive matches higher', () => {
    commandPalette.registerCommand({ id: '1', title: 'Open Files', run: () => {} });
    commandPalette.registerCommand({ id: '2', title: 'Octopus Field', run: () => {} });
    const results = commandPalette.searchCommands('open');
    expect(results[0].command.id).toBe('1');
  });

  it('search filters out non-matches', () => {
    commandPalette.registerCommand({ id: '1', title: 'Apple', run: () => {} });
    expect(commandPalette.searchCommands('xyz')).toHaveLength(0);
  });
});

describe('shortcuts', () => {
  beforeEach(() => shortcuts._reset());

  it('parseBinding extracts modifiers', () => {
    expect(shortcuts.parseBinding('Ctrl+Shift+K')).toMatchObject({ ctrl: true, shift: true, key: 'K' });
    expect(shortcuts.parseBinding('Cmd+P')).toMatchObject({ meta: true, key: 'P' });
  });

  it('matchesEvent compares modifiers exactly', () => {
    expect(shortcuts.matchesEvent('Ctrl+K', { ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, key: 'k' })).toBe(true);
    expect(shortcuts.matchesEvent('Ctrl+K', { ctrlKey: false, metaKey: true, shiftKey: false, altKey: false, key: 'k' })).toBe(false);
  });

  it('register + dispatch fires run', () => {
    const spy = vi.fn();
    shortcuts.registerShortcut({ id: 'test.cmd', description: 'Test', defaultBinding: 'Ctrl+K', run: spy });
    const handled = shortcuts.dispatch({ ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, key: 'k', preventDefault() {}, stopPropagation() {} } as unknown as KeyboardEvent);
    expect(handled).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('user remap overrides default and persists in cheatSheet', () => {
    shortcuts.registerShortcut({ id: 'test.cmd', description: 'Test', defaultBinding: 'Ctrl+K', run: () => {} });
    shortcuts.setBinding('test.cmd', 'Ctrl+L');
    expect(shortcuts.getBinding('test.cmd')).toBe('Ctrl+L');
    const sheet = shortcuts.cheatSheet();
    expect(sheet[0].items[0].binding).toBe('Ctrl+L');
  });
});

describe('liveRegion', () => {
  beforeEach(() => liveRegion._teardown());

  it('creates a polite region on first announce', () => {
    liveRegion.announce('hi');
    expect(document.getElementById('dex-live-region-polite')).not.toBeNull();
  });

  it('separate region per politeness', () => {
    liveRegion.announce('low', 'polite');
    liveRegion.announce('high', 'assertive');
    expect(document.getElementById('dex-live-region-polite')).not.toBeNull();
    expect(document.getElementById('dex-live-region-assertive')).not.toBeNull();
  });
});

describe('secureClipboard', () => {
  beforeEach(() => {
    secureClipboard._reset();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(async () => undefined),
        readText: vi.fn(async () => ''),
      },
    });
  });

  it('copySecret writes through navigator.clipboard', async () => {
    await secureClipboard.copySecret('s3cret', { clearAfterMs: 999_999 });
    expect((navigator.clipboard.writeText as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('s3cret');
  });

  it('readClipboard requires recent gesture', async () => {
    await expect(secureClipboard.readClipboard()).rejects.toThrow(/gesture/);
    secureClipboard.recordUserGesture();
    await expect(secureClipboard.readClipboard()).resolves.toBe('');
  });
});

describe('IdleDetector', () => {
  it('transitions active -> idle -> away based on tick deltas', () => {
    const states: string[] = [];
    const d = new IdleDetector({ idleAfterMs: 60_000, awayAfterMs: 300_000, onChange: (s) => states.push(s) });
    const t0 = 1_000_000;
    d.poke(t0); // baseline lastActivity
    d.tick(t0 + 70_000); // idle
    d.tick(t0 + 400_000); // away
    d.poke(t0 + 400_001);
    expect(states).toEqual(['idle', 'away', 'active']);
    expect(d.getState()).toBe('active');
  });
});
