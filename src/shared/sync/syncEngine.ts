// =============================================================================
// DEX Platform — Phase 2: Sync engine over CRDT + Transport
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Tiny coordinator that batches outbound CRDT ops, applies inbound ones,
 * and chooses a transport when sending. The transport is injected so the
 * engine is unit-testable.
 */

import { pickTransport, type NetCondition, type Transport } from '../network/transport';

export interface SyncOp<T = unknown> {
  /** Logical timestamp (Lamport) — monotonic. */
  t: number;
  /** Replica id. */
  r: string;
  /** Document id. */
  doc: string;
  /** CRDT-specific payload. */
  payload: T;
}

export interface OutboundBatch<T = unknown> {
  transport: Transport;
  ops: SyncOp<T>[];
}

export interface SyncSink<T = unknown> {
  /** Receive a batch from a remote peer. Caller routes per-doc. */
  receive(batch: SyncOp<T>[]): void;
}

export interface PeerSender<T = unknown> {
  send(batch: OutboundBatch<T>): Promise<void>;
}

export class SyncEngine<T = unknown> implements SyncSink<T> {
  private pending: SyncOp<T>[] = [];
  private lastFlushMs: number;

  constructor(
    private readonly net: () => NetCondition,
    private readonly sender: PeerSender<T>,
    private readonly applyLocal: (op: SyncOp<T>) => void,
    private readonly opts: { batchMs: number; maxBatch: number; reliable: boolean } = { batchMs: 100, maxBatch: 64, reliable: true },
    private readonly nowFn: () => number = () => Date.now(),
  ) {
    this.lastFlushMs = this.nowFn();
  }

  /** Stage a local op for outbound delivery. */
  enqueue(op: SyncOp<T>): void {
    this.pending.push(op);
  }

  /** Apply an inbound batch from a peer. */
  receive(batch: SyncOp<T>[]): void {
    for (const op of batch) this.applyLocal(op);
  }

  /** Returns true if a flush is due based on size or time. */
  shouldFlush(): boolean {
    if (this.pending.length === 0) return false;
    if (this.pending.length >= this.opts.maxBatch) return true;
    return this.nowFn() - this.lastFlushMs >= this.opts.batchMs;
  }

  /** Flush staged ops via the chosen transport. Returns number of ops sent. */
  async flush(): Promise<number> {
    if (this.pending.length === 0) return 0;
    const t = pickTransport(this.net(), { bulk: this.pending.length > 8, reliable: this.opts.reliable });
    const ops = this.pending.splice(0, this.opts.maxBatch);
    await this.sender.send({ transport: t, ops });
    this.lastFlushMs = this.nowFn();
    return ops.length;
  }

  /** Pending op count (for backpressure / metrics). */
  pendingCount(): number {
    return this.pending.length;
  }
}
