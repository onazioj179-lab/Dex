// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  parseSequence, detectKind, parseFasta, toFasta, transcribe, reverseComplement, translate, findOrfs,
  gcContent, slidingGc, ssDnaMolecularWeight, dsDnaMolecularWeight, meltingTemp, proteinMolecularWeight,
  extinctionCoefficient, findRestrictionSites, digestFragments, digestFragmentsCircular, nearestNeighborTm,
  ENZYMES, molarityFromMass, massForMolarity,
  solveDilution, concentrationFromA260, purityNote, CODON_TABLE,
} from '../../src/renderer/DEXAPPLICATIONS/bio/bioScience';

describe('bio science — genetic code + central dogma', () => {
  it('codon table is the standard code', () => {
    expect(Object.keys(CODON_TABLE)).toHaveLength(64);
    expect(CODON_TABLE.AUG).toBe('M');
    expect(CODON_TABLE.UGG).toBe('W');
    expect(['UAA', 'UAG', 'UGA'].map((c) => CODON_TABLE[c])).toEqual(['*', '*', '*']);
    expect(CODON_TABLE.GGG).toBe('G');
  });

  it('translates the Biopython tutorial sequence', () => {
    const dna = 'ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG';
    expect(translate(dna)).toBe('MAIVMGR*KGAR*');
    expect(translate(dna, 0, true)).toBe('MAIVMGR');
    expect(translate(transcribe(dna))).toBe('MAIVMGR*KGAR*');
  });

  it('reverse complement and transcription', () => {
    expect(reverseComplement('ATGC')).toBe('GCAT');
    expect(reverseComplement('AANT')).toBe('ANTT');
    expect(transcribe('ATGT')).toBe('AUGU');
  });

  it('ambiguous codons translate to X', () => {
    expect(translate('ATGNNN')).toBe('MX');
  });
});

describe('bio science — parsing', () => {
  it('strips formatting, maps U to T, reports invalid characters', () => {
    const p = parseSequence('AC GT 12\nXU', 'dna');
    expect(p.seq).toBe('ACGTT');
    expect(p.invalid).toEqual([{ position: 5, char: 'X' }]);
    expect(p.ambiguous).toBe(0);
  });

  it('keeps IUPAC ambiguity codes as N and counts them', () => {
    const p = parseSequence('ACRYGT', 'dna');
    expect(p.seq).toBe('ACNNGT');
    expect(p.ambiguous).toBe(2);
  });

  it('detects the alphabet', () => {
    expect(detectKind('ACGTACGT')).toBe('dna');
    expect(detectKind('ACGUACGU')).toBe('rna');
    expect(detectKind('MAIVMGRKGAR')).toBe('protein');
  });

  it('FASTA round trip', () => {
    const recs = parseFasta('>seq1 first one\nACGT\nACGT\n>seq2\nGGGG\n');
    expect(recs).toEqual([
      { name: 'seq1', description: 'first one', seq: 'ACGTACGT' },
      { name: 'seq2', description: '', seq: 'GGGG' },
    ]);
    expect(parseFasta(toFasta(recs, 3))).toEqual(recs);
    expect(parseFasta('ACGT')).toEqual([{ name: 'sequence', description: '', seq: 'ACGT' }]);
  });
});

describe('bio science — ORFs', () => {
  it('finds a forward-strand ORF with 1-based coordinates', () => {
    const orfs = findOrfs('ATGAAATAG', 1);
    expect(orfs).toEqual([{ strand: '+', frame: 1, start: 1, end: 9, lengthNt: 9, protein: 'MK', hasStop: true }]);
  });

  it('maps reverse-strand ORFs back to forward coordinates', () => {
    const orfs = findOrfs('CCTATTTCAT', 1); // revcomp = ATGAAATAGG
    expect(orfs).toHaveLength(1);
    expect(orfs[0]).toMatchObject({ strand: '-', start: 2, end: 10, protein: 'MK', hasStop: true });
  });

  it('flags open ORFs that run off the end and honours the minimum length', () => {
    expect(findOrfs('ATGAAAAAA', 1)[0]).toMatchObject({ hasStop: false, protein: 'MKK' });
    expect(findOrfs('ATGAAATAG', 5)).toEqual([]);
  });
});

describe('bio science — composition and physical values', () => {
  it('GC content excludes N', () => {
    expect(gcContent('GGCCAATT')).toBe(50);
    expect(gcContent('GGNN')).toBe(100);
    expect(gcContent('')).toBe(0);
  });

  it('sliding GC window', () => {
    const pts = slidingGc('GGGGAAAA', 4, 4);
    expect(pts).toEqual([{ pos: 2, gc: 100 }, { pos: 6, gc: 0 }]);
  });

  it('ssDNA MW (OligoCalc anhydrous)', () => {
    expect(ssDnaMolecularWeight('ATGC')).toBeCloseTo(313.21 + 304.2 + 329.21 + 289.18 - 61.96, 6);
    expect(ssDnaMolecularWeight('ATNC')).toBeNaN();
    expect(dsDnaMolecularWeight('AT')).toBeCloseTo(2 * (313.21 + 304.2 - 61.96), 6);
  });

  it('melting temperature formulas', () => {
    expect(meltingTemp('ATGC')).toEqual({ tm: 12, method: 'wallace' });
    const twenty = 'GCGCGCGCGCATATATATAT'; // 10 GC / 20
    const r = meltingTemp(twenty);
    expect(r.method).toBe('basic');
    expect(r.tm).toBeCloseTo(64.9 + (41 * (10 - 16.4)) / 20, 9);
  });

  it('protein MW matches free amino acids (ExPASy average masses)', () => {
    expect(proteinMolecularWeight('G')).toBeCloseTo(75.07, 2);
    expect(proteinMolecularWeight('A')).toBeCloseTo(89.09, 2);
    expect(proteinMolecularWeight('W')).toBeCloseTo(204.23, 2);
    expect(proteinMolecularWeight('GX')).toBeNaN();
  });

  it('extinction coefficient at 280 nm (Pace)', () => {
    expect(extinctionCoefficient('WYCC')).toEqual({ reduced: 6990, cystines: 7115 });
  });
});

describe('bio science — restriction digest', () => {
  it('finds sites with their cut position', () => {
    const hits = findRestrictionSites('AAGAATTCAAGGATCC');
    expect(hits.map((h) => [h.enzyme, h.position, h.cutAfter])).toEqual([
      ['EcoRI', 3, 3],
      ['BamHI', 11, 11],
    ]);
  });

  it('computes linear fragment lengths', () => {
    expect(digestFragments(10, [3])).toEqual([3, 7]);
    expect(digestFragments(10, [7, 3, 3])).toEqual([3, 4, 3]);
    expect(digestFragments(10, [])).toEqual([10]);
  });

  it('finds sites across the origin of a circular sequence', () => {
    const ecoRV = ENZYMES.filter((e) => e.name === 'EcoRV');
    // GA | TATC: the site starts at base 10 and ends at base 4 of the circle.
    const dna = 'TATCAAAAAGA';
    expect(findRestrictionSites(dna, ecoRV)).toEqual([]);
    expect(findRestrictionSites(dna, ecoRV, true)).toEqual([{ enzyme: 'EcoRV', site: 'GATATC', position: 10, cutAfter: 1 }]);
    // A site wholly inside the sequence is reported once, not again on the wrap.
    expect(findRestrictionSites('AAGATATCAA', ecoRV, true).map((h) => [h.position, h.cutAfter])).toEqual([[3, 5]]);
    // A circle shorter than the site holds no site.
    expect(findRestrictionSites('GATA', ecoRV, true)).toEqual([]);
  });

  it('computes circular fragment lengths', () => {
    expect(digestFragmentsCircular(10, [])).toEqual([]);
    expect(digestFragmentsCircular(10, [3])).toEqual([10]);
    expect(digestFragmentsCircular(10, [7, 3])).toEqual([4, 6]);
    expect(digestFragmentsCircular(10, [10, 3, 3])).toEqual([7, 3]);
    expect(digestFragmentsCircular(0, [1])).toEqual([]);
  });
});

describe('bio science — nearest-neighbour Tm (SantaLucia 1998)', () => {
  // Expected ΔH°/ΔS° are summed by hand from the paper's unified table.
  it('sums steps and terminal initiation for CGTTGA', () => {
    // CG -10.6/-27.2, GT -8.4/-22.4, TT -7.9/-22.2, TG -8.5/-22.7, GA -8.2/-22.2
    // init G·C end 0.1/-2.8, init A·T end 2.3/4.1
    const r = nearestNeighborTm('CGTTGA', { sodiumM: 1, oligoM: 1e-4 })!;
    expect(r.dH).toBeCloseTo(-41.2, 9);
    expect(r.dS).toBeCloseTo(-115.4, 9);
    expect(r.selfComplementary).toBe(false);
    expect(r.tm).toBeCloseTo(-41200 / (-115.4 + 1.987 * Math.log(1e-4 / 4)) - 273.15, 9);
    expect(r.tm).toBeGreaterThan(28);
    expect(r.tm).toBeLessThan(29.5);
  });

  it('applies the symmetry term to a self-complementary oligo', () => {
    // GAATTC: GA -8.2/-22.2, AA -7.9/-22.2, AT -7.2/-20.4, TT -7.9/-22.2, TC -8.2/-22.2
    // two G·C ends 0.2/-5.6, symmetry -1.4
    const r = nearestNeighborTm('GAATTC', { sodiumM: 1, oligoM: 1e-4 })!;
    expect(r.selfComplementary).toBe(true);
    expect(r.dH).toBeCloseTo(-39.2, 9);
    expect(r.dS).toBeCloseTo(-116.2, 9);
    expect(r.tm).toBeCloseTo(-39200 / (-116.2 + 1.987 * Math.log(1e-4)) - 273.15, 9);
  });

  it('lowers Tm at lower salt and reports the conditions used', () => {
    const oligo = 'AGCGGATAACAATTTCACACAGGA';
    const std = nearestNeighborTm(oligo)!;
    expect(std.sodiumM).toBe(0.05);
    expect(std.oligoM).toBe(0.5e-6);
    const oneMolar = nearestNeighborTm(oligo, { sodiumM: 1 })!;
    expect(std.dS).toBeCloseTo(oneMolar.dS + 0.368 * 23 * Math.log(0.05), 9);
    expect(std.tm).toBeLessThan(oneMolar.tm);
    expect(nearestNeighborTm(oligo, { oligoM: 5e-6 })!.tm).toBeGreaterThan(std.tm);
  });

  it('declines sequences the model does not cover', () => {
    expect(nearestNeighborTm('ACGTA')).toBeNull();
    expect(nearestNeighborTm('ACGTNACGT')).toBeNull();
    expect(nearestNeighborTm('A'.repeat(61))).toBeNull();
    expect(nearestNeighborTm('ACGTACGT', { sodiumM: 0 })).toBeNull();
  });
});

describe('bio science — bench calculations', () => {
  it('molarity and mass to weigh', () => {
    expect(molarityFromMass(58.44, 58.44, 1)).toBeCloseTo(1, 12);
    expect(massForMolarity(0.15, 58.44, 0.5)).toBeCloseTo(4.383, 6);
    expect(molarityFromMass(1, 0, 1)).toBeNaN();
  });

  it('C1V1 = C2V2 for each unknown', () => {
    expect(solveDilution({ c1: 10, c2: 1, v2: 100 }, 'v1').value).toBeCloseTo(10);
    expect(solveDilution({ c1: 10, v1: 10, c2: 1 }, 'v2').value).toBeCloseTo(100);
    expect(solveDilution({ v1: 10, c2: 1, v2: 100 }, 'c1').value).toBeCloseTo(10);
    expect(solveDilution({ c1: 10, v1: 10, v2: 100 }, 'c2').value).toBeCloseTo(1);
    expect(solveDilution({ c1: 1, c2: 10, v2: 100 }, 'v1').error).toMatch(/more concentrated/);
    expect(solveDilution({ c1: 1 }, 'v1').error).toMatch(/three known/);
  });

  it('A260 concentration and purity', () => {
    expect(concentrationFromA260(1, 'dsDNA', 10)).toBe(500);
    expect(concentrationFromA260(0.5, 'RNA')).toBe(20);
    const p = purityNote(1.8, 1, 'dsDNA');
    expect(p.ratio).toBeCloseTo(1.8);
    expect(p.note).toMatch(/Close to/);
    expect(purityNote(1.2, 1, 'dsDNA').note).toMatch(/protein/);
  });
});
