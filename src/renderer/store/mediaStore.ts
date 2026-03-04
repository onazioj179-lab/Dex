// ═══════════════════════════════════════════════════════════════════════════
// DEX - Global Media State Store
// Tracks media playback state across all media pages (Audio, Video, Gallery)
// ═══════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';

export type MediaType = 'audio' | 'video' | 'gallery' | null;

interface MediaState {
  // Current playback state
  isPlaying: boolean;
  currentMediaType: MediaType;
  currentMediaId: string | null;
  currentMediaTitle: string | null;
  
  // Progress
  currentTime: number;
  duration: number;
  
  // Volume
  volume: number;
  muted: boolean;
  
  // Actions
  setPlaying: (isPlaying: boolean, mediaType?: MediaType) => void;
  setCurrentMedia: (id: string | null, title: string | null, type: MediaType) => void;
  setProgress: (currentTime: number, duration: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  stop: () => void;
}

export const useMediaStore = create<MediaState>((set) => ({
  isPlaying: false,
  currentMediaType: null,
  currentMediaId: null,
  currentMediaTitle: null,
  currentTime: 0,
  duration: 0,
  volume: 1,
  muted: false,

  setPlaying: (isPlaying, mediaType) => set((state) => ({
    isPlaying,
    currentMediaType: mediaType ?? state.currentMediaType,
  })),

  setCurrentMedia: (id, title, type) => set({
    currentMediaId: id,
    currentMediaTitle: title,
    currentMediaType: type,
  }),

  setProgress: (currentTime, duration) => set({
    currentTime,
    duration,
  }),

  setVolume: (volume) => set({ volume }),

  setMuted: (muted) => set({ muted }),

  stop: () => set({
    isPlaying: false,
    currentMediaId: null,
    currentMediaTitle: null,
    currentTime: 0,
    duration: 0,
  }),
}));
