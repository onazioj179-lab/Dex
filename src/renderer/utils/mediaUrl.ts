// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// The URL an <img>/<audio>/<video>/<iframe> should use for a local file.
//
// In the desktop app the page is http://tauri.localhost, and Chromium refuses
// file:// subresources from it, so photos, music, video, PDFs and custom
// wallpapers came up blank. The native `dexmedia` protocol (src-tauri
// media_protocol.rs) serves them to DEX's own pages instead. Outside the
// desktop app (web preview, tests) a file:// URL is returned as before.

import { isTauri } from '../services/platform/tauriCompat';

export const MEDIA_ORIGIN = 'http://dexmedia.localhost';

/** Is this a dexmedia URL (so it names one of the user's local files)? */
export function isMediaUrl(u: string): boolean {
  return typeof u === 'string' && u.startsWith(`${MEDIA_ORIGIN}/`);
}

/**
 * The local path behind `file://C:/x.jpg`, `file:///C:/x.jpg`, a dexmedia URL,
 * or a plain path (returned as is). Native fs channels need this form.
 */
export function mediaPathOf(pathOrUrl: string): string {
  if (isMediaUrl(pathOrUrl)) {
    try { return decodeURIComponent(pathOrUrl.slice(MEDIA_ORIGIN.length + 1)); } catch { return pathOrUrl; }
  }
  if (!/^file:\/\//i.test(pathOrUrl)) return pathOrUrl;
  let p = pathOrUrl.replace(/^file:\/\//i, '');
  if (/^\/[a-zA-Z]:[\\/]/.test(p)) p = p.slice(1);
  try { p = decodeURI(p); } catch { /* not encoded */ }
  return p;
}

function isLocalPath(s: string): boolean {
  // Only file:// URLs and drive paths. "/assets/x.png" is an app URL, not a file.
  return /^file:\/\//i.test(s) || /^[a-zA-Z]:[\\/]/.test(s);
}

/**
 * Links to a dexmedia URL must never navigate DEX's own window (the whole UI
 * would be replaced by one photo). `download` is ignored for cross-origin
 * links, so a click on such a link is turned into a blob download of the file.
 * Installed once at boot; returns the uninstaller.
 */
export function installMediaLinkGuard(doc: Document = document): () => void {
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || !isMediaUrl(a.href)) return;
    e.preventDefault();
    const name = a.getAttribute('download') || mediaPathOf(a.href).split(/[\\/]/).pop() || 'file';
    void fetch(a.href)
      .then((r) => r.blob())
      .then((blob) => {
        const href = URL.createObjectURL(blob);
        const dl = doc.createElement('a');
        dl.href = href;
        dl.download = name;
        dl.click();
        setTimeout(() => URL.revokeObjectURL(href), 10_000);
      })
      .catch(() => { /* file gone or refused: do nothing rather than navigate */ });
  };
  doc.addEventListener('click', onClick, true);
  return () => doc.removeEventListener('click', onClick, true);
}

/**
 * Turn a local path (or file:// URL) into a loadable media URL. Web URLs,
 * blob:, data: and app-relative URLs pass through untouched. `desktop` is
 * injectable for tests.
 */
export function toMediaUrl(pathOrUrl: string, desktop: boolean = isTauri()): string {
  if (!pathOrUrl || !isLocalPath(pathOrUrl)) return pathOrUrl;
  const path = mediaPathOf(pathOrUrl);
  if (!desktop) {
    if (/^file:\/\//i.test(pathOrUrl)) return pathOrUrl;
    return `file:///${path.replace(/\\/g, '/')}`;
  }
  return `${MEDIA_ORIGIN}/${encodeURIComponent(path)}`;
}
