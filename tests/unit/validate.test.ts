// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { isEmail, isUrl, isHexColor, isNonEmpty, inNumericRange } from '../../src/shared/format/validate';

describe('validators', () => {
  it('isEmail', () => {
    expect(isEmail('a@b.com')).toBe(true);
    expect(isEmail('onazi@gmail.com')).toBe(true);
    expect(isEmail('bad')).toBe(false);
    expect(isEmail('a@b')).toBe(false);
  });

  it('isUrl', () => {
    expect(isUrl('https://x.com')).toBe(true);
    expect(isUrl('http://localhost:3000/path')).toBe(true);
    expect(isUrl('ftp://x.com')).toBe(false);
    expect(isUrl('notaurl')).toBe(false);
    expect(isUrl('')).toBe(false);
  });

  it('isHexColor', () => {
    expect(isHexColor('#fff')).toBe(true);
    expect(isHexColor('#aabbcc')).toBe(true);
    expect(isHexColor('aabbcc')).toBe(true);
    expect(isHexColor('#aabbccdd')).toBe(true);
    expect(isHexColor('#xyz')).toBe(false);
  });

  it('isNonEmpty and inNumericRange', () => {
    expect(isNonEmpty('  ')).toBe(false);
    expect(isNonEmpty('x')).toBe(true);
    expect(inNumericRange(5, 0, 10)).toBe(true);
    expect(inNumericRange(11, 0, 10)).toBe(false);
    expect(inNumericRange(Number.NaN, 0, 10)).toBe(false);
  });
});
