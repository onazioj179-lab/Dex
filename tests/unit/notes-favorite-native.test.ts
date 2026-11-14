// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Favorites lived only in a localStorage overlay ('dex-notes-favorites-v1'):
// native Notes had no `dexnotes:favorite` handler, so the star never reached
// dex.db or a backup. The note row is now the source of truth; old overlay
// entries are moved into the row on load.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useNotesStore } from '../../src/renderer/store/notesStore';

const KEY = 'dex-notes-favorites-v1';
const overlay = () => JSON.parse(localStorage.getItem(KEY) || '[]') as string[];
const fav = (id: string) => useNotesStore.getState().notes.find((n) => n.id === id)?.favorite;

beforeEach(() => {
  delete (window as any).dex;
  localStorage.clear();
  useNotesStore.setState({ notes: [], activeNote: null, selectedNoteId: null } as any);
});

describe('Notes favorites', () => {
  it('toggling stores the flag in the note row, not the overlay', async () => {
    const id = (await useNotesStore.getState().createNote(null)) as string;
    await useNotesStore.getState().loadNotes();
    await useNotesStore.getState().toggleFavorite(id);
    expect(overlay()).not.toContain(id);
    useNotesStore.setState({ notes: [] } as any);
    await useNotesStore.getState().loadNotes();
    expect(fav(id)).toBe(1);
  });

  it('an old overlay favorite is moved into the row on load', async () => {
    const id = (await useNotesStore.getState().createNote(null)) as string;
    localStorage.setItem(KEY, JSON.stringify([id]));
    await useNotesStore.getState().loadNotes();
    expect(fav(id)).toBe(1);
    await vi.waitFor(() => expect(overlay()).not.toContain(id));
    await useNotesStore.getState().loadNotes();
    expect(fav(id)).toBe(1);
  });
});
