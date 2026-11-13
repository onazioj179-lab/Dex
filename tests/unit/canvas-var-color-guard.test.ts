// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Canvas 2D silently ignores `var(--token)` colours (the previous colour stays),
// so assigning one draws the wrong colour or nothing (Flux shapes drew black on
// black). Use canvasColor / resolveCanvasColor from utils/canvasTheme.ts.
const root = join(__dirname, '..', '..', 'src', 'renderer');
const files: string[] = [];
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (n !== 'node_modules') walk(p); }
    else if (/\.(ts|tsx)$/.test(n)) files.push(p);
  }
};
walk(root);

describe('canvas colours never use CSS var()', () => {
  it('no fillStyle/strokeStyle/shadowColor is assigned a literal var() colour', () => {
    const bad: string[] = [];
    const re = /\b(fillStyle|strokeStyle|shadowColor)\s*=\s*[^;\n]*['"`]var\(--/;
    for (const f of files) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (re.test(line) && !line.includes('resolveCanvasColor') && !line.trim().startsWith('*') && !line.trim().startsWith('//')) bad.push(`${f.slice(root.length + 1)}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  }, 60_000); // reads every renderer file: slow on a busy machine
});
