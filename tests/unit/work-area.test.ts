// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { computeWorkArea, placeDock, recoverWindow, toLocal } from '../../src/shared/shell/workArea';

const base = { viewport: { width: 1440, height: 900 }, topBar: 36, dock: { edge: 'bottom' as const, reserve: 64 } };

describe('computeWorkArea', () => {
  it('keeps the top bar and the Dock strip out of the window area', () => {
    const a = computeWorkArea(base);
    expect(a.windows).toEqual({ x: 0, y: 36, w: 1440, h: 900 - 36 - 64 });
    expect(a.dockBand).toEqual({ x: 0, y: 836, w: 1440, h: 64 });
    expect(a.dockMaxLength).toBe(1440 - 16);
  });

  it('left and right Docks take a column below the top bar', () => {
    const l = computeWorkArea({ ...base, dock: { edge: 'left', reserve: 64 } });
    expect(l.windows).toEqual({ x: 64, y: 36, w: 1376, h: 864 });
    expect(l.dockBand).toEqual({ x: 0, y: 36, w: 64, h: 864 });
    expect(l.dockMaxLength).toBe(864 - 16);
    const r = computeWorkArea({ ...base, dock: { edge: 'right', reserve: 64 } });
    expect(r.windows).toEqual({ x: 0, y: 36, w: 1376, h: 864 });
    expect(r.dockBand.x).toBe(1376);
  });

  it('applies workspace padding on every side', () => {
    expect(computeWorkArea({ ...base, padding: 12 }).windows).toEqual({ x: 12, y: 48, w: 1416, h: 776 });
  });

  it('a display smaller than the minimum window keeps a usable work area', () => {
    const a = computeWorkArea({ ...base, viewport: { width: 300, height: 260 }, minWindow: { w: 320, h: 220 } });
    expect(a.windows.w).toBe(320);
    expect(a.windows.h).toBe(220);
    expect(a.windows.y).toBe(36);
  });

  it('snaps edges to whole device pixels at 125% and 150%', () => {
    const a = computeWorkArea({ ...base, topBar: 36.3, scale: 1.25, padding: 3.3 });
    expect(Number.isInteger(a.windows.y * 1.25)).toBe(true);
    expect(Number.isInteger(a.windows.h * 1.25)).toBe(true);
    const b = computeWorkArea({ ...base, topBar: 36.5, scale: 1.5 });
    expect(Number.isInteger(b.windows.y * 1.5)).toBe(true);
  });

  it('no Dock strip (fullscreen / floating) gives the whole desktop', () => {
    expect(computeWorkArea({ ...base, dock: { edge: 'bottom', reserve: 0 } }).windows).toEqual({ x: 0, y: 36, w: 1440, h: 864 });
  });
});

describe('placeDock', () => {
  const area = computeWorkArea(base);
  it('centres on the trigger', () => {
    expect(placeDock(area, 'bottom', 400, 720)).toEqual({ start: 520, length: 400 });
  });
  it('never leaves the screen when the trigger is near an edge', () => {
    expect(placeDock(area, 'bottom', 400, 30).start).toBe(8);
    expect(placeDock(area, 'bottom', 400, 1430).start).toBe(1440 - 8 - 400);
  });
  it('is never longer than the edge allows', () => {
    expect(placeDock(area, 'bottom', 5000, 720)).toEqual({ start: 8, length: 1424 });
  });
  it('a side Dock stays below the top bar', () => {
    const side = computeWorkArea({ ...base, dock: { edge: 'left', reserve: 64 } });
    expect(placeDock(side, 'left', 300, 40).start).toBe(36 + 8);
    expect(placeDock(side, 'left', 5000, 400)).toEqual({ start: 44, length: 864 - 16 });
  });
});

describe('recoverWindow', () => {
  const area = { x: 0, y: 0, w: 1000, h: 700 };
  it('pulls a window left off-screen after the display shrank back into view', () => {
    const r = recoverWindow({ x: 1800, y: 900, w: 600, h: 400 }, area);
    expect(r.x).toBeLessThanOrEqual(1000 - 120);
    expect(r.y).toBeLessThanOrEqual(700 - 40);
    expect(r.y).toBeGreaterThanOrEqual(0);
  });
  it('never puts the title bar above the work area', () => {
    expect(recoverWindow({ x: 10, y: -300, w: 400, h: 300 }, area).y).toBe(0);
  });
  it('shrinks a window larger than the work area', () => {
    expect(recoverWindow({ x: 0, y: 0, w: 3000, h: 2000 }, area)).toEqual({ x: 0, y: 0, w: 1000, h: 700 });
  });
  it('leaves a window that already fits alone', () => {
    expect(recoverWindow({ x: 100, y: 80, w: 500, h: 400 }, area)).toEqual({ x: 100, y: 80, w: 500, h: 400 });
  });
});

describe('toLocal', () => {
  it('moves a rect into a surface below the top bar', () => {
    expect(toLocal({ x: 0, y: 36, w: 10, h: 10 }, { x: 0, y: 36 })).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });
});

import { placeDockAroundTrigger } from '../../src/shared/shell/workArea';
describe('placeDockAroundTrigger', () => {
  const area = computeWorkArea({ viewport: { width: 1440, height: 900 }, topBar: 36, dock: { edge: 'bottom', reserve: 64 } });
  it('keeps the trigger where the collapsed button was', () => {
    // trigger centre 200 px into a 500 px Dock, button centred at 720
    expect(placeDockAroundTrigger(area, 'bottom', 500, 200, 720)).toEqual({ start: 520, length: 500 });
  });
  it('slides to stay on screen', () => {
    expect(placeDockAroundTrigger(area, 'bottom', 500, 450, 300).start).toBe(8);
    expect(placeDockAroundTrigger(area, 'bottom', 500, 10, 1400).start).toBe(1440 - 8 - 500);
  });
});
