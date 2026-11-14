// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// VINX kept imported media as blob: URLs (dead after a restart, unreadable by
// native tools) and a dropped file's "path" was only its name in the desktop
// app, so dropped clips never played. Desktop import now stores the disk path
// and plays it through the dexmedia protocol; drops use a blob URL.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mimeForName } from '../../src/renderer/DEXAPPLICATIONS/vinx/MediaBrowser';
import { toMediaUrl } from '../../src/renderer/utils/mediaUrl';

const read = (p: string) => readFileSync(join(__dirname, '../../src/renderer', p), 'utf8');

describe('VINX media paths', () => {
  it('derives the media family from a picked file name', () => {
    expect(mimeForName('C:/clips/a.MP4')).toBe('video/mp4');
    expect(mimeForName('take.mov')).toBe('video/quicktime');
    expect(mimeForName('vo.mp3')).toBe('audio/mpeg');
    expect(mimeForName('still.JPG')).toBe('image/jpeg');
    expect(mimeForName('notes.txt')).toBe('');
  });

  it('disk paths become dexmedia URLs in the desktop app; blob URLs pass through', () => {
    expect(toMediaUrl('C:\\clips\\a b.mp4', true)).toMatch(/^http:\/\/dexmedia\.localhost\/|^dexmedia:/);
    expect(toMediaUrl('blob:http://tauri.localhost/123', true)).toBe('blob:http://tauri.localhost/123');
  });

  it('every place VINX loads media maps the stored path first, with CORS for the canvas', () => {
    const viewer = read('DEXAPPLICATIONS/vinx/Viewer.tsx');
    expect(viewer).toMatch(/const src = toMediaUrl\(/);
    expect(viewer).toMatch(/crossOrigin="anonymous"/);
    expect(read('DEXAPPLICATIONS/vinx/Vinx.tsx')).toMatch(/decodeAudioToMono\(toMediaUrl\(media\.path\)\)/);
    expect(read('DEXAPPLICATIONS/vinx/MediaBrowser.tsx')).toMatch(/dialog:showOpenDialog/);
  });

  it('a drop without a real path plays from the dropped File', () => {
    expect(read('utils/useFileDrop.ts')).toMatch(/file: f,/);
    expect(read('DEXAPPLICATIONS/vinx/Vinx.tsx')).toMatch(/file\.path !== file\.name \? file\.path : \(file\.file \? URL\.createObjectURL\(file\.file\)/);
  });
});
