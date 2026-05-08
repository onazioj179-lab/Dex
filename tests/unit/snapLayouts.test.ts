// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { snapTo, zoneFromDropPoint, nextInCycle } from '../../src/shared/shell/snapLayouts';

const WORKSPACE = { x: 0, y: 0, width: 1920, height: 1080 };

describe('snapLayouts', () => {
  describe('snapTo zones', () => {
    it('left-half occupies the left half', () => {
      const r = snapTo('left-half', { workspace: WORKSPACE });
      expect(r.x).toBe(0);
      expect(r.width).toBe(960);
      expect(r.height).toBe(1080);
    });
    it('right-half occupies the right half', () => {
      const r = snapTo('right-half', { workspace: WORKSPACE });
      expect(r.x).toBe(960);
      expect(r.width).toBe(960);
    });
    it('top-left quadrant', () => {
      const r = snapTo('top-left', { workspace: WORKSPACE });
      expect(r.x).toBe(0);
      expect(r.y).toBe(0);
      expect(r.width).toBe(960);
      expect(r.height).toBe(540);
    });
    it('bottom-right quadrant', () => {
      const r = snapTo('bottom-right', { workspace: WORKSPACE });
      expect(r.x).toBe(960);
      expect(r.y).toBe(540);
      expect(r.width).toBe(960);
      expect(r.height).toBe(540);
    });
    it('left-third', () => {
      const r = snapTo('left-third', { workspace: WORKSPACE });
      expect(r.x).toBe(0);
      expect(r.width).toBe(640);
      expect(r.height).toBe(1080);
    });
    it('right-two-thirds', () => {
      const r = snapTo('right-two-thirds', { workspace: WORKSPACE });
      expect(r.x).toBe(640);
      expect(r.width).toBe(1280);
    });
    it('maximize occupies the entire workspace', () => {
      const r = snapTo('maximize', { workspace: WORKSPACE });
      expect(r).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    });
    it('center keeps current frame size and centers it', () => {
      const r = snapTo('center', { workspace: WORKSPACE }, { x: 0, y: 0, width: 800, height: 600 });
      expect(r.width).toBe(800);
      expect(r.height).toBe(600);
      expect(r.x).toBe(560);
      expect(r.y).toBe(240);
    });
    it('restore returns the current frame unchanged', () => {
      const cur = { x: 100, y: 100, width: 400, height: 300 };
      const r = snapTo('restore', { workspace: WORKSPACE }, cur);
      expect(r).toEqual(cur);
    });
    it('respects gutter', () => {
      const r = snapTo('left-half', { workspace: WORKSPACE, gutter: 10 });
      expect(r.x).toBe(10);
      expect(r.y).toBe(10);
      // halfW = (1920 - 30) / 2 = 945
      expect(r.width).toBe(945);
      expect(r.height).toBe(1060);
    });
    it('clamps results to within the workspace', () => {
      const tiny = { x: 0, y: 0, width: 100, height: 100 };
      const r = snapTo('right-half', { workspace: tiny });
      expect(r.x + r.width).toBeLessThanOrEqual(100);
      expect(r.y + r.height).toBeLessThanOrEqual(100);
    });
  });

  describe('zoneFromDropPoint', () => {
    it('returns null when point is outside the workspace', () => {
      expect(zoneFromDropPoint({ x: -5, y: 10 }, WORKSPACE)).toBeNull();
      expect(zoneFromDropPoint({ x: 100, y: 99999 }, WORKSPACE)).toBeNull();
    });
    it('returns top-left for the top-left corner', () => {
      expect(zoneFromDropPoint({ x: 5, y: 5 }, WORKSPACE)).toBe('top-left');
    });
    it('returns top-right for the top-right corner', () => {
      expect(zoneFromDropPoint({ x: 1915, y: 5 }, WORKSPACE)).toBe('top-right');
    });
    it('returns left-half for the middle-left edge', () => {
      expect(zoneFromDropPoint({ x: 5, y: 540 }, WORKSPACE)).toBe('left-half');
    });
    it('returns right-half for the middle-right edge', () => {
      expect(zoneFromDropPoint({ x: 1915, y: 540 }, WORKSPACE)).toBe('right-half');
    });
    it('returns maximize when dropped at top-edge center', () => {
      expect(zoneFromDropPoint({ x: 960, y: 5 }, WORKSPACE)).toBe('maximize');
    });
    it('returns null for points away from any edge', () => {
      expect(zoneFromDropPoint({ x: 960, y: 540 }, WORKSPACE)).toBeNull();
    });
  });

  describe('nextInCycle', () => {
    it('cycles left-half -> left-third -> left-two-thirds -> left-half', () => {
      expect(nextInCycle('left-half')).toBe('left-third');
      expect(nextInCycle('left-third')).toBe('left-two-thirds');
      expect(nextInCycle('left-two-thirds')).toBe('left-half');
    });
    it('cycles right-half similarly', () => {
      expect(nextInCycle('right-half')).toBe('right-third');
      expect(nextInCycle('right-third')).toBe('right-two-thirds');
      expect(nextInCycle('right-two-thirds')).toBe('right-half');
    });
    it('returns the same zone when the zone has no cycle peers', () => {
      expect(nextInCycle('maximize')).toBe('maximize');
      expect(nextInCycle('center')).toBe('center');
    });
  });
});
