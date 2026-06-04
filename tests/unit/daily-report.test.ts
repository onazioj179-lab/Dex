import { describe, it, expect } from 'vitest';
import { dailyReportMarkdown } from '../../src/shared/rewind/dailyReport';
import type { RewindInsights } from '../../src/shared/rewind/insights';

const insights: RewindInsights = {
  eventCount: 12,
  sessionCount: 3,
  appUsage: [
    { appId: 'vinx', ms: 3_600_000, share: 0.6 },
    { appId: 'notes', ms: 2_400_000, share: 0.4 },
  ],
  topApp: 'vinx',
  hourHistogram: new Array(24).fill(0),
  peakHour: 14,
  focus: 78,
  streaks: { current: 3, longest: 5 },
  activeDays: ['2026-06-01'],
};

describe('daily report markdown', () => {
  it('renders a report from insights', () => {
    const md = dailyReportMarkdown('2026-06-01', insights, { vinx: 'Vinx', notes: 'Notes' });
    expect(md).toContain('# Activity — 2026-06-01');
    expect(md).toContain('**Sessions:** 3');
    expect(md).toContain('**Focus score:** 78/100');
    expect(md).toContain('**Peak hour:** 14:00');
    expect(md).toContain('**Top app:** Vinx');
    expect(md).toContain('Vinx: 1h 00m (60%)');
  });

  it('handles an empty day', () => {
    const empty = { ...insights, eventCount: 0 };
    expect(dailyReportMarkdown('2026-06-02', empty)).toContain('_No activity recorded._');
  });
});
