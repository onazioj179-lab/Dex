// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  normalizeSeparators, basename, dirname, extname, stem, joinPath, segments,
} from '../../src/shared/format/pathUtils';

describe('path utils', () => {
  it('normalizes separators', () => {
    expect(normalizeSeparators('a\\b\\c')).toBe('a/b/c');
  });

  it('basename across separators and trailing slashes', () => {
    expect(basename('a/b/c.txt')).toBe('c.txt');
    expect(basename('C:\\x\\y.png')).toBe('y.png');
    expect(basename('a/b/')).toBe('b');
  });

  it('dirname', () => {
    expect(dirname('a/b/c.txt')).toBe('a/b');
    expect(dirname('c.txt')).toBe('');
    expect(dirname('/a')).toBe('/');
  });

  it('extname and stem', () => {
    expect(extname('a.txt')).toBe('.txt');
    expect(extname('archive.tar.gz')).toBe('.gz');
    expect(extname('noext')).toBe('');
    expect(extname('.gitignore')).toBe(''); // dotfile
    expect(stem('a/b/c.txt')).toBe('c');
    expect(stem('noext')).toBe('noext');
  });

  it('joinPath collapses slashes', () => {
    expect(joinPath('a', 'b', 'c.txt')).toBe('a/b/c.txt');
    expect(joinPath('a/', '/b')).toBe('a/b');
    expect(joinPath('/', 'a')).toBe('/a');
    expect(joinPath('a', '', 'b')).toBe('a/b');
  });

  it('segments', () => {
    expect(segments('/a/b/')).toEqual(['a', 'b']);
    expect(segments('x\\y')).toEqual(['x', 'y']);
  });
});
