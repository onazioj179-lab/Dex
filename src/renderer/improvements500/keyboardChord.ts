// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Keyboard chord parser and matcher. Accepts strings like "Ctrl+Shift+K"
 * (case-insensitive) and tells whether a KeyboardEvent matches.
 */

export interface ParsedChord {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  /** Lowercased physical key (e.g. "k", "arrowdown", "/", "escape"). */
  key: string;
}

const MOD_ALIASES: Record<string, keyof Omit<ParsedChord, 'key'>> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  alt: 'alt',
  option: 'alt',
  shift: 'shift',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
  win: 'meta',
  super: 'meta',
};

export function parseChord(input: string): ParsedChord {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('parseChord: empty input');
  const parts = trimmed.split('+').map((p) => p.trim().toLowerCase()).filter((p) => p.length > 0);
  if (parts.length === 0) throw new Error('parseChord: invalid input');
  const result: ParsedChord = { ctrl: false, alt: false, shift: false, meta: false, key: '' };
  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i];
    const mod = MOD_ALIASES[p];
    if (mod && i < parts.length - 1) {
      result[mod] = true;
    } else if (i === parts.length - 1) {
      result.key = p;
    } else if (mod) {
      result[mod] = true;
    } else {
      throw new Error(`parseChord: unknown token "${p}"`);
    }
  }
  if (!result.key) throw new Error('parseChord: missing key');
  return result;
}

export function matchChord(event: KeyboardEvent, chord: ParsedChord | string): boolean {
  const c = typeof chord === 'string' ? parseChord(chord) : chord;
  if (event.ctrlKey !== c.ctrl) return false;
  if (event.altKey !== c.alt) return false;
  if (event.shiftKey !== c.shift) return false;
  if (event.metaKey !== c.meta) return false;
  return event.key.toLowerCase() === c.key;
}

export function chordToString(c: ParsedChord): string {
  const parts: string[] = [];
  if (c.ctrl) parts.push('Ctrl');
  if (c.alt) parts.push('Alt');
  if (c.shift) parts.push('Shift');
  if (c.meta) parts.push('Meta');
  parts.push(c.key.length === 1 ? c.key.toUpperCase() : c.key);
  return parts.join('+');
}
