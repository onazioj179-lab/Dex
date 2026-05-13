// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * MIDI <-> frequency (Hz) conversion. Reference is A4 = 69 = 440 Hz.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function midiToFrequency(midi: number, referenceA4 = 440): number {
  return referenceA4 * 2 ** ((midi - 69) / 12);
}

export function frequencyToMidi(hz: number, referenceA4 = 440): number {
  if (hz <= 0) return Number.NaN;
  return 69 + 12 * Math.log2(hz / referenceA4);
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToNoteName(midi: number): string {
  const m = Math.round(midi);
  const octave = Math.floor(m / 12) - 1;
  const name = NOTE_NAMES[((m % 12) + 12) % 12]!;
  return `${name}${octave}`;
}
