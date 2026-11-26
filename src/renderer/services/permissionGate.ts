// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// The one door to the microphone, camera, screen and location.
//
// Settings › Privacy & Security has a switch for each, but only some callers
// looked at it: a recorder, an editor or Maps could capture with its switch
// off. `installPermissionGate` wraps the browser entry points once, at boot, so
// every caller (present and future) goes through the same rule:
//
//   switch on   -> the request runs as before
//   switch off  -> DEX asks; "Allow" turns the switch on, "Don't Allow" fails
//                  the request with the standard NotAllowedError
//   turned off  -> captures already running are stopped
//
// It also counts live captures, which drives the "in use" cue in the top bar.
// The WebView2 policy (webview_permissions.rs) still applies underneath.

import { create } from 'zustand';
import {
  usePermissionStore, checkPermissionAccess, PERMISSION_LABELS, type PermissionId,
} from '../store/permissionStore';
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';
import { dexConfirm } from '../components/dexConfirm';

/** Live captures per permission (0 or missing = not in use). */
export const useCaptureStore = create<{ live: Partial<Record<PermissionId, number>> }>(() => ({ live: {} }));

export type PermissionAsker = (ids: PermissionId[], requester: string) => Promise<boolean>;

/** After "Don't Allow", answer the same request without asking again for a moment. */
const DENY_QUIET_MS = 10_000;
const KEEP_ALIVE_MS = 30_000;

const defaultAsker: PermissionAsker = (ids, requester) => {
  const what = ids.map((id) => PERMISSION_LABELS[id].toLowerCase()).join(' and ');
  return dexConfirm({
    title: `Allow access to your ${what}?`,
    message: `Requested ${requester ? `while you were using ${requester}` : 'by DEX'}. You can turn it off at any time in Settings › Privacy & Security.`,
    confirmLabel: 'Allow',
    cancelLabel: "Don't Allow",
  });
};

let asker: PermissionAsker = defaultAsker;
export function setPermissionAsker(next: PermissionAsker | null): void {
  asker = next ?? defaultAsker;
}

const pending = new Map<string, Promise<boolean>>();
const deniedAt = new Map<string, number>();

function frontApp(): string {
  try {
    const id = useRunningApps.getState().currentAppId;
    return (id && id !== 'home' && APP_DEFINITIONS[id]?.name) || '';
  } catch {
    return '';
  }
}

const isOn = (id: PermissionId): boolean => usePermissionStore.getState().permissions[id]?.enabled === true;

/**
 * Make sure every id is allowed, asking the user for the ones that are off.
 * Resolves true only when all of them are on.
 */
export function requestPermission(ids: PermissionId[], requester = frontApp()): Promise<boolean> {
  const missing = ids.filter((id) => !checkPermissionAccess(id, requester || 'dex'));
  if (missing.length === 0) return Promise.resolve(true);
  const key = [...missing].sort().join('+');
  const running = pending.get(key);
  if (running) return running;
  if (Date.now() - (deniedAt.get(key) ?? -Infinity) < DENY_QUIET_MS) return Promise.resolve(false);
  const asked = asker(missing, requester)
    .then((ok) => {
      if (!ok) { deniedAt.set(key, Date.now()); return false; }
      deniedAt.delete(key);
      for (const id of missing) usePermissionStore.getState().setPermission(id, true);
      return true;
    })
    .finally(() => { pending.delete(key); });
  pending.set(key, asked);
  return asked;
}

const denied = (): Error => {
  const message = 'Permission is off in Settings › Privacy & Security.';
  try { return new DOMException(message, 'NotAllowedError'); } catch { const e = new Error(message); e.name = 'NotAllowedError'; return e; }
};

// ---------------------------------------------------------------------------
// Live captures
// ---------------------------------------------------------------------------

const liveTracks = new Map<MediaStreamTrack, PermissionId>();
let keepAlive: ReturnType<typeof setInterval> | null = null;

function publishLive(): void {
  const live: Partial<Record<PermissionId, number>> = {};
  for (const id of liveTracks.values()) live[id] = (live[id] ?? 0) + 1;
  useCaptureStore.setState({ live });
  // A long recording is "in use": the idle auto-off must not cut it off.
  if (liveTracks.size && !keepAlive) {
    keepAlive = setInterval(() => {
      for (const id of new Set(liveTracks.values())) usePermissionStore.getState().markUsed(id);
    }, KEEP_ALIVE_MS);
  } else if (!liveTracks.size && keepAlive) {
    clearInterval(keepAlive);
    keepAlive = null;
  }
}

function watchStream(stream: MediaStream, idFor: (track: MediaStreamTrack) => PermissionId): MediaStream {
  const tracks = stream?.getTracks?.() ?? [];
  for (const track of tracks) {
    const release = () => { if (liveTracks.delete(track)) publishLive(); };
    // stop() does not fire "ended", so both paths release.
    const stop = track.stop.bind(track);
    track.stop = () => { release(); stop(); };
    track.addEventListener?.('ended', release);
    liveTracks.set(track, idFor(track));
  }
  if (tracks.length) publishLive();
  return stream;
}

// ---------------------------------------------------------------------------
// Installation
// ---------------------------------------------------------------------------

interface GateTarget {
  mediaDevices?: Partial<Pick<MediaDevices, 'getUserMedia' | 'getDisplayMedia'>>;
  geolocation?: Pick<Geolocation, 'getCurrentPosition' | 'watchPosition' | 'clearWatch'>;
}

const installed = new WeakSet<object>();

/** Wrap the capture entry points. Returns an uninstaller (used by tests). */
export function installPermissionGate(target: GateTarget = navigator as unknown as GateTarget): () => void {
  if (installed.has(target)) return () => undefined;
  installed.add(target);
  const undo: (() => void)[] = [() => installed.delete(target)];

  const guard = (ids: PermissionId[], run: () => Promise<MediaStream>, idFor: (t: MediaStreamTrack) => PermissionId) => {
    // Already allowed: call straight through, keeping the click's user activation.
    const allowed = ids.every(isOn) ? (void requestPermission(ids), run()) : requestPermission(ids).then((ok) => {
      if (!ok) throw denied();
      return run();
    });
    return allowed.then((s) => watchStream(s, idFor));
  };

  const md = target.mediaDevices;
  if (md?.getUserMedia) {
    const original = md.getUserMedia;
    md.getUserMedia = (constraints?: MediaStreamConstraints) => {
      const ids: PermissionId[] = [];
      if (constraints?.audio) ids.push('microphone');
      if (constraints?.video) ids.push('camera');
      return guard(ids, () => original.call(md, constraints), (t) => (t.kind === 'audio' ? 'microphone' : 'camera'));
    };
    undo.push(() => { md.getUserMedia = original; });
  }
  if (md?.getDisplayMedia) {
    const original = md.getDisplayMedia;
    md.getDisplayMedia = (options?: DisplayMediaStreamOptions) =>
      guard(['screen_recording'], () => original.call(md, options), () => 'screen_recording');
    undo.push(() => { md.getDisplayMedia = original; });
  }

  const geo = target.geolocation;
  const watches = new Map<number, number | null>(); // our id -> the platform's
  let nextWatch = 1;
  if (geo) {
    const { getCurrentPosition, watchPosition, clearWatch } = geo;
    const refuse = (onError?: PositionErrorCallback | null) =>
      onError?.({ code: 1, message: denied().message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
    geo.getCurrentPosition = (ok, err, opts) => {
      void requestPermission(['gps']).then((allowed) => {
        if (allowed) getCurrentPosition.call(geo, ok, err, opts);
        else refuse(err);
      });
    };
    geo.watchPosition = (ok, err, opts) => {
      const id = nextWatch++;
      watches.set(id, null);
      void requestPermission(['gps']).then((allowed) => {
        if (!watches.has(id)) return; // cleared while the question was open
        if (!allowed) { watches.delete(id); refuse(err); return; }
        watches.set(id, watchPosition.call(geo, ok, err, opts));
      });
      return id;
    };
    geo.clearWatch = (id) => {
      const real = watches.get(id);
      watches.delete(id);
      if (real !== undefined && real !== null) clearWatch.call(geo, real);
    };
    undo.push(() => { Object.assign(geo, { getCurrentPosition, watchPosition, clearWatch }); });
  }

  // Turning a switch off ends what is already running.
  undo.push(usePermissionStore.subscribe((state) => {
    for (const [track, id] of [...liveTracks]) {
      if (state.permissions[id]?.enabled) continue;
      track.stop();
      // Tell the app that holds the track, so its recording UI ends too.
      track.dispatchEvent?.(new Event('ended'));
    }
    if (geo && !state.permissions.gps?.enabled) for (const id of [...watches.keys()]) geo.clearWatch(id);
  }));

  return () => {
    for (const fn of undo.reverse()) fn();
    liveTracks.clear();
    pending.clear();
    deniedAt.clear();
    publishLive();
  };
}
