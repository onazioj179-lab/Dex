// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { create } from 'zustand';
import type { Update } from '@tauri-apps/plugin-updater';

export type UpdatePhase = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'verifying' | 'ready' | 'installing' | 'error';
/** The step that failed, so Try again resumes there instead of starting over. */
export type UpdateStep = 'check' | 'download' | 'install';

interface SoftwareUpdateState {
  phase: UpdatePhase;
  version: string;
  notes: string;
  received: number;
  total?: number;
  /** Plain-language explanation of the failure (what happened, what did not). */
  error: string;
  /** The updater's own message, for support. */
  errorDetail: string;
  failedStep: UpdateStep | null;
  check: () => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
  /** Retry the step that failed: a failed download re-downloads the same update. */
  retry: () => Promise<void>;
}

let candidate: Update | null = null;
const rawMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

/**
 * What the user sees for a failure. The updater (tauri-plugin-updater) verifies
 * the minisign signature before anything is installed, so a signature failure
 * means nothing changed on disk; say so rather than echoing the raw error.
 */
export function describeUpdateError(step: UpdateStep, error: unknown): string {
  const raw = rawMessage(error);
  if (/signature|minisign|public key|pubkey/i.test(raw)) {
    return 'The update failed its signature check, so it was not installed. Your current version is unchanged.';
  }
  if (/space|disk full|ENOSPC|0x80070070/i.test(raw)) {
    return 'There is not enough free disk space for the update. Free some space and try again.';
  }
  if (/offline|network|dns|resolve|connect|timed? ?out|timeout|fetch|request|reset|unreachable|50[234]|404/i.test(raw)) {
    if (step === 'check') return 'DEX could not reach the update server. Check your connection and try again.';
    if (step === 'download') return 'The download was interrupted. Nothing was installed; try again to restart it.';
  }
  if (step === 'install') return 'The installer could not start. Your current version is unchanged.';
  if (step === 'download') return 'The update could not be downloaded. Nothing was installed.';
  return 'DEX could not check for updates.';
}

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export const useSoftwareUpdate = create<SoftwareUpdateState>((set, get) => {
  const fail = (step: UpdateStep, error: unknown) =>
    set({ phase: 'error', failedStep: step, error: describeUpdateError(step, error), errorDetail: rawMessage(error) });

  return {
    phase: 'idle',
    version: '',
    notes: '',
    received: 0,
    error: '',
    errorDetail: '',
    failedStep: null,
    check: async () => {
      if (!['idle', 'current', 'error'].includes(get().phase)) return;
      set({ phase: 'checking', version: '', notes: '', error: '', errorDetail: '', failedStep: null, received: 0, total: undefined });
      try {
        if (offline()) throw new Error('offline');
        const previous = candidate;
        candidate = null;
        if (previous) await previous.close().catch(() => undefined);
        const { check } = await import('@tauri-apps/plugin-updater');
        candidate = await check({ timeout: 15_000 });
        if (candidate) set({ phase: 'available', version: candidate.version, notes: candidate.body ?? '' });
        else set({ phase: 'current' });
      } catch (error) {
        fail('check', error);
      }
    },
    download: async () => {
      if (get().phase !== 'available' || !candidate) return;
      set({ phase: 'downloading', received: 0, total: undefined, error: '', errorDetail: '', failedStep: null });
      try {
        if (offline()) throw new Error('offline');
        await candidate.download(event => {
          if (event.event === 'Started') set({ total: event.data.contentLength });
          else if (event.event === 'Progress') set(state => ({ received: state.received + event.data.chunkLength }));
          else if (event.event === 'Finished') set({ phase: 'verifying' });
        }, { timeout: 180_000 });
        set({ phase: 'ready' });
      } catch (error) {
        fail('download', error);
      }
    },
    install: async () => {
      if (get().phase !== 'ready' || !candidate) return;
      set({ phase: 'installing' });
      try {
        // On Windows the updater hands off to the installer, which restarts DEX.
        await candidate.install();
      } catch (error) {
        fail('install', error);
      }
    },
    retry: async () => {
      const { phase, failedStep } = get();
      if (phase !== 'error') return;
      if (failedStep === 'download' && candidate) {
        set({ phase: 'available' });
        return get().download();
      }
      if (failedStep === 'install' && candidate) {
        // The downloaded, verified package is still held by the plugin.
        set({ phase: 'ready' });
        return get().install();
      }
      return get().check();
    },
  };
});
