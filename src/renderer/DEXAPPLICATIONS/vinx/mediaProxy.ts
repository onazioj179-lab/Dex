// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// VINX editing proxies. A proxy is a smaller H.264 copy of a clip (1/2, 1/4 or
// 1/8 size) made by the native `video:transcode` channel through ffmpeg, so
// heavy footage scrubs smoothly. The Viewer plays the proxy while "Use proxies"
// is on; export always swaps back to the original file.
//
// Honest by construction: only clips imported from disk can get a proxy
// (ffmpeg needs a path, not a blob: URL), and a missing ffmpeg is reported,
// never faked.

import type { MediaItem, ProxySettings } from './VinxTypes';

/** True when ffmpeg can read this item: a real file path, not blob:/http:/data:. */
export function hasDiskPath(item: Pick<MediaItem, 'path' | 'type'>): boolean {
  if (item.type !== 'video' || !item.path) return false;
  return !/^(blob:|https?:|data:)/i.test(item.path);
}

/**
 * Which file the Viewer should play: the proxy when proxies are on, one
 * exists and we are not exporting; otherwise the original.
 */
export function playbackSource(
  item: Pick<MediaItem, 'path' | 'proxyPath'> | undefined | null,
  useProxies: boolean,
  exporting: boolean,
): string {
  if (!item) return '';
  if (useProxies && !exporting && item.proxyPath) return item.proxyPath;
  return item.path || item.proxyPath || '';
}

export interface ProxyResult { ok: boolean; proxyPath?: string; error?: string }

type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

/** Ask the native side for a proxy of one clip. */
export async function makeProxy(
  item: Pick<MediaItem, 'path' | 'type'>,
  settings: Pick<ProxySettings, 'resolution'>,
  invoke: Invoke | undefined = (window as unknown as { dex?: { invoke?: Invoke } }).dex?.invoke,
): Promise<ProxyResult> {
  if (!hasDiskPath(item)) return { ok: false, error: 'Only clips imported from disk can have a proxy.' };
  if (!invoke) return { ok: false, error: 'Proxies need the DEX desktop app.' };
  try {
    const r = await invoke('video:transcode', item.path, {
      format: 'mp4', videoCodec: 'libx264', audioCodec: 'aac', crf: 28, preset: 'veryfast',
      scale: settings.resolution,
    }) as { success?: boolean; output?: string; error?: string } | null;
    if (!r || !r.success || !r.output) return { ok: false, error: r?.error || 'The proxy could not be made.' };
    return { ok: true, proxyPath: r.output };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
