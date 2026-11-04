// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// SystemTier
// ---------------------------------------------------------------------------
// Hardware-class detection. Emits one of {low, mid, high} based on CPU core
// count, RAM, and GPU class. Tier policy is purely about magnitudes — every
// visual effect stays on at every tier; only durations / blur radii / parallax
// depth scale. The tier is exposed three ways:
//   1. document.documentElement.dataset.tier = 'low' | 'mid' | 'high'
//   2. CSS variables --tier-blur-scale, --tier-anim-scale, --tier-shadow-scale
//   3. window event 'dex:system-tier' with detail = { tier, info }
//
// Anyone can subscribe via subscribeSystemTier(cb) — the callback is invoked
// immediately with the cached tier (default 'mid') and again whenever the
// detector resolves. Detection runs once per session; tier is intentionally
// not re-evaluated mid-run to avoid flicker.
// ---------------------------------------------------------------------------

export type SystemTierClass = 'low' | 'mid' | 'high';

export interface SystemTierInfo {
  tier: SystemTierClass;
  cores: number;
  totalRamGb: number;
  gpuModel: string;
  gpuVramMb: number;
  reason: string;
}

const DEFAULT_TIER: SystemTierClass = 'mid';

const tierPolicy: Record<SystemTierClass, { blur: number; anim: number; shadow: number }> = {
  low:  { blur: 0.5, anim: 0.7, shadow: 0.6 },
  mid:  { blur: 1.0, anim: 1.0, shadow: 1.0 },
  high: { blur: 1.2, anim: 1.0, shadow: 1.1 },
};

let cached: SystemTierInfo = {
  tier: DEFAULT_TIER,
  cores: 0,
  totalRamGb: 0,
  gpuModel: '',
  gpuVramMb: 0,
  reason: 'pending',
};

const listeners = new Set<(info: SystemTierInfo) => void>();
let detectionPromise: Promise<SystemTierInfo> | null = null;

function classify(cores: number, ramGb: number, gpu: { model: string; vramMb: number }): { tier: SystemTierClass; reason: string } {
  // Low: <=2 cores OR <=4GB RAM OR no real GPU info
  if (cores > 0 && cores <= 2) return { tier: 'low', reason: `cores=${cores}` };
  if (ramGb > 0 && ramGb <= 4) return { tier: 'low', reason: `ram=${ramGb}GB` };

  // High: discrete-class GPU markers + plenty of RAM
  const m = (gpu.model || '').toLowerCase();
  const hasDiscrete = /rtx|gtx 1[067]|gtx 2|radeon (rx|pro)|arc a[357]/.test(m) || gpu.vramMb >= 4096;
  if (hasDiscrete && ramGb >= 16 && cores >= 8) return { tier: 'high', reason: `gpu=${gpu.model || 'discrete'}` };

  // Mid is the safe default
  return { tier: 'mid', reason: 'default' };
}

function applyTier(info: SystemTierInfo): void {
  cached = info;
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.tier = info.tier;
    const p = tierPolicy[info.tier];
    document.documentElement.style.setProperty('--tier-blur-scale', String(p.blur));
    document.documentElement.style.setProperty('--tier-anim-scale', String(p.anim));
    document.documentElement.style.setProperty('--tier-shadow-scale', String(p.shadow));
  }
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('dex:system-tier', { detail: info }));
    } catch { /* intentional: CustomEvent unsupported in some test envs */ }
  }
  for (const cb of listeners) {
    try { cb(info); } catch { /* intentional: listener errors must not stop dispatch */ }
  }
}

export function getSystemTier(): SystemTierInfo {
  return cached;
}

export function subscribeSystemTier(cb: (info: SystemTierInfo) => void): () => void {
  listeners.add(cb);
  try { cb(cached); } catch { /* intentional: initial dispatch best-effort */ }
  return () => { listeners.delete(cb); };
}

export async function detectSystemTier(): Promise<SystemTierInfo> {
  if (detectionPromise) return detectionPromise;
  detectionPromise = (async () => {
    try {
      const api = (globalThis as any).dex?.diagnostics;
      const info: any = api?.getSystemInfo ? await api.getSystemInfo() : null;
      if (!info) {
        applyTier({ ...cached, reason: 'no-diagnostics-api' });
        return cached;
      }
      const cores: number = Number(info?.cpu?.cores) || 0;
      const totalRamGb: number = Number(info?.memory?.total) || 0;
      const firstGpu = Array.isArray(info?.graphics) && info.graphics.length > 0 ? info.graphics[0] : null;
      const gpuModel: string = String(firstGpu?.model || '');
      const gpuVramMb: number = Number(firstGpu?.vram) || 0;
      const { tier, reason } = classify(cores, totalRamGb, { model: gpuModel, vramMb: gpuVramMb });
      applyTier({ tier, cores, totalRamGb, gpuModel, gpuVramMb, reason });
      return cached;
    } catch (err) {
      applyTier({ ...cached, reason: `error:${String(err)}` });
      return cached;
    }
  })();
  return detectionPromise;
}

// Default tier policy (callers can read this for component-level adaption).
export function getTierPolicy(tier: SystemTierClass = cached.tier) {
  return { ...tierPolicy[tier] };
}
