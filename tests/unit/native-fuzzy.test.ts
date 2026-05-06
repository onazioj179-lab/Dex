// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';

// Lazy-require so test doesn't crash on platforms without the prebuilt binary.
function loadNative(): { fuzzyRank?: Function; fuzzyScore?: Function } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../native');
  } catch {
    return null;
  }
}

const native = loadNative();
const describeIfNative = native?.fuzzyRank ? describe : describe.skip;

describeIfNative('native fuzzy matcher', () => {
  it('exports fuzzyRank and fuzzyScore', () => {
    expect(typeof native!.fuzzyRank).toBe('function');
    expect(typeof native!.fuzzyScore).toBe('function');
  });

  it('first-char + consecutive match beats inline match', () => {
    const head = native!.fuzzyScore!('set', 'settings') as number;
    const inline = native!.fuzzyScore!('set', 'useTilesetWidget') as number;
    expect(head).toBeGreaterThan(inline);
  });

  it('ranks consecutive prefix highest', () => {
    const res = native!.fuzzyRank!(
      'set',
      ['settings', 'useTilesetWidget', 'open_settings', 'no_match_here'],
      4,
    ) as Array<{ index: number; score: number }>;
    expect(res.length).toBe(3); // no_match_here is filtered out
    expect(res[0].index).toBe(0); // 'settings' wins (first-char + consecutive)
    for (let i = 1; i < res.length; i++) {
      expect(res[i - 1].score).toBeGreaterThanOrEqual(res[i].score);
    }
  });

  it('respects limit', () => {
    const res = native!.fuzzyRank!('a', ['abc', 'apple', 'amen', 'avocado'], 2);
    expect(res.length).toBe(2);
  });

  it('fuzzyScore returns -1 for no match', () => {
    expect(native!.fuzzyScore!('xyz', 'abcdef')).toBe(-1);
  });
});
