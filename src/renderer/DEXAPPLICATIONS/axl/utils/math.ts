// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Math Utilities
// ═══════════════════════════════════════════════════════════════════════════

import type { Vec3, Transform, PrimitiveType } from '../types';

export function genId(): string {
  return `axl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function defaultTransform(): Transform {
  return { position: vec3(), rotation: vec3(), scale: vec3(1, 1, 1) };
}

// ─── Vector math ──────────────────────────────────────────────────────────

export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vec3Scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function vec3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function vec3Length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len < 1e-10) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function vec3Lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

export function vec3Distance(a: Vec3, b: Vec3): number {
  return vec3Length(vec3Sub(b, a));
}

// ─── Matrix 4x4 (column-major Float32Array[16]) ──────────────────────────

export type Mat4 = Float32Array;

export function mat4Identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function mat4Perspective(fovDeg: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1.0 / Math.tan((fovDeg * Math.PI) / 360);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

export function mat4LookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const z = vec3Normalize(vec3Sub(eye, target));
  const x = vec3Normalize(vec3Cross(up, z));
  const y = vec3Cross(z, x);
  const m = new Float32Array(16);
  m[0] = x.x; m[4] = x.y; m[8]  = x.z; m[12] = -vec3Dot(x, eye);
  m[1] = y.x; m[5] = y.y; m[9]  = y.z; m[13] = -vec3Dot(y, eye);
  m[2] = z.x; m[6] = z.y; m[10] = z.z; m[14] = -vec3Dot(z, eye);
  m[3] = 0;   m[7] = 0;   m[11] = 0;   m[15] = 1;
  return m;
}

export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const r = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[i + k * 4] * b[k + j * 4];
      }
      r[i + j * 4] = sum;
    }
  }
  return r;
}

export function mat4Translate(m: Mat4, v: Vec3): Mat4 {
  const t = mat4Identity();
  t[12] = v.x; t[13] = v.y; t[14] = v.z;
  return mat4Multiply(m, t);
}

export function mat4RotateX(m: Mat4, angleDeg: number): Mat4 {
  const r = angleDeg * Math.PI / 180;
  const c = Math.cos(r), s = Math.sin(r);
  const rot = mat4Identity();
  rot[5] = c; rot[6] = s; rot[9] = -s; rot[10] = c;
  return mat4Multiply(m, rot);
}

export function mat4RotateY(m: Mat4, angleDeg: number): Mat4 {
  const r = angleDeg * Math.PI / 180;
  const c = Math.cos(r), s = Math.sin(r);
  const rot = mat4Identity();
  rot[0] = c; rot[2] = -s; rot[8] = s; rot[10] = c;
  return mat4Multiply(m, rot);
}

export function mat4RotateZ(m: Mat4, angleDeg: number): Mat4 {
  const r = angleDeg * Math.PI / 180;
  const c = Math.cos(r), s = Math.sin(r);
  const rot = mat4Identity();
  rot[0] = c; rot[1] = s; rot[4] = -s; rot[5] = c;
  return mat4Multiply(m, rot);
}

export function mat4Scale(m: Mat4, v: Vec3): Mat4 {
  const s = mat4Identity();
  s[0] = v.x; s[5] = v.y; s[10] = v.z;
  return mat4Multiply(m, s);
}

export function mat4FromTransform(t: Transform): Mat4 {
  let m = mat4Identity();
  m = mat4Translate(m, t.position);
  m = mat4RotateX(m, t.rotation.x);
  m = mat4RotateY(m, t.rotation.y);
  m = mat4RotateZ(m, t.rotation.z);
  m = mat4Scale(m, t.scale);
  return m;
}

// ─── Volume / Weight ──────────────────────────────────────────────────────

export function calcVolume(type: PrimitiveType, params: Record<string, number>): number {
  switch (type) {
    case 'box': return (params.width || 1) * (params.height || 1) * (params.depth || 1);
    case 'cylinder': return Math.PI * ((params.radius || 0.5) ** 2) * (params.height || 1);
    case 'sphere': return (4 / 3) * Math.PI * ((params.radius || 0.5) ** 3);
    case 'cone': return (1 / 3) * Math.PI * ((params.radius || 0.5) ** 2) * (params.height || 1);
    case 'torus': return 2 * Math.PI * Math.PI * (params.tubeRadius || 0.2) ** 2 * (params.ringRadius || 0.5);
    case 'tube': {
      const ro = params.outerRadius || 0.5, ri = params.innerRadius || 0.3, h = params.height || 1;
      return Math.PI * (ro * ro - ri * ri) * h;
    }
    case 'wedge': return 0.5 * (params.width || 1) * (params.height || 1) * (params.depth || 1);
    default: return 0;
  }
}

export function calcWeight(volumeM3: number, density: number): number {
  return volumeM3 * density; // kg
}

export function formatWeight(kg: number): string {
  if (kg < 0.001) return `${(kg * 1e6).toFixed(1)} mg`;
  if (kg < 1) return `${(kg * 1000).toFixed(1)} g`;
  return `${kg.toFixed(2)} kg`;
}

// ─── Simulation helpers ───────────────────────────────────────────────────

export function computeVonMisesSimple(
  force: number, area: number, momentOfInertia: number,
  distFromNeutral: number, length: number
): number {
  const directStress = force / area;
  const bendingStress = (force * length * distFromNeutral) / (2 * momentOfInertia);
  return Math.sqrt(directStress ** 2 + 3 * bendingStress ** 2);
}

export function stressColor(ratio: number): string {
  const r = Math.min(255, Math.round(ratio * 510));
  const g = Math.min(255, Math.round((1 - ratio) * 510));
  return `rgb(${r},${g},40)`;
}

// ─── Isometric projection helpers ─────────────────────────────────────────

export function projectIsometric(
  v: Vec3,
  azimuth: number,
  elevation: number,
  cx: number,
  cy: number,
  zoom: number
): { x: number; y: number; depth: number } {
  const az = (azimuth * Math.PI) / 180;
  const el = (elevation * Math.PI) / 180;
  const cosA = Math.cos(az), sinA = Math.sin(az);
  const cosE = Math.cos(el), sinE = Math.sin(el);
  const rx = v.x * cosA - v.y * sinA;
  const ry  = v.x * sinA * sinE + v.y * cosA * sinE + v.z * cosE;
  const depth = v.x * sinA * cosE + v.y * cosA * cosE - v.z * sinE;
  return { x: cx + rx * zoom, y: cy - ry * zoom, depth };
}
