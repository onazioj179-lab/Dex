// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifyMultiTouch, actionFor, readGestureMap, writeGestureMap, describeSlot, slotOf, GESTURE_SLOTS, DEFAULT_GESTURE_MAP, type Contact,
} from '../../src/renderer/shell/input/multiFinger';

/** n fingers on a circle of radius r around (cx, cy), moved by (dx, dy) and scaled by k. */
function hand(n: number, opts: { r?: number; dx?: number; dy?: number; k?: number } = {}): Contact[] {
  const { r = 60, dx = 0, dy = 0, k = 1 } = opts;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const sx = 500 + r * Math.cos(a), sy = 400 + r * Math.sin(a);
    return { sx, sy, ex: 500 + dx + r * k * Math.cos(a), ey: 400 + dy + r * k * Math.sin(a) };
  });
}

beforeEach(() => localStorage.clear());

describe('multi-finger gestures', () => {
  it('recognises taps with 3 to 10 fingers', () => {
    for (let n = 3; n <= 10; n++) expect(classifyMultiTouch(hand(n), 120)).toEqual({ fingers: n, kind: 'tap' });
  });

  it('ignores 1-2 finger touches, more than 10, and slow still presses', () => {
    expect(classifyMultiTouch(hand(2), 100)).toBeNull();
    expect(classifyMultiTouch(hand(11), 100)).toBeNull();
    expect(classifyMultiTouch(hand(4), 900)).toBeNull();
  });

  it('recognises swipes in four directions', () => {
    expect(classifyMultiTouch(hand(4, { dx: -200 }), 300)).toEqual({ fingers: 4, kind: 'swipe-left' });
    expect(classifyMultiTouch(hand(4, { dx: 220 }), 300)).toEqual({ fingers: 4, kind: 'swipe-right' });
    expect(classifyMultiTouch(hand(5, { dy: -180 }), 300)).toEqual({ fingers: 5, kind: 'swipe-up' });
    expect(classifyMultiTouch(hand(5, { dy: 180 }), 300)).toEqual({ fingers: 5, kind: 'swipe-down' });
    expect(classifyMultiTouch(hand(4, { dx: 30 }), 300)).toBeNull(); // too short
  });

  it('recognises pinch and spread, even while the hand drifts', () => {
    expect(classifyMultiTouch(hand(5, { k: 0.4 }), 400)).toEqual({ fingers: 5, kind: 'pinch' });
    expect(classifyMultiTouch(hand(5, { k: 1.8, dx: 40 }), 400)).toEqual({ fingers: 5, kind: 'spread' });
    expect(classifyMultiTouch(hand(10, { r: 120, k: 0.5 }), 500)).toEqual({ fingers: 10, kind: 'pinch' });
  });

  it('maps gestures to actions with Mac-like defaults, and the user can change them', () => {
    expect(actionFor({ fingers: 5, kind: 'pinch' })).toBe('app-menu');
    expect(actionFor({ fingers: 4, kind: 'swipe-up' })).toBe('overview');
    expect(actionFor({ fingers: 3, kind: 'tap' })).toBe('ask-uki');
    expect(actionFor({ fingers: 7, kind: 'swipe-left' })).toBe('none');
    writeGestureMap({ ...readGestureMap(), '3-tap': 'search', '6-tap': 'clipboard' });
    expect(actionFor({ fingers: 3, kind: 'tap' })).toBe('search');
    expect(actionFor({ fingers: 6, kind: 'tap' })).toBe('clipboard');
    localStorage.setItem('dex-multitouch-map', JSON.stringify({ '4-tap': 'format-disk' }));
    expect(actionFor({ fingers: 4, kind: 'tap' })).toBe('search'); // invalid entries fall back
  });

  it('every offered slot has a readable name and defaults are offered', () => {
    expect(describeSlot('5-pinch')).toBe('5-finger pinch in');
    expect(describeSlot('4-swipe-left')).toBe('4-finger swipe left');
    expect(slotOf({ fingers: 10, kind: 'tap' })).toBe('10-tap');
    for (const k of Object.keys(DEFAULT_GESTURE_MAP)) expect(GESTURE_SLOTS).toContain(k);
  });
});
