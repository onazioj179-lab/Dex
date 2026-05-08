// =============================================================================
// DEX Platform — Track C1: content-addressed BlobStore (planning + index)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * In-memory model of the BlobStore used by tests and planners. The real
 * implementation in `src/main/storage/BlobStore.ts` (host-driven) writes
 * to disk + SQLite refcount. This module owns dedupe + chunking +
 * snapshot semantics.
 */

export interface BlobRef {
  sha256: string;
  bytes: number;
}

export interface ChunkPlan {
  /** SHA-256 of the chunk. */
  sha256: string;
  /** Offset in the original file. */
  offset: number;
  /** Length in bytes. */
  length: number;
}

/**
 * Rolling Rabin-style chunker (deterministic, no randomness). For tests
 * we use a simple modulus-based content-defined boundary detector.
 * Returned chunks are pure positions; caller hashes the actual bytes.
 */
export function planChunks(size: number, opts?: { target?: number; min?: number; max?: number; seed?: (i: number) => number }): { offset: number; length: number }[] {
  const target = opts?.target ?? 64 * 1024;
  const min = opts?.min ?? 16 * 1024;
  const max = opts?.max ?? 256 * 1024;
  if (size <= target) return [{ offset: 0, length: size }];
  const seed = opts?.seed ?? ((i: number) => (i * 2654435761) >>> 0);
  const out: { offset: number; length: number }[] = [];
  let offset = 0;
  while (offset < size) {
    let cut = Math.min(size, offset + target);
    // Look for a content-defined boundary in the [min, max] window.
    const windowEnd = Math.min(size, offset + max);
    for (let i = offset + min; i < windowEnd; i++) {
      if ((seed(i) & 0xFFF) === 0) { cut = i; break; }
    }
    out.push({ offset, length: cut - offset });
    offset = cut;
  }
  return out;
}

export interface BlobIndex {
  put(ref: BlobRef): void;
  has(sha256: string): boolean;
  ref(sha256: string): void;
  unref(sha256: string): void;
  refcount(sha256: string): number;
  totalBytes(): number;
  uniqueCount(): number;
}

export class MemoryBlobIndex implements BlobIndex {
  private readonly counts = new Map<string, number>();
  private readonly sizes = new Map<string, number>();

  put(ref: BlobRef): void {
    if (!this.sizes.has(ref.sha256)) this.sizes.set(ref.sha256, ref.bytes);
    this.counts.set(ref.sha256, (this.counts.get(ref.sha256) ?? 0) + 1);
  }
  has(sha256: string): boolean { return this.counts.has(sha256); }
  ref(sha256: string): void { this.counts.set(sha256, (this.counts.get(sha256) ?? 0) + 1); }
  unref(sha256: string): void {
    const cur = this.counts.get(sha256) ?? 0;
    if (cur <= 1) {
      this.counts.delete(sha256);
      this.sizes.delete(sha256);
    } else {
      this.counts.set(sha256, cur - 1);
    }
  }
  refcount(sha256: string): number { return this.counts.get(sha256) ?? 0; }
  totalBytes(): number {
    let n = 0;
    for (const b of this.sizes.values()) n += b;
    return n;
  }
  uniqueCount(): number { return this.sizes.size; }
}

export interface Snapshot {
  id: string;
  takenAt: number;
  /** Tree of refs: path -> blob sha256. */
  tree: Record<string, string>;
}

export function makeSnapshot(id: string, tree: Record<string, string>, now: number): Snapshot {
  return { id, takenAt: now, tree: { ...tree } };
}

/** Diff two snapshots to compute add/remove/change. */
export function diffSnapshots(a: Snapshot, b: Snapshot): { added: string[]; removed: string[]; changed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const k of Object.keys(b.tree)) {
    if (!(k in a.tree)) added.push(k);
    else if (a.tree[k] !== b.tree[k]) changed.push(k);
  }
  for (const k of Object.keys(a.tree)) {
    if (!(k in b.tree)) removed.push(k);
  }
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort() };
}
