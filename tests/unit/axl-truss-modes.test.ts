// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unit tests for the truss modal eigensolver (engine/fea solveTrussModes).
 * Reference: single-free-DOF bar has the exact lumped-mass solution
 *   f = sqrt(k/m)/2π with k = EA/L and m = ρAL/2.
 * Steel bar E=200000 MPa, A=100 mm², L=1000 mm, ρ=7.85e-9 t/mm³:
 *   k = 20000 N/mm, m = 3.925e-4 t → f ≈ 1136.0 Hz.
 */
import { describe, it, expect } from 'vitest';
import { solveTrussModes, defaultTrussModel, type FEModel } from '../../src/renderer/DEXAPPLICATIONS/axl/engine/fea';

const RHO_STEEL = 7.85e-9; // tonne/mm³

function singleDofBar(density = RHO_STEEL): FEModel {
  return {
    nodes: [{ x: 0, y: 0 }, { x: 1000, y: 0 }],
    elements: [{ a: 0, b: 1, E: 200000, area: 100, density }],
    loads: [],
    supports: [
      { node: 0, ux: true, uy: true },
      { node: 1, ux: false, uy: true }, // free along the bar axis only
    ],
    yieldStrength: 250,
  };
}

describe('solveTrussModes', () => {
  it('matches the exact lumped-mass frequency for a single-DOF bar', () => {
    const { frequenciesHz, converged } = solveTrussModes(singleDofBar(), RHO_STEEL, 1);
    const k = (200000 * 100) / 1000;      // EA/L
    const m = (RHO_STEEL * 100 * 1000) / 2; // ρAL/2 lumped at the free node
    const exact = Math.sqrt(k / m) / (2 * Math.PI); // ≈ 1136.0 Hz
    expect(converged).toBe(true);
    expect(frequenciesHz[0]).toBeGreaterThan(exact * 0.999);
    expect(frequenciesHz[0]).toBeLessThan(exact * 1.001);
  });

  it('frequency scales as 1/sqrt(density)', () => {
    const f1 = solveTrussModes(singleDofBar(RHO_STEEL), RHO_STEEL, 1).frequenciesHz[0];
    const f2 = solveTrussModes(singleDofBar(RHO_STEEL * 2), RHO_STEEL * 2, 1).frequenciesHz[0];
    expect(f1 / f2).toBeCloseTo(Math.sqrt(2), 4);
  });

  it('extracts ascending positive modes from the triangle frame', () => {
    const model = defaultTrussModel(1000, 200000, 100, 250);
    model.elements.forEach(e => { e.density = RHO_STEEL; });
    const { frequenciesHz, modeShapes, converged } = solveTrussModes(model, RHO_STEEL, 3);
    expect(converged).toBe(true);
    expect(frequenciesHz).toHaveLength(3); // 3 free DOFs → 3 modes
    for (const f of frequenciesHz) expect(f).toBeGreaterThan(0);
    expect(frequenciesHz[0]).toBeLessThanOrEqual(frequenciesHz[1]);
    expect(frequenciesHz[1]).toBeLessThanOrEqual(frequenciesHz[2]);
    // Mode shapes: full-DOF vectors, fixed DOFs zero, max magnitude 1
    for (const shape of modeShapes) {
      expect(shape).toHaveLength(6);
      expect(shape[0]).toBe(0); // node 0 pinned (ux)
      expect(shape[1]).toBe(0); // node 0 pinned (uy)
      expect(shape[3]).toBe(0); // node 1 roller (uy)
      expect(Math.max(...shape.map(Math.abs))).toBeCloseTo(1, 9);
    }
  });

  it('clamps requested modes to the number of free DOFs', () => {
    const model = defaultTrussModel(1000, 200000, 100, 250);
    model.elements.forEach(e => { e.density = RHO_STEEL; });
    const { frequenciesHz } = solveTrussModes(model, RHO_STEEL, 8);
    expect(frequenciesHz).toHaveLength(3);
  });

  it('falls back to defaultDensity when elements carry none', () => {
    const model = singleDofBar();
    delete model.elements[0].density;
    const withDefault = solveTrussModes(model, RHO_STEEL, 1).frequenciesHz[0];
    const withExplicit = solveTrussModes(singleDofBar(RHO_STEEL), RHO_STEEL, 1).frequenciesHz[0];
    expect(withDefault).toBeCloseTo(withExplicit, 6);
  });

  it('rejects a fully constrained model', () => {
    const model = singleDofBar();
    model.supports = [
      { node: 0, ux: true, uy: true },
      { node: 1, ux: true, uy: true },
    ];
    expect(() => solveTrussModes(model, RHO_STEEL, 1)).toThrow(/constrained/);
  });
});
