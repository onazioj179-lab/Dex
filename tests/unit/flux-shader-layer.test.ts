import { describe, it, expect } from 'vitest';
import { hexToRgb01, withPrecision, SHADER_PRESETS, ShaderPool } from '../../src/renderer/DEXAPPLICATIONS/flux/shaderLayer';

describe('Flux shader layer helpers', () => {
  it('parses colours', () => {
    expect(hexToRgb01('#ff0080')).toEqual([1, 0, 128 / 255]);
    expect(hexToRgb01('nope')).toEqual([1, 1, 1]);
  });
  it('adds precision only when missing', () => {
    expect(withPrecision('void main(){}')).toMatch(/^precision mediump float;/);
    const own = 'precision highp float;\nvoid main(){}';
    expect(withPrecision(own)).toBe(own);
  });
  it('presets only use the documented uniforms and write gl_FragColor', () => {
    for (const p of SHADER_PRESETS) {
      expect(p.code).toContain('gl_FragColor');
      const uniforms = [...p.code.matchAll(/uniform\s+\w+\s+(\w+)/g)].map(m => m[1]);
      for (const u of uniforms) expect(['u_time', 'u_resolution', 'u_intensity', 'u_color']).toContain(u);
    }
  });
  it('pool hands out one renderer per layer and prunes the rest', () => {
    const pool = new ShaderPool();
    const a = pool.get('a');
    expect(pool.get('a')).toBe(a);
    pool.prune(new Set());
    expect(pool.get('a')).not.toBe(a);
  });
});
