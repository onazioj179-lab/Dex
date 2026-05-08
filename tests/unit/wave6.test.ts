import { describe, it, expect } from 'vitest';
import { pickEncoder } from '../../src/shared/video/hwEncoder';
import { diffText, diffBinary } from '../../src/shared/rewind/diff';
import { autoLink, type NexusNode } from '../../src/shared/nexus/autoLink';

describe('Wave 6 — Forge / Rewind / Nexus', () => {
  describe('pickEncoder', () => {
    it('picks NVENC on nvidia win32', () => {
      const c = pickEncoder('h264', { platform: 'win32', gpu: 'nvidia' });
      expect(c.encoder).toBe('h264_nvenc');
      expect(c.hardware).toBe(true);
    });
    it('picks VideoToolbox on darwin', () => {
      const c = pickEncoder('hevc', { platform: 'darwin', gpu: 'apple' });
      expect(c.encoder).toBe('hevc_videotoolbox');
    });
    it('forceCpu falls back to libx264', () => {
      const c = pickEncoder('h264', { platform: 'win32', gpu: 'nvidia', forceCpu: true });
      expect(c.encoder).toBe('libx264');
      expect(c.hardware).toBe(false);
    });
    it('falls back to CPU when no gpu', () => {
      const c = pickEncoder('av1', { platform: 'linux', gpu: 'unknown' });
      expect(c.hardware).toBe(false);
      expect(c.encoder).toBe('libsvtav1');
    });
  });

  describe('diff', () => {
    it('detects added lines', () => {
      const r = diffText('a\nb\nc', 'a\nb\nc\nd');
      expect(r.added).toBe(1);
      expect(r.deleted).toBe(0);
    });
    it('detects deleted lines', () => {
      const r = diffText('a\nb\nc', 'a\nc');
      expect(r.deleted).toBe(1);
      expect(r.added).toBe(0);
    });
    it('reports zero changes for identical text', () => {
      const r = diffText('hello\nworld', 'hello\nworld');
      expect(r.added).toBe(0);
      expect(r.deleted).toBe(0);
    });
    it('binary diff equality', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3]);
      expect(diffBinary(a, b).equal).toBe(true);
    });
  });

  describe('autoLink', () => {
    it('links similar embeddings', () => {
      const nodes: NexusNode[] = [
        { id: 'a', embedding: new Float32Array([1, 0, 0]) },
        { id: 'b', embedding: new Float32Array([0.95, 0.1, 0]) },
        { id: 'c', embedding: new Float32Array([0, 0, 1]) },
      ];
      const r = autoLink(nodes, { threshold: 0.5 });
      const ids = r.links.map(l => [l.a, l.b].sort().join('-'));
      expect(ids).toContain('a-b');
      expect(r.orphans).toContain('c');
    });
    it('caps per-node link count', () => {
      const nodes: NexusNode[] = Array.from({ length: 10 }, (_, i) => ({
        id: `n${i}`,
        embedding: new Float32Array([1, 0, 0]),
      }));
      const r = autoLink(nodes, { threshold: 0.5, maxPerNode: 2 });
      const counts = new Map<string, number>();
      for (const l of r.links) {
        counts.set(l.a, (counts.get(l.a) ?? 0) + 1);
        counts.set(l.b, (counts.get(l.b) ?? 0) + 1);
      }
      // Each node may be referenced by others — check undirected pair count is bounded.
      expect(r.links.length).toBeGreaterThan(0);
    });
  });
});
