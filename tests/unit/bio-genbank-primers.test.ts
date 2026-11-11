// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  parseGenBank, toGenBank, looksLikeGenBank, parseLocation, extractLocation,
  longestComplement, longestHairpin, checkPrimer, findPrimerSites, predictProducts, reverseComplement,
} from '../../src/renderer/DEXAPPLICATIONS/bio/bioScience';
import { applyAction, emptyProject, normalizeProject } from '../../src/renderer/DEXAPPLICATIONS/bio/bioProject';

// Positions 10..12 = TGC and 20..22 = CCC (hand-placed in the ORIGIN block).
const GB = [
  'LOCUS       TESTPLAS                  60 bp    DNA     circular SYN 01-JAN-2026',
  'DEFINITION  Test plasmid with a',
  '            two-line definition.',
  'ACCESSION   TP0001',
  'SOURCE      synthetic construct',
  '  ORGANISM  synthetic construct',
  'FEATURES             Location/Qualifiers',
  '     source          1..60',
  '                     /organism="synthetic construct"',
  '     CDS             complement(join(10..12,20..22))',
  '                     /gene="abc"',
  '     misc_feature    <1..>5',
  '                     /note="a long note that wraps',
  '                     onto the next line"',
  '     rep_origin      55..60',
  '                     /label=ori',
  '     gene            OTHER1.1:1..5',
  'ORIGIN',
  '        1 aaaaaaaaat gcaaaaaaac ccaaaaaaaa aaaaaaaaaa aaaaaaaaaa aaaaaaaaaa',
  '//',
  'LOCUS       PEP1                       5 aa            linear   PRI 01-JAN-2026',
  'ORIGIN',
  '        1 mkvla a',
  '//',
].join('\r\n');

describe('GenBank', () => {
  it('reads header fields, topology, features and qualifiers', () => {
    expect(looksLikeGenBank(GB)).toBe(true);
    expect(looksLikeGenBank('>x\nACGT')).toBe(false);
    const [r, p] = parseGenBank(GB);
    expect(r.name).toBe('TESTPLAS');
    expect(r.definition).toBe('Test plasmid with a two-line definition.');
    expect(r.accession).toBe('TP0001');
    expect(r.organism).toBe('synthetic construct');
    expect(r.circular).toBe(true);
    expect(r.units).toBe('bp');
    expect(r.seq).toHaveLength(60);
    expect(r.features.map((f) => f.type)).toEqual(['CDS', 'misc_feature', 'rep_origin']);
    expect(r.features[0]).toMatchObject({ start: 10, end: 22, strand: -1, label: 'abc', partial: false });
    expect(r.features[1]).toMatchObject({ start: 1, end: 5, partial: true, label: 'a long note that wraps onto the next line' });
    expect(r.features[2].label).toBe('ori');
    expect(r.warnings).toEqual(['1 feature(s) skipped: their location points at another record or past the sequence.']);
    expect(p.units).toBe('aa');
    expect(p.circular).toBe(false);
    expect(p.warnings).toEqual(['LOCUS says 5 aa but ORIGIN holds 6.']);
  });

  it('extracts feature residues on their own strand', () => {
    const [r] = parseGenBank(GB);
    const seq = r.seq.toUpperCase();
    // join = TGC + CCC = TGCCCC; complement reads it backwards: GGGGCA.
    expect(extractLocation(seq, r.features[0].location)).toBe('GGGGCA');
    expect(extractLocation('ACGTACGTAA', 'complement(3..5)')).toBe('TAC');
    expect(extractLocation('ACGTACGTAA', 'join(9..10,1..2)')).toBe('AAAC');
    expect(extractLocation('ACGTACGTAA', 'join(complement(9..10),complement(1..2))')).toBe('TTGT');
    expect(extractLocation('ACGTACGTAA', '1^2')).toBe('');
    expect(extractLocation('ACGTACGTAA', '5..11')).toBeNull();
    expect(extractLocation('ACGTACGTAA', 'X1.1:1..3')).toBeNull();
    expect(parseLocation('join(complement(20..22),complement(10..12))')).toEqual({ start: 10, end: 22, strand: -1, partial: false });
    expect(parseLocation('join(1..3,complement(5..6))')?.strand).toBe(1);
    expect(parseLocation('order(')).toBeNull();
  });

  it('writes a file it can read back, with standard LOCUS columns', () => {
    const [r] = parseGenBank(GB);
    const text = toGenBank({ name: 'TESTPLAS', definition: r.definition, seq: r.seq.toUpperCase(), circular: true, features: r.features }, new Date(2026, 10, 11));
    const locus = text.split('\n')[0];
    expect(locus.slice(40, 44)).toBe(' bp ');
    expect(locus.slice(47, 50)).toBe('DNA');
    expect(locus.slice(55, 63).trim()).toBe('circular');
    expect(locus.slice(64, 67)).toBe('SYN');
    expect(locus.slice(68)).toBe('11-NOV-2026');
    expect(text.trimEnd().endsWith('//')).toBe(true);
    const [back] = parseGenBank(text);
    expect(back.seq.toUpperCase()).toBe(r.seq.toUpperCase());
    expect(back.circular).toBe(true);
    expect(back.definition).toBe(r.definition);
    expect(back.features).toEqual(r.features);
    expect(back.warnings).toEqual([]);
  });
});

describe('primers', () => {
  it('finds complementary stretches and hairpins', () => {
    expect(longestComplement('GAATTC', 'GAATTC')).toEqual({ length: 6, threePrime: true });
    expect(longestComplement('AAAAAA', 'CCCCCC')).toEqual({ length: 0, threePrime: false });
    // GGGG pairs with CCCC across a four-base loop.
    expect(longestHairpin('GGGGAAAACCCC')).toBe(4);
    expect(longestHairpin('AAAAAAAA')).toBe(0);
  });

  it('reports primer properties and flags problems', () => {
    const m13 = checkPrimer('AGCGGATAACAATTTCACACAGGA');
    expect(m13.length).toBe(24);
    expect(m13.gc).toBeCloseTo(41.667, 2);
    expect(m13.clamp).toBe(3);
    expect(m13.run).toBe(3);
    expect(m13.tm).not.toBeNull();
    const polyA = checkPrimer('AAAAAAAAAAAAAAAAAAAA');
    expect(polyA.run).toBe(20);
    expect(polyA.issues.join(' ')).toMatch(/GC 0 %/);
    expect(polyA.issues.join(' ')).toMatch(/No G or C in the last five/);
    expect(polyA.issues.join(' ')).toMatch(/Run of 20/);
  });

  const F = 'CAGTCGATCGTAGCTAGGCT';
  const R = 'TGCATGCCATCAGTCAAGGA';
  const FILL = 'T'.repeat(30);
  const T = 'GGG' + F + FILL + reverseComplement(R) + 'CCC'; // 76 nt

  it('locates sites and predicts the product on a linear template', () => {
    expect(findPrimerSites(T, F)).toEqual([{ start: 4, end: 23, strand: 1, annealed: 20, tail: 0 }]);
    expect(findPrimerSites(T, R)).toEqual([{ start: 54, end: 73, strand: -1, annealed: 20, tail: 0 }]);
    expect(predictProducts(T, F, R)).toEqual([{ length: 70, from: 4, to: 73, forwardIs: 'F' }]);
    // A 5′ EcoRI tail does not anneal but is part of the product.
    expect(findPrimerSites(T, 'GAATTC' + F)[0]).toMatchObject({ annealed: 20, tail: 6 });
    expect(predictProducts(T, 'GAATTC' + F, R)[0].length).toBe(76);
    // Swapped labels still find the product and say so.
    expect(predictProducts(T, R, F)).toEqual([{ length: 70, from: 4, to: 73, forwardIs: 'R' }]);
  });

  it('predicts a product through the origin only on a circle', () => {
    const rotated = T.slice(40) + T.slice(0, 40);
    expect(predictProducts(rotated, F, R, false)).toEqual([]);
    expect(predictProducts(rotated, F, R, true)).toEqual([{ length: 70, from: 40, to: 33, forwardIs: 'F' }]);
  });
});

describe('features in the project', () => {
  it('keeps valid features, drops broken ones, and clears them when the residues change', () => {
    const p = normalizeProject({
      version: 1, name: 'x', activeId: 's1', results: [],
      sequences: [{
        id: 's1', name: 'a', seq: 'ACGTACGTAA', kind: 'dna', source: 'imported', notes: '',
        features: [
          { type: 'CDS', location: '1..6', start: 1, end: 6, strand: -1, label: 'c', partial: false },
          { type: 'bad', location: '5..40', start: 5, end: 40, strand: 1, label: 'b' },
          { type: 7, location: '1..2', start: 1, end: 2 },
        ],
      }],
    });
    expect(p.sequences[0].features).toEqual([{ type: 'CDS', location: '1..6', start: 1, end: 6, strand: -1, label: 'c', partial: false }]);
    const renamed = applyAction(p, { type: 'update', id: 's1', patch: { name: 'b' } });
    expect(renamed.sequences[0].features).toHaveLength(1);
    const edited = applyAction(p, { type: 'update', id: 's1', patch: { seq: 'ACGT' } });
    expect(edited.sequences[0].features).toBeUndefined();
    expect(normalizeProject({ ...emptyProject(), sequences: [{ seq: 'ACGT', features: 'nope' }] }).sequences[0].features).toBeUndefined();
  });
});
