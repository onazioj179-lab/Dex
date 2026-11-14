// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Regression (#205): without the native bridge, Notes' fallback hard-deleted a
// note and answered `dexnotes:restore` with a bare `true`, so the "moved to
// Trash · Undo" toast restored nothing. The fallback now follows the native
// contract: delete = move to Trash, restore brings it back, permanent delete
// removes it.

import { describe, it, expect, beforeEach } from 'vitest';
import { useNotesStore } from '../../src/renderer/store/notesStore';

const ids = () => useNotesStore.getState().notes.map((n) => n.id);

beforeEach(() => {
  delete (window as any).dex;
  localStorage.clear();
  useNotesStore.setState({ notes: [], activeNote: null, selectedNoteId: null } as any);
});

describe('Notes fallback: Trash and Undo', () => {
  it('delete hides the note, restore brings it back', async () => {
    const s = useNotesStore.getState();
    const id = await s.createNote(null);
    await s.loadNotes();
    expect(ids()).toContain(id);

    await useNotesStore.getState().deleteNote(id as string);
    await useNotesStore.getState().loadNotes();
    expect(ids()).not.toContain(id);

    await useNotesStore.getState().restoreNote(id as string);
    expect(ids()).toContain(id);
  });

  it('permanent delete cannot be restored', async () => {
    const s = useNotesStore.getState();
    const id = await s.createNote(null);
    await s.permanentlyDeleteNote(id as string);
    await useNotesStore.getState().restoreNote(id as string);
    expect(ids()).not.toContain(id);
  });
});
