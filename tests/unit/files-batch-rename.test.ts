// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { planBatchRename, applyBatchRename, invalidName } from '../../src/renderer/pages/filesBatchRename';

const f = (name: string, isDirectory = false) => ({ name, isDirectory });

describe('batch rename planning', () => {
  it('numbers with padding and keeps extensions', () => {
    const p = planBatchRename([f('IMG_1.jpg'), f('IMG_2.JPG'), f('notes.txt')], { base: 'Trip', numbering: { start: 1, pad: 2, sep: ' ' } }, []);
    expect(p.map((s) => s.to)).toEqual(['Trip 01.jpg', 'Trip 02.JPG', 'Trip 03.txt']);
    expect(p.every((s) => !s.conflict)).toBe(true);
  });

  it('find/replace is literal (not a regex) and case-insensitive unless asked', () => {
    const p = planBatchRename([f('a.b (draft).md'), f('A.B (DRAFT).md')], { find: '(draft)', replace: 'final' }, []);
    expect(p.map((s) => s.to)).toEqual(['a.b final.md', 'A.B final.md']);
    const q = planBatchRename([f('Draft draft.md')], { find: 'draft', replace: 'x', matchCase: true }, []);
    expect(q[0].to).toBe('Draft x.md');
  });

  it('flags duplicates, existing names (case-insensitive) and invalid Windows names', () => {
    const p = planBatchRename([f('a.txt'), f('b.txt'), f('c.txt')], { base: 'same' }, ['a.txt', 'b.txt', 'c.txt', 'other.txt']);
    expect(p.every((s) => s.conflict === 'two items would get this name')).toBe(true);
    const q = planBatchRename([f('a.txt')], { base: 'OTHER' }, ['a.txt', 'other.txt']);
    expect(q[0].conflict).toMatch(/already exists/);
    expect(planBatchRename([f('a.txt')], { base: 'con' }, [])[0].conflict).toMatch(/reserved/);
    expect(invalidName('x?.txt')).toMatch(/contains/);
    expect(invalidName('trailing.')).toMatch(/dot or space/);
  });

  it('a name freed by another rename in the same batch is not a conflict (swap)', () => {
    const p = planBatchRename([f('a.txt'), f('b.txt')], { find: 'a', replace: 'b' }, ['a.txt', 'b.txt']);
    // a->b is fine because b is renamed away? b stays "b.txt" (unchanged) here, so a->b conflicts.
    expect(p[0].conflict).not.toBeNull();
    const swap = planBatchRename([f('x1.txt'), f('x2.txt')], { base: 'x', numbering: { start: 2, pad: 1, sep: '' } }, ['x1.txt', 'x2.txt']);
    expect(swap.map((s) => s.to)).toEqual(['x2.txt', 'x3.txt']);
    expect(swap.every((s) => !s.conflict)).toBe(true);
  });

  it('folders keep their dots; title case works on words', () => {
    expect(planBatchRename([f('my.project files', true)], { caseMode: 'title' }, [])[0].to).toBe('My.project Files');
  });
});

describe('batch rename apply', () => {
  it('two-phase renames make shifts work, and conflicts are skipped', async () => {
    const fs = new Set(['C:\\d\\x1.txt', 'C:\\d\\x2.txt', 'C:\\d\\keep.txt']);
    const rename = async (path: string, to: string) => {
      const dest = path.replace(/[^\\]+$/, to);
      if (!fs.has(path)) throw new Error(`missing ${path}`);
      if (fs.has(dest)) throw new Error(`exists ${dest}`);
      fs.delete(path); fs.add(dest);
    };
    const steps = planBatchRename([f('x1.txt'), f('x2.txt')], { base: 'x', numbering: { start: 2, pad: 1, sep: '' } }, ['x1.txt', 'x2.txt', 'keep.txt']);
    const out = await applyBatchRename('C:\\d', steps, rename);
    expect(out).toMatchObject({ renamed: 2, failed: null });
    expect([...fs].sort()).toEqual(['C:\\d\\keep.txt', 'C:\\d\\x2.txt', 'C:\\d\\x3.txt']);
  });

  it('a failure part-way puts every item back', async () => {
    const fs = new Set(['C:\\d\\a.txt', 'C:\\d\\b.txt']);
    let calls = 0;
    const rename = async (path: string, to: string) => {
      calls++;
      if (calls === 4) throw new Error('disk full'); // second final rename
      const dest = path.replace(/[^\\]+$/, to);
      fs.delete(path); fs.add(dest);
    };
    const steps = planBatchRename([f('a.txt'), f('b.txt')], { prefix: 'new-' }, ['a.txt', 'b.txt']);
    const out = await applyBatchRename('C:\\d', steps, rename);
    expect(out).toMatchObject({ renamed: 0, failed: 'disk full', reverted: true });
    expect([...fs].sort()).toEqual(['C:\\d\\a.txt', 'C:\\d\\b.txt']);
  });
});
