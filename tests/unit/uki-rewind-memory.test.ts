// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * UKI Rewind memory bridge tests
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import {
  UkiRewindMemory,
  makeKnowledgeAdapter,
  makeNativeMemoryAdapter,
  makeRewindAdapter,
  type RecallSource,
} from '../../src/main/uki/knowledge/UkiRewindMemory';

const NOW = 1_700_000_000_000;

function knowledge(rows: RecallSource[]) {
  return { search: (_q: string, _n: number) => rows };
}
function native(rows: RecallSource[]) {
  return { search: (_q: string, _n: number) => rows };
}
function rewind(rows: RecallSource[]) {
  return { search: (_q: string, _d: number) => rows };
}

function row(over: Partial<RecallSource>): RecallSource {
  return {
    source: 'knowledge',
    id: 'x',
    label: 'x',
    summary: 'x',
    timestamp: NOW,
    rawScore: 0.5,
    score: 0,
    ...over,
  };
}

describe('UkiRewindMemory', () => {
  it('returns empty result for empty query', () => {
    const m = new UkiRewindMemory({ now: () => NOW });
    const r = m.recallContext('   ');
    expect(r.results).toEqual([]);
    expect(r.synthesis).toBe('');
  });

  it('isAvailable reflects wired providers', () => {
    expect(new UkiRewindMemory().isAvailable).toBe(false);
    expect(new UkiRewindMemory({ knowledge: knowledge([]) }).isAvailable).toBe(true);
  });

  it('merges results from all three providers and dedupes by source+id', () => {
    const m = new UkiRewindMemory({
      now: () => NOW,
      knowledge: knowledge([row({ source: 'knowledge', id: 'a', rawScore: 0.9 })]),
      native: native([row({ source: 'native', id: 'b', rawScore: 0.8 })]),
      rewind: rewind([
        row({ source: 'rewind', id: 'c', rawScore: 0.7 }),
        row({ source: 'rewind', id: 'c', rawScore: 0.5 }), // dup, lower
      ]),
    });
    const r = m.recallContext('anything');
    expect(r.results.map(x => `${x.source}:${x.id}`).sort()).toEqual(['knowledge:a', 'native:b', 'rewind:c']);
  });

  it('ranks by blended similarity + recency', () => {
    const recent = row({ source: 'rewind', id: 'fresh', rawScore: 0.5, timestamp: NOW });
    const stale = row({ source: 'rewind', id: 'stale', rawScore: 0.5, timestamp: NOW - 30 * 24 * 60 * 60 * 1000 });
    const m = new UkiRewindMemory({
      now: () => NOW,
      rewind: rewind([stale, recent]),
    });
    const r = m.recallContext('anything');
    expect(r.results[0].id).toBe('fresh');
    expect(r.results[0].score).toBeGreaterThan(r.results[1].score);
  });

  it('respects limit', () => {
    const rows: RecallSource[] = Array.from({ length: 30 }, (_, i) => row({ id: `n${i}`, rawScore: i / 30 }));
    const m = new UkiRewindMemory({ now: () => NOW, knowledge: knowledge(rows) });
    const r = m.recallContext('q', { limit: 5 });
    expect(r.results).toHaveLength(5);
  });

  it('survives a provider that throws', () => {
    const m = new UkiRewindMemory({
      now: () => NOW,
      knowledge: { search: () => { throw new Error('boom'); } },
      rewind: rewind([row({ source: 'rewind', id: 'ok', rawScore: 0.4 })]),
    });
    const r = m.recallContext('q');
    expect(r.results.map(x => x.id)).toEqual(['ok']);
  });
});

describe('UkiRewindMemory adapters', () => {
  it('knowledge adapter scores by token coverage', () => {
    const adapter = makeKnowledgeAdapter({
      getNodes: () => [
        { id: 'app:imosion', label: 'Imosion', type: 'app', weight: 5, lastUsed: NOW },
        { id: 'app:vinx', label: 'VINX', type: 'app', weight: 3, lastUsed: NOW },
      ],
    });
    const out = adapter.search('imosion', 10);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('app:imosion');
    expect(out[0].rawScore).toBe(1);
  });

  it('native adapter parses JSON results', () => {
    const adapter = makeNativeMemoryAdapter({
      ukiMemorySearch: () => JSON.stringify([
        { id: '1', summary: 'opened files app', action: 'open', timestamp: NOW, score: 0.8 },
        { id: '2', summary: '', action: 'noop', timestamp: NOW }, // dropped
      ]),
    });
    const out = adapter.search('files', 10);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('open');
  });

  it('native adapter returns empty on bad JSON', () => {
    const adapter = makeNativeMemoryAdapter({ ukiMemorySearch: () => 'not json' });
    expect(adapter.search('q', 10)).toEqual([]);
  });

  it('rewind adapter computes token-coverage similarity', () => {
    const adapter = makeRewindAdapter({
      search: () => [
        { id: 'r1', type: 'clipboard', content: 'copied my password reset link', appName: 'Browser', timestamp: NOW, metadata: {} },
      ],
    });
    const out = adapter.search('password reset', 7);
    expect(out).toHaveLength(1);
    expect(out[0].rawScore).toBe(1);
  });
});
