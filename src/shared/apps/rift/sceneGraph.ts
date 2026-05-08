// =============================================================================
// DEX Platform — Track G2: Rift scene graph + import policy
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * 3D scene structures and a glTF-import safety classifier. The actual
 * import + render path lives in the host (WebGPU / wgpu via Rapier
 * physics); this module is the policy + scene math.
 */

export type Vec3 = [number, number, number];

export interface Transform {
  position: Vec3;
  rotation: Vec3; // euler radians
  scale: Vec3;
}

export interface SceneNode {
  id: string;
  parentId: string | null;
  name: string;
  transform: Transform;
  /** Mesh sha256 in BlobStore, if any. */
  meshSha256?: string;
  /** Material sha256, if any. */
  materialSha256?: string;
  /** Physics body kind. */
  body?: 'static' | 'dynamic' | 'kinematic' | 'none';
  /** Visibility. */
  visible: boolean;
}

export interface Scene {
  id: string;
  nodes: SceneNode[];
}

export function identityTransform(): Transform {
  return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
}

/** Compute world transforms by walking the parent chain. */
export function worldTransform(scene: Scene, nodeId: string): Transform {
  const byId = new Map(scene.nodes.map(n => [n.id, n]));
  const chain: SceneNode[] = [];
  let cur = byId.get(nodeId);
  let safety = 0;
  while (cur && safety < scene.nodes.length + 1) {
    chain.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    safety += 1;
  }
  const out = identityTransform();
  for (let i = chain.length - 1; i >= 0; i--) {
    const t = chain[i]!.transform;
    out.position = [out.position[0] + t.position[0], out.position[1] + t.position[1], out.position[2] + t.position[2]];
    out.rotation = [out.rotation[0] + t.rotation[0], out.rotation[1] + t.rotation[1], out.rotation[2] + t.rotation[2]];
    out.scale = [out.scale[0] * t.scale[0], out.scale[1] * t.scale[1], out.scale[2] * t.scale[2]];
  }
  return out;
}

export interface GltfReport {
  ok: boolean;
  warnings: string[];
  errors: string[];
  estVramMb: number;
  triangleCount: number;
  textureCount: number;
}

export interface GltfHeaderRaw {
  asset?: { version?: string };
  meshes?: { primitives?: { indices?: unknown; attributes?: Record<string, unknown> }[] }[];
  images?: unknown[];
  textures?: unknown[];
  /** Pre-aggregated approximate triangle count if known. */
  estTriangles?: number;
  /** Pre-aggregated approximate VRAM if known. */
  estVramMb?: number;
}

export function classifyGltf(g: GltfHeaderRaw, opts?: { maxTris?: number; maxVramMb?: number }): GltfReport {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (!g.asset?.version) errors.push('missing asset.version');
  else if (!g.asset.version.startsWith('2.')) warnings.push(`unsupported glTF version ${g.asset.version}; will attempt anyway`);
  const maxTris = opts?.maxTris ?? 5_000_000;
  const maxVram = opts?.maxVramMb ?? 1024;
  const tris = g.estTriangles ?? estimateTriangles(g);
  const vram = g.estVramMb ?? estimateVram(g);
  if (tris > maxTris) errors.push(`triangle count ${tris} exceeds ${maxTris}`);
  if (vram > maxVram) errors.push(`estimated VRAM ${vram}MB exceeds ${maxVram}MB`);
  return {
    ok: errors.length === 0,
    warnings,
    errors,
    estVramMb: vram,
    triangleCount: tris,
    textureCount: (g.textures as unknown[] | undefined)?.length ?? 0,
  };
}

function estimateTriangles(g: GltfHeaderRaw): number {
  let n = 0;
  for (const m of g.meshes ?? []) {
    for (const _p of m.primitives ?? []) n += 1024; // best-effort placeholder
  }
  return n;
}

function estimateVram(g: GltfHeaderRaw): number {
  const tex = (g.textures as unknown[] | undefined)?.length ?? 0;
  const img = (g.images as unknown[] | undefined)?.length ?? 0;
  // Assume 4MB per texture/image as a coarse upper bound.
  return tex * 4 + img * 4;
}
