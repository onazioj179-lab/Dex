// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { smartSnap, sanitizeObjects } from '../../src/renderer/DEXAPPLICATIONS/standalone/canvasObjects';

describe('Canvas smart guides and locking', () => {
  const other = { x: 100, y: 100, w: 100, h: 50 };
  it('snaps a nearby left edge and vertical centre, and reports the guides', () => {
    const r = smartSnap({ x: 104, y: 200, w: 40, h: 40 }, [other], 6);
    expect(r.dx).toBe(-4);
    expect(r.guides).toContainEqual({ axis: 'x', at: 100 });
    const c = smartSnap({ x: 300, y: 103, w: 40, h: 40 }, [other], 6); // centre 123 vs other's 125
    expect(c.dy).toBe(2);
    expect(c.guides).toContainEqual({ axis: 'y', at: 125 });
  });
  it('does nothing beyond the threshold and with no other objects', () => {
    expect(smartSnap({ x: 120, y: 400, w: 7, h: 7 }, [other], 2)).toEqual({ dx: 0, dy: 0, guides: [] });
    expect(smartSnap({ x: 1, y: 1, w: 1, h: 1 }, [], 6)).toEqual({ dx: 0, dy: 0, guides: [] });
  });
  it('keeps the locked flag through save/load, and only true counts', () => {
    const o = sanitizeObjects([{ id: 'a', kind: 'rect', x: 0, y: 0, w: 40, h: 40, text: '', color: '#000', locked: true }, { id: 'b', kind: 'rect', x: 0, y: 0, w: 40, h: 40, text: '', color: '#000', locked: 'yes' }]);
    expect(o[0].locked).toBe(true);
    expect(o[1].locked).toBeUndefined();
  });
});
