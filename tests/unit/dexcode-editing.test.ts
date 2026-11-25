// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  indent, openBracket, quote, backspace, newline, toggleComment, moveLines, duplicateLines, editForKey, commentPrefix,
} from '../../src/renderer/DEXAPPLICATIONS/standalone/dexCode/editing';

/** Apply an edit given text with `|` marking the caret, or `[` `]` marking a selection. */
function sel(marked: string): { text: string; start: number; end: number } {
  if (marked.includes('|')) {
    const i = marked.indexOf('|');
    return { text: marked.replace('|', ''), start: i, end: i };
  }
  const s = marked.indexOf('[');
  const e = marked.indexOf(']') - 1;
  return { text: marked.replace('[', '').replace(']', ''), start: s, end: e };
}
function show(r: { text: string; start: number; end: number } | null): string | null {
  if (!r) return null;
  if (r.start === r.end) return r.text.slice(0, r.start) + '|' + r.text.slice(r.start);
  return r.text.slice(0, r.start) + '[' + r.text.slice(r.start, r.end) + ']' + r.text.slice(r.end);
}

describe('DEX Code editing', () => {
  it('Tab with a multi-line selection indents the lines instead of deleting them', () => {
    const { text, start, end } = sel('[a\nb]\nc');
    expect(show(indent(text, start, end, false))).toBe('  [a\n  b]\nc');
  });

  it('Tab without a selection inserts an indent; Shift+Tab outdents', () => {
    const a = sel('x|y');
    expect(show(indent(a.text, a.start, a.end, false))).toBe('x  |y');
    const b = sel('    fo|o');
    expect(show(indent(b.text, b.start, b.end, true))).toBe('  fo|o');
    const c = sel('[  a\n  b]');
    expect(show(indent(c.text, c.start, c.end, true))).toBe('[a\nb]');
  });

  it('brackets and quotes wrap a selection instead of replacing it', () => {
    const a = sel('call [x + y] now');
    expect(show(openBracket(a.text, a.start, a.end, '('))).toBe('call ([x + y]) now');
    const b = sel('say [hi]');
    expect(show(quote(b.text, b.start, b.end, '"'))).toBe('say "[hi]"');
  });

  it('does not double a quote inside a word', () => {
    const a = sel("don|t");
    expect(quote(a.text, a.start, a.end, "'")).toBeNull();
    const b = sel('x = |');
    expect(show(quote(b.text, b.start, b.end, "'"))).toBe("x = '|'");
    const c = sel("'ab|'");
    expect(show(quote(c.text, c.start, c.end, "'"))).toBe("'ab'|");
  });

  it('does not auto-close a bracket typed before a word', () => {
    const a = sel('|foo');
    expect(openBracket(a.text, a.start, a.end, '(')).toBeNull();
  });

  it('Backspace removes an empty pair and one indent level', () => {
    const a = sel('f(|)');
    expect(show(backspace(a.text, a.start, a.end))).toBe('f|');
    const b = sel('x\n    |y');
    expect(show(backspace(b.text, b.start, b.end))).toBe('x\n  |y');
    const c = sel('ab|');
    expect(backspace(c.text, c.start, c.end)).toBeNull();
  });

  it('Enter keeps indent and opens a block between braces', () => {
    const a = sel('  if (x) {|}');
    expect(show(newline(a.text, a.start, a.end))).toBe('  if (x) {\n    |\n  }');
    const b = sel('  a = 1|');
    expect(show(newline(b.text, b.start, b.end))).toBe('  a = 1\n  |');
    const c = sel('def f():|');
    expect(show(newline(c.text, c.start, c.end, 'main.py'))).toBe('def f():\n  |');
  });

  it('Ctrl+/ comments and uncomments lines with the file\'s prefix', () => {
    const a = sel('  [a\n  b]');
    const on = toggleComment(a.text, a.start, a.end, 'x.js');
    expect(on.text).toBe('  // a\n  // b');
    expect(toggleComment(on.text, on.start, on.end, 'x.js').text).toBe('  a\n  b');
    expect(toggleComment('pr|int'.replace('|', ''), 2, 2, 'a.py').text).toBe('# print');
    expect(commentPrefix('q.sql')).toBe('--');
  });

  it('Alt+Up/Down move lines and Shift+Alt+Down duplicates', () => {
    const a = sel('one\ntw|o\nthree');
    expect(show(moveLines(a.text, a.start, a.end, -1))).toBe('tw|o\none\nthree');
    expect(show(moveLines(a.text, a.start, a.end, 1))).toBe('one\nthree\ntw|o');
    expect(moveLines('only', 1, 1, -1)).toBeNull();
    expect(show(duplicateLines(a.text, a.start, a.end))).toBe('one\ntwo\ntw|o\nthree');
  });

  it('routes keys and leaves ordinary typing to the browser', () => {
    const k = (key: string, mods: Partial<{ ctrl: boolean; shift: boolean; alt: boolean }> = {}) =>
      ({ key, ctrl: false, shift: false, alt: false, ...mods });
    expect(editForKey(k('a'), 'x', 1, 1, 'f.dex')).toBeNull();
    expect(editForKey(k('s', { ctrl: true }), 'x', 1, 1, 'f.dex')).toBeNull();
    expect(editForKey(k('/', { ctrl: true }), 'x', 1, 1, 'f.dex')?.text).toBe('// x');
    expect(editForKey(k('Enter', { shift: true }), 'x', 1, 1, 'f.dex')).toBeNull();
  });
});
