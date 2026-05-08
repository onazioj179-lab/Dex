// =============================================================================
// DEX Platform — Track A2: resource governor
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Pure CPU/GPU/IO budget allocator across N running apps. Foreground app
 * gets a configurable bias; background apps share remainder by weight.
 * Caller (main process) maps the resulting allocations onto OS primitives
 * (cgroups, JobObject, nice). This module is the policy.
 */

export type AppWeight = 'critical' | 'normal' | 'low';

export interface AppLoad {
  appId: string;
  weight: AppWeight;
  /** True for the single foreground app this frame. */
  foreground: boolean;
  /** Last reported usage (informational, used for fairness). */
  cpuPctUsed: number;
  ramMbUsed: number;
  gpuMemMbUsed: number;
  /** True if app is currently suspended. Suspended apps get zero CPU. */
  suspended: boolean;
}

export interface GovernorPolicy {
  /** Share of total CPU reserved for the foreground app. 0..1. Default 0.7. */
  foregroundCpuBias: number;
  /** Total ceiling we are allowed to allocate. */
  totalCpuPct: number;     // usually 100 minus reserved system slice
  totalGpuMemMb: number;
  totalRamMb: number;
}

export interface AppAllocation {
  appId: string;
  cpuPct: number;
  gpuMemMb: number;
  ramMb: number;
  /** True if governor is asking the app to drop work this tick. */
  shed: boolean;
}

const WEIGHT_VALUE: Record<AppWeight, number> = { critical: 4, normal: 2, low: 1 };

export const DEFAULT_POLICY: GovernorPolicy = {
  foregroundCpuBias: 0.7,
  totalCpuPct: 90,
  totalGpuMemMb: 4096,
  totalRamMb: 8192,
};

export function allocate(loads: ReadonlyArray<AppLoad>, policy: GovernorPolicy = DEFAULT_POLICY): AppAllocation[] {
  if (loads.length === 0) return [];
  const fg = loads.find(l => l.foreground && !l.suspended);
  const bg = loads.filter(l => l !== fg && !l.suspended);
  const result: AppAllocation[] = [];

  // CPU split
  const fgCpuShare = fg ? policy.totalCpuPct * policy.foregroundCpuBias : 0;
  const bgCpuPool = policy.totalCpuPct - fgCpuShare;
  const bgWeightSum = bg.reduce((a, l) => a + WEIGHT_VALUE[l.weight], 0) || 1;

  // RAM/GPU split: by weight, foreground also gets bias.
  const ramFg = fg ? policy.totalRamMb * policy.foregroundCpuBias : 0;
  const ramPool = policy.totalRamMb - ramFg;
  const gpuFg = fg ? policy.totalGpuMemMb * policy.foregroundCpuBias : 0;
  const gpuPool = policy.totalGpuMemMb - gpuFg;

  if (fg) {
    result.push({
      appId: fg.appId,
      cpuPct: fgCpuShare,
      gpuMemMb: gpuFg,
      ramMb: ramFg,
      shed: false,
    });
  }
  for (const l of bg) {
    const w = WEIGHT_VALUE[l.weight] / bgWeightSum;
    const cpu = bgCpuPool * w;
    const gpu = gpuPool * w;
    const ram = ramPool * w;
    // Shed if app is asking for more than its allowed slice persistently.
    const shed = l.cpuPctUsed > cpu * 1.1 || l.ramMbUsed > ram * 1.1;
    result.push({ appId: l.appId, cpuPct: cpu, gpuMemMb: gpu, ramMb: ram, shed });
  }
  // Suspended apps get a zero allocation row so consumers can iterate uniformly.
  for (const l of loads.filter(x => x.suspended)) {
    result.push({ appId: l.appId, cpuPct: 0, gpuMemMb: 0, ramMb: 0, shed: true });
  }
  return result;
}

/** Pick the next app to evict when GPU memory is over the global ceiling. */
export function pickEvictionVictim(loads: ReadonlyArray<AppLoad>): string | null {
  const candidates = loads.filter(l => !l.foreground && !l.suspended);
  if (candidates.length === 0) return null;
  // Highest GPU mem usage among the lowest-weight candidates.
  candidates.sort((a, b) => {
    const wa = WEIGHT_VALUE[a.weight];
    const wb = WEIGHT_VALUE[b.weight];
    if (wa !== wb) return wa - wb;
    return b.gpuMemMbUsed - a.gpuMemMbUsed;
  });
  return candidates[0]!.appId;
}
