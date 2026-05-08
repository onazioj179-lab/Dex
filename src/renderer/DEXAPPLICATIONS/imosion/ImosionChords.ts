/**
 * DEX Platform - IMOSION Chord Trigger Helper
 * Diatonic chord generation for the Chord Trigger panel.
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

const MAJOR_NUMERALS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii\u00B0'];
const MINOR_NUMERALS = ['i', 'ii\u00B0', 'III', 'iv', 'v', 'VI', 'VII'];

export interface DiatonicChord {
  numeral: string;
  name: string;
  pitches: number[];
  quality: 'major' | 'minor' | 'diminished' | 'augmented';
}

function chordQuality(third: number, fifth: number): DiatonicChord['quality'] {
  // intervals from root, in semitones
  if (third === 4 && fifth === 7) return 'major';
  if (third === 3 && fifth === 7) return 'minor';
  if (third === 3 && fifth === 6) return 'diminished';
  if (third === 4 && fifth === 8) return 'augmented';
  return 'major';
}

function chordSuffix(quality: DiatonicChord['quality'], includeSeventh: boolean): string {
  switch (quality) {
    case 'major': return includeSeventh ? 'maj7' : '';
    case 'minor': return includeSeventh ? 'm7' : 'm';
    case 'diminished': return includeSeventh ? 'm7\u266D5' : 'dim';
    case 'augmented': return includeSeventh ? 'aug7' : 'aug';
  }
}

/**
 * Build the seven diatonic triads (or seventh chords) for a given root pitch and mode.
 * Returns roman numeral, chord name, pitches (MIDI numbers) and quality for each scale degree.
 */
export function getDiatonicChords(
  rootPitch: number,
  mode: 'major' | 'minor',
  includeSeventh: boolean,
): DiatonicChord[] {
  const scale = mode === 'major' ? MAJOR_SCALE : MINOR_SCALE;
  const numerals = mode === 'major' ? MAJOR_NUMERALS : MINOR_NUMERALS;
  const chords: DiatonicChord[] = [];

  for (let degree = 0; degree < 7; degree++) {
    const rootSemitone = scale[degree];
    // third and fifth are scale[degree+2] and scale[degree+4], mod-12 corrected
    const thirdSemitone = scale[(degree + 2) % 7] + (degree + 2 >= 7 ? 12 : 0);
    const fifthSemitone = scale[(degree + 4) % 7] + (degree + 4 >= 7 ? 12 : 0);
    const seventhSemitone = scale[(degree + 6) % 7] + (degree + 6 >= 7 ? 12 : 0);

    const thirdInterval = (thirdSemitone - rootSemitone + 12) % 12;
    const fifthInterval = (fifthSemitone - rootSemitone + 12) % 12;
    const quality = chordQuality(thirdInterval, fifthInterval);

    const pitches: number[] = [
      rootPitch + rootSemitone,
      rootPitch + thirdSemitone,
      rootPitch + fifthSemitone,
    ];
    if (includeSeventh) pitches.push(rootPitch + seventhSemitone);

    const rootName = NOTE_NAMES[(rootPitch + rootSemitone) % 12];
    chords.push({
      numeral: numerals[degree],
      name: `${rootName}${chordSuffix(quality, includeSeventh)}`,
      pitches,
      quality,
    });
  }

  return chords;
}

/** Convert a MIDI pitch number to its frequency in Hz (A4 = 440). */
export function midiToFrequency(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}
