import { describe, it, expect } from 'vitest';
import {
  buildTimeline,
  sessionDuration,
  DEFAULT_SESSION_GAP_MS,
  type ActivityEvent,
} from '../../src/shared/rewind/timeline';

const MIN = 60 * 1000;

describe('rewind timeline', () => {
  it('returns no sessions for an empty stream', () => {
    expect(buildTimeline([])).toEqual([]);
  });

  it('splits sessions across an idle gap', () => {
    const t0 = 1_000_000_000_000;
    const events: ActivityEvent[] = [
      { ts: t0, appId: 'videoeditor', kind: 'open' },
      { ts: t0 + 5 * MIN, appId: 'videoeditor', kind: 'edit' },
      // big gap → new session
      { ts: t0 + DEFAULT_SESSION_GAP_MS + 10 * MIN, appId: 'notes', kind: 'edit' },
    ];
    const sessions = buildTimeline(events);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].primaryAppId).toBe('videoeditor');
    expect(sessions[1].primaryAppId).toBe('notes');
  });

  it('picks the most-active app as primary and sorts apps by activity', () => {
    const t0 = 2_000_000_000_000;
    const events: ActivityEvent[] = [
      { ts: t0, appId: 'browser', kind: 'browse' },
      { ts: t0 + MIN, appId: 'notes', kind: 'edit' },
      { ts: t0 + 2 * MIN, appId: 'notes', kind: 'edit' },
    ];
    const [session] = buildTimeline(events);
    expect(session.primaryAppId).toBe('notes');
    expect(session.appIds[0]).toBe('notes');
    expect(session.eventCount).toBe(3);
    expect(session.label).toContain('notes');
  });

  it('handles unsorted input and computes duration', () => {
    const t0 = 3_000_000_000_000;
    const events: ActivityEvent[] = [
      { ts: t0 + 3 * MIN, appId: 'prism', kind: 'save' },
      { ts: t0, appId: 'prism', kind: 'open' },
    ];
    const [session] = buildTimeline(events);
    expect(session.startTs).toBe(t0);
    expect(sessionDuration(session)).toBe(3 * MIN);
  });
});
