import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveComfort,
  applyComfort,
  setComfort,
  loadComfort,
  DEFAULT_COMFORT,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
} from '../../src/renderer/improvements500/comfortPrefs';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  const root = document.documentElement;
  root.removeAttribute('data-reduce-motion');
  root.removeAttribute('data-contrast');
  root.style.removeProperty('--dex-text-scale');
  root.style.removeProperty('font-size');
});

describe('comfortPrefs.resolveComfort', () => {
  it('auto follows the OS signals', () => {
    const eff = resolveComfort(DEFAULT_COMFORT, { reducedMotion: true, highContrast: true });
    expect(eff.reduceMotion).toBe(true);
    expect(eff.highContrast).toBe(true);
  });

  it('explicit on/off overrides the OS', () => {
    const eff = resolveComfort(
      { reduceMotion: 'off', contrast: 'high', textScale: 1 },
      { reducedMotion: true, highContrast: false },
    );
    expect(eff.reduceMotion).toBe(false); // user forced off despite OS reduce
    expect(eff.highContrast).toBe(true);  // user forced high despite OS normal
  });

  it('clamps the text scale to the allowed range', () => {
    expect(resolveComfort({ ...DEFAULT_COMFORT, textScale: 5 }, { reducedMotion: false, highContrast: false }).textScale).toBe(TEXT_SCALE_MAX);
    expect(resolveComfort({ ...DEFAULT_COMFORT, textScale: 0.1 }, { reducedMotion: false, highContrast: false }).textScale).toBe(TEXT_SCALE_MIN);
  });
});

describe('comfortPrefs.applyComfort', () => {
  it('writes data attributes and only sets font-size when scaled', () => {
    applyComfort({ reduceMotion: true, highContrast: true, textScale: 1 });
    const root = document.documentElement;
    expect(root.getAttribute('data-reduce-motion')).toBe('on');
    expect(root.getAttribute('data-contrast')).toBe('high');
    expect(root.style.fontSize).toBe(''); // scale 1 leaves font-size untouched

    applyComfort({ reduceMotion: false, highContrast: false, textScale: 1.25 });
    expect(root.getAttribute('data-reduce-motion')).toBe('off');
    expect(root.style.fontSize).toBe('20px'); // 16 * 1.25
    expect(root.style.getPropertyValue('--dex-text-scale')).toBe('1.25');
  });
});

describe('comfortPrefs.setComfort', () => {
  it('persists and re-applies', () => {
    setComfort({ contrast: 'high' });
    expect(loadComfort().contrast).toBe('high');
    expect(document.documentElement.getAttribute('data-contrast')).toBe('high');
  });
});
