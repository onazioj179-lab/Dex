// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLiveActivityStore } from '../../src/renderer/store/liveActivityStore';
import { dispatchActivity, updateActivity, completeActivity } from '../../src/renderer/utils/liveActivity';

const get = (id: string) => useLiveActivityStore.getState().activities.find((a) => a.id === id);

describe('live activities: one store for every producer', () => {
  beforeEach(() => useLiveActivityStore.setState({ activities: [] }));

  it('id-based helpers land in the system-wide store with real progress', () => {
    dispatchActivity({ id: 'dl-1', type: 'download', label: 'Downloading a.zip', progress: 10, app: 'browser' });
    updateActivity('dl-1', 55);
    expect(get('dl-1')).toMatchObject({ title: 'Downloading a.zip', progress: 0.55, status: 'active', icon: 'download' });
  });

  it('unmeasurable progress stays indeterminate (never fabricated)', () => {
    dispatchActivity({ id: 'job', type: 'task', label: 'Indexing', progress: -1, app: 'x' });
    expect(get('job')?.progress).toBeNull();
  });

  it('re-dispatching the same id does not create a duplicate card', () => {
    dispatchActivity({ id: 'tx', type: 'transfer', label: 'Sending', progress: 0, app: 't' });
    dispatchActivity({ id: 'tx', type: 'transfer', label: 'Sending', progress: 20, app: 't' });
    expect(useLiveActivityStore.getState().activities).toHaveLength(1);
  });

  it('a failed task is reported as failed, not done', () => {
    dispatchActivity({ id: 'dl-2', type: 'download', label: 'b.zip', progress: 40, app: 'browser' });
    completeActivity('dl-2', true);
    expect(get('dl-2')?.status).toBe('error');
  });

  it('keeps the cancel hook until the task finishes', () => {
    const cancel = vi.fn();
    dispatchActivity({ id: 'tx2', type: 'transfer', label: 'Sending', progress: 5, app: 't', cancel });
    get('tx2')?.cancel?.();
    expect(cancel).toHaveBeenCalledOnce();
    completeActivity('tx2');
    expect(get('tx2')?.cancel).toBeUndefined();
  });
});
