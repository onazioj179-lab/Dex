// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { extensionOf, categorize, iconHintForFile, isCategory } from '../../src/shared/format/fileType';

describe('file type', () => {
  it('extracts lowercase extension, handling paths and no-ext', () => {
    expect(extensionOf('a/b/clip.MP4')).toBe('mp4');
    expect(extensionOf('C:\\x\\photo.PNG')).toBe('png');
    expect(extensionOf('noext')).toBe('');
    expect(extensionOf('.gitignore')).toBe(''); // dotfile, no real ext
  });

  it('categorizes by extension or bare ext', () => {
    expect(categorize('photo.png')).toBe('image');
    expect(categorize('mp4')).toBe('video');
    expect(categorize('song.flac')).toBe('audio');
    expect(categorize('readme.md')).toBe('document');
    expect(categorize('main.rs')).toBe('code');
    expect(categorize('bundle.zip')).toBe('archive');
    expect(categorize('font.woff2')).toBe('font');
    expect(categorize('weird.xyz')).toBe('other');
  });

  it('gives an icon hint and category check', () => {
    expect(iconHintForFile('a.png')).toBe('gallery');
    expect(iconHintForFile('clip.mov')).toBe('videoeditor');
    expect(isCategory('x.zip', 'archive')).toBe(true);
    expect(isCategory('x.zip', 'image')).toBe(false);
  });
});
