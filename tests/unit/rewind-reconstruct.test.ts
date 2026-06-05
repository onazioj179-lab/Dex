// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { reconstructWorkspace, eventsForSession } from '../../src/shared/rewind/reconstruct';
import { buildTimeline, type ActivityEvent } from '../../src/shared/rewind/timeline';

const ev = (ts: number, appId: string, kind: string, label?: string): ActivityEvent => ({ ts, appId, kind, label });

describe('rewind reconstruct', () => {
  it('orders apps by activity and lists distinct recent files', () => {
    const events = [
      ev(1, 'vinx', 'open', 'trailer.mov'),
      ev(2, 'vinx', 'edit', 'trailer.mov'),
      ev(3, 'browser', 'browse', 'refs.com'),
      ev(4, 'vinx', 'save', 'trailer.mov'),
      ev(5, 'browser', 'browse', 'music.com'),
    ];
    const ws = reconstructWorkspace(events);
    expect(ws.primaryAppId).toBe('vinx');
    expect(ws.appIds).toEqual(['vinx', 'browser']);
    // distinct labels, by most-recent touch: music.com(5), trailer.mov(4), refs.com(3)
    expect(ws.files).toEqual(['music.com', 'trailer.mov', 'refs.com']);
  });

  it('ignores events without an artifact label or kind', () => {
    const ws = reconstructWorkspace([ev(1, 'notes', 'focus'), ev(2, 'notes', 'open', 'note.md')]);
    expect(ws.files).toEqual(['note.md']);
  });

  it('handles an empty session', () => {
    const ws = reconstructWorkspace([]);
    expect(ws).toEqual({ primaryAppId: 'unknown', appIds: [], files: [] });
  });

  it('slices events for a session built by buildTimeline', () => {
    const events = [
      ev(0, 'a', 'open', 'x'),
      ev(1000, 'a', 'edit', 'x'),
      ev(0 + 60 * 60 * 1000, 'b', 'open', 'y'), // 1h later → new session
    ];
    const sessions = buildTimeline(events);
    expect(sessions).toHaveLength(2);
    const first = eventsForSession(events, sessions[0]);
    expect(first.every((e) => e.appId === 'a')).toBe(true);
    expect(reconstructWorkspace(first).primaryAppId).toBe('a');
  });
});
