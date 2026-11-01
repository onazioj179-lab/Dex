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
// Ratchet for the radius scale (0 · 4 · 6 · 8 · 11 · 14 · 18 · full). The shell
// surfaces are on-scale; individual apps still carry legacy values. New
// off-scale inline radii fail this test, and the baseline only goes DOWN:
// fix some (node scripts/snap-radius-to-scale.mjs <path>) and lower it.
//
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error -- plain .mjs script without type declarations
import { snapSource, snapRadius } from '../../scripts/snap-radius-to-scale.mjs';

const BASELINE = 888; // 2026-11-01, after snapping Settings/Store/shell/dock/launcher

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(tsx|ts)$/.test(e.name) ? [p] : [];
  });
}

describe('radius scale', () => {
  it('snaps toward the tighter step and keeps hairlines, circles and pills', () => {
    expect([3, 5, 7, 9, 10, 12, 16, 24].map(snapRadius)).toEqual([4, 4, 6, 8, 8, 11, 14, 18]);
    expect([0, 1, 2, 4, 50, 999, 9999].map(snapRadius)).toEqual([0, 1, 2, 4, 50, 9999, 9999]);
  });

  it('does not add new off-scale inline radii', () => {
    const root = path.resolve(__dirname, '../../src/renderer');
    const offScale = walk(root).reduce((n, f) => n + snapSource(fs.readFileSync(f, 'utf8')).changes, 0);
    expect(offScale, 'off-scale borderRadius count rose; use a scale value').toBeLessThanOrEqual(BASELINE);
  });
});
