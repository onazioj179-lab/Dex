// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * StartupTimeline -- fine-grained phase timer for DEX main-process startup.
 *
 * Records wall-clock time for each named phase. On complete(), emits a
 * sorted summary to electron-log so slow inits are immediately visible.
 *
 * W3#136-140: startup performance measurement
 *
 * Usage:
 *   const t = startupTimeline;
 *   t.begin('CoreRuntime');
 *   await coreRuntime.init();
 *   t.end('CoreRuntime');
 *   ...
 *   t.complete(); // logs summary
 */

import * as log from 'electron-log';

interface Phase {
  name: string;
  start: number;
  end?: number;
  durationMs?: number;
}

export class StartupTimeline {
  private readonly _phases: Phase[] = [];
  private readonly _t0 = Date.now();
  private _completed = false;

  begin(name: string): this {
    // close any implicitly still-open phase of the same name
    const existing = this._phases.find(p => p.name === name && !p.end);
    if (existing) existing.end = Date.now();

    this._phases.push({ name, start: Date.now() });
    return this;
  }

  end(name: string): this {
    const phase = [...this._phases].reverse().find(p => p.name === name && !p.end);
    if (phase) {
      phase.end = Date.now();
      phase.durationMs = phase.end - phase.start;
    }
    return this;
  }

  /** Mark a single instant (start == end). */
  mark(name: string): this {
    const t = Date.now();
    this._phases.push({ name, start: t, end: t, durationMs: 0 });
    return this;
  }

  complete(): this {
    if (this._completed) return this;
    this._completed = true;
    const totalMs = Date.now() - this._t0;

    // Close any still-open phases
    const now = Date.now();
    for (const p of this._phases) {
      if (!p.end) { p.end = now; p.durationMs = now - p.start; }
    }

    // Sort by duration descending for easy scanning
    const sorted = [...this._phases]
      .filter(p => p.durationMs !== undefined)
      .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0));

    const lines = sorted.map(p => `  ${String(p.durationMs).padStart(5)} ms  ${p.name}`).join('\n');
    log.info(`[StartupTimeline] total=${totalMs}ms\n${lines}`);

    return this;
  }

  /** Structured snapshot for IPC / diagnostics. */
  snapshot(): { totalMs: number; phases: { name: string; durationMs: number }[] } {
    const totalMs = Date.now() - this._t0;
    const phases = this._phases
      .filter(p => p.durationMs !== undefined)
      .map(p => ({ name: p.name, durationMs: p.durationMs ?? 0 }));
    return { totalMs, phases };
  }
}

export const startupTimeline = new StartupTimeline();
