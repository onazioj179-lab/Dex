// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Local media must load through dexmedia in the desktop app (file:// is blocked
// from http://tauri.localhost), and round-trip back to the native path.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { installMediaLinkGuard, isMediaUrl, mediaPathOf, toMediaUrl, MEDIA_ORIGIN } from '../../src/renderer/utils/mediaUrl';
import { fileUrlToPath } from '../../src/renderer/utils/exifParser';

describe('toMediaUrl', () => {
  it('desktop: paths and file:// URLs become dexmedia URLs', () => {
    const a = toMediaUrl('C:\\Users\\me\\Pictures\\a b#1.jpg', true);
    expect(a.startsWith(`${MEDIA_ORIGIN}/`)).toBe(true);
    expect(a).not.toContain(' ');
    expect(a).not.toContain('#');
    expect(mediaPathOf(a)).toBe('C:\\Users\\me\\Pictures\\a b#1.jpg');
    expect(mediaPathOf(toMediaUrl('file://C:/Users/me/x.png', true))).toBe('C:/Users/me/x.png');
    expect(mediaPathOf(toMediaUrl('file:///C:/Users/me/x.png', true))).toBe('C:/Users/me/x.png');
  });

  it('leaves web, blob, data and app-relative URLs alone', () => {
    for (const u of ['https://x.example/a.jpg', 'blob:http://tauri.localhost/1', 'data:image/png;base64,AA', '/imagewallpapers/a.avif', '']) {
      expect(toMediaUrl(u, true)).toBe(u);
    }
  });

  it('outside the desktop app keeps file:// (web preview, tests)', () => {
    expect(toMediaUrl('C:\\x\\a.jpg', false)).toBe('file:///C:/x/a.jpg');
    expect(toMediaUrl('file://C:/x/a.jpg', false)).toBe('file://C:/x/a.jpg');
  });

  it('native fs calls get the path back from any Gallery URL', () => {
    expect(fileUrlToPath(toMediaUrl('C:\\p\\a.jpg', true))).toBe('C:\\p\\a.jpg');
    expect(fileUrlToPath('file:///C:/p/a.jpg')).toBe('C:/p/a.jpg');
    expect(fileUrlToPath('C:\\p\\a.jpg')).toBe('C:\\p\\a.jpg');
    expect(isMediaUrl(toMediaUrl('C:\\p\\a.jpg', true))).toBe(true);
    expect(isMediaUrl('https://example.com')).toBe(false);
  });
});

describe('installMediaLinkGuard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('a click on a dexmedia link never navigates', () => {
    const off = installMediaLinkGuard();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no fetch in test'));
    const a = document.createElement('a');
    a.href = toMediaUrl('C:\\p\\a.jpg', true);
    document.body.appendChild(a);
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    // Ordinary links are untouched.
    const b = document.createElement('a');
    b.href = 'https://example.com/';
    document.body.appendChild(b);
    const ev2 = new MouseEvent('click', { bubbles: true, cancelable: true });
    b.dispatchEvent(ev2);
    expect(ev2.defaultPrevented).toBe(false);
    off();
    a.remove(); b.remove();
  });
});
