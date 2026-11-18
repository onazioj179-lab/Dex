// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
// Two Notes windows: each has its own open note; edits in one reach the other.
import { describe, it, expect, beforeEach, vi } from 'vitest';

type Note = { id: string; title: string; content: string; plain_text: string; folder_id: string | null; updated_at: number; created_at: number };
let db: Record<string, Note>;

beforeEach(() => {
  db = {
    a: { id: 'a', title: 'Alpha', content: '', plain_text: 'alpha', folder_id: null, updated_at: 1, created_at: 1 },
    b: { id: 'b', title: 'Beta', content: '', plain_text: 'beta', folder_id: null, updated_at: 2, created_at: 2 },
  };
  (window as any).dex = {
    invoke: vi.fn(async (ch: string, ...args: any[]) => {
      if (ch === 'dexnotes:list') return Object.values(db).map(({ content, ...n }) => n);
      if (ch === 'dexnotes:get') return db[args[0]] ? { ...db[args[0]] } : null;
      if (ch === 'dexnotes:update') { db[args[0]] = { ...db[args[0]], ...args[1], updated_at: Date.now() }; return { success: true }; }
      if (ch === 'search:upsertDoc') return true;
      return [];
    }),
  };
});

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('Notes per window', () => {
  it('each window store keeps its own open note', async () => {
    const { createNotesStore } = await import('../../src/renderer/store/notesStore');
    const w1 = createNotesStore(); const w2 = createNotesStore();
    await w1.getState().loadNote('a');
    await w2.getState().loadNote('b');
    expect(w1.getState().selectedNoteId).toBe('a');
    expect(w2.getState().selectedNoteId).toBe('b');
    w1.dispose(); w2.dispose();
  });

  it('a save in one window refreshes the same note open in another (no stale copy)', async () => {
    const { createNotesStore } = await import('../../src/renderer/store/notesStore');
    const w1 = createNotesStore(); const w2 = createNotesStore();
    await w1.getState().loadNote('a');
    await w2.getState().loadNote('a');
    await w1.getState().updateNote('a', { title: 'Alpha edited' });
    await tick(); await tick();
    expect(w2.getState().activeNote?.title).toBe('Alpha edited');
    expect(w2.getState().notes.find((n) => n.id === 'a')?.title).toBe('Alpha edited');
    w1.dispose(); w2.dispose();
  });

  it('a window ignores its own change events and stops listening when closed', async () => {
    const { createNotesStore } = await import('../../src/renderer/store/notesStore');
    const w1 = createNotesStore(); const w2 = createNotesStore();
    await w2.getState().loadNote('b');
    w2.dispose();
    const calls = () => ((window as any).dex.invoke as ReturnType<typeof vi.fn>).mock.calls.filter((c: any[]) => c[0] === 'dexnotes:get' && c[1] === 'b').length;
    const before = calls();
    await w1.getState().updateNote('b', { title: 'Beta edited' });
    await tick();
    expect(calls()).toBe(before); // closed window w2 did not reload
    w1.dispose();
  });
});
