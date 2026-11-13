// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Regression: the DEX Recycle Bin said "Restored" while only deleting its own
// row; the note/card never came back. restoreRecycledItem rehydrates the item.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  restoreRecycledItem, unrestorableReason, insertKanbanCard, type RecycledItem,
} from '../../src/renderer/services/recycleRestore';

const item = (over: Partial<RecycledItem>): RecycledItem => ({
  id: 1, app: 'notes', item_type: 'note', item_name: 'N', item_data: '{}', original_location: '', ...over,
});

const board = () => ([{
  id: 'b1', name: 'My Project', createdAt: 0,
  columns: [{ id: 'todo', title: 'To Do', cards: [] }, { id: 'done', title: 'Done', cards: [] }],
}]);

describe('unrestorableReason', () => {
  it('is honest about Files rows from older builds', () => {
    expect(unrestorableReason(item({ app: 'files', item_data: '{"path":"C:/x"}' }))).toMatch(/permanently/);
  });
  it('rejects unknown apps and unreadable data', () => {
    expect(unrestorableReason(item({ app: 'mystery' }))).toBeTruthy();
    expect(unrestorableReason(item({ app: 'kanban', item_data: 'not json' }))).toBeTruthy();
  });
  it('says expiry-rule rows hold no copy (content_expiry.rs writes only the id)', () => {
    const data = JSON.stringify({ expired: true, item_id: 'n1', source: 'content-expiry' });
    expect(unrestorableReason(item({ item_data: data }))).toMatch(/expiry rule/);
    expect(unrestorableReason(item({ app: 'kanban', item_data: data }))).toMatch(/expiry rule/);
  });
  it('accepts notes and kanban cards', () => {
    expect(unrestorableReason(item({ item_data: '{"id":"n1"}' }))).toBeNull();
    expect(unrestorableReason(item({ app: 'kanban', item_data: '{"id":"c1"}' }))).toBeNull();
  });
});

describe('insertKanbanCard', () => {
  it('puts the card back in its column on the named board', () => {
    const out = insertKanbanCard(board() as any, { id: 'c1', title: 'Ship', columnId: 'done' }, 'My Project');
    expect(out[0].columns[1].cards.map(c => c.title)).toEqual(['Ship']);
    expect(out[0].columns[0].cards).toHaveLength(0);
  });
  it('falls back to the first column and never duplicates', () => {
    const once = insertKanbanCard(board() as any, { id: 'c1', columnId: 'gone' }, 'Other');
    expect(once[0].columns[0].cards).toHaveLength(1);
    const twice = insertKanbanCard(once, { id: 'c1', columnId: 'gone' }, 'Other');
    expect(twice).toBe(once);
  });
});

describe('restoreRecycledItem', () => {
  beforeEach(() => localStorage.clear());

  it('un-trashes a note that still exists', async () => {
    const ipc = vi.fn(async (ch: string) => (ch === 'dexnotes:get' ? { id: 'n1' } : { success: true }));
    await restoreRecycledItem(item({ item_data: '{"id":"n1","title":"T"}' }), ipc);
    expect(ipc).toHaveBeenCalledWith('dexnotes:restore', 'n1');
    expect(ipc).not.toHaveBeenCalledWith('dexnotes:create', expect.anything());
  });

  it('recreates a note that was emptied from the Notes trash', async () => {
    const ipc = vi.fn(async (ch: string) => (ch === 'dexnotes:get' ? null : ch === 'dexnotes:create' ? { id: 'n1' } : null));
    await restoreRecycledItem(item({ item_data: '{"id":"n1","title":"T","content":"<p>x</p>"}' }), ipc);
    expect(ipc).toHaveBeenCalledWith('dexnotes:create', expect.objectContaining({ id: 'n1', title: 'T', content: '<p>x</p>' }));
  });

  it('fails loudly when Notes cannot take it back', async () => {
    const ipc = vi.fn(async () => null);
    await expect(restoreRecycledItem(item({ item_data: '{"id":"n1"}' }), ipc)).rejects.toThrow();
  });

  it('hands a kanban card to an open board', async () => {
    const seen: any[] = [];
    const h = (e: Event) => { const d = (e as CustomEvent).detail; d.handled = true; seen.push(d); };
    window.addEventListener('dex-kanban-restore', h);
    const ipc = vi.fn(async () => null);
    await restoreRecycledItem(item({ app: 'kanban', item_data: '{"id":"c1","title":"Ship"}', original_location: 'My Project' }), ipc);
    window.removeEventListener('dex-kanban-restore', h);
    expect(seen[0].data.title).toBe('Ship');
    expect(ipc).not.toHaveBeenCalled();
  });

  it('writes a kanban card to storage when the board is closed', async () => {
    localStorage.setItem('dex-kanban-boards', JSON.stringify(board()));
    const ipc = vi.fn(async () => null);
    await restoreRecycledItem(item({ app: 'kanban', item_data: '{"id":"c1","title":"Ship","columnId":"done"}', original_location: 'My Project' }), ipc);
    const saved = JSON.parse(localStorage.getItem('dex-kanban-boards')!);
    expect(saved[0].columns[1].cards[0].title).toBe('Ship');
  });

  it('refuses Files rows instead of pretending', async () => {
    await expect(restoreRecycledItem(item({ app: 'files', item_data: '{}' }), vi.fn())).rejects.toThrow(/permanently/);
  });
});
