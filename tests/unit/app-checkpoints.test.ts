// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// App checkpoints are real saved versions: stored, capped, restorable through
// Collab Hub even when the app was closed.
//
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  saveCheckpoint, listCheckpoints, readCheckpointData, deleteCheckpoint, requestRestore,
  takePendingRestore, openCollabHub, takeCollabOpen, MAX_PER_APP, MAX_BYTES,
} from '../../src/renderer/services/appCheckpoints';
import { useAppCheckpoints } from '../../src/renderer/hooks/useAppCheckpoints';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('appCheckpoints', () => {
  it('saves, lists newest first, reads back and deletes', () => {
    const a = saveCheckpoint('axl', 'AXL', 'First', '{"v":1}');
    const b = saveCheckpoint('axl', 'AXL', 'Second', '{"v":2}');
    expect(a.ok && b.ok).toBe(true);
    const list = listCheckpoints('axl');
    expect(list.map((c) => c.name).sort()).toEqual(['First', 'Second']);
    expect(list).toHaveLength(2);
    expect(readCheckpointData(list[0].id)).toMatch(/"v":/);
    deleteCheckpoint(list[0].id);
    expect(listCheckpoints('axl')).toHaveLength(1);
  });

  it('keeps at most MAX_PER_APP per app, dropping autosaves first', () => {
    saveCheckpoint('axl', 'AXL', 'Manual', 'm');
    for (let i = 0; i < MAX_PER_APP + 3; i++) saveCheckpoint('axl', 'AXL', `auto${i}`, `a${i}`, true);
    saveCheckpoint('videoeditor', 'Vinx', 'Other app', 'v');
    const axl = listCheckpoints('axl');
    expect(axl).toHaveLength(MAX_PER_APP);
    expect(axl.some((c) => c.name === 'Manual')).toBe(true);
    expect(listCheckpoints('videoeditor')).toHaveLength(1);
  });

  it('refuses snapshots over the size cap', () => {
    const res = saveCheckpoint('axl', 'AXL', 'Huge', 'x'.repeat(MAX_BYTES / 2 + 10));
    expect(res.ok).toBe(false);
  });

  it('a restore waits for its app and is consumed once', () => {
    const r = saveCheckpoint('axl', 'AXL', 'Keep', '{"assembly":{}}');
    if (!r.ok) throw new Error('save failed');
    const listener = vi.fn();
    window.addEventListener('dex-app-checkpoint-restore', listener);
    expect(requestRestore(r.checkpoint.id)).toBe('axl');
    window.removeEventListener('dex-app-checkpoint-restore', listener);
    expect(listener).toHaveBeenCalledOnce();
    expect(takePendingRestore('videoeditor')).toBeNull();
    expect(takePendingRestore('axl')?.data).toBe('{"assembly":{}}');
    expect(takePendingRestore('axl')).toBeNull();
    expect(requestRestore('missing')).toBeNull();
  });

  it('carries a Collab Hub open request', () => {
    openCollabHub('share', 'p1');
    expect(takeCollabOpen()).toEqual({ panel: 'share', projectId: 'p1' });
    expect(takeCollabOpen()).toBeNull();
  });
});

describe('useAppCheckpoints', () => {
  it('saves on demand and applies a pending restore on mount', () => {
    let state = '{"n":1}';
    const restored: string[] = [];
    const saved = saveCheckpoint('axl', 'AXL', 'Earlier', '{"n":0}');
    if (!saved.ok) throw new Error('save failed');
    requestRestore(saved.checkpoint.id);
    const { result } = renderHook(() => useAppCheckpoints({
      appId: 'axl', appName: 'AXL', autoIntervalMs: 0,
      getSnapshot: () => state,
      onRestore: (data) => { restored.push(data); },
    }));
    expect(restored).toEqual(['{"n":0}']);
    state = '{"n":2}';
    let res!: ReturnType<typeof result.current.saveNow>;
    act(() => { res = result.current.saveNow('Mine'); });
    expect(res.ok).toBe(true);
    expect(listCheckpoints('axl').some((c) => c.name === 'Mine')).toBe(true);
  });
});
