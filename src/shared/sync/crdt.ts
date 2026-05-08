// =============================================================================
// DEX Platform — Track C2: CRDT primitives (LWW map + RGA-lite text)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Minimal, dependency-free CRDTs for sync. Not a Yjs replacement — a
 * deterministic core that mergers can target uniformly. Two structures:
 *
 *   LwwMap<V>  — Last-Writer-Wins map keyed by string, ordered by Lamport ts.
 *   RgaText    — Replicated Growable Array for collaborative text.
 *
 * Both expose `apply(op)` and `state()` so we can serialize op logs into
 * the BlobStore.
 */

export interface Lamport {
  /** Logical clock. */
  t: number;
  /** Replica id (stable). */
  r: string;
}

export function lamportCompare(a: Lamport, b: Lamport): number {
  if (a.t !== b.t) return a.t < b.t ? -1 : 1;
  if (a.r !== b.r) return a.r < b.r ? -1 : 1;
  return 0;
}

export type LwwOp<V> = { kind: 'set'; key: string; value: V; ts: Lamport }
                    | { kind: 'del'; key: string; ts: Lamport };

export class LwwMap<V> {
  private readonly tombstones = new Map<string, Lamport>();
  private readonly values = new Map<string, { v: V; ts: Lamport }>();
  private clock = 0;
  constructor(private readonly replicaId: string) {}

  tick(): Lamport {
    this.clock += 1;
    return { t: this.clock, r: this.replicaId };
  }

  set(key: string, value: V): LwwOp<V> {
    const op: LwwOp<V> = { kind: 'set', key, value, ts: this.tick() };
    this.apply(op);
    return op;
  }

  del(key: string): LwwOp<V> {
    const op: LwwOp<V> = { kind: 'del', key, ts: this.tick() };
    this.apply(op);
    return op;
  }

  apply(op: LwwOp<V>): void {
    // Advance clock past observed.
    if (op.ts.t > this.clock) this.clock = op.ts.t;
    const tomb = this.tombstones.get(op.key);
    if (op.kind === 'del') {
      if (!tomb || lamportCompare(op.ts, tomb) > 0) this.tombstones.set(op.key, op.ts);
      const cur = this.values.get(op.key);
      if (cur && lamportCompare(op.ts, cur.ts) > 0) this.values.delete(op.key);
      return;
    }
    if (tomb && lamportCompare(op.ts, tomb) <= 0) return;
    const cur = this.values.get(op.key);
    if (!cur || lamportCompare(op.ts, cur.ts) > 0) this.values.set(op.key, { v: op.value, ts: op.ts });
  }

  get(key: string): V | undefined { return this.values.get(key)?.v; }
  state(): Record<string, V> {
    const out: Record<string, V> = {};
    for (const [k, v] of this.values.entries()) out[k] = v.v;
    return out;
  }
}

// -- RGA-lite ---------------------------------------------------------------

interface RgaNode {
  id: string;          // `${ts}-${replica}` unique
  parentId: string | null;
  ch: string;
  deleted: boolean;
}

export type RgaOp =
  | { kind: 'ins'; id: string; parentId: string | null; ch: string }
  | { kind: 'del'; id: string };

export class RgaText {
  private readonly nodes = new Map<string, RgaNode>();
  private readonly children = new Map<string | null, string[]>();
  private clock = 0;
  constructor(private readonly replicaId: string) {
    this.children.set(null, []);
  }

  insert(afterIdx: number, ch: string): RgaOp {
    const ordered = this.flatten();
    const parentId = afterIdx < 0 ? null : ordered[afterIdx]?.id ?? null;
    this.clock += 1;
    const id = `${this.clock.toString(36).padStart(8, '0')}-${this.replicaId}`;
    const op: RgaOp = { kind: 'ins', id, parentId, ch };
    this.apply(op);
    return op;
  }

  delete(idx: number): RgaOp | null {
    const ordered = this.flatten().filter(n => !n.deleted);
    const node = ordered[idx];
    if (!node) return null;
    const op: RgaOp = { kind: 'del', id: node.id };
    this.apply(op);
    return op;
  }

  apply(op: RgaOp): void {
    if (op.kind === 'del') {
      const n = this.nodes.get(op.id);
      if (n) n.deleted = true;
      return;
    }
    if (this.nodes.has(op.id)) return;
    const node: RgaNode = { id: op.id, parentId: op.parentId, ch: op.ch, deleted: false };
    this.nodes.set(op.id, node);
    const siblings = this.children.get(op.parentId) ?? [];
    // Insert sibling sorted by id descending so newer ids come first
    // (RGA convention; deterministic across replicas).
    let inserted = false;
    for (let i = 0; i < siblings.length; i++) {
      if (op.id > siblings[i]!) { siblings.splice(i, 0, op.id); inserted = true; break; }
    }
    if (!inserted) siblings.push(op.id);
    this.children.set(op.parentId, siblings);
    this.children.set(op.id, this.children.get(op.id) ?? []);
    // Advance local clock if remote outpaced us.
    const tsHex = op.id.split('-')[0]!;
    const tsNum = parseInt(tsHex, 36);
    if (tsNum > this.clock) this.clock = tsNum;
  }

  toString(): string {
    return this.flatten().filter(n => !n.deleted).map(n => n.ch).join('');
  }

  private flatten(): RgaNode[] {
    const out: RgaNode[] = [];
    const walk = (parentId: string | null): void => {
      const sibs = this.children.get(parentId) ?? [];
      for (const id of sibs) {
        const n = this.nodes.get(id)!;
        out.push(n);
        walk(id);
      }
    };
    walk(null);
    return out;
  }
}
