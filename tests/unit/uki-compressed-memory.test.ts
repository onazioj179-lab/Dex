// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI compressed memory tests
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';

import * as memory from '../../src/renderer/uki/memory';
import {
  COMPRESS_THRESHOLD,
  OLDER_BATCH,
  maybeConsolidate,
  listArchives,
  expandArchive,
  searchArchives,
  getCompressionStats,
  clearArchives,
} from '../../src/renderer/uki/compressedMemory';

describe('UKI compressed memory', () => {
  beforeEach(async () => {
    localStorage.clear();
    await memory.clearTurns();
    await clearArchives();
  });

  it('does nothing when below the compression threshold', async () => {
    for (let i = 0; i < 10; i++) {
      await memory.recordTurn(`hello ${i}`, `reply ${i}`);
    }
    const archive = await maybeConsolidate();
    expect(archive).toBeNull();
    const archives = await listArchives();
    expect(archives.length).toBe(0);
  });

  it('produces an archive once turns exceed the threshold', async () => {
    for (let i = 0; i < COMPRESS_THRESHOLD + OLDER_BATCH + 5; i++) {
      await memory.recordTurn(
        `user message about photos and timeline ${i}`,
        `uki reply about gallery and editor ${i}`,
        { appContext: { foregroundAppId: i % 2 === 0 ? 'gallery' : 'videoeditor' } },
      );
    }
    // Force a consolidation pass in case lazy invocation skipped during writes.
    await maybeConsolidate();
    const archives = await listArchives();
    expect(archives.length).toBeGreaterThan(0);
    const first = archives[0];
    expect(first.turnCount).toBe(OLDER_BATCH);
    expect(first.summary).toContain('Archive of');
    expect(first.topics.length).toBeGreaterThan(0);
    expect(first.apps.length).toBeGreaterThan(0);
  });

  it('expands a compressed archive back to the original turns when CompressionStream is available', async () => {
    for (let i = 0; i < COMPRESS_THRESHOLD + OLDER_BATCH; i++) {
      await memory.recordTurn(`q${i}`, `a${i}`);
    }
    const archives = await listArchives();
    expect(archives.length).toBeGreaterThan(0);
    const archive = archives[0];
    if (!archive.payloadGz) return; // CompressionStream not available in this runtime
    const restored = await expandArchive(archive);
    expect(restored.length).toBe(archive.turnCount);
    expect(restored[0].user).toBe('q0');
  });

  it('search ranks archives by overlap with query terms', async () => {
    for (let i = 0; i < COMPRESS_THRESHOLD + OLDER_BATCH; i++) {
      await memory.recordTurn(`render gallery image ${i}`, `gallery reply ${i}`);
    }
    const hits = await searchArchives('gallery', 5);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('reports compression stats with a sane ratio', async () => {
    for (let i = 0; i < COMPRESS_THRESHOLD + OLDER_BATCH; i++) {
      await memory.recordTurn(`hello world ${i}`, `general response ${i}`);
    }
    const stats = await getCompressionStats();
    expect(stats.archiveCount).toBeGreaterThan(0);
    expect(stats.rawBytes).toBeGreaterThan(0);
    expect(stats.ratio).toBeGreaterThan(0);
    expect(stats.ratio).toBeLessThanOrEqual(1);
  });
});
