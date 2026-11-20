// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { createTextHistory, firstDiff, isUndoKey } from '../../src/renderer/hooks/useTextHistory';

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) =>
  ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

describe('text history (editor undo/redo)', () => {
  it('groups quick typing into one step and undoes app rewrites', () => {
    const h = createTextHistory('a');
    h.record('ab', 0); h.record('abc', 100);          // one typing run
    h.record('abc\n  ', 5000);                        // auto-indent (app rewrite)
    expect(h.undo()).toBe('abc');
    expect(h.undo()).toBe('a');
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBe('abc');
    expect(h.redo()).toBe('abc\n  ');
    expect(h.redo()).toBeNull();
  });

  it('a new edit after undo drops the redo branch', () => {
    const h = createTextHistory('');
    h.record('x', 0); h.record('xy', 2000);
    h.undo();
    h.record('xz', 4000);
    expect(h.canRedo()).toBe(false);
    expect(h.undo()).toBe('x');
  });

  it('keys and caret placement', () => {
    expect(isUndoKey(key('z', { ctrlKey: true }))).toBe('undo');
    expect(isUndoKey(key('Z', { ctrlKey: true, shiftKey: true }))).toBe('redo');
    expect(isUndoKey(key('y', { metaKey: true }))).toBe('redo');
    expect(isUndoKey(key('z'))).toBeNull();
    expect(isUndoKey(key('z', { ctrlKey: true, altKey: true }))).toBeNull();
    expect(firstDiff('hello world', 'hello there')).toBe(6);
  });
});
