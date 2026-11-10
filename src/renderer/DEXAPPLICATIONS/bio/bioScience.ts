// =============================================================================
// DEX Bio Engineering Studio — sequence and bench science (pure, offline)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
//
// Every function here is deterministic and unit-tested against hand-checked or
// published values (tests/unit/bio-science.test.ts). Formulas and their sources
// are named next to each function. Nothing here is a clinical tool.
// =============================================================================

// ---------------------------------------------------------------------------
// Genetic code
// ---------------------------------------------------------------------------

// Standard genetic code (NCBI transl_table=1): amino acids enumerated with the
// bases in U,C,A,G order, first base slowest (AUG -> index 35 -> 'M').
const RNA_BASES = ['U', 'C', 'A', 'G'] as const;
const AA_STRING = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
export const CODON_TABLE: Readonly<Record<string, string>> = (() => {
  const t: Record<string, string> = {};
  let k = 0;
  for (const b1 of RNA_BASES) for (const b2 of RNA_BASES) for (const b3 of RNA_BASES) t[b1 + b2 + b3] = AA_STRING[k++];
  return t;
})();

const COMPLEMENT: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C', N: 'N' };

// ---------------------------------------------------------------------------
// Parsing + validation
// ---------------------------------------------------------------------------

export type SequenceKind = 'dna' | 'rna' | 'protein';

export interface SequenceIssue {
  /** 1-based position in the cleaned sequence where the character would have been. */
  position: number;
  char: string;
}

export interface ParsedSequence {
  /** Uppercased residues with whitespace / digits / line numbers removed. */
  seq: string;
  kind: SequenceKind;
  /** Characters that are not valid for `kind`. They are kept out of `seq`. */
  invalid: SequenceIssue[];
  /** IUPAC ambiguity codes (N, R, Y…) found in a nucleotide sequence; kept as N. */
  ambiguous: number;
}

const IUPAC_AMBIGUOUS = new Set(['N', 'R', 'Y', 'S', 'W', 'K', 'M', 'B', 'D', 'H', 'V']);
const PROTEIN_LETTERS = new Set('ACDEFGHIKLMNPQRSTVWY*'.split(''));

/** Guess the alphabet: mostly ACGT(U/N) = nucleotide, otherwise protein. */
export function detectKind(raw: string): SequenceKind {
  const letters = raw.toUpperCase().replace(/[^A-Z]/g, '');
  if (!letters.length) return 'dna';
  let nuc = 0;
  let u = 0;
  let t = 0;
  for (const c of letters) {
    if (c === 'A' || c === 'C' || c === 'G' || c === 'N') nuc++;
    else if (c === 'T') { nuc++; t++; }
    else if (c === 'U') { nuc++; u++; }
  }
  if (nuc / letters.length < 0.9) return 'protein';
  return u > t ? 'rna' : 'dna';
}

/**
 * Clean a pasted sequence. Whitespace, digits and the `-`/`.` gap characters
 * that come from GenBank / alignment formatting are removed silently; anything
 * else that is not valid for the alphabet is reported in `invalid`, never
 * silently accepted. RNA input is stored as DNA (U -> T) so every tool works on
 * one representation; `kind` records what was pasted.
 */
export function parseSequence(raw: string, kind: SequenceKind = detectKind(raw)): ParsedSequence {
  const invalid: SequenceIssue[] = [];
  let ambiguous = 0;
  let seq = '';
  for (const ch of raw.toUpperCase()) {
    if (/[\s\d\-.]/.test(ch)) continue;
    if (kind === 'protein') {
      if (PROTEIN_LETTERS.has(ch)) seq += ch;
      else invalid.push({ position: seq.length + 1, char: ch });
      continue;
    }
    if (ch === 'A' || ch === 'C' || ch === 'G' || ch === 'T') seq += ch;
    else if (ch === 'U') seq += 'T';
    else if (IUPAC_AMBIGUOUS.has(ch)) { seq += 'N'; ambiguous++; }
    else invalid.push({ position: seq.length + 1, char: ch });
  }
  return { seq, kind, invalid, ambiguous };
}

// ---------------------------------------------------------------------------
// FASTA
// ---------------------------------------------------------------------------

export interface FastaRecord { name: string; description: string; seq: string }

/** Parse FASTA text. Text with no `>` header is one unnamed record. */
export function parseFasta(text: string): FastaRecord[] {
  const out: FastaRecord[] = [];
  let cur: FastaRecord | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) continue;
    if (line.startsWith('>')) {
      const header = line.slice(1).trim();
      const sp = header.search(/\s/);
      cur = { name: sp < 0 ? header : header.slice(0, sp), description: sp < 0 ? '' : header.slice(sp + 1).trim(), seq: '' };
      out.push(cur);
      continue;
    }
    if (!cur) { cur = { name: 'sequence', description: '', seq: '' }; out.push(cur); }
    cur.seq += line;
  }
  return out;
}

/** Serialize records as FASTA wrapped at `width` residues per line. */
export function toFasta(records: FastaRecord[], width = 60): string {
  return records.map((r) => {
    const head = `>${r.name}${r.description ? ' ' + r.description : ''}`;
    const lines: string[] = [];
    for (let i = 0; i < r.seq.length; i += width) lines.push(r.seq.slice(i, i + width));
    return [head, ...lines].join('\n');
  }).join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Central dogma
// ---------------------------------------------------------------------------

/** DNA coding strand -> mRNA (T -> U). */
export function transcribe(dna: string): string {
  return dna.replace(/T/g, 'U');
}

export function reverseComplement(dna: string): string {
  let out = '';
  for (let i = dna.length - 1; i >= 0; i--) out += COMPLEMENT[dna[i]] ?? 'N';
  return out;
}

/**
 * Translate a DNA or RNA sequence from `frame` (0, 1, 2). Stop codons become
 * `*`; with `toStop` translation ends before the first stop. Codons that
 * contain an ambiguous base translate to `X`.
 */
export function translate(seq: string, frame = 0, toStop = false): string {
  const rna = seq.replace(/T/g, 'U');
  let protein = '';
  for (let i = frame; i + 3 <= rna.length; i += 3) {
    const aa = CODON_TABLE[rna.slice(i, i + 3)] ?? 'X';
    if (aa === '*' && toStop) break;
    protein += aa;
  }
  return protein;
}

export interface Orf {
  strand: '+' | '-';
  /** Reading frame 1..3 on its strand. */
  frame: 1 | 2 | 3;
  /** 1-based inclusive coordinates on the forward strand. */
  start: number;
  end: number;
  /** Nucleotides including the stop codon (or to the sequence end if open). */
  lengthNt: number;
  protein: string;
  /** False when the ORF runs off the end of the sequence without a stop codon. */
  hasStop: boolean;
}

/**
 * Open reading frames: ATG to the first in-frame stop, in all six frames.
 * Nested ATGs inside an ORF are not reported separately (longest ORF per stop).
 * `minAa` filters short ORFs (protein length without the stop).
 */
export function findOrfs(dna: string, minAa = 30): Orf[] {
  const orfs: Orf[] = [];
  const n = dna.length;
  const scan = (s: string, strand: '+' | '-') => {
    for (let f = 0; f < 3; f++) {
      let i = f;
      while (i + 3 <= n) {
        if (s.slice(i, i + 3) !== 'ATG') { i += 3; continue; }
        let j = i;
        let protein = '';
        let hasStop = false;
        while (j + 3 <= n) {
          const aa = CODON_TABLE[s.slice(j, j + 3).replace(/T/g, 'U')] ?? 'X';
          j += 3;
          if (aa === '*') { hasStop = true; break; }
          protein += aa;
        }
        if (protein.length >= minAa) {
          const lengthNt = j - i;
          const startF = strand === '+' ? i + 1 : n - j + 1;
          const endF = strand === '+' ? j : n - i;
          orfs.push({ strand, frame: (f + 1) as 1 | 2 | 3, start: startF, end: endF, lengthNt, protein, hasStop });
        }
        i = j; // continue after this ORF's stop
      }
    }
  };
  scan(dna, '+');
  scan(reverseComplement(dna), '-');
  return orfs.sort((a, b) => b.lengthNt - a.lengthNt || a.start - b.start);
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export function baseCounts(dna: string): { A: number; C: number; G: number; T: number; N: number } {
  const c = { A: 0, C: 0, G: 0, T: 0, N: 0 };
  for (const b of dna) if (b in c) (c as Record<string, number>)[b]++;
  return c;
}

/** GC content in percent of the unambiguous bases (N excluded). */
export function gcContent(dna: string): number {
  const { A, C, G, T } = baseCounts(dna);
  const total = A + C + G + T;
  return total ? ((G + C) / total) * 100 : 0;
}

/** GC% in a sliding window; each point is the window's centre (1-based). */
export function slidingGc(dna: string, window: number, step = Math.max(1, Math.floor(window / 4))): { pos: number; gc: number }[] {
  const w = Math.max(1, Math.floor(window));
  if (dna.length < w) return dna.length ? [{ pos: Math.ceil(dna.length / 2), gc: gcContent(dna) }] : [];
  const pts: { pos: number; gc: number }[] = [];
  for (let i = 0; i + w <= dna.length; i += Math.max(1, step)) {
    pts.push({ pos: i + Math.ceil(w / 2), gc: gcContent(dna.slice(i, i + w)) });
  }
  return pts;
}

// Average ssDNA nucleotide masses (g/mol) as used by OligoCalc (anhydrous).
const NT_MASS: Record<string, number> = { A: 313.21, T: 304.2, C: 289.18, G: 329.21 };

/**
 * Single-stranded DNA molecular weight (g/mol), OligoCalc anhydrous formula:
 * sum of nucleotide masses − 61.96 (5′-OH, no phosphate). NaN with ambiguous bases.
 */
export function ssDnaMolecularWeight(dna: string): number {
  if (!dna.length) return 0;
  let mw = 0;
  for (const b of dna) {
    const m = NT_MASS[b];
    if (m === undefined) return NaN;
    mw += m;
  }
  return mw - 61.96;
}

/** Double-stranded DNA MW: both strands. */
export function dsDnaMolecularWeight(dna: string): number {
  return ssDnaMolecularWeight(dna) + ssDnaMolecularWeight(reverseComplement(dna));
}

export type TmMethod = 'wallace' | 'basic';

/**
 * Oligo melting temperature (°C), the two OligoCalc formulas:
 * - Wallace rule (< 14 nt): Tm = 2(A+T) + 4(G+C)
 * - Basic (≥ 14 nt, 50 mM Na⁺): Tm = 64.9 + 41(G+C − 16.4)/N
 * These are quick estimates; `nearestNeighborTm` is the thermodynamic model.
 */
export function meltingTemp(dna: string): { tm: number; method: TmMethod } {
  const { A, T, G, C } = baseCounts(dna);
  const n = A + T + G + C;
  if (!n) return { tm: 0, method: 'wallace' };
  if (n < 14) return { tm: 2 * (A + T) + 4 * (G + C), method: 'wallace' };
  return { tm: 64.9 + (41 * (G + C - 16.4)) / n, method: 'basic' };
}

// Unified nearest-neighbour parameters, SantaLucia 1998 (PNAS 95:1460), Table 1:
// [ΔH° kcal/mol, ΔS° cal/(mol·K)] per dinucleotide step read 5′→3′ on one
// strand. A step and its reverse complement are the same duplex step.
const NN_STEP: Readonly<Record<string, readonly [number, number]>> = {
  AA: [-7.9, -22.2], TT: [-7.9, -22.2],
  AT: [-7.2, -20.4],
  TA: [-7.2, -21.3],
  CA: [-8.5, -22.7], TG: [-8.5, -22.7],
  GT: [-8.4, -22.4], AC: [-8.4, -22.4],
  CT: [-7.8, -21.0], AG: [-7.8, -21.0],
  GA: [-8.2, -22.2], TC: [-8.2, -22.2],
  CG: [-10.6, -27.2],
  GC: [-9.8, -24.4],
  GG: [-8.0, -19.9], CC: [-8.0, -19.9],
};
const NN_INIT_GC: readonly [number, number] = [0.1, -2.8];
const NN_INIT_AT: readonly [number, number] = [2.3, 4.1];
const NN_SYMMETRY_DS = -1.4;
const GAS_CONSTANT = 1.987; // cal/(mol·K)

export const NN_MIN_LENGTH = 6;
export const NN_MAX_LENGTH = 60;
/** Conditions used when none are given: 50 mM Na⁺, 0.5 µM total strand. */
export const NN_DEFAULTS = { sodiumM: 0.05, oligoM: 0.5e-6 } as const;

export interface NearestNeighborTm {
  /** °C */
  tm: number;
  /** kcal/mol */
  dH: number;
  /** cal/(mol·K), after the salt correction */
  dS: number;
  selfComplementary: boolean;
  sodiumM: number;
  oligoM: number;
}

/**
 * Oligo duplex melting temperature from the SantaLucia 1998 unified
 * nearest-neighbour model, for the oligo paired with its perfect complement:
 *   Tm = ΔH° / (ΔS° + R·ln(C/x)) − 273.15, x = 4 (x = 1 if self-complementary)
 * with the paper's salt correction ΔS°[Na⁺] = ΔS°[1 M] + 0.368·(N−1)·ln[Na⁺].
 * `oligoM` is the total strand concentration. Returns null outside
 * NN_MIN_LENGTH..NN_MAX_LENGTH nt (the two-state model does not hold for long
 * duplexes) or when the sequence has ambiguous bases. No Mg²⁺/dNTP correction.
 */
export function nearestNeighborTm(dna: string, opts: { sodiumM?: number; oligoM?: number } = {}): NearestNeighborTm | null {
  const n = dna.length;
  if (n < NN_MIN_LENGTH || n > NN_MAX_LENGTH || /[^ACGT]/.test(dna)) return null;
  const sodiumM = opts.sodiumM ?? NN_DEFAULTS.sodiumM;
  const oligoM = opts.oligoM ?? NN_DEFAULTS.oligoM;
  if (!(sodiumM > 0) || !(oligoM > 0)) return null;
  let dH = 0;
  let dS = 0;
  for (let i = 0; i + 1 < n; i++) {
    const step = NN_STEP[dna.slice(i, i + 2)];
    dH += step[0];
    dS += step[1];
  }
  for (const end of [dna[0], dna[n - 1]]) {
    const init = end === 'G' || end === 'C' ? NN_INIT_GC : NN_INIT_AT;
    dH += init[0];
    dS += init[1];
  }
  const selfComplementary = reverseComplement(dna) === dna;
  if (selfComplementary) dS += NN_SYMMETRY_DS;
  dS += 0.368 * (n - 1) * Math.log(sodiumM);
  const tm = (dH * 1000) / (dS + GAS_CONSTANT * Math.log(oligoM / (selfComplementary ? 1 : 4))) - 273.15;
  return { tm, dH, dS, selfComplementary, sodiumM, oligoM };
}

// ---------------------------------------------------------------------------
// Protein
// ---------------------------------------------------------------------------

// Average amino-acid residue masses (g/mol), ExPASy ProtParam.
const AA_MASS: Record<string, number> = {
  A: 71.0788, R: 156.1875, N: 114.1038, D: 115.0886, C: 103.1388, E: 129.1155, Q: 128.1307,
  G: 57.0519, H: 137.1411, I: 113.1594, L: 113.1594, K: 128.1741, M: 131.1926, F: 147.1766,
  P: 97.1167, S: 87.0782, T: 101.1051, W: 186.2132, Y: 163.176, V: 99.1326,
};
const WATER = 18.01524;

/** Average protein MW (g/mol): residue masses + one water. Stops (`*`) ignored; NaN for X. */
export function proteinMolecularWeight(protein: string): number {
  const p = protein.replace(/\*/g, '');
  if (!p.length) return 0;
  let mw = WATER;
  for (const aa of p) {
    const m = AA_MASS[aa];
    if (m === undefined) return NaN;
    mw += m;
  }
  return mw;
}

/**
 * Molar extinction coefficient at 280 nm in water (M⁻¹cm⁻¹), Pace et al. 1995
 * as used by ProtParam: 5500·W + 1490·Y + 125·cystines. Returns both the
 * all-cysteines-reduced and all-cystines-formed values.
 */
export function extinctionCoefficient(protein: string): { reduced: number; cystines: number } {
  let w = 0; let y = 0; let c = 0;
  for (const aa of protein) { if (aa === 'W') w++; else if (aa === 'Y') y++; else if (aa === 'C') c++; }
  const reduced = 5500 * w + 1490 * y;
  return { reduced, cystines: reduced + 125 * Math.floor(c / 2) };
}

// ---------------------------------------------------------------------------
// Restriction sites
// ---------------------------------------------------------------------------

export interface RestrictionEnzyme {
  name: string;
  site: string;
  /** Cut offset on the top strand, from the site's first base (G^AATTC = 1). */
  cut: number;
}

/** Common palindromic Type II enzymes (REBASE recognition sequences). */
export const ENZYMES: readonly RestrictionEnzyme[] = [
  { name: 'BamHI', site: 'GGATCC', cut: 1 },
  { name: 'BglII', site: 'AGATCT', cut: 1 },
  { name: 'EcoRI', site: 'GAATTC', cut: 1 },
  { name: 'EcoRV', site: 'GATATC', cut: 3 },
  { name: 'HindIII', site: 'AAGCTT', cut: 1 },
  { name: 'KpnI', site: 'GGTACC', cut: 5 },
  { name: 'NcoI', site: 'CCATGG', cut: 1 },
  { name: 'NdeI', site: 'CATATG', cut: 2 },
  { name: 'NheI', site: 'GCTAGC', cut: 1 },
  { name: 'NotI', site: 'GCGGCCGC', cut: 2 },
  { name: 'PstI', site: 'CTGCAG', cut: 5 },
  { name: 'SacI', site: 'GAGCTC', cut: 5 },
  { name: 'SalI', site: 'GTCGAC', cut: 1 },
  { name: 'SmaI', site: 'CCCGGG', cut: 3 },
  { name: 'SpeI', site: 'ACTAGT', cut: 1 },
  { name: 'XbaI', site: 'TCTAGA', cut: 1 },
  { name: 'XhoI', site: 'CTCGAG', cut: 1 },
];

export interface SiteHit {
  enzyme: string;
  site: string;
  /** 1-based position of the site's first base. */
  position: number;
  /** Top-strand cut: the enzyme cuts after this 1-based base. */
  cutAfter: number;
}

/**
 * Every site of every enzyme (all are palindromic, so one strand suffices).
 * With `circular`, sites that span the origin are found too; their `cutAfter`
 * wraps, so it is always within 1..length.
 */
export function findRestrictionSites(dna: string, enzymes: readonly RestrictionEnzyme[] = ENZYMES, circular = false): SiteHit[] {
  const hits: SiteHit[] = [];
  const n = dna.length;
  for (const e of enzymes) {
    // A circle shorter than the site cannot hold it once around.
    const hay = circular && n >= e.site.length ? dna + dna.slice(0, e.site.length - 1) : dna;
    let from = 0;
    for (;;) {
      const i = hay.indexOf(e.site, from);
      if (i < 0 || i >= n) break;
      const cut = i + e.cut;
      hits.push({ enzyme: e.name, site: e.site, position: i + 1, cutAfter: cut > n ? cut - n : cut });
      from = i + 1;
    }
  }
  return hits.sort((a, b) => a.position - b.position || a.enzyme.localeCompare(b.enzyme));
}

/** Linear-DNA fragment lengths after cutting at the given top-strand cut points. */
export function digestFragments(length: number, cutsAfter: number[]): number[] {
  const cuts = [...new Set(cutsAfter.filter((c) => c > 0 && c < length))].sort((a, b) => a - b);
  const out: number[] = [];
  let prev = 0;
  for (const c of cuts) { out.push(c - prev); prev = c; }
  if (length > 0) out.push(length - prev);
  return out;
}

/**
 * Circular-DNA fragment lengths. One cut linearises the circle (one fragment
 * of the full length); n cuts give n fragments, one of which runs through the
 * origin. No cut returns an empty list: the circle stays closed.
 */
export function digestFragmentsCircular(length: number, cutsAfter: number[]): number[] {
  if (!(length > 0)) return [];
  const cuts = [...new Set(cutsAfter.filter((c) => Number.isFinite(c)).map((c) => (((Math.round(c) % length) + length) % length) || length))].sort((a, b) => a - b);
  if (!cuts.length) return [];
  const out: number[] = [];
  for (let i = 1; i < cuts.length; i++) out.push(cuts[i] - cuts[i - 1]);
  out.push(length - cuts[cuts.length - 1] + cuts[0]); // through the origin
  return out;
}

// ---------------------------------------------------------------------------
// Bench calculations with units
// ---------------------------------------------------------------------------

export const CONC_UNITS = { M: 1, mM: 1e-3, 'µM': 1e-6, nM: 1e-9 } as const;
export const VOLUME_UNITS = { L: 1, mL: 1e-3, 'µL': 1e-6 } as const;
export const MASS_UNITS = { g: 1, mg: 1e-3, 'µg': 1e-6 } as const;
export type ConcUnit = keyof typeof CONC_UNITS;
export type VolumeUnit = keyof typeof VOLUME_UNITS;
export type MassUnit = keyof typeof MASS_UNITS;

/** Molarity (mol/L) from a dissolved mass. */
export function molarityFromMass(massG: number, molarMass: number, volumeL: number): number {
  if (!(molarMass > 0) || !(volumeL > 0) || !(massG >= 0)) return NaN;
  return massG / molarMass / volumeL;
}

/** Mass (g) to weigh out for a target molarity and volume. */
export function massForMolarity(molarityM: number, molarMass: number, volumeL: number): number {
  if (!(molarMass > 0) || !(volumeL >= 0) || !(molarityM >= 0)) return NaN;
  return molarityM * volumeL * molarMass;
}

export type DilutionUnknown = 'c1' | 'v1' | 'c2' | 'v2';

/**
 * C1·V1 = C2·V2, solved for the one unknown. Units only need to be consistent
 * between C1/C2 and V1/V2. A dilution cannot concentrate: C2 > C1 is an error.
 */
export function solveDilution(
  known: { c1?: number; v1?: number; c2?: number; v2?: number },
  unknown: DilutionUnknown,
): { value: number; error?: string } {
  const { c1 = NaN, v1 = NaN, c2 = NaN, v2 = NaN } = known;
  const pos = (x: number) => Number.isFinite(x) && x > 0;
  let value = NaN;
  if (unknown === 'v1' && pos(c1) && pos(c2) && pos(v2)) value = (c2 * v2) / c1;
  else if (unknown === 'v2' && pos(c1) && pos(v1) && pos(c2)) value = (c1 * v1) / c2;
  else if (unknown === 'c1' && pos(v1) && pos(c2) && pos(v2)) value = (c2 * v2) / v1;
  else if (unknown === 'c2' && pos(c1) && pos(v1) && pos(v2)) value = (c1 * v1) / v2;
  else return { value: NaN, error: 'Enter the three known values (all greater than zero).' };
  const C1 = unknown === 'c1' ? value : c1;
  const C2 = unknown === 'c2' ? value : c2;
  if (C2 > C1 * (1 + 1e-12)) return { value, error: 'The target is more concentrated than the stock; a dilution cannot do that.' };
  return { value };
}

export type NucleicAcidType = 'dsDNA' | 'ssDNA' | 'RNA';

/** Standard A260 conversion factors (µg/mL per A260 unit, 1 cm path). */
export const A260_FACTOR: Record<NucleicAcidType, number> = { dsDNA: 50, ssDNA: 33, RNA: 40 };

/** Nucleic-acid concentration (µg/mL) from a measured A260 and dilution factor. */
export function concentrationFromA260(a260: number, type: NucleicAcidType, dilution = 1): number {
  if (!Number.isFinite(a260) || a260 < 0 || !(dilution > 0)) return NaN;
  return a260 * A260_FACTOR[type] * dilution;
}

/** A260/A280 purity reading with the conventional reference values. */
export function purityNote(a260: number, a280: number, type: NucleicAcidType): { ratio: number; note: string } {
  if (!(a280 > 0) || !(a260 >= 0)) return { ratio: NaN, note: 'Enter A260 and A280 (A280 > 0).' };
  const ratio = a260 / a280;
  const target = type === 'RNA' ? 2.0 : 1.8;
  const note = ratio < target - 0.2
    ? `Below ~${target.toFixed(1)}: possible protein or phenol carry-over.`
    : ratio > target + 0.3
      ? `Well above ~${target.toFixed(1)}: check the blank and the A280 reading.`
      : `Close to the usual ~${target.toFixed(1)} for ${type === 'RNA' ? 'RNA' : 'DNA'}.`;
  return { ratio, note };
}
