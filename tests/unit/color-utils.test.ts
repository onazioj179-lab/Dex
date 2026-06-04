import { describe, it, expect } from 'vitest';
import {
  hexToRgb, rgbToHex, rgbToHsl, hslToRgb,
  contrastRatio, wcagLevel, relativeLuminance,
} from '../../src/shared/creative/colorUtils';

describe('color utils', () => {
  it('parses hex (3 and 6 digit) and rejects bad input', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('4a9eff')).toEqual({ r: 74, g: 158, b: 255 });
    expect(hexToRgb('nope')).toBeNull();
  });

  it('round-trips rgb<->hex', () => {
    expect(rgbToHex({ r: 74, g: 158, b: 255 })).toBe('#4a9eff');
    expect(rgbToHex({ r: 300, g: -5, b: 128 })).toBe('#ff0080'); // clamped
  });

  it('round-trips rgb<->hsl approximately (integer HSL drifts a few units)', () => {
    const rgb = { r: 74, g: 158, b: 255 };
    const hsl = rgbToHsl(rgb);
    const back = hslToRgb(hsl);
    expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(5);
    expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(5);
    expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(5);
  });

  it('computes luminance extremes', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 3);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 3);
  });

  it('computes WCAG contrast and levels', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(wcagLevel('#000000', '#ffffff')).toBe('AAA');
    expect(wcagLevel('#777777', '#808080')).toBe('fail');
  });
});
