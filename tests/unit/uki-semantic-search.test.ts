// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI semantic search facade tests
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/renderer/uki/index_search', () => {
  return {
    query: vi.fn(async (q: string, limit: number) => {
      const corpus = [
        { id: 'app:notes', kind: 'app' as const, title: 'Notes', body: 'capture ideas notes markdown' },
        { id: 'app:tasks', kind: 'app' as const, title: 'Tasks', body: 'manage tasks reminders' },
        { id: 'wf:weekly', kind: 'workflow' as const, title: 'Weekly review', body: 'review notes tasks weekly' },
        { id: 'sc:ctrl-n', kind: 'shortcut' as const, title: 'Ctrl+N', body: 'open new notes' },
      ];
      const t = q.toLowerCase();
      const hits = corpus
        .map((doc, i) => ({ doc, score: doc.body.includes(t) || doc.title.toLowerCase().includes(t) ? 10 - i : 0 }))
        .filter((h) => h.score > 0);
      return hits.slice(0, limit);
    }),
  };
});

import {
  semanticSearch,
  getBackendStatus,
} from '../../src/renderer/uki/semanticSearch';

describe('UKI semanticSearch facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for empty query', async () => {
    const hits = await semanticSearch('');
    expect(hits).toEqual([]);
  });

  it('returns lexical hits with normalized scores in 0..1', async () => {
    const hits = await semanticSearch('notes');
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(h.normalizedScore).toBeGreaterThan(0);
      expect(h.normalizedScore).toBeLessThanOrEqual(1);
      expect(h.source).toBe('lexical');
    }
    // Top hit has normalized score == 1.
    expect(hits[0].normalizedScore).toBe(1);
  });

  it('respects limit parameter', async () => {
    const hits = await semanticSearch('notes', { limit: 1 });
    expect(hits.length).toBe(1);
  });

  it('filters by kind when kinds is provided', async () => {
    const hits = await semanticSearch('notes', { kinds: ['workflow'] });
    expect(hits.every((h) => h.doc.kind === 'workflow')).toBe(true);
  });

  it('filters by minScore', async () => {
    const hits = await semanticSearch('notes', { minScore: 0.99 });
    // Only the top-normalized hit (score == 1) survives.
    expect(hits.length).toBe(1);
    expect(hits[0].normalizedScore).toBe(1);
  });

  it('reports backend status with lexical always available', () => {
    const status = getBackendStatus();
    expect(status.lexical).toBe(true);
    // Native-backed lanes are off until phase 4.5/4.6 ships.
    expect(status.semantic).toBe(false);
    expect(status.vector).toBe(false);
  });
});
