import { describe, it, expect } from 'vitest';
import { easingNames, namedEasing, easeNamed, easingCss } from '../../src/shared/creative/easingNamed';

describe('named easings', () => {
  it('lists known easings', () => {
    const names = easingNames();
    expect(names).toContain('ease');
    expect(names).toContain('ease-in-out');
    expect(names).toContain('tahoe');
  });

  it('linear is identity; ease-in-out symmetric at midpoint', () => {
    expect(easeNamed('linear', 0.5)).toBeCloseTo(0.5, 6);
    expect(easeNamed('ease-in-out', 0.5)).toBeCloseTo(0.5, 3);
  });

  it('pins endpoints', () => {
    expect(easeNamed('ease', 0)).toBe(0);
    expect(easeNamed('ease', 1)).toBe(1);
  });

  it('falls back to linear for unknown names', () => {
    expect(easeNamed('nope', 0.3)).toBeCloseTo(0.3, 6);
  });

  it('emits a cubic-bezier css string', () => {
    expect(easingCss('ease')).toBe('cubic-bezier(0.25, 0.1, 0.25, 1)');
  });
});
