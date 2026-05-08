import { describe, it, expect } from 'vitest';
import { cacheKey, IDENTITY_TRANSFORM, type SmartObject } from '../../src/shared/image/smartObject';
import { develop, DEFAULT_DEVELOP } from '../../src/shared/image/develop';
import { newStroke, processSample, type BrushSettings } from '../../src/shared/image/brushDynamics';

describe('Wave 3 — Prism image editor depth', () => {
  describe('SmartObject cacheKey', () => {
    const baseObj: SmartObject = {
      id: 'so1', sourceAssetId: 'asset-1',
      transform: IDENTITY_TRANSFORM, filters: [],
      blendMode: 'normal', opacity: 1, visible: true,
    };
    it('is stable for identical input', () => {
      const k1 = cacheKey(baseObj);
      const k2 = cacheKey({ ...baseObj });
      expect(k1).toBe(k2);
      expect(k1).toMatch(/^[0-9a-f]{16}$/);
    });
    it('changes when filters change', () => {
      const k1 = cacheKey(baseObj);
      const k2 = cacheKey({
        ...baseObj,
        filters: [{ id: 'f1', kind: 'invert' }],
      });
      expect(k1).not.toBe(k2);
    });
    it('changes when opacity changes', () => {
      const k1 = cacheKey(baseObj);
      const k2 = cacheKey({ ...baseObj, opacity: 0.5 });
      expect(k1).not.toBe(k2);
    });
  });

  describe('develop pipeline', () => {
    it('default settings approximately preserve input', () => {
      const [r, g, b] = develop(0.5, 0.5, 0.5, DEFAULT_DEVELOP);
      expect(r).toBeCloseTo(0.5, 2);
      expect(g).toBeCloseTo(0.5, 2);
      expect(b).toBeCloseTo(0.5, 2);
    });
    it('positive exposure brightens', () => {
      const [r] = develop(0.2, 0.2, 0.2, { ...DEFAULT_DEVELOP, exposure: 1 });
      expect(r).toBeGreaterThan(0.3);
    });
  });

  describe('brush dynamics', () => {
    it('emits dabs as the stroke moves', () => {
      const brush: BrushSettings = {
        size: 10, hardness: 1, opacity: 1, flow: 1, spacing: 0.25,
        sizeDynamic: { min: 1, max: 1, source: 'pressure' },
      };
      const state = newStroke();
      const dabs = [];
      for (let i = 0; i < 50; i++) {
        const out = processSample(state, { x: i * 5, y: 0, t: i * 16, pressure: 1, tilt: 0 }, brush);
        dabs.push(...out);
      }
      expect(dabs.length).toBeGreaterThan(0);
    });
  });
});
