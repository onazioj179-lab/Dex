// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { boundingBox, mergeBoxes, expandToInclude, boxCenter } from '../../src/shared/math/bbox';

describe('bbox', () => {
  it('computes bounds of points', () => {
    expect(boundingBox([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 3, y: 8 }]))
      .toEqual({ x: 0, y: 0, width: 10, height: 8 });
    expect(boundingBox([])).toBeNull();
  });

  it('merges boxes', () => {
    expect(mergeBoxes({ x: 0, y: 0, width: 5, height: 5 }, { x: 10, y: 10, width: 5, height: 5 }))
      .toEqual({ x: 0, y: 0, width: 15, height: 15 });
    expect(mergeBoxes(null, { x: 1, y: 1, width: 2, height: 2 })).toEqual({ x: 1, y: 1, width: 2, height: 2 });
  });

  it('expands to include a point', () => {
    expect(expandToInclude({ x: 0, y: 0, width: 10, height: 10 }, { x: 15, y: 5 }))
      .toEqual({ x: 0, y: 0, width: 15, height: 10 });
    expect(expandToInclude(null, { x: 5, y: 5 })).toEqual({ x: 5, y: 5, width: 0, height: 0 });
  });

  it('box center', () => {
    expect(boxCenter({ x: 0, y: 0, width: 10, height: 10 })).toEqual({ x: 5, y: 5 });
  });
});
