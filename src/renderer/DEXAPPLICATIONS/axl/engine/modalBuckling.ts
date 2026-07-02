// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Modal + buckling studies (pure, unit-tested).
 *
 * Both were typed in SimulationType but never wired — running them silently
 * fell through to the motion study. These are per-part ANALYTICAL solvers,
 * the same fidelity tier as the existing thermal/motion studies (the stress
 * study is the real FE path):
 *
 *  - Modal: cantilever Euler-Bernoulli beam natural frequencies
 *      f_n = (λ_n² / 2π) · sqrt(E·I / (ρ·A·L⁴)),  λ = 1.8751, 4.6941, 7.8548
 *    Each part is idealized as a square-section beam with side a = ∛V
 *    (identical idealization to the motion study). The per-part ratio is
 *    resonance proximity to the excitation frequency; the study safety factor
 *    is the frequency separation margin f₁/f_exc.
 *
 *  - Buckling: Euler column critical load, pinned-pinned (K = 1)
 *      P_cr = π²·E·I / (K·L)²
 *    Ratio = P_applied / P_cr; safety factor = P_cr / P_applied.
 *
 * Units in: E in GPa, density kg/m³, volume mm³, load N, excitation Hz.
 * Internally converted to SI (Pa, m).
 */

export interface AnalyticalPartInput {
  id: string;
  /** Young's modulus in GPa (as stored on Material) */
  youngsModulusGPa: number;
  /** Density in kg/m³ */
  densityKgM3: number;
  /** Primitive volume in mm³ */
  volumeMm3: number;
}

export interface ModalPartResult {
  partId: string;
  /** First three natural frequencies in Hz */
  frequenciesHz: [number, number, number];
  /** Resonance proximity 0..1.5 (1 ≈ excitation sits on a mode) */
  ratio: number;
}

export interface ModalStudyResult {
  parts: ModalPartResult[];
  /** Lowest fundamental frequency across parts (Hz) */
  minF1Hz: number;
  /** min(f1 / f_exc) across parts — >2 comfortable, <1 excitation above f1 */
  separationFactor: number;
}

export interface BucklingPartResult {
  partId: string;
  criticalLoadN: number;
  /** P / P_cr — >1 means the part buckles under the applied load */
  ratio: number;
}

export interface BucklingStudyResult {
  parts: BucklingPartResult[];
  minCriticalLoadN: number;
  /** min(P_cr / P) across parts */
  minSafetyFactor: number;
}

/** Cantilever beam eigenvalue constants λ_n for the first three modes. */
const LAMBDA = [1.8751, 4.6941, 7.8548] as const;

/** Square-section beam idealization from a part's volume (SI units). */
function beamFromVolume(volumeMm3: number) {
  const aM = Math.cbrt(Math.max(volumeMm3, 1)) / 1000; // side length, m
  return {
    L: aM,                    // beam length, m
    A: aM * aM,               // cross-section area, m²
    I: Math.pow(aM, 4) / 12,  // second moment of area, m⁴
  };
}

export function computeModalStudy(
  parts: AnalyticalPartInput[],
  excitationHz: number,
): ModalStudyResult {
  const results: ModalPartResult[] = parts.map(p => {
    const { L, A, I } = beamFromVolume(p.volumeMm3);
    const E = Math.max(p.youngsModulusGPa, 1e-6) * 1e9; // Pa
    const rho = Math.max(p.densityKgM3, 1);
    const base = Math.sqrt((E * I) / (rho * A * Math.pow(L, 4)));
    const freqs = LAMBDA.map(l => (l * l / (2 * Math.PI)) * base) as [number, number, number];
    // Resonance proximity: peaks at 1 when the excitation sits on a mode,
    // decaying with distance relative to a ~15% bandwidth (light damping).
    const ratio = excitationHz > 0
      ? Math.max(...freqs.map(f => Math.exp(-Math.abs(excitationHz - f) / (0.15 * f))))
      : 0;
    return { partId: p.id, frequenciesHz: freqs, ratio };
  });

  const minF1Hz = results.length ? Math.min(...results.map(r => r.frequenciesHz[0])) : 0;
  const separationFactor = excitationHz > 0 && minF1Hz > 0
    ? minF1Hz / excitationHz
    : 999;
  return { parts: results, minF1Hz, separationFactor: Math.min(separationFactor, 999) };
}

export function computeBucklingStudy(
  parts: AnalyticalPartInput[],
  appliedLoadN: number,
): BucklingStudyResult {
  const K = 1; // pinned-pinned effective length factor
  const results: BucklingPartResult[] = parts.map(p => {
    const { L, I } = beamFromVolume(p.volumeMm3);
    const E = Math.max(p.youngsModulusGPa, 1e-6) * 1e9; // Pa
    const criticalLoadN = (Math.PI * Math.PI * E * I) / Math.pow(K * L, 2);
    const ratio = criticalLoadN > 0 ? Math.min(appliedLoadN / criticalLoadN, 1.5) : 1.5;
    return { partId: p.id, criticalLoadN, ratio };
  });

  const minCriticalLoadN = results.length ? Math.min(...results.map(r => r.criticalLoadN)) : 0;
  const minSafetyFactor = appliedLoadN > 0 && minCriticalLoadN > 0
    ? Math.min(minCriticalLoadN / appliedLoadN, 999)
    : 999;
  return { parts: results, minCriticalLoadN, minSafetyFactor };
}
