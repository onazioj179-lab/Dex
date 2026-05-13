// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Convert between MIDI note numbers and frequencies (Hz). MIDI note
 * 69 corresponds to A4 = 440 Hz by convention.
 */

const A4_FREQ = 440;
const A4_NOTE = 69;

export function midiNoteToFreq(note: number): number {
  return A4_FREQ * Math.pow(2, (note - A4_NOTE) / 12);
}

export function freqToMidiNote(freq: number): number {
  if (freq <= 0) return -1;
  return A4_NOTE + 12 * Math.log2(freq / A4_FREQ);
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiNoteName(note: number): string {
  const n = ((note % 12) + 12) % 12;
  const octave = Math.floor(note / 12) - 1;
  return `${NOTE_NAMES[n]}${octave}`;
}
