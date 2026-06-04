import { describe, it, expect } from 'vitest';
import { usageBoost, reRankByUsage, recordUsage } from '../../src/renderer/services/searchRecency';

describe('search recency re-ranking', () => {
  it('boost is 1 with no usage and grows with frequency', () => {
    const now = 1_000_000;
    expect(usageBoost(undefined, { now })).toBe(1);
    const a = usageBoost({ count: 1, lastTs: now }, { now });
    const b = usageBoost({ count: 16, lastTs: now }, { now });
    expect(b).toBeGreaterThan(a);
    expect(a).toBeGreaterThan(1);
  });

  it('recency decays with age', () => {
    const now = 10 * 24 * 60 * 60 * 1000;
    const fresh = usageBoost({ count: 1, lastTs: now }, { now });
    const old = usageBoost({ count: 1, lastTs: now - 7 * 24 * 60 * 60 * 1000 }, { now });
    expect(fresh).toBeGreaterThan(old);
  });

  it('re-ranks so a frequently/recently used result can overtake', () => {
    const now = 1_000_000;
    const results = [
      { id: 'a', score: 1.0 },
      { id: 'b', score: 0.9 },
    ];
    const usage = { b: { count: 32, lastTs: now } };
    const ranked = reRankByUsage(results, usage, { now });
    expect(ranked[0].id).toBe('b'); // boosted past 'a'
  });

  it('is stable for ties and does not mutate input', () => {
    const results = [{ id: 'a', score: 1 }, { id: 'b', score: 1 }];
    const ranked = reRankByUsage(results, {});
    expect(ranked.map((r) => r.id)).toEqual(['a', 'b']);
    expect(results.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('recordUsage increments count and updates timestamp immutably', () => {
    const u1 = recordUsage({}, 'x', 100);
    expect(u1.x).toEqual({ count: 1, lastTs: 100 });
    const u2 = recordUsage(u1, 'x', 200);
    expect(u2.x).toEqual({ count: 2, lastTs: 200 });
    expect(u1.x.count).toBe(1); // original unchanged
  });
});
