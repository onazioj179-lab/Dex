// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

import { describe, expect, it } from 'vitest';
import {
  clampWindowToWorkspace,
  fitWindowToWorkspace,
  getWorkspaceBounds,
  isSameWindowBounds,
} from '../../src/shared/shell/windowLayout';

describe('windowLayout', () => {
  it('reserves top chrome, dock, stage strip, and padding', () => {
    const bounds = getWorkspaceBounds(
      { width: 1440, height: 900 },
      { topReserve: 34, dockReserve: 76, leftReserve: 72, padding: 6 },
    );
    expect(bounds).toEqual({ x: 78, y: 40, w: 1356, h: 778 });
  });

  it('fits preferred windows inside the workspace', () => {
    const workspace = { x: 10, y: 20, w: 800, h: 500 };
    const fitted = fitWindowToWorkspace({ w: 1200, h: 900 }, workspace);
    expect(fitted).toEqual({ x: 10, y: 20, w: 800, h: 500 });
  });

  it('clamps cascaded windows back on screen', () => {
    const workspace = { x: 50, y: 50, w: 600, h: 400 };
    const clamped = clampWindowToWorkspace({ x: 900, y: 900, w: 300, h: 260 }, workspace);
    expect(clamped).toEqual({ x: 350, y: 190, w: 300, h: 260 });
  });

  it('compares bounds with tolerance', () => {
    expect(isSameWindowBounds({ x: 0, y: 0, w: 100, h: 100 }, { x: 1, y: 0, w: 100, h: 99 }, 1)).toBe(true);
    expect(isSameWindowBounds({ x: 0, y: 0, w: 100, h: 100 }, { x: 2, y: 0, w: 100, h: 100 }, 1)).toBe(false);
  });
});