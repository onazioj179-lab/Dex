// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// `.dex-theme-dark` pins a subtree (Imosion) to the dark palette. It must cover
// every neutral token light mode overrides, with exactly the :root value, and
// must never pin the accent (a custom accent has to flow through).
//
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const css = fs.readFileSync(path.join(root, 'src/renderer/styles/design-system.css'), 'utf8');

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('\n}', start));
}
const decls = (b: string) =>
  new Map([...b.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]));

const NEUTRAL = /^--color-(bg|text|border|surface|scrim|success|warning|error)/;

describe('.dex-theme-dark', () => {
  const dark = decls(block(':root'));
  const pin = decls(block('.dex-theme-dark'));
  const lightNames = new Set<string>();
  for (const m of css.matchAll(/^\[data-theme="light"\], \.light-mode \{/gm)) {
    const b = css.slice(m.index!, css.indexOf('\n}', m.index!));
    for (const k of decls(b).keys()) lightNames.add(k);
  }

  it('re-declares every neutral token light mode overrides', () => {
    const needed = [...lightNames].filter((n) => NEUTRAL.test(n));
    expect(needed.length).toBeGreaterThan(20);
    for (const n of needed) expect(pin.has(n), n).toBe(true);
  });

  it('uses exactly the :root (dark) values', () => {
    for (const [n, v] of pin) expect(v, n).toBe(dark.get(n));
  });

  it('does not pin the accent', () => {
    for (const n of pin.keys()) expect(n.startsWith('--color-accent'), n).toBe(false);
  });

  it('is applied to Imosion', () => {
    const src = fs.readFileSync(path.join(root, 'src/renderer/DEXAPPLICATIONS/imosion/Imosion.tsx'), 'utf8');
    expect(src).toContain('className="imosion-root dex-theme-dark"');
  });
});
