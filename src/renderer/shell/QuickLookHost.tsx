// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import React, { useEffect, useState } from 'react';
import { QuickLook, type QuickLookItem, type QuickLookItemType } from './QuickLook';
import { invokePlatformIpc } from '../services/platform/ipc';
import { isTauri } from '../services/platform/tauriCompat';
import { AUDIO_EXTENSIONS, VIDEO_EXTENSIONS, localPlaybackUrl } from '../services/media/localMedia';

interface PreviewFile {
  path?: string;
  name?: string;
  type?: QuickLookItemType;
  content?: string;
  url?: string;
  isDirectory?: boolean;
  size?: number;
}

interface QuickLookRequest extends PreviewFile {
  neighbors?: PreviewFile[];
}

const EXT_TYPE = new Map<string, QuickLookItemType>();
const register = (type: QuickLookItemType, extensions: string[]) => extensions.forEach(ext => EXT_TYPE.set(ext, type));
register('image', 'png jpg jpeg gif webp svg bmp ico avif tif tiff heic heif'.split(' '));
register('video', VIDEO_EXTENSIONS);
register('audio', AUDIO_EXTENSIONS);
register('pdf', ['pdf']);
register('note', ['txt', 'log', 'csv', 'tsv']);
register('code', 'js jsx ts tsx json css scss html xml md markdown py rs go java c h cpp cs sh bash yml yaml toml ini sql php rb swift kt'.split(' '));

function placeholder(file: PreviewFile): QuickLookItem {
  const title = file.name || file.path?.split(/[\/]/).pop() || 'Preview';
  const extension = title.includes('.') ? title.split('.').pop()?.toLowerCase() : undefined;
  const type = file.type ?? (file.isDirectory ? 'folder' : EXT_TYPE.get(extension ?? '') ?? 'unknown');
  const content = file.url ?? file.content;
  return { type, title, path: file.path, size: file.size, content: content ?? '',
    loading: content === undefined && !!file.path && type !== 'folder' && type !== 'unknown' };
}

async function loadFile(file: PreviewFile, item: QuickLookItem): Promise<QuickLookItem> {
  const path = file.path!;
  if (item.type === 'note' || item.type === 'code') {
    const result = isTauri()
      ? await invokePlatformIpc<{ success?: boolean; content?: string; truncated?: boolean; error?: string }>('files:previewText', path)
      : await invokePlatformIpc<string | { content?: string }>('files:read', { path, encoding: 'utf-8' });
    const text = typeof result === 'string' ? result : result?.content;
    if (text === undefined) throw new Error('Could not read this file as text.');
    return { ...item, content: text.slice(0, 256 * 1024), loading: false,
      truncated: text.length > 256 * 1024 || (typeof result === 'object' && result != null && 'truncated' in result && result.truncated === true) };
  }
  return { ...item, content: await localPlaybackUrl(path), loading: false };
}

export function QuickLookHost() {
  const [session, setSession] = useState<{ files: PreviewFile[]; index: number } | null>(null);
  const [loaded, setLoaded] = useState<{ file: PreviewFile; item: QuickLookItem } | null>(null);
  const file = session?.files[session.index];
  const item = loaded && loaded.file === file ? loaded.item : file ? placeholder(file) : null;

  useEffect(() => {
    const onRequest = (event: Event) => {
      const request = (event as CustomEvent<QuickLookRequest>).detail;
      if (!request) return;
      const selected = request.neighbors?.findIndex(candidate => candidate.path === request.path) ?? -1;
      setSession(selected >= 0 ? { files: request.neighbors!, index: selected } : { files: [request], index: 0 });
    };
    window.addEventListener('dex-quicklook', onRequest);
    return () => window.removeEventListener('dex-quicklook', onRequest);
  }, []);

  useEffect(() => {
    if (!file) { setLoaded(null); return; }
    const initial = placeholder(file);
    if (!initial.loading) return;
    let active = true;
    void loadFile(file, initial).then(
      item => { if (active) setLoaded({ file, item }); },
      error => { if (active) setLoaded({ file, item: { ...initial, loading: false, error: error instanceof Error ? error.message : 'Could not load preview.' } }); },
    );
    return () => { active = false; };
  }, [file]);

  return <QuickLook item={item} onDismiss={() => setSession(null)}
    position={session ? { index: session.index, total: session.files.length } : undefined}
    onStep={delta => setSession(current => current && ({
      ...current, index: Math.max(0, Math.min(current.files.length - 1, current.index + delta)),
    }))} />;
}

export default QuickLookHost;
