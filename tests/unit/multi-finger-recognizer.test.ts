// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { gestureRecognizer } from '../../src/renderer/utils/TouchInputSystem';

function pe(type: string, id: number, x: number, y: number): Event {
  const e = new Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
  Object.assign(e, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, isPrimary: id === 1, pressure: 0.5, width: 10, height: 10, tiltX: 0, tiltY: 0, twist: 0, button: 0 });
  return e;
}

const seen: Array<{ fingers?: number; kind?: string }> = [];
beforeAll(() => {
  gestureRecognizer.attach(document.body);
  gestureRecognizer.on('multi-finger', (g) => { seen.push({ fingers: g.fingers, kind: g.kind }); });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('multi-finger gestures from real pointer events', () => {
  it('four fingers tapping fire one 4-finger tap', async () => {
    seen.length = 0;
    const ids = [1, 2, 3, 4];
    ids.forEach((id) => document.body.dispatchEvent(pe('pointerdown', id, 100 + id * 40, 300)));
    await sleep(60);
    ids.forEach((id) => document.body.dispatchEvent(pe('pointerup', id, 100 + id * 40, 300)));
    expect(seen).toEqual([{ fingers: 4, kind: 'tap' }]);
  });

  it('five fingers pinching fire one 5-finger pinch', async () => {
    seen.length = 0;
    const pts = [0, 1, 2, 3, 4].map((i) => ({ id: 10 + i, a: (i / 5) * Math.PI * 2 }));
    pts.forEach((p, i) => document.body.dispatchEvent(pe('pointerdown', p.id, 500 + 150 * Math.cos(p.a), 400 + 150 * Math.sin(p.a) + (i === 0 ? 0 : 0))));
    pts.forEach((p) => document.body.dispatchEvent(pe('pointermove', p.id, 500 + 40 * Math.cos(p.a), 400 + 40 * Math.sin(p.a))));
    await sleep(10);
    pts.forEach((p) => document.body.dispatchEvent(pe('pointerup', p.id, 500 + 40 * Math.cos(p.a), 400 + 40 * Math.sin(p.a))));
    expect(seen).toEqual([{ fingers: 5, kind: 'pinch' }]);
  });

  it('a normal one-finger tap is not a multi-finger gesture', async () => {
    seen.length = 0;
    document.body.dispatchEvent(pe('pointerdown', 30, 50, 50));
    await sleep(60);
    document.body.dispatchEvent(pe('pointerup', 30, 50, 50));
    expect(seen).toEqual([]);
  });
});
