// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { create } from 'zustand';
import type { Update } from '@tauri-apps/plugin-updater';
import { useNetworkStore } from '../store/networkStore';
import { networkRefusal } from './networkGate';

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
  // DEX was told to stay off the network: say that, not "check your connection".
  if (raw.includes('(Settings › Network)')) return raw;
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
        if (useNetworkStore.getState().mode !== 'full') throw new Error(networkRefusal());
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

// ---------------------------------------------------------------------------
// Earlier versions (rollback) and automatic checks
// ---------------------------------------------------------------------------

export interface ReleaseVersion { version: string; publishedAt: string | null; notes: string; prerelease: boolean }

type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>;
const nativeInvoke = (): Invoke | null =>
  (window as unknown as { dex?: { invoke?: Invoke } }).dex?.invoke ?? null;

/** -1, 0, 1 for dotted numeric versions ("7.0.10" > "7.0.9"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** Signed DEX releases on GitHub, newest first. */
export async function listReleaseVersions(): Promise<ReleaseVersion[]> {
  const invoke = nativeInvoke();
  if (!invoke) throw new Error('Earlier versions are available in the desktop app.');
  const res = await invoke('update:versions') as { success?: boolean; versions?: ReleaseVersion[]; error?: string } | null;
  if (!res?.success) throw new Error(res?.error || 'DEX could not load the release list.');
  return [...(res.versions ?? [])].sort((x, y) => compareVersions(y.version, x.version));
}

/**
 * Reinstall a published version (rollback when it is older). The native side
 * verifies the installer's signature with the updater's key, starts it in
 * update mode (data kept, DEX relaunches) and quits DEX. On failure nothing
 * changed, and the returned message says why.
 */
export async function installReleaseVersion(version: string): Promise<{ ok: boolean; error?: string }> {
  const invoke = nativeInvoke();
  if (!invoke) return { ok: false, error: 'Install the Windows desktop app to change versions.' };
  try {
    // An older DEX may not read data written by a newer one: snapshot it first
    // (Settings › Storage › Backups restores it). No backup, no version change.
    const backup = await invoke('backup:create', 'manual', `Before installing DEX ${version}`) as { id?: string; success?: boolean; error?: string } | null;
    if (!backup?.id) return { ok: false, error: `DEX could not back up your data first${backup?.error ? ` (${backup.error})` : ''}, so nothing was changed.` };
    const res = await invoke('update:installVersion', version) as { success?: boolean; error?: string } | null;
    return res?.success ? { ok: true } : { ok: false, error: res?.error || 'The installer could not start. Your current version is unchanged.' };
  } catch (e) {
    return { ok: false, error: rawMessage(e) };
  }
}

const AUTO_KEY = 'dex-update-auto-check';
const LAST_KEY = 'dex-update-last-check';
const DAY_MS = 24 * 60 * 60 * 1000;

export function getAutoCheck(): boolean {
  try { return localStorage.getItem(AUTO_KEY) !== '0'; } catch { return true; }
}
export function setAutoCheck(on: boolean): void {
  try { localStorage.setItem(AUTO_KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
}

/**
 * Once a day, a while after start, ask whether a newer DEX exists and say so
 * once (nothing downloads on its own). `notify` is how the caller surfaces it.
 */
export function scheduleAutomaticUpdateCheck(enabled: boolean, onAvailable: (version: string) => void): () => void {
  if (!enabled || !getAutoCheck()) return () => {};
  let last = 0;
  try { last = Number(localStorage.getItem(LAST_KEY)) || 0; } catch { /* storage blocked */ }
  if (Date.now() - last < DAY_MS) return () => {};
  const timer = window.setTimeout(async () => {
    try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch { /* storage blocked */ }
    await useSoftwareUpdate.getState().check();
    const { phase, version } = useSoftwareUpdate.getState();
    if (phase === 'available' && version) onAvailable(version);
  }, 45_000);
  return () => window.clearTimeout(timer);
}
