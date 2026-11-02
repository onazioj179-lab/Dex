// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Canvas whiteboard objects: creation, connectors, deletion cascade, snapping,
// stacking and validation of stored data.
//
import { describe, it, expect } from 'vitest';
import {
  createObject, createConnector, edgePoint, connectorEnds, removeObjects, paintOrder,
  sanitizeObjects, snapValue, textOn,
} from '../../src/renderer/DEXAPPLICATIONS/standalone/canvasObjects';

describe('canvas whiteboard objects', () => {
  it('creates objects centred on the point with sensible defaults', () => {
    const s = createObject('sticky', { x: 500, y: 400 }, '#FFE58F');
    expect([s.x + s.w / 2, s.y + s.h / 2]).toEqual([500, 400]);
    expect(s.kind).toBe('sticky');
    expect(createObject('frame', { x: 0, y: 0 }, '#000').text).toBe('Frame');
  });

  it('connects box edges, not centres', () => {
    const a = createObject('rect', { x: 100, y: 100 }, '#000', { w: 100, h: 100 });
    const b = createObject('rect', { x: 500, y: 100 }, '#000', { w: 100, h: 100 });
    const c = createConnector(a.id, b.id, '#000');
    const ends = connectorEnds(c, new Map([[a.id, a], [b.id, b]]))!;
    expect(ends.a).toEqual({ x: 150, y: 100 }); // a's right edge
    expect(ends.b).toEqual({ x: 450, y: 100 }); // b's left edge
    expect(edgePoint(a, 100, 1000)).toEqual({ x: 100, y: 150 }); // bottom edge
  });

  it('deleting an object removes its connectors', () => {
    const a = createObject('sticky', { x: 0, y: 0 }, '#fff');
    const b = createObject('sticky', { x: 300, y: 0 }, '#fff');
    const c = createConnector(a.id, b.id, '#000');
    expect(removeObjects([a, b, c], new Set([a.id])).map((o) => o.id)).toEqual([b.id]);
  });

  it('paints frames behind connectors behind everything else', () => {
    const f = createObject('frame', { x: 0, y: 0 }, '#000');
    const s = createObject('sticky', { x: 0, y: 0 }, '#fff');
    const c = createConnector(s.id, f.id, '#000');
    expect(paintOrder([s, c, f]).map((o) => o.kind)).toEqual(['frame', 'connector', 'sticky']);
  });

  it('snaps to the 20px grid only when snapping is on', () => {
    expect(snapValue(29, true)).toBe(20);
    expect(snapValue(31, true)).toBe(40);
    expect(snapValue(29.4, false)).toBe(29);
  });

  it('keeps sticky text readable on any fill', () => {
    expect(textOn('#FFE58F')).toBe('#1D1D1F');
    expect(textOn('#1C1C1E')).toBe('#FFFFFF');
  });

  it('drops malformed or unsafe stored objects', () => {
    const ok = createObject('text', { x: 0, y: 0 }, '#000');
    const out = sanitizeObjects([
      ok,
      { id: 'x', kind: 'nope' },
      { id: 'i', kind: 'image', x: 0, y: 0, w: 10, h: 10, src: 'javascript:alert(1)' },
      { id: 'c', kind: 'connector', from: 'a' },
      null,
    ]);
    expect(out.map((o) => o.id)).toEqual([ok.id]);
    expect(sanitizeObjects('garbage')).toEqual([]);
  });
});
