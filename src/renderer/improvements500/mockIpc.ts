// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * In-memory mock IPC layer for tests (T8 test infra).
 *
 * Mirrors the renderer-side `window.dexIpc.invoke(channel, payload)` shape
 * so suites can register handlers and assert on invocation history without
 * spinning up Electron.
 */

type Handler = (payload: unknown) => unknown | Promise<unknown>;

export interface InvocationRecord { channel: string; payload: unknown; ts: number; }

export class MockIpc {
  private readonly handlers = new Map<string, Handler>();
  readonly history: InvocationRecord[] = [];

  on(channel: string, handler: Handler): this { this.handlers.set(channel, handler); return this; }

  async invoke(channel: string, payload?: unknown): Promise<unknown> {
    this.history.push({ channel, payload, ts: Date.now() });
    const h = this.handlers.get(channel);
    if (!h) throw new Error(`MockIpc: no handler for "${channel}"`);
    return await h(payload);
  }

  /** Returns true if the channel was invoked at least once. */
  invoked(channel: string): boolean { return this.history.some((r) => r.channel === channel); }

  invocationsOf(channel: string): InvocationRecord[] {
    return this.history.filter((r) => r.channel === channel);
  }

  reset(): void { this.history.length = 0; this.handlers.clear(); }
}
