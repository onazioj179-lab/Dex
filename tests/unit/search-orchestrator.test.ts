// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  SearchOrchestrator,
  type SearchProvider,
  type SearchResult,
} from '../../src/shared/search/SearchOrchestrator';

function fakeResult(
  source: string,
  id: string,
  rawScore: number,
  kind: SearchResult['kind'] = 'app',
): SearchResult {
  return {
    id,
    title: id,
    kind,
    source,
    rawScore,
    score: 0,
    producedAt: 0,
  };
}

function fakeProvider(
  id: string,
  results: SearchResult[],
  opts: { kinds?: SearchResult['kind'][]; weight?: number; delayMs?: number; throws?: boolean } = {},
): SearchProvider {
  return {
    id,
    kinds: opts.kinds ?? ['app'],
    weight: opts.weight,
    async search() {
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      if (opts.throws) throw new Error(`provider ${id} failed`);
      return results;
    },
  };
}

describe('SearchOrchestrator', () => {
  it('register/unregister and size', () => {
    const orch = new SearchOrchestrator();
    expect(orch.size()).toBe(0);
    const off = orch.register(fakeProvider('p1', []));
    expect(orch.size()).toBe(1);
    expect(orch.has('p1')).toBe(true);
    off();
    expect(orch.size()).toBe(0);
    expect(orch.has('p1')).toBe(false);
  });

  it('rejects duplicate provider ids', () => {
    const orch = new SearchOrchestrator();
    orch.register(fakeProvider('dup', []));
    expect(() => orch.register(fakeProvider('dup', []))).toThrow(/already registered/);
  });

  it('returns empty for empty query', async () => {
    const orch = new SearchOrchestrator();
    orch.register(fakeProvider('p1', [fakeResult('p1', '1', 1)]));
    const r = await orch.search({ text: '   ' });
    expect(r.results).toEqual([]);
    expect(r.timings).toEqual([]);
  });

  it('blends results normalized per provider and sorts by score', async () => {
    const orch = new SearchOrchestrator();
    orch.register(
      fakeProvider('p1', [
        fakeResult('p1', 'a', 100),
        fakeResult('p1', 'b', 50),
      ]),
    );
    orch.register(
      fakeProvider('p2', [
        fakeResult('p2', 'c', 1),
        fakeResult('p2', 'd', 0.5),
      ]),
    );
    const r = await orch.search({ text: 'q' });
    expect(r.results.length).toBe(4);
    expect(r.results[0]!.id).toBe('a');
    expect(r.results[0]!.score).toBeCloseTo(1);
    expect(r.results[1]!.id).toBe('c');
    expect(r.results[1]!.score).toBeCloseTo(1);
    expect(r.results[2]!.score).toBeCloseTo(0.5);
    expect(r.results[3]!.score).toBeCloseTo(0.5);
  });

  it('applies provider weight', async () => {
    const orch = new SearchOrchestrator();
    orch.register(fakeProvider('p1', [fakeResult('p1', 'a', 1)], { weight: 0.5 }));
    orch.register(fakeProvider('p2', [fakeResult('p2', 'b', 1)], { weight: 1 }));
    const r = await orch.search({ text: 'q' });
    expect(r.results[0]!.id).toBe('b');
    expect(r.results[1]!.id).toBe('a');
  });

  it('skips providers when kinds filter has no overlap', async () => {
    const orch = new SearchOrchestrator();
    orch.register(fakeProvider('apps', [fakeResult('apps', 'a', 1, 'app')], { kinds: ['app'] }));
    orch.register(fakeProvider('files', [fakeResult('files', 'f', 1, 'file')], { kinds: ['file'] }));
    const r = await orch.search({ text: 'q', kinds: ['file'] });
    expect(r.results.map((x) => x.source)).toEqual(['files']);
    expect(r.timings.map((t) => t.provider)).toEqual(['files']);
  });

  it('honors provider accept callback', async () => {
    const orch = new SearchOrchestrator();
    const provider: SearchProvider = {
      id: 'picky',
      kinds: ['app'],
      accept: (q) => q.text.startsWith('!'),
      async search() { return [fakeResult('picky', 'x', 1)]; },
    };
    orch.register(provider);
    expect((await orch.search({ text: 'hi' })).results.length).toBe(0);
    expect((await orch.search({ text: '!hi' })).results.length).toBe(1);
  });

  it('isolates throwing providers', async () => {
    const orch = new SearchOrchestrator();
    orch.register(fakeProvider('p1', [fakeResult('p1', 'a', 1)]));
    orch.register(fakeProvider('p2', [], { throws: true }));
    const r = await orch.search({ text: 'q' });
    expect(r.results.map((x) => x.id)).toEqual(['a']);
    expect(r.timings.length).toBe(2);
  });

  it('times out slow providers without breaking others', async () => {
    const orch = new SearchOrchestrator({ providerTimeoutMs: 30 });
    orch.register(fakeProvider('fast', [fakeResult('fast', 'f', 1)]));
    orch.register(fakeProvider('slow', [fakeResult('slow', 's', 1)], { delayMs: 200 }));
    const r = await orch.search({ text: 'q' });
    expect(r.results.map((x) => x.id)).toEqual(['f']);
  });

  it('deduplicates by kind+id across providers', async () => {
    const orch = new SearchOrchestrator();
    orch.register(fakeProvider('p1', [fakeResult('p1', 'shared', 1)]));
    orch.register(fakeProvider('p2', [fakeResult('p2', 'shared', 0.5)]));
    const r = await orch.search({ text: 'q' });
    expect(r.results.length).toBe(1);
    expect(r.results[0]!.source).toBe('p1');
  });

  it('respects maxResults', async () => {
    const orch = new SearchOrchestrator({ maxResults: 2 });
    const many = Array.from({ length: 10 }, (_, i) =>
      fakeResult('p1', `id${i}`, 10 - i),
    );
    orch.register(fakeProvider('p1', many));
    const r = await orch.search({ text: 'q' });
    expect(r.results.length).toBe(2);
  });
});
