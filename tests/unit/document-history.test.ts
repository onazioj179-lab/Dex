/** DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved. */
import { describe, expect, it } from 'vitest';
import { documentHistoryReducer as reduce } from '../../src/renderer/hooks/useDocumentHistory';

describe('document history', () => {
  it('undoes an entire pointer drag as one edit', () => {
    let s = reduce({ past: [] as number[], present: 0, future: [] as number[] }, { type: 'begin' });
    for (let i = 1; i <= 20; i++) s = reduce(s, { type: 'edit', value: i });
    s = reduce(s, { type: 'end' });
    expect(s.past).toEqual([0]);
    expect(reduce(s, { type: 'undo' }).present).toBe(0);
  });
  it('restores edits and clears the redo branch after a new edit', () => {
    let s = { past: [] as string[], present: 'original', future: [] as string[] };
    s = reduce(s, { type: 'edit', value: 'edited' });
    s = reduce(s, { type: 'undo' });
    expect(s.present).toBe('original');
    s = reduce(s, { type: 'redo' });
    expect(s.present).toBe('edited');
    s = reduce(s, { type: 'undo' });
    s = reduce(s, { type: 'edit', value: prev => prev + ' branch' });
    expect(s.future).toEqual([]);
    expect(s.present).toBe('original branch');
  });

  it('bounds retained document snapshots and ignores no-op updates', () => {
    let s = { past: [] as number[], present: 0, future: [] as number[] };
    expect(reduce(s, { type: 'undo' })).toBe(s);
    expect(reduce(s, { type: 'edit', value: 0 })).toBe(s);
    for (let i = 1; i <= 100; i++) s = reduce(s, { type: 'edit', value: i });
    expect(s.past).toHaveLength(40);
    for (let i = 0; i < 50; i++) s = reduce(s, { type: 'undo' });
    expect(s.present).toBe(60);
  });
});
