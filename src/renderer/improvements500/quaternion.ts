/*
 * DEX - Quaternion math for 3D rotation (Wave 16).
 * Copyright (c) 2025 onazioj179-lab. Licensed under DEX terms.
 */

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const QUAT_IDENTITY: Quat = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

/** Quaternion from axis (need not be unit) and angle in radians. */
export function quatFromAxisAngle(ax: number, ay: number, az: number, angle: number): Quat {
  const n = Math.hypot(ax, ay, az);
  if (n === 0) return { ...QUAT_IDENTITY };
  const half = angle / 2;
  const s = Math.sin(half) / n;
  return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(half) };
}

/** Hamilton product a * b. */
export function quatMul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function quatNormalize(q: Quat): Quat {
  const n = Math.hypot(q.x, q.y, q.z, q.w);
  if (n === 0) return { ...QUAT_IDENTITY };
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}

export function quatConjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

/** Rotate vector v by unit quaternion q. */
export function quatRotateVec(q: Quat, vx: number, vy: number, vz: number): [number, number, number] {
  // p' = q * (0,v) * q*. Optimized form.
  const tx = 2 * (q.y * vz - q.z * vy);
  const ty = 2 * (q.z * vx - q.x * vz);
  const tz = 2 * (q.x * vy - q.y * vx);
  return [
    vx + q.w * tx + (q.y * tz - q.z * ty),
    vy + q.w * ty + (q.z * tx - q.x * tz),
    vz + q.w * tz + (q.x * ty - q.y * tx),
  ];
}

/** Spherical linear interpolation between unit quaternions. */
export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;
  let dot = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (dot < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    dot = -dot;
  }
  if (dot > 0.9995) {
    return quatNormalize({
      x: a.x + t * (bx - a.x),
      y: a.y + t * (by - a.y),
      z: a.z + t * (bz - a.z),
      w: a.w + t * (bw - a.w),
    });
  }
  const theta0 = Math.acos(dot);
  const theta = theta0 * t;
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - (dot * Math.sin(theta)) / sinTheta0;
  const s1 = Math.sin(theta) / sinTheta0;
  return {
    x: s0 * a.x + s1 * bx,
    y: s0 * a.y + s1 * by,
    z: s0 * a.z + s1 * bz,
    w: s0 * a.w + s1 * bw,
  };
}
