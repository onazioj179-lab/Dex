// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DEX 5.6 — Imosion (Emotion DAW) Chords & Scales helper. Pure music-theory
// computation behind the new reference panel.
import { describe, it, expect } from 'vitest';
import {
  scaleNotes,
  diatonicChords,
  SCALE_NAMES,
} from '../../src/renderer/DEXAPPLICATIONS/imosion/musicTheory';

describe('scaleNotes', () => {
  it('builds C major', () => {
    expect(scaleNotes('C', 'major')).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  });
  it('builds A natural minor (relative of C major)', () => {
    expect(scaleNotes('A', 'minor')).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  });
  it('builds the C major pentatonic (5 notes)', () => {
    expect(scaleNotes('C', 'pentatonic')).toEqual(['C', 'D', 'E', 'G', 'A']);
  });
  it('wraps correctly from a sharp root', () => {
    expect(scaleNotes('G', 'major')).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#']);
  });
});

describe('diatonicChords', () => {
  it('produces the 7 diatonic triads of C major with correct qualities', () => {
    const chords = diatonicChords('C', 'major');
    expect(chords).toHaveLength(7);
    expect(chords.map(c => c.numeral)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
    expect(chords.map(c => c.name)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'B°']);
    // I = C major triad, vii° = B diminished
    expect(chords[0].notes).toEqual(['C', 'E', 'G']);
    expect(chords[0].quality).toBe('major');
    expect(chords[6].notes).toEqual(['B', 'D', 'F']);
    expect(chords[6].quality).toBe('diminished');
  });

  it('produces the diatonic triads of A minor (i ii° III iv v VI VII)', () => {
    const chords = diatonicChords('A', 'minor');
    expect(chords.map(c => c.name)).toEqual(['Am', 'B°', 'C', 'Dm', 'Em', 'F', 'G']);
    expect(chords[0].quality).toBe('minor');
    expect(chords[1].quality).toBe('diminished');
  });

  it('yields one chord per pentatonic degree (5)', () => {
    expect(diatonicChords('C', 'pentatonic')).toHaveLength(5);
  });

  it('covers every supported scale without throwing', () => {
    for (const scale of SCALE_NAMES) {
      const chords = diatonicChords('D', scale);
      expect(chords.length).toBeGreaterThan(0);
      for (const c of chords) {
        expect(c.notes).toHaveLength(3);
        expect(['major', 'minor', 'diminished', 'augmented']).toContain(c.quality);
      }
    }
  });
});
