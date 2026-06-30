// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  summarizeGroup,
  relativeShort,
  topPriority,
  type DigestItem,
} from '../../src/shared/notifications/digest';

const item = (over: Partial<DigestItem> = {}): DigestItem => ({
  priority: 'normal',
  ts: 1_000,
  read: false,
  ...over,
});

describe('summarizeGroup', () => {
  it('singularises one notification with no severity tag', () => {
    const d = summarizeGroup([item({ priority: 'normal' })]);
    expect(d.total).toBe(1);
    expect(d.headline).toBe('1 notification');
    expect(d.text).toBe('1 notification');
  });

  it('leads with urgent count when present', () => {
    const d = summarizeGroup([
      item({ priority: 'urgent' }),
      item({ priority: 'urgent' }),
      item({ priority: 'normal' }),
    ]);
    expect(d.urgent).toBe(2);
    expect(d.headline).toBe('3 notifications, 2 urgent');
  });

  it('falls back to important (high) when no urgent', () => {
    const d = summarizeGroup([item({ priority: 'high' }), item({ priority: 'low' })]);
    expect(d.high).toBe(1);
    expect(d.headline).toBe('2 notifications, 1 important');
  });

  it('shows partial-unread tag when nothing is urgent/high', () => {
    const d = summarizeGroup([
      item({ priority: 'normal', read: true }),
      item({ priority: 'normal', read: false }),
      item({ priority: 'low', read: false }),
    ]);
    expect(d.unread).toBe(2);
    expect(d.headline).toBe('3 notifications, 2 unread');
  });

  it('omits the unread tag when everything is unread', () => {
    const d = summarizeGroup([item(), item()]);
    expect(d.headline).toBe('2 notifications');
  });

  it('tracks the latest timestamp', () => {
    const d = summarizeGroup([item({ ts: 10 }), item({ ts: 99 }), item({ ts: 50 })]);
    expect(d.latestTs).toBe(99);
  });

  it('appends a relative tail only when now is supplied', () => {
    const now = 1_000_000;
    const d = summarizeGroup([item({ ts: now - 120_000, priority: 'urgent' })], now);
    expect(d.text).toBe('1 notification, 1 urgent — 2m ago');
    const noNow = summarizeGroup([item({ ts: now - 120_000 })]);
    expect(noNow.text).toBe(noNow.headline);
  });

  it('handles the empty group without throwing', () => {
    const d = summarizeGroup([]);
    expect(d.total).toBe(0);
    expect(d.latestTs).toBe(0);
    expect(d.headline).toBe('0 notifications');
  });
});

describe('relativeShort', () => {
  const now = 10_000_000;
  it('reads "now" under a minute', () => {
    expect(relativeShort(now - 30_000, now)).toBe('now');
  });
  it('reads minutes, hours, and days', () => {
    expect(relativeShort(now - 5 * 60_000, now)).toBe('5m ago');
    expect(relativeShort(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(relativeShort(now - 2 * 86_400_000, now)).toBe('2d ago');
  });
  it('never goes negative for a future timestamp', () => {
    expect(relativeShort(now + 60_000, now)).toBe('now');
  });
});

describe('topPriority', () => {
  it('returns the strongest band present', () => {
    expect(topPriority([item({ priority: 'low' }), item({ priority: 'high' })])).toBe('high');
    expect(topPriority([item({ priority: 'urgent' }), item({ priority: 'high' })])).toBe('urgent');
  });
  it('defaults to low for an empty group', () => {
    expect(topPriority([])).toBe('low');
  });
});
