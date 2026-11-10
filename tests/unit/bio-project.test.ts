// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  emptyProject, historyInit, historyReducer, normalizeProject, loadProject, saveProject, toCsv, BIO_PROJECT_KEY,
} from '../../src/renderer/DEXAPPLICATIONS/bio/bioProject';

const seq = (name: string, s: string) => ({ name, seq: s, kind: 'dna' as const, source: 'entered' as const, notes: '' });

describe('bio project — history', () => {
  it('add / update / remove are undoable; select is not', () => {
    let h = historyInit(emptyProject());
    h = historyReducer(h, { type: 'add', sequences: [seq('a', 'ACGT'), seq('b', 'GGGG')] });
    const [a, b] = h.present.sequences;
    expect(h.present.activeId).toBe(a.id);
    h = historyReducer(h, { type: 'select', id: b.id });
    expect(h.past).toHaveLength(1);
    h = historyReducer(h, { type: 'update', id: b.id, patch: { seq: 'TTTT' } });
    expect(h.present.sequences[1].seq).toBe('TTTT');
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.sequences[1].seq).toBe('GGGG');
    h = historyReducer(h, { type: 'redo' });
    expect(h.present.sequences[1].seq).toBe('TTTT');
    h = historyReducer(h, { type: 'remove', id: b.id });
    expect(h.present.sequences).toHaveLength(1);
    expect(h.present.activeId).toBe(a.id);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.sequences).toHaveLength(2);
  });

  it('a new edit clears the redo stack', () => {
    let h = historyInit(emptyProject());
    h = historyReducer(h, { type: 'rename-project', name: 'One' });
    h = historyReducer(h, { type: 'undo' });
    expect(h.future).toHaveLength(1);
    h = historyReducer(h, { type: 'rename-project', name: 'Two' });
    expect(h.future).toHaveLength(0);
    expect(h.present.name).toBe('Two');
  });
});

describe('bio project — persistence', () => {
  it('round-trips through storage', () => {
    const store = new Map<string, string>();
    const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    let h = historyInit(emptyProject());
    h = historyReducer(h, { type: 'add', sequences: [seq('a', 'ACGT')] });
    expect(saveProject(h.present, s)).toBe(true);
    expect(store.has(BIO_PROJECT_KEY)).toBe(true);
    expect(loadProject(s)).toEqual(h.present);
  });

  it('topology is an undoable edit, survives a restore, and never applies to proteins', () => {
    let h = historyInit(emptyProject());
    h = historyReducer(h, { type: 'add', sequences: [seq('plasmid', 'ACGT')] });
    const id = h.present.sequences[0].id;
    h = historyReducer(h, { type: 'update', id, patch: { circular: true } });
    expect(h.present.sequences[0].circular).toBe(true);
    expect(normalizeProject(JSON.parse(JSON.stringify(h.present))).sequences[0].circular).toBe(true);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.sequences[0].circular).toBeUndefined();
    const p = normalizeProject({ version: 1, sequences: [{ seq: 'MKV', kind: 'protein', circular: true }, { seq: 'ACGT', circular: 'yes' }] });
    expect(p.sequences.map((s) => 'circular' in s)).toEqual([false, false]);
  });

  it('corrupt storage falls back to an empty project, restore rejects bad files with a reason', () => {
    expect(loadProject({ getItem: () => '{not json' })).toEqual(emptyProject());
    expect(() => normalizeProject({ version: 2, sequences: [] })).toThrow(/Unsupported project version/);
    expect(() => normalizeProject({ version: 1, sequences: [{ name: 'x' }] })).toThrow(/no residues/);
    const p = normalizeProject({ version: 1, sequences: [{ seq: 'acgt' }], activeId: 'missing' });
    expect(p.sequences[0].seq).toBe('ACGT');
    expect(p.activeId).toBe(p.sequences[0].id);
  });

  it('CSV escapes quotes, commas and newlines', () => {
    expect(toCsv([['a,b', 'say "hi"', 3]])).toBe('"a,b","say ""hi""",3\r\n');
  });
});
