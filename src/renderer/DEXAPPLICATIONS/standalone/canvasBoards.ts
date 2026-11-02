// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Canvas boards: many whiteboards, organised in folders, stored in IndexedDB.
//
// Canvas used to keep ONE drawing as PNG data URLs in localStorage (~5 MB
// quota). A big or multi-layer drawing overflowed it, the write failed silently
// and the drawing was gone on restart. Boards now live in IndexedDB (no 5 MB
// cap), one record per board, plus a small index. The old localStorage drawing
// is migrated into a first board exactly once.
//

import { persistGet, persistSet, persistDel } from '../../utils/persistentStore';

export interface BoardLayer { id: string; name: string; visible: boolean; opacity: number; data: string }
export interface BoardPayload { layers: BoardLayer[]; activeLayerId?: string }
export interface BoardMeta { id: string; name: string; folder: string; updatedAt: number }
export interface BoardsIndex { boards: BoardMeta[]; activeId: string }

export const UNFILED = '';
export const LEGACY_KEY = 'dex-canvas-art-v2';
const INDEX_KEY = 'canvas:boards:index';
const boardKey = (id: string) => `canvas:board:${id}`;

/** Storage seam (IndexedDB in the app, a Map in tests). */
export interface BoardStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
}
export const idbBoardStore: BoardStore = { get: persistGet, set: persistSet, del: persistDel };

let seq = 0;
export const newBoardId = () => `board-${Date.now().toString(36)}-${(seq++).toString(36)}`;

// ---- pure index operations (unit-tested) -----------------------------------

export function addBoard(index: BoardsIndex, name: string, folder = UNFILED, id = newBoardId(), now = Date.now()): BoardsIndex {
  const clean = name.trim() || 'Untitled board';
  return { boards: [...index.boards, { id, name: clean, folder: folder.trim(), updatedAt: now }], activeId: id };
}

export function renameBoard(index: BoardsIndex, id: string, name: string): BoardsIndex {
  const clean = name.trim();
  if (!clean) return index;
  return { ...index, boards: index.boards.map((b) => (b.id === id ? { ...b, name: clean } : b)) };
}

export function moveBoard(index: BoardsIndex, id: string, folder: string): BoardsIndex {
  return { ...index, boards: index.boards.map((b) => (b.id === id ? { ...b, folder: folder.trim() } : b)) };
}

export function touchBoard(index: BoardsIndex, id: string, now = Date.now()): BoardsIndex {
  return { ...index, boards: index.boards.map((b) => (b.id === id ? { ...b, updatedAt: now } : b)) };
}

/** Remove a board; the active board falls back to the most recently edited one left. */
export function removeBoard(index: BoardsIndex, id: string): BoardsIndex {
  const boards = index.boards.filter((b) => b.id !== id);
  const activeId = index.activeId !== id ? index.activeId
    : [...boards].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ?? '';
  return { boards, activeId };
}

/** Folders in display order (unfiled first), each with its boards by name. */
export function groupByFolder(index: BoardsIndex): Array<{ folder: string; boards: BoardMeta[] }> {
  const map = new Map<string, BoardMeta[]>();
  for (const b of index.boards) (map.get(b.folder) ?? map.set(b.folder, []).get(b.folder)!).push(b);
  return [...map.entries()]
    .sort(([a], [b]) => (a === UNFILED ? -1 : b === UNFILED ? 1 : a.localeCompare(b)))
    .map(([folder, boards]) => ({ folder, boards: boards.sort((x, y) => x.name.localeCompare(y.name)) }));
}

// ---- persistence ------------------------------------------------------------

/**
 * Load the board index, creating it on first run. If the legacy single
 * localStorage drawing exists it becomes the first board ("My canvas"), and the
 * localStorage copy is removed only after the IndexedDB write succeeded.
 */
export async function loadIndex(store: BoardStore = idbBoardStore, ls: Pick<Storage, 'getItem' | 'removeItem'> | null = safeLocalStorage()): Promise<BoardsIndex> {
  const existing = await store.get<BoardsIndex>(INDEX_KEY);
  if (existing && Array.isArray(existing.boards) && existing.boards.length > 0) return existing;

  let index = addBoard({ boards: [], activeId: '' }, 'My canvas');
  const legacyRaw = ls?.getItem(LEGACY_KEY) ?? null;
  if (legacyRaw) {
    try {
      const payload = JSON.parse(legacyRaw) as BoardPayload;
      if (Array.isArray(payload.layers) && payload.layers.length > 0) {
        await store.set(boardKey(index.activeId), payload);
        const check = await store.get<BoardPayload>(boardKey(index.activeId));
        if (check && check.layers?.length === payload.layers.length) ls?.removeItem(LEGACY_KEY);
      }
    } catch { /* corrupt legacy drawing: start clean, keep the old key untouched */ }
  }
  await store.set(INDEX_KEY, index);
  return index;
}

export const saveIndex = (index: BoardsIndex, store: BoardStore = idbBoardStore) => store.set(INDEX_KEY, index);
export const loadBoard = (id: string, store: BoardStore = idbBoardStore) => store.get<BoardPayload>(boardKey(id));
export const saveBoard = (id: string, payload: BoardPayload, store: BoardStore = idbBoardStore) => store.set(boardKey(id), payload);
export const deleteBoardData = (id: string, store: BoardStore = idbBoardStore) => store.del(boardKey(id));

function safeLocalStorage(): Pick<Storage, 'getItem' | 'removeItem'> | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}
