// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Now-Playing coordination store.
 * -----------------------------------------------------------------------------
 * A thin, engine-agnostic bridge between whatever is actually producing audio
 * (today: the Audio app, which owns the real Web Audio graph — EQ, analyser,
 * crossfade) and the global floating MiniPlayer. The Audio page PUBLISHES its
 * current track + transport state here and REGISTERS its transport controls;
 * the MiniPlayer reads the state and drives those same controls. This keeps a
 * single source of truth and a single audio engine (no duplicate <audio>
 * elements) while letting the user keep control of playback from anywhere in
 * DEX — the Audio app stays mounted in the background, so its element keeps
 * playing when you switch away and the MiniPlayer remains a live remote.
 */

import { create } from 'zustand';

export interface NowPlayingTrack {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  artwork?: string;
}

/** Transport controls the active audio engine registers. */
export interface NowPlayingEngine {
  toggle: () => void;
  next: () => void;
  prev: () => void;
  /** Seek to a 0–100 percentage of the current track. */
  seekPct: (pct: number) => void;
}

interface NowPlayingState {
  track: NowPlayingTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  /** User dismissed the MiniPlayer; re-shown when a new track starts. */
  dismissed: boolean;
  engine: NowPlayingEngine | null;

  // --- published by the active engine ---
  publish: (s: Partial<Pick<NowPlayingState, 'track' | 'isPlaying' | 'currentTime' | 'duration'>>) => void;
  registerEngine: (e: NowPlayingEngine) => void;
  unregisterEngine: () => void;

  // --- driven by the MiniPlayer UI ---
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seekPct: (pct: number) => void;
  dismiss: () => void;
}

export const useNowPlaying = create<NowPlayingState>((set, get) => ({
  track: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  dismissed: false,
  engine: null,

  publish: (s) => set((prev) => {
    // A new track un-dismisses the MiniPlayer so it returns into view.
    const next: Partial<NowPlayingState> = { ...s };
    if (s.track && s.track.id !== prev.track?.id) next.dismissed = false;
    return next as NowPlayingState;
  }),
  registerEngine: (e) => set({ engine: e }),
  // Only clear if THIS engine is still the registered one (guards remount races).
  unregisterEngine: () => set((prev) => (prev.engine ? { engine: null } : {})),

  toggle: () => get().engine?.toggle(),
  next: () => get().engine?.next(),
  prev: () => get().engine?.prev(),
  seekPct: (pct) => get().engine?.seekPct(pct),
  dismiss: () => {
    // Pause if playing, then hide. The track stays so the next play re-shows it.
    if (get().isPlaying) get().engine?.toggle();
    set({ dismissed: true });
  },
}));

// Debug handle (parity with DEX's other __dex* hooks) for diagnostics/E2E.
if (typeof window !== 'undefined') {
  (window as unknown as { __dexNowPlaying?: typeof useNowPlaying }).__dexNowPlaying = useNowPlaying;
}
