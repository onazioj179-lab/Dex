import { describe, it, expect } from 'vitest';
import { pickTextColor, isLightColor, bestTextContrast } from '../../src/shared/creative/textOnColor';

describe('text on color', () => {
  it('picks dark text on light backgrounds and vice versa', () => {
    expect(pickTextColor('#ffffff')).toBe('#000000');
    expect(pickTextColor('#000000')).toBe('#ffffff');
    expect(pickTextColor({ r: 0, g: 0, b: 0 })).toBe('#ffffff');
  });

  it('classifies light backgrounds', () => {
    expect(isLightColor('#ffffff')).toBe(true);
    expect(isLightColor('#111111')).toBe(false);
  });

  it('reports the chosen contrast (≥ 1)', () => {
    expect(bestTextContrast('#ffffff')).toBeGreaterThan(10);
    expect(bestTextContrast('#808080')).toBeGreaterThanOrEqual(1);
  });
});
