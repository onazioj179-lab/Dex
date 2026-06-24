// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * On-device inference runtime abstraction (DEX_FEATURE_BACKLOG 04 · P1).
 *
 * A CPU / GPU / NPU runtime abstraction (Windows ML on-device APIs) the Smart
 * Router uses to decide WHICH local models a given machine can actually run well,
 * and on which compute tier. The actual kernel execution (DirectML / CoreML / NPU
 * EPs) lives in the native layer; this is the pure POLICY that maps a model's
 * runtime need + the detected device backends to a chosen tier — and gates local
 * models the device can't run at an acceptable speed.
 *
 * Important nuance from the research (do NOT overclaim): on commodity hardware an
 * NPU can be *power-efficient* without being *faster* than CPU/GPU for small SLMs
 * (Phi Silica numbers are Snapdragon-X-Elite-NPU lab figures). So tier selection
 * prefers an accelerator for routine work when present, but CPU is always a valid
 * fallback and large models stay gated off accelerator-less machines.
 *
 * Pure logic, fully unit-testable; the renderer/native layer supplies the detected
 * `DeviceRuntime`.
 */

export type ComputeBackend = 'cpu' | 'gpu' | 'npu';

/** What the host detected on this machine. CPU is always present. */
export interface DeviceRuntime {
  backends: ReadonlySet<ComputeBackend>;
  /** NPU throughput in TOPS, if an NPU is present (e.g. ~40 for Copilot+). */
  npuTops?: number;
}

/** A local model's preferred runtime + whether plain CPU is viable for it. */
export interface ModelRuntimeNeed {
  /** Best backend for this model (informational + tier preference). */
  preferred: ComputeBackend;
  /** Can it run at acceptable speed on CPU alone? Small SLMs: yes; big: no. */
  cpuViable: boolean;
  /** If it needs an NPU, the minimum TOPS to bother (else fall back). */
  minNpuTops?: number;
}

/** Runtime needs for known local model ids. Unknown ids get a safe default. */
const MODEL_RUNTIME: Record<string, ModelRuntimeNeed> = {
  // Small/quantised models run fine on CPU; an accelerator just helps power/latency.
  'mistral':  { preferred: 'gpu', cpuViable: true },
  'qwen2.5':  { preferred: 'gpu', cpuViable: true },
  'llama3.1': { preferred: 'gpu', cpuViable: false }, // 8B+ — needs an accelerator to be usable
};

/** Default for an unknown local model: assume small enough for CPU. */
export const DEFAULT_RUNTIME_NEED: ModelRuntimeNeed = { preferred: 'gpu', cpuViable: true };

export function getModelRuntimeNeed(modelId: string): ModelRuntimeNeed {
  return MODEL_RUNTIME[modelId] ?? DEFAULT_RUNTIME_NEED;
}

/** Ordering for "best available accelerator first". */
const TIER_RANK: Record<ComputeBackend, number> = { npu: 3, gpu: 2, cpu: 1 };

/**
 * Choose the compute tier this device should use for a model, or null if it cannot
 * run it at acceptable speed (a CPU-viable-false model on a CPU-only machine).
 *
 * Prefers an accelerator when present (power/latency win for routine work), honours
 * an NPU TOPS floor, and always allows CPU for cpu-viable models.
 */
export function selectComputeTier(device: DeviceRuntime, need: ModelRuntimeNeed): ComputeBackend | null {
  const has = (b: ComputeBackend) => device.backends.has(b);
  const npuOk = has('npu') && (need.minNpuTops === undefined || (device.npuTops ?? 0) >= need.minNpuTops);

  // Best accelerator first.
  if (npuOk && TIER_RANK[need.preferred] >= TIER_RANK.cpu) return 'npu';
  if (has('gpu')) return 'gpu';
  if (need.cpuViable) return 'cpu';
  return null; // can't run acceptably anywhere on this device
}

/** Whether a given local model id can run acceptably on this device. */
export function canRunLocalModel(device: DeviceRuntime, modelId: string): boolean {
  return selectComputeTier(device, getModelRuntimeNeed(modelId)) !== null;
}

/** A CPU-only fallback device descriptor (every machine has at least this). */
export const CPU_ONLY: DeviceRuntime = { backends: new Set<ComputeBackend>(['cpu']) };

/**
 * Detect the device runtime from a browser/renderer context (best-effort, sync
 * surface). WebGPU presence implies a usable GPU backend; NPU is not exposed to the
 * web platform, so it stays false unless the native layer reports it. Safe on any
 * host — defaults to CPU-only.
 */
export function detectBrowserRuntime(
  nav: { gpu?: unknown } | undefined = typeof navigator !== 'undefined' ? (navigator as unknown as { gpu?: unknown }) : undefined,
): DeviceRuntime {
  const backends = new Set<ComputeBackend>(['cpu']);
  if (nav && 'gpu' in nav && nav.gpu) backends.add('gpu');
  return { backends };
}

export function describeTier(tier: ComputeBackend | null): string {
  switch (tier) {
    case 'npu': return 'NPU (power-efficient on-device)';
    case 'gpu': return 'GPU (on-device)';
    case 'cpu': return 'CPU (on-device)';
    default: return 'not runnable on this device';
  }
}
