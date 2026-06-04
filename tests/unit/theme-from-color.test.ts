import { describe, it, expect } from 'vitest';
import { generateAccentTheme, generateAccentThemeHex } from '../../src/shared/creative/themeFromColor';

const HEX = /^#[0-9a-f]{6}$/;

describe('theme from color', () => {
  it('derives a coherent theme from an accent', () => {
    const t = generateAccentTheme({ r: 74, g: 158, b: 255 });
    expect(t.accent).toBe('#4a9eff');
    expect(t.hover).toMatch(HEX);
    expect(t.active).toMatch(HEX);
    expect(t.muted).toMatch(HEX);
    expect(t.subtle).toMatch(HEX);
    expect(['#000000', '#ffffff']).toContain(t.onAccent);
    // hover lighter than active (different shades)
    expect(t.hover).not.toBe(t.active);
  });

  it('accepts hex input and rejects invalid', () => {
    expect(generateAccentThemeHex('#4a9eff')?.accent).toBe('#4a9eff');
    expect(generateAccentThemeHex('not-a-color')).toBeNull();
  });
});
