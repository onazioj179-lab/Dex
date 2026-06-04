import { describe, it, expect } from 'vitest';
import { colorForKey, hexForKey, chipColorForKey, paletteForKeys } from '../../src/shared/creative/projectColors';

const HEX = /^#[0-9a-f]{6}$/;

describe('project colors', () => {
  it('is deterministic per key', () => {
    expect(hexForKey('Project Alpha')).toBe(hexForKey('Project Alpha'));
    expect(colorForKey('x')).toEqual(colorForKey('x'));
    expect(hexForKey('anything')).toMatch(HEX);
  });

  it('different keys usually differ', () => {
    expect(hexForKey('alpha')).not.toBe(hexForKey('zeta'));
  });

  it('chip color pairs bg with readable fg', () => {
    const chip = chipColorForKey('design');
    expect(chip.bg).toMatch(HEX);
    expect(['#000000', '#ffffff']).toContain(chip.fg);
  });

  it('palette maps each key', () => {
    const pal = paletteForKeys(['a', 'b']);
    expect(Object.keys(pal)).toEqual(['a', 'b']);
    expect(pal.a).toMatch(HEX);
  });
});
