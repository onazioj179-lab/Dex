// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Platform v4.0.1 - Wave J power-user macros tests
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  expandSnippet,
  normaliseMacro, macroDurationMs, compressMacro,
  fuzzyMatch,
  normaliseCombo, detectHotkeyConflicts,
} from '../../src/shared/power/macros';

describe('snippet engine', () => {
  it('expands clipboard', () => {
    expect(expandSnippet('hi $CLIPBOARD', { clipboard: 'world' }).text).toBe('hi world');
  });
  it('expands date format', () => {
    const out = expandSnippet('today: $DATE(YYYY-MM-DD)', { date: new Date(2026, 4, 7) }).text;
    expect(out).toBe('today: 2026-05-07');
  });
  it('exposes placeholders', () => {
    const r = expandSnippet('hello ${1:name}, age $2', {});
    expect(r.placeholders.length).toBe(2);
    expect(r.text).toBe('hello name, age ');
  });
  it('cursor at $0', () => {
    const r = expandSnippet('a$0b', {});
    expect(r.cursorOffset).toBe(1);
  });
});

describe('macros', () => {
  it('normalises start time to 0', () => {
    const out = normaliseMacro([{ kind: 'text', value: 'a', atMs: 100 }, { kind: 'text', value: 'b', atMs: 200 }]);
    expect(out[0].atMs).toBe(0);
    expect(out[1].atMs).toBe(100);
  });
  it('macroDurationMs', () => {
    expect(macroDurationMs({ id: 'm', name: 'n', events: [{ kind: 'text', value: 'a', atMs: 100 }, { kind: 'text', value: 'b', atMs: 500 }] })).toBe(500);
  });
  it('compresses adjacent text events', () => {
    const out = compressMacro([
      { kind: 'text', value: 'a', atMs: 0 },
      { kind: 'text', value: 'b', atMs: 50 },
      { kind: 'pause', ms: 100, atMs: 100 },
      { kind: 'text', value: 'c', atMs: 300 },
    ]);
    expect(out.filter(e => e.kind === 'text').length).toBe(2);
    expect((out[0] as { value: string }).value).toBe('ab');
  });
});

describe('fuzzy matcher', () => {
  it('matches subseq', () => {
    const r = fuzzyMatch(['foobar', 'foxtrot', 'banana'], 'fb', x => x);
    expect(r[0].item).toBe('foobar');
  });
  it('returns positions', () => {
    const r = fuzzyMatch(['hello'], 'hl', x => x);
    expect(r[0].positions).toEqual([0, 2]);
  });
  it('empty query returns all', () => {
    expect(fuzzyMatch(['a', 'b'], '', x => x)).toHaveLength(2);
  });
  it('no match returns empty', () => {
    expect(fuzzyMatch(['abc'], 'xyz', x => x)).toEqual([]);
  });
});

describe('hotkey combos', () => {
  it('normalises mod order', () => {
    expect(normaliseCombo('Shift+Ctrl+S')).toBe('ctrl+shift+s');
  });
  it('detects conflicts', () => {
    const c = detectHotkeyConflicts([
      { id: '1', combo: 'Ctrl+S', scope: 'global', action: 'save' },
      { id: '2', combo: 'ctrl+s', scope: 'global', action: 'submit' },
      { id: '3', combo: 'Ctrl+S', scope: 'editor', action: 'save' },
    ]);
    expect(c).toHaveLength(1);
    expect(c[0].combo).toBe('ctrl+s');
    expect(c[0].bindings).toHaveLength(2);
  });
});
