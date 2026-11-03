// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Gallery Crop & Rotate: ratio, straighten and 90° turns all reach the saved copy.
//
import { describe, it, expect } from 'vitest';
import { cropToRatio, largestUprightRect, editedCanvasSize } from '../../src/renderer/pages/galleryEdit';

describe('cropToRatio', () => {
  it('centre-crops to the ratio and leaves free alone', () => {
    expect(cropToRatio(4000, 3000, 'free')).toEqual({ w: 4000, h: 3000 });
    expect(cropToRatio(4000, 3000, '1:1')).toEqual({ w: 3000, h: 3000 });
    expect(cropToRatio(4000, 3000, '16:9')).toEqual({ w: 4000, h: 2250 });
    expect(cropToRatio(3000, 4000, '3:2')).toEqual({ w: 3000, h: 2000 });
  });
});

describe('largestUprightRect', () => {
  it('is the whole image at 0° and shrinks as the angle grows', () => {
    expect(largestUprightRect(400, 300, 0)).toEqual({ w: 400, h: 300 });
    const r5 = largestUprightRect(400, 300, (5 * Math.PI) / 180);
    const r20 = largestUprightRect(400, 300, (20 * Math.PI) / 180);
    expect(r5.w).toBeLessThan(400);
    expect(r20.w * r20.h).toBeLessThan(r5.w * r5.h);
  });

  it('fits inside the rotated image (corners stay inside)', () => {
    const w = 400, h = 300, a = (10 * Math.PI) / 180;
    const r = largestUprightRect(w, h, a);
    // Rotate the crop's corner back into image space; it must lie inside.
    const cx = r.w / 2, cy = r.h / 2;
    for (const [x, y] of [[cx, cy], [cx, -cy], [-cx, cy], [-cx, -cy]]) {
      const ix = x * Math.cos(-a) - y * Math.sin(-a);
      const iy = x * Math.sin(-a) + y * Math.cos(-a);
      expect(Math.abs(ix)).toBeLessThanOrEqual(w / 2 + 1e-6);
      expect(Math.abs(iy)).toBeLessThanOrEqual(h / 2 + 1e-6);
    }
  });
});

describe('editedCanvasSize', () => {
  it('swaps sides for 90° and 270° turns', () => {
    expect(editedCanvasSize(400, 300, 90, 0, 'free')).toEqual({ w: 300, h: 400 });
    expect(editedCanvasSize(400, 300, 180, 0, 'free')).toEqual({ w: 400, h: 300 });
    expect(editedCanvasSize(400, 300, 270, 0, '1:1')).toEqual({ w: 300, h: 300 });
  });
  it('applies straighten before the ratio crop', () => {
    const out = editedCanvasSize(400, 300, 0, 8, '1:1');
    expect(out.w).toBe(out.h);
    expect(out.w).toBeLessThan(300);
  });
});
