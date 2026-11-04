// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Agent tasks interrupted by an app restart can be resumed with what was done.
//
import { describe, it, expect, beforeEach } from 'vitest';
import { useUkiTasks, buildResumeRequest, isResumable, type UkiBackgroundTask } from '../../src/renderer/store/ukiTasksStore';

const base: UkiBackgroundTask = {
  id: 't1', title: 'Rename my photos', source: 'uki-agent', status: 'failed', createdAt: 1, updatedAt: 1,
  steps: [{ at: 1, label: 'Listed 40 photos' }, { at: 2, label: 'Renamed 12 photos' }],
  request: 'Rename my photos in Pictures/Trip by date taken', interrupted: true,
};

describe('agent task resume', () => {
  beforeEach(() => useUkiTasks.setState({ tasks: [] }));

  it('builds a continuation with the full request and the finished steps', () => {
    const q = buildResumeRequest(base);
    expect(q).toContain('"Rename my photos in Pictures/Trip by date taken"');
    expect(q).toContain('- Listed 40 photos');
    expect(q).toContain('- Renamed 12 photos');
    expect(q).toMatch(/Check the current state first/);
    expect(buildResumeRequest({ ...base, request: undefined, steps: [] })).toContain('"Rename my photos"');
  });

  it('only interrupted, not-yet-resumed agent tasks are resumable', () => {
    expect(isResumable(base)).toBe(true);
    expect(isResumable({ ...base, interrupted: false })).toBe(false);
    expect(isResumable({ ...base, resumedAt: 5 })).toBe(false);
    expect(isResumable({ ...base, source: 'automation' })).toBe(false);
    expect(isResumable({ ...base, status: 'done' })).toBe(false);
  });

  it('keeps the full request and marks a task resumed once', () => {
    const id = useUkiTasks.getState().startTask('x'.repeat(200), 'uki-agent', 'y'.repeat(5000));
    const t = useUkiTasks.getState().tasks.find((k) => k.id === id)!;
    expect(t.title).toHaveLength(120);
    expect(t.request).toHaveLength(4000);
    useUkiTasks.getState().markResumed(id);
    expect(useUkiTasks.getState().tasks.find((k) => k.id === id)!.resumedAt).toBeTypeOf('number');
  });
});
