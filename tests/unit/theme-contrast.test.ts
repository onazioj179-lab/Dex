// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Ratchet: theme text tokens stay readable (WCAG AA 4.5:1) on every surface and
// fill they are drawn on, in BOTH themes. Users reported unclear text in light
// mode: secondary/tertiary passed on white but failed on the grey fills.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, '../../src/renderer/styles/design-system.css'), 'utf8').split('\r\n').join('\n');

function block(selectorStart: string): Record<string, string> {
  const i = css.indexOf(selectorStart);
  if (i < 0) throw new Error('missing block ' + selectorStart);
  const body = css.slice(css.indexOf('{', i) + 1, css.indexOf('\n}', i));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) out[m[1]] = m[2];
  return out;
}
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const TEXT = ['--color-text-primary', '--color-text-secondary', '--color-text-tertiary', '--color-text-muted'];

describe('theme text contrast', () => {
  it('light: every text token >= 4.5:1 on every light surface and fill', () => {
    const t = block('[data-theme="light"], .light-mode {\n  /* Backgrounds');
    expect(t['--color-text-tertiary']).toBeTruthy();
    const fills = ['--color-bg-base', '--color-bg-surface', '--color-bg-inset', '--color-bg-hover', '--color-bg-active', '--color-bg-secondary', '--color-bg-tertiary', '--color-border-subtle'];
    const bad: string[] = [];
    for (const fg of TEXT) for (const bg of fills) {
      if (!t[fg] || !t[bg]) continue;
      const r = ratio(t[fg], t[bg]);
      if (r < 4.5) bad.push(`${fg} ${t[fg]} on ${bg} ${t[bg]} = ${r.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
    expect(ratio(t['--color-success'], '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('dark: every text token >= 4.5:1 on the dark surfaces', () => {
    const t = block(':root {');
    expect(t['--color-text-tertiary']).toBeTruthy(); // the block was found
    const surfaces = ['#000000', '#1C1C1E', '#2C2C2E'];
    const bad: string[] = [];
    for (const fg of TEXT) for (const bg of surfaces) {
      if (!t[fg]) continue;
      const r = ratio(t[fg], bg);
      if (r < 4.5) bad.push(`${fg} ${t[fg]} on ${bg} = ${r.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });
});
