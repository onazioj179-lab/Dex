// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unit tests for AXL's alignment-snap inference (utils/alignSnap):
 * per-axis pull onto other part centers within tolerance, grid quantization
 * of unsnapped axes, first-match-wins, Alt/free bypass, snap-disabled mode,
 * and guide generation for the viewport inference lines.
 */
import { describe, it, expect } from 'vitest';
import { alignSnapPosition } from '../../src/renderer/DEXAPPLICATIONS/axl/utils/alignSnap';

const opts = { tolerance: 5, gridSnap: 10, snapEnabled: true, free: false };

describe('alignSnapPosition', () => {
  it('pulls an axis onto another part center within tolerance', () => {
    const { position, guides } = alignSnapPosition(
      { x: 103, y: 47, z: 0 },
      [{ id: 'b', position: { x: 100, y: 200, z: 0 } }],
      opts,
    );
    expect(position.x).toBe(100);          // snapped to b.x (|103-100| < 5)
    expect(position.y).toBe(50);           // no candidate near 47 -> grid 10
    expect(guides).toHaveLength(2);        // x aligned AND z aligned (both 0)
    expect(guides.map(g => g.axis).sort()).toEqual(['x', 'z']);
    expect(guides[0].b).toEqual({ x: 100, y: 200, z: 0 });
  });

  it('leaves axes outside tolerance to grid quantization', () => {
    const { position, guides } = alignSnapPosition(
      { x: 112, y: 47, z: 3 },
      [{ id: 'b', position: { x: 100, y: 200, z: 50 } }],
      opts,
    );
    expect(position).toEqual({ x: 110, y: 50, z: 0 });
    expect(guides).toHaveLength(0);
  });

  it('first candidate wins per axis', () => {
    const { position } = alignSnapPosition(
      { x: 102, y: 0, z: 0 },
      [
        { id: 'b', position: { x: 100, y: 500, z: 500 } },
        { id: 'c', position: { x: 104, y: 500, z: 500 } },
      ],
      opts,
    );
    expect(position.x).toBe(100);
  });

  it('free (Alt) bypasses both alignment and grid snapping', () => {
    const { position, guides } = alignSnapPosition(
      { x: 103, y: 47.3, z: 1.2 },
      [{ id: 'b', position: { x: 100, y: 200, z: 0 } }],
      { ...opts, free: true },
    );
    expect(position).toEqual({ x: 103, y: 47.3, z: 1.2 });
    expect(guides).toHaveLength(0);
  });

  it('snapEnabled=false keeps grid snap but drops alignment', () => {
    const { position, guides } = alignSnapPosition(
      { x: 103, y: 47, z: 0 },
      [{ id: 'b', position: { x: 100, y: 200, z: 0 } }],
      { ...opts, snapEnabled: false },
    );
    expect(position).toEqual({ x: 100, y: 50, z: 0 }); // 103 -> grid 100, not b.x
    expect(guides).toHaveLength(0);
  });

  it('guides carry the FINAL moved-part center', () => {
    const { position, guides } = alignSnapPosition(
      { x: 103, y: 47, z: 500 },
      [{ id: 'b', position: { x: 100, y: 200, z: 300 } }],
      opts,
    );
    const gx = guides.find(g => g.axis === 'x')!;
    expect(gx.a).toEqual(position);
  });

  it('can snap different axes to different parts', () => {
    const { position, guides } = alignSnapPosition(
      { x: 102, y: 201, z: 500 },
      [
        { id: 'b', position: { x: 100, y: 900, z: 900 } },
        { id: 'c', position: { x: 900, y: 200, z: 900 } },
      ],
      opts,
    );
    expect(position.x).toBe(100);
    expect(position.y).toBe(200);
    expect(position.z).toBe(500);
    expect(guides.map(g => g.axis).sort()).toEqual(['x', 'y']);
  });
});
