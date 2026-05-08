// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  computeDockGeometry,
  normalizeDockEdge,
  normalizeDockPreset,
  nearestEdge,
} from '../../src/shared/shell/dockGeometry';

describe('dockGeometry', () => {
  describe('computeDockGeometry', () => {
    it('positions bottom dock with row layout', () => {
      const g = computeDockGeometry({ edge: 'bottom', preset: 'regular', visible: true });
      expect(g.flexDirection).toBe('row');
      expect(g.positionStyle.bottom).toBeDefined();
      expect(g.positionStyle.left).toBe('50%');
      expect(g.visibleTransform).toContain('translateX(-50%)');
      expect(g.hiddenTransform).toContain('translateY(');
    });

    it('positions top dock with row layout', () => {
      const g = computeDockGeometry({ edge: 'top', preset: 'regular', visible: true });
      expect(g.flexDirection).toBe('row');
      expect(g.positionStyle.top).toBeDefined();
      expect(g.hiddenTransform).toContain('-');
    });

    it('positions left dock with column layout', () => {
      const g = computeDockGeometry({ edge: 'left', preset: 'regular', visible: true });
      expect(g.flexDirection).toBe('column');
      expect(g.positionStyle.left).toBeDefined();
      expect(g.positionStyle.top).toBe('50%');
      expect(g.visibleTransform).toContain('translateY(-50%)');
    });

    it('positions right dock with column layout', () => {
      const g = computeDockGeometry({ edge: 'right', preset: 'regular', visible: true });
      expect(g.flexDirection).toBe('column');
      expect(g.positionStyle.right).toBeDefined();
    });

    it('compact preset shrinks icons + padding', () => {
      const compact = computeDockGeometry({ edge: 'bottom', preset: 'compact', visible: true });
      const regular = computeDockGeometry({ edge: 'bottom', preset: 'regular', visible: true });
      expect(compact.iconSize).toBeLessThan(regular.iconSize);
      expect(compact.paddingX).toBeLessThan(regular.paddingX);
      expect(compact.borderRadius).toBeLessThan(regular.borderRadius);
      expect(compact.magnificationScale).toBe(1.0); // no magnify in compact
    });

    it('large preset grows icons + magnification', () => {
      const large = computeDockGeometry({ edge: 'bottom', preset: 'large', visible: true });
      const regular = computeDockGeometry({ edge: 'bottom', preset: 'regular', visible: true });
      expect(large.iconSize).toBeGreaterThan(regular.iconSize);
      expect(large.magnificationScale).toBeGreaterThan(regular.magnificationScale);
    });
  });

  describe('normalizeDockEdge', () => {
    it('accepts valid edges', () => {
      expect(normalizeDockEdge('top')).toBe('top');
      expect(normalizeDockEdge('bottom')).toBe('bottom');
      expect(normalizeDockEdge('left')).toBe('left');
      expect(normalizeDockEdge('right')).toBe('right');
    });
    it('falls back to bottom for unknown values', () => {
      expect(normalizeDockEdge('center')).toBe('bottom');
      expect(normalizeDockEdge(null)).toBe('bottom');
      expect(normalizeDockEdge(undefined)).toBe('bottom');
      expect(normalizeDockEdge(42)).toBe('bottom');
    });
  });

  describe('normalizeDockPreset', () => {
    it('accepts valid presets', () => {
      expect(normalizeDockPreset('compact')).toBe('compact');
      expect(normalizeDockPreset('regular')).toBe('regular');
      expect(normalizeDockPreset('large')).toBe('large');
    });
    it('falls back to regular for unknown values', () => {
      expect(normalizeDockPreset('huge')).toBe('regular');
      expect(normalizeDockPreset(null)).toBe('regular');
    });
  });

  describe('nearestEdge', () => {
    const W = 1920;
    const H = 1080;
    it('returns top when cursor is near top edge', () => {
      expect(nearestEdge(960, 5, W, H)).toBe('top');
    });
    it('returns bottom when cursor is near bottom edge', () => {
      expect(nearestEdge(960, H - 5, W, H)).toBe('bottom');
    });
    it('returns left when cursor is near left edge', () => {
      expect(nearestEdge(5, 540, W, H)).toBe('left');
    });
    it('returns right when cursor is near right edge', () => {
      expect(nearestEdge(W - 5, 540, W, H)).toBe('right');
    });
  });
});
