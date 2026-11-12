// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  serializeDeck, parseDeck, loadWorkingDeck, saveWorkingDeck,
  historyStart, historyRecord, historyUndo, historyRedo, HISTORY_COALESCE_MS, HISTORY_LIMIT,
} from '../../src/renderer/DEXAPPLICATIONS/standalone/presentationDeck';

type S = { id: string };
const migrate = (x: unknown): S => ({ id: String((x as S)?.id ?? 'new') });

function memStorage(init: Record<string, string> = {}, quota = Infinity) {
  const data = { ...init };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      if (v.length > quota) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
      data[k] = v;
    },
  };
}

describe('deck files', () => {
  it('round-trips slides and theme', () => {
    const text = serializeDeck([{ id: 'a' }, { id: 'b' }], 'ocean', new Date('2026-11-11T00:00:00Z'));
    expect(parseDeck(text, migrate)).toEqual({ slides: [{ id: 'a' }, { id: 'b' }], theme: 'ocean' });
  });

  it('reads the older bare-array form and refuses other files with a reason', () => {
    expect(parseDeck('[{"id":"x"}]', migrate)).toEqual({ slides: [{ id: 'x' }], theme: null });
    expect(() => parseDeck('{nope', migrate)).toThrow('not valid JSON');
    expect(() => parseDeck('{"format":"other"}', migrate)).toThrow('Not a DEX presentation');
    expect(() => parseDeck('{"format":"dex-deck","version":9,"slides":[{}]}', migrate)).toThrow('Unsupported deck version: 9');
    expect(() => parseDeck('[]', migrate)).toThrow('no slides');
  });
});

describe('working deck storage', () => {
  it('moves an unreadable stored deck aside instead of losing it', () => {
    const st = memStorage({ deck: '{broken' });
    const r = loadWorkingDeck(st, 'deck', migrate, 42);
    expect(r).toEqual({ slides: null, movedAside: 'deck.unreadable-42' });
    expect(st.data['deck.unreadable-42']).toBe('{broken');
  });

  it('loads a stored deck and reports a full store as quota', () => {
    expect(loadWorkingDeck(memStorage({ deck: '[{"id":"q"}]' }), 'deck', migrate).slides).toEqual([{ id: 'q' }]);
    expect(loadWorkingDeck(memStorage(), 'deck', migrate)).toEqual({ slides: null, movedAside: null });
    expect(saveWorkingDeck(memStorage({}, 5), 'deck', [{ id: 'long' }])).toEqual({ ok: false, reason: 'quota' });
    expect(saveWorkingDeck(null, 'deck', [])).toEqual({ ok: false, reason: 'unavailable' });
    expect(saveWorkingDeck(memStorage(), 'deck', [{ id: 'a' }])).toEqual({ ok: true, bytes: '[{"id":"a"}]'.length });
  });
});

describe('undo history', () => {
  const a = [{ id: 'a' }];
  const b = [{ id: 'b' }];
  const c = [{ id: 'c' }];

  it('undoes and redoes separate edits', () => {
    let h = historyStart<S>(a);
    h = historyRecord(h, b, 1000);
    h = historyRecord(h, c, 1000 + HISTORY_COALESCE_MS + 1);
    const u1 = historyUndo(h)!;
    expect(u1.slides).toBe(b);
    const u2 = historyUndo(u1.h)!;
    expect(u2.slides).toBe(a);
    expect(historyUndo(u2.h)).toBeNull();
    const r1 = historyRedo(u2.h)!;
    expect(r1.slides).toBe(b);
    expect(historyRedo(r1.h)!.slides).toBe(c);
  });

  it('joins rapid edits into one step and drops redo after a new edit', () => {
    let h = historyStart<S>(a);
    h = historyRecord(h, b, 1000);
    h = historyRecord(h, c, 1100); // typing burst
    expect(h.past).toEqual([a]);
    const u = historyUndo(h)!;
    expect(u.slides).toBe(a);
    const after = historyRecord(u.h, b, 1200);
    expect(after.future).toEqual([]);
    expect(historyRecord(after, b, 1300)).toBe(after); // same state: no step
  });

  it('keeps at most HISTORY_LIMIT steps', () => {
    let h = historyStart<S>([{ id: '0' }]);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = historyRecord(h, [{ id: String(i) }], i * 10_000);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toEqual([{ id: '20' }]);
  });
});
