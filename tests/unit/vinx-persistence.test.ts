// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  readStoredProject, writeStoredProject, pickNewer, beginSession, endSession, recoveryMessage, SESSION_KEY,
} from '../../src/renderer/DEXAPPLICATIONS/vinx/vinxPersistence';

function mem(init: Record<string, string> = {}, quota = Infinity) {
  const data: Record<string, string> = { ...init };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      if (v.length > quota) { const e = new Error('exceeded the quota'); e.name = 'QuotaExceededError'; throw e; }
      data[k] = v;
    },
    removeItem: (k: string) => { delete data[k]; },
  };
}

const P = (id: string, modifiedAt?: number) => ({ id, sequences: [], ...(modifiedAt ? { modifiedAt } : {}) });

describe('VINX project storage', () => {
  it('reads a stored project and keeps an unreadable one aside', () => {
    expect(readStoredProject(mem({ k: JSON.stringify(P('a')) }), 'k').project).toEqual(P('a'));
    const st = mem({ k: '{"id":"x"' });
    expect(readStoredProject(st, 'k', 7)).toEqual({ project: null, movedAside: 'k.unreadable-7' });
    expect(st.data['k.unreadable-7']).toBe('{"id":"x"');
    // Valid JSON that is not a project is kept too.
    expect(readStoredProject(mem({ k: '{"id":"x"}' }), 'k', 8).movedAside).toBe('k.unreadable-8');
    expect(readStoredProject(mem(), 'k')).toEqual({ project: null, movedAside: null });
  });

  it('reports why a write failed', () => {
    expect(writeStoredProject(mem({}, 3), 'k', 'long')).toEqual({ ok: false, reason: 'quota' });
    expect(writeStoredProject(null, 'k', 'x')).toEqual({ ok: false, reason: 'unavailable' });
    expect(writeStoredProject(mem(), 'k', 'x')).toEqual({ ok: true });
  });

  it('prefers the more recently modified copy, the local one on a tie', () => {
    const local = P('l', 100);
    expect(pickNewer(local, P('n', 200))?.id).toBe('n');
    expect(pickNewer(local, P('n', 50))?.id).toBe('l');
    expect(pickNewer(local, P('n', 100))?.id).toBe('l');
    expect(pickNewer(null, P('n'))?.id).toBe('n');
    expect(pickNewer(local, null)?.id).toBe('l');
  });
});

describe('VINX recovery', () => {
  it('claims nothing after a normal close', () => {
    const st = mem();
    expect(beginSession(st, 1).uncleanSince).toBeNull();
    endSession(st);
    expect(st.data[SESSION_KEY]).toBeUndefined();
    expect(beginSession(st, 2).uncleanSince).toBeNull();
    expect(recoveryMessage(null, P('a', 5), String)).toBeNull();
  });

  it('reports a session that never closed, with the last save time', () => {
    const st = mem();
    beginSession(st, 1000);
    // ... crash: endSession never runs ...
    const { uncleanSince } = beginSession(st, 2000);
    expect(uncleanSince).toBe(1000);
    expect(JSON.parse(st.data[SESSION_KEY]).at).toBe(2000);
    expect(recoveryMessage(uncleanSince, P('a', 1500), (t) => `t${t}`)).toBe(
      'VINX did not close normally last time. Restored the project as last saved (t1500); edits after that were not saved.',
    );
    expect(recoveryMessage(uncleanSince, null, String)).toBeNull();
  });
});
