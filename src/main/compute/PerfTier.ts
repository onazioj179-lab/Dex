// =============================================================================
// DEX Platform — Wave 0.1
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0.
// =============================================================================
/**
 * PerfTier — classifies the host machine into a coarse performance tier so
 * every creative-app subsystem can pick consistent quality presets without
 * each one re-doing host detection.
 *
 * Tiers:
 *   ultra-low : 1–2 cores, no discrete GPU, < 4 GB RAM. Disable WebGPU
 *               effects, INT4 ONNX, no real-time scopes.
 *   low       : 4 cores, integrated GPU, 4–8 GB RAM. WebGPU on, INT8.
 *   mid       : 8 cores, discrete GPU, 8–16 GB RAM. Default target tier.
 *   high      : 16+ cores, RTX/M-series, 16–32 GB. FP16 ONNX, 4K real-time.
 *   workstation: 32+ cores, dual-GPU or NPU, 32+ GB. Path tracing on.
 *
 * Pure logic — no IPC, no DOM. Renderer reads tier via the IPC bridge.
 */

import * as os from 'os';

export type PerfTier = 'ultra-low' | 'low' | 'mid' | 'high' | 'workstation';

export interface HostInfo {
  /** Logical CPU count. */
  cores: number;
  /** Physical CPU count (best-effort: cores / 2 if SMT detected). */
  physicalCores: number;
  /** Total RAM in GB (rounded down). */
  ramGb: number;
  /** OS arch — 'x64' | 'arm64' | other. */
  arch: NodeJS.Architecture;
  /** OS platform — 'win32' | 'darwin' | 'linux'. */
  platform: NodeJS.Platform;
  /** Has discrete GPU (best-effort detection — overridable). */
  hasDiscreteGpu: boolean;
  /** Has NPU (Apple Neural Engine, Intel NPU, Qualcomm Hexagon). */
  hasNpu: boolean;
  /** SIMD capability flags. */
  simd: SimdCaps;
}

export interface SimdCaps {
  sse2: boolean;
  avx2: boolean;
  avx512: boolean;
  neon: boolean;
}

const FORCED_TIER_ENV = 'DEX_PERF_TIER';

let cachedHost: HostInfo | null = null;
let cachedTier: PerfTier | null = null;

/**
 * Detect host info. Result is cached for process lifetime.
 * `detectGpu` and `detectNpu` are passed by callers that have access to GPU
 * APIs (renderer side passes navigator.gpu probes; main side passes false
 * unless the system module reports a discrete adapter).
 */
export function detectHost(opts: {
  hasDiscreteGpu?: boolean;
  hasNpu?: boolean;
} = {}): HostInfo {
  if (cachedHost && opts.hasDiscreteGpu === undefined && opts.hasNpu === undefined) {
    return cachedHost;
  }
  const cpus = os.cpus();
  const cores = Math.max(1, cpus.length);
  // Heuristic: if model name suggests SMT/HT, halve.
  const model = cpus[0]?.model.toLowerCase() ?? '';
  const smt = /intel|amd ryzen|epyc|xeon/.test(model);
  const physicalCores = smt ? Math.max(1, Math.floor(cores / 2)) : cores;
  const ramGb = Math.floor(os.totalmem() / (1024 ** 3));
  const arch = os.arch() as NodeJS.Architecture;
  const platform = os.platform();

  const host: HostInfo = {
    cores,
    physicalCores,
    ramGb,
    arch,
    platform,
    hasDiscreteGpu: opts.hasDiscreteGpu ?? false,
    hasNpu: opts.hasNpu ?? (platform === 'darwin' && arch === 'arm64'),
    simd: detectSimd(arch, model),
  };
  cachedHost = host;
  cachedTier = null; // invalidate tier cache
  return host;
}

function detectSimd(arch: NodeJS.Architecture, model: string): SimdCaps {
  if (arch === 'arm64') {
    return { sse2: false, avx2: false, avx512: false, neon: true };
  }
  if (arch === 'x64' || arch === 'ia32') {
    // Coarse heuristic — accurate flag detection requires reading CPUID,
    // which is best done in the Rust side. We assume a modern x64 chip
    // supports SSE2 and AVX2; AVX-512 only on server/HEDT parts.
    const isServerOrHedt = /xeon|threadripper|epyc|i9-11|i9-12|i9-13|i9-14/.test(model);
    return { sse2: true, avx2: true, avx512: isServerOrHedt, neon: false };
  }
  return { sse2: false, avx2: false, avx512: false, neon: false };
}

/**
 * Classify host into PerfTier. Cached. Honors `DEX_PERF_TIER` env override
 * for testing/forcing a tier.
 */
export function getPerfTier(host?: HostInfo): PerfTier {
  const forced = process.env[FORCED_TIER_ENV];
  if (forced && isPerfTier(forced)) return forced;
  if (cachedTier && !host) return cachedTier;
  const h = host ?? detectHost();
  const tier = classifyTier(h);
  if (!host) cachedTier = tier;
  return tier;
}

function classifyTier(h: HostInfo): PerfTier {
  // Workstation: heavy iron with NPU or dual-GPU equivalent
  if (h.physicalCores >= 32 && h.ramGb >= 32 && h.hasDiscreteGpu) return 'workstation';
  // High: serious creator rig
  if (h.physicalCores >= 8 && h.ramGb >= 16 && h.hasDiscreteGpu) return 'high';
  // Mid: 8-core laptop with iGPU or 6-core dGPU
  if (h.physicalCores >= 6 && h.ramGb >= 8) return 'mid';
  // Low: typical 4-core laptop
  if (h.physicalCores >= 4 && h.ramGb >= 4) return 'low';
  return 'ultra-low';
}

function isPerfTier(s: string): s is PerfTier {
  return s === 'ultra-low' || s === 'low' || s === 'mid' || s === 'high' || s === 'workstation';
}

/** Quality preset hints for downstream subsystems. */
export interface TierPreset {
  webgpuEnabled: boolean;
  onnxQuant: 'fp32' | 'fp16' | 'int8' | 'int4';
  scopesFps: number;
  particleBudget: number;
  workerThreads: number;
  pathTracing: boolean;
  // Audio
  audioBufferSamples: number;
  // Image / video
  maxConcurrentRenders: number;
}

export function presetFor(tier: PerfTier, host?: HostInfo): TierPreset {
  const h = host ?? detectHost();
  const workers = Math.max(1, h.physicalCores - 1);
  switch (tier) {
    case 'ultra-low':
      return { webgpuEnabled: false, onnxQuant: 'int4', scopesFps: 0,
        particleBudget: 1_000, workerThreads: Math.min(workers, 1),
        pathTracing: false, audioBufferSamples: 2048, maxConcurrentRenders: 1 };
    case 'low':
      return { webgpuEnabled: true, onnxQuant: 'int8', scopesFps: 15,
        particleBudget: 10_000, workerThreads: Math.min(workers, 2),
        pathTracing: false, audioBufferSamples: 1024, maxConcurrentRenders: 1 };
    case 'mid':
      return { webgpuEnabled: true, onnxQuant: 'int8', scopesFps: 30,
        particleBudget: 50_000, workerThreads: Math.min(workers, 4),
        pathTracing: false, audioBufferSamples: 512, maxConcurrentRenders: 2 };
    case 'high':
      return { webgpuEnabled: true, onnxQuant: 'fp16', scopesFps: 60,
        particleBudget: 200_000, workerThreads: Math.min(workers, 8),
        pathTracing: false, audioBufferSamples: 256, maxConcurrentRenders: 4 };
    case 'workstation':
      return { webgpuEnabled: true, onnxQuant: 'fp16', scopesFps: 60,
        particleBudget: 1_000_000, workerThreads: workers,
        pathTracing: true, audioBufferSamples: 128, maxConcurrentRenders: 8 };
  }
}

/** Reset caches (test only). */
export function _resetForTest(): void {
  cachedHost = null;
  cachedTier = null;
}
