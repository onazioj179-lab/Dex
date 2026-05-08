// =============================================================================
// DEX Platform — Phase 3 host: Sync engine
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Wraps SyncEngine with a placeholder loopback transport. Real QUIC/mDNS
 * transports plug in via setSender() in a later pass.
 *
 *   sync:enqueue        (op)        -> void
 *   sync:flush                       -> count
 *   sync:pending                     -> count
 *   sync:receive        (batch)     -> void
 */

import { ipcMain } from 'electron';
import log from 'electron-log';
import {
  SyncEngine,
  type SyncOp,
  type PeerSender,
  type OutboundBatch,
} from '../../shared/sync/syncEngine';
import type { NetCondition } from '../../shared/network/transport';

let engine: SyncEngine<unknown> | null = null;

const loopbackNet: NetCondition = {
  rttMs: 1, loss: 0, sameLan: true, nat: 'open', mdns: true, turn: false,
};

const noopSender: PeerSender<unknown> = {
  send: async (b: OutboundBatch<unknown>) => {
    log.info('[Sync] sent', b.ops.length, 'ops via', b.transport);
  },
};

const localApply = (op: SyncOp<unknown>): void => {
  log.info('[Sync] received op', op.t, op.r, op.doc);
};

function getEngine(): SyncEngine<unknown> {
  if (!engine) engine = new SyncEngine<unknown>(() => loopbackNet, noopSender, localApply);
  return engine;
}

export function setSender(s: PeerSender<unknown>): void {
  // Re-create engine with the new sender; preserves caller-provided transport.
  engine = new SyncEngine<unknown>(() => loopbackNet, s, localApply);
}

export function enqueue(op: SyncOp<unknown>): void {
  getEngine().enqueue(op);
}

export async function flush(): Promise<number> {
  return getEngine().flush();
}

export function pending(): number {
  return getEngine().pendingCount();
}

export function receive(batch: SyncOp<unknown>[]): void {
  getEngine().receive(batch);
}

export function registerSyncIpc(): void {
  ipcMain.handle('sync:enqueue', (_e, op: SyncOp<unknown>) => enqueue(op));
  ipcMain.handle('sync:flush', () => flush());
  ipcMain.handle('sync:pending', () => pending());
  ipcMain.handle('sync:receive', (_e, batch: SyncOp<unknown>[]) => receive(batch));
}
