// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import DexNotes from '../../src/renderer/DEXAPPLICATIONS/notes/DexNotes';
import { useAppPreferences } from '../../src/renderer/store/appPreferences';
import { useNotesStore } from '../../src/renderer/store/notesStore';

const initialDex = Object.getOwnPropertyDescriptor(window, 'dex');
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useNotesStore.setState(useNotesStore.getInitialState());
  useAppPreferences.setState({ apps: {}, loaded: false, error: '' });
  if (initialDex) Object.defineProperty(window, 'dex', initialDex);
  else Reflect.deleteProperty(window, 'dex');
  localStorage.clear();
});

it('uses saved Notes layouts and autosave timing while keeping Ctrl+S immediate', async () => {
  const note = {
    id: 'preferences-note',
    title: 'Project notebook',
    content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Original body' }] }] }),
    plain_text: 'Original body',
    tags: [],
    attachments: [],
    updated_at: Date.now(),
    created_at: Date.now(),
    word_count: 2,
    folder_id: null,
    pinned: 0,
    archived: 0,
    locked: 0,
  };
  const invoke = vi.fn(async (channel: string) => {
    if (channel === 'app-preferences:get') return {
      success: true,
      preferences: { version: 1, apps: { notes: { defaultEditorMode: 'split', defaultNoteList: 'compact', autosaveDelay: '1500' } } },
    };
    if (channel === 'dexnotes:list') return [note];
    if (channel === 'dexnotes:get') return note;
    if (channel === 'dexnotes:update') return true;
    return null;
  });
  Object.defineProperty(window, 'dex', { configurable: true, value: { invoke } });
  const view = render(<DexNotes />);
  await waitFor(() => expect(useNotesStore.getState().editorMode).toBe('split'));
  expect(useNotesStore.getState().viewMode).toBe('compact');
  await screen.findAllByText('Original body');
  expect(invoke.mock.calls.some(([channel]) => channel === 'dexnotes:create')).toBe(false);
  let editor = view.container.querySelector<HTMLDivElement>('.dexnotes-editable')!;
  expect(editor).toBeTruthy();
  vi.useFakeTimers();
  editor.innerHTML = '<p>First draft</p>';
  fireEvent.input(editor);
  await act(async () => { vi.advanceTimersByTime(1499); });
  expect(invoke.mock.calls.filter(([channel]) => channel === 'dexnotes:update')).toHaveLength(0);
  await act(async () => { vi.advanceTimersByTime(1); });
  expect(invoke).toHaveBeenCalledWith('dexnotes:update', note.id, expect.objectContaining({ plain_text: 'First draft' }));

  editor.innerHTML = '<p>Second draft</p>';
  fireEvent.input(editor);
  await act(async () => { fireEvent.keyDown(editor, { key: 's', ctrlKey: true }); });
  expect(invoke).toHaveBeenCalledWith('dexnotes:update', note.id, expect.objectContaining({ plain_text: 'Second draft' }));

  act(() => { useNotesStore.getState().setEditorMode('preview'); });
  expect(view.container.querySelector('.dexnotes-editable')).toBeNull();
  act(() => { useNotesStore.getState().setEditorMode('edit'); });
  editor = view.container.querySelector<HTMLDivElement>('.dexnotes-editable')!;
  expect(editor.textContent).toBe('Second draft');

  editor.innerHTML = '<p>Last edit before closing</p>';
  fireEvent.input(editor);
  await act(async () => { view.unmount(); });
  expect(invoke).toHaveBeenCalledWith('dexnotes:update', note.id, expect.objectContaining({ plain_text: 'Last edit before closing' }));
});
