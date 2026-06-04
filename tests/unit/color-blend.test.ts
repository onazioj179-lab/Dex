import { describe, it, expect } from 'vitest';
import { blendChannel, blendColors, mixColors, compositeOver } from '../../src/shared/creative/colorBlend';

const W = { r: 255, g: 255, b: 255 };
const K = { r: 0, g: 0, b: 0 };

describe('color blend', () => {
  it('blends channels per mode', () => {
    expect(blendChannel(0.5, 0.5, 'multiply')).toBe(0.25);
    expect(blendChannel(0.5, 0.5, 'screen')).toBe(0.75);
    expect(blendChannel(0.2, 0.9, 'darken')).toBe(0.2);
    expect(blendChannel(0.2, 0.9, 'lighten')).toBe(0.9);
  });

  it('multiply with black is black; screen with white is white', () => {
    expect(blendColors(W, K, 'multiply')).toEqual(K);
    expect(blendColors(W, K, 'screen')).toEqual(W);
  });

  it('darken/lighten pick channel extremes', () => {
    expect(blendColors({ r: 100, g: 100, b: 100 }, { r: 200, g: 50, b: 200 }, 'darken'))
      .toEqual({ r: 100, g: 50, b: 100 });
  });

  it('mixColors interpolates', () => {
    expect(mixColors(K, W, 0.5)).toEqual({ r: 128, g: 128, b: 128 });
    expect(mixColors(K, W, 0)).toEqual(K);
    expect(mixColors(K, W, 1)).toEqual(W);
  });

  it('compositeOver respects opacity', () => {
    expect(compositeOver(K, W, 'normal', 0)).toEqual(K);
    expect(compositeOver(K, W, 'normal', 1)).toEqual(W);
  });
});
