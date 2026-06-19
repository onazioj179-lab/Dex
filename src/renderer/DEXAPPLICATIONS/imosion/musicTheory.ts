/**
 * DEX Platform - IMOSION Chords & Scales Helper (pure music theory)
 * Self-contained, dependency-free computation for the Chords & Scales panel.
 * Pure functions only: no audio engine, no React, no I/O. Unit-testable.
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */

/** The twelve chromatic pitch classes, sharp spelling, index 0 == C. */
export const CHROMATIC_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export type RootNote = typeof CHROMATIC_NOTES[number];

/** Scale identifiers understood by this helper. */
export type ScaleName =
  | 'major'
  | 'minor'
  | 'dorian'
  | 'phrygian'
  | 'mixolydian'
  | 'harmonicMinor'
  | 'pentatonic';

/** Semitone offsets from the root for each supported scale. */
export const SCALE_STEPS: Record<ScaleName, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  pentatonic: [0, 2, 4, 7, 9],
};

/** Human-readable label for each scale, for use in dropdowns. */
export const SCALE_LABELS: Record<ScaleName, string> = {
  major: 'Major',
  minor: 'Minor',
  dorian: 'Dorian',
  phrygian: 'Phrygian',
  mixolydian: 'Mixolydian',
  harmonicMinor: 'Harmonic Minor',
  pentatonic: 'Pentatonic',
};

/** Ordered list of supported scale ids (matches SCALE_STEPS keys). */
export const SCALE_NAMES = Object.keys(SCALE_STEPS) as ScaleName[];

export type ChordQuality = 'major' | 'minor' | 'diminished' | 'augmented';

export interface DiatonicChordInfo {
  /** Roman-numeral degree, e.g. 'I', 'ii', 'vii°'. */
  numeral: string;
  /** Chord name with quality suffix, e.g. 'C', 'Dm', 'B°'. */
  name: string;
  /** Note names of the triad, root first, e.g. ['C', 'E', 'G']. */
  notes: RootNote[];
  /** Pitch-class indices (0-11) of the triad, root first. */
  pitchClasses: number[];
  /** Triad quality derived from the third and fifth intervals. */
  quality: ChordQuality;
}

/** Pitch-class index (0-11) for a root note, or 0 if the name is unknown. */
function rootIndex(root: RootNote): number {
  const idx = CHROMATIC_NOTES.indexOf(root);
  return idx >= 0 ? idx : 0;
}

/** Roman numeral for a scale degree, cased and marked to match its quality. */
function degreeNumeral(degree: number, quality: ChordQuality): string {
  const base = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][degree] ?? '';
  switch (quality) {
    case 'major': return base;
    case 'augmented': return `${base}+`;
    case 'minor': return base.toLowerCase();
    case 'diminished': return `${base.toLowerCase()}°`;
  }
}

/** Quality suffix appended to a chord's root name. */
function qualitySuffix(quality: ChordQuality): string {
  switch (quality) {
    case 'major': return '';
    case 'minor': return 'm';
    case 'diminished': return '°';
    case 'augmented': return '+';
  }
}

/** Derive a triad quality from its third and fifth intervals (semitones from root). */
function triadQuality(third: number, fifth: number): ChordQuality {
  if (third === 4 && fifth === 7) return 'major';
  if (third === 3 && fifth === 7) return 'minor';
  if (third === 3 && fifth === 6) return 'diminished';
  if (third === 4 && fifth === 8) return 'augmented';
  // Fall back to thirds when the fifth is non-standard (e.g. some modal degrees).
  return third <= 3 ? 'minor' : 'major';
}

/**
 * Notes of a scale starting on the given root.
 * @returns ordered note names, root first, e.g. scaleNotes('C', 'major') -> ['C','D','E','F','G','A','B'].
 */
export function scaleNotes(root: RootNote, scale: ScaleName): RootNote[] {
  const steps = SCALE_STEPS[scale] ?? SCALE_STEPS.major;
  const base = rootIndex(root);
  return steps.map(step => CHROMATIC_NOTES[(base + step) % 12]);
}

/**
 * Diatonic triads built by stacking thirds within the scale for each degree.
 * Returns one chord per scale degree (7 for heptatonic scales, 5 for pentatonic),
 * each with its roman numeral, name, note names, pitch classes and quality.
 */
export function diatonicChords(root: RootNote, scale: ScaleName): DiatonicChordInfo[] {
  const steps = SCALE_STEPS[scale] ?? SCALE_STEPS.major;
  const base = rootIndex(root);
  const len = steps.length;
  const chords: DiatonicChordInfo[] = [];

  for (let degree = 0; degree < len; degree++) {
    const rootStep = steps[degree];
    const thirdStep = steps[(degree + 2) % len] + (degree + 2 >= len ? 12 : 0);
    const fifthStep = steps[(degree + 4) % len] + (degree + 4 >= len ? 12 : 0);

    const thirdInterval = (thirdStep - rootStep + 120) % 12;
    const fifthInterval = (fifthStep - rootStep + 120) % 12;
    const quality = triadQuality(thirdInterval, fifthInterval);

    const pitchClasses = [
      (base + rootStep) % 12,
      (base + thirdStep) % 12,
      (base + fifthStep) % 12,
    ];
    const notes = pitchClasses.map(pc => CHROMATIC_NOTES[pc]);

    chords.push({
      numeral: degreeNumeral(degree, quality),
      name: `${notes[0]}${qualitySuffix(quality)}`,
      notes,
      pitchClasses,
      quality,
    });
  }

  return chords;
}
