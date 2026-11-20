// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

vi.mock('../../src/renderer/services/notify', () => ({ notify: vi.fn(async () => 1) }));

import { safeFileName, isCapturableDownload, installDownloadCapture } from '../../src/renderer/services/nativeSave';

const calls: { ch: string; args: unknown[] }[] = [];
const files = new Map<string, string>();

beforeAll(() => {
  (globalThis as any).dex = {
    invoke: async (ch: string, ...args: unknown[]) => {
      calls.push({ ch, args });
      if (ch === 'dialog:showSaveDialog') return { canceled: false, filePath: 'C:\\Users\\me\\Downloads\\' + (args[0] as any).defaultPath };
      if (ch === 'fs:writeBase64') { files.set(args[0] as string, args[1] as string); return { ok: true, bytes: 3 }; }
      if (ch === 'shell:openExternal') return { success: true };
      return null;
    },
  };
  installDownloadCapture();
});
afterEach(() => { calls.length = 0; files.clear(); });

const settle = () => new Promise((r) => setTimeout(r, 30));

describe('native save / download capture', () => {
  it('cleans file names', () => {
    expect(safeFileName('..\\..\\Windows\\evil.exe')).toBe('evil.exe');
    expect(safeFileName('a:b*c?.wav')).toBe('a_b_c_.wav');
    expect(safeFileName('')).toBe('download');
    expect(safeFileName('.hidden')).toBe('hidden');
  });

  it('only download links are captured', () => {
    const a = document.createElement('a');
    a.href = 'https://example.com/page';
    expect(isCapturableDownload(a)).toBe(false);
    a.setAttribute('download', 'x.zip');
    expect(isCapturableDownload(a)).toBe(true);
    a.href = 'javascript:alert(1)';
    expect(isCapturableDownload(a)).toBe(false);
  });

  it('a data: download goes through the native Save dialog and write', async () => {
    const a = document.createElement('a');
    a.href = 'data:application/octet-stream;base64,AQID';
    a.download = 'mix.wav';
    a.click();
    await settle();
    expect(calls.map((c) => c.ch)).toEqual(['dialog:showSaveDialog', 'fs:writeBase64']);
    expect(files.get('C:\\Users\\me\\Downloads\\mix.wav')).toBe('AQID');
  });

  it('a blob: download still saves when the app revokes the URL right after click', async () => {
    const url = URL.createObjectURL(new Blob([new Uint8Array([1, 2, 3])]));
    const a = document.createElement('a');
    a.href = url; a.download = 'clip.webm';
    a.click();
    URL.revokeObjectURL(url); // the usual pattern: revoke immediately
    await settle();
    expect(files.get('C:\\Users\\me\\Downloads\\clip.webm')).toBe('AQID');
  });

  it('window.open of a web link goes to the system browser, not a new window', () => {
    const r = window.open('https://www.openstreetmap.org/?mlat=1', '_blank');
    expect(r).toBeNull();
    expect(calls).toEqual([{ ch: 'shell:openExternal', args: ['https://www.openstreetmap.org/?mlat=1'] }]);
  });
});
