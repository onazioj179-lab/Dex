// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { create } from 'zustand';
import type { Update } from '@tauri-apps/plugin-updater';

export type UpdatePhase = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'verifying' | 'ready' | 'installing' | 'error';

interface SoftwareUpdateState {
  phase: UpdatePhase;
  version: string;
  notes: string;
  received: number;
  total?: number;
  error: string;
  check: () => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
}

let candidate: Update | null = null;
const describeError = (error: unknown) => error instanceof Error ? error.message : String(error);

export const useSoftwareUpdate = create<SoftwareUpdateState>((set, get) => ({
  phase: 'idle',
  version: '',
  notes: '',
  received: 0,
  error: '',
  check: async () => {
    if (!['idle', 'current', 'error'].includes(get().phase)) return;
    set({ phase: 'checking', version: '', notes: '', error: '', received: 0, total: undefined });
    try {
      const previous = candidate;
      candidate = null;
      if (previous) await previous.close().catch(() => undefined);
      const { check } = await import('@tauri-apps/plugin-updater');
      candidate = await check({ timeout: 15_000 });
      if (candidate) set({ phase: 'available', version: candidate.version, notes: candidate.body ?? '' });
      else set({ phase: 'current' });
    } catch (error) {
      set({ phase: 'error', error: describeError(error) });
    }
  },
  download: async () => {
    if (get().phase !== 'available' || !candidate) return;
    set({ phase: 'downloading', received: 0, total: undefined });
    try {
      await candidate.download(event => {
        if (event.event === 'Started') set({ total: event.data.contentLength });
        else if (event.event === 'Progress') set(state => ({ received: state.received + event.data.chunkLength }));
        else if (event.event === 'Finished') set({ phase: 'verifying' });
      }, { timeout: 180_000 });
      set({ phase: 'ready' });
    } catch (error) {
      set({ phase: 'error', error: describeError(error) });
    }
  },
  install: async () => {
    if (get().phase !== 'ready' || !candidate) return;
    set({ phase: 'installing' });
    try {
      // On Windows the updater hands off to the installer, which restarts DEX.
      await candidate.install();
    } catch (error) {
      set({ phase: 'error', error: describeError(error) });
    }
  },
}));
