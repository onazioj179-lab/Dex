import { describe, it, expect } from 'vitest';
import {
  sortByPriority,
  groupBySource,
  coalesceDuplicates,
  countAtLeast,
  type NotificationRecord,
} from '../../src/shared/notifications/group';

const n = (id: string, source: string, priority: NotificationRecord['priority'], ts: number, title = id): NotificationRecord =>
  ({ id, source, priority, ts, title });

describe('notification grouping', () => {
  it('sorts by priority then recency', () => {
    const out = sortByPriority([
      n('a', 's1', 'normal', 100),
      n('b', 's1', 'urgent', 50),
      n('c', 's2', 'normal', 200),
    ]);
    expect(out.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('groups by source, ordered by top priority', () => {
    const groups = groupBySource([
      n('a', 'mail', 'low', 10),
      n('b', 'build', 'urgent', 20),
      n('c', 'mail', 'high', 30),
    ]);
    expect(groups[0].source).toBe('build'); // has urgent
    const mail = groups.find((g) => g.source === 'mail')!;
    expect(mail.items.map((i) => i.id)).toEqual(['c', 'a']); // high before low
    expect(mail.topPriority).toBe('high');
    expect(mail.latestTs).toBe(30);
  });

  it('coalesces same source+title within the window, keeping most recent', () => {
    const kept = coalesceDuplicates([
      n('1', 'build', 'normal', 1000, 'Build done'),
      n('2', 'build', 'normal', 3000, 'Build done'), // within 5s -> replaces
      n('3', 'build', 'normal', 20000, 'Build done'), // outside -> new
    ]);
    expect(kept).toHaveLength(2);
    expect(kept[0].id).toBe('2'); // most recent within first window
    expect(kept[1].id).toBe('3');
  });

  it('does not coalesce different titles', () => {
    const kept = coalesceDuplicates([
      n('1', 'build', 'normal', 1000, 'A'),
      n('2', 'build', 'normal', 1500, 'B'),
    ]);
    expect(kept).toHaveLength(2);
  });

  it('counts at or above a priority', () => {
    const items = [n('a', 's', 'low', 1), n('b', 's', 'high', 2), n('c', 's', 'urgent', 3)];
    expect(countAtLeast(items, 'high')).toBe(2);
    expect(countAtLeast(items, 'urgent')).toBe(1);
  });
});
