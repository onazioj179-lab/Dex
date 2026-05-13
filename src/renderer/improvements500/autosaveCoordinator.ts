// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Autosave coordinator. Debounces save requests per source and serializes
 * concurrent flushes so the same destination is never written twice in
 * parallel. Built for the workspace continuity layer.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface AutosaveCoordinatorOptions {
  debounceMs?: number;
}

export type AutosaveFlush = () => Promise<void> | void;

interface AutosaveSource {
  flush: AutosaveFlush;
  timer: ReturnType<typeof setTimeout> | null;
  inflight: Promise<void> | null;
  pending: boolean;
}

export class AutosaveCoordinator {
  private sources = new Map<string, AutosaveSource>();
  private debounceMs: number;

  constructor(options: AutosaveCoordinatorOptions = {}) {
    this.debounceMs = options.debounceMs ?? 1500;
  }

  register(key: string, flush: AutosaveFlush): void {
    this.sources.set(key, { flush, timer: null, inflight: null, pending: false });
  }

  unregister(key: string): void {
    const s = this.sources.get(key);
    if (s?.timer) clearTimeout(s.timer);
    this.sources.delete(key);
  }

  schedule(key: string): void {
    const s = this.sources.get(key);
    if (!s) return;
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(() => { void this.flush(key); }, this.debounceMs);
  }

  async flush(key: string): Promise<void> {
    const s = this.sources.get(key);
    if (!s) return;
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    if (s.inflight) {
      s.pending = true;
      await s.inflight;
      if (!s.pending) return;
    }
    s.pending = false;
    const run = (async () => { await s.flush(); })();
    s.inflight = run.finally(() => { s.inflight = null; });
    await s.inflight;
    if (s.pending) await this.flush(key);
  }

  async flushAll(): Promise<void> {
    await Promise.all(Array.from(this.sources.keys()).map((k) => this.flush(k)));
  }
}
