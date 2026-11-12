/**
 * Flux layer parenting (null objects, pick-whip).
 *
 * Layers had a `parent` field and a Null Object panel, but the renderer never
 * read `parent`, so parenting did nothing. A child is now drawn inside its
 * parent's transform (position, rotation, scale, anchor), up the whole chain.
 */

export interface ParentTransform { x: number; y: number; rotationZ: number; scaleX: number; scaleY: number; anchorX: number; anchorY: number }
interface ParentLike { id: string; parent?: string }

export const MAX_PARENT_DEPTH = 16;

/** Ancestors from the root down to the direct parent. Cycles and missing parents stop the chain. */
export function ancestorChain<T extends ParentLike>(layers: readonly T[], layer: T): T[] {
  const byId = new Map(layers.map(l => [l.id, l]));
  const chain: T[] = [];
  const seen = new Set<string>([layer.id]);
  let cur = layer.parent ? byId.get(layer.parent) : undefined;
  while (cur && !seen.has(cur.id) && chain.length < MAX_PARENT_DEPTH) {
    chain.unshift(cur);
    seen.add(cur.id);
    cur = cur.parent ? byId.get(cur.parent) : undefined;
  }
  return chain;
}

/** True when making `parentId` the parent of `childId` would create a loop. */
export function wouldCycle<T extends ParentLike>(layers: readonly T[], childId: string, parentId: string): boolean {
  if (childId === parentId) return true;
  const byId = new Map(layers.map(l => [l.id, l]));
  let cur = byId.get(parentId);
  for (let i = 0; cur && i < MAX_PARENT_DEPTH + 1; i++) {
    if (cur.id === childId) return true;
    cur = cur.parent ? byId.get(cur.parent) : undefined;
  }
  return false;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Map a point in the parent's local space to the space the parent lives in. */
export function toParentSpace(p: { x: number; y: number }, t: ParentTransform): { x: number; y: number } {
  const lx = (p.x - t.anchorX) * (t.scaleX / 100);
  const ly = (p.y - t.anchorY) * (t.scaleY / 100);
  const c = Math.cos(rad(t.rotationZ)), s = Math.sin(rad(t.rotationZ));
  return { x: t.x + lx * c - ly * s, y: t.y + lx * s + ly * c };
}

/** Inverse of toParentSpace: where a point sits inside the parent's local space. */
export function fromParentSpace(p: { x: number; y: number }, t: ParentTransform): { x: number; y: number } {
  const dx = p.x - t.x, dy = p.y - t.y;
  const c = Math.cos(rad(-t.rotationZ)), s = Math.sin(rad(-t.rotationZ));
  const rx = dx * c - dy * s, ry = dx * s + dy * c;
  const sx = t.scaleX / 100 || 1, sy = t.scaleY / 100 || 1;
  return { x: rx / sx + t.anchorX, y: ry / sy + t.anchorY };
}

/** Apply one parent's transform to a 2D context (same order the layer itself uses). */
export function applyParentTransform(ctx: Pick<CanvasRenderingContext2D, 'translate' | 'rotate' | 'scale'>, t: ParentTransform): void {
  ctx.translate(t.x, t.y);
  if (t.rotationZ) ctx.rotate(rad(t.rotationZ));
  ctx.scale(t.scaleX / 100, t.scaleY / 100);
  if (t.anchorX || t.anchorY) ctx.translate(-t.anchorX, -t.anchorY);
}

interface TLayer extends ParentLike { transform: ParentTransform }

/**
 * Re-parent a layer without it jumping: its position is converted from the old
 * parent chain to world space and into the new parent's chain (static values;
 * rotation and scale are compensated by the direct parents only).
 */
export function reparentPosition<T extends TLayer>(layers: readonly T[], layer: T, newParentId: string | undefined): { x: number; y: number; rotationZ: number; scaleX: number; scaleY: number } {
  let p = { x: layer.transform.x, y: layer.transform.y };
  for (const anc of ancestorChain(layers, layer).reverse()) p = toParentSpace(p, anc.transform);
  const oldParent = layer.parent ? layers.find(l => l.id === layer.parent) : undefined;
  let rot = layer.transform.rotationZ + (oldParent?.transform.rotationZ ?? 0);
  let sx = layer.transform.scaleX * (oldParent ? oldParent.transform.scaleX / 100 : 1);
  let sy = layer.transform.scaleY * (oldParent ? oldParent.transform.scaleY / 100 : 1);
  const newParent = newParentId ? layers.find(l => l.id === newParentId) : undefined;
  if (newParent) {
    for (const anc of [...ancestorChain(layers, newParent), newParent]) p = fromParentSpace(p, anc.transform);
    rot -= newParent.transform.rotationZ;
    sx = sx * 100 / (newParent.transform.scaleX || 100);
    sy = sy * 100 / (newParent.transform.scaleY || 100);
  }
  return { x: p.x, y: p.y, rotationZ: rot, scaleX: sx, scaleY: sy };
}
