import { describe, it, expect } from 'vitest';
import { parseCube, identityLut, sampleLut } from '../../src/shared/video/lut3d';
import { evalPixel, type GradeGraph } from '../../src/shared/video/nodeGrade';
import { syncAngles } from '../../src/shared/video/multicamSync';

describe('Wave 2 — VINX NLE depth', () => {
  describe('LUT3D', () => {
    it('identity LUT preserves color', () => {
      const lut = identityLut(17);
      const out = sampleLut(lut, 0.5, 0.5, 0.5);
      expect(out[0]).toBeCloseTo(0.5, 4);
      expect(out[1]).toBeCloseTo(0.5, 4);
      expect(out[2]).toBeCloseTo(0.5, 4);
    });
    it('parses a minimal .cube', () => {
      const txt = [
        'TITLE "test"',
        'LUT_3D_SIZE 2',
        '0 0 0', '1 0 0', '0 1 0', '1 1 0',
        '0 0 1', '1 0 1', '0 1 1', '1 1 1',
      ].join('\n');
      const lut = parseCube(txt);
      expect(lut.size).toBe(2);
      expect(lut.data.length).toBe(2 * 2 * 2 * 3);
    });
  });

  describe('node grade', () => {
    it('identity through input->output preserves rgb', () => {
      const graph: GradeGraph = {
        nodes: [
          { id: 'in', kind: 'input', inputs: [], enabled: true },
          { id: 'out', kind: 'output', inputs: ['in'], enabled: true },
        ],
        output: 'out',
      };
      const r = evalPixel(graph, [0.4, 0.5, 0.6]);
      expect(r[0]).toBeCloseTo(0.4, 5);
      expect(r[1]).toBeCloseTo(0.5, 5);
      expect(r[2]).toBeCloseTo(0.6, 5);
    });
    it('throws on cycles', () => {
      const graph: GradeGraph = {
        nodes: [
          { id: 'a', kind: 'saturation', inputs: ['b'], enabled: true } as never,
          { id: 'b', kind: 'saturation', inputs: ['a'], enabled: true } as never,
          { id: 'out', kind: 'output', inputs: ['a'], enabled: true },
        ],
        output: 'out',
      };
      expect(() => evalPixel(graph, [0.5, 0.5, 0.5])).toThrow();
    });
  });

  describe('multicam sync', () => {
    it('produces a sync result for two angles', () => {
      const sr = 4000;
      const len = sr * 2;
      const a = new Float32Array(len);
      const b = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        a[i] = Math.sin(i * 0.1);
        b[i] = i + 200 < len ? Math.sin((i + 200) * 0.1) : 0;
      }
      const result = syncAngles([
        { id: 'a', pcm: a, sampleRate: sr },
        { id: 'b', pcm: b, sampleRate: sr },
      ]);
      expect(result.reference).toBe('a');
      expect(result.offsets.has('b')).toBe(true);
    });
  });
});
