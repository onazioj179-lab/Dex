// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Presentation deck persistence + undo history (pure; unit-tested in
// tests/unit/presentation-deck.test.ts). The app keeps its working deck in
// localStorage; a deck file (.dexdeck.json) is the portable copy.

export const DECK_FORMAT = 'dex-deck';
export const DECK_VERSION = 1;
export const HISTORY_LIMIT = 100;
/** Edits closer together than this (typing, dragging) form one undo step. */
export const HISTORY_COALESCE_MS = 600;

export interface DeckFile<S> {
  format: typeof DECK_FORMAT;
  version: typeof DECK_VERSION;
  theme: string;
  savedAt: string;
  slides: S[];
}

export function serializeDeck<S>(slides: S[], theme: string, now = new Date()): string {
  const file: DeckFile<S> = { format: DECK_FORMAT, version: DECK_VERSION, theme, savedAt: now.toISOString(), slides };
  return JSON.stringify(file, null, 1);
}

/**
 * Read a deck file or the stored working deck. Accepts the file format and the
 * older bare-array form the app has always stored. Throws with a reason.
 */
export function parseDeck<S>(text: string, migrate: (raw: unknown) => S): { slides: S[]; theme: string | null } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('The file is not valid JSON.'); }
  if (Array.isArray(data)) {
    if (!data.length) throw new Error('The deck has no slides.');
    return { slides: data.map(migrate), theme: null };
  }
  const o = (data ?? {}) as Record<string, unknown>;
  if (o.format !== DECK_FORMAT) throw new Error('Not a DEX presentation file.');
  if (o.version !== DECK_VERSION) throw new Error(`Unsupported deck version: ${String(o.version)}.`);
  if (!Array.isArray(o.slides) || !o.slides.length) throw new Error('The deck has no slides.');
  return { slides: o.slides.map(migrate), theme: typeof o.theme === 'string' ? o.theme : null };
}

/**
 * Load the working deck. A stored value that cannot be read is moved aside
 * (never overwritten by the next save) so it can still be recovered.
 */
export function loadWorkingDeck<S>(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  key: string,
  migrate: (raw: unknown) => S,
  now = Date.now(),
): { slides: S[] | null; movedAside: string | null } {
  let raw: string | null = null;
  try { raw = storage?.getItem(key) ?? null; } catch { return { slides: null, movedAside: null }; }
  if (!raw) return { slides: null, movedAside: null };
  try {
    return { slides: parseDeck(raw, migrate).slides, movedAside: null };
  } catch {
    const aside = `${key}.unreadable-${now}`;
    try { storage?.setItem(aside, raw); return { slides: null, movedAside: aside }; } catch { return { slides: null, movedAside: null }; }
  }
}

export type SaveOutcome = { ok: true; bytes: number } | { ok: false; reason: 'quota' | 'unavailable' };

export function saveWorkingDeck(storage: Pick<Storage, 'setItem'> | null, key: string, slides: unknown[]): SaveOutcome {
  if (!storage) return { ok: false, reason: 'unavailable' };
  const text = JSON.stringify(slides);
  try {
    storage.setItem(key, text);
    return { ok: true, bytes: text.length };
  } catch (e) {
    const name = (e as { name?: string })?.name ?? '';
    return { ok: false, reason: /quota/i.test(name) || /quota/i.test(String((e as Error)?.message)) ? 'quota' : 'unavailable' };
  }
}

// ---------------------------------------------------------------------------
// Undo history: snapshots of the whole slide list, coalesced in time.
// ---------------------------------------------------------------------------

export interface DeckHistory<S> {
  past: S[][];
  future: S[][];
  /** The state the next recorded change departs from. */
  base: S[];
  lastAt: number;
}

export function historyStart<S>(slides: S[]): DeckHistory<S> {
  return { past: [], future: [], base: slides, lastAt: 0 };
}

/** Record that the deck changed to `next`. Rapid changes join the previous step. */
export function historyRecord<S>(h: DeckHistory<S>, next: S[], now: number): DeckHistory<S> {
  if (next === h.base) return h;
  const joins = h.past.length > 0 && now - h.lastAt < HISTORY_COALESCE_MS;
  const past = joins ? h.past : [...h.past, h.base].slice(-HISTORY_LIMIT);
  return { past, future: [], base: next, lastAt: now };
}

export function historyUndo<S>(h: DeckHistory<S>): { h: DeckHistory<S>; slides: S[] } | null {
  if (!h.past.length) return null;
  const prev = h.past[h.past.length - 1];
  return { h: { past: h.past.slice(0, -1), future: [h.base, ...h.future], base: prev, lastAt: 0 }, slides: prev };
}

export function historyRedo<S>(h: DeckHistory<S>): { h: DeckHistory<S>; slides: S[] } | null {
  if (!h.future.length) return null;
  const next = h.future[0];
  return { h: { past: [...h.past, h.base].slice(-HISTORY_LIMIT), future: h.future.slice(1), base: next, lastAt: 0 }, slides: next };
}
