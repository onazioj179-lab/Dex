// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Lightweight IPC call tracer. Issues correlation IDs and tracks open
 * spans so observability can compute end-to-end latency per channel.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface IpcTraceSpan {
  id: string;
  channel: string;
  startedAt: number;
  parentId?: string;
}

export interface IpcTraceResult {
  id: string;
  channel: string;
  durationMs: number;
  status: 'ok' | 'error';
  errorMessage?: string;
}

export type IpcTraceListener = (result: IpcTraceResult) => void;

export class IpcCallTracer {
  private open = new Map<string, IpcTraceSpan>();
  private listeners = new Set<IpcTraceListener>();
  private counter = 0;

  start(channel: string, parentId?: string, now = Date.now()): IpcTraceSpan {
    this.counter += 1;
    const id = `${now.toString(36)}-${this.counter.toString(36)}`;
    const span: IpcTraceSpan = { id, channel, startedAt: now, parentId };
    this.open.set(id, span);
    return span;
  }

  finish(id: string, status: 'ok' | 'error', errorMessage?: string, now = Date.now()): IpcTraceResult | null {
    const span = this.open.get(id);
    if (!span) return null;
    this.open.delete(id);
    const result: IpcTraceResult = {
      id,
      channel: span.channel,
      durationMs: now - span.startedAt,
      status,
      errorMessage,
    };
    for (const l of this.listeners) {
      try { l(result); } catch { /* swallow */ }
    }
    return result;
  }

  inflight(): number { return this.open.size; }

  subscribe(listener: IpcTraceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
