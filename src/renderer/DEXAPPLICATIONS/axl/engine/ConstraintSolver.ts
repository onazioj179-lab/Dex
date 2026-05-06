// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Constraint Solver -- Iterative geometric constraint solver
// ═══════════════════════════════════════════════════════════════════════════
//
// Resolves positional + rotational constraints between parts in an assembly.
// Uses a Gauss-Seidel style iterative approach (like SolveSpace / FreeCAD).
// ═══════════════════════════════════════════════════════════════════════════

import type { Constraint, ConstraintType, Part, Vec3, Transform } from '../types';
import { vec3, vec3Sub, vec3Add, vec3Scale, vec3Length, vec3Normalize, vec3Dot, vec3Distance } from '../utils/math';

export interface SolverResult {
  converged: boolean;
  iterations: number;
  maxError: number;
  partUpdates: Map<string, Partial<Transform>>;
  constraintStatus: Map<string, boolean>;
}

export interface SolverOptions {
  maxIterations: number;
  tolerance: number;        // mm
  dampingFactor: number;    // 0-1, avoids oscillation
}

const DEFAULT_OPTIONS: SolverOptions = {
  maxIterations: 100,
  tolerance: 0.01,    // 0.01mm
  dampingFactor: 0.5,
};

export class ConstraintSolver {
  private options: SolverOptions;

  constructor(options?: Partial<SolverOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  solve(parts: Part[], constraints: Constraint[]): SolverResult {
    if (constraints.length === 0) {
      return { converged: true, iterations: 0, maxError: 0, partUpdates: new Map(), constraintStatus: new Map() };
    }

    const partMap = new Map<string, Part>();
    parts.forEach(p => partMap.set(p.id, p));

    // Working copy of positions (mutable during solve)
    const positions = new Map<string, Vec3>();
    const rotations = new Map<string, Vec3>();
    parts.forEach(p => {
      positions.set(p.id, { ...p.transform.position });
      rotations.set(p.id, { ...p.transform.rotation });
    });

    const { maxIterations, tolerance, dampingFactor } = this.options;
    const constraintStatus = new Map<string, boolean>();
    let maxError = Infinity;
    let iter = 0;

    for (iter = 0; iter < maxIterations; iter++) {
      maxError = 0;

      for (const c of constraints) {
        const posA = positions.get(c.partA);
        const posB = positions.get(c.partB);
        if (!posA || !posB) {
          constraintStatus.set(c.id, false);
          continue;
        }

        const error = this.solveConstraint(c, posA, posB, rotations, dampingFactor);
        maxError = Math.max(maxError, error);
        constraintStatus.set(c.id, error < tolerance);
      }

      if (maxError < tolerance) break;
    }

    // Build result
    const partUpdates = new Map<string, Partial<Transform>>();
    for (const [id, pos] of positions) {
      const original = partMap.get(id);
      if (!original) continue;
      const origPos = original.transform.position;
      if (Math.abs(pos.x - origPos.x) > 1e-6 || Math.abs(pos.y - origPos.y) > 1e-6 || Math.abs(pos.z - origPos.z) > 1e-6) {
        partUpdates.set(id, { position: pos });
      }
      const rot = rotations.get(id);
      if (rot) {
        const origRot = original.transform.rotation;
        if (Math.abs(rot.x - origRot.x) > 1e-6 || Math.abs(rot.y - origRot.y) > 1e-6 || Math.abs(rot.z - origRot.z) > 1e-6) {
          const existing = partUpdates.get(id) || {};
          partUpdates.set(id, { ...existing, rotation: rot });
        }
      }
    }

    return {
      converged: maxError < tolerance,
      iterations: iter,
      maxError,
      partUpdates,
      constraintStatus,
    };
  }

  private solveConstraint(
    c: Constraint,
    posA: Vec3,
    posB: Vec3,
    rotations: Map<string, Vec3>,
    damping: number,
  ): number {
    switch (c.type) {
      case 'fixed': return this.solveFixed(c, posA, posB, damping);
      case 'coincident': return this.solveCoincident(posA, posB, damping);
      case 'concentric': return this.solveConcentric(posA, posB, damping);
      case 'distance': return this.solveDistance(c, posA, posB, damping);
      case 'parallel': return this.solveParallel(c, rotations, damping);
      case 'perpendicular': return this.solvePerpendicular(c, rotations, damping);
      case 'tangent': return this.solveTangent(c, posA, posB, damping);
      case 'angle': return this.solveAngle(c, rotations, damping);
      default: return 0;
    }
  }

  // ── Individual constraint solvers ──────────────────────────────────────

  private solveFixed(_c: Constraint, _posA: Vec3, _posB: Vec3, _damping: number): number {
    // Fixed constraint: part A doesn't move. Nothing to solve.
    return 0;
  }

  private solveCoincident(posA: Vec3, posB: Vec3, damping: number): number {
    // Make posB coincide with posA
    const delta = vec3Sub(posA, posB);
    const error = vec3Length(delta);
    if (error < 1e-10) return 0;
    const correction = vec3Scale(delta, damping);
    posB.x += correction.x;
    posB.y += correction.y;
    posB.z += correction.z;
    return error;
  }

  private solveConcentric(posA: Vec3, posB: Vec3, damping: number): number {
    // Align XY positions (assume Z-axis alignment for concentric)
    const dx = posA.x - posB.x;
    const dy = posA.y - posB.y;
    const error = Math.sqrt(dx * dx + dy * dy);
    if (error < 1e-10) return 0;
    posB.x += dx * damping;
    posB.y += dy * damping;
    return error;
  }

  private solveDistance(c: Constraint, posA: Vec3, posB: Vec3, damping: number): number {
    const targetDist = c.value || 0;
    const delta = vec3Sub(posB, posA);
    const currentDist = vec3Length(delta);
    if (currentDist < 1e-10) {
      // Parts are on top of each other, push apart along X
      posB.x += targetDist * damping;
      return targetDist;
    }
    const error = Math.abs(currentDist - targetDist);
    if (error < 1e-10) return 0;
    const dir = vec3Normalize(delta);
    const correction = (currentDist - targetDist) * damping * 0.5;
    posA.x += dir.x * correction;
    posA.y += dir.y * correction;
    posA.z += dir.z * correction;
    posB.x -= dir.x * correction;
    posB.y -= dir.y * correction;
    posB.z -= dir.z * correction;
    return error;
  }

  private solveParallel(c: Constraint, rotations: Map<string, Vec3>, damping: number): number {
    const rotA = rotations.get(c.partA);
    const rotB = rotations.get(c.partB);
    if (!rotA || !rotB) return 0;
    // Make rotation of B match A (for parallel surfaces)
    const ex = rotA.x - rotB.x;
    const ey = rotA.y - rotB.y;
    const ez = rotA.z - rotB.z;
    const error = Math.sqrt(ex * ex + ey * ey + ez * ez);
    if (error < 1e-10) return 0;
    rotB.x += ex * damping;
    rotB.y += ey * damping;
    rotB.z += ez * damping;
    return error;
  }

  private solvePerpendicular(c: Constraint, rotations: Map<string, Vec3>, damping: number): number {
    const rotA = rotations.get(c.partA);
    const rotB = rotations.get(c.partB);
    if (!rotA || !rotB) return 0;
    // Make B perpendicular to A: target difference of 90 degrees
    const targetDiff = 90;
    const diff = rotB.z - rotA.z;
    const error = Math.abs(diff - targetDiff);
    if (error < 1e-10) return 0;
    rotB.z += (targetDiff - diff) * damping;
    return error;
  }

  private solveTangent(c: Constraint, posA: Vec3, posB: Vec3, damping: number): number {
    // Simplified tangent: maintain a target distance equal to c.value (sum of radii)
    const targetDist = c.value || 50;
    return this.solveDistance({ ...c, value: targetDist }, posA, posB, damping);
  }

  private solveAngle(c: Constraint, rotations: Map<string, Vec3>, damping: number): number {
    const rotA = rotations.get(c.partA);
    const rotB = rotations.get(c.partB);
    if (!rotA || !rotB) return 0;
    const targetAngle = c.value || 0;
    const diff = rotB.z - rotA.z;
    const error = Math.abs(diff - targetAngle);
    if (error < 1e-10) return 0;
    rotB.z += (targetAngle - diff) * damping;
    return error;
  }
}
