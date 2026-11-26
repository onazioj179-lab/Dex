// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { alignPairwise, blosum62, formatAlignment } from '../../src/renderer/DEXAPPLICATIONS/bio/bioAlign';

describe('Bio pairwise alignment', () => {
  it('aligns identical sequences with no gaps', () => {
    const al = alignPairwise('ACGTACGT', 'ACGTACGT');
    expect(al.a).toBe('ACGTACGT');
    expect(al.identity).toBe(1);
    expect(al.gaps).toBe(0);
    expect(al.score).toBe(16);
    expect([al.aStart, al.aEnd, al.bStart, al.bEnd]).toEqual([1, 8, 1, 8]);
  });

  it('places one gap for a deletion (global)', () => {
    const al = alignPairwise('ACGTTTACGT', 'ACGTTACGT');
    expect(al.a.replace(/-/g, '')).toBe('ACGTTTACGT');
    expect(al.b.replace(/-/g, '')).toBe('ACGTTACGT');
    expect(al.gaps).toBe(1);
    expect(al.length).toBe(10);
    expect(al.markup.split('|').length - 1).toBe(9);
  });

  it('keeps a long gap in one piece (affine)', () => {
    const al = alignPairwise('AAAAGGGGGGCCCC', 'AAAACCCC');
    expect(al.b).toBe('AAAA------CCCC');
  });

  it('handles gaps at the ends in global mode', () => {
    const al = alignPairwise('GGGACGT', 'ACGT');
    expect(al.a).toBe('GGGACGT');
    expect(al.b).toBe('---ACGT');
  });

  it('finds the shared region locally', () => {
    const al = alignPairwise('TTTTTTGATTACAGGGGG', 'CCGATTACACC', { mode: 'local' });
    expect(al.a).toBe('GATTACA');
    expect(al.b).toBe('GATTACA');
    expect([al.aStart, al.aEnd, al.bStart, al.bEnd]).toEqual([7, 13, 3, 9]);
  });

  it('scores proteins with BLOSUM62 and marks similar residues', () => {
    expect(blosum62('W', 'W')).toBe(11);
    expect(blosum62('I', 'V')).toBe(3);
    expect(alignPairwise('HEAGAWGHEE', 'HEAGAWGHEE', { type: 'protein' }).identity).toBe(1);
    expect(alignPairwise('MKVLI', 'MKILV', { type: 'protein' }).markup).toBe('||:|:');
  });

  it('refuses inputs too large for the matrix, and formats blocks', () => {
    expect(() => alignPairwise('A'.repeat(6000), 'A'.repeat(6000))).toThrow(/Too long/);
    const t = formatAlignment(alignPairwise('ACGT', 'ACGT'), 'seqA', 'seqB').split('\n');
    expect(t[0]).toBe('seqA      1 ACGT 4');
    expect(t[1].trim()).toBe('||||');
  });
});
