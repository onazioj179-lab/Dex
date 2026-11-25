// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  tuckEdgeFor, tuckAlong, slitRect, poppedOrb, distanceToRect, EDGE_PAD,
} from '../../src/renderer/components/floatingLauncherGeometry';

const VW = 1280, VH = 800, S = 44;

describe('orb edge tuck', () => {
  it('tucks into the nearest wall, and stays free in the middle', () => {
    expect(tuckEdgeFor(10, 400, VW, VH, S)).toBe('left');
    expect(tuckEdgeFor(VW - S - 5, 300, VW, VH, S)).toBe('right');
    expect(tuckEdgeFor(600, 8, VW, VH, S)).toBe('top');
    expect(tuckEdgeFor(600, VH - S - 20, VW, VH, S)).toBe('bottom');
    expect(tuckEdgeFor(600, 400, VW, VH, S)).toBeNull();
  });

  it('picks the closer wall in a corner and keeps the orb inside the corner', () => {
    expect(tuckEdgeFor(4, VH - S - 20, VW, VH, S)).toBe('left');
    expect(tuckEdgeFor(20, VH - S - 2, VW, VH, S)).toBe('bottom');
    expect(tuckAlong('left', 0, VH, VW, VH, S)).toBe(VH - EDGE_PAD - S / 2);
    expect(tuckAlong('top', -50, 0, VW, VH, S)).toBe(EDGE_PAD + S / 2);
  });

  it('draws the slit flush with its wall and bigger when the pointer is near', () => {
    expect(slitRect('left', 400, VW, VH)).toEqual({ left: 0, top: 378, width: 6, height: 44 });
    expect(slitRect('right', 400, VW, VH, true)).toEqual({ left: VW - 10, top: 368, width: 10, height: 64 });
    expect(slitRect('bottom', 640, VW, VH).top).toBe(VH - 6);
  });

  it('slides the orb out of and back past the edge', () => {
    expect(poppedOrb('left', 400, VW, VH, S, true)).toEqual({ x: EDGE_PAD, y: 378 });
    expect(poppedOrb('left', 400, VW, VH, S, false).x).toBeLessThan(-S);
    expect(poppedOrb('bottom', 640, VW, VH, S, true)).toEqual({ x: 618, y: VH - S - EDGE_PAD });
  });

  it('measures pointer distance to the slit', () => {
    const r = slitRect('left', 400, VW, VH);
    expect(distanceToRect(3, 400, r)).toBe(0);
    expect(distanceToRect(106, 400, r)).toBe(100);
  });
});
