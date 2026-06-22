// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL FEA -- 2D truss/frame finite-element solver (real, pure, testable math)
//
// Implements a genuine direct-stiffness solver for planar pin-jointed trusses:
//   1. Assemble the global stiffness matrix K from per-element 2-DOF/node bars.
//   2. Apply boundary conditions (constrained DOFs) via row/column reduction.
//   3. Solve K.u = F for nodal displacements with a real LU / Gaussian
//      elimination linear solver (partial pivoting) on the dense system.
//   4. Recover per-element axial force, axial stress and a von Mises equivalent
//      (uniaxial bar => von Mises == |axial stress|).
//   5. Report max displacement, max von Mises stress and the minimum safety
//      factor against a yield input.
//
// No external dependencies. All inputs are SI-consistent in the caller; this
// module is unit-agnostic and simply solves the system it is given.
// ═══════════════════════════════════════════════════════════════════════════

export interface FENode {
  /** X coordinate (model units). */
  x: number;
  /** Y coordinate (model units). */
  y: number;
}

export interface FEElement {
  /** Index of the start node into the nodes array. */
  a: number;
  /** Index of the end node into the nodes array. */
  b: number;
  /** Young's modulus (consistent units, e.g. MPa = N/mm^2). */
  E: number;
  /** Cross-sectional area (consistent units, e.g. mm^2). */
  area: number;
}

export interface FELoad {
  /** Node index the load is applied to. */
  node: number;
  /** Force component along +X. */
  fx: number;
  /** Force component along +Y. */
  fy: number;
}

export interface FESupport {
  /** Node index that is constrained. */
  node: number;
  /** Restrain the X translation DOF. */
  ux: boolean;
  /** Restrain the Y translation DOF. */
  uy: boolean;
}

export interface FEModel {
  nodes: FENode[];
  elements: FEElement[];
  loads: FELoad[];
  supports: FESupport[];
  /** Material yield strength to compute the safety factor against. */
  yieldStrength: number;
}

export interface FEElementResult {
  /** Element index. */
  index: number;
  /** Element length (undeformed). */
  length: number;
  /** Axial force (tension positive). */
  axialForce: number;
  /** Axial stress = axialForce / area (tension positive). */
  axialStress: number;
  /** von Mises equivalent stress (= |axialStress| for a uniaxial bar). */
  vonMises: number;
  /** Safety factor of this element against yield. */
  safetyFactor: number;
}

export interface FEResult {
  /** Nodal displacements [ux0, uy0, ux1, uy1, ...] in DOF order. */
  displacements: number[];
  /** Per-node displacement magnitude sqrt(ux^2 + uy^2). */
  nodeDisplacement: number[];
  /** Per-element results (force / stress / safety). */
  elements: FEElementResult[];
  /** Largest nodal displacement magnitude across the model. */
  maxDisplacement: number;
  /** Largest von Mises stress across all elements. */
  maxVonMises: number;
  /** Minimum element safety factor against yield. */
  minSafetyFactor: number;
  converged: boolean;
}

// ─── Dense linear solver: Gaussian elimination with partial pivoting ────────
//
// Solves A.x = b for a square dense system. A is row-major (A[i][j]). Throws
// on a singular / near-singular matrix so callers can surface a friendly error.

export function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  if (n === 0) return [];
  // Work on copies so the inputs are not mutated.
  const M: number[][] = A.map(row => row.slice());
  const v: number[] = b.slice();

  for (let col = 0; col < n; col++) {
    // Partial pivot: find the row with the largest magnitude in this column.
    let pivotRow = col;
    let pivotMag = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      const mag = Math.abs(M[r][col]);
      if (mag > pivotMag) { pivotMag = mag; pivotRow = r; }
    }
    if (pivotMag < 1e-12) {
      throw new Error('Singular system: the structure is unstable or a mechanism (insufficient supports).');
    }
    // Swap pivot row into place.
    if (pivotRow !== col) {
      const tmpRow = M[col]; M[col] = M[pivotRow]; M[pivotRow] = tmpRow;
      const tmpV = v[col]; v[col] = v[pivotRow]; v[pivotRow] = tmpV;
    }
    // Eliminate entries below the pivot.
    const pivot = M[col][col];
    for (let r = col + 1; r < n; r++) {
      const factor = M[r][col] / pivot;
      if (factor === 0) continue;
      for (let c = col; c < n; c++) M[r][c] -= factor * M[col][c];
      v[r] -= factor * v[col];
    }
  }

  // Back-substitution.
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = v[row];
    for (let c = row + 1; c < n; c++) sum -= M[row][c] * x[c];
    x[row] = sum / M[row][row];
  }
  if (x.some(val => !Number.isFinite(val))) {
    throw new Error('Solve produced non-finite displacements (degenerate geometry).');
  }
  return x;
}

// ─── Truss solver (direct stiffness method) ─────────────────────────────────

export function solveTruss(model: FEModel): FEResult {
  const { nodes, elements, loads, supports } = model;
  const yieldStrength = model.yieldStrength > 0 ? model.yieldStrength : 250;
  const nNodes = nodes.length;
  const nDof = nNodes * 2; // 2 translational DOFs per node (planar truss)

  if (nNodes < 2 || elements.length === 0) {
    throw new Error('FEA model needs at least 2 nodes and 1 element.');
  }

  // 1. Assemble the global stiffness matrix (dense, nDof x nDof).
  const K: number[][] = Array.from({ length: nDof }, () => new Array<number>(nDof).fill(0));
  // Precompute element geometry for later force recovery.
  const geom: { L: number; c: number; s: number }[] = [];

  for (const el of elements) {
    const ni = nodes[el.a];
    const nj = nodes[el.b];
    if (!ni || !nj) throw new Error('Element references a missing node.');
    const dx = nj.x - ni.x;
    const dy = nj.y - ni.y;
    const L = Math.hypot(dx, dy);
    if (L < 1e-9) throw new Error('Zero-length element (coincident nodes).');
    const c = dx / L;      // direction cosine cos(theta)
    const s = dy / L;      // direction cosine sin(theta)
    geom.push({ L, c, s });

    const k = (el.E * el.area) / L; // axial stiffness EA/L
    // Local 4x4 truss stiffness in global coords:
    //   k * [ c^2  cs  -c^2 -cs ]
    //       [ cs   s^2 -cs  -s^2]
    //       [-c^2 -cs   c^2  cs ]
    //       [-cs  -s^2  cs   s^2]
    const cc = c * c, ss = s * s, cs = c * s;
    const ke = [
      [cc, cs, -cc, -cs],
      [cs, ss, -cs, -ss],
      [-cc, -cs, cc, cs],
      [-cs, -ss, cs, ss],
    ];
    // Global DOF indices for this element's 4 local DOFs.
    const dof = [el.a * 2, el.a * 2 + 1, el.b * 2, el.b * 2 + 1];
    for (let r = 0; r < 4; r++) {
      for (let col = 0; col < 4; col++) {
        K[dof[r]][dof[col]] += k * ke[r][col];
      }
    }
  }

  // 2. Build the global load vector.
  const F = new Array<number>(nDof).fill(0);
  for (const ld of loads) {
    if (ld.node < 0 || ld.node >= nNodes) continue;
    F[ld.node * 2] += ld.fx;
    F[ld.node * 2 + 1] += ld.fy;
  }

  // 3. Determine constrained DOFs from supports.
  const fixed = new Array<boolean>(nDof).fill(false);
  for (const sup of supports) {
    if (sup.node < 0 || sup.node >= nNodes) continue;
    if (sup.ux) fixed[sup.node * 2] = true;
    if (sup.uy) fixed[sup.node * 2 + 1] = true;
  }
  // Map free DOFs to a reduced index.
  const freeDofs: number[] = [];
  for (let i = 0; i < nDof; i++) if (!fixed[i]) freeDofs.push(i);
  if (freeDofs.length === 0) {
    throw new Error('Every DOF is constrained -- nothing to solve.');
  }

  // 4. Reduce: extract Kff and Ff for the free DOFs (homogeneous BCs: u=0
  //    on supports, so condensation simply drops fixed rows/columns).
  const m = freeDofs.length;
  const Kff: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const Ff = new Array<number>(m).fill(0);
  for (let i = 0; i < m; i++) {
    Ff[i] = F[freeDofs[i]];
    for (let j = 0; j < m; j++) {
      Kff[i][j] = K[freeDofs[i]][freeDofs[j]];
    }
  }

  // 5. Solve Kff . uf = Ff for the free displacements.
  const uf = solveLinearSystem(Kff, Ff);

  // Scatter back into the full displacement vector.
  const u = new Array<number>(nDof).fill(0);
  for (let i = 0; i < m; i++) u[freeDofs[i]] = uf[i];

  // 6. Per-node displacement magnitude.
  const nodeDisplacement = new Array<number>(nNodes).fill(0);
  let maxDisplacement = 0;
  for (let n = 0; n < nNodes; n++) {
    const mag = Math.hypot(u[n * 2], u[n * 2 + 1]);
    nodeDisplacement[n] = mag;
    if (mag > maxDisplacement) maxDisplacement = mag;
  }

  // 7. Recover per-element axial force / stress / von Mises / safety factor.
  //    Axial strain = (delta along axis) / L, force = EA/L * axial elongation.
  const elementResults: FEElementResult[] = [];
  let maxVonMises = 0;
  let minSafetyFactor = Infinity;
  for (let e = 0; e < elements.length; e++) {
    const el = elements[e];
    const { L, c, s } = geom[e];
    const uax = u[el.a * 2], uay = u[el.a * 2 + 1];
    const ubx = u[el.b * 2], uby = u[el.b * 2 + 1];
    // Axial elongation = projection of relative displacement onto the axis.
    const elongation = (ubx - uax) * c + (uby - uay) * s;
    const axialStress = (el.E * elongation) / L;     // sigma = E * strain
    const axialForce = axialStress * el.area;        // N
    const vonMises = Math.abs(axialStress);          // uniaxial bar
    const safetyFactor = vonMises > 1e-9 ? yieldStrength / vonMises : Infinity;
    if (vonMises > maxVonMises) maxVonMises = vonMises;
    if (safetyFactor < minSafetyFactor) minSafetyFactor = safetyFactor;
    elementResults.push({ index: e, length: L, axialForce, axialStress, vonMises, safetyFactor });
  }

  return {
    displacements: u,
    nodeDisplacement,
    elements: elementResults,
    maxDisplacement,
    maxVonMises,
    minSafetyFactor,
    converged: true,
  };
}

// ─── Default demo model ─────────────────────────────────────────────────────
//
// A classic statically-determinate planar truss: a triangular bracket with a
// pinned support and a roller, loaded vertically at the apex. Used when the
// current geometry cannot be mapped to FE nodes so "run simulation" still
// produces a real, meaningful result instead of nothing.

// Minimal description of a part needed to build an FE model, decoupled from
// the full AXL Part type so this engine module stays dependency-light.
export interface FEPartInput {
  id: string;
  x: number;
  y: number;
  /** Young's modulus in MPa (N/mm^2). */
  E: number;
  /** Representative cross-sectional area (mm^2). */
  area: number;
}

export interface FEEdgeInput {
  /** Part id of the first endpoint. */
  a: string;
  /** Part id of the second endpoint. */
  b: string;
}

export interface DerivedModel {
  model: FEModel;
  /** Map from element index -> the two part ids it connects (for coloring). */
  elementParts: { a: string; b: string }[];
  /** Map from node index -> part id. */
  nodeParts: string[];
}

/**
 * Derive a planar truss from the current parts (one node per part), connected
 * either by the supplied edges (assembly constraints) or, if none/insufficient,
 * by a chain plus a closing member so the result is at least a stable frame.
 * Supports pin the two lowest nodes; the load is applied downward at the
 * highest node. Returns null if fewer than 2 parts exist so the caller can
 * fall back to the default demo truss.
 */
export function deriveTrussFromParts(
  parts: FEPartInput[],
  edges: FEEdgeInput[],
  force: number,
  yieldStrength: number,
): DerivedModel | null {
  if (parts.length < 2) return null;

  const nodes: FENode[] = parts.map(p => ({ x: p.x, y: p.y }));
  const nodeParts = parts.map(p => p.id);
  const indexOf = new Map<string, number>();
  parts.forEach((p, i) => indexOf.set(p.id, i));

  // Build elements from the supplied edges, de-duplicated and validated.
  const elements: FEElement[] = [];
  const elementParts: { a: string; b: string }[] = [];
  const seen = new Set<string>();
  const addEdge = (aId: string, bId: string) => {
    const ai = indexOf.get(aId);
    const bi = indexOf.get(bId);
    if (ai === undefined || bi === undefined || ai === bi) return;
    const key = ai < bi ? `${ai}-${bi}` : `${bi}-${ai}`;
    if (seen.has(key)) return;
    const ni = nodes[ai], nj = nodes[bi];
    if (Math.hypot(nj.x - ni.x, nj.y - ni.y) < 1e-6) return; // coincident
    seen.add(key);
    // Average the two endpoints' material props for the member.
    const pa = parts[ai], pb = parts[bi];
    elements.push({ a: ai, b: bi, E: (pa.E + pb.E) / 2, area: (pa.area + pb.area) / 2 });
    elementParts.push({ a: aId, b: bId });
  };

  for (const e of edges) addEdge(e.a, e.b);

  // If constraints didn't yield enough members, fall back to a chain so we
  // always have a connected, solvable structure.
  if (elements.length < parts.length - 1) {
    for (let i = 0; i < parts.length - 1; i++) addEdge(parts[i].id, parts[i + 1].id);
    // Close the loop into a frame if 3+ parts.
    if (parts.length >= 3) addEdge(parts[parts.length - 1].id, parts[0].id);
  }

  if (elements.length === 0) return null;

  // Supports: pin the lowest node, roller on the next-lowest (sorted by y).
  const byHeight = parts.map((_, i) => i).sort((i, j) => nodes[i].y - nodes[j].y);
  const supports: FESupport[] = [
    { node: byHeight[0], ux: true, uy: true },
  ];
  if (byHeight.length > 1) supports.push({ node: byHeight[1], ux: false, uy: true });

  // Load: downward force at the highest node (largest y).
  const topNode = byHeight[byHeight.length - 1];
  const loads: FELoad[] = [{ node: topNode, fx: 0, fy: -Math.abs(force) }];

  return {
    model: { nodes, elements, loads, supports, yieldStrength },
    elementParts,
    nodeParts,
  };
}

export function defaultTrussModel(force: number, E: number, area: number, yieldStrength: number): FEModel {
  // Two fixed base nodes (0,1) and a loaded apex node (2).
  const nodes: FENode[] = [
    { x: 0, y: 0 },     // node 0 -- pinned support
    { x: 1000, y: 0 },  // node 1 -- roller support
    { x: 500, y: 600 }, // node 2 -- loaded apex
  ];
  const elements: FEElement[] = [
    { a: 0, b: 2, E, area }, // left diagonal
    { a: 1, b: 2, E, area }, // right diagonal
    { a: 0, b: 1, E, area }, // bottom chord
  ];
  const supports: FESupport[] = [
    { node: 0, ux: true, uy: true },  // pin
    { node: 1, ux: false, uy: true }, // roller (vertical reaction only)
  ];
  const loads: FELoad[] = [
    { node: 2, fx: 0, fy: -Math.abs(force) }, // downward load at apex
  ];
  return { nodes, elements, loads, supports, yieldStrength };
}
