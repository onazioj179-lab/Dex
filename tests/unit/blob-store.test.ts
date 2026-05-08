import { describe, it, expect } from 'vitest';
import { MemoryBlobIndex, planChunks, makeSnapshot, diffSnapshots } from '../../src/shared/storage/blobStore';

describe('BlobStore', () => {
  it('dedupes by sha', () => {
    const idx = new MemoryBlobIndex();
    for (let i = 0; i < 1000; i++) idx.put({ sha256: 'a'.repeat(64), bytes: 100 });
    expect(idx.uniqueCount()).toBe(1);
    expect(idx.totalBytes()).toBe(100);
    expect(idx.refcount('a'.repeat(64))).toBe(1000);
  });
  it('chunks small files into one chunk', () => {
    expect(planChunks(1024).length).toBe(1);
  });
  it('chunks large files into multiple', () => {
    const chunks = planChunks(2_000_000);
    expect(chunks.length).toBeGreaterThan(1);
    const total = chunks.reduce((a, c) => a + c.length, 0);
    expect(total).toBe(2_000_000);
  });
  it('snapshot diff', () => {
    const a = makeSnapshot('s1', { 'a.txt': 'h1', 'b.txt': 'h2' }, 0);
    const b = makeSnapshot('s2', { 'a.txt': 'h1-new', 'c.txt': 'h3' }, 1);
    const d = diffSnapshots(a, b);
    expect(d.added).toEqual(['c.txt']);
    expect(d.removed).toEqual(['b.txt']);
    expect(d.changed).toEqual(['a.txt']);
  });
});
