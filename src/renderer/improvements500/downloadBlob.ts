// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Browser file download helper (T2-038, T6-049, T8-029 export hooks).
 *
 * Wraps the URL.createObjectURL + anchor click pattern so feature code does
 * not have to repeat boilerplate or remember to revoke the URL.
 */

type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

function desktopInvoke(): Invoke | null {
  const dex = (globalThis as unknown as { dex?: { invoke?: Invoke } }).dex;
  return dex?.invoke ? dex.invoke.bind(dex) : null;
}

function notify(type: 'success' | 'error', message: string): void {
  try { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } })); } catch { /* non-DOM */ }
}

/**
 * Desktop app: the native Save dialog, then a binary write. A blob "download"
 * inside the WebView is unreliable there (and revoking the URL right after the
 * click could cancel it), so exports silently went nowhere. Resolves to the
 * saved path, or null when cancelled.
 */
export async function saveBlobNative(invoke: Invoke, filename: string, blob: Blob): Promise<string | null> {
  const ext = filename.includes('.') ? filename.split('.').pop() || '' : '';
  const pick = (await invoke('dialog:showSaveDialog', {
    title: 'Save',
    defaultPath: filename,
    filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [],
  })) as { canceled?: boolean; filePath?: string } | null;
  if (!pick || pick.canceled || !pick.filePath) return null;
  const bytes = new Uint8Array(typeof blob.arrayBuffer === 'function'
    ? await blob.arrayBuffer()
    : await new Promise<ArrayBuffer>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as ArrayBuffer);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(blob);
    }));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const r = (await invoke('fs:writeBase64', pick.filePath, btoa(bin))) as { ok?: boolean; error?: string } | null;
  if (!r?.ok) throw new Error(r?.error || 'The file could not be written.');
  return pick.filePath;
}

export function downloadBlob(filename: string, blob: Blob): void {
  const invoke = desktopInvoke();
  if (invoke) {
    void saveBlobNative(invoke, filename, blob)
      .then((path) => { if (path) notify('success', `Saved ${path.split(/[\\/]/).pop()}`); })
      .catch((e: Error) => notify('error', `Could not save: ${e.message}`));
    return;
  }
  if (typeof URL === 'undefined' || typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Long enough for the browser to start the download before the URL goes.
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 10_000);
}

export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8'): void {
  downloadBlob(filename, new Blob([text], { type: mime }));
}

export function downloadJson(filename: string, data: unknown, pretty = true): void {
  const text = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  downloadText(filename, text, 'application/json;charset=utf-8');
}

export function downloadCsv(filename: string, rows: readonly (readonly (string | number)[])[]): void {
  const escape = (v: string | number): string => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = rows.map((r) => r.map(escape).join(',')).join('\r\n');
  downloadText(filename, text, 'text/csv;charset=utf-8');
}
