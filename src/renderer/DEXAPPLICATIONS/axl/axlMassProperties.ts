// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// AXL accurate mass properties (v6 Track G). Replaces the old bounding-box
// approximation with exact volume / surface area / centroid computed from a
// closed triangle mesh (divergence theorem -- signed tetrahedron sum), plus
// closed-form analytic formulas for the parametric primitives. Pure + unit-tested
// (no rendering, no app state), so the math is verifiable without running DEX.

export interface MassProperties {
  /** Enclosed volume in model units^3 (e.g. mm^3). */
  volume: number;
  /** Total surface area in model units^2. */
  surfaceArea: number;
  /** Center of mass [x, y, z] in model units (uniform-density assumption). */
  centroid: [number, number, number];
  /** volume * density. Caller supplies density in mass / units^3. */
  mass: number;
}

/**
 * Exact mass properties of a CLOSED triangle mesh via the divergence theorem:
 * each triangle (a,b,c) contributes the signed volume of the tetrahedron
 * (origin,a,b,c). Robust to winding (volume is abs of the signed sum); the
 * centroid uses the signed contributions so it stays correct regardless of
 * orientation. `positions` is a flat [x,y,z,...] array; `indices` are triangle
 * vertex indices (length a multiple of 3).
 */
export function meshMassProperties(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  density = 1,
): MassProperties {
  let signedVol = 0;
  let area = 0;
  let cx = 0, cy = 0, cz = 0;
  const triCount = Math.floor(indices.length / 3);
  const reference = triCount ? indices[0] * 3 : 0;
  // Measuring around a mesh vertex avoids subtracting large signed volumes
  // when the object sits far from the project origin.
  const ox = positions[reference] ?? 0;
  const oy = positions[reference + 1] ?? 0;
  const oz = positions[reference + 2] ?? 0;

  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3] * 3;
    const i1 = indices[t * 3 + 1] * 3;
    const i2 = indices[t * 3 + 2] * 3;
    const ax = positions[i0] - ox, ay = positions[i0 + 1] - oy, az = positions[i0 + 2] - oz;
    const bx = positions[i1] - ox, by = positions[i1 + 1] - oy, bz = positions[i1 + 2] - oz;
    const cx2 = positions[i2] - ox, cy2 = positions[i2 + 1] - oy, cz2 = positions[i2 + 2] - oz;

    // Signed volume of tetra (origin, a, b, c) = a . (b x c) / 6
    const crX = by * cz2 - bz * cy2;
    const crY = bz * cx2 - bx * cz2;
    const crZ = bx * cy2 - by * cx2;
    const sv = (ax * crX + ay * crY + az * crZ) / 6;
    signedVol += sv;
    // Tetra centroid (origin is 0) = (a + b + c) / 4, weighted by signed volume.
    cx += (ax + bx + cx2) * 0.25 * sv;
    cy += (ay + by + cy2) * 0.25 * sv;
    cz += (az + bz + cz2) * 0.25 * sv;

    // Triangle area = |(b-a) x (c-a)| / 2
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx2 - ax, e2y = cy2 - ay, e2z = cz2 - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    area += Math.sqrt(nx * nx + ny * ny + nz * nz) * 0.5;
  }

  const volume = Math.abs(signedVol);
  const centroid: [number, number, number] = signedVol !== 0
    ? [ox + cx / signedVol, oy + cy / signedVol, oz + cz / signedVol]
    : [0, 0, 0];
  return { volume, surfaceArea: area, centroid, mass: volume * density };
}

/** Parametric primitive kinds AXL can place (see the toolbar). */
export type PrimitiveKind = 'box' | 'cylinder' | 'sphere' | 'cone' | 'torus' | 'tube' | 'wedge';

export interface PrimitiveDims {
  width?: number; height?: number; depth?: number; // box / wedge
  radius?: number;                                  // cylinder / sphere / cone / torus / tube
  innerRadius?: number;                             // tube
  tubeRadius?: number;                              // torus
}

/**
 * Closed-form mass properties for a single parametric primitive (exact, no
 * tessellation error). Centroid is returned in the primitive's local frame
 * (origin-centered for symmetric solids; cone/wedge centroids offset along the
 * height axis). Returns null for an unknown kind / missing dims so the caller can
 * fall back to the mesh path or the bbox approximation.
 */
export function primitiveMassProperties(kind: PrimitiveKind, dims: PrimitiveDims, density = 1): MassProperties | null {
  const r = dims.radius ?? 0;
  const h = dims.height ?? 0;
  let volume: number; let surfaceArea: number; let centroid: [number, number, number] = [0, 0, 0];

  switch (kind) {
    case 'box': {
      const w = dims.width ?? 0, d = dims.depth ?? 0;
      volume = w * h * d;
      surfaceArea = 2 * (w * h + w * d + h * d);
      break;
    }
    case 'cylinder': {
      volume = Math.PI * r * r * h;
      surfaceArea = 2 * Math.PI * r * (r + h);
      break;
    }
    case 'sphere': {
      volume = (4 / 3) * Math.PI * r * r * r;
      surfaceArea = 4 * Math.PI * r * r;
      break;
    }
    case 'cone': {
      const slant = Math.sqrt(r * r + h * h);
      volume = (1 / 3) * Math.PI * r * r * h;
      surfaceArea = Math.PI * r * (r + slant);
      centroid = [0, h / 4, 0]; // apex up: COM is h/4 above the base
      break;
    }
    case 'torus': {
      const tr = dims.tubeRadius ?? 0; // R = ring radius (r), a = tube radius
      volume = 2 * Math.PI * Math.PI * tr * tr * r;
      surfaceArea = 4 * Math.PI * Math.PI * r * tr;
      break;
    }
    case 'tube': {
      const ri = dims.innerRadius ?? 0;
      volume = Math.PI * (r * r - ri * ri) * h;
      surfaceArea = 2 * Math.PI * (r + ri) * h + 2 * Math.PI * (r * r - ri * ri);
      break;
    }
    case 'wedge': {
      const w = dims.width ?? 0, d = dims.depth ?? 0;
      volume = 0.5 * w * h * d; // right-triangular prism
      // Faces: 2 triangles + 3 rectangles (slant uses the hypotenuse).
      const hyp = Math.sqrt(w * w + h * h);
      surfaceArea = w * h + (w + h + hyp) * d;
      centroid = [0, h / 3, 0];
      break;
    }
    default:
      return null;
  }
  if (!Number.isFinite(volume) || volume <= 0) return null;
  return { volume, surfaceArea, centroid, mass: volume * density };
}
