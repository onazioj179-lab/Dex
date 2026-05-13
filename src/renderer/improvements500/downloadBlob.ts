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

export function downloadBlob(filename: string, blob: Blob): void {
  if (typeof URL === 'undefined' || typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 0);
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
