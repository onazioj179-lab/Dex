// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unit tests for AXL's alignment-snap inference (utils/alignSnap):
 * nearest-candidate-wins per axis (center / face-touch / face-flush),
 * grid quantization of unsnapped axes, Alt/free bypass, snap-disabled mode,
 * guide generation, and primitive half-extent derivation.
 */
import { describe, it, expect } from 'vitest';
import { alignSnapPosition, primitiveHalfExtents } from '../../src/renderer/DEXAPPLICATIONS/axl/utils/alignSnap';

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
    expect(guides.map(g => g.axis).sort()).toEqual(['x', 'z']); // x AND z (both 0) align
    expect(guides.every(g => g.kind === 'center')).toBe(true);
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

  it('nearest candidate wins per axis', () => {
    const { position } = alignSnapPosition(
      { x: 103.5, y: 0, z: 0 },
      [
        { id: 'b', position: { x: 100, y: 500, z: 500 } },
        { id: 'c', position: { x: 104, y: 500, z: 500 } },
      ],
      opts,
    );
    expect(position.x).toBe(104); // |103.5-104| < |103.5-100|
  });

  it('face-touch: snaps so faces meet when extents are known', () => {
    // Other: 100-wide box at x=0 (half 50). Moved: 60-wide (half 30).
    // Touch candidate at 0 + (50+30) = 80.
    const { position, guides } = alignSnapPosition(
      { x: 78, y: 500, z: 500 },
      [{ id: 'b', position: { x: 0, y: 0, z: 0 }, halfExtents: { x: 50, y: 50, z: 50 } }],
      { ...opts, movedHalfExtents: { x: 30, y: 30, z: 30 } },
    );
    expect(position.x).toBe(80);
    expect(guides.find(g => g.axis === 'x')!.kind).toBe('touch');
  });

  it('face-flush: aligns faces on the same plane', () => {
    // Flush candidate at 0 + (50-30) = 20 (right faces at x=50 for both).
    const { position, guides } = alignSnapPosition(
      { x: 22, y: 500, z: 500 },
      [{ id: 'b', position: { x: 0, y: 0, z: 0 }, halfExtents: { x: 50, y: 50, z: 50 } }],
      { ...opts, movedHalfExtents: { x: 30, y: 30, z: 30 } },
    );
    expect(position.x).toBe(20);
    expect(guides.find(g => g.axis === 'x')!.kind).toBe('flush');
  });

  it('without extents only center candidates exist', () => {
    const { position } = alignSnapPosition(
      { x: 78, y: 500, z: 500 },
      [{ id: 'b', position: { x: 0, y: 0, z: 0 } }],
      { ...opts, movedHalfExtents: undefined },
    );
    expect(position.x).toBe(80); // grid, not the 78->80 touch (no extents known)
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

describe('primitiveHalfExtents', () => {
  const unit = { x: 1, y: 1, z: 1 };

  it('box uses width/height/depth', () => {
    expect(primitiveHalfExtents('box', { width: 100, height: 40, depth: 60 }, unit))
      .toEqual({ x: 50, y: 20, z: 30 });
  });

  it('cylinder uses radius for x/z and height for y', () => {
    expect(primitiveHalfExtents('cylinder', { radius: 25, height: 80 }, unit))
      .toEqual({ x: 25, y: 40, z: 25 });
  });

  it('sphere is uniform', () => {
    expect(primitiveHalfExtents('sphere', { radius: 30 }, unit))
      .toEqual({ x: 30, y: 30, z: 30 });
  });

  it('applies part scale', () => {
    expect(primitiveHalfExtents('box', { width: 100, height: 100, depth: 100 }, { x: 2, y: 0.5, z: 1 }))
      .toEqual({ x: 100, y: 25, z: 50 });
  });

  it('falls back to a 50-cube for unknown primitives', () => {
    expect(primitiveHalfExtents(undefined, {}, unit)).toEqual({ x: 25, y: 25, z: 25 });
  });
});
