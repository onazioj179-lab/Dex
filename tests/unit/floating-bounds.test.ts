// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unit tests for per-app floating-window position memory (shell/floatingBounds):
 * save/restore round-trip, rounding, maximized-rect detection, invalid-input
 * rejection, and persistence to localStorage.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getFloatingBounds,
  saveFloatingBounds,
  forgetFloatingBounds,
  isMaximizedRect,
} from '../../src/renderer/shell/floatingBounds';

beforeEach(() => { try { localStorage.clear(); } catch { /* jsdom */ } });

describe('saveFloatingBounds / getFloatingBounds', () => {
  it('round-trips a rect, rounded', () => {
    saveFloatingBounds('notes', { x: 100.4, y: 200.6, w: 640.2, h: 480.9 });
    expect(getFloatingBounds('notes')).toEqual({ x: 100, y: 201, w: 640, h: 481 });
  });

  it('returns null for an app with no memory', () => {
    expect(getFloatingBounds('axl')).toBeNull();
  });

  it('persists to localStorage so it survives a reload', () => {
    saveFloatingBounds('imosion', { x: 10, y: 20, w: 300, h: 400 });
    const raw = localStorage.getItem('dex-floating-bounds');
    expect(raw && JSON.parse(raw).imosion).toEqual({ x: 10, y: 20, w: 300, h: 400 });
  });

  it('overwrites an app\'s previous rect', () => {
    saveFloatingBounds('notes', { x: 0, y: 0, w: 100, h: 100 });
    saveFloatingBounds('notes', { x: 50, y: 60, w: 200, h: 200 });
    expect(getFloatingBounds('notes')).toEqual({ x: 50, y: 60, w: 200, h: 200 });
  });

  it('rejects invalid rects (zero/negative size, non-finite)', () => {
    saveFloatingBounds('bad', { x: 0, y: 0, w: 0, h: 100 });
    saveFloatingBounds('bad', { x: 0, y: 0, w: 100, h: -5 });
    saveFloatingBounds('bad', { x: NaN, y: 0, w: 100, h: 100 });
    expect(getFloatingBounds('bad')).toBeNull();
  });

  it('forgets a stored rect', () => {
    saveFloatingBounds('notes', { x: 1, y: 2, w: 3, h: 4 });
    forgetFloatingBounds('notes');
    expect(getFloatingBounds('notes')).toBeNull();
  });
});

describe('isMaximizedRect', () => {
  const ws = { x: 0, y: 66, w: 1280, h: 734 };

  it('true when the rect fills the workspace (within tolerance)', () => {
    expect(isMaximizedRect({ x: 0, y: 66, w: 1280, h: 734 }, ws)).toBe(true);
    expect(isMaximizedRect({ x: 2, y: 68, w: 1277, h: 731 }, ws)).toBe(true); // within 6px
  });

  it('false for a genuine floating rect', () => {
    expect(isMaximizedRect({ x: 200, y: 150, w: 640, h: 480 }, ws)).toBe(false);
  });

  it('false when only one edge is off by more than tolerance', () => {
    expect(isMaximizedRect({ x: 0, y: 66, w: 1000, h: 734 }, ws)).toBe(false);
  });
});
