// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Platform v4.0.1 - Wave G shell snap tests
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  applySnap,
  findDisplayContaining,
  detectHotCorner, detectSnapEdge,
  snapPresetForEdge, snapPresetForCorner,
  nextFocusedWindow, bringToFront,
  moveWindowToSpace,
} from '../../src/shared/shell/snap';

const wa = { x: 0, y: 0, width: 1920, height: 1080 };
const display = { id: 'd1', bounds: wa, workArea: wa, scaleFactor: 1 };

describe('snap presets', () => {
  it('left-half', () => { expect(applySnap(wa, 'left-half')).toEqual({ x: 0, y: 0, width: 960, height: 1080 }); });
  it('right-half adds remainder', () => { expect(applySnap(wa, 'right-half').x).toBe(960); });
  it('left-third', () => { expect(applySnap(wa, 'left-third').width).toBe(640); });
  it('maximize', () => { expect(applySnap(wa, 'maximize')).toEqual(wa); });
  it('center uses original size', () => {
    expect(applySnap(wa, 'center', { width: 800, height: 600 })).toEqual({ x: 560, y: 240, width: 800, height: 600 });
  });
});

describe('display lookup', () => {
  it('finds containing display', () => {
    expect(findDisplayContaining([display], { x: 100, y: 100 })?.id).toBe('d1');
  });
  it('falls back to first', () => {
    expect(findDisplayContaining([display], { x: 9999, y: 9999 })?.id).toBe('d1');
  });
});

describe('hot corner + edge', () => {
  it('detects top-left corner', () => {
    expect(detectHotCorner({ x: 1, y: 1 }, display)).toBe('top-left');
  });
  it('detects right edge', () => {
    expect(detectSnapEdge({ x: 1919, y: 540 }, display)).toBe('right');
  });
  it('returns null when away from edges', () => {
    expect(detectSnapEdge({ x: 500, y: 500 }, display)).toBeNull();
    expect(detectHotCorner({ x: 500, y: 500 }, display)).toBeNull();
  });
});

describe('preset routing', () => {
  it('left edge -> left-half', () => {
    expect(snapPresetForEdge('left')).toBe('left-half');
  });
  it('top-left corner returns same', () => {
    expect(snapPresetForCorner('top-left')).toBe('top-left');
  });
});

describe('window stack', () => {
  const stack = [
    { id: 'a', appId: 'x', zIndex: 1, minimized: false, focused: true, lastFocusedAt: 100 },
    { id: 'b', appId: 'x', zIndex: 2, minimized: false, focused: false, lastFocusedAt: 50 },
    { id: 'c', appId: 'y', zIndex: 3, minimized: true, focused: false, lastFocusedAt: 70 },
  ];
  it('next forward returns next visible', () => {
    expect(nextFocusedWindow(stack, 'forward')?.id).toBe('b');
  });
  it('skips minimized', () => {
    expect(nextFocusedWindow(stack, 'forward')?.id).not.toBe('c');
  });
  it('bringToFront updates zIndex + focus', () => {
    const next = bringToFront(stack, 'b', 200);
    expect(next.find(w => w.id === 'b')?.focused).toBe(true);
    expect(next.find(w => w.id === 'b')?.zIndex).toBe(4);
  });
});

describe('spaces', () => {
  it('moves window to space', () => {
    const spaces = [
      { id: 's1', name: 'A', windows: ['w1'] },
      { id: 's2', name: 'B', windows: [] },
    ];
    const next = moveWindowToSpace(spaces, 'w1', 's2');
    expect(next[0].windows).toEqual([]);
    expect(next[1].windows).toEqual(['w1']);
  });
});
