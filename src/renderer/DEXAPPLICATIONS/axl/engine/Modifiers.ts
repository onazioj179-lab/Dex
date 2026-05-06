// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Modifier System -- Blender-style Non-Destructive Modeling
// ═══════════════════════════════════════════════════════════════════════════

import type {
  Modifier, ModifierType, MirrorModifier, ArrayModifier, BevelModifier,
  SolidifyModifier, SubdivisionModifier, BooleanModifier, DecimateModifier,
  SimpleDeformModifier, SmoothModifier, Vec3, Part
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Modifier Factory -- Create default modifiers
// ═══════════════════════════════════════════════════════════════════════════

let modifierId = 0;
const genModifierId = () => `mod_${++modifierId}_${Date.now().toString(36)}`;

export const createModifier = (type: ModifierType): Modifier => {
  const base = {
    id: genModifierId(),
    name: getModifierName(type),
    enabled: true,
    showInViewport: true,
    showInRender: true,
    expanded: true,
  };

  switch (type) {
    case 'mirror':
      return {
        ...base,
        type: 'mirror',
        axis: { x: true, y: false, z: false },
        useBisect: false,
        bisectFlip: false,
        mergeThreshold: 0.001,
      } as MirrorModifier;

    case 'array':
      return {
        ...base,
        type: 'array',
        fitType: 'fixed',
        count: 2,
        offset: { x: 1, y: 0, z: 0 },
        constantOffset: { x: 0, y: 0, z: 0 },
        useRelativeOffset: true,
        useConstantOffset: false,
        mergeVertices: true,
        mergeThreshold: 0.001,
      } as ArrayModifier;

    case 'bevel':
      return {
        ...base,
        type: 'bevel',
        amount: 0.1,
        segments: 3,
        limitMethod: 'angle',
        angleLimit: 30,
        profile: 0.5,
        clamp: true,
        harden: false,
        miterOuter: 'sharp',
        miterInner: 'sharp',
      } as BevelModifier;

    case 'solidify':
      return {
        ...base,
        type: 'solidify',
        thickness: 0.1,
        offset: -1,
        evenThickness: true,
        fillRim: true,
        rimOnly: false,
        qualityMode: 'simple',
      } as SolidifyModifier;

    case 'subdivision':
      return {
        ...base,
        type: 'subdivision',
        levels: 2,
        renderLevels: 3,
        qualityMode: 'catmull',
        useCreases: true,
        boundarySmooth: 'preserve',
        uvSmooth: 'corners',
      } as SubdivisionModifier;

    case 'boolean':
      return {
        ...base,
        type: 'boolean',
        operation: 'subtract',
        targetPart: '',
        solver: 'exact',
        selfIntersection: false,
        overlap: 0,
      } as BooleanModifier;

    case 'decimate':
      return {
        ...base,
        type: 'decimate',
        mode: 'collapse',
        ratio: 0.5,
        iterations: 1,
        angleLimit: 5,
        triangulate: true,
        symmetry: false,
      } as DecimateModifier;

    case 'simpleDeform':
      return {
        ...base,
        type: 'simpleDeform',
        mode: 'bend',
        angle: 45,
        factor: 1,
        axis: 'Z',
        limits: { start: 0, end: 1 },
        lockAxis: { x: false, y: false },
      } as SimpleDeformModifier;

    case 'smooth':
      return {
        ...base,
        type: 'smooth',
        factor: 0.5,
        iterations: 1,
        axis: { x: true, y: true, z: true },
      } as SmoothModifier;

    case 'wireframe':
      return {
        ...base,
        type: 'wireframe',
        thickness: 0.02,
        offset: 1,
        useBoundary: true,
        replaceOriginal: true,
      };

    case 'shell':
      return {
        ...base,
        type: 'shell',
        thickness: 0.1,
        removeInnerFaces: true,
      };

    case 'lattice':
      return {
        ...base,
        type: 'lattice',
        resolution: { x: 2, y: 2, z: 2 },
        deformPoints: [],
        strength: 1,
      };

    case 'shrinkwrap':
      return {
        ...base,
        type: 'shrinkwrap' as ModifierType,
      } as Modifier;

    case 'weld':
      return {
        ...base,
        type: 'weld' as ModifierType,
      } as Modifier;

    case 'triangulate':
      return {
        ...base,
        type: 'triangulate' as ModifierType,
      } as Modifier;

    default:
      throw new Error(`Unknown modifier type: ${type}`);
  }
};

export const getModifierName = (type: ModifierType): string => {
  const names: Record<ModifierType, string> = {
    mirror: 'Mirror',
    array: 'Array',
    bevel: 'Bevel',
    solidify: 'Solidify',
    subdivision: 'Subdivision Surface',
    boolean: 'Boolean',
    decimate: 'Decimate',
    lattice: 'Lattice',
    simpleDeform: 'Simple Deform',
    shrinkwrap: 'Shrinkwrap',
    weld: 'Weld',
    triangulate: 'Triangulate',
    wireframe: 'Wireframe',
    smooth: 'Smooth',
    shell: 'Shell',
  };
  return names[type] || type;
};

export const getModifierIcon = (type: ModifierType): string => {
  const icons: Record<ModifierType, string> = {
    mirror: '⬍',
    array: '▦',
    bevel: '◢',
    solidify: '▣',
    subdivision: '◇',
    boolean: '⊕',
    decimate: '▽',
    lattice: '⊞',
    simpleDeform: '↺',
    shrinkwrap: '◎',
    weld: '⊛',
    triangulate: '△',
    wireframe: '▤',
    smooth: '○',
    shell: '◻',
  };
  return icons[type] || '◆';
};

// ═══════════════════════════════════════════════════════════════════════════
// Modifier Stack Operations
// ═══════════════════════════════════════════════════════════════════════════

export const addModifier = (modifiers: Modifier[], type: ModifierType): Modifier[] => {
  const newModifier = createModifier(type);
  return [...modifiers, newModifier];
};

export const removeModifier = (modifiers: Modifier[], id: string): Modifier[] => {
  return modifiers.filter(m => m.id !== id);
};

export const moveModifier = (modifiers: Modifier[], id: string, direction: 'up' | 'down'): Modifier[] => {
  const idx = modifiers.findIndex(m => m.id === id);
  if (idx < 0) return modifiers;
  const newIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= modifiers.length) return modifiers;
  const result = [...modifiers];
  [result[idx], result[newIdx]] = [result[newIdx], result[idx]];
  return result;
};

export const updateModifier = <T extends Modifier>(
  modifiers: Modifier[],
  id: string,
  updates: Partial<T>
): Modifier[] => {
  return modifiers.map(m => (m.id === id ? { ...m, ...updates } : m));
};

export const duplicateModifier = (modifiers: Modifier[], id: string): Modifier[] => {
  const mod = modifiers.find(m => m.id === id);
  if (!mod) return modifiers;
  const idx = modifiers.indexOf(mod);
  const copy = { ...mod, id: genModifierId(), name: `${mod.name} Copy` };
  const result = [...modifiers];
  result.splice(idx + 1, 0, copy);
  return result;
};

export const toggleModifier = (modifiers: Modifier[], id: string): Modifier[] => {
  return modifiers.map(m => (m.id === id ? { ...m, enabled: !m.enabled } : m));
};

export const collapseModifier = (modifiers: Modifier[], id: string): Modifier[] => {
  return modifiers.map(m => (m.id === id ? { ...m, expanded: !m.expanded } : m));
};

// ═══════════════════════════════════════════════════════════════════════════
// Geometry Processing (Simplified implementations)
// ═══════════════════════════════════════════════════════════════════════════

interface Vertex { x: number; y: number; z: number }
interface Face { indices: number[] }
interface Mesh { vertices: Vertex[]; faces: Face[] }

// Mirror vertices across an axis
export const applyMirror = (mesh: Mesh, mod: MirrorModifier): Mesh => {
  const newVertices = [...mesh.vertices];
  const newFaces = [...mesh.faces];
  const offset = mesh.vertices.length;

  for (const v of mesh.vertices) {
    newVertices.push({
      x: mod.axis.x ? -v.x : v.x,
      y: mod.axis.y ? -v.y : v.y,
      z: mod.axis.z ? -v.z : v.z,
    });
  }

  for (const f of mesh.faces) {
    // Reverse winding for mirrored faces
    newFaces.push({ indices: f.indices.map(i => i + offset).reverse() });
  }

  return { vertices: newVertices, faces: newFaces };
};

// Array geometry along offset
export const applyArray = (mesh: Mesh, mod: ArrayModifier): Mesh => {
  const newVertices: Vertex[] = [];
  const newFaces: Face[] = [];
  const baseVertexCount = mesh.vertices.length;

  for (let i = 0; i < mod.count; i++) {
    const offset = {
      x: mod.useRelativeOffset ? mod.offset.x * i : 0 + (mod.useConstantOffset ? mod.constantOffset.x * i : 0),
      y: mod.useRelativeOffset ? mod.offset.y * i : 0 + (mod.useConstantOffset ? mod.constantOffset.y * i : 0),
      z: mod.useRelativeOffset ? mod.offset.z * i : 0 + (mod.useConstantOffset ? mod.constantOffset.z * i : 0),
    };

    for (const v of mesh.vertices) {
      newVertices.push({ x: v.x + offset.x, y: v.y + offset.y, z: v.z + offset.z });
    }

    for (const f of mesh.faces) {
      newFaces.push({ indices: f.indices.map(idx => idx + i * baseVertexCount) });
    }
  }

  return { vertices: newVertices, faces: newFaces };
};

// Catmull-Clark subdivision (simplified)
export const applySubdivision = (mesh: Mesh, mod: SubdivisionModifier): Mesh => {
  let result = { ...mesh };
  
  for (let level = 0; level < mod.levels; level++) {
    // Simplified subdivision: split each face into 4
    const newVertices = [...result.vertices];
    const newFaces: Face[] = [];

    for (const face of result.faces) {
      if (face.indices.length < 3) continue;

      // Calculate face center
      const center = { x: 0, y: 0, z: 0 };
      for (const idx of face.indices) {
        center.x += result.vertices[idx].x;
        center.y += result.vertices[idx].y;
        center.z += result.vertices[idx].z;
      }
      center.x /= face.indices.length;
      center.y /= face.indices.length;
      center.z /= face.indices.length;

      const centerIdx = newVertices.length;
      newVertices.push(center);

      // Calculate edge midpoints and create new faces
      const n = face.indices.length;
      const midpointIndices: number[] = [];

      for (let i = 0; i < n; i++) {
        const v1 = result.vertices[face.indices[i]];
        const v2 = result.vertices[face.indices[(i + 1) % n]];
        const midpoint = {
          x: (v1.x + v2.x) / 2,
          y: (v1.y + v2.y) / 2,
          z: (v1.z + v2.z) / 2,
        };
        midpointIndices.push(newVertices.length);
        newVertices.push(midpoint);
      }

      // Create 4 new faces per original quad (or 3 per triangle)
      for (let i = 0; i < n; i++) {
        newFaces.push({
          indices: [
            face.indices[i],
            midpointIndices[i],
            centerIdx,
            midpointIndices[(i + n - 1) % n],
          ],
        });
      }
    }

    result = { vertices: newVertices, faces: newFaces };
  }

  return result;
};

// Smooth vertex positions (Laplacian smoothing)
export const applySmooth = (mesh: Mesh, mod: SmoothModifier): Mesh => {
  let vertices = [...mesh.vertices.map(v => ({ ...v }))];

  // Build adjacency list
  const adjacency: Map<number, Set<number>> = new Map();
  for (let i = 0; i < vertices.length; i++) adjacency.set(i, new Set());

  for (const face of mesh.faces) {
    for (let i = 0; i < face.indices.length; i++) {
      const curr = face.indices[i];
      const next = face.indices[(i + 1) % face.indices.length];
      adjacency.get(curr)!.add(next);
      adjacency.get(next)!.add(curr);
    }
  }

  for (let iter = 0; iter < mod.iterations; iter++) {
    const newPositions = vertices.map((v, i) => {
      const neighbors = adjacency.get(i)!;
      if (neighbors.size === 0) return v;

      const avg = { x: 0, y: 0, z: 0 };
      for (const ni of neighbors) {
        avg.x += vertices[ni].x;
        avg.y += vertices[ni].y;
        avg.z += vertices[ni].z;
      }
      avg.x /= neighbors.size;
      avg.y /= neighbors.size;
      avg.z /= neighbors.size;

      return {
        x: mod.axis.x ? v.x + (avg.x - v.x) * mod.factor : v.x,
        y: mod.axis.y ? v.y + (avg.y - v.y) * mod.factor : v.y,
        z: mod.axis.z ? v.z + (avg.z - v.z) * mod.factor : v.z,
      };
    });

    vertices = newPositions;
  }

  return { vertices, faces: mesh.faces };
};

// Simple Deform: bend, twist, taper, stretch
export const applySimpleDeform = (mesh: Mesh, mod: SimpleDeformModifier): Mesh => {
  const vertices = mesh.vertices.map(v => {
    const { x, y, z } = v;
    let newX = x, newY = y, newZ = z;

    // Get primary and secondary axes based on deform axis
    const t = mod.axis === 'X' ? x : mod.axis === 'Y' ? y : z;
    const tNorm = Math.max(0, Math.min(1, (t - mod.limits.start) / (mod.limits.end - mod.limits.start || 1)));

    switch (mod.mode) {
      case 'twist': {
        const angle = (mod.angle * Math.PI / 180) * tNorm;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        if (mod.axis === 'Z') {
          newX = x * cos - y * sin;
          newY = x * sin + y * cos;
        } else if (mod.axis === 'Y') {
          newX = x * cos - z * sin;
          newZ = x * sin + z * cos;
        } else {
          newY = y * cos - z * sin;
          newZ = y * sin + z * cos;
        }
        break;
      }
      case 'bend': {
        const angle = (mod.angle * Math.PI / 180) * tNorm;
        if (mod.axis === 'Z') {
          const r = z === 0 ? 1 : z;
          newX = x + r * (1 - Math.cos(angle));
          newZ = r * Math.sin(angle);
        }
        break;
      }
      case 'taper': {
        const scale = 1 + (mod.factor - 1) * tNorm;
        if (mod.axis === 'Z') {
          newX = x * scale;
          newY = y * scale;
        } else if (mod.axis === 'Y') {
          newX = x * scale;
          newZ = z * scale;
        } else {
          newY = y * scale;
          newZ = z * scale;
        }
        break;
      }
      case 'stretch': {
        const stretchFactor = 1 + (mod.factor - 1) * tNorm;
        if (mod.axis === 'Z') newZ = z * stretchFactor;
        else if (mod.axis === 'Y') newY = y * stretchFactor;
        else newX = x * stretchFactor;
        break;
      }
    }

    return { x: newX, y: newY, z: newZ };
  });

  return { vertices, faces: mesh.faces };
};

// Decimate mesh (reduce polygon count)
export const applyDecimate = (mesh: Mesh, mod: DecimateModifier): Mesh => {
  if (mod.mode !== 'collapse') return mesh;

  // Simple vertex clustering decimation
  const targetCount = Math.max(4, Math.floor(mesh.vertices.length * mod.ratio));
  if (mesh.vertices.length <= targetCount) return mesh;

  // Grid-based clustering
  const bounds = {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  };

  for (const v of mesh.vertices) {
    bounds.min.x = Math.min(bounds.min.x, v.x);
    bounds.min.y = Math.min(bounds.min.y, v.y);
    bounds.min.z = Math.min(bounds.min.z, v.z);
    bounds.max.x = Math.max(bounds.max.x, v.x);
    bounds.max.y = Math.max(bounds.max.y, v.y);
    bounds.max.z = Math.max(bounds.max.z, v.z);
  }

  const gridSize = Math.cbrt(mesh.vertices.length / targetCount);
  const cellSize = {
    x: (bounds.max.x - bounds.min.x) / gridSize || 1,
    y: (bounds.max.y - bounds.min.y) / gridSize || 1,
    z: (bounds.max.z - bounds.min.z) / gridSize || 1,
  };

  // Map old vertices to new clustered vertices
  const clusters: Map<string, { sum: Vertex; count: number; newIdx: number }> = new Map();
  const vertexMap: number[] = [];
  let nextIdx = 0;

  for (const v of mesh.vertices) {
    const key = `${Math.floor((v.x - bounds.min.x) / cellSize.x)},${Math.floor((v.y - bounds.min.y) / cellSize.y)},${Math.floor((v.z - bounds.min.z) / cellSize.z)}`;

    if (!clusters.has(key)) {
      clusters.set(key, { sum: { x: 0, y: 0, z: 0 }, count: 0, newIdx: nextIdx++ });
    }

    const cluster = clusters.get(key)!;
    cluster.sum.x += v.x;
    cluster.sum.y += v.y;
    cluster.sum.z += v.z;
    cluster.count++;
    vertexMap.push(cluster.newIdx);
  }

  const newVertices: Vertex[] = [];
  for (const cluster of clusters.values()) {
    newVertices.push({
      x: cluster.sum.x / cluster.count,
      y: cluster.sum.y / cluster.count,
      z: cluster.sum.z / cluster.count,
    });
  }

  // Remap faces and remove degenerates
  const newFaces: Face[] = [];
  for (const face of mesh.faces) {
    const newIndices = [...new Set(face.indices.map(i => vertexMap[i]))];
    if (newIndices.length >= 3) {
      newFaces.push({ indices: newIndices });
    }
  }

  return { vertices: newVertices, faces: newFaces };
};

// Apply solidify (extrude surface with thickness)
export const applySolidify = (mesh: Mesh, mod: SolidifyModifier): Mesh => {
  // Calculate vertex normals
  const normals: Vec3[] = mesh.vertices.map(() => ({ x: 0, y: 0, z: 0 }));

  for (const face of mesh.faces) {
    if (face.indices.length < 3) continue;

    const v0 = mesh.vertices[face.indices[0]];
    const v1 = mesh.vertices[face.indices[1]];
    const v2 = mesh.vertices[face.indices[2]];

    // Cross product for face normal
    const ax = v1.x - v0.x, ay = v1.y - v0.y, az = v1.z - v0.z;
    const bx = v2.x - v0.x, by = v2.y - v0.y, bz = v2.z - v0.z;
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;

    for (const idx of face.indices) {
      normals[idx].x += nx;
      normals[idx].y += ny;
      normals[idx].z += nz;
    }
  }

  // Normalize
  for (const n of normals) {
    const len = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z) || 1;
    n.x /= len;
    n.y /= len;
    n.z /= len;
  }

  // Create inner shell
  const offsetAmount = mod.thickness * mod.offset;
  const innerVertices = mesh.vertices.map((v, i) => ({
    x: v.x - normals[i].x * offsetAmount,
    y: v.y - normals[i].y * offsetAmount,
    z: v.z - normals[i].z * offsetAmount,
  }));

  const outerVertices = mesh.vertices.map((v, i) => ({
    x: v.x + normals[i].x * (mod.thickness - offsetAmount),
    y: v.y + normals[i].y * (mod.thickness - offsetAmount),
    z: v.z + normals[i].z * (mod.thickness - offsetAmount),
  }));

  const newVertices = [...innerVertices, ...outerVertices];
  const offset = mesh.vertices.length;

  const innerFaces = mesh.faces.map(f => ({ indices: f.indices.slice().reverse() }));
  const outerFaces = mesh.faces.map(f => ({ indices: f.indices.map(i => i + offset) }));

  const newFaces = [...innerFaces, ...outerFaces];

  // Add rim faces if fillRim
  if (mod.fillRim) {
    // Find boundary edges (edges that belong to only one face)
    const edgeCount: Map<string, number> = new Map();
    const edgeKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

    for (const face of mesh.faces) {
      const n = face.indices.length;
      for (let i = 0; i < n; i++) {
        const key = edgeKey(face.indices[i], face.indices[(i + 1) % n]);
        edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
      }
    }

    for (const face of mesh.faces) {
      const n = face.indices.length;
      for (let i = 0; i < n; i++) {
        const a = face.indices[i];
        const b = face.indices[(i + 1) % n];
        const key = edgeKey(a, b);
        if (edgeCount.get(key) === 1) {
          // Boundary edge - create quad
          newFaces.push({
            indices: [a, b, b + offset, a + offset],
          });
        }
      }
    }
  }

  return { vertices: newVertices, faces: newFaces };
};

// ═══════════════════════════════════════════════════════════════════════════
// Apply Full Modifier Stack
// ═══════════════════════════════════════════════════════════════════════════

export const applyModifierStack = (baseMesh: Mesh, modifiers: Modifier[]): Mesh => {
  let mesh = { vertices: [...baseMesh.vertices], faces: [...baseMesh.faces] };

  for (const mod of modifiers) {
    if (!mod.enabled) continue;

    switch (mod.type) {
      case 'mirror':
        mesh = applyMirror(mesh, mod as MirrorModifier);
        break;
      case 'array':
        mesh = applyArray(mesh, mod as ArrayModifier);
        break;
      case 'subdivision':
        mesh = applySubdivision(mesh, mod as SubdivisionModifier);
        break;
      case 'smooth':
        mesh = applySmooth(mesh, mod as SmoothModifier);
        break;
      case 'simpleDeform':
        mesh = applySimpleDeform(mesh, mod as SimpleDeformModifier);
        break;
      case 'decimate':
        mesh = applyDecimate(mesh, mod as DecimateModifier);
        break;
      case 'solidify':
        mesh = applySolidify(mesh, mod as SolidifyModifier);
        break;
      // Other modifiers can be added as needed
      default:
        break;
    }
  }

  return mesh;
};

// Modifier category for UI organization
export const MODIFIER_CATEGORIES: { name: string; types: ModifierType[] }[] = [
  { name: 'Generate', types: ['array', 'mirror', 'solidify', 'wireframe', 'shell'] },
  { name: 'Deform', types: ['simpleDeform', 'lattice', 'smooth', 'shrinkwrap'] },
  { name: 'Modify', types: ['boolean', 'bevel', 'subdivision', 'decimate', 'weld', 'triangulate'] },
];

export default {
  createModifier,
  getModifierName,
  getModifierIcon,
  addModifier,
  removeModifier,
  moveModifier,
  updateModifier,
  duplicateModifier,
  toggleModifier,
  collapseModifier,
  applyModifierStack,
  MODIFIER_CATEGORIES,
};
