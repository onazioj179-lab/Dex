// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Puts a DEX Recycle Bin item back into the app it came from.
 *
 * `recycle-bin:restore` only removes the bin row; nothing used to rehydrate
 * the note or card, so "Restored" was reported while the item stayed gone.
 * The Recycle Bin now calls `restoreRecycledItem` first and removes the row
 * only after the owning app has the item again.
 *
 * Restorable: notes (un-trash, or recreate if it was emptied from Notes'
 * trash) and Kanban cards. Files rows were written by older builds that then
 * deleted the file permanently; Files now uses the system Recycle Bin, so
 * those rows are reported as not restorable instead of faking it.
 */

import { useNotesStore } from '../store/notesStore';

export interface RecycledItem {
  id: number;
  app: string;
  item_type: string;
  item_name: string;
  item_data: string;
  original_location: string;
}

export type Ipc = (channel: string, ...args: unknown[]) => Promise<any>;

const KANBAN_KEY = 'dex-kanban-boards';

function parseData(item: RecycledItem): Record<string, any> | null {
  try {
    const d = JSON.parse(item.item_data || 'null');
    return d && typeof d === 'object' ? d : null;
  } catch {
    return null;
  }
}

/** Why an item can't be restored, or null when it can. */
export function unrestorableReason(item: RecycledItem): string | null {
  if (item.app === 'files') {
    return 'Deleted permanently by an earlier DEX version; the file itself is gone.';
  }
  if (item.app !== 'notes' && item.app !== 'kanban') {
    return `${item.app || 'This app'} can't restore items from here.`;
  }
  const d = parseData(item);
  if (!d) return 'The saved copy is unreadable.';
  if (item.app === 'notes' && typeof d.id !== 'string') return 'The saved copy is incomplete.';
  return null;
}

// ── Kanban ────────────────────────────────────────────────────────────────

interface KCard {
  id: string; title: string; description: string; labels: string[];
  priority: string; createdAt: number; checklist: { text: string; done: boolean }[];
  [k: string]: unknown;
}
interface KColumn { id: string; title: string; cards: KCard[]; [k: string]: unknown }
interface KBoard { id: string; name: string; columns: KColumn[]; [k: string]: unknown }

/**
 * Pure: the boards with the card put back — in its board (by name) and column
 * (by id), falling back to the first board / first column. Unchanged when the
 * card is already there or there is nowhere to put it.
 */
export function insertKanbanCard(boards: KBoard[], data: Record<string, any>, boardName: string): KBoard[] {
  if (!Array.isArray(boards) || boards.length === 0) return boards;
  const bIdx = Math.max(0, boards.findIndex(b => b.name === boardName));
  const board = boards[bIdx];
  if (!board.columns?.length) return boards;
  if (board.columns.some(c => c.cards?.some(cd => cd.id === data.id))) return boards;
  const cIdx = Math.max(0, board.columns.findIndex(c => c.id === data.columnId));
  const card: KCard = {
    id: String(data.id || `card-${Date.now()}`),
    title: String(data.title || 'Untitled Card'),
    description: String(data.description || ''),
    labels: Array.isArray(data.labels) ? data.labels : [],
    priority: data.priority || 'medium',
    checklist: Array.isArray(data.checklist) ? data.checklist : [],
    createdAt: Date.now(),
  };
  return boards.map((b, i) => i !== bIdx ? b : {
    ...b,
    columns: b.columns.map((c, j) => j !== cIdx ? c : { ...c, cards: [...(c.cards || []), card] }),
  });
}

/** Detail of the `dex-kanban-restore` event; an open Kanban app sets `handled`. */
export interface KanbanRestoreDetail { data: Record<string, any>; boardName: string; handled: boolean }

async function restoreKanban(item: RecycledItem, data: Record<string, any>, ipc: Ipc): Promise<void> {
  // An open Kanban app owns the live state (and would overwrite storage), so
  // let it take the card. dispatchEvent is synchronous.
  const detail: KanbanRestoreDetail = { data, boardName: item.original_location, handled: false };
  window.dispatchEvent(new CustomEvent('dex-kanban-restore', { detail }));
  if (detail.handled) return;

  let boards: KBoard[] | null = null;
  try {
    const stored = await ipc('capability:storage:get', KANBAN_KEY);
    if (Array.isArray(stored)) boards = stored;
  } catch { /* fall back to localStorage */ }
  if (!boards) {
    try { boards = JSON.parse(localStorage.getItem(KANBAN_KEY) || 'null'); } catch { boards = null; }
  }
  if (!Array.isArray(boards) || boards.length === 0) throw new Error('No Kanban board to restore the card into');
  const next = insertKanbanCard(boards, data, item.original_location);
  localStorage.setItem(KANBAN_KEY, JSON.stringify(next));
  try { await ipc('capability:storage:set', KANBAN_KEY, next); } catch { /* localStorage holds it */ }
}

// ── Notes ─────────────────────────────────────────────────────────────────

async function restoreNote(data: Record<string, any>, ipc: Ipc): Promise<void> {
  const existing = await ipc('dexnotes:get', data.id);
  if (existing) {
    const r = await ipc('dexnotes:restore', data.id);
    if (r && r.success === false) throw new Error('Notes refused the restore');
  } else {
    // Emptied from Notes' own trash: recreate it from the saved copy.
    const created = await ipc('dexnotes:create', {
      id: data.id, title: data.title || 'Untitled', content: data.content || '', folder_id: data.folder_id ?? null,
    });
    if (!created) throw new Error('Notes could not recreate the note');
  }
  try {
    await useNotesStore.getState().loadNotes();
  } catch { /* Notes refreshes itself when opened */ }
}

/** Rehydrates the item in its app. Throws (with a reason) when it can't. */
export async function restoreRecycledItem(item: RecycledItem, ipc: Ipc): Promise<void> {
  const reason = unrestorableReason(item);
  if (reason) throw new Error(reason);
  const data = parseData(item)!;
  if (item.app === 'notes') return restoreNote(data, ipc);
  return restoreKanban(item, data, ipc);
}
