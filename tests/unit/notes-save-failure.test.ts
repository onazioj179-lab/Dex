// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Regression: dexnotes:update returns { success:false } when the row is gone,
// and the store treated that as saved ("Saved 2s ago") while the text was lost.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { useNotesStore } from '../../src/renderer/store/notesStore';

const note = { id: 'n1', title: 'T', content: '<p>old</p>', plain_text: 'old', folder_id: null } as any;

afterEach(() => {
  delete (window as any).dex;
  useNotesStore.setState({ saveError: null, activeNote: null, notes: [] });
});

describe('notesStore.updateNote', () => {
  it('recreates a note whose row vanished instead of reporting it saved', async () => {
    const invoke = vi.fn(async (ch: string) => (ch === 'dexnotes:update' ? { success: false } : ch === 'dexnotes:create' ? { id: 'n1' } : null));
    (window as any).dex = { invoke };
    useNotesStore.setState({ activeNote: note, notes: [note] });
    await useNotesStore.getState().updateNote('n1', { content: '<p>new</p>', plain_text: 'new' });
    expect(invoke).toHaveBeenCalledWith('dexnotes:create', expect.objectContaining({ id: 'n1', content: '<p>new</p>' }));
    expect(useNotesStore.getState().saveError).toBeNull();
  });

  it('reports a save error when the note cannot be written at all', async () => {
    const invoke = vi.fn(async (ch: string) => (ch === 'dexnotes:update' ? { success: false } : null));
    // null from create falls back to localStorage in the store; force a real failure.
    (window as any).dex = { invoke: async (ch: string, ...a: unknown[]) => (ch === 'dexnotes:create' ? false : invoke(ch, ...a)) };
    useNotesStore.setState({ activeNote: note, notes: [note] });
    await useNotesStore.getState().updateNote('n1', { plain_text: 'new' });
    expect(useNotesStore.getState().saveError).toBe('This note could not be saved');
    expect(useNotesStore.getState().saving).toBe(false);
  });
});
