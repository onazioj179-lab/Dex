/**
 * @vitest-environment node
 */
// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Guard for the radius scale (0 · 4 · 6 · 10 · 14 · 18 · 24 · full). Every inline
// radius in the renderer is on the scale; any new off-scale value fails this
// test. Fix with: node scripts/snap-radius-to-scale.mjs <path>.
//
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error -- plain .mjs script without type declarations
import { snapSource, snapRadius } from '../../scripts/snap-radius-to-scale.mjs';

const BASELINE = 0; // 2026-11-01: every inline radius in the renderer is on the scale

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(tsx|ts)$/.test(e.name) ? [p] : [];
  });
}

describe('radius scale', () => {
  it('snaps to the nearest step and keeps hairlines, circles and pills', () => {
    expect([3, 5, 7, 8, 9, 11, 12, 16, 20, 30].map(snapRadius)).toEqual([4, 6, 6, 10, 10, 10, 14, 18, 18, 24]);
    expect([0, 1, 2, 4, 50, 999, 9999].map(snapRadius)).toEqual([0, 1, 2, 4, 50, 9999, 9999]);
  });

  it('does not add new off-scale inline radii', () => {
    const root = path.resolve(__dirname, '../../src/renderer');
    const offScale = walk(root).reduce((n, f) => n + snapSource(fs.readFileSync(f, 'utf8')).changes, 0);
    expect(offScale, 'off-scale borderRadius count rose; use a scale value').toBeLessThanOrEqual(BASELINE);
  }, 60_000); // scans every renderer source file; generous budget for loaded CI/dev machines
});
