// =============================================================================
// DEX Platform — Track G1: Music library + queue
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
export interface Track {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  durationSec: number;
  /** Path or BlobStore sha. */
  source: { kind: 'path'; path: string } | { kind: 'blob'; sha256: string };
  /** Bitrate kbps if known. */
  bitrateKbps?: number;
  /** True if source supports gapless boundaries (FLAC/ALAC/wav). */
  gaplessCapable: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  /** True for system-managed lists (Recently Played, etc.). */
  smart: boolean;
}

export type RepeatMode = 'off' | 'one' | 'all';

export interface QueueState {
  upcoming: string[];
  current?: string;
  history: string[];
  shuffle: boolean;
  repeat: RepeatMode;
}

export function makeQueue(): QueueState {
  return { upcoming: [], history: [], shuffle: false, repeat: 'off' };
}

export function enqueue(q: QueueState, trackId: string): QueueState {
  return { ...q, upcoming: [...q.upcoming, trackId] };
}

export function next(q: QueueState): QueueState {
  if (!q.current && q.upcoming.length === 0) return q;
  if (q.repeat === 'one' && q.current) return q;
  const newHistory = q.current ? [...q.history, q.current] : q.history;
  if (q.upcoming.length === 0) {
    if (q.repeat === 'all' && newHistory.length > 0) {
      // Wrap: history back into upcoming.
      const nextSrc = q.shuffle ? shuffle(newHistory) : newHistory;
      return { ...q, current: nextSrc[0], upcoming: nextSrc.slice(1), history: [] };
    }
    return { ...q, current: undefined, history: newHistory };
  }
  const upcoming = q.shuffle ? shuffle(q.upcoming) : q.upcoming;
  return { ...q, current: upcoming[0], upcoming: upcoming.slice(1), history: newHistory };
}

export function prev(q: QueueState): QueueState {
  if (q.history.length === 0) return q;
  const last = q.history[q.history.length - 1]!;
  const newHistory = q.history.slice(0, -1);
  const upcoming = q.current ? [q.current, ...q.upcoming] : q.upcoming;
  return { ...q, current: last, upcoming, history: newHistory };
}

function shuffle<T>(arr: ReadonlyArray<T>): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    // Deterministic-ish using index hash so tests can assert order.
    const j = Math.floor(((i * 2654435761) >>> 0) % (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Cross-fade duration recommended for two adjacent tracks. */
export function gaplessOrCrossfadeMs(a: Track, b: Track): { mode: 'gapless' | 'crossfade'; ms: number } {
  if (a.gaplessCapable && b.gaplessCapable) return { mode: 'gapless', ms: 0 };
  return { mode: 'crossfade', ms: 1500 };
}
