// =============================================================================
// DEX Platform — Wave 5.3 Axl: assembly joints
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Joint kinematics — pure data + DOF math for assembly motion.
 *
 * Joint kinds:
 *   rigid      — 0 DOF
 *   revolute   — 1 DOF (rotation around an axis)
 *   prismatic  — 1 DOF (translation along an axis)
 *   cylindrical— 2 DOF (rotation + translation along same axis)
 *   ball       — 3 DOF (rotation around a point)
 *   planar     — 3 DOF (translation in plane + rotation around plane normal)
 *
 * `JointPose` holds the current value(s) of the DOF(s). `transformOf` returns
 * the resulting 4x4 matrix (column-major Float32) relative to the parent.
 */

export type JointKind = 'rigid' | 'revolute' | 'prismatic' | 'cylindrical' | 'ball' | 'planar';

export interface JointSpec {
  id: string;
  kind: JointKind;
  /** Origin in parent space. */
  origin: [number, number, number];
  /** Primary axis (unit) for revolute/prismatic/cylindrical. */
  axis?: [number, number, number];
  /** Limits per DOF (degrees for rotation, units for translation). */
  limits?: { min: number; max: number }[];
  /** Child component id. */
  child: string;
  /** Parent component id. */
  parent: string;
}

export interface JointPose {
  /** Same length as DOF count; angles in radians, translations in units. */
  values: number[];
}

export function dofCount(kind: JointKind): number {
  switch (kind) {
    case 'rigid': return 0;
    case 'revolute':
    case 'prismatic': return 1;
    case 'cylindrical': return 2;
    case 'ball': return 3;
    case 'planar': return 3;
  }
}

export function clampPose(spec: JointSpec, pose: JointPose): JointPose {
  if (!spec.limits) return pose;
  const out = [...pose.values];
  for (let i = 0; i < out.length && i < spec.limits.length; i++) {
    const lim = spec.limits[i]!;
    if (out[i]! < lim.min) out[i] = lim.min;
    if (out[i]! > lim.max) out[i] = lim.max;
  }
  return { values: out };
}

/** 4x4 column-major identity. */
export function identity(): Float32Array {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/** Compute the joint transform (parent→child) given pose. */
export function transformOf(spec: JointSpec, pose: JointPose): Float32Array {
  const m = identity();
  const ox = spec.origin[0], oy = spec.origin[1], oz = spec.origin[2];
  // Translate to origin
  translate(m, ox, oy, oz);

  switch (spec.kind) {
    case 'rigid': break;
    case 'revolute': {
      const ax = unit(spec.axis ?? [0, 0, 1]);
      rotateAxis(m, ax, pose.values[0] ?? 0);
      break;
    }
    case 'prismatic': {
      const ax = unit(spec.axis ?? [1, 0, 0]);
      const t = pose.values[0] ?? 0;
      translate(m, ax[0] * t, ax[1] * t, ax[2] * t);
      break;
    }
    case 'cylindrical': {
      const ax = unit(spec.axis ?? [0, 0, 1]);
      const ang = pose.values[0] ?? 0;
      const t = pose.values[1] ?? 0;
      rotateAxis(m, ax, ang);
      translate(m, ax[0] * t, ax[1] * t, ax[2] * t);
      break;
    }
    case 'ball': {
      // Roll/pitch/yaw applied in order
      rotateAxis(m, [1, 0, 0], pose.values[0] ?? 0);
      rotateAxis(m, [0, 1, 0], pose.values[1] ?? 0);
      rotateAxis(m, [0, 0, 1], pose.values[2] ?? 0);
      break;
    }
    case 'planar': {
      const tx = pose.values[0] ?? 0;
      const ty = pose.values[1] ?? 0;
      const rz = pose.values[2] ?? 0;
      translate(m, tx, ty, 0);
      rotateAxis(m, [0, 0, 1], rz);
      break;
    }
  }
  return m;
}

function translate(m: Float32Array, x: number, y: number, z: number): void {
  // Right-multiply m by translation
  m[12] = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
  m[13] = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
  m[14] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
  m[15] = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
}

function rotateAxis(m: Float32Array, axis: [number, number, number], angle: number): void {
  const [x, y, z] = unit(axis);
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  // Rotation matrix R
  const r = new Float32Array(16);
  r[0] = t*x*x + c;     r[1] = t*x*y + s*z; r[2] = t*x*z - s*y;
  r[4] = t*x*y - s*z;   r[5] = t*y*y + c;   r[6] = t*y*z + s*x;
  r[8] = t*x*z + s*y;   r[9] = t*y*z - s*x; r[10] = t*z*z + c;
  r[15] = 1;
  // m = m * r
  const out = mulMat(m, r);
  for (let i = 0; i < 16; i++) m[i] = out[i]!;
}

function mulMat(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
      o[c * 4 + r] = s;
    }
  }
  return o;
}

function unit(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
