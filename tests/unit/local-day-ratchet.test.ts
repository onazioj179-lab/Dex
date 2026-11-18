// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * @vitest-environment node
 */
// A calendar day shown to people is the LOCAL day. `toISOString().slice(0, 10)`
// is the UTC day (tomorrow, in the evening west of UTC): use toLocalDateInput.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(tsx|ts)$/.test(e.name) ? [p] : [];
  });
}

describe('local calendar day', () => {
  it('no UTC day formatting in the renderer', () => {
    const root = path.resolve(__dirname, '../../src/renderer');
    const bad = walk(root).filter((f) => /toISOString\(\)\.(slice\(0, ?10\)|split\('T'\)\[0\]|substring\(0, ?10\))/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(root, f).split(path.sep).join('/'));
    expect(bad).toEqual([]);
  }, 60_000);
});
