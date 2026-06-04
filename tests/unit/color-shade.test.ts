import { describe, it, expect } from 'vitest';
import { lighten, darken, withLightness, grayscale, saturate, desaturate } from '../../src/shared/creative/colorShade';

describe('color shade', () => {
  it('sets absolute lightness', () => {
    expect(withLightness({ r: 255, g: 0, b: 0 }, 100)).toEqual({ r: 255, g: 255, b: 255 });
    expect(withLightness({ r: 255, g: 0, b: 0 }, 0)).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('lightens and darkens a gray', () => {
    const gray = { r: 100, g: 100, b: 100 };
    expect(lighten(gray, 0.2).r).toBeGreaterThan(100);
    expect(darken(gray, 0.2).r).toBeLessThan(100);
  });

  it('grayscale removes saturation', () => {
    expect(grayscale({ r: 255, g: 0, b: 0 })).toEqual({ r: 128, g: 128, b: 128 });
  });

  it('saturate/desaturate move toward/away from gray', () => {
    const muted = desaturate({ r: 255, g: 0, b: 0 }, 0.5);
    // desaturated red is less pure red (green/blue channels rise)
    expect(muted.g).toBeGreaterThan(0);
    const resat = saturate(muted, 1);
    expect(resat.r).toBeGreaterThan(muted.r); // redder again
    expect(resat.g).toBeLessThan(muted.g);
  });
});
