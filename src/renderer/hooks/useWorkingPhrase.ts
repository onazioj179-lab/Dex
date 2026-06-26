// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// useWorkingPhrase — the app-agnostic distillation of UKI's spinner verbs.
//
// Across DEX, long operations showed one frozen word ("Exporting…",
// "Running…", "Encrypting…"). A static label can't tell a 200ms task from a
// 30s one — it just sits there and reads as "stuck". This rotates a curated
// pool of present-participle phrases for the *kind* of work in progress, so the
// status feels alive and a touch more honest about what's happening, the same
// way a good assistant narrates itself. Pure selector + thin React hook; no
// per-app state, no dependencies beyond React.
//
// UKI keeps its own richer, thought-step-aware engine in `uki/spinnerVerbs.ts`;
// this is the lightweight version every other app can drop in by `kind`.

import { useEffect, useState } from 'react';

export type WorkKind =
  | 'export' | 'encode' | 'extract' | 'join' | 'render'
  | 'encrypt' | 'decrypt' | 'restore' | 'save' | 'run'
  | 'simulate' | 'sync' | 'search' | 'fetch' | 'generic';

// Pools lead with the plain verb (so the very first frame reads exactly like
// the old static label) and then drift into more descriptive phrasing.
const POOLS: Record<WorkKind, readonly string[]> = {
  export:   ['Exporting', 'Finalizing output', 'Packaging it up', 'Writing the file', 'Wrapping up'],
  encode:   ['Encoding', 'Re-encoding streams', 'Compressing', 'Optimizing output', 'Crunching frames'],
  extract:  ['Extracting', 'Decoding audio', 'Pulling the track', 'Separating streams'],
  join:     ['Joining', 'Stitching clips', 'Splicing', 'Re-encoding the seam'],
  render:   ['Rendering', 'Mixing it down', 'Bouncing', 'Drawing frames'],
  encrypt:  ['Encrypting', 'Securing with AES-256', 'Sealing the vault', 'Locking it down'],
  decrypt:  ['Decrypting', 'Unsealing', 'Verifying integrity', 'Unlocking'],
  restore:  ['Restoring', 'Rebuilding', 'Putting it back'],
  save:     ['Saving', 'Writing changes', 'Committing to disk'],
  run:      ['Running', 'Executing', 'Crunching', 'Working it out'],
  simulate: ['Simulating', 'Stepping physics', 'Solving', 'Crunching the math'],
  sync:     ['Syncing', 'Writing files', 'Reconciling'],
  search:   ['Searching', 'Looking', 'Scanning', 'Digging through', 'Hunting it down'],
  fetch:    ['Fetching', 'Loading', 'Pulling it in', 'Reaching out'],
  generic:  ['Working', 'Processing', 'One moment', 'Crunching'],
};

/**
 * Pure selector: the phrase for a given work kind at a given tick. Deterministic
 * and safe to call during render; tick wraps (incl. negative) within the pool.
 */
export function workingPhrase(kind: WorkKind, tick: number): string {
  const pool = POOLS[kind] ?? POOLS.generic;
  const i = ((tick % pool.length) + pool.length) % pool.length;
  return pool[i];
}

/** How long each phrase stays before rotating, in ms. */
const ROTATE_MS = 1700;

/**
 * Rotate a work phrase while `active`. Returns '' when inactive so callers can
 * fall back to their own idle label. The tick resets when work stops, so the
 * next run starts at the plain verb rather than mid-rotation.
 */
export function useWorkingPhrase(active: boolean, kind: WorkKind, intervalMs: number = ROTATE_MS): string {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) { setTick(0); return; }
    const id = setInterval(() => setTick(t => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return active ? workingPhrase(kind, tick) : '';
}
