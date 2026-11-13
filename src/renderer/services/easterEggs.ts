// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Hidden easter eggs. Each one counts once toward the `easterEggsFound`
// achievement stat (the "Egg Hunter" achievements existed, but nothing ever
// counted an egg, so they could never unlock).
//
// The eggs:
//   konami       ↑ ↑ ↓ ↓ ← → ← → B A anywhere outside a text field: credits card
//   version-tap  click the version in Settings › About seven times quickly
//   uki-42       ask UKI about the meaning of life
//   uki-dance    ask UKI to dance

export const EASTER_EGG_IDS = ['konami', 'version-tap', 'uki-42', 'uki-dance'] as const;
export type EasterEggId = (typeof EASTER_EGG_IDS)[number];

const FOUND_KEY = 'dex-easter-eggs-found';
/** Window event the credits card listens for: detail = { id }. */
export const EASTER_EGG_EVENT = 'dex-easter-egg';

export const KONAMI = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a',
] as const;

function readFound(): Set<string> {
  try {
    const raw = localStorage.getItem(FOUND_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function foundEasterEggs(): EasterEggId[] {
  const found = readFound();
  return EASTER_EGG_IDS.filter((id) => found.has(id));
}

/**
 * Mark an egg found. The first discovery bumps the achievement stat; every
 * discovery fires EASTER_EGG_EVENT so the shell can react. Returns true the
 * first time.
 */
export function discoverEasterEgg(id: EasterEggId): boolean {
  const found = readFound();
  const isNew = !found.has(id);
  if (isNew) {
    found.add(id);
    try { localStorage.setItem(FOUND_KEY, JSON.stringify([...found])); } catch { /* storage full/blocked */ }
    try { window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'easterEggsFound', amount: 1 } })); } catch { /* noop */ }
  }
  try { window.dispatchEvent(new CustomEvent(EASTER_EGG_EVENT, { detail: { id, isNew } })); } catch { /* noop */ }
  return isNew;
}

/**
 * Feed one key into a Konami matcher. Returns the new progress (0..KONAMI.length);
 * reaching KONAMI.length means the code was entered. A wrong key restarts, but
 * counts as the first key when it is one.
 */
export function konamiStep(progress: number, key: string): number {
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (k === KONAMI[progress]) return progress + 1;
  // "↑ ↑ ↑ ↓…" must still match: a repeated ↑ keeps two ↑ of progress.
  if (progress === 2 && k === 'ArrowUp') return 2;
  return k === KONAMI[0] ? 1 : 0;
}

/** Counts rapid taps; `tap()` returns true on the Nth tap within `windowMs`. */
export function createTapCounter(n = 7, windowMs = 3000, now: () => number = () => Date.now()) {
  let times: number[] = [];
  return {
    tap(): boolean {
      const t = now();
      times = times.filter((x) => t - x <= windowMs);
      times.push(t);
      if (times.length >= n) { times = []; return true; }
      return false;
    },
  };
}
