import { describe, it, expect } from 'vitest';
import { activityHeatmap, heatmapPeak, hourlyTotals } from '../../src/shared/rewind/heatmap';

describe('activity heatmap', () => {
  it('builds a 7x24 matrix and counts events', () => {
    const d = new Date(2026, 5, 4, 9, 30); // 09:xx
    const m = activityHeatmap([d.getTime(), d.getTime()]);
    expect(m).toHaveLength(7);
    expect(m[0]).toHaveLength(24);
    expect(m[d.getDay()][9]).toBe(2);
  });

  it('finds the peak cell', () => {
    const d = new Date(2026, 5, 4, 14, 0);
    const peak = heatmapPeak(activityHeatmap([d.getTime()]));
    expect(peak).toEqual({ day: d.getDay(), hour: 14, count: 1 });
  });

  it('peak is 0 for empty input', () => {
    expect(heatmapPeak(activityHeatmap([])).count).toBe(0);
  });

  it('computes hourly totals across days', () => {
    const a = new Date(2026, 5, 1, 10, 0).getTime();
    const b = new Date(2026, 5, 2, 10, 0).getTime();
    expect(hourlyTotals(activityHeatmap([a, b]))[10]).toBe(2);
  });
});
