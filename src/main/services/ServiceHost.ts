// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// ServiceHost — lightweight lifecycle registry for long-lived backend services.
//
// Roadmap reference: docs/DEX_OS_PRODUCTION_ROADMAP.md §2 ("Backend
// architecture refinement"). This module is intentionally additive: existing
// services keep their bespoke wiring in main.ts. New phase 4.5+ services
// (ukiIndexer, embeddingService, vectorIndexService, scheduler lanes) register
// here so they get uniform start/stop/health/restart semantics, observable
// state, and a single shutdown path with timeout enforcement.
//
// Design constraints:
//   - Zero dependency on Electron internals; works in node + tests.
//   - No global singletons leaking outside this module other than `serviceHost`.
//   - Start order is the registration order; stop order is reverse.
//   - A failing start does not abort the host; it is recorded and reported.
//   - Health is pull-based (probe()) plus event-driven (markUnhealthy()).
// =============================================================================

import log from 'electron-log';

export type ServiceState =
  | 'registered'
  | 'starting'
  | 'running'
  | 'degraded'
  | 'stopping'
  | 'stopped'
  | 'failed';

export interface ServiceHealth {
  state: ServiceState;
  ok: boolean;
  message?: string;
  lastCheckedAt: number;
}

export interface ServiceDefinition {
  /** Stable identifier, e.g. "uki.indexer". Lowercase, dot-separated. */
  id: string;
  /** Human label for diagnostics. */
  name: string;
  /** Optional ids that must reach 'running' before this one starts. */
  dependsOn?: readonly string[];
  /** Called once during host.start(). May be async. */
  start: () => void | Promise<void>;
  /** Called during host.stop(). Must be idempotent. */
  stop?: () => void | Promise<void>;
  /** Optional health probe. Returning false transitions to 'degraded'. */
  probe?: () => boolean | Promise<boolean>;
  /** Soft cap (ms) for both start and stop. Default 5000. */
  timeoutMs?: number;
}

interface ServiceRecord {
  def: ServiceDefinition;
  state: ServiceState;
  message?: string;
  startedAt?: number;
  stoppedAt?: number;
  failures: number;
}

const DEFAULT_TIMEOUT = 5000;

function withTimeout<T>(p: Promise<T> | T, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(`${label} exceeded ${ms}ms`));
    }, ms);
    Promise.resolve(p).then(
      (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
      (e) => { if (!done) { done = true; clearTimeout(timer); reject(e); } },
    );
  });
}

export class ServiceHost {
  private readonly services = new Map<string, ServiceRecord>();
  private started = false;

  register(def: ServiceDefinition): void {
    if (this.services.has(def.id)) {
      throw new Error(`ServiceHost: duplicate id ${def.id}`);
    }
    this.services.set(def.id, {
      def,
      state: 'registered',
      failures: 0,
    });
  }

  has(id: string): boolean {
    return this.services.has(id);
  }

  /** Start every registered service in registration order. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    for (const rec of this.services.values()) {
      await this.startOne(rec);
    }
  }

  private async startOne(rec: ServiceRecord): Promise<void> {
    const { def } = rec;
    if (def.dependsOn) {
      for (const depId of def.dependsOn) {
        const dep = this.services.get(depId);
        if (!dep || dep.state !== 'running') {
          rec.state = 'failed';
          rec.message = `dependency not running: ${depId}`;
          log.warn(`[ServiceHost] ${def.id} skipped — ${rec.message}`);
          return;
        }
      }
    }
    rec.state = 'starting';
    const t0 = Date.now();
    try {
      await withTimeout(def.start(), def.timeoutMs ?? DEFAULT_TIMEOUT, `${def.id}.start`);
      rec.state = 'running';
      rec.startedAt = Date.now();
      log.info(`[ServiceHost] ${def.id} running (${rec.startedAt - t0}ms)`);
    } catch (err) {
      rec.state = 'failed';
      rec.failures += 1;
      rec.message = err instanceof Error ? err.message : String(err);
      log.error(`[ServiceHost] ${def.id} failed:`, rec.message);
    }
  }

  /** Stop every running service in reverse registration order. */
  async stop(): Promise<void> {
    if (!this.started) return;
    const recs = Array.from(this.services.values()).reverse();
    for (const rec of recs) {
      if (rec.state !== 'running' && rec.state !== 'degraded') continue;
      const { def } = rec;
      rec.state = 'stopping';
      try {
        if (def.stop) {
          await withTimeout(def.stop(), def.timeoutMs ?? DEFAULT_TIMEOUT, `${def.id}.stop`);
        }
        rec.state = 'stopped';
        rec.stoppedAt = Date.now();
      } catch (err) {
        rec.state = 'failed';
        rec.message = err instanceof Error ? err.message : String(err);
        log.error(`[ServiceHost] ${def.id} stop failed:`, rec.message);
      }
    }
    this.started = false;
  }

  /** Restart one service in place. Useful after recoverable failures. */
  async restart(id: string): Promise<void> {
    const rec = this.services.get(id);
    if (!rec) throw new Error(`ServiceHost: unknown id ${id}`);
    if (rec.state === 'running' || rec.state === 'degraded') {
      try {
        if (rec.def.stop) {
          await withTimeout(rec.def.stop(), rec.def.timeoutMs ?? DEFAULT_TIMEOUT, `${id}.stop`);
        }
      } catch (err) {
        log.warn(`[ServiceHost] ${id} stop during restart failed:`, err);
      }
    }
    rec.state = 'registered';
    rec.message = undefined;
    await this.startOne(rec);
  }

  markUnhealthy(id: string, message?: string): void {
    const rec = this.services.get(id);
    if (!rec) return;
    if (rec.state === 'running') {
      rec.state = 'degraded';
      rec.message = message;
      rec.failures += 1;
    }
  }

  async health(id: string): Promise<ServiceHealth> {
    const rec = this.services.get(id);
    if (!rec) {
      return { state: 'failed', ok: false, message: `unknown ${id}`, lastCheckedAt: Date.now() };
    }
    if (rec.def.probe && (rec.state === 'running' || rec.state === 'degraded')) {
      try {
        const ok = await withTimeout(rec.def.probe(), 1500, `${id}.probe`);
        rec.state = ok ? 'running' : 'degraded';
        if (!ok && !rec.message) rec.message = 'probe returned false';
      } catch (err) {
        rec.state = 'degraded';
        rec.message = err instanceof Error ? err.message : String(err);
      }
    }
    return {
      state: rec.state,
      ok: rec.state === 'running',
      message: rec.message,
      lastCheckedAt: Date.now(),
    };
  }

  /** Snapshot of every service for diagnostics / IPC. */
  snapshot(): Array<{
    id: string;
    name: string;
    state: ServiceState;
    failures: number;
    message?: string;
    startedAt?: number;
    stoppedAt?: number;
  }> {
    return Array.from(this.services.values()).map((r) => ({
      id: r.def.id,
      name: r.def.name,
      state: r.state,
      failures: r.failures,
      message: r.message,
      startedAt: r.startedAt,
      stoppedAt: r.stoppedAt,
    }));
  }
}

export const serviceHost = new ServiceHost();
