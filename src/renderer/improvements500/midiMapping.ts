// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * MIDI controller mapping (T3-021).
 */

export interface MidiBinding {
  /** MIDI controller number (0..127). */
  cc: number;
  /** MIDI channel (0..15). */
  channel: number;
  /** Target parameter id. */
  param: string;
  /** Optional value mapping. */
  min?: number;
  max?: number;
}

const STORAGE_KEY = 'dex:midi:bindings';

function isBrowser(): boolean { return typeof localStorage !== 'undefined'; }

export function loadBindings(): MidiBinding[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? (arr as MidiBinding[]) : [];
  } catch { return []; }
}

export function saveBindings(list: readonly MidiBinding[]): void {
  if (!isBrowser()) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* quota */ }
}

export function addBinding(b: MidiBinding): MidiBinding[] {
  const list = loadBindings().filter((x) => !(x.cc === b.cc && x.channel === b.channel));
  list.push(b);
  saveBindings(list);
  return list;
}

export function removeBinding(cc: number, channel: number): MidiBinding[] {
  const list = loadBindings().filter((x) => !(x.cc === cc && x.channel === channel));
  saveBindings(list);
  return list;
}

/** Map an incoming MIDI CC value (0..127) through a binding to the param range. */
export function mapCcValue(value: number, b: MidiBinding): number {
  const v = Math.max(0, Math.min(127, value)) / 127;
  const min = b.min ?? 0;
  const max = b.max ?? 1;
  return min + v * (max - min);
}

/** Find the binding for a given (channel, cc). */
export function findBinding(channel: number, cc: number, list: readonly MidiBinding[] = loadBindings()): MidiBinding | undefined {
  return list.find((b) => b.channel === channel && b.cc === cc);
}

/** Test helper. */
export function _clear(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(STORAGE_KEY);
}
