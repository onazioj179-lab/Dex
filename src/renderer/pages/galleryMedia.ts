// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { convertFileSrc } from '@tauri-apps/api/core';
import { invokePlatformIpc } from '../services/platform/ipc';
import { isTauri } from '../services/platform/tauriCompat';

export interface MediaItem {
  id: string;
  type: 'image' | 'video';
  path?: string;
  src: string;
  thumbnail: string;
  name: string;
  date: Date;
  size: number;
  duration?: number;
  format?: string;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
}

interface MediaFile {
  path: string;
  name: string;
  extension?: string;
  modified?: number;
  size?: number;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
}

const VIDEO = /^(mp4|mov|avi|mkv|webm|wmv|flv|m4v)$/i;

function toMediaItem(file: MediaFile, native: boolean, fallback: MediaItem['type'] = 'image'): MediaItem {
  const { path, name, modified, size, duration, width, height, fps, codec } = file;
  const format = (file.extension || name.split('.').pop() || '').replace(/^\./, '');
  const type = VIDEO.test(format) ? 'video' : fallback;
  const normalized = path.replace(/\\/g, '/');
  const src = native ? convertFileSrc(path) : encodeURI(normalized.startsWith('/')
    ? `file://${normalized}` : `file:///${normalized}`).replace(/#/g, '%23').replace(/\?/g, '%3F');
  return {
    id: path, path, src, name, type, thumbnail: type === 'image' ? src : '',
    date: new Date(modified ?? Date.now()), size: size ?? 0, duration, width, height, fps, codec,
    format: format.toUpperCase(),
  };
}

export interface GalleryFileResult {
  success: boolean;
  canceled?: boolean;
  count?: number;
  skipped?: number;
  path?: string;
  error?: string;
  failed?: Array<{ path: string; error: string }>;
}

export async function galleryFileAction(
  channel: 'gallery:importMedia' | 'gallery:exportEdited' | 'gallery:exportOriginals',
  ...args: unknown[]
): Promise<GalleryFileResult> {
  const result = await invokePlatformIpc<GalleryFileResult>(channel, ...args);
  if (!result?.success) throw new Error(result?.error || 'The Gallery file operation failed.');
  return result;
}

export async function loadAllMedia(): Promise<MediaItem[]> {
  if (isTauri()) {
    const result = await invokePlatformIpc<GalleryFileResult & { items: MediaFile[] }>('gallery:mediaLibrary');
    if (!result?.success) throw new Error(result?.error || 'Could not load the Gallery library.');
    if (result.items.length) return result.items.map(file => toMediaItem(file, true));
  } else if (window.electron?.invoke) {
    const [pictures, videos] = await Promise.all([
      invokePlatformIpc<MediaFile[]>('media:getMediaFiles', 'pictures'),
      invokePlatformIpc<MediaFile[]>('media:getMediaFiles', 'videos'),
    ]);
    const items = new Map<string, MediaItem>();
    for (const [type, files] of [['image', pictures], ['video', videos]] as const) {
      if (!Array.isArray(files)) continue;
      for (const file of files) {
        if (file.path && !items.has(file.path)) items.set(file.path, toMediaItem(file, false, type));
      }
    }
    if (items.size) return [...items.values()];
  }
  try {
    const saved = JSON.parse(localStorage.getItem('dex-gallery-media') || '[]');
    return Array.isArray(saved) ? saved.map(item => ({ ...item, date: new Date(item.date) })) : [];
  } catch {
    return [];
  }
}

export function downloadGalleryFile(src: string, name: string) {
  const link = document.createElement('a');
  link.href = src;
  link.download = name;
  link.click();
}
