// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unit tests for AXL's modal + buckling analytical solvers
 * (engine/modalBuckling). Reference values are computed independently for a
 * 100 mm steel cube (E = 200 GPa, ρ = 7850 kg/m³, V = 1e6 mm³):
 *   beam idealization: a = 0.1 m, A = 0.01 m², I = 8.3333e-6 m⁴, L = 0.1 m
 *   f₁ = (1.8751²/2π)·sqrt(EI/(ρAL⁴)) ≈ 8154 Hz
 *   P_cr = π²EI/L² ≈ 1.645e9 N
 */
import { describe, it, expect } from 'vitest';
import { computeModalStudy, computeBucklingStudy } from '../../src/renderer/DEXAPPLICATIONS/axl/engine/modalBuckling';

const steelCube = { id: 'p1', youngsModulusGPa: 200, densityKgM3: 7850, volumeMm3: 1e6 };

describe('computeModalStudy', () => {
  it('matches the analytical cantilever fundamental for a steel cube', () => {
    const { parts } = computeModalStudy([steelCube], 0);
    const f1 = parts[0].frequenciesHz[0];
    expect(f1).toBeGreaterThan(8154 * 0.99);
    expect(f1).toBeLessThan(8154 * 1.01);
  });

  it('mode ratios follow the cantilever eigenvalues (f2/f1 = (λ2/λ1)²)', () => {
    const { parts } = computeModalStudy([steelCube], 0);
    const [f1, f2, f3] = parts[0].frequenciesHz;
    expect(f2 / f1).toBeCloseTo(Math.pow(4.6941 / 1.8751, 2), 3);
    expect(f3 / f1).toBeCloseTo(Math.pow(7.8548 / 1.8751, 2), 3);
  });

  it('resonance ratio peaks at 1 on a mode and decays away from it', () => {
    const { parts: atRes } = computeModalStudy([steelCube], computeModalStudy([steelCube], 0).parts[0].frequenciesHz[0]);
    expect(atRes[0].ratio).toBeCloseTo(1, 5);
    const { parts: far } = computeModalStudy([steelCube], 100);
    expect(far[0].ratio).toBeLessThan(0.05);
  });

  it('separation factor is f1/excitation', () => {
    const f1 = computeModalStudy([steelCube], 0).parts[0].frequenciesHz[0];
    const { separationFactor } = computeModalStudy([steelCube], 100);
    expect(separationFactor).toBeCloseTo(f1 / 100, 3);
  });

  it('stiffer material raises frequencies (sqrt(E) scaling)', () => {
    const soft = { ...steelCube, id: 'soft', youngsModulusGPa: 50 };
    const fSteel = computeModalStudy([steelCube], 0).parts[0].frequenciesHz[0];
    const fSoft = computeModalStudy([soft], 0).parts[0].frequenciesHz[0];
    expect(fSteel / fSoft).toBeCloseTo(Math.sqrt(200 / 50), 3);
  });
});

describe('computeBucklingStudy', () => {
  it('matches the Euler critical load for a steel cube', () => {
    const { parts } = computeBucklingStudy([steelCube], 1000);
    expect(parts[0].criticalLoadN).toBeGreaterThan(1.645e9 * 0.99);
    expect(parts[0].criticalLoadN).toBeLessThan(1.645e9 * 1.01);
  });

  it('ratio = P/Pcr and safety factor = Pcr/P (capped at 999)', () => {
    const { parts, minSafetyFactor } = computeBucklingStudy([steelCube], 1.645e9 / 2);
    expect(parts[0].ratio).toBeCloseTo(0.5, 1);
    expect(minSafetyFactor).toBeCloseTo(2, 1);
    expect(computeBucklingStudy([steelCube], 1).minSafetyFactor).toBe(999);
  });

  it('an overloaded part reads ratio > 1 (fails)', () => {
    const { parts } = computeBucklingStudy([steelCube], 1.645e9 * 1.2);
    expect(parts[0].ratio).toBeGreaterThan(1);
  });

  it('weakest part drives the study minimums', () => {
    const weak = { ...steelCube, id: 'weak', youngsModulusGPa: 10 };
    const { minCriticalLoadN, parts } = computeBucklingStudy([steelCube, weak], 1000);
    expect(minCriticalLoadN).toBeCloseTo(parts[1].criticalLoadN, 5);
  });
});
