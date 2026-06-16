// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseAccentColor,
  deriveAccentFamily,
  applyAccentFamily,
} from '../../src/renderer/utils/accentFamily';

beforeEach(() => {
  const root = document.documentElement;
  for (const p of ['--color-accent', '--accent-color', '--color-accent-hover', '--color-accent-dark', '--color-accent-light', '--color-accent-soft']) {
    root.style.removeProperty(p);
  }
});

describe('accentFamily.parseAccentColor', () => {
  it('parses 6-digit hex', () => {
    expect(parseAccentColor('#4A9EFF')).toEqual({ r: 74, g: 158, b: 255 });
  });
  it('parses 3-digit hex', () => {
    expect(parseAccentColor('#abc')).toEqual({ r: 170, g: 187, b: 204 });
  });
  it('parses rgb() and rgba()', () => {
    expect(parseAccentColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseAccentColor('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30 });
  });
  it('rejects a self-referential var sentinel and junk', () => {
    expect(parseAccentColor('var(--color-accent)')).toBeNull();
    expect(parseAccentColor('not a color')).toBeNull();
  });
});

describe('accentFamily.deriveAccentFamily', () => {
  it('produces the full family with lighter hover and darker pressed', () => {
    const fam = deriveAccentFamily('#4A9EFF');
    expect(fam).not.toBeNull();
    expect(fam!.base).toBe('rgb(74, 158, 255)');
    // hover mixes toward white, dark mixes toward black
    expect(fam!.hover).toBe('rgb(114, 179, 255)');
    expect(fam!.dark).toBe('rgb(58, 123, 199)');
    expect(fam!.light).toBe('rgba(74, 158, 255, 0.14)');
    expect(fam!.soft).toBe('rgba(74, 158, 255, 0.08)');
  });
  it('returns null for an unparseable colour', () => {
    expect(deriveAccentFamily('var(--color-accent)')).toBeNull();
  });
});

describe('accentFamily.applyAccentFamily', () => {
  it('writes the family to <html> and reports success', () => {
    const ok = applyAccentFamily('#10B981');
    expect(ok).toBe(true);
    const s = document.documentElement.style;
    expect(s.getPropertyValue('--color-accent')).toBe('rgb(16, 185, 129)');
    expect(s.getPropertyValue('--color-accent-light')).toBe('rgba(16, 185, 129, 0.14)');
  });
  it('leaves the DOM untouched on an unparseable colour', () => {
    const ok = applyAccentFamily('var(--color-accent)');
    expect(ok).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe('');
  });
});
