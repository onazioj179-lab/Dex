// =============================================================================
// DEX Platform — theme-schedule resolver tests
// =============================================================================
import { describe, it, expect } from 'vitest';
import { resolveScheduledTheme } from '../src/renderer/store/featureSuiteStore';

const sched = (mode: string, extra: Record<string, unknown> = {}) => ({ schedule: { mode, ...extra } });

describe('resolveScheduledTheme', () => {
  it('manual modes return their fixed theme', () => {
    expect(resolveScheduledTheme(sched('manual-light'), 0)).toBe('light');
    expect(resolveScheduledTheme(sched('manual-dark'), 0)).toBe('dark');
  });

  it('system / missing schedule -> null (never override)', () => {
    expect(resolveScheduledTheme(sched('system'), 600)).toBeNull();
    expect(resolveScheduledTheme(null, 600)).toBeNull();
    expect(resolveScheduledTheme({}, 600)).toBeNull();
  });

  it('scheduled: light within [lightStart, darkStart), dark otherwise', () => {
    const s = sched('scheduled', { lightStart: '07:00', darkStart: '19:00' });
    expect(resolveScheduledTheme(s, 10 * 60)).toBe('light'); // 10:00
    expect(resolveScheduledTheme(s, 20 * 60)).toBe('dark');  // 20:00
    expect(resolveScheduledTheme(s, 6 * 60)).toBe('dark');   // 06:00
    expect(resolveScheduledTheme(s, 7 * 60)).toBe('light');  // start inclusive
    expect(resolveScheduledTheme(s, 19 * 60)).toBe('dark');  // end exclusive
  });

  it('scheduled: wrapped window (light spans midnight)', () => {
    const s = sched('scheduled', { lightStart: '22:00', darkStart: '06:00' });
    expect(resolveScheduledTheme(s, 23 * 60)).toBe('light');
    expect(resolveScheduledTheme(s, 2 * 60)).toBe('light');
    expect(resolveScheduledTheme(s, 12 * 60)).toBe('dark');
  });

  it('solar: uses sunTimes; null without them', () => {
    const s = { schedule: { mode: 'solar' }, sunTimes: { sunrise: '06:30', sunset: '18:30' } };
    expect(resolveScheduledTheme(s, 12 * 60)).toBe('light');
    expect(resolveScheduledTheme(s, 20 * 60)).toBe('dark');
    expect(resolveScheduledTheme({ schedule: { mode: 'solar' } }, 12 * 60)).toBeNull();
  });

  it('unparseable times fall back to dark (safe default)', () => {
    expect(resolveScheduledTheme(sched('scheduled', { lightStart: 'x', darkStart: 'y' }), 600)).toBe('dark');
  });
});
