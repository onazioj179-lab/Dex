// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Defense Orchestrator (Track D3)
// ---------------------------------------------------------------------------
// Aggregates security signals (IPC anomaly hits, network alerts, integrity
// hash drift, plugin scan findings) into a single threat tier and dispatches
// graduated responses: snapshot -> quarantine -> rotate -> lockdown.
//
// All side-effects (snapshot, quarantine, rotate, lockdown, restore) are
// injected so the orchestrator is unit-testable without booting the rest of
// the security stack. Auto-recovery downgrades the tier after a configurable
// quiet window.
// ===========================================================================

export type ThreatTier = 'green' | 'yellow' | 'red' | 'critical';

export type SignalKind =
  | 'ipc-anomaly'
  | 'network-alert'
  | 'integrity-drift'
  | 'plugin-scan'
  | 'auth-failure'
  | 'rate-limit-burst';

export type SignalSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface DefenseSignal {
  kind: SignalKind;
  severity: SignalSeverity;
  source: string;
  message: string;
  /** Optional file / plugin / pid the signal points at. */
  target?: string;
  timestamp?: number;
}

export interface DefenseResponses {
  snapshot: () => Promise<void> | void;
  quarantinePlugin: (pluginId: string) => Promise<void> | void;
  rotateIPC: () => Promise<void> | void;
  lockIdentityVault: () => Promise<void> | void;
  networkLockdown: (enable: boolean) => Promise<void> | void;
  restoreFiles: (paths: string[]) => Promise<void> | void;
  emitNexusEmergency: (reason: string) => Promise<void> | void;
}

export interface OrchestratorOptions {
  /** Window in ms for severity escalation. Default 60_000. */
  windowMs?: number;
  /** Quiet window before auto-recovery downgrades tier. Default 300_000 (5 min). */
  quietMs?: number;
  /** Override the clock for tests. */
  now?: () => number;
}

export interface OrchestratorStatus {
  tier: ThreatTier;
  signalCount: number;
  recentSignals: DefenseSignal[];
  lastEscalationAt: number | null;
  quarantinedPlugins: string[];
  lockdownActive: boolean;
}

// ---------------------------------------------------------------------------
// Severity scoring -- bigger = worse
// ---------------------------------------------------------------------------

const SEVERITY_SCORE: Record<SignalSeverity, number> = {
  info: 0,
  low: 1,
  medium: 3,
  high: 8,
  critical: 16,
};

const TIER_ORDER: ThreatTier[] = ['green', 'yellow', 'red', 'critical'];

function tierFromScore(score: number): ThreatTier {
  if (score >= 16) return 'critical';
  if (score >= 8) return 'red';
  if (score >= 3) return 'yellow';
  return 'green';
}

// ---------------------------------------------------------------------------

export class DefenseOrchestrator {
  private responses: DefenseResponses;
  private windowMs: number;
  private quietMs: number;
  private now: () => number;
  private signals: DefenseSignal[] = [];
  private tier: ThreatTier = 'green';
  private quarantined = new Set<string>();
  private lockdownActive = false;
  private lastEscalationAt: number | null = null;
  private lastSignalAt: number | null = null;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(responses: DefenseResponses, options: OrchestratorOptions = {}) {
    this.responses = responses;
    this.windowMs = options.windowMs ?? 60_000;
    this.quietMs = options.quietMs ?? 300_000;
    this.now = options.now ?? Date.now;
  }

  /**
   * Ingest one signal. Returns the (possibly upgraded) threat tier.
   * Triggers responses synchronously / asynchronously per tier change.
   */
  async ingest(signal: DefenseSignal): Promise<ThreatTier> {
    const stamped: DefenseSignal = { ...signal, timestamp: signal.timestamp ?? this.now() };
    this.signals.push(stamped);
    this.lastSignalAt = stamped.timestamp ?? this.now();
    this.trim();
    const score = this.scoreInWindow();
    const newTier = tierFromScore(score);
    if (compareTier(newTier, this.tier) > 0) {
      await this.escalateTo(newTier);
    }
    return this.tier;
  }

  /** Force-set the tier (e.g. operator override). */
  async forceTier(tier: ThreatTier): Promise<void> {
    if (compareTier(tier, this.tier) > 0) {
      await this.escalateTo(tier);
    } else {
      this.tier = tier;
      if (tier === 'green') this.lockdownActive = false;
    }
  }

  status(): OrchestratorStatus {
    return {
      tier: this.tier,
      signalCount: this.signals.length,
      recentSignals: this.signals.slice(-20),
      lastEscalationAt: this.lastEscalationAt,
      quarantinedPlugins: [...this.quarantined],
      lockdownActive: this.lockdownActive,
    };
  }

  /**
   * Check if the quiet window has elapsed since the last signal and downgrade
   * one tier if so. Intended to be called from a timer or manually in tests.
   */
  async maybeRecover(): Promise<ThreatTier> {
    if (this.tier === 'green') return this.tier;
    if (this.lastSignalAt === null) return this.tier;
    if (this.now() - this.lastSignalAt < this.quietMs) return this.tier;
    const idx = TIER_ORDER.indexOf(this.tier);
    const next = TIER_ORDER[Math.max(0, idx - 1)];
    this.tier = next;
    if (next === 'green') {
      if (this.lockdownActive) {
        await this.responses.networkLockdown(false);
        this.lockdownActive = false;
      }
    }
    return this.tier;
  }

  /** Test-only: clear internal recovery timer. */
  _stopRecoveryTimer(): void {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }

  // ---- internals -------------------------------------------------------

  private async escalateTo(tier: ThreatTier): Promise<void> {
    this.tier = tier;
    this.lastEscalationAt = this.now();
    if (tier === 'yellow') {
      // Just observe -- snapshot for forensics.
      await safe(() => this.responses.snapshot());
    } else if (tier === 'red') {
      await safe(() => this.responses.snapshot());
      await safe(() => this.responses.rotateIPC());
      await safe(() => this.responses.lockIdentityVault());
      // Quarantine any plugin-scan signal targets within the window.
      for (const target of this.collectTargets('plugin-scan')) {
        this.quarantined.add(target);
        await safe(() => this.responses.quarantinePlugin(target));
      }
    } else if (tier === 'critical') {
      await safe(() => this.responses.snapshot());
      await safe(() => this.responses.rotateIPC());
      await safe(() => this.responses.lockIdentityVault());
      await safe(() => this.responses.networkLockdown(true));
      this.lockdownActive = true;
      const integrityTargets = this.collectTargets('integrity-drift');
      if (integrityTargets.length > 0) {
        await safe(() => this.responses.restoreFiles(integrityTargets));
      }
      await safe(() => this.responses.emitNexusEmergency(`tier:critical signals:${this.signals.length}`));
    }
  }

  private trim(): void {
    const cutoff = this.now() - this.windowMs;
    while (this.signals.length > 0 && (this.signals[0].timestamp ?? 0) < cutoff) {
      this.signals.shift();
    }
    if (this.signals.length > 200) {
      this.signals.splice(0, this.signals.length - 200);
    }
  }

  private scoreInWindow(): number {
    const cutoff = this.now() - this.windowMs;
    let total = 0;
    for (const s of this.signals) {
      if ((s.timestamp ?? 0) < cutoff) continue;
      total += SEVERITY_SCORE[s.severity] ?? 0;
    }
    return total;
  }

  private collectTargets(kind: SignalKind): string[] {
    const cutoff = this.now() - this.windowMs;
    const set = new Set<string>();
    for (const s of this.signals) {
      if (s.kind !== kind) continue;
      if ((s.timestamp ?? 0) < cutoff) continue;
      if (s.target) set.add(s.target);
    }
    return [...set];
  }
}

function compareTier(a: ThreatTier, b: ThreatTier): number {
  return TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b);
}

async function safe(fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch {
    // Defense responses should never bring down the orchestrator. Errors are
    // intentionally swallowed -- callers can wire telemetry inside `responses`.
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: DefenseOrchestrator | null = null;

export function configureDefenseOrchestrator(
  responses: DefenseResponses,
  options?: OrchestratorOptions,
): DefenseOrchestrator {
  _instance = new DefenseOrchestrator(responses, options);
  return _instance;
}

export function getDefenseOrchestrator(): DefenseOrchestrator | null {
  return _instance;
}

export function _resetDefenseOrchestrator(): void {
  _instance = null;
}

export const _internals = { tierFromScore, SEVERITY_SCORE };
