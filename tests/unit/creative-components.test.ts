// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { collectComponent, instantiateComponent } from '../../src/renderer/DEXAPPLICATIONS/standalone/creativeStudio/componentLibrary';
import type { BoardObject } from '../../src/renderer/DEXAPPLICATIONS/standalone/canvasObjects';

const o = (id: string, kind: BoardObject['kind'], x: number, y: number, w = 100, h = 100, extra: Partial<BoardObject> = {}): BoardObject => ({ id, kind, x, y, w, h, text: id, color: '#000', ...extra });

describe('component library', () => {
  const board = [
    o('f', 'frame', 100, 100, 400, 300),
    o('a', 'sticky', 120, 120), o('b', 'rect', 300, 200),
    o('out', 'sticky', 900, 900),
    o('c1', 'connector', 0, 0, 0, 0, { from: 'a', to: 'b' }),
    o('c2', 'connector', 0, 0, 0, 0, { from: 'a', to: 'out' }),
  ];

  it('a frame brings what is inside it and the connectors between them, relative to its corner', () => {
    const c = collectComponent(board, 'f');
    expect(c.map((x) => x.id).sort()).toEqual(['a', 'b', 'c1', 'f']);
    expect(c.find((x) => x.id === 'f')).toMatchObject({ x: 0, y: 0 });
    expect(c.find((x) => x.id === 'a')).toMatchObject({ x: 20, y: 20 });
  });

  it('a single object is just itself; connectors alone are not components', () => {
    expect(collectComponent(board, 'out').map((x) => x.id)).toEqual(['out']);
    expect(collectComponent(board, 'c1')).toEqual([]);
  });

  it('inserting makes fresh copies at the point, with connectors pointing at the copies', () => {
    const c = { objects: collectComponent(board, 'f') };
    const placed = instantiateComponent(c, { x: 1000, y: 50 });
    const ids = new Set(placed.map((x) => x.id));
    expect(placed.some((x) => ['f', 'a', 'b', 'c1'].includes(x.id))).toBe(false);
    const conn = placed.find((x) => x.kind === 'connector')!;
    expect(ids.has(conn.from!) && ids.has(conn.to!)).toBe(true);
    expect(placed.find((x) => x.kind === 'frame')).toMatchObject({ x: 1000, y: 50 });
    // Two insertions never share ids.
    const again = instantiateComponent(c, { x: 0, y: 0 });
    expect(again.some((x) => ids.has(x.id))).toBe(false);
  });
});
