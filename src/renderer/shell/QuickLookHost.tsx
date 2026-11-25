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

import { toMediaUrl } from '../utils/mediaUrl';
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
// Every common media type: the ones WebView2 cannot decode are prepared for playback (media_compat.rs).
register('video', ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', 'mts', 'm2ts', '3gp', 'ogv', 'vob', 'asf']);
register('audio', ['mp3', 'wav', 'ogg', 'oga', 'opus', 'flac', 'm4a', 'aac', 'wma', 'aiff', 'aif', 'ape', 'alac', 'wv', 'ac3', 'mka', 'amr']);
register('pdf', ['pdf']);
register('note', ['txt', 'log', 'rtf', 'nfo']);
register('markdown', ['md', 'markdown']);
register('table', ['csv', 'tsv']);
register('code', ['js', 'jsx', 'ts', 'tsx', 'json', 'css', 'scss', 'html', 'xml',
  'py', 'rs', 'go', 'java', 'c', 'h', 'cpp', 'cs', 'sh', 'bash', 'yml', 'yaml', 'toml', 'ini', 'sql', 'php', 'rb', 'swift', 'kt']);

const PREVIEW_CHARS = 200_000;

function fmtSize(chars: number): string {
  return chars >= 1_048_576 ? `${(chars / 1_048_576).toFixed(1)} MB` : `${Math.round(chars / 1024)} KB`;
}

/** Markdown → sanitised HTML, reusing Notes' parser. */
async function markdownHtml(md: string): Promise<string> {
  const [{ markdownToDoc }, { docToHTML }, purify] = await Promise.all([
    import('../DEXAPPLICATIONS/notes/notesFileFormat'),
    import('../DEXAPPLICATIONS/notes/NotesDocumentModel'),
    import('dompurify'),
  ]);
  return purify.default.sanitize(docToHTML(markdownToDoc(md)));
}

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
  // Local files load through dexmedia in the desktop app (file:// is blocked
  // from its http origin; utils/mediaUrl). Web URLs pass through.
  if (/^[a-z]+:\/\//i.test(path) && !/^file:\/\//i.test(path)) return path;
  return toMediaUrl(path);
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

      const path = req.path;
      if (type === 'note' || type === 'code' || type === 'markdown' || type === 'table') {
        const text = await readText(path);
        if (text == null) { show({ type: 'unknown', title, content: '', path, note: 'This file could not be read as text.' }); return; }
        // Big logs and data files: preview the start instead of freezing the window.
        const cut = text.length > PREVIEW_CHARS;
        const shown = cut ? text.slice(0, PREVIEW_CHARS) : text;
        const note = cut ? `Showing the first ${fmtSize(PREVIEW_CHARS)} of ${fmtSize(text.length)}. Open the file for all of it.` : undefined;
        if (type === 'markdown') {
          show({ type, title, content: await markdownHtml(shown), path, note });
        } else {
          show({ type, title, content: shown, path, note: type === 'table' ? (note ?? 'Showing up to 500 rows.') : note });
        }
      } else if (type === 'folder') {
        const r = await (window as any).dex?.invoke?.('files:list', path).catch(() => null) as { files?: Array<{ name: string; isDirectory?: boolean }> } | null;
        const files = (r?.files ?? []).slice().sort((a, b) => Number(!!b.isDirectory) - Number(!!a.isDirectory) || a.name.localeCompare(b.name));
        const shown = files.slice(0, 400).map(f => ({ name: f.name, isDirectory: !!f.isDirectory }));
        show({ type, title, content: JSON.stringify(shown), path, note: `${files.length.toLocaleString()} item${files.length === 1 ? '' : 's'}${files.length > shown.length ? `; showing ${shown.length}` : ''}` });
      } else if (type === 'image' || type === 'video' || type === 'audio' || type === 'pdf') {
        show({ type, title, content: toFileUrl(path), path });
      } else {
        const ext = extOf(title);
        show({ type, title, content: path, path, note: ext ? `No preview for .${ext} files. Open it in its app.` : undefined });
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
