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

// ---------------------------------------------------------------------------
// GenBank flat files (NCBI GenBank release notes, section 3.4; INSDC feature
// table definition, section 3.4 "location descriptors")
// ---------------------------------------------------------------------------

/** One annotated region. Coordinates are 1-based and inclusive, on the + strand. */
export interface SeqFeature {
  type: string;
  /** The location exactly as written in the file (joins, complements, partial ends). */
  location: string;
  start: number;
  end: number;
  strand: 1 | -1;
  label: string;
  /** `<` or `>` in the location: the feature runs past what the record contains. */
  partial: boolean;
}

export interface GenBankRecord {
  name: string;
  definition: string;
  accession: string;
  organism: string;
  /** Residues as written in ORIGIN, unvalidated. */
  seq: string;
  units: 'bp' | 'aa';
  circular: boolean;
  features: SeqFeature[];
  /** Problems found while reading: length mismatches, unreadable locations, … */
  warnings: string[];
}

export const MAX_FEATURES = 2000;
const MAX_LOCATION_CHARS = 2000;

/** True when the text starts like a GenBank / GenPept flat file. */
export function looksLikeGenBank(text: string): boolean {
  return /^\s*LOCUS\s/.test(text);
}

interface LocLeaf { a: number; b: number; strand: 1 | -1 }

/** Split `s` at commas that are not inside parentheses. */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Evaluate a location into its leaf ranges, in biological order (the order the
 * residues are read 5'→3' on the feature's own strand). Returns null for
 * locations this reader does not support (references to other records).
 */
function locationLeaves(loc: string, depth = 0): LocLeaf[] | null {
  const s = loc.replace(/\s+/g, '');
  if (!s || depth > 20) return null;
  const fn = /^(complement|join|order)\((.*)\)$/.exec(s);
  if (fn) {
    if (fn[1] === 'complement') {
      const inner = locationLeaves(fn[2], depth + 1);
      return inner && inner.reverse().map((l) => ({ ...l, strand: (l.strand === 1 ? -1 : 1) as 1 | -1 }));
    }
    const parts = splitTopLevel(fn[2]);
    const out: LocLeaf[] = [];
    for (const p of parts) {
      const leaves = locationLeaves(p, depth + 1);
      if (!leaves) return null;
      out.push(...leaves);
    }
    return out.length ? out : null;
  }
  // A single base, a range (with partial markers), a site between two bases,
  // or one base somewhere inside a range (`102.110`).
  const range = /^<?(\d+)\.\.>?(\d+)$/.exec(s);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    return a >= 1 && b >= a ? [{ a, b, strand: 1 }] : null;
  }
  const single = /^[<>]?(\d+)$/.exec(s);
  if (single) { const a = Number(single[1]); return a >= 1 ? [{ a, b: a, strand: 1 }] : null; }
  const between = /^(\d+)\^(\d+)$/.exec(s);
  if (between) { const a = Number(between[1]); return a >= 1 ? [{ a, b: a - 1, strand: 1 }] : null; }
  const within = /^(\d+)\.(\d+)$/.exec(s);
  if (within) { const a = Number(within[1]); return a >= 1 ? [{ a, b: a, strand: 1 }] : null; }
  return null;
}

/** Span and strand of a location, or null if it cannot be read or leaves the sequence. */
export function parseLocation(loc: string, seqLength = Infinity): Pick<SeqFeature, 'start' | 'end' | 'strand' | 'partial'> | null {
  if (loc.length > MAX_LOCATION_CHARS || loc.includes(':')) return null;
  const leaves = locationLeaves(loc);
  if (!leaves) return null;
  let start = Infinity;
  let end = 0;
  for (const l of leaves) {
    if (Math.max(l.a, l.b) > seqLength) return null;
    start = Math.min(start, l.a);
    end = Math.max(end, Math.max(l.a, l.b));
  }
  const strand: 1 | -1 = leaves.every((l) => l.strand === -1) ? -1 : 1;
  return { start, end, strand, partial: /[<>]/.test(loc) };
}

/**
 * The residues a location describes, read 5'→3' on the feature's strand
 * (complements are reverse-complemented, joins concatenated in the order
 * written). Null when the location cannot be read or leaves the sequence.
 */
export function extractLocation(seq: string, loc: string): string | null {
  if (loc.length > MAX_LOCATION_CHARS || loc.includes(':')) return null;
  const leaves = locationLeaves(loc);
  if (!leaves) return null;
  let out = '';
  for (const l of leaves) {
    if (l.b > seq.length) return null;
    const part = seq.slice(l.a - 1, l.b);
    out += l.strand === 1 ? part : reverseComplement(part);
  }
  return out;
}

const LABEL_QUALIFIERS = ['label', 'gene', 'product', 'locus_tag', 'protein_id', 'note'];

function featureLabel(type: string, q: Record<string, string>): string {
  for (const k of LABEL_QUALIFIERS) {
    const v = q[k]?.trim();
    if (v) return v.length > 80 ? v.slice(0, 79) + '…' : v;
  }
  return type;
}

/**
 * Parse one or more GenBank (nucleotide) or GenPept (protein) records.
 * Every record is read independently: a broken one carries warnings instead
 * of stopping the rest. The `source` feature is not kept (its organism goes
 * into `organism`); features whose location cannot be read are reported.
 */
export function parseGenBank(text: string): GenBankRecord[] {
  const records: GenBankRecord[] = [];
  const blocks = text.replace(/\r\n?/g, '\n').split(/^\/\/\s*$/m);
  for (const block of blocks) {
    const lines = block.split('\n');
    const locusIdx = lines.findIndex((l) => l.startsWith('LOCUS'));
    if (locusIdx < 0) continue;
    const locus = lines[locusIdx].slice(5).trim().split(/\s+/);
    const unitsIdx = locus.findIndex((t) => t === 'bp' || t === 'aa');
    const rec: GenBankRecord = {
      name: locus[0] || 'record',
      definition: '', accession: '', organism: '', seq: '',
      units: unitsIdx >= 0 && locus[unitsIdx] === 'aa' ? 'aa' : 'bp',
      circular: locus.some((t) => t.toLowerCase() === 'circular'),
      features: [], warnings: [],
    };
    const declared = unitsIdx > 0 ? Number(locus[unitsIdx - 1]) : NaN;

    type Raw = { type: string; location: string; qualifiers: [string, string][] };
    const raws: Raw[] = [];
    let section = '';
    let inOrigin = false;
    let seq = '';
    for (let i = locusIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (inOrigin) { seq += line.replace(/[\s\d]/g, ''); continue; }
      const head = /^([A-Z][A-Z_ ]*?)\s{2,}|^([A-Z]+)\s*$/.exec(line);
      if (line && line[0] !== ' ' && head) {
        section = (head[1] ?? head[2] ?? '').trim();
        const rest = line.slice(12).trim();
        if (section === 'ORIGIN') { inOrigin = true; continue; }
        if (section === 'DEFINITION') rec.definition = rest;
        else if (section === 'ACCESSION') rec.accession = rest.split(/\s+/)[0] ?? '';
        else if (section === 'CONTIG') rec.warnings.push('CONTIG record: it points at other records and has no residues of its own.');
        continue;
      }
      if (section === 'DEFINITION' && line.startsWith('            ')) { rec.definition += ' ' + line.trim(); continue; }
      if (section === 'SOURCE' && /^\s+ORGANISM\s/.test(line)) { rec.organism = line.replace(/^\s+ORGANISM\s+/, '').trim(); continue; }
      if (section !== 'FEATURES') continue;
      // Feature table: key in columns 6-20, location / qualifiers from column 22.
      const key = /^ {5}(\S+)\s+(.*)$/.exec(line);
      if (key && line[5] !== ' ') { raws.push({ type: key[1], location: key[2].trim(), qualifiers: [] }); continue; }
      const cur = raws[raws.length - 1];
      if (!cur || !/^ {21}/.test(line)) continue;
      const body = line.slice(21).trimEnd();
      if (body.startsWith('/')) {
        const eq = body.indexOf('=');
        cur.qualifiers.push(eq < 0 ? [body.slice(1), ''] : [body.slice(1, eq), body.slice(eq + 1)]);
      } else if (cur.qualifiers.length) {
        const q = cur.qualifiers[cur.qualifiers.length - 1];
        // Free text wraps with a space; translations and sequences wrap without one.
        q[1] += (q[0] === 'translation' ? '' : ' ') + body.trim();
      } else {
        cur.location += body.trim();
      }
    }
    rec.seq = seq;
    if (!seq) {
      if (!rec.warnings.length) rec.warnings.push('No ORIGIN section: the record has no residues.');
    } else if (Number.isFinite(declared) && declared !== seq.length) {
      rec.warnings.push(`LOCUS says ${declared} ${rec.units} but ORIGIN holds ${seq.length}.`);
    }

    let unreadable = 0;
    for (const r of raws) {
      if (r.type === 'source') {
        const org = r.qualifiers.find(([k]) => k === 'organism');
        if (org && !rec.organism) rec.organism = org[1].replace(/^"|"$/g, '');
        continue;
      }
      if (rec.features.length >= MAX_FEATURES) { rec.warnings.push(`Only the first ${MAX_FEATURES} features were kept.`); break; }
      const span = parseLocation(r.location, seq.length || Infinity);
      if (!span) { unreadable++; continue; }
      const q: Record<string, string> = {};
      for (const [k, v] of r.qualifiers) if (!(k in q)) q[k] = v.replace(/^"|"$/g, '').replace(/""/g, '"');
      rec.features.push({ type: r.type, location: r.location.replace(/\s+/g, ''), ...span, label: featureLabel(r.type, q) });
    }
    if (unreadable) rec.warnings.push(`${unreadable} feature(s) skipped: their location points at another record or past the sequence.`);
    records.push(rec);
  }
  return records;
}

function wrapAt(text: string, first: string, indent: string, width = 79, breakAfter = /[\s,]/): string[] {
  const lines: string[] = [];
  let prefix = first;
  let rest = text;
  while (prefix.length + rest.length > width) {
    const room = width - prefix.length;
    let cut = -1;
    for (let i = room; i > 0; i--) if (breakAfter.test(rest[i - 1])) { cut = i; break; }
    if (cut <= 0) cut = room;
    lines.push(prefix + rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
    prefix = indent;
  }
  lines.push(prefix + rest);
  return lines;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Write a nucleotide record as a GenBank flat file. Features are written with
 * their original location and one `/label` qualifier; other qualifiers from an
 * imported file are not kept by DEX and so are not written.
 */
export function toGenBank(r: { name: string; definition?: string; seq: string; circular?: boolean; features?: readonly SeqFeature[] }, date = new Date()): string {
  const locusName = (r.name.replace(/\s+/g, '_').replace(/[^\w.\-]/g, '') || 'sequence').slice(0, 16);
  const d = `${String(date.getDate()).padStart(2, '0')}-${MONTHS[date.getMonth()]}-${date.getFullYear()}`;
  const out: string[] = [
    `LOCUS       ${locusName.padEnd(16)} ${String(r.seq.length).padStart(11)} bp    DNA     ${(r.circular ? 'circular' : 'linear').padEnd(8)} SYN ${d}`,
    ...wrapAt(r.definition?.trim() || r.name, 'DEFINITION  ', '            '),
    'FEATURES             Location/Qualifiers',
    `     source          1..${r.seq.length}`,
    '                     /mol_type="other DNA"',
  ];
  for (const f of r.features ?? []) {
    out.push(...wrapAt(f.location, `     ${f.type.padEnd(16)}`, ' '.repeat(21), 79, /,/));
    out.push(...wrapAt(`/label="${f.label.replace(/"/g, '""')}"`, ' '.repeat(21), ' '.repeat(21)));
  }
  out.push('ORIGIN');
  const s = r.seq.toLowerCase();
  for (let i = 0; i < s.length; i += 60) {
    const groups: string[] = [];
    for (let j = i; j < Math.min(i + 60, s.length); j += 10) groups.push(s.slice(j, Math.min(j + 10, s.length)));
    out.push(`${String(i + 1).padStart(9)} ${groups.join(' ')}`);
  }
  out.push('//');
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// PCR primers: Watson–Crick complementarity checks and product prediction.
// These look for perfectly paired stretches only; they are a screen, not a
// free-energy (ΔG) model of dimers or hairpins.
// ---------------------------------------------------------------------------

export interface ComplementStretch {
  /** Base pairs in the longest perfectly paired stretch (0 = none). */
  length: number;
  /** The stretch includes one of the last three bases at a 3' end. */
  threePrime: boolean;
}

export interface PrimerCheck {
  seq: string;
  length: number;
  gc: number;
  tm: NearestNeighborTm | null;
  /** G or C among the last five 3' bases. */
  clamp: number;
  /** Longest run of one base. */
  run: number;
  /** Longest stem (bp) of a hairpin with a loop of at least three bases. */
  hairpin: number;
  selfDimer: ComplementStretch;
  issues: string[];
}

const PAIRS = (x: string, y: string) =>
  (x === 'A' && y === 'T') || (x === 'T' && y === 'A') || (x === 'G' && y === 'C') || (x === 'C' && y === 'G');

/**
 * Longest stretch where `a` (5'→3') pairs antiparallel with `b` (5'→3').
 * Equivalent to the longest common substring of `a` and reverseComplement(b).
 */
export function longestComplement(a: string, b: string): ComplementStretch {
  const rb = reverseComplement(b);
  let best = 0;
  let bestThree = false;
  let prev = new Array<number>(rb.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(rb.length + 1).fill(0);
    for (let j = 1; j <= rb.length; j++) {
      if (a[i - 1] === rb[j - 1] && a[i - 1] !== 'N') {
        cur[j] = prev[j - 1] + 1;
        const len = cur[j];
        // a's 3' end is its last index; b's 3' end is index 0 of its reverse complement.
        const three = i >= a.length - 2 || j - len < 3;
        if (len > best || (len === best && three && !bestThree)) { best = len; bestThree = three; }
      }
    }
    prev = cur;
  }
  return { length: best, threePrime: best > 0 && bestThree };
}

/** Longest hairpin stem: s[i..i+k) pairs with s[j-k+1..j] read backwards, loop ≥ 3. */
export function longestHairpin(s: string, minLoop = 3): number {
  let best = 0;
  for (let i = 0; i < s.length; i++) {
    for (let j = s.length - 1; j > i + minLoop; j--) {
      let k = 0;
      while (i + k < j - k - minLoop && PAIRS(s[i + k], s[j - k])) k++;
      if (k > best) best = k;
    }
  }
  return best;
}

export function checkPrimer(raw: string): PrimerCheck {
  const seq = parseSequence(raw, 'dna').seq;
  const issues: string[] = [];
  const tail = seq.slice(-5);
  const clamp = (tail.match(/[GC]/g) ?? []).length;
  const run = (seq.match(/(A+|C+|G+|T+|N+)/g) ?? []).reduce((m, r) => Math.max(m, r.length), 0);
  const gc = gcContent(seq);
  const tm = nearestNeighborTm(seq);
  const hairpin = longestHairpin(seq);
  const selfDimer = longestComplement(seq, seq);
  if (seq.length && (seq.length < 18 || seq.length > 30)) issues.push(`Length ${seq.length} nt (18–30 is typical).`);
  if (seq.length && (gc < 40 || gc > 60)) issues.push(`GC ${gc.toFixed(0)} % (40–60 % is typical).`);
  if (seq.includes('N')) issues.push('Contains ambiguous bases (N).');
  if (seq.length >= 5 && clamp === 0) issues.push('No G or C in the last five 3′ bases.');
  if (clamp > 3) issues.push(`${clamp} G/C in the last five 3′ bases (more than 3 can prime falsely).`);
  if (run >= 5) issues.push(`Run of ${run} identical bases.`);
  if (hairpin >= 4) issues.push(`Possible hairpin: ${hairpin} bp stem.`);
  if (selfDimer.length >= 8 || (selfDimer.threePrime && selfDimer.length >= 4)) {
    issues.push(`Self-dimer: ${selfDimer.length} bp${selfDimer.threePrime ? ' at a 3′ end' : ''}.`);
  }
  return { seq, length: seq.length, gc, tm, clamp, run, hairpin, selfDimer, issues };
}

/** Where a primer anneals on a template, from an exact match of its 3′ end. */
export interface PrimerSite {
  /** 1-based position on the + strand of the annealed region's leftmost base. */
  start: number;
  /** 1-based position of its rightmost base (may be < start across the origin of a circle). */
  end: number;
  /** +1: the primer reads along the + strand (forward); -1: along the − strand. */
  strand: 1 | -1;
  /** Bases of the primer that pair with the template. */
  annealed: number;
  /** 5′ bases that do not pair (a tail such as an added restriction site). */
  tail: number;
}

export const PRIMER_ANCHOR = 15;

/**
 * Find binding sites by an exact match of the primer's last `PRIMER_ANCHOR`
 * 3′ bases (the whole primer if shorter), then extend toward the 5′ end while
 * bases still match. Mismatches inside the anchor are not tolerated.
 */
export function findPrimerSites(template: string, primerRaw: string, circular = false): PrimerSite[] {
  const primer = parseSequence(primerRaw, 'dna').seq;
  const L = template.length;
  if (primer.length < 8 || L < 8) return [];
  const anchorLen = Math.min(PRIMER_ANCHOR, primer.length);
  const hay = circular ? template + template.slice(0, Math.min(L, primer.length) - 1) : template;
  const at = (i: number) => (circular ? template[((i % L) + L) % L] : template[i]);
  const out: PrimerSite[] = [];
  const scan = (needle: string, onHit: (i: number) => void) => {
    for (let i = hay.indexOf(needle); i >= 0 && i < (circular ? L : hay.length); i = hay.indexOf(needle, i + 1)) onHit(i);
  };
  // + strand: the anchor itself appears; extend leftward (toward the primer's 5′ end).
  const fwd = primer.slice(-anchorLen);
  scan(fwd, (i) => {
    let ext = 0;
    while (anchorLen + ext < primer.length && ext < L - anchorLen) {
      const ti = i - ext - 1;
      if (!circular && ti < 0) break;
      if (at(ti) !== primer[primer.length - anchorLen - ext - 1]) break;
      ext++;
    }
    const annealed = anchorLen + ext;
    const s0 = i - ext;
    out.push({ start: (((s0 % L) + L) % L) + 1, end: ((s0 + annealed - 1) % L) + 1, strand: 1, annealed, tail: primer.length - annealed });
  });
  // − strand: the reverse complement of the anchor appears; extend rightward.
  const rev = reverseComplement(primer.slice(-anchorLen));
  if (rev !== fwd) {
    scan(rev, (i) => {
      let ext = 0;
      while (anchorLen + ext < primer.length && ext < L - anchorLen) {
        const ti = i + anchorLen + ext;
        if (!circular && ti >= L) break;
        if (at(ti) !== COMPLEMENT[primer[primer.length - anchorLen - ext - 1]]) break;
        ext++;
      }
      const annealed = anchorLen + ext;
      out.push({ start: (i % L) + 1, end: ((i + annealed - 1) % L) + 1, strand: -1, annealed, tail: primer.length - annealed });
    });
  }
  return out;
}

export interface PcrProduct {
  /** Product length including both 5′ tails. */
  length: number;
  /** 1-based + strand positions of the template region copied (annealed ends included). */
  from: number;
  to: number;
  /** Which input primer bound the + strand. */
  forwardIs: 'F' | 'R';
}

/**
 * Products of a primer pair: every + strand site of one primer paired with every
 * − strand site of the other that lies downstream of it (or, on a circle,
 * anywhere: the product then runs through the origin).
 */
export function predictProducts(template: string, f: string, r: string, circular = false): PcrProduct[] {
  const L = template.length;
  const fs = findPrimerSites(template, f, circular);
  const rs = findPrimerSites(template, r, circular);
  const out: PcrProduct[] = [];
  const pair = (plus: PrimerSite[], minus: PrimerSite[], forwardIs: 'F' | 'R') => {
    for (const p of plus) if (p.strand === 1) for (const m of minus) if (m.strand === -1) {
      const span = m.end >= p.start ? m.end - p.start + 1 : circular ? L - p.start + 1 + m.end : 0;
      if (span <= 0 || span < Math.max(p.annealed, m.annealed)) continue;
      out.push({ length: span + p.tail + m.tail, from: p.start, to: m.end, forwardIs });
    }
  };
  pair(fs, rs, 'F');
  pair(rs, fs, 'R');
  return out.sort((a, b) => a.length - b.length).slice(0, 50);
}
