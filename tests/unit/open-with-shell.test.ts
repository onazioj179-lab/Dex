// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Shell opens read the native reply and say why they failed (#61).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { openWithShell, shellFailure } from '../../src/renderer/utils/openWithShell';
import { framesFit } from '../../src/renderer/DEXAPPLICATIONS/standalone/PixelArt';

const setBridge = (invoke?: (...a: unknown[]) => Promise<unknown>) => { (globalThis as any).dex = invoke ? { invoke } : undefined; };
function captureToasts() {
  const out: string[] = [];
  const on = (e: Event) => out.push((e as CustomEvent).detail?.message);
  window.addEventListener('dex-toast', on);
  return { out, stop: () => window.removeEventListener('dex-toast', on) };
}

describe('shellFailure', () => {
  it('reads {success:false}, Electron error strings, and treats the rest as success', () => {
    expect(shellFailure({ success: false, error: 'File not found' })).toBe('File not found');
    expect(shellFailure({ success: false })).toBe('the system refused');
    expect(shellFailure('No application is associated')).toBe('No application is associated');
    expect(shellFailure('')).toBeNull();
    expect(shellFailure({ success: true })).toBeNull();
    expect(shellFailure(undefined)).toBeNull();
  });
});

describe('openWithShell', () => {
  afterEach(() => { setBridge(undefined); vi.restoreAllMocks(); });

  it('calls the right channel and returns true on success', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    setBridge(invoke);
    expect(await openWithShell('reveal', 'C:/x.png')).toBe(true);
    expect(invoke).toHaveBeenCalledWith('shell:showItemInFolder', 'C:/x.png');
    expect(await openWithShell('path', 'pictures', 'Pictures')).toBe(true);
    expect(invoke).toHaveBeenLastCalledWith('shell:openPath', 'pictures');
  });

  it('says why when the native side refuses', async () => {
    setBridge(vi.fn().mockResolvedValue({ success: false, error: 'path is outside the allowed folders' }));
    const t = captureToasts();
    expect(await openWithShell('path', 'C:/Windows/x.exe', 'x.exe')).toBe(false);
    t.stop();
    expect(t.out).toEqual(["Couldn't open x.exe: path is outside the allowed folders."]);
  });

  it('reports a rejected call', async () => {
    setBridge(vi.fn().mockRejectedValue(new Error('ipc down')));
    const t = captureToasts();
    expect(await openWithShell('external', 'https://example.com', 'the site')).toBe(false);
    t.stop();
    expect(t.out[0]).toBe("Couldn't open the site: ipc down.");
  });

  it('without the bridge: links open in a tab, files say they need the DEX app', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    expect(await openWithShell('external', 'https://example.com')).toBe(true);
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
    const t = captureToasts();
    expect(await openWithShell('reveal', 'C:/a.txt', 'a.txt')).toBe(false);
    t.stop();
    expect(t.out[0]).toMatch(/needs the DEX app/);
  });
});

describe('Pixel Art stored frames', () => {
  const grid = (n: number, v: string | null = null) => Array.from({ length: n }, () => Array.from({ length: n }, () => v));
  it('accepts size x size grids of colours or null', () => {
    expect(framesFit([grid(8), grid(8, '#fff')], 8)).toBe(true);
  });
  it('refuses wrong sizes, ragged rows, bad pixels, no frames and too many frames', () => {
    expect(framesFit([grid(16)], 8)).toBe(false);
    const ragged = grid(8); ragged[3] = ragged[3].slice(0, 5);
    expect(framesFit([ragged], 8)).toBe(false);
    const bad = grid(8) as unknown[][]; bad[0][0] = 42;
    expect(framesFit([bad], 8)).toBe(false);
    expect(framesFit([], 8)).toBe(false);
    expect(framesFit('x', 8)).toBe(false);
    expect(framesFit(Array.from({ length: 9 }, () => grid(8)), 8)).toBe(false);
  });
});
