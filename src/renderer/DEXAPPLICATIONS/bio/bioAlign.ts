// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Pairwise sequence alignment for Bio Studio.
 *
 * Gotoh's algorithm with affine gaps (a gap costs `gapOpen` once plus
 * `gapExtend` per further position, so one long indel is preferred over many
 * scattered ones). Global = Needleman-Wunsch (end to end), local =
 * Smith-Waterman (the best-matching region). Nucleotides score match /
 * mismatch (N never matches); proteins use BLOSUM62. Memory is one traceback
 * byte per cell, capped at ALIGN_MAX_CELLS (about 25 MB).
 */

export const ALIGN_MAX_CELLS = 25_000_000;

const BLOSUM62_ORDER = 'ARNDCQEGHILKMFPSTWYVBZX*';
const BLOSUM62_ROWS = [
  '4 -1 -2 -2 0 -1 -1 0 -2 -1 -1 -1 -1 -2 -1 1 0 -3 -2 0 -2 -1 0 -4',
  '-1 5 0 -2 -3 1 0 -2 0 -3 -2 2 -1 -3 -2 -1 -1 -3 -2 -3 -1 0 -1 -4',
  '-2 0 6 1 -3 0 0 0 1 -3 -3 0 -2 -3 -2 1 0 -4 -2 -3 3 0 -1 -4',
  '-2 -2 1 6 -3 0 2 -1 -1 -3 -4 -1 -3 -3 -1 0 -1 -4 -3 -3 4 1 -1 -4',
  '0 -3 -3 -3 9 -3 -4 -3 -3 -1 -1 -3 -1 -2 -3 -1 -1 -2 -2 -1 -3 -3 -2 -4',
  '-1 1 0 0 -3 5 2 -2 0 -3 -2 1 0 -3 -1 0 -1 -2 -1 -2 0 3 -1 -4',
  '-1 0 0 2 -4 2 5 -2 0 -3 -3 1 -2 -3 -1 0 -1 -3 -2 -2 1 4 -1 -4',
  '0 -2 0 -1 -3 -2 -2 6 -2 -4 -4 -2 -3 -3 -2 0 -2 -2 -3 -3 -1 -2 -1 -4',
  '-2 0 1 -1 -3 0 0 -2 8 -3 -3 -1 -2 -1 -2 -1 -2 -2 2 -3 0 0 -1 -4',
  '-1 -3 -3 -3 -1 -3 -3 -4 -3 4 2 -3 1 0 -3 -2 -1 -3 -1 3 -3 -3 -1 -4',
  '-1 -2 -3 -4 -1 -2 -3 -4 -3 2 4 -2 2 0 -3 -2 -1 -2 -1 1 -4 -3 -1 -4',
  '-1 2 0 -1 -3 1 1 -2 -1 -3 -2 5 -1 -3 -1 0 -1 -3 -2 -2 0 1 -1 -4',
  '-1 -1 -2 -3 -1 0 -2 -3 -2 1 2 -1 5 0 -2 -1 -1 -1 -1 1 -3 -1 -1 -4',
  '-2 -3 -3 -3 -2 -3 -3 -3 -1 0 0 -3 0 6 -4 -2 -2 1 3 -1 -3 -3 -1 -4',
  '-1 -2 -2 -1 -3 -1 -1 -2 -2 -3 -3 -1 -2 -4 7 -1 -1 -4 -3 -2 -2 -1 -2 -4',
  '1 -1 1 0 -1 0 0 0 -1 -2 -2 0 -1 -2 -1 4 1 -3 -2 -2 0 0 0 -4',
  '0 -1 0 -1 -1 -1 -1 -2 -2 -1 -1 -1 -1 -2 -1 1 5 -2 -2 0 -1 -1 0 -4',
  '-3 -3 -4 -4 -2 -2 -3 -2 -2 -3 -2 -3 -1 1 -4 -3 -2 11 2 -3 -4 -3 -2 -4',
  '-2 -2 -2 -3 -2 -1 -2 -3 2 -1 -1 -2 -1 3 -3 -2 -2 2 7 -1 -3 -2 -1 -4',
  '0 -3 -3 -3 -1 -2 -2 -3 -3 3 1 -2 1 -1 -2 -2 0 -3 -1 4 -3 -2 -1 -4',
  '-2 -1 3 4 -3 0 1 -1 0 -3 -4 0 -3 -3 -2 0 -1 -4 -3 -3 4 1 -1 -4',
  '-1 0 0 1 -3 3 4 -2 0 -3 -3 1 -1 -3 -1 0 -1 -3 -2 -2 1 4 -1 -4',
  '0 -1 -1 -1 -2 -1 -1 -1 -1 -1 -1 -1 -1 -1 -2 0 0 -2 -1 -1 -1 -1 -1 -4',
  '-4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 1',
].map((r) => r.split(' ').map(Number));

export function blosum62(a: string, b: string): number {
  const i = BLOSUM62_ORDER.indexOf(a.toUpperCase());
  const j = BLOSUM62_ORDER.indexOf(b.toUpperCase());
  return BLOSUM62_ROWS[i < 0 ? 22 : i][j < 0 ? 22 : j];
}

export interface AlignOptions {
  mode?: 'global' | 'local';
  type?: 'dna' | 'protein';
  match?: number;
  mismatch?: number;
  /** Cost of opening a gap (positive; subtracted from the score). */
  gapOpen?: number;
  /** Cost of each further gap position. */
  gapExtend?: number;
}

export interface Alignment {
  /** Aligned A and B with '-' for gaps. */
  a: string;
  b: string;
  /** '|' identical, ':' similar (protein, BLOSUM62 > 0), ' ' otherwise. */
  markup: string;
  score: number;
  identity: number;
  similarity: number;
  gaps: number;
  length: number;
  /** 1-based, inclusive positions of the aligned region in A and B. */
  aStart: number; aEnd: number; bStart: number; bEnd: number;
}

/** Gotoh pairwise alignment. Throws when the matrix would exceed ALIGN_MAX_CELLS. */
export function alignPairwise(aIn: string, bIn: string, opts: AlignOptions = {}): Alignment {
  const a = aIn.toUpperCase(), b = bIn.toUpperCase();
  const type = opts.type ?? 'dna';
  const local = opts.mode === 'local';
  const match = opts.match ?? 2, mismatch = opts.mismatch ?? -3;
  const go = opts.gapOpen ?? (type === 'protein' ? 11 : 5);
  const ge = opts.gapExtend ?? (type === 'protein' ? 1 : 2);
  const n = a.length, m = b.length;
  if (!n || !m) throw new Error('Both sequences need residues.');
  if ((n + 1) * (m + 1) > ALIGN_MAX_CELLS) {
    throw new Error(`Too long to align here (${n} x ${m}); align regions under about 5,000 residues each.`);
  }
  const sub = (x: string, y: string) => (type === 'protein' ? blosum62(x, y) : x === y && x !== 'N' ? match : mismatch);
  const NEG = -1e12;
  const W = m + 1;
  // Rolling rows: H = best ending here, E = ending in a gap in A (horizontal), F = gap in B (vertical).
  let Hp = new Float64Array(W), Ep = new Float64Array(W), Fp = new Float64Array(W);
  let Hc = new Float64Array(W), Ec = new Float64Array(W), Fc = new Float64Array(W);
  // Traceback byte: bits 0-1 = where H came from (0 start, 1 diagonal, 2 E, 3 F);
  // bit 2 = E extended an earlier gap; bit 3 = F extended an earlier gap.
  const tb = new Uint8Array((n + 1) * W);
  for (let j = 0; j <= m; j++) {
    Hp[j] = local || j === 0 ? 0 : -(go + ge * (j - 1));
    Ep[j] = local || j === 0 ? NEG : Hp[j];
    Fp[j] = NEG;
    if (j > 0 && !local) tb[j] = 2 | (j > 1 ? 4 : 0);
  }
  let best = local ? 0 : NEG, bi = n, bj = m;
  for (let i = 1; i <= n; i++) {
    Hc[0] = local ? 0 : -(go + ge * (i - 1));
    Ec[0] = NEG;
    Fc[0] = local ? NEG : Hc[0];
    if (!local) tb[i * W] = 3 | (i > 1 ? 8 : 0);
    const ai = a[i - 1];
    for (let j = 1; j <= m; j++) {
      const eOpen = Hc[j - 1] - go, eExt = Ec[j - 1] - ge;
      const fOpen = Hp[j] - go, fExt = Fp[j] - ge;
      const e = eExt > eOpen ? eExt : eOpen;
      const f = fExt > fOpen ? fExt : fOpen;
      Ec[j] = e; Fc[j] = f;
      let h = Hp[j - 1] + sub(ai, b[j - 1]), src = 1;
      if (e > h) { h = e; src = 2; }
      if (f > h) { h = f; src = 3; }
      if (local && h <= 0) { h = 0; src = 0; }
      Hc[j] = h;
      tb[i * W + j] = src | (eExt > eOpen ? 4 : 0) | (fExt > fOpen ? 8 : 0);
      if (local && h > best) { best = h; bi = i; bj = j; }
    }
    [Hp, Hc] = [Hc, Hp];
    [Ep, Ec] = [Ec, Ep];
    [Fp, Fc] = [Fc, Fp];
  }
  if (!local) best = Hp[m];

  // Traceback from the end (global) or the best cell (local).
  let i = bi, j = bj;
  let state: 'H' | 'E' | 'F' = 'H';
  const ra: string[] = [], rb: string[] = [];
  while (i > 0 || j > 0) {
    const t = tb[i * W + j];
    if (state === 'H') {
      const src = t & 3;
      if (src === 0) break;
      if (src === 1) { ra.push(a[i - 1]); rb.push(b[j - 1]); i--; j--; continue; }
      state = src === 2 ? 'E' : 'F';
      continue;
    }
    if (state === 'E') {
      ra.push('-'); rb.push(b[j - 1]);
      const ext = (t & 4) !== 0;
      j--;
      if (!ext) state = 'H';
      continue;
    }
    ra.push(a[i - 1]); rb.push('-');
    const ext = (t & 8) !== 0;
    i--;
    if (!ext) state = 'H';
  }
  const A = ra.reverse().join(''), B = rb.reverse().join('');
  let ident = 0, simil = 0, gaps = 0;
  const mk: string[] = [];
  for (let k = 0; k < A.length; k++) {
    const x = A[k], y = B[k];
    if (x === '-' || y === '-') { gaps++; mk.push(' '); continue; }
    if (x === y) { ident++; simil++; mk.push('|'); continue; }
    if (type === 'protein' && blosum62(x, y) > 0) { simil++; mk.push(':'); continue; }
    mk.push(' ');
  }
  const len = A.length || 1;
  const aUsed = A.length - (A.match(/-/g)?.length ?? 0);
  const bUsed = B.length - (B.match(/-/g)?.length ?? 0);
  return {
    a: A, b: B, markup: mk.join(''), score: best, identity: ident / len, similarity: simil / len, gaps, length: A.length,
    aStart: i + 1, aEnd: i + aUsed, bStart: j + 1, bEnd: j + bUsed,
  };
}

/** Text blocks (EMBOSS style) for display and export. */
export function formatAlignment(al: Alignment, nameA: string, nameB: string, width = 60): string {
  const pad = Math.max(nameA.length, nameB.length, 4);
  const out: string[] = [];
  let pa = al.aStart, pb = al.bStart;
  for (let k = 0; k < al.length; k += width) {
    const sa = al.a.slice(k, k + width), sb = al.b.slice(k, k + width), mk = al.markup.slice(k, k + width);
    const na = sa.length - (sa.match(/-/g)?.length ?? 0), nb = sb.length - (sb.match(/-/g)?.length ?? 0);
    out.push(`${nameA.padEnd(pad)} ${String(pa).padStart(6)} ${sa} ${pa + na - 1}`);
    out.push(`${' '.repeat(pad)} ${' '.repeat(6)} ${mk}`);
    out.push(`${nameB.padEnd(pad)} ${String(pb).padStart(6)} ${sb} ${pb + nb - 1}`);
    out.push('');
    pa += na; pb += nb;
  }
  return out.join('\n');
}
