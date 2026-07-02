// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL WebGL2 Renderer Engine
// ═══════════════════════════════════════════════════════════════════════════
//
// Provides GPU-accelerated rendering for the AXL viewport. Falls back to
// Canvas 2D when WebGL2 is not available.
//
// Architecture:
//   AXLRenderer owns the GL context, shader programs, and render loop.
//   Call .render() each frame with the current project + viewport state.
// ═══════════════════════════════════════════════════════════════════════════

import type { AXLProject, Part, Vec3, Transform, Measurement, GDTAnnotation } from '../types';
import type { ViewMode, ProjectionMode, ShadingMode } from '../stores/viewportStore';
import type { CameraState } from '../types';
import {
  mat4Identity, mat4Perspective, mat4LookAt, mat4FromTransform,
  mat4Multiply, vec3, vec3Normalize, vec3Sub, vec3Cross, vec3Dot,
  projectIsometric, stressColor,
} from '../utils/math';
import { canvasColor } from '../../../utils/canvasTheme';

// ── Shader source ────────────────────────────────────────────────────────

const VERT_SRC = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;
uniform mat4 uNormalMatrix;

out vec3 vNormal;
out vec3 vWorldPos;

void main() {
  vec4 worldPos = uModel * vec4(aPosition, 1.0);
  vWorldPos = worldPos.xyz;
  vNormal = (uNormalMatrix * vec4(aNormal, 0.0)).xyz;
  gl_Position = uProjection * uView * worldPos;
}
`;

const FRAG_SRC = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vWorldPos;

uniform vec3 uColor;
uniform vec3 uLightDir;
uniform vec3 uCameraPos;
uniform float uAlpha;
uniform int uShading; // 0=flat, 1=smooth, 2=pbr
uniform int uSelected;
uniform int uClipEnabled;   // 1 => section plane active
uniform vec4 uClipPlane;    // xyz = world-space normal, w = signed offset

out vec4 fragColor;

void main() {
  // Section view: discard fragments on the positive side of the cut plane so
  // the interior is revealed. Cheap per-fragment test, no extra draw passes.
  if (uClipEnabled == 1 && dot(vWorldPos, uClipPlane.xyz) > uClipPlane.w) {
    discard;
  }
  vec3 N = normalize(vNormal);
  vec3 L = normalize(uLightDir);
  vec3 V = normalize(uCameraPos - vWorldPos);
  vec3 H = normalize(L + V);

  // Ambient -- raised so shadowed faces stay clearly visible instead of sinking
  // into the dark viewport (parts were rendering as near-background dim grey).
  float ambient = 0.34;
  // Diffuse (+ a small wrap so back faces aren't flat black)
  float diff = max(dot(N, L), 0.0) * 0.85 + max(dot(N, -L), 0.0) * 0.12;
  // Specular (Blinn-Phong)
  float spec = 0.0;
  if (uShading >= 1) {
    spec = pow(max(dot(N, H), 0.0), 32.0) * 0.4;
  }
  if (uShading == 2) {
    // PBR approximation: Fresnel + roughness
    float fresnel = pow(1.0 - max(dot(V, H), 0.0), 5.0) * 0.3;
    spec += fresnel;
  }

  vec3 color = uColor * (ambient + diff * 0.7) + vec3(1.0) * spec;

  // Selection outline glow
  if (uSelected == 1) {
    float edge = 1.0 - abs(dot(V, N));
    color += vec3(0.04, 0.52, 1.0) * smoothstep(0.5, 1.0, edge) * 0.6;
  }

  fragColor = vec4(color, uAlpha);
}
`;

const GRID_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
uniform mat4 uViewProj;
void main() { gl_Position = uViewProj * vec4(aPosition, 1.0); }
`;

const GRID_FRAG = `#version 300 es
precision highp float;
uniform vec4 uGridColor;
out vec4 fragColor;
void main() { fragColor = uGridColor; }
`;

// ── Geometry generators ──────────────────────────────────────────────────

interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array;
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function cloneNumericParams(params: Record<string, number | string | boolean>): Record<string, number> {
  const clone: Record<string, number> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      clone[key] = value;
    }
  });
  return clone;
}

function generateBoxMesh(w: number, h: number, d: number): MeshData {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const positions = new Float32Array([
    // Front
    -hw,-hh, hd,  hw,-hh, hd,  hw, hh, hd,  -hw, hh, hd,
    // Back
     hw,-hh,-hd, -hw,-hh,-hd, -hw, hh,-hd,   hw, hh,-hd,
    // Top
    -hw, hh, hd,  hw, hh, hd,  hw, hh,-hd,  -hw, hh,-hd,
    // Bottom
    -hw,-hh,-hd,  hw,-hh,-hd,  hw,-hh, hd,  -hw,-hh, hd,
    // Right
     hw,-hh, hd,  hw,-hh,-hd,  hw, hh,-hd,   hw, hh, hd,
    // Left
    -hw,-hh,-hd, -hw,-hh, hd, -hw, hh, hd,  -hw, hh,-hd,
  ]);
  const normals = new Float32Array([
    0,0,1, 0,0,1, 0,0,1, 0,0,1,
    0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
    0,1,0, 0,1,0, 0,1,0, 0,1,0,
    0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0,
    1,0,0, 1,0,0, 1,0,0, 1,0,0,
    -1,0,0, -1,0,0, -1,0,0, -1,0,0,
  ]);
  const indices = new Uint16Array([
    0,1,2, 0,2,3,     4,5,6, 4,6,7,
    8,9,10, 8,10,11,   12,13,14, 12,14,15,
    16,17,18, 16,18,19, 20,21,22, 20,22,23,
  ]);
  return { positions, normals, indices };
}

function generateSphereMesh(radius: number, segments: number): MeshData {
  const stacks = Math.max(8, segments >> 1);
  const slices = Math.max(8, segments);
  const verts: number[] = [];
  const norms: number[] = [];
  const idxs: number[] = [];

  for (let i = 0; i <= stacks; i++) {
    const phi = (i / stacks) * Math.PI;
    const sp = Math.sin(phi), cp = Math.cos(phi);
    for (let j = 0; j <= slices; j++) {
      const theta = (j / slices) * Math.PI * 2;
      const st = Math.sin(theta), ct = Math.cos(theta);
      const nx = sp * ct, ny = cp, nz = sp * st;
      verts.push(nx * radius, ny * radius, nz * radius);
      norms.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * (slices + 1) + j;
      const b = a + slices + 1;
      idxs.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return {
    positions: new Float32Array(verts),
    normals: new Float32Array(norms),
    indices: new Uint16Array(idxs),
  };
}

function generateCylinderMesh(radius: number, height: number, segments: number, topRadius?: number): MeshData {
  const tr = topRadius ?? radius;
  const hh = height / 2;
  const seg = Math.max(8, segments);
  const verts: number[] = [];
  const norms: number[] = [];
  const idxs: number[] = [];

  // Side
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const slope = (radius - tr) / height;
    const ny = slope, nLen = Math.sqrt(1 + slope * slope);
    verts.push(radius * c, -hh, radius * s);
    norms.push(c / nLen, ny / nLen, s / nLen);
    verts.push(tr * c, hh, tr * s);
    norms.push(c / nLen, ny / nLen, s / nLen);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idxs.push(a, c, b, b, c, d);
  }

  // Caps
  const capStart = verts.length / 3;
  // Bottom center
  verts.push(0, -hh, 0); norms.push(0, -1, 0);
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    verts.push(radius * Math.cos(a), -hh, radius * Math.sin(a));
    norms.push(0, -1, 0);
  }
  for (let i = 0; i < seg; i++) {
    idxs.push(capStart, capStart + 1 + ((i + 1) % (seg + 1)), capStart + 1 + i);
  }

  if (tr > 0.001) {
    const topStart = verts.length / 3;
    verts.push(0, hh, 0); norms.push(0, 1, 0);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      verts.push(tr * Math.cos(a), hh, tr * Math.sin(a));
      norms.push(0, 1, 0);
    }
    for (let i = 0; i < seg; i++) {
      idxs.push(topStart, topStart + 1 + i, topStart + 1 + ((i + 1) % (seg + 1)));
    }
  }

  return {
    positions: new Float32Array(verts),
    normals: new Float32Array(norms),
    indices: new Uint16Array(idxs),
  };
}

function generateTorusMesh(ringRadius: number, tubeRadius: number, segments: number): MeshData {
  const seg = Math.max(8, segments);
  const tubeSeg = Math.max(8, segments >> 1);
  const verts: number[] = [];
  const norms: number[] = [];
  const idxs: number[] = [];

  for (let i = 0; i <= seg; i++) {
    const u = (i / seg) * Math.PI * 2;
    const cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= tubeSeg; j++) {
      const v = (j / tubeSeg) * Math.PI * 2;
      const cv = Math.cos(v), sv = Math.sin(v);
      const x = (ringRadius + tubeRadius * cv) * cu;
      const y = tubeRadius * sv;
      const z = (ringRadius + tubeRadius * cv) * su;
      verts.push(x, y, z);
      norms.push(cv * cu, sv, cv * su);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < tubeSeg; j++) {
      const a = i * (tubeSeg + 1) + j;
      const b = a + tubeSeg + 1;
      idxs.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return {
    positions: new Float32Array(verts),
    normals: new Float32Array(norms),
    indices: new Uint16Array(idxs),
  };
}

function generateWedgeMesh(w: number, h: number, d: number): MeshData {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  // Triangular prism: ramp shape 
  const positions = new Float32Array([
    // Ramp face (hypotenuse)
    -hw,-hh, hd,  hw,-hh, hd,  hw, hh,-hd,  -hw, hh,-hd,
    // Bottom
    -hw,-hh,-hd,  hw,-hh,-hd,  hw,-hh, hd,  -hw,-hh, hd,
    // Back
    -hw, hh,-hd,  hw, hh,-hd,  hw,-hh,-hd,  -hw,-hh,-hd,
    // Left tri
    -hw,-hh, hd,  -hw, hh,-hd, -hw,-hh,-hd,
    // Right tri
     hw,-hh, hd,   hw,-hh,-hd,  hw, hh,-hd,
  ]);
  const normals = new Float32Array([
    0,0.707,0.707, 0,0.707,0.707, 0,0.707,0.707, 0,0.707,0.707,
    0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0,
    0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
    -1,0,0, -1,0,0, -1,0,0,
    1,0,0, 1,0,0, 1,0,0,
  ]);
  const indices = new Uint16Array([
    0,1,2, 0,2,3,
    4,5,6, 4,6,7,
    8,9,10, 8,10,11,
    12,13,14,
    15,16,17,
  ]);
  return { positions, normals, indices };
}

// Hollow box shell: six wall slabs of thickness `t` merged into one mesh — a
// genuine thin-walled box (lower volume, real interior revealed under section).
function generateShellBoxMesh(w: number, h: number, d: number, t: number): MeshData {
  const wall = Math.max(0.5, Math.min(t, Math.min(w, h, d) / 2 - 0.5));
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const slabs: MeshData[] = [
    transformMesh(generateBoxMesh(w, wall, d), vec3(0, -(hh - wall / 2), 0)), // bottom
    transformMesh(generateBoxMesh(w, wall, d), vec3(0, hh - wall / 2, 0)),    // top
    transformMesh(generateBoxMesh(w, h, wall), vec3(0, 0, -(hd - wall / 2))), // back
    transformMesh(generateBoxMesh(w, h, wall), vec3(0, 0, hd - wall / 2)),    // front
    transformMesh(generateBoxMesh(wall, h, d), vec3(-(hw - wall / 2), 0, 0)), // left
    transformMesh(generateBoxMesh(wall, h, d), vec3(hw - wall / 2, 0, 0)),    // right
  ];
  return mergeMeshes(slabs);
}

// Apply a draft taper: vertices are pulled toward the central (Y) axis in
// proportion to their height, by `angle` degrees. Real geometry change.
function applyDraftTaper(mesh: MeshData, angleDeg: number): MeshData {
  if (angleDeg <= 0) return mesh;
  const pos = mesh.positions;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < pos.length; i += 3) { if (pos[i] < minY) minY = pos[i]; if (pos[i] > maxY) maxY = pos[i]; }
  const range = Math.max(maxY - minY, 1e-3);
  const k = Math.tan((Math.min(angleDeg, 45) * Math.PI) / 180);
  const out = new Float32Array(pos);
  for (let i = 0; i < out.length; i += 3) {
    const t = (out[i + 1] - minY) / range;           // 0 at bottom, 1 at top
    const factor = Math.max(0.05, 1 - k * t);         // shrink x/z toward the top
    out[i] *= factor;
    out[i + 2] *= factor;
  }
  return { positions: out, normals: new Float32Array(mesh.normals), indices: new Uint16Array(mesh.indices) };
}

function generatePrimitiveMesh(type: string, params: Record<string, number>): MeshData {
  const seg = Math.max(8, Math.round(params.segments || 32));
  switch (type) {
    case 'box':
      return generateBoxMesh(params.width || 50, params.height || 50, params.depth || 50);
    case 'cylinder':
      return generateCylinderMesh(params.radius || 25, params.height || 50, seg);
    case 'sphere':
      return generateSphereMesh(params.radius || 25, seg);
    case 'cone':
      return generateCylinderMesh(params.radius || 25, params.height || 50, seg, 0);
    case 'torus':
      return generateTorusMesh(params.ringRadius || 30, params.tubeRadius || 10, seg);
    case 'tube':
      return generateCylinderMesh(params.outerRadius || 25, params.height || 50, seg);
    case 'wedge':
      return generateWedgeMesh(params.width || 50, params.height || 50, params.depth || 50);
    default:
      return generateBoxMesh(50, 50, 50);
  }
}

function transformMesh(mesh: MeshData, offset: Vec3): MeshData {
  const positions = new Float32Array(mesh.positions);
  for (let index = 0; index < positions.length; index += 3) {
    positions[index] += offset.x;
    positions[index + 1] += offset.y;
    positions[index + 2] += offset.z;
  }

  return {
    positions,
    normals: new Float32Array(mesh.normals),
    indices: new Uint16Array(mesh.indices),
  };
}

function mergeMeshes(meshes: MeshData[]): MeshData {
  const totalPositions = meshes.reduce((sum, mesh) => sum + mesh.positions.length, 0);
  const totalNormals = meshes.reduce((sum, mesh) => sum + mesh.normals.length, 0);
  const totalIndices = meshes.reduce((sum, mesh) => sum + mesh.indices.length, 0);

  const positions = new Float32Array(totalPositions);
  const normals = new Float32Array(totalNormals);
  const indices = new Uint16Array(totalIndices);

  let positionOffset = 0;
  let normalOffset = 0;
  let indexOffset = 0;
  let vertexOffset = 0;

  meshes.forEach(mesh => {
    positions.set(mesh.positions, positionOffset);
    normals.set(mesh.normals, normalOffset);
    for (let index = 0; index < mesh.indices.length; index++) {
      indices[indexOffset + index] = mesh.indices[index] + vertexOffset;
    }

    positionOffset += mesh.positions.length;
    normalOffset += mesh.normals.length;
    indexOffset += mesh.indices.length;
    vertexOffset += mesh.positions.length / 3;
  });

  return { positions, normals, indices };
}

function primitiveContainsPoint(type: string, params: Record<string, number>, point: Vec3): boolean {
  switch (type) {
    case 'box':
      return Math.abs(point.x) <= (params.width || 50) / 2
        && Math.abs(point.y) <= (params.height || 50) / 2
        && Math.abs(point.z) <= (params.depth || 50) / 2;
    case 'sphere':
      return (point.x * point.x) + (point.y * point.y) + (point.z * point.z) <= ((params.radius || 25) ** 2);
    case 'cylinder':
      return Math.abs(point.y) <= (params.height || 50) / 2
        && ((point.x * point.x) + (point.z * point.z)) <= ((params.radius || 25) ** 2);
    case 'cone': {
      const height = params.height || 50;
      const halfHeight = height / 2;
      if (point.y < -halfHeight || point.y > halfHeight) return false;
      const radius = params.radius || 25;
      const t = (halfHeight - point.y) / height;
      const sliceRadius = Math.max(0, radius * t);
      return ((point.x * point.x) + (point.z * point.z)) <= (sliceRadius * sliceRadius);
    }
    case 'torus': {
      const radial = Math.sqrt((point.x * point.x) + (point.z * point.z));
      const ring = radial - (params.ringRadius || 30);
      return (ring * ring) + (point.y * point.y) <= ((params.tubeRadius || 10) ** 2);
    }
    case 'tube': {
      const radialSq = (point.x * point.x) + (point.z * point.z);
      const outer = params.outerRadius || 25;
      const inner = params.innerRadius || 18;
      return Math.abs(point.y) <= (params.height || 50) / 2
        && radialSq <= (outer * outer)
        && radialSq >= (inner * inner);
    }
    case 'wedge': {
      const width = params.width || 50;
      const height = params.height || 50;
      const depth = params.depth || 50;
      if (Math.abs(point.x) > width / 2 || point.z < -depth / 2 || point.z > depth / 2 || point.y < -height / 2) {
        return false;
      }
      const zRatio = (point.z + depth / 2) / Math.max(depth, 1);
      const top = height / 2 - (zRatio * height);
      return point.y <= top;
    }
    default:
      return false;
  }
}

function filterMeshByPrimitive(mesh: MeshData, type: string, params: Record<string, number>, offset: Vec3, keepInside: boolean): MeshData {
  const keptIndices: number[] = [];

  for (let index = 0; index < mesh.indices.length; index += 3) {
    const i0 = mesh.indices[index] * 3;
    const i1 = mesh.indices[index + 1] * 3;
    const i2 = mesh.indices[index + 2] * 3;
    const centroid = vec3(
      (mesh.positions[i0] + mesh.positions[i1] + mesh.positions[i2]) / 3 - offset.x,
      (mesh.positions[i0 + 1] + mesh.positions[i1 + 1] + mesh.positions[i2 + 1]) / 3 - offset.y,
      (mesh.positions[i0 + 2] + mesh.positions[i1 + 2] + mesh.positions[i2 + 2]) / 3 - offset.z,
    );
    const inside = primitiveContainsPoint(type, params, centroid);
    if ((keepInside && inside) || (!keepInside && !inside)) {
      keptIndices.push(mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]);
    }
  }

  return {
    positions: mesh.positions,
    normals: mesh.normals,
    indices: new Uint16Array(keptIndices),
  };
}

function meshForPart(part: Part): MeshData {
  // Imported geometry (OBJ/STL/STEP) carries its own triangle mesh — draw it
  // directly rather than synthesising from a primitive.
  const meshFeature = part.features.find(feature => feature.mesh && feature.visible !== false);
  if (meshFeature?.mesh && meshFeature.mesh.positions.length >= 3) {
    return {
      positions: Float32Array.from(meshFeature.mesh.positions),
      normals: Float32Array.from(meshFeature.mesh.normals.length ? meshFeature.mesh.normals : meshFeature.mesh.positions),
      indices: Uint16Array.from(meshFeature.mesh.indices),
    };
  }

  const primitiveFeature = part.features.find(feature => feature.type === 'primitive') || part.features[0];
  if (!primitiveFeature) return generateBoxMesh(50, 50, 50);

  const params = cloneNumericParams(primitiveFeature.params);
  let primitiveType = (primitiveFeature.params.primitiveType as string) || 'box';
  let patternCount = 1;
  let patternSpacing = 0;
  let draftAngle = 0;     // taper (deg) accumulated from draft features
  let ribThickness = 0;   // reinforcing web thickness (mm)
  let shellThickness = 0; // hollow wall thickness (mm)
  let shellBox = false;   // box/wedge shell routes to the hollow-box generator
  const booleanFeatures = part.features.filter(feature => feature.type === 'boolean' && feature.visible && !feature.suppressed);

  part.features.forEach(feature => {
    if (feature.id === primitiveFeature.id || !feature.visible || feature.suppressed || feature.type === 'boolean') {
      return;
    }

    switch (feature.type) {
      case 'extrude': {
        const depth = toNumber(feature.params.depth, 20);
        if (primitiveType === 'box' || primitiveType === 'wedge') {
          params.depth = Math.max(4, (params.depth || 50) + depth);
        } else if (primitiveType === 'cylinder' || primitiveType === 'cone' || primitiveType === 'tube') {
          params.height = Math.max(4, (params.height || 50) + depth);
        } else if (primitiveType === 'sphere') {
          params.radius = Math.max(4, (params.radius || 25) + depth * 0.2);
        } else if (primitiveType === 'torus') {
          params.tubeRadius = Math.max(3, (params.tubeRadius || 10) + depth * 0.1);
        }
        break;
      }
      case 'revolve': {
        const angle = Math.max(45, toNumber(feature.params.angle, 360));
        params.segments = Math.max(toNumber(params.segments, 32), Math.round(angle / 6));
        if (primitiveType === 'box' || primitiveType === 'wedge') {
          primitiveType = 'cylinder';
          params.radius = Math.max((params.width || 50) / 2, (params.depth || 50) / 2);
          params.height = params.height || 50;
        } else if (primitiveType === 'sphere') {
          primitiveType = 'torus';
          params.ringRadius = (params.radius || 25) * 1.2;
          params.tubeRadius = Math.max(4, (params.radius || 25) * 0.35);
        }
        break;
      }
      case 'chamfer': {
        const distance = Math.max(0.5, toNumber(feature.params.distance, 2));
        if (params.width) params.width = Math.max(4, params.width - distance * 0.75);
        if (params.height) params.height = Math.max(4, params.height - distance * 0.75);
        if (params.depth) params.depth = Math.max(4, params.depth - distance * 0.75);
        break;
      }
      case 'fillet': {
        params.segments = Math.max(toNumber(params.segments, 32), 48);
        if (params.radius) {
          params.radius = Math.max(4, params.radius + toNumber(feature.params.radius, 3) * 0.1);
        }
        if (params.tubeRadius) {
          params.tubeRadius = Math.max(3, params.tubeRadius + toNumber(feature.params.radius, 3) * 0.08);
        }
        break;
      }
      case 'pattern': {
        patternCount = Math.max(1, Math.round(toNumber(feature.params.count, 1)));
        patternSpacing = Math.max(10, toNumber(feature.params.spacing, params.width || params.radius || 40));
        break;
      }
      case 'draft': {
        // Prefer the dedicated draftAngle; fall back to a legacy `angle` param.
        const a = toNumber(feature.params.draftAngle, toNumber(feature.params.angle, 5));
        draftAngle = Math.max(draftAngle, Math.min(45, a));
        break;
      }
      case 'rib': {
        ribThickness = Math.max(ribThickness, Math.max(1, toNumber(feature.params.thickness, 4)));
        break;
      }
      case 'shell': {
        const t = Math.max(0.5, toNumber(feature.params.thickness, 3));
        shellThickness = Math.max(shellThickness, t);
        // Round solids hollow exactly to a tube; prismatic ones use the shell-box
        // generator. Both are genuine geometry, not a visual hint.
        if (primitiveType === 'cylinder' || primitiveType === 'cone') {
          const r = params.radius || 25;
          primitiveType = 'tube';
          params.outerRadius = r;
          params.innerRadius = Math.max(1, r - t);
          params.height = params.height || 50;
        } else if (primitiveType === 'tube') {
          params.innerRadius = Math.max(1, (params.outerRadius || 25) - t);
        } else if (primitiveType === 'box' || primitiveType === 'wedge') {
          shellBox = true;
        }
        break;
      }
      default:
        break;
    }
  });

  let mesh = shellBox
    ? generateShellBoxMesh(params.width || 50, params.height || 50, params.depth || 50, shellThickness)
    : generatePrimitiveMesh(primitiveType, params);

  // Draft taper applied to the base solid before booleans/patterns.
  if (draftAngle > 0) mesh = applyDraftTaper(mesh, draftAngle);

  booleanFeatures.forEach(feature => {
    const bType = (feature.params.bPrimType as string) || 'box';
    const bParams: Record<string, number> = {
      width: toNumber(feature.params.bWidth, 50),
      height: toNumber(feature.params.bHeight, 50),
      depth: toNumber(feature.params.bDepth, 50),
      radius: toNumber(feature.params.bRadius, 25),
      outerRadius: toNumber(feature.params.bOuterRadius, 25),
      innerRadius: toNumber(feature.params.bInnerRadius, 18),
      ringRadius: toNumber(feature.params.bRingRadius, 30),
      tubeRadius: toNumber(feature.params.bTubeRadius, 10),
      segments: toNumber(feature.params.bSegments, 32),
    };
    const offset = vec3(
      toNumber(feature.params.bOffsetX, 0),
      toNumber(feature.params.bOffsetY, 0),
      toNumber(feature.params.bOffsetZ, 0),
    );
    const op = (feature.params.operation as string) || 'union';

    if (op === 'union') {
      mesh = mergeMeshes([
        mesh,
        transformMesh(generatePrimitiveMesh(bType, bParams), offset),
      ]);
    } else if (op === 'subtract') {
      mesh = filterMeshByPrimitive(mesh, bType, bParams, offset, false);
    } else if (op === 'intersect') {
      mesh = filterMeshByPrimitive(mesh, bType, bParams, offset, true);
    }
  });

  // Rib: a thin reinforcing web through the part centre, spanning its current
  // vertical/depth extent — real added geometry merged into the solid.
  if (ribThickness > 0 && mesh.positions.length >= 3) {
    let minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const y = mesh.positions[i + 1], z = mesh.positions[i + 2];
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const ribH = Math.max(maxY - minY, 2);
    const ribD = Math.max(maxZ - minZ, 2);
    mesh = mergeMeshes([mesh, generateBoxMesh(ribThickness, ribH, ribD)]);
  }

  if (patternCount > 1) {
    const patternedMeshes: MeshData[] = [];
    for (let index = 0; index < patternCount; index++) {
      const centeredOffset = (index - ((patternCount - 1) / 2)) * patternSpacing;
      patternedMeshes.push(transformMesh(mesh, vec3(centeredOffset, 0, 0)));
    }
    mesh = mergeMeshes(patternedMeshes);
  }

  return mesh.indices.length > 0 ? mesh : generatePrimitiveMesh(primitiveType, params);
}

// ── Compile helpers ──────────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, src: string, type: number): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

function linkProgram(gl: WebGL2RenderingContext, vert: WebGLShader, frag: WebGLShader): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Program link error: ${log}`);
  }
  return prog;
}

// ── Cached GPU buffer ────────────────────────────────────────────────────

interface GPUMesh {
  vao: WebGLVertexArrayObject;
  indexCount: number;
  indexBuffer: WebGLBuffer;
  // Track the attribute buffers too: deleting a VAO does NOT free the buffers
  // bound to it, so without these the position/normal VBOs leaked on every
  // mesh regeneration (one pair per parametric edit). Held so dispose/evict
  // can release them explicitly.
  posBuffer: WebGLBuffer;
  normBuffer: WebGLBuffer;
}

// Cap on cached GPU meshes. The cache is keyed by a full feature-stack hash, so
// dragging a parameter slider mints a fresh entry every frame; without a bound
// the VRAM footprint grows without limit across a modeling session. LRU-evict
// the oldest once we exceed this.
const MESH_CACHE_LIMIT = 48;

// ── Main Renderer Class ──────────────────────────────────────────────────

export interface RenderState {
  project: AXLProject;
  camera: CameraState;
  viewMode: ViewMode;
  projection: ProjectionMode;
  shadingMode: ShadingMode;
  gridVisible: boolean;
  showEdges: boolean;
  selectedPartId: string | null;
  hoveredPartId: string | null;
  stressMap: { partId: string; ratio: number }[] | null;
  // Section view: when present, fragments past the plane are clipped away.
  section?: { axis: 'x' | 'y' | 'z'; offset: number; flip: boolean } | null;
}

export class AXLRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private mainProgram: WebGLProgram | null = null;
  private gridProgram: WebGLProgram | null = null;
  private meshCache = new Map<string, GPUMesh>();
  private gridVAO: WebGLVertexArrayObject | null = null;
  private gridIndexCount = 0;
  private animFrame = 0;
  private fallbackCtx: CanvasRenderingContext2D | null = null;
  private useWebGL = true;

  // Uniform locations (main program)
  private uModel = -1 as unknown as WebGLUniformLocation;
  private uView = -1 as unknown as WebGLUniformLocation;
  private uProjection = -1 as unknown as WebGLUniformLocation;
  private uNormalMatrix = -1 as unknown as WebGLUniformLocation;
  private uColor = -1 as unknown as WebGLUniformLocation;
  private uLightDir = -1 as unknown as WebGLUniformLocation;
  private uCameraPos = -1 as unknown as WebGLUniformLocation;
  private uAlpha = -1 as unknown as WebGLUniformLocation;
  private uShading = -1 as unknown as WebGLUniformLocation;
  private uSelected = -1 as unknown as WebGLUniformLocation;
  private uClipEnabled = -1 as unknown as WebGLUniformLocation;
  private uClipPlane = -1 as unknown as WebGLUniformLocation;

  init(canvas: HTMLCanvasElement): boolean {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, premultipliedAlpha: false });
    if (!gl) {
      console.warn('AXL: WebGL2 not available, falling back to Canvas 2D');
      this.useWebGL = false;
      this.fallbackCtx = canvas.getContext('2d');
      if (!this.fallbackCtx) {
        console.error('AXL: Neither WebGL2 nor Canvas 2D available — viewport cannot render');
      }
      return false;
    }

    this.gl = gl;
    this.useWebGL = true;

    // Main shader
    const vs = compileShader(gl, VERT_SRC, gl.VERTEX_SHADER);
    const fs = compileShader(gl, FRAG_SRC, gl.FRAGMENT_SHADER);
    this.mainProgram = linkProgram(gl, vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    // Grid shader
    const gvs = compileShader(gl, GRID_VERT, gl.VERTEX_SHADER);
    const gfs = compileShader(gl, GRID_FRAG, gl.FRAGMENT_SHADER);
    this.gridProgram = linkProgram(gl, gvs, gfs);
    gl.deleteShader(gvs);
    gl.deleteShader(gfs);

    // Cache uniform locations
    this.uModel = gl.getUniformLocation(this.mainProgram, 'uModel')!;
    this.uView = gl.getUniformLocation(this.mainProgram, 'uView')!;
    this.uProjection = gl.getUniformLocation(this.mainProgram, 'uProjection')!;
    this.uNormalMatrix = gl.getUniformLocation(this.mainProgram, 'uNormalMatrix')!;
    this.uColor = gl.getUniformLocation(this.mainProgram, 'uColor')!;
    this.uLightDir = gl.getUniformLocation(this.mainProgram, 'uLightDir')!;
    this.uCameraPos = gl.getUniformLocation(this.mainProgram, 'uCameraPos')!;
    this.uAlpha = gl.getUniformLocation(this.mainProgram, 'uAlpha')!;
    this.uShading = gl.getUniformLocation(this.mainProgram, 'uShading')!;
    this.uSelected = gl.getUniformLocation(this.mainProgram, 'uSelected')!;
    this.uClipEnabled = gl.getUniformLocation(this.mainProgram, 'uClipEnabled')!;
    this.uClipPlane = gl.getUniformLocation(this.mainProgram, 'uClipPlane')!;

    // GL state
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Build grid
    this.buildGrid();

    return true;
  }

  private buildGrid() {
    const gl = this.gl;
    if (!gl || !this.gridProgram) return;
    const lines: number[] = [];
    const count = 50;
    const spacing = 10; // 10 units per grid line
    for (let i = -count; i <= count; i++) {
      const p = i * spacing;
      lines.push(p, 0, -count * spacing, p, 0, count * spacing);
      lines.push(-count * spacing, 0, p, count * spacing, 0, p);
    }
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.gridVAO = vao;
    this.gridIndexCount = lines.length / 3;
  }

  private deleteGPUMesh(m: GPUMesh) {
    const gl = this.gl;
    if (!gl) return;
    gl.deleteVertexArray(m.vao);
    gl.deleteBuffer(m.indexBuffer);
    gl.deleteBuffer(m.posBuffer);
    gl.deleteBuffer(m.normBuffer);
  }

  private getOrCreateMesh(part: Part): GPUMesh {
    const gl = this.gl!;
    const cacheKey = JSON.stringify(part.features.map(feature => ({
      type: feature.type,
      visible: feature.visible,
      suppressed: feature.suppressed,
      params: feature.params,
      // Imported meshes share identical params ({primitiveType:'mesh'}), so key
      // them by id + size too or distinct imports would collide on one GPU mesh.
      m: feature.mesh ? `${feature.id}:${feature.mesh.positions.length}` : 0,
    })));
    const cached = this.meshCache.get(cacheKey);
    if (cached) {
      // Touch for LRU: re-insert so it becomes the most-recently-used entry.
      this.meshCache.delete(cacheKey);
      this.meshCache.set(cacheKey, cached);
      return cached;
    }

    const mesh = meshForPart(part);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const posBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const normBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    const idxBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);

    const gpuMesh: GPUMesh = {
      vao, indexCount: mesh.indices.length,
      indexBuffer: idxBuf, posBuffer: posBuf, normBuffer: normBuf,
    };
    this.meshCache.set(cacheKey, gpuMesh);

    // LRU eviction: Map preserves insertion order, so the first key is the
    // oldest. Free its GPU resources before dropping it from the cache.
    if (this.meshCache.size > MESH_CACHE_LIMIT) {
      const oldestKey = this.meshCache.keys().next().value as string | undefined;
      if (oldestKey !== undefined) {
        const stale = this.meshCache.get(oldestKey)!;
        this.deleteGPUMesh(stale);
        this.meshCache.delete(oldestKey);
      }
    }
    return gpuMesh;
  }

  render(state: RenderState) {
    if (!this.useWebGL || !this.gl) {
      this.renderCanvas2D(state);
      return;
    }

    const gl = this.gl;
    const canvas = this.canvas!;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.102, 0.102, 0.118, 1.0); // #1a1a1e
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = canvas.width / canvas.height;
    const cam = state.camera;
    const fov = cam.fov ?? 45;
    const near = cam.near ?? 0.1;
    const far = cam.far ?? 10000;
    const pos = cam.position ?? { x: 200, y: -200, z: 200 };
    const tgt = cam.target ?? { x: 0, y: 0, z: 0 };
    const upv = cam.up ?? { x: 0, y: 0, z: 1 };
    const proj = state.projection === 'perspective'
      ? mat4Perspective(fov, aspect, near, far)
      : mat4Perspective(10, aspect, near, far); // ortho approx via narrow FOV
    const view = mat4LookAt(pos, tgt, upv);
    const viewProj = mat4Multiply(proj, view);

    // Grid
    if (state.gridVisible && this.gridProgram && this.gridVAO) {
      gl.useProgram(this.gridProgram);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.gridProgram, 'uViewProj'), false, viewProj);
      gl.uniform4f(gl.getUniformLocation(this.gridProgram, 'uGridColor'), 1, 1, 1, 0.06);
      gl.bindVertexArray(this.gridVAO);
      gl.drawArrays(gl.LINES, 0, this.gridIndexCount);
      gl.bindVertexArray(null);
    }

    // Parts
    gl.useProgram(this.mainProgram!);
    gl.uniformMatrix4fv(this.uView, false, view);
    gl.uniformMatrix4fv(this.uProjection, false, proj);
    gl.uniform3f(this.uLightDir, 0.5, 0.7, 0.3);
    gl.uniform3f(this.uCameraPos, pos.x, pos.y, pos.z);

    // Section plane uniforms (shared across all parts this frame).
    const sec = state.section;
    if (sec) {
      const sign = sec.flip ? -1 : 1;
      const n = { x: sec.axis === 'x' ? sign : 0, y: sec.axis === 'y' ? sign : 0, z: sec.axis === 'z' ? sign : 0 };
      gl.uniform1i(this.uClipEnabled, 1);
      gl.uniform4f(this.uClipPlane, n.x, n.y, n.z, sec.offset * sign);
    } else {
      gl.uniform1i(this.uClipEnabled, 0);
    }

    const shadingInt = state.shadingMode === 'flat' ? 0 : state.shadingMode === 'smooth' ? 1 : 2;
    gl.uniform1i(this.uShading, shadingInt);

    const wireframe = state.viewMode === 'wireframe' || state.viewMode === 'hidden-line';
    const xray = state.viewMode === 'xray';

    state.project.assembly.parts.forEach(part => {
      if (!part.visible) return;

      const mesh = this.getOrCreateMesh(part);
      const model = mat4FromTransform(part.transform);
      gl.uniformMatrix4fv(this.uModel, false, model);

      // Normal matrix (inverse transpose of model)
      // Simplified: just use model matrix (correct for uniform scaling)
      gl.uniformMatrix4fv(this.uNormalMatrix, false, model);

      // Color
      let color = this.parseColor(part.color);
      if (state.stressMap) {
        const sm = state.stressMap.find(s => s.partId === part.id);
        if (sm) color = this.parseColor(stressColor(sm.ratio));
      }
      gl.uniform3f(this.uColor, color[0], color[1], color[2]);
      gl.uniform1f(this.uAlpha, xray ? 0.4 : 1.0); // opaque solids -- 0.85 bled the dark bg through and washed parts out
      gl.uniform1i(this.uSelected, part.id === state.selectedPartId ? 1 : 0);

      gl.bindVertexArray(mesh.vao);
      if (wireframe) {
        // Draw in wireframe via LINE mode on triangles
        for (let i = 0; i < mesh.indexCount; i += 3) {
          gl.drawElements(gl.LINE_LOOP, 3, gl.UNSIGNED_SHORT, i * 2);
        }
      } else {
        gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0);
      }
      gl.bindVertexArray(null);
    });
  }

  private parseColor(hex: string): [number, number, number] {
    if (hex.startsWith('rgb')) {
      const m = hex.match(/(\d+)/g);
      if (m && m.length >= 3) return [+m[0] / 255, +m[1] / 255, +m[2] / 255];
    }
    if (hex.startsWith('#') && hex.length >= 7) {
      return [
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255,
      ];
    }
    return [0.6, 0.6, 0.6];
  }

  // ── Canvas 2D fallback (existing Axl.tsx renderer) ─────────────────────

  private renderCanvas2D(state: RenderState) {
    const canvas = this.canvas;
    if (!canvas) return;
    const ctx = this.fallbackCtx || canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2, cy = h / 2;

    ctx.fillStyle = canvasColor('--color-bg-elevated');
    ctx.fillRect(0, 0, w, h);

    // Grid
    if (state.gridVisible) {
      const gridSize = 20;
      const gridCount = 30;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 0.5;
      for (let i = -gridCount; i <= gridCount; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * gridSize, 0);
        ctx.lineTo(cx + i * gridSize, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, cy + i * gridSize * 0.5);
        ctx.lineTo(w, cy + i * gridSize * 0.5);
        ctx.stroke();
      }
      // Axes
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = canvasColor('--color-error');
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 80, cy); ctx.stroke();
      ctx.fillStyle = canvasColor('--color-error'); ctx.font = '10px system-ui'; ctx.fillText('X', cx + 84, cy + 4);
      ctx.strokeStyle = canvasColor('--color-success');
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 80); ctx.stroke();
      ctx.fillStyle = canvasColor('--color-success'); ctx.fillText('Y', cx + 4, cy - 84);
      ctx.strokeStyle = canvasColor('--color-accent');
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - 50, cy + 30); ctx.stroke();
      ctx.fillStyle = canvasColor('--color-accent'); ctx.fillText('Z', cx - 62, cy + 38);
    }

    // Parts (simplified isometric)
    state.project.assembly.parts.forEach(part => {
      if (!part.visible) return;
      const feat = part.features[0];
      if (!feat) return;
      const params = feat.params;
      const px = cx + part.transform.position.x;
      const py = cy - part.transform.position.y;

      let fillColor = part.color;
      if (state.stressMap) {
        const sm = state.stressMap.find(s => s.partId === part.id);
        if (sm) fillColor = stressColor(sm.ratio);
      }

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(part.transform.rotation.z * Math.PI / 180);
      ctx.fillStyle = fillColor;
      ctx.globalAlpha = 0.85;

      const primType = (params.primitiveType as string) || 'box';
      switch (primType) {
        case 'box': {
          const bw = (params.width as number) || 50;
          const bh = (params.height as number) || 50;
          ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
          break;
        }
        case 'cylinder': {
          const r = (params.radius as number) || 25;
          const ch = (params.height as number) || 50;
          ctx.fillRect(-r, -ch / 2, r * 2, ch);
          ctx.beginPath(); ctx.ellipse(0, -ch / 2, r, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'sphere': {
          const sr = (params.radius as number) || 25;
          ctx.beginPath(); ctx.arc(0, 0, sr, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'cone': {
          const cr = (params.radius as number) || 25;
          const cch = (params.height as number) || 50;
          ctx.beginPath(); ctx.moveTo(0, -cch / 2); ctx.lineTo(-cr, cch / 2); ctx.lineTo(cr, cch / 2); ctx.closePath(); ctx.fill();
          break;
        }
        default: {
          ctx.fillRect(-25, -25, 50, 50);
        }
      }

      if (part.id === state.selectedPartId) {
        ctx.strokeStyle = canvasColor('--color-accent');
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(-30, -30, 60, 60);
        ctx.setLineDash([]);
      }
      ctx.restore();
    });

    // Measurements overlay
    state.project.measurements.forEach(m => {
      if (m.points.length >= 2) {
        const p1 = { x: cx + m.points[0].x, y: cy - m.points[0].y };
        const p2 = { x: cx + m.points[1].x, y: cy - m.points[1].y };
        ctx.strokeStyle = canvasColor('--color-warning'); ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = canvasColor('--color-warning'); ctx.font = '10px system-ui';
        ctx.fillText(m.label, (p1.x + p2.x) / 2 + 5, (p1.y + p2.y) / 2 - 5);
      }
    });

    // Annotations overlay
    state.project.annotations.forEach(a => {
      const apx = cx + a.position.x;
      const apy = cy - a.position.y;
      const frameText = `${a.symbol} ${a.tolerance} | ${a.datum}`;
      ctx.font = '10px monospace';
      const tw = ctx.measureText(frameText).width + 12;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(apx + 15, apy - 18, tw, 18);
      ctx.strokeStyle = canvasColor('--color-accent'); ctx.lineWidth = 1;
      ctx.strokeRect(apx + 15, apy - 18, tw, 18);
      ctx.beginPath(); ctx.moveTo(apx, apy); ctx.lineTo(apx + 15, apy - 9); ctx.stroke();
      ctx.fillStyle = canvasColor('--color-accent');
      ctx.fillText(frameText, apx + 21, apy - 5);
    });

    // Status
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '10px system-ui';
    ctx.fillText(`Parts: ${state.project.assembly.parts.length} | ${state.project.units}`, 12, h - 10);
  }

  resize() {
    const canvas = this.canvas;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (parent) {
      // Back the canvas at the device pixel ratio so the WebGL viewport renders
      // crisp on high-DPI displays. Previously this reset width/height to the CSS
      // size (dpr 1), which ran AFTER Axl.tsx's dpr-scaled sizing and clobbered
      // it -- making the whole 3D view render at 1x and upscale blurry. Capped at
      // 2x so a 3x/retina panel doesn't quadruple the fragment cost.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(parent.clientWidth * dpr);
      canvas.height = Math.round(parent.clientHeight * dpr);
      canvas.style.width = parent.clientWidth + 'px';
      canvas.style.height = parent.clientHeight + 'px';
    }
  }

  invalidateMesh(partId: string) {
    // Geometry changed: drop the whole cache so meshes regenerate. Free each
    // entry's GPU resources first -- a bare .clear() orphaned every VAO/VBO on
    // the GPU (one of the largest AXL leaks: triggered on every geometry edit).
    this.meshCache.forEach(m => this.deleteGPUMesh(m));
    this.meshCache.clear();
  }

  dispose() {
    cancelAnimationFrame(this.animFrame);
    if (this.gl) {
      this.meshCache.forEach(m => this.deleteGPUMesh(m));
      this.meshCache.clear();
      if (this.gridVAO) this.gl.deleteVertexArray(this.gridVAO);
      if (this.mainProgram) this.gl.deleteProgram(this.mainProgram);
      if (this.gridProgram) this.gl.deleteProgram(this.gridProgram);
      // Explicitly release the GL context so the driver frees it immediately
      // instead of waiting for GC. Browsers cap live WebGL contexts (~16); without
      // this, repeatedly opening/closing AXL can exhaust them and wedge the
      // compositor. WEBGL_lose_context is the standard, safe teardown path.
      const loseCtx = this.gl.getExtension('WEBGL_lose_context');
      if (loseCtx) loseCtx.loseContext();
    }
    this.gl = null;
    this.canvas = null;
  }

  get isWebGL(): boolean {
    return this.useWebGL;
  }
}
