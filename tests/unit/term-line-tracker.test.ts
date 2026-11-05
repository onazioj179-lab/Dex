// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { createLineTracker, trackInput, isDexCommandLine, discardLineSequence } from '../../src/shared/term/lineTracker';

const feed = (keys: string[]) => {
  const s = createLineTracker();
  let last: ReturnType<typeof trackInput> = { kind: 'forward' };
  for (const k of keys) last = trackInput(s, k);
  return last;
};

describe('terminal line tracker', () => {
  it('follows printable keys and Backspace', () => {
    expect(feed(['d', 'e', 'x', 'x', '\x7f', ' ', 'l', 's', '\r'])).toEqual({ kind: 'enter', line: 'dex ls' });
  });

  it('accepts a pasted single line', () => {
    expect(feed(['dex open notes', '\r'])).toEqual({ kind: 'enter', line: 'dex open notes' });
  });

  it('gives up after cursor keys, Tab or history recall', () => {
    expect(feed(['d', '\x1b[D', 'x', '\r'])).toEqual({ kind: 'enter', line: null });
    expect(feed(['de', '\t', '\r'])).toEqual({ kind: 'enter', line: null });
    expect(feed(['\x1b[A', '\r'])).toEqual({ kind: 'enter', line: null });
  });

  it('ignores replies the terminal sends itself (cursor report, focus, DA, OSC)', () => {
    // First command after ConPTY starts: xterm answers ESC[6n before the user types.
    expect(feed(['\x1b[1;1R', 'dex list', '\r'])).toEqual({ kind: 'enter', line: 'dex list' });
    expect(feed(['de', '\x1b[O', '\x1b[I', 'x', '\r'])).toEqual({ kind: 'enter', line: 'dex' });
    expect(feed(['\x1b[?1;2c', '\x1b]11;rgb:0e0e/0f0f/1111\x07', 'dex', '\r'])).toEqual({ kind: 'enter', line: 'dex' });
    // A real cursor key still makes the line unknown.
    expect(feed(['dex', '\x1b[D', '\r'])).toEqual({ kind: 'enter', line: null });
  });

  it('a multi-line paste is never treated as a known line', () => {
    expect(feed(['echo a\recho b', '\r'])).toEqual({ kind: 'enter', line: null });
  });

  it('Ctrl+C and Enter reset reliability', () => {
    expect(feed(['\x1b[A', '\x03', 'dex', '\r'])).toEqual({ kind: 'enter', line: 'dex' });
    expect(feed(['\t', '\r', 'dex', '\r'])).toEqual({ kind: 'enter', line: 'dex' });
  });

  it('Backspace handles surrogate pairs', () => {
    expect(feed(['a😀', '\x7f', '\r'])).toEqual({ kind: 'enter', line: 'a' });
  });

  it('recognizes dex command lines only', () => {
    expect(isDexCommandLine('dex')).toBe(true);
    expect(isDexCommandLine('  DEX list')).toBe(true);
    expect(isDexCommandLine('dexter')).toBe(false);
    expect(isDexCommandLine('git dex')).toBe(false);
    expect(isDexCommandLine(null)).toBe(false);
  });

  it('uses Escape on Windows and Ctrl+U elsewhere to discard the line', () => {
    expect(discardLineSequence(true)).toBe('\x1b');
    expect(discardLineSequence(false)).toBe('\x15');
  });
});
