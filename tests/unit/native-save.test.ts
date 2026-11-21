// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

vi.mock('../../src/renderer/services/notify', () => ({ notify: vi.fn(async () => 1) }));

import { safeFileName, isCapturableDownload, installDownloadCapture, saveBlobAs } from '../../src/renderer/services/nativeSave';
import { notify } from '../../src/renderer/services/notify';

const calls: { ch: string; args: unknown[] }[] = [];
const files = new Map<string, string>();
let pickPath: (() => unknown) | undefined;

beforeAll(() => {
  (globalThis as any).dex = {
    invoke: async (ch: string, ...args: unknown[]) => {
      calls.push({ ch, args });
      if (ch === 'dialog:showSaveDialog') return pickPath
        ? pickPath()
        : { canceled: false, filePath: 'C:\\Users\\me\\Downloads\\' + (args[0] as any).defaultPath };
      if (ch === 'fs:writeBase64') { files.set(args[0] as string, args[1] as string); return { ok: true, bytes: 3 }; }
      if (ch === 'shell:openExternal') return { success: true };
      return null;
    },
  };
  installDownloadCapture();
});
afterEach(() => { calls.length = 0; files.clear(); pickPath = undefined; vi.mocked(notify).mockClear(); });

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

  it('keeps a shared blob URL until every export has read it', async () => {
    const originalFetch = globalThis.fetch;
    let releaseSecond!: () => void;
    const secondReader = new Promise<void>(resolve => { releaseSecond = resolve; });
    const fetchExport = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce((...args) => originalFetch(...args))
      .mockImplementationOnce(async (...args) => {
        await secondReader;
        return originalFetch(...args);
      });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob([new Uint8Array([1, 2, 3])]));
    try {
      anchor.download = 'first.bin';
      anchor.click();
      anchor.download = 'second.bin';
      anchor.click();
      URL.revokeObjectURL(anchor.href);
      await vi.waitFor(() => expect(files.get('C:\\Users\\me\\Downloads\\first.bin')).toBe('AQID'));
      releaseSecond();
      await vi.waitFor(() => expect(files.get('C:\\Users\\me\\Downloads\\second.bin')).toBe('AQID'));
    } finally {
      releaseSecond();
      fetchExport.mockRestore();
      URL.revokeObjectURL(anchor.href);
    }
  });

  it('canceling the Save dialog leaves the filesystem and notifications alone', async () => {
    pickPath = () => ({ canceled: true, filePath: null });
    await expect(saveBlobAs('draft.txt', new Blob(['draft']))).resolves.toBeNull();
    expect(calls.map(call => call.ch)).toEqual(['dialog:showSaveDialog']);
    expect(notify).not.toHaveBeenCalled();
  });

  it('reports a Save dialog failure before any write', async () => {
    pickPath = () => { throw new Error('Save dialog unavailable'); };
    await expect(saveBlobAs('draft.txt', new Blob(['draft']))).rejects.toThrow('Save dialog unavailable');
    expect(calls.map(call => call.ch)).toEqual(['dialog:showSaveDialog']);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      title: "Couldn't save draft.txt", body: 'Save dialog unavailable', icon: 'error',
    }));
  });

  it('reports an unreadable export without opening a Save dialog', async () => {
    const blobUrl = URL.createObjectURL(new Blob(['draft']));
    URL.revokeObjectURL(blobUrl);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = 'draft.txt';
    anchor.click();
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      title: "Couldn't save draft.txt", icon: 'error',
    })));
    expect(calls).toEqual([]);
  });

  it('window.open of a web link goes to the system browser, not a new window', () => {
    const r = window.open('https://www.openstreetmap.org/?mlat=1', '_blank');
    expect(r).toBeNull();
    expect(calls).toEqual([{ ch: 'shell:openExternal', args: ['https://www.openstreetmap.org/?mlat=1'] }]);
  });
});
