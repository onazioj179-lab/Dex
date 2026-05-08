// =============================================================================
// DEX Platform — Phase 2: Snapshot manager (over BlobStore)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Tracks named snapshots over a BlobIndex. Used by the installer to roll
 * back failed installs and by Rewind for project history.
 */

import type { BlobIndex } from './blobStore';
import { makeSnapshot, diffSnapshots, type Snapshot } from './blobStore';

export interface SnapshotStore {
  put(snap: Snapshot): void;
  get(id: string): Snapshot | undefined;
  list(): Snapshot[];
  delete(id: string): void;
}

export class MemorySnapshotStore implements SnapshotStore {
  private map = new Map<string, Snapshot>();
  put(s: Snapshot): void { this.map.set(s.id, s); }
  get(id: string): Snapshot | undefined { return this.map.get(id); }
  list(): Snapshot[] { return Array.from(this.map.values()).sort((a, b) => a.takenAt - b.takenAt); }
  delete(id: string): void { this.map.delete(id); }
}

export class SnapshotManager {
  constructor(
    private readonly blobs: BlobIndex,
    private readonly store: SnapshotStore,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Create a snapshot. Each entry's blob is refcount-bumped via `blobs.put`. */
  capture(id: string, entries: Record<string, { sha256: string; bytes: number }>): Snapshot {
    for (const v of Object.values(entries)) this.blobs.put({ sha256: v.sha256, bytes: v.bytes });
    const fileMap: Record<string, string> = {};
    for (const [path, v] of Object.entries(entries)) fileMap[path] = v.sha256;
    const snap = makeSnapshot(id, fileMap, this.now());
    this.store.put(snap);
    return snap;
  }

  /** Drop a snapshot and decrement refs on its blobs. */
  discard(id: string): boolean {
    const snap = this.store.get(id);
    if (!snap) return false;
    for (const sha of Object.values(snap.tree)) this.blobs.unref(sha);
    this.store.delete(id);
    return true;
  }

  /** Compute diff between two snapshot ids (or against an empty snapshot). */
  diff(fromId: string | null, toId: string): ReturnType<typeof diffSnapshots> | null {
    const to = this.store.get(toId);
    if (!to) return null;
    const from = fromId ? this.store.get(fromId) : null;
    const empty: Snapshot = { id: '__empty__', takenAt: 0, tree: {} };
    return diffSnapshots(from ?? empty, to);
  }

  /** Prune snapshots older than maxAgeMs, returning the discarded ids. */
  prune(maxAgeMs: number): string[] {
    const cutoff = this.now() - maxAgeMs;
    const dropped: string[] = [];
    for (const s of this.store.list()) {
      if (s.takenAt < cutoff) {
        if (this.discard(s.id)) dropped.push(s.id);
      }
    }
    return dropped;
  }
}
