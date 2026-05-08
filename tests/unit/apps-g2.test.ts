import { describe, it, expect } from 'vitest';
import { resolveRouting, panGains, linearToDb, dbToLinear, quantize, type MixGraph } from '../../src/shared/apps/imosion/mixGraph';
import { sampleNumber, sampleVector, evalExpression, type Channel } from '../../src/shared/apps/flux/compEngine';
import { worldTransform, identityTransform, classifyGltf, type Scene } from '../../src/shared/apps/rift/sceneGraph';

describe('Imosion mixGraph', () => {
  const g: MixGraph = {
    buses: [
      { id: 'a', name: 'A', gain: 0.5, pan: 0, mute: false, solo: false, output: 'master' },
      { id: 'b', name: 'B', gain: 1.0, pan: 0, mute: true, solo: false, output: 'master' },
    ],
    sends: [],
  };
  it('mute zeros contribution', () => {
    const r = resolveRouting(g);
    expect(r.find(x => x.busId === 'b')!.contribution).toBe(0);
  });
  it('solo silences others', () => {
    const r = resolveRouting({ ...g, buses: [
      { id: 'a', name: 'A', gain: 1, pan: 0, mute: false, solo: true, output: 'master' },
      { id: 'b', name: 'B', gain: 1, pan: 0, mute: false, solo: false, output: 'master' },
    ]});
    expect(r.find(x => x.busId === 'b')!.contribution).toBe(0);
    expect(r.find(x => x.busId === 'a')!.contribution).toBe(1);
  });
  it('pan equal-power center sums to ~1', () => {
    const { l, r } = panGains(0);
    expect(l * l + r * r).toBeCloseTo(1, 5);
  });
  it('db round trip', () => {
    expect(linearToDb(dbToLinear(-6))).toBeCloseTo(-6, 5);
  });
  it('quantize snaps to grid', () => {
    expect(quantize(1.1, 4)).toBeCloseTo(1.0);
  });
});

describe('Flux comp engine', () => {
  it('sampleNumber interpolates linear', () => {
    const c: Channel<number> = { keyframes: [{ t: 0, value: 0, ease: 'linear' }, { t: 1, value: 100 }] };
    expect(sampleNumber(c, 0.5)).toBe(50);
  });
  it('sampleVector interpolates per axis', () => {
    const c: Channel<number[]> = { keyframes: [{ t: 0, value: [0, 0], ease: 'linear' }, { t: 1, value: [10, 20] }] };
    expect(sampleVector(c, 0.5)).toEqual([5, 10]);
  });
  it('evalExpression supports value, time, wiggle, linear', () => {
    expect(evalExpression('value', { time: 0, value: 7, rand: () => 0.5 })).toBe(7);
    expect(evalExpression('time', { time: 3, value: 0, rand: () => 0 })).toBe(3);
    expect(evalExpression('linear(time, 0, 10, 0, 100)', { time: 5, value: 0, rand: () => 0 })).toBe(50);
    const w = evalExpression('wiggle(1.0, 5)', { time: 1, value: 0, rand: () => 0.5 });
    expect(typeof w).toBe('number');
  });
});

describe('Rift scene', () => {
  it('worldTransform composes translation', () => {
    const s: Scene = { id: 'x', nodes: [
      { id: 'p', parentId: null, name: 'p', transform: { ...identityTransform(), position: [1, 0, 0] }, visible: true },
      { id: 'c', parentId: 'p', name: 'c', transform: { ...identityTransform(), position: [2, 0, 0] }, visible: true },
    ]};
    expect(worldTransform(s, 'c').position[0]).toBe(3);
  });
  it('classifyGltf rejects oversized', () => {
    expect(classifyGltf({ asset: { version: '2.0' }, estTriangles: 10_000_000 }).ok).toBe(false);
    expect(classifyGltf({ asset: { version: '2.0' }, estTriangles: 100 }).ok).toBe(true);
  });
});
