// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  normalizeDockEdge,
  normalizeDockPreset,
  normalizeDockAlign,
} from '../../src/shared/shell/dockGeometry';

describe('dockGeometry', () => {
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
      expect(normalizeDockPreset('floating')).toBe('floating');
    });
    it('falls back to regular for unknown values', () => {
      expect(normalizeDockPreset('huge')).toBe('regular');
      expect(normalizeDockPreset(null)).toBe('regular');
    });
  });

  describe('normalizeDockAlign', () => {
    it('accepts valid alignments', () => {
      expect(normalizeDockAlign('start')).toBe('start');
      expect(normalizeDockAlign('center')).toBe('center');
      expect(normalizeDockAlign('end')).toBe('end');
    });
    it('falls back to center for unknown values', () => {
      expect(normalizeDockAlign('middle')).toBe('center');
      expect(normalizeDockAlign(null)).toBe('center');
      expect(normalizeDockAlign(undefined)).toBe('center');
    });
  });
});
