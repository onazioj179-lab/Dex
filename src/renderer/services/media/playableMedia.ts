// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Play any local audio or video file (renderer half of src-tauri/src/media_compat.rs).
 *
 * Files WebView2 plays (MP4/WebM/MP3/FLAC/WAV/Ogg … with supported codecs)
 * stream straight from disk through dexmedia, byte range by byte range, so
 * size does not matter. Anything else (AVI, WMV, FLV, MKV, HEVC, AC-3, DTS,
 * WMA, APE, ALAC, AIFF …) is prepared natively once, remuxed when only the
 * container is the problem and converted otherwise, then cached. A file with
 * a "playable" name that still fails to decode (an HEVC .mp4, say) goes the
 * same way the moment the media element reports the error.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { isMediaUrl, mediaPathOf, toMediaUrl } from '../../utils/mediaUrl';

type Bridge = {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on?: (channel: string, fn: (...args: unknown[]) => void) => unknown;
  off?: (channel: string, fn: (...args: unknown[]) => void) => void;
};
function bridge(): Bridge | null {
  const dex = (globalThis as unknown as { dex?: Bridge }).dex;
  return dex && typeof dex.invoke === 'function' ? dex : null;
}
function listen(b: Bridge, channel: string, fn: (...args: unknown[]) => void): () => void {
  const ret = b.on?.(channel, fn);
  return () => { if (typeof ret === 'function') (ret as () => void)(); else b.off?.(channel, fn); };
}

/** Extensions WebView2 normally plays as they are. */
export const DIRECT_MEDIA = /\.(mp4|m4v|m4a|mov|webm|ogg|ogv|oga|opus|mp3|wav|flac|aac)$/i;

/** The local file behind a media src (dexmedia URL, file:// URL or a drive path), or null for web/blob URLs. */
export function localPathOf(src: string | undefined | null): string | null {
  if (!src) return null;
  if (isMediaUrl(src) || /^file:\/\//i.test(src) || /^[a-zA-Z]:[\\/]/.test(src)) return mediaPathOf(src);
  return null;
}

export function needsPreparing(path: string): boolean {
  return !DIRECT_MEDIA.test(path);
}

/** Prepare a file for playback. Resolves to a URL the media element can load. */
export function preparePlayable(path: string, onProgress?: (percent: number) => void): Promise<string> {
  const b = bridge();
  if (!b) return Promise.reject(new Error('This format can be played in the DEX desktop app.'));
  return new Promise<string>((resolve, reject) => {
    let id: string | null = null;
    const early: Array<{ ch: string; p: Record<string, unknown> }> = [];
    const handle = (ch: string, p: Record<string, unknown>) => {
      if (ch === 'progress') { if (typeof p.percent === 'number') onProgress?.(p.percent); return; }
      stop();
      if (p.ok && typeof p.path === 'string') resolve(toMediaUrl(p.path));
      else reject(new Error(typeof p.error === 'string' ? p.error : 'The file could not be converted.'));
    };
    const route = (ch: string) => (...args: unknown[]) => {
      const p = (args[args.length - 1] ?? {}) as Record<string, unknown>;
      if (!id) { early.push({ ch, p }); return; }
      if (p.id === id) handle(ch, p);
    };
    const offP = listen(b, 'media:prepare-progress', route('progress'));
    const offD = listen(b, 'media:prepare-done', route('done'));
    const stop = () => { offP(); offD(); };
    b.invoke('media:prepare', { path }).then((r) => {
      const res = (r ?? {}) as { ok?: boolean; status?: string; path?: string; id?: string; error?: string };
      if (!res.ok) { stop(); reject(new Error(res.error || 'The file could not be opened.')); return; }
      if (res.status === 'ready' && res.path) { stop(); resolve(toMediaUrl(res.path)); return; }
      id = res.id ?? null;
      for (const e of early.splice(0)) if (e.p.id === id) handle(e.ch, e.p);
    }).catch((e) => { stop(); reject(e instanceof Error ? e : new Error(String(e))); });
  });
}

export type PlayableStatus = 'direct' | 'preparing' | 'ready' | 'error';

/**
 * The src to give a <video>/<audio>, plus status for a small overlay. Pass the
 * element's onError to `onMediaError` so a file that fails to decode is prepared.
 */
export function usePlayableMedia(src: string | undefined | null): {
  src: string | undefined; status: PlayableStatus; percent: number; error: string | null; onMediaError: () => void;
} {
  const path = localPathOf(src ?? null);
  const [state, setState] = useState<{ key: string; src?: string; status: PlayableStatus; percent: number; error: string | null }>(
    () => ({ key: src ?? '', src: src ?? undefined, status: 'direct', percent: 0, error: null }),
  );
  const tried = useRef(false);
  const key = src ?? '';

  const prepare = useCallback((p: string) => {
    tried.current = true;
    setState({ key, src: undefined, status: 'preparing', percent: 0, error: null });
    preparePlayable(p, (percent) => setState((s) => (s.key === key ? { ...s, percent } : s)))
      .then((url) => setState((s) => (s.key === key ? { key, src: url, status: 'ready', percent: 100, error: null } : s)))
      .catch((e: Error) => setState((s) => (s.key === key ? { key, src: undefined, status: 'error', percent: 0, error: e.message } : s)));
  }, [key]);

  useEffect(() => {
    tried.current = false;
    if (path && needsPreparing(path) && bridge()) prepare(path);
    else setState({ key, src: src ?? undefined, status: 'direct', percent: 0, error: null });
    // `path` follows `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const onMediaError = useCallback(() => {
    if (path && !tried.current && bridge()) prepare(path);
    else if (!tried.current) setState((s) => ({ ...s, status: 'error', error: 'This file cannot be played here.' }));
  }, [path, prepare]);

  const current = state.key === key ? state : { key, src: src ?? undefined, status: 'direct' as const, percent: 0, error: null };
  return { src: current.src, status: current.status, percent: current.percent, error: current.error, onMediaError };
}
