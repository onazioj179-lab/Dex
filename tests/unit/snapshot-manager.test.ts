import { describe, it, expect } from 'vitest';
import { MemoryBlobIndex } from '../../src/shared/storage/blobStore';
import { SnapshotManager, MemorySnapshotStore } from '../../src/shared/storage/snapshotManager';

describe('SnapshotManager', () => {
  it('captures snapshot and bumps refcounts', () => {
    const blobs = new MemoryBlobIndex();
    const sm = new SnapshotManager(blobs, new MemorySnapshotStore(), () => 100);
    sm.capture('s1', { 'a.txt': { sha256: 'h1', bytes: 10 }, 'b.txt': { sha256: 'h2', bytes: 20 } });
    expect(blobs.refcount('h1')).toBe(1);
    expect(blobs.uniqueCount()).toBe(2);
  });

  it('discards snapshot and decrements refs', () => {
    const blobs = new MemoryBlobIndex();
    const sm = new SnapshotManager(blobs, new MemorySnapshotStore(), () => 100);
    sm.capture('s1', { 'a.txt': { sha256: 'h1', bytes: 10 } });
    expect(sm.discard('s1')).toBe(true);
    expect(blobs.refcount('h1')).toBe(0);
  });

  it('diff against null = all added', () => {
    const blobs = new MemoryBlobIndex();
    const sm = new SnapshotManager(blobs, new MemorySnapshotStore(), () => 100);
    sm.capture('s1', { 'a.txt': { sha256: 'h1', bytes: 10 } });
    const d = sm.diff(null, 's1');
    expect(d?.added).toEqual(['a.txt']);
  });

  it('prunes old snapshots', () => {
    const blobs = new MemoryBlobIndex();
    let now = 1000;
    const sm = new SnapshotManager(blobs, new MemorySnapshotStore(), () => now);
    sm.capture('old', { 'a.txt': { sha256: 'h1', bytes: 10 } });
    now = 10_000;
    sm.capture('new', { 'b.txt': { sha256: 'h2', bytes: 20 } });
    const dropped = sm.prune(5_000);
    expect(dropped).toEqual(['old']);
    expect(blobs.refcount('h1')).toBe(0);
    expect(blobs.refcount('h2')).toBe(1);
  });
});
