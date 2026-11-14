// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// PRISM's Asset Library inserted an empty `shape` layer for every shape,
// pattern and gradient; the compositor draws only layers with pixels, so each
// insert was invisible. Items are now rendered to pixels (assetRender.ts).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shapePoints, ASSET_SHAPES, ASSET_GRADIENTS, GRADIENT_STOPS } from '../../src/renderer/DEXAPPLICATIONS/prism/assetRender';

describe('PRISM asset rendering', () => {
  it('polygon shapes have the right corner count and stay inside the box', () => {
    expect(shapePoints('Triangle')).toHaveLength(3);
    expect(shapePoints('Diamond')).toHaveLength(4);
    expect(shapePoints('Pentagon')).toHaveLength(5);
    expect(shapePoints('Star')).toHaveLength(10);
    for (const name of ASSET_SHAPES) {
      for (const [x, y] of shapePoints(name) ?? []) {
        expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(1);
      }
    }
  });

  it('every gradient has real colour stops', () => {
    for (const g of ASSET_GRADIENTS) {
      expect(GRADIENT_STOPS[g].length).toBeGreaterThanOrEqual(2);
      for (const c of GRADIENT_STOPS[g]) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('the panel inserts rendered image layers, not empty shape layers', () => {
    const src = readFileSync(join(__dirname, '../../src/renderer/DEXAPPLICATIONS/prism/Prism.tsx'), 'utf8');
    expect(src).toContain('renderAsset(assetCategory');
    expect(src).not.toMatch(/type: 'shape' as const[^;]*imageData: undefined/);
  });
});
