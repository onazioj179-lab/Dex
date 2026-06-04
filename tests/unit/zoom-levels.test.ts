import { describe, it, expect } from 'vitest';
import {
  clampZoom, nextZoom, prevZoom, fitZoom, zoomPercent, MIN_ZOOM, MAX_ZOOM,
} from '../../src/shared/creative/zoomLevels';

describe('zoom levels', () => {
  it('clamps into range', () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(1000)).toBe(MAX_ZOOM);
    expect(clampZoom(1.5)).toBe(1.5);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it('steps to next/prev stops', () => {
    expect(nextZoom(1)).toBe(1.25);
    expect(nextZoom(MAX_ZOOM)).toBe(MAX_ZOOM);
    expect(prevZoom(1)).toBe(0.75);
    expect(prevZoom(MIN_ZOOM)).toBe(MIN_ZOOM);
  });

  it('fits content into a viewport', () => {
    expect(fitZoom({ width: 200, height: 100 }, { width: 100, height: 100 })).toBe(0.5);
    expect(fitZoom({ width: 0, height: 0 }, { width: 100, height: 100 })).toBe(1);
  });

  it('formats a percentage', () => {
    expect(zoomPercent(1.5)).toBe('150%');
    expect(zoomPercent(0.25)).toBe('25%');
  });
});
