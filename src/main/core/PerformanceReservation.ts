// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Performance Reservation (Track D1)
// ---------------------------------------------------------------------------
// Lowers the OS scheduling priority of background processes that aren't DEX,
// not on a hard-exclusion list, and not in the foreground -- so the active
// DEX session gets a larger slice of CPU. Records the original priority for
// each touched PID so it can be restored on disable / refocus / shutdown.
//
// Cross-platform: Windows (PowerShell PriorityClass) / macOS+Linux (renice).
// All platform side-effects are injected so this is unit-testable.
// ===========================================================================

export type Platform = 'win32' | 'darwin' | 'linux';

export interface ProcessSnapshot {
  pid: number;
  name: string;
  /** OS-specific priority value (string on win, integer niceness on unix). */
  priority: string | number;
  /** True when this PID owns a visible foreground window. */
  foreground: boolean;
}

export interface ReservationDeps {
  /** Returns the current process listing including focus state. */
  enumerate: () => Promise<ProcessSnapshot[]>;
  /** Sets a target priority for a PID. Throws on failure. */
  setPriority: (pid: number, priority: string | number) => Promise<void>;
  /** Returns the current platform. Defaults to process.platform. */
  platform?: () => Platform;
  /** Override clock for tests. */
  now?: () => number;
}

export interface ReservationOptions {
  /** Process names to never touch (case-insensitive substring match). */
  excludeNames?: string[];
  /** PIDs to never touch (e.g. PID 0/4 on Windows). */
  excludePids?: number[];
  /** Touch foreground processes? Default false. */
  includeForeground?: boolean;
}

export interface ReservationStatus {
  enabled: boolean;
  managedCount: number;
  managedPids: number[];
  startedAt: number | null;
  lastError: string | null;
}

// ---------------------------------------------------------------------------
// Hard exclusions. Anything matching here will never be reniced regardless of
// caller options, on any platform. Antivirus, system, and audio first.
// ---------------------------------------------------------------------------

const HARD_EXCLUDE_NAMES_LOWER: ReadonlyArray<string> = [
  // Generic system
  'system', 'system idle process', 'registry', 'csrss', 'wininit', 'winlogon',
  'services.exe', 'lsass', 'smss', 'svchost', 'dwm', 'explorer.exe',
  'kernel_task', 'launchd', 'windowserver',
  'init', 'systemd', 'kthreadd',
  // DEX itself
  'dex', 'dex.exe', 'electron', 'electron.exe',
  // Audio
  'audiodg', 'coreaudio', 'pulseaudio', 'pipewire', 'wireplumber',
  // Security / AV
  'defender', 'msmpeng', 'mssense', 'mcafee', 'symantec', 'norton',
  'avast', 'avg', 'bitdefender', 'kaspersky', 'crowdstrike', 'sentinelone',
  'sophos', 'eset', 'trendmicro', 'malwarebytes', 'firewall',
];

const HARD_EXCLUDE_PIDS: ReadonlyArray<number> = [0, 1, 2, 4];

function isHardExcluded(name: string, pid: number): boolean {
  if (HARD_EXCLUDE_PIDS.includes(pid)) return true;
  const lower = name.toLowerCase();
  return HARD_EXCLUDE_NAMES_LOWER.some(n => lower.includes(n));
}

function isExcluded(name: string, pid: number, options: ReservationOptions): boolean {
  if (isHardExcluded(name, pid)) return true;
  const lower = name.toLowerCase();
  if (options.excludePids?.includes(pid)) return true;
  if (options.excludeNames?.some(n => lower.includes(n.toLowerCase()))) return true;
  return false;
}

function lowPriorityFor(platform: Platform): string | number {
  if (platform === 'win32') return 'Idle';
  return 19; // unix nice
}

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export class PerformanceReservation {
  private deps: ReservationDeps;
  private original = new Map<number, string | number>();
  private startedAt: number | null = null;
  private lastError: string | null = null;
  private platform: Platform;
  private now: () => number;

  constructor(deps: ReservationDeps) {
    this.deps = deps;
    this.platform = (deps.platform ? deps.platform() : (process.platform as Platform));
    if (this.platform !== 'win32' && this.platform !== 'darwin' && this.platform !== 'linux') {
      this.platform = 'linux';
    }
    this.now = deps.now ?? Date.now;
  }

  /**
   * Lower priority of every eligible background process and remember the
   * originals so we can restore them later. Idempotent.
   */
  async enable(options: ReservationOptions = {}): Promise<ReservationStatus> {
    this.lastError = null;
    let processes: ProcessSnapshot[];
    try {
      processes = await this.deps.enumerate();
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'enumerate-failed';
      return this.status();
    }
    const target = lowPriorityFor(this.platform);
    for (const p of processes) {
      if (this.original.has(p.pid)) continue; // already managed
      if (isExcluded(p.name, p.pid, options)) continue;
      if (p.foreground && !options.includeForeground) continue;
      try {
        await this.deps.setPriority(p.pid, target);
        this.original.set(p.pid, p.priority);
      } catch (err) {
        // Don't abort -- just record the most recent error.
        this.lastError = err instanceof Error ? err.message : `setPriority-failed:${p.pid}`;
      }
    }
    if (this.startedAt === null) this.startedAt = this.now();
    return this.status();
  }

  /** Restore every managed PID to its original priority. */
  async disable(): Promise<ReservationStatus> {
    const entries = [...this.original.entries()];
    for (const [pid, original] of entries) {
      try {
        await this.deps.setPriority(pid, original);
        this.original.delete(pid);
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : `restore-failed:${pid}`;
      }
    }
    if (this.original.size === 0) this.startedAt = null;
    return this.status();
  }

  /** Restore one PID -- e.g. when the user re-focuses that app. */
  async release(pid: number): Promise<void> {
    const original = this.original.get(pid);
    if (original === undefined) return;
    try {
      await this.deps.setPriority(pid, original);
      this.original.delete(pid);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : `release-failed:${pid}`;
    }
  }

  status(): ReservationStatus {
    return {
      enabled: this.original.size > 0,
      managedCount: this.original.size,
      managedPids: [...this.original.keys()],
      startedAt: this.startedAt,
      lastError: this.lastError,
    };
  }

  /** Test-only inspection of the original-priority table. */
  _peekOriginals(): Map<number, string | number> {
    return new Map(this.original);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: PerformanceReservation | null = null;

export function configurePerformanceReservation(deps: ReservationDeps): PerformanceReservation {
  _instance = new PerformanceReservation(deps);
  return _instance;
}

export function getPerformanceReservation(): PerformanceReservation | null {
  return _instance;
}

export function _resetPerformanceReservation(): void {
  _instance = null;
}

// Exported for tests
export const _internals = { isHardExcluded, isExcluded, lowPriorityFor, HARD_EXCLUDE_NAMES_LOWER };
