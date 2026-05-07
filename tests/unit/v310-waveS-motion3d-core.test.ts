// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DEX v3.10.0 wave S - motion+3D tests
import { describe, expect, it } from 'vitest';
import {
  bezierEasing, cubicBezier, evalExpression, evaluateNla, fresnelSchlick,
  motionBlurSamples, normaliseSkinWeights, projectPerspective, solveIK2Bone,
  stepParticle, topoSortComps, v3add, v3cross, v3dot, v3len, v3norm, v3scale,
  v3sub, verletStep,
} from '../../src/shared/motion3d';

describe('wave S motion + 3D', () => {
  it('vector ops', () => {
    expect(v3add([1,2,3],[4,5,6])).toEqual([5,7,9]);
    expect(v3sub([4,5,6],[1,2,3])).toEqual([3,3,3]);
    expect(v3scale([1,2,3],2)).toEqual([2,4,6]);
    expect(v3dot([1,2,3],[4,5,6])).toBe(32);
    expect(v3cross([1,0,0],[0,1,0])).toEqual([0,0,1]);
    expect(v3len([3,4,0])).toBe(5);
    const n = v3norm([3,4,0]); expect(n[0]).toBeCloseTo(0.6,6);
  });
  it('cubic bezier endpoints', () => {
    expect(cubicBezier([0,0],[0,1],[1,0],[1,1],0)).toEqual([0,0]);
    expect(cubicBezier([0,0],[0,1],[1,0],[1,1],1)).toEqual([1,1]);
  });
  it('bezier easing midpoint', () => {
    expect(bezierEasing(0.42,0,0.58,1,0.5)).toBeCloseTo(0.5,2);
    expect(bezierEasing(0,0,1,1,0.25)).toBeCloseTo(0.25,2);
  });
  it('motion blur samples span shutter', () => {
    const s = motionBlurSamples(180, 24, 5, 1);
    expect(s.length).toBe(5);
    expect(s[0]).toBeLessThan(1);
    expect(s[4]).toBeGreaterThan(1);
  });
  it('perspective projects in front', () => {
    const p = projectPerspective([1, 0, -5], 60, 16/9);
    expect(p).not.toBeNull();
    expect(projectPerspective([1, 0, 5], 60, 16/9)).toBeNull();
  });
  it('IK 2-bone reachable & not', () => {
    const r = solveIK2Bone([0,0,0],[1.5,0,0],1,1);
    expect(r.reachable).toBe(true);
    const n = solveIK2Bone([0,0,0],[5,0,0],1,1);
    expect(n.reachable).toBe(false);
  });
  it('skin weights normalize', () => {
    const w = normaliseSkinWeights([1,2,1]);
    expect(w[0]).toBeCloseTo(0.25,6);
    expect(w[1]).toBeCloseTo(0.5,6);
  });
  it('fresnel schlick monotone', () => {
    const a = fresnelSchlick(1, [0.04,0.04,0.04])[0];
    const b = fresnelSchlick(0, [0.04,0.04,0.04])[0];
    expect(b).toBeGreaterThan(a);
  });
  it('particle decays life', () => {
    const p = stepParticle({position:[0,0,0],velocity:[1,0,0],life:1},[0,-9.8,0],0.1,0.1);
    expect(p.life).toBeCloseTo(0.9,6);
    expect(p.position[0]).toBeGreaterThan(0);
  });
  it('verlet integrates accel', () => {
    const next = verletStep([0,0,0],[1,0,0],[0,-1,0],1);
    expect(next).toEqual([2,-1,0]);
  });
  it('safe expression eval', () => {
    expect(evalExpression('a+b*2', { a: 3, b: 4 })).toBe(11);
    expect(() => evalExpression('process.exit()', {})).toThrow();
  });
  it('NLA blends strips by influence', () => {
    const v = evaluateNla([{startFrame:0,endFrame:10,influence:1,value:10},{startFrame:0,endFrame:10,influence:1,value:20}], 5);
    expect(v).toBe(15);
  });
  it('topo sort respects deps', () => {
    const order = topoSortComps([{id:'b',deps:['a']},{id:'a',deps:[]},{id:'c',deps:['b']}]);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
    expect(() => topoSortComps([{id:'a',deps:['b']},{id:'b',deps:['a']}])).toThrow();
  });
});
