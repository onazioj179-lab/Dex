// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Workload Governor (renderer, advisory)
 * -----------------------------------------------------------------------------
 * The high-level "how much work should the whole UI be doing right now?" layer.
 * It aggregates the signals DEX already maintains — the visual perf tier
 * (data-perf-tier on <html>, from TierManager), the thermal state
 * (data-thermal-state, from ThermalAdaptiveMonitor), and document visibility —
 * into a single workload policy: full | reduced | minimal.
 *
 * This complements (does not duplicate) the pure per-app CPU/GPU/RAM allocator
 * in `shared/runtime/resourceGovernor.ts` (allocate / pickEvictionVictim): that
 * module decides *how to split* a budget across apps; this one decides the
 * overall *appetite* from live device state.
 *
 * IMPORTANT: advisory only. It reports a recommended policy other systems can
 * read; it deliberately does NOT unmount apps, defer rendering, or re-enable
 * the old AdaptivePerfMonitor downgrade path that previously blanked background
 * apps (HANDOFF-PREMIUM CRITICAL #1). Read-only ⇒ it can never reproduce that.
 *
 * `deriveWorkloadPolicy` is pure for testing; `getWorkloadStatus` reads the DOM.
 */

export type WorkloadPolicy = 'full' | 'reduced' | 'minimal';

export interface WorkloadSignals {
  /** low | mid | high | ultra | unknown */
  perfTier: string;
  /** normal | warm | hot | critical | unknown */
  thermalState: string;
  /** true when the window/tab is backgrounded. */
  hidden: boolean;
}

export interface WorkloadStatus extends WorkloadSignals {
  policy: WorkloadPolicy;
  summary: string;
}

/** Pure policy derivation — no DOM, easy to unit test. */
export function deriveWorkloadPolicy(s: WorkloadSignals): WorkloadPolicy {
  if (s.thermalState === 'critical' || s.perfTier === 'low') return 'minimal';
  let policy: WorkloadPolicy = 'full';
  if (s.thermalState === 'hot' || s.thermalState === 'warm' || s.perfTier === 'mid') {
    policy = 'reduced';
  }
  // A backgrounded window never needs full-power foreground work.
  if (s.hidden && policy === 'full') policy = 'reduced';
  return policy;
}

function summarize(s: WorkloadSignals, policy: WorkloadPolicy): string {
  switch (policy) {
    case 'minimal':
      return s.thermalState === 'critical'
        ? 'Minimal — thermal protection active; effects and background work cut.'
        : 'Minimal — low-power device; effects and background work cut.';
    case 'reduced':
      if (s.hidden) return 'Reduced — window is in the background.';
      if (s.thermalState === 'hot' || s.thermalState === 'warm') return 'Reduced — system warming; easing off effects.';
      return 'Reduced — mid-tier device; balancing effects and load.';
    default:
      return 'Full — headroom available; all effects on.';
  }
}

function readAttr(name: string): string {
  try {
    if (typeof document === 'undefined' || !document.documentElement) return 'unknown';
    return document.documentElement.getAttribute(name) || 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Snapshot the live workload status from the current DOM + visibility. */
export function getWorkloadStatus(): WorkloadStatus {
  const signals: WorkloadSignals = {
    perfTier: readAttr('data-perf-tier'),
    thermalState: readAttr('data-thermal-state'),
    hidden: typeof document !== 'undefined' ? !!document.hidden : false,
  };
  const policy = deriveWorkloadPolicy(signals);
  return { ...signals, policy, summary: summarize(signals, policy) };
}

/** Convenience: the current workload policy only. */
export function getWorkloadPolicy(): WorkloadPolicy {
  return getWorkloadStatus().policy;
}
