// =============================================================================
// DEX Platform — Phase 3 host: Snapshot manager
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Wraps SnapshotManager + MemoryBlobIndex behind IPC for now. A future
 * pass swaps these in-memory stores for SQLite-backed persistent ones.
 *
 *   snapshot:capture (id, entries) -> Snapshot
 *   snapshot:list                  -> Snapshot[]
 *   snapshot:get     (id)          -> Snapshot | undefined
 *   snapshot:discard (id)          -> boolean
 *   snapshot:diff    (fromId|null, toId) -> diff | null
 *   snapshot:prune   (maxAgeMs)    -> string[]
 */

import { ipcMain } from 'electron';
import {
  SnapshotManager,
  MemorySnapshotStore,
} from '../../shared/storage/snapshotManager';
import { MemoryBlobIndex, type Snapshot } from '../../shared/storage/blobStore';

const blobs = new MemoryBlobIndex();
const store = new MemorySnapshotStore();
const manager = new SnapshotManager(blobs, store);

export function capture(id: string, entries: Record<string, { sha256: string; bytes: number }>): Snapshot {
  return manager.capture(id, entries);
}

export function list(): Snapshot[] { return store.list(); }
export function get(id: string): Snapshot | undefined { return store.get(id); }
export function discard(id: string): boolean { return manager.discard(id); }
export function diff(fromId: string | null, toId: string) { return manager.diff(fromId, toId); }
export function prune(maxAgeMs: number): string[] { return manager.prune(maxAgeMs); }

export function registerSnapshotIpc(): void {
  ipcMain.handle('snapshot:capture', (_e, id: string, entries: Record<string, { sha256: string; bytes: number }>) => capture(id, entries));
  ipcMain.handle('snapshot:list', () => list());
  ipcMain.handle('snapshot:get', (_e, id: string) => get(id));
  ipcMain.handle('snapshot:discard', (_e, id: string) => discard(id));
  ipcMain.handle('snapshot:diff', (_e, fromId: string | null, toId: string) => diff(fromId, toId));
  ipcMain.handle('snapshot:prune', (_e, maxAgeMs: number) => prune(maxAgeMs));
}
