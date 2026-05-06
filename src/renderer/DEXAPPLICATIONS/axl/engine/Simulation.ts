// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Simulation Engine -- FEA-lite stress/thermal/modal analysis
// ═══════════════════════════════════════════════════════════════════════════

import type { Part, PrimitiveType, SimulationResult } from '../types';
import { calcVolume, computeVonMisesSimple } from '../utils/math';

export type SimulationType = 'stress' | 'thermal' | 'modal' | 'buckling' | 'fatigue' | 'motion';

export interface SimulationConfig {
  type: SimulationType;
  force: number;          // N
  temperature?: number;   // deg C
  frequency?: number;     // Hz
  cycles?: number;        // fatigue cycles
}

export interface PartStressResult {
  partId: string;
  ratio: number;    // stress / yield_strength
  stress: number;
  safetyFactor: number;
}

export function runSimulation(
  parts: Part[],
  config: SimulationConfig,
  units: string,
): SimulationResult {
  const startTime = performance.now();
  const type = config.type;
  const force = config.force;

  if (parts.length === 0) {
    return {
      type,
      maxStress: 0,
      safetyFactor: Infinity,
      stressMap: [],
      converged: true,
      timestamp: Date.now(),
    };
  }

  let stressMap: { partId: string; ratio: number }[];
  let maxStressValue = 0;

  switch (type) {
    case 'stress': {
      stressMap = parts.filter(p => p.visible).map(p => {
        const feat = p.features[0];
        const params = (feat?.params || {}) as Record<string, number>;
        const primType = (params.primitiveType as unknown as PrimitiveType) || 'box';
        const vol = calcVolume(primType, params);
        const crossArea = Math.max(vol / Math.max(params.height || 50, 1), 1);
        const I = (crossArea * crossArea) / 12;
        const L = params.height || params.depth || 50;
        const yieldStrength = p.material.yieldStrength || 250;
        const stress = computeVonMisesSimple(force, crossArea, I, Math.sqrt(crossArea) / 2, L);
        const ratio = Math.min(stress / yieldStrength, 2);
        maxStressValue = Math.max(maxStressValue, stress);
        return { partId: p.id, ratio };
      });
      break;
    }
    case 'thermal': {
      const temp = config.temperature || 100;
      stressMap = parts.filter(p => p.visible).map(p => {
        const alpha = p.material.thermalExpansion || 12e-6;
        const E = (p.material.youngsModulus || 200) * 1000; // GPa → MPa
        const thermalStress = alpha * (temp - 20) * E;
        const yieldStrength = p.material.yieldStrength || 250;
        const ratio = Math.min(Math.abs(thermalStress) / yieldStrength, 2);
        maxStressValue = Math.max(maxStressValue, Math.abs(thermalStress));
        return { partId: p.id, ratio };
      });
      break;
    }
    case 'modal': {
      stressMap = parts.filter(p => p.visible).map(p => {
        const feat = p.features[0];
        const params = (feat?.params || {}) as Record<string, number>;
        const L = params.height || params.depth || 50;
        const E = (p.material.youngsModulus || 200) * 1000; // GPa → MPa
        const rho = p.material.density;
        const crossArea = Math.max(calcVolume((params.primitiveType as unknown as PrimitiveType) || 'box', params) / Math.max(L, 1), 1);
        const I = (crossArea * crossArea) / 12;
        // Natural frequency (cantilever beam approx): fn = (1.875^2)/(2*pi*L^2) * sqrt(E*I/(rho*A))
        const fn = (3.516 / (2 * Math.PI * L * L * 1e-6)) * Math.sqrt((E * 1e6 * I * 1e-12) / (rho * crossArea * 1e-6));
        const ratio = Math.min(fn / 1000, 2); // normalize to 0-2 range
        maxStressValue = Math.max(maxStressValue, fn);
        return { partId: p.id, ratio };
      });
      break;
    }
    case 'buckling': {
      stressMap = parts.filter(p => p.visible).map(p => {
        const feat = p.features[0];
        const params = (feat?.params || {}) as Record<string, number>;
        const L = params.height || params.depth || 50;
        const E = (p.material.youngsModulus || 200) * 1000; // GPa → MPa
        const crossArea = Math.max(calcVolume((params.primitiveType as unknown as PrimitiveType) || 'box', params) / Math.max(L, 1), 1);
        const I = (crossArea * crossArea) / 12;
        // Euler critical load: Pcr = pi^2 * E * I / L^2
        const Pcr = (Math.PI * Math.PI * E * I) / (L * L);
        const ratio = Math.min(force / Math.max(Pcr, 1), 2);
        maxStressValue = Math.max(maxStressValue, Pcr);
        return { partId: p.id, ratio };
      });
      break;
    }
    case 'fatigue': {
      const cycles = config.cycles || 1e6;
      stressMap = parts.filter(p => p.visible).map(p => {
        const feat = p.features[0];
        const params = (feat?.params || {}) as Record<string, number>;
        const primType = (params.primitiveType as unknown as PrimitiveType) || 'box';
        const vol = calcVolume(primType, params);
        const crossArea = Math.max(vol / Math.max(params.height || 50, 1), 1);
        const I = (crossArea * crossArea) / 12;
        const L = params.height || params.depth || 50;
        const stress = computeVonMisesSimple(force, crossArea, I, Math.sqrt(crossArea) / 2, L);
        const yieldStrength = p.material.yieldStrength || 250;
        // S-N curve approximation (Basquin): endurance limit ~ 0.5 * UTS
        const endurance = yieldStrength * 0.4;
        const lifeRatio = Math.log10(cycles) / Math.log10(1e7);
        const ratio = Math.min((stress * lifeRatio) / endurance, 2);
        maxStressValue = Math.max(maxStressValue, stress);
        return { partId: p.id, ratio };
      });
      break;
    }
    case 'motion': {
      stressMap = parts.filter(p => p.visible).map(p => {
        const feat = p.features[0];
        const params = (feat?.params || {}) as Record<string, number>;
        const primType = (params.primitiveType as unknown as PrimitiveType) || 'box';
        const vol = calcVolume(primType, params);
        const E = (p.material.yieldStrength || 250) * 800;
        const L = params.height || params.depth || 50;
        const crossArea = Math.max(vol / Math.max(L, 1), 1);
        const I = (crossArea * crossArea) / 12;
        const deflection = (force * L * L * L) / (3 * E * I);
        const ratio = Math.min(deflection / (L * 0.01), 1.5);
        maxStressValue = Math.max(maxStressValue, deflection);
        return { partId: p.id, ratio };
      });
      break;
    }
    default: {
      stressMap = [];
    }
  }

  const elapsed = performance.now() - startTime;
  const globalSafety = maxStressValue > 0 ? 1 / Math.max(maxStressValue / 10, 0.01) : Infinity;

  return {
    type,
    maxStress: maxStressValue,
    safetyFactor: globalSafety,
    stressMap: stressMap!,
    converged: true,
    timestamp: Date.now(),
  };
}
