import { describe, it, expect } from 'vitest';
import { backoffDelay, backoffSchedule, shouldRetry } from '../../src/shared/automation/backoff';

describe('backoff', () => {
  it('grows exponentially from the base', () => {
    const o = { baseMs: 500, factor: 2, maxMs: 30_000 };
    expect(backoffDelay(0, o)).toBe(500);
    expect(backoffDelay(1, o)).toBe(1000);
    expect(backoffDelay(2, o)).toBe(2000);
  });

  it('caps at maxMs', () => {
    expect(backoffDelay(10, { baseMs: 500, factor: 2, maxMs: 30_000 })).toBe(30_000);
  });

  it('applies full jitter with an injected rng', () => {
    expect(backoffDelay(0, { baseMs: 1000, jitter: true, rng: () => 0.5 })).toBe(500);
    expect(backoffDelay(0, { baseMs: 1000, jitter: true, rng: () => 0 })).toBe(0);
  });

  it('produces a schedule', () => {
    expect(backoffSchedule(3, { baseMs: 100, factor: 2 })).toEqual([100, 200, 400]);
    expect(backoffSchedule(0)).toEqual([]);
  });

  it('shouldRetry respects the attempt cap', () => {
    expect(shouldRetry(0, 3)).toBe(true);
    expect(shouldRetry(1, 3)).toBe(true);
    expect(shouldRetry(2, 3)).toBe(false);
  });
});
