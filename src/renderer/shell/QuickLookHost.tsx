// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Global Quick Look host.
 *
 * The shell QuickLook component + useQuickLook() existed but were never mounted,
 * so each surface reinvented preview locally. This host mounts it once at the
 * app root and lets ANY surface preview a file by dispatching:
 *
 *   window.dispatchEvent(new CustomEvent('dex-quicklook', {
 *     detail: { path, name?, type?, content?, url?, isDirectory? }
 *   }))
 *
 * If `content`/`url` are supplied the item shows immediately; otherwise the host
 * infers the type from the extension and loads text via the files:read bridge
 * (media falls back to a file URL). Press Space/Escape or click the backdrop to
 * dismiss -- handled by QuickLook itself.
 */

import React, { useEffect } from 'react';
import { QuickLook, useQuickLook, type QuickLookItemType } from './QuickLook';

interface QuickLookRequest {
  path?: string;
  name?: string;
  type?: QuickLookItemType;
  content?: string;
  url?: string;
  isDirectory?: boolean;
}

const EXT_TYPE: Record<string, QuickLookItemType> = {};
const register = (type: QuickLookItemType, exts: string[]) => exts.forEach(e => { EXT_TYPE[e] = type; });
register('image', ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif']);
register('video', ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v']);
register('audio', ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']);
register('pdf', ['pdf']);
register('note', ['txt', 'log', 'rtf']);
register('code', ['js', 'jsx', 'ts', 'tsx', 'json', 'css', 'scss', 'html', 'xml', 'md', 'markdown',
  'py', 'rs', 'go', 'java', 'c', 'h', 'cpp', 'cs', 'sh', 'bash', 'yml', 'yaml', 'toml', 'ini', 'sql', 'php', 'rb', 'swift', 'kt']);

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function inferType(req: QuickLookRequest): QuickLookItemType {
  if (req.type) return req.type;
  if (req.isDirectory) return 'folder';
  const ext = extOf(req.name || req.path || '');
  return EXT_TYPE[ext] || 'unknown';
}

function toFileUrl(path: string): string {
  // Electron/Tauri can render file:// (or asset:) URLs for media. Normalise
  // Windows backslashes and drive letters into a usable URL.
  if (/^[a-z]+:\/\//i.test(path)) return path; // already a URL
  const norm = path.replace(/\\/g, '/');
  return norm.startsWith('/') ? `file://${norm}` : `file:///${norm}`;
}

async function readText(path: string): Promise<string | null> {
  const bridge = (window as any).dex;
  if (!bridge?.invoke) return null;
  try {
    // Native `fs:readText(path)` -> { ok, content } | { ok: false, error }.
    // (This used `files:read`, which no native arm answers, so text previews
    // were always blank in the desktop app. Found by the IPC ABI guard.)
    const res = await bridge.invoke('fs:readText', path);
    if (typeof res === 'string') return res;
    if (res && res.ok !== false && typeof res.content === 'string') return res.content;
    return null;
  } catch {
    return null;
  }
}

export const QuickLookHost: React.FC = () => {
  const { item, items, show, dismiss, setItem } = useQuickLook();

  useEffect(() => {
    const onRequest = async (e: Event) => {
      const req = (e as CustomEvent).detail as QuickLookRequest;
      if (!req) return;
      const type = inferType(req);
      const title = req.name || (req.path ? req.path.split(/[\\/]/).pop() || req.path : 'Preview');

      // Caller-supplied content/url wins (zero round-trip, always works).
      if (req.content != null || req.url != null) {
        show({ type, title, content: req.url ?? req.content ?? '' });
        return;
      }
      if (!req.path) { show({ type: 'unknown', title, content: '' }); return; }

      if (type === 'note' || type === 'code') {
        const text = await readText(req.path);
        show({ type: text != null ? type : 'unknown', title, content: text ?? '' });
      } else if (type === 'image' || type === 'video' || type === 'audio' || type === 'pdf') {
        show({ type, title, content: toFileUrl(req.path) });
      } else {
        show({ type, title, content: req.path });
      }
    };
    window.addEventListener('dex-quicklook', onRequest as EventListener);
    return () => window.removeEventListener('dex-quicklook', onRequest as EventListener);
  }, [show]);

  return (
    <QuickLook
      item={item}
      items={items}
      onDismiss={dismiss}
      onNavigate={setItem}
    />
  );
};

export default QuickLookHost;
