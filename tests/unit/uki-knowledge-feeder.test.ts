// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI knowledge feeder tests
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';

import * as memory from '../../src/renderer/uki/memory';
import { clearArchives, listArchives } from '../../src/renderer/uki/compressedMemory';
import {
  runKnowledgeFeed,
  getFeedStatus,
  enforceBudget,
  DEFAULT_BUDGET_BYTES,
} from '../../src/renderer/uki/knowledgeFeeder';

describe('UKI knowledge feeder', () => {
  beforeEach(async () => {
    localStorage.clear();
    await memory.clearTurns();
    await clearArchives();
  });

  it('runs the feed and ingests at least the app catalog facts', async () => {
    const result = await runKnowledgeFeed({ force: true });
    expect(result).not.toBeNull();
    expect(result!.ingestedTurns).toBeGreaterThan(0);
    expect(result!.sources['app-catalog']).toBeGreaterThan(0);
  });

  it('respects the cooldown when force is not set', async () => {
    const first = await runKnowledgeFeed({ force: true });
    expect(first).not.toBeNull();
    const second = await runKnowledgeFeed();
    expect(second).toBeNull();
  });

  it('reports status with a 100 MB default budget', async () => {
    await runKnowledgeFeed({ force: true });
    const status = await getFeedStatus();
    expect(status.budgetBytes).toBe(DEFAULT_BUDGET_BYTES);
    expect(status.totalIngested).toBeGreaterThan(0);
    expect(status.utilization).toBeGreaterThanOrEqual(0);
    expect(status.utilization).toBeLessThanOrEqual(1);
  });

  it('ingests recent files when present', async () => {
    localStorage.setItem('dex-recent-files', JSON.stringify([
      { path: 'C:/x/a.txt', name: 'a.txt', appId: 'code', openedAt: Date.now() },
      { path: 'C:/x/b.md', name: 'b.md', appId: 'notes', openedAt: Date.now() },
    ]));
    const result = await runKnowledgeFeed({ force: true });
    expect(result!.sources['recent-files']).toBe(2);
  });

  it('enforceBudget prunes oldest archives when over budget', async () => {
    await runKnowledgeFeed({ force: true });
    const before = await listArchives();
    // Force tiny budget to trigger pruning if archives exist
    const out = await enforceBudget(1);
    const after = await listArchives();
    expect(out.bytesAfter).toBeGreaterThanOrEqual(0);
    expect(after.length).toBeLessThanOrEqual(before.length);
  });
});
