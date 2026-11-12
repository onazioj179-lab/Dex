import { describe, it, expect } from 'vitest';
import { applyChromatic, applyVignette, vignetteFactor } from '../../src/renderer/DEXAPPLICATIONS/flux/postEffects';

const img = (w: number, h: number, fill: (x: number, y: number) => [number, number, number, number]) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(fill(x, y), (y * w + x) * 4);
  return { data, width: w, height: h };
};

describe('Flux post effects', () => {
  it('chromatic aberration splits red and blue around an edge', () => {
    const im = img(20, 1, x => (x >= 10 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
    applyChromatic(im, { amount: 3, angle: 0 });
    const px = (x: number) => Array.from(im.data.slice(x * 4, x * 4 + 3));
    expect(px(11)).toEqual([0, 255, 255]);   // red shifted right: still dark at 11
    expect(px(8)).toEqual([0, 0, 255]);      // blue pulled left from 11
    expect(px(15)).toEqual([255, 255, 255]); // flat area unchanged
  });

  it('vignette keeps the centre and darkens corners', () => {
    expect(vignetteFactor(50, 50, 101, 101, { amount: 0.8, feather: 0.5 })).toBe(1);
    expect(vignetteFactor(0, 0, 101, 101, { amount: 0.8, feather: 0.5 })).toBeCloseTo(0.2, 5);
    const im = img(11, 11, () => [200, 200, 200, 255]);
    applyVignette(im, { amount: 1, feather: 0.5 });
    expect(im.data[(5 * 11 + 5) * 4]).toBe(200);
    expect(im.data[0]).toBe(0);
  });

  it('zero amount is a no-op', () => {
    const im = img(4, 4, (x, y) => [x * 40, y * 40, 7, 255]);
    const before = Array.from(im.data);
    applyChromatic(im, { amount: 0 });
    applyVignette(im, { amount: 0 });
    expect(Array.from(im.data)).toEqual(before);
  });
});
