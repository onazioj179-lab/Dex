// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { convertFileSrc } from '@tauri-apps/api/core';
import { invokePlatformIpc } from '../platform/ipc';
import { isTauri } from '../platform/tauriCompat';

export const AUDIO_EXTENSIONS = 'mp3 wav flac m4a aac ogg oga opus wma aif aiff caf alac ape mka ac3 dts amr au'.split(' ');
export const VIDEO_EXTENSIONS = 'mp4 mov avi mkv webm wmv flv m4v mpeg mpg ts m2ts mts 3gp ogv vob asf divx'.split(' ');

export function localFileUrl(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const encoded = normalized.split('/').map((part, index) =>
    index === 0 && /^[A-Za-z]:$/.test(part) ? part : encodeURIComponent(part),
  ).join('/');
  if (encoded.startsWith('//')) return 'file:' + encoded;
  return 'file://' + (encoded.startsWith('/') ? encoded : '/' + encoded);
}

export async function localPlaybackUrl(path: string): Promise<string> {
  if (!isTauri()) return localFileUrl(path);
  const result = await invokePlatformIpc<{ success: boolean; error?: string }>('media:previewFile', path);
  if (!result?.success) throw new Error(result?.error || 'Could not open this file.');
  return convertFileSrc(path);
}

function startNativeMediaPreview(kind: 'Audio' | 'Video', path: string) {
  const token = crypto.randomUUID();
  let released = false;
  const releaseNative = () => invokePlatformIpc(`media:release${kind}`, token);
  const url = invokePlatformIpc<{ success: boolean; path?: string; error?: string }>(`media:prepare${kind}`, token, path)
    .then(async result => {
      if (released) {
        // A release can reach the backend before the prepare request registers.
        await releaseNative();
        throw new DOMException(`${kind} preparation canceled.`, 'AbortError');
      }
      if (!result?.success || !result.path) throw new Error(result?.error || `DEX could not decode this ${kind.toLowerCase()} file.`);
      return convertFileSrc(result.path);
    });
  return {
    url,
    release() {
      if (released) return;
      released = true;
      void releaseNative();
    },
  };
}

export function startNativeAudioPreview(path: string) {
  return startNativeMediaPreview('Audio', path);
}

export function startNativeVideoPreview(path: string) {
  const request = startNativeMediaPreview('Video', path);
  let owners = 0;
  return {
    url: request.url,
    retain() {
      owners++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (--owners === 0) request.release();
      };
    },
  };
}

export async function openLocalFile(path: string) {
  const channel = 'shell:openPath';
  const result = await invokePlatformIpc<{ success?: boolean; error?: string } | boolean | string>(channel, path);
  if (result === true || result === '' || (typeof result === 'object' && result?.success)) return;
  throw new Error((typeof result === 'object' && result?.error) || (typeof result === 'string' && result) || 'Could not open the file.');
}
