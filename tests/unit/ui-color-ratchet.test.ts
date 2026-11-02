// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Ratchet for hard-coded colours in UI chrome. Counts bare hex values (not
// `var(--token, #fallback)` fallbacks) in colour/background/border style props
// across the renderer, excluding places where hex is the right tool: the
// creative suite's own studio palettes, theme preset definitions, the terminal
// ANSI palette and colour/drawing tools. Use design tokens
// (--color-bg-*, --color-text-*, --color-border*, --color-accent / -fill,
// --color-success/warning/error) for new UI; lower BASELINE when you convert.
//
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const BASELINE = 283; // 2026-11-01, after the shell light-mode sweep (was 308)

const EXCLUDE = ['imosion', 'prism', 'flux', 'forge', 'vinx', 'axl', 'ThemeManager.tsx', 'Terminal.tsx', 'ColorPicker', 'PixelArt', 'Canvas.tsx', 'ColorWheel'];
const PROP = /(color|background|backgroundColor|borderColor|border|borderTop|borderBottom|borderLeft|borderRight|outline)\s*:\s*'([^']*)'/g;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const VAR_FALLBACK = /var\([^()]*\)/g;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name.endsWith('.tsx') ? [p] : [];
  });
}

export function countUiHex(source: string): number {
  let n = 0;
  for (const m of source.matchAll(PROP)) n += (m[2].replace(VAR_FALLBACK, '').match(HEX) || []).length;
  return n;
}

describe('UI colour tokens', () => {
  it('counts only bare hex, not token fallbacks', () => {
    expect(countUiHex(`{ color: 'var(--color-text-primary, #fff)', background: '#123456', border: '1px solid #abc' }`)).toBe(2);
  });

  it('does not add new hard-coded colours to UI chrome', () => {
    const root = path.resolve(__dirname, '../../src/renderer');
    const total = walk(root)
      .filter((f) => !EXCLUDE.some((x) => f.includes(x)))
      .reduce((n, f) => n + countUiHex(fs.readFileSync(f, 'utf8')), 0);
    expect(total, 'hard-coded UI colour count rose; use a design token').toBeLessThanOrEqual(BASELINE);
  }, 60_000);
});
