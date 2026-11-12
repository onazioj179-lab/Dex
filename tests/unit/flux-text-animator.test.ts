import { describe, it, expect } from 'vitest';
import { splitUnits, unitState, totalDurationMs, drawAnimatedText, UNIT_MS } from '../../src/renderer/DEXAPPLICATIONS/flux/textAnimator';

describe('Flux text animator', () => {
  it('splits by character, word and line', () => {
    expect(splitUnits('Hi yo', 'character')).toEqual([['H', 'i', ' ', 'y', 'o']]);
    expect(splitUnits('Hi yo', 'word')).toEqual([['Hi ', 'yo']]);
    expect(splitUnits('a\nb c', 'line')).toEqual([['a'], ['b c']]);
    expect(splitUnits('a\nb c', 'word')).toEqual([['a'], ['b ', 'c']]);
  });

  it('cascades: later units start later, all end shown', () => {
    expect(unitState('Fade Up', 0, 0, 50).opacity).toBe(0);
    expect(unitState('Fade Up', 100, 0, 50).opacity).toBeGreaterThan(0);
    expect(unitState('Fade Up', 100, 3, 50).opacity).toBe(0);
    expect(unitState('Fade Up', 150 + UNIT_MS, 3, 50)).toEqual({ opacity: 1, dx: 0, dy: 0, scale: 1, rotation: 0, blur: 0 });
    expect(unitState('Typewriter', 99, 2, 50).opacity).toBe(0);
    expect(unitState('Typewriter', 100, 2, 50).opacity).toBe(1);
  });

  it('presets move the right property', () => {
    expect(unitState('Fade Up', 100, 0, 0).dy).toBeGreaterThan(0);
    expect(unitState('Slide Left', 100, 0, 0).dx).toBeGreaterThan(0);
    expect(unitState('Rotate In', 100, 0, 0).rotation).toBeLessThan(0);
    expect(unitState('Blur Reveal', 100, 0, 0).blur).toBeGreaterThan(0);
    expect(unitState('Scale Pop', 100, 0, 0).scale).toBeLessThan(1.2);
  });

  it('total duration covers the last unit', () => {
    expect(totalDurationMs('abc', { mode: 'character', cascade: 50, preset: 'Fade Up' })).toBe(100 + UNIT_MS);
    expect(totalDurationMs('abc', { mode: 'character', cascade: 50, preset: 'Typewriter' })).toBe(100);
  });

  it('draws only revealed units, laid out across the full width', () => {
    const drawn: Array<[string, number]> = [];
    let tx = 0;
    const ctx: any = {
      globalAlpha: 1, filter: 'none', textAlign: 'center',
      save() {}, restore() { tx = 0; }, rotate() {}, scale() {},
      translate(x: number) { tx += x; },
      measureText: (t: string) => ({ width: t.length * 10 }),
      fillText(t: string) { drawn.push([t, tx]); },
    };
    drawAnimatedText(ctx, 'abcd', { mode: 'character', cascade: 100, preset: 'Typewriter' }, 150, 'center', 20);
    expect(drawn).toEqual([['a', -15], ['b', -5]]);
  });
});
