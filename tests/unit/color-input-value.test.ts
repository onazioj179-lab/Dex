// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// <input type="color"> takes only #rrggbb. Apps passed theme tokens
// ("var(--color-text-primary)"), so the swatch showed black and the picker
// opened on the wrong colour (found by the e2e console probe, 2026-11-14).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { colorInputValue } from '../../src/renderer/utils/canvasTheme';

describe('colorInputValue', () => {
  it('keeps and lowercases #rrggbb, expands #rgb, drops alpha', () => {
    expect(colorInputValue('#0A84FF')).toBe('#0a84ff');
    expect(colorInputValue('#fa0')).toBe('#ffaa00');
    expect(colorInputValue('#fa08')).toBe('#ffaa00');
    expect(colorInputValue('#0a84ffcc')).toBe('#0a84ff');
  });

  it('turns rgb() and rgba() into hex', () => {
    expect(colorInputValue('rgb(10, 132, 255)')).toBe('#0a84ff');
    expect(colorInputValue('rgba(255,255,255,0.92)')).toBe('#ffffff');
    expect(colorInputValue('rgb(300 -4 12.6)')).toBe('#ff000d');
  });

  it('resolves theme tokens instead of passing var() through', () => {
    const v = colorInputValue('var(--color-text-primary)');
    expect(v).toMatch(/^#[0-9a-f]{6}$/);
    expect(colorInputValue('var(--color-accent)')).toBe('#0a84ff');
  });

  it('falls back for empty values', () => {
    expect(colorInputValue(undefined, '#123456')).toBe('#123456');
    expect(colorInputValue('', '#123456')).toBe('#123456');
  });

  it('every colour input in the app goes through it', () => {
    const R = join(__dirname, '../../src/renderer');
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.tsx') ? [join(d, e.name)] : []);
    const bad: string[] = [];
    for (const f of walk(R)) {
      const s = readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '');
      for (const m of s.matchAll(/<input\b[^>]*?type="color"[\s\S]*?\/>/g)) {
        if (!/\b(value|defaultValue)=\{colorInputValue\(/.test(m[0])) bad.push(`${f.slice(R.length + 1)}: ${m[0].replace(/\s+/g, ' ').slice(0, 90)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
