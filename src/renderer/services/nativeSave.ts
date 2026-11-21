// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Native saving and downloading for every app.
 *
 * Apps used the web pattern "make an <a download>, click it" (VINX, Imosion,
 * Forge, Prism, Flux, Gallery, ... ~70 places). Inside the desktop app that
 * hands the file to the WebView's own download manager, which pops up its
 * browser-style downloads panel. Here instead:
 *
 *  - in-memory data (blob:/data: links): the native Save dialog, then an
 *    atomic native write (temp file + rename), then a DEX notification with
 *    Open / Show in folder (or the error and Retry).
 *  - web files (http/https links with a download name): the native download
 *    manager (download_ctl.rs: .part file, size cap, safe names, cancel),
 *    with one notification when it finishes or fails.
 *
 * installDownloadCapture() routes every existing anchor download through
 * this, so call sites do not each need changing. Nothing is ever opened or
 * run automatically. Without the desktop app (web preview, tests) the normal
 * browser download happens.
 */

import { hasNativeFiles, pickSavePath, writeBinaryFile } from './nativeFiles';
import { notify } from './notify';

type Bridge = {
  invoke: (channel: string, ...args: unknown[]) => Promise<any>;
  on?: (channel: string, cb: (payload: any) => void) => void;
  off?: (channel: string, cb: (payload: any) => void) => void;
};
const bridge = (): Bridge | null => {
  const d = (globalThis as { dex?: Bridge }).dex;
  return d && typeof d.invoke === 'function' ? d : null;
};

const baseName = (p: string) => p.split(/[\\/]/).pop() || p;

/** A file name safe for the save dialog: no path parts, no reserved characters. */
export function safeFileName(name: string, fallback = 'download'): string {
  const n = baseName(String(name || '')).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim();
  return n.slice(0, 180) || fallback;
}

function fileActions(path: string) {
  const b = bridge();
  return b ? [
    { label: 'Open', onClick: () => { void b.invoke('shell:openPath', path); } },
    { label: 'Show in folder', onClick: () => { void b.invoke('shell:showItemInFolder', path); } },
  ] : [];
}

function reportSaveError(name: string, error: unknown, source: string, retry?: () => void): void {
  const message = error instanceof Error ? error.message : String(error);
  void notify({
    title: `Couldn't save ${name}`, body: message, source, icon: 'error', priority: 'high',
    actions: retry ? [{ label: 'Retry', onClick: retry }] : undefined,
  });
}

/**
 * Save `blob` as a file the user picks. Resolves with the path, or null when
 * the user cancels. Errors are shown (with Retry) and also rethrown.
 */
export async function saveBlobAs(fileName: string, blob: Blob, opts: { title?: string; source?: string } = {}): Promise<string | null> {
  const name = safeFileName(fileName);
  if (!hasNativeFiles()) { browserDownload(name, blob); return null; }
  const source = opts.source || 'Files';
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const filters = ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined;
  let path: string | null;
  try {
    path = await pickSavePath(name, filters, opts.title || 'Save');
  } catch (error) {
    reportSaveError(name, error, source);
    throw error;
  }
  if (!path) return null;
  const write = async (): Promise<string> => {
    try {
      await writeBinaryFile(path, blob);
      void notify({ title: `Saved ${baseName(path)}`, body: path, source, icon: 'success', actions: fileActions(path) });
      return path;
    } catch (e) {
      reportSaveError(baseName(path), e, source, () => { void write().catch(() => {}); });
      throw e;
    }
  };
  return write();
}

let seq = 0;
const active = new Set<string>();

/** Download a web file through the native download manager (Downloads folder). */
export async function downloadUrl(url: string, opts: { source?: string } = {}): Promise<void> {
  const b = bridge();
  if (!b) { window.open(url, '_blank', 'noopener'); return; }
  if (active.has(url)) return; // the same file is already downloading: no duplicate
  active.add(url);
  const id = `dl_${Date.now().toString(36)}_${++seq}`;
  const source = opts.source || 'Downloads';
  const onProgress = (p: any) => {
    if (!p || p.id !== id || p.state === 'progressing') return;
    b.off?.('download:progress', onProgress);
    active.delete(url);
    if (p.state === 'completed' && p.path) {
      void notify({ title: `Downloaded ${p.fileName || baseName(p.path)}`, body: p.path, source, icon: 'success', actions: fileActions(p.path) });
    } else if (p.state === 'failed') {
      void notify({ title: 'Download failed', body: p.error || url, source, icon: 'error', priority: 'high',
        actions: [{ label: 'Retry', onClick: () => { void downloadUrl(url, opts); } }] });
    }
  };
  b.on?.('download:progress', onProgress);
  const r = await b.invoke('download:start', url, id).catch((e: unknown) => ({ success: false, error: String(e) }));
  if (!r?.success) {
    b.off?.('download:progress', onProgress);
    active.delete(url);
    void notify({ title: 'Download failed', body: r?.error || url, source, icon: 'error', priority: 'high',
      actions: [{ label: 'Retry', onClick: () => { void downloadUrl(url, opts); } }] });
    return;
  }
  void notify({ title: 'Downloading', body: url.split('?')[0].split('/').pop() || url, source, icon: 'info', transientOnly: true });
}

// ---- Anchor-download capture ------------------------------------------------

const nativeClick = typeof HTMLAnchorElement !== 'undefined' ? HTMLAnchorElement.prototype.click : null;

function browserDownload(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  (nativeClick || a.click).call(a);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** blob: URLs a captured click still needs: their revoke waits until the save has read them. */
const pendingBlobs = new Map<string, number>();
const deferredRevokes = new Set<string>();

/** True when this anchor click is a file download DEX should handle natively. */
export function isCapturableDownload(a: HTMLAnchorElement): boolean {
  if (!a.hasAttribute('download')) return false;
  const href = a.getAttribute('href') || '';
  return /^(blob:|data:|https?:)/i.test(href);
}

async function handleAnchor(a: HTMLAnchorElement): Promise<void> {
  const href = a.href;
  const name = safeFileName(a.getAttribute('download') || '', 'download');
  if (/^https?:/i.test(href)) { await downloadUrl(href); return; }
  const isBlob = href.startsWith('blob:');
  if (isBlob) pendingBlobs.set(href, (pendingBlobs.get(href) ?? 0) + 1);
  let blob: Blob;
  try {
    const response = await fetch(href);
    if (!response.ok) throw new Error('Could not read the export data.');
    blob = await response.blob();
  } catch (error) {
    reportSaveError(name, error, 'Files');
    return;
  } finally {
    if (isBlob) {
      const readers = (pendingBlobs.get(href) ?? 1) - 1;
      if (readers > 0) {
        pendingBlobs.set(href, readers);
      } else {
        pendingBlobs.delete(href);
        if (deferredRevokes.delete(href)) URL.revokeObjectURL(href);
      }
    }
  }
  await saveBlobAs(name, blob).catch(() => {});
}

let installed = false;

/** Route every <a download> click in DEX through the native save/download path. */
export function installDownloadCapture(): void {
  if (installed || !nativeClick || typeof window === 'undefined') return;
  installed = true;
  const origRevoke = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = (url: string) => { if (pendingBlobs.has(url)) deferredRevokes.add(url); else origRevoke(url); };
  // Programmatic a.click() (the common pattern; works on detached anchors too).
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (hasNativeFiles() && isCapturableDownload(this)) {
      void handleAnchor(this);
      return;
    }
    return nativeClick.call(this);
  };
  // window.open from DEX's own UI would spawn a bare browser-style window.
  // Web and mail links go to the system's default handler (shell:openExternal
  // allow-list); anything else (e.g. window.open('') for printing) is unchanged.
  const origOpen = window.open.bind(window);
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const u = url == null ? '' : String(url);
    const b = bridge();
    if (b && /^(https?:|mailto:)/i.test(u)) {
      void b.invoke('shell:openExternal', u);
      return null;
    }
    return origOpen(url as string, target, features);
  }) as typeof window.open;
  // Real clicks on download links in DEX's own UI.
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[download]') as HTMLAnchorElement | null;
    if (!a || e.defaultPrevented || !hasNativeFiles() || !isCapturableDownload(a)) return;
    e.preventDefault();
    void handleAnchor(a);
  }, true);
}
