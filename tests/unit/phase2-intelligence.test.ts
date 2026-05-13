import { describe, it, expect } from 'vitest';
import {
  ProvenanceLedger, rerank, compactArchive, memoryHealth,
} from '../../src/shared/phase2/intelligenceEvolution';

describe('Phase 2 - ProvenanceLedger', () => {
  it('records, retrieves, and clamps confidence', () => {
    const l = new ProvenanceLedger();
    l.record('f1', 'src1', 0.6, 1000);
    l.record('f1', 'src2', 1.5, 2000);
    expect(l.get('f1').length).toBe(2);
    expect(l.get('f1')[0]!.source).toBe('src2');
    expect(l.get('f1')[0]!.confidence).toBe(1);
    expect(l.facts()).toEqual(['f1']);
  });

  it('decays confidence by half-life', () => {
    const l = new ProvenanceLedger();
    l.record('f1', 's', 1.0, 0);
    expect(l.effectiveConfidence('f1', 0, 1000)).toBeCloseTo(1);
    expect(l.effectiveConfidence('f1', 1000, 1000)).toBeCloseTo(0.5);
    expect(l.effectiveConfidence('f1', 2000, 1000)).toBeCloseTo(0.25);
    expect(l.effectiveConfidence('missing', 0, 1000)).toBe(0);
  });

  it('rejects bad inputs', () => {
    const l = new ProvenanceLedger();
    expect(() => l.record('', 's', 1)).toThrow();
    expect(() => l.record('a', '', 1)).toThrow();
    expect(() => l.effectiveConfidence('a', 0, 0)).toThrow();
  });
});

describe('Phase 2 - rerank', () => {
  it('blends lexical, recency, provenance and sorts', () => {
    const prov = new ProvenanceLedger();
    prov.record('factA', 's', 1, 1000);
    const cands = [
      { id: 'a', text: 'hello world', baseScore: 1, factId: 'factA', producedAt: 1000 },
      { id: 'b', text: 'hello there', baseScore: 1, producedAt: 0 },
      { id: 'c', text: 'unrelated content', baseScore: 1 },
    ];
    const out = rerank(cands, { query: 'hello world', now: 1000, recencyHalfLifeMs: 1000, provenance: prov });
    expect(out[0]!.id).toBe('a');
    expect(out[0]!.score).toBeGreaterThan(out[1]!.score);
  });

  it('handles empty query tokens', () => {
    const out = rerank([{ id: 'a', text: 'x', baseScore: 1 }], { query: '', now: 0 });
    expect(out.length).toBe(1);
    expect(out[0]!.components.lexical).toBe(0);
  });

  it('tie-breaks by id', () => {
    const out = rerank(
      [
        { id: 'b', text: 'hi', baseScore: 1 },
        { id: 'a', text: 'hi', baseScore: 1 },
      ],
      { query: 'hi', now: 0 },
    );
    expect(out.map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('Phase 2 - compactArchive', () => {
  it('drops items past max age', () => {
    const r = compactArchive(
      [
        { id: 'old', producedAt: 0, bytes: 10 },
        { id: 'fresh', producedAt: 900, bytes: 10 },
      ],
      { maxAgeMs: 500, now: 1000 },
    );
    expect(r.kept.map((x) => x.id)).toEqual(['fresh']);
    expect(r.archived.map((x) => x.id)).toEqual(['old']);
  });

  it('evicts oldest until under max bytes', () => {
    const r = compactArchive(
      [
        { id: 'a', producedAt: 1, bytes: 100 },
        { id: 'b', producedAt: 2, bytes: 100 },
        { id: 'c', producedAt: 3, bytes: 100 },
      ],
      { maxTotalBytes: 150, now: 100 },
    );
    expect(r.bytesKept).toBeLessThanOrEqual(150);
    expect(r.kept.map((x) => x.id)).toEqual(['c']);
  });

  it('reports byte totals', () => {
    const r = compactArchive(
      [{ id: 'x', producedAt: 0, bytes: 50 }],
      { now: 0 },
    );
    expect(r.bytesKept).toBe(50);
    expect(r.bytesArchived).toBe(0);
  });
});

describe('Phase 2 - memoryHealth', () => {
  it('flags duplicates, low confidence, stale, and orphans', () => {
    const prov = new ProvenanceLedger();
    prov.record('f1', 'src1', 0.05, 1000);
    prov.record('f1', 'src1', 0.05, 1500);
    const r = memoryHealth({
      provenance: prov,
      archive: [{ id: 'a', producedAt: 0, bytes: 1, factId: 'missing' }],
      now: 10_000_000,
      staleMs: 1000,
      minConfidence: 0.5,
    });
    const codes = r.issues.map((i) => i.code).sort();
    expect(codes).toContain('duplicate-fact');
    expect(codes).toContain('low-confidence');
    expect(codes).toContain('stale');
    expect(codes).toContain('orphan-archive');
    expect(r.score).toBeLessThan(1);
  });

  it('scores 1 when no issues', () => {
    const prov = new ProvenanceLedger();
    prov.record('f1', 'src1', 0.9, 1000);
    const r = memoryHealth({ provenance: prov, archive: [], now: 1000 });
    expect(r.issues.length).toBe(0);
    expect(r.score).toBe(1);
  });
});
