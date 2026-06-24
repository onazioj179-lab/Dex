// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// On-device inference runtime abstraction (DEX_FEATURE_BACKLOG 04). Verifies the
// CPU/GPU/NPU tier selection + local-model gating the Smart Router uses.
import { describe, it, expect } from 'vitest';
import {
  selectComputeTier, canRunLocalModel, getModelRuntimeNeed, detectBrowserRuntime,
  CPU_ONLY, describeTier, type DeviceRuntime, type ComputeBackend,
} from '../../src/shared/uki/deviceRuntime';
import { preferOnDeviceFirst, classifyTask } from '../../src/shared/uki/smartRouter';

const dev = (backends: ComputeBackend[], npuTops?: number): DeviceRuntime =>
  ({ backends: new Set(backends), npuTops });

describe('selectComputeTier', () => {
  it('prefers NPU when present and the TOPS floor is met', () => {
    expect(selectComputeTier(dev(['cpu', 'npu'], 40), { preferred: 'npu', cpuViable: true })).toBe('npu');
  });
  it('falls back below an unmet NPU TOPS floor', () => {
    const t = selectComputeTier(dev(['cpu', 'npu'], 10), { preferred: 'npu', cpuViable: true, minNpuTops: 30 });
    expect(t).toBe('cpu');
  });
  it('uses GPU when no NPU', () => {
    expect(selectComputeTier(dev(['cpu', 'gpu']), { preferred: 'gpu', cpuViable: false })).toBe('gpu');
  });
  it('returns null for a non-cpu-viable model on a CPU-only machine', () => {
    expect(selectComputeTier(CPU_ONLY, { preferred: 'gpu', cpuViable: false })).toBeNull();
  });
  it('allows CPU for a cpu-viable model on a CPU-only machine', () => {
    expect(selectComputeTier(CPU_ONLY, { preferred: 'gpu', cpuViable: true })).toBe('cpu');
  });
});

describe('canRunLocalModel', () => {
  it('gates a heavy model (llama3.1) off a CPU-only laptop', () => {
    expect(getModelRuntimeNeed('llama3.1').cpuViable).toBe(false);
    expect(canRunLocalModel(CPU_ONLY, 'llama3.1')).toBe(false);
    expect(canRunLocalModel(dev(['cpu', 'gpu']), 'llama3.1')).toBe(true);
  });
  it('lets small models run anywhere', () => {
    expect(canRunLocalModel(CPU_ONLY, 'mistral')).toBe(true);
    expect(canRunLocalModel(CPU_ONLY, 'unknown-tiny-model')).toBe(true);
  });
});

describe('preferOnDeviceFirst integration with the runtime gate', () => {
  const task = classifyTask('summarize this paragraph please');
  it('fronts a runnable local model for a routine task', () => {
    const out = preferOnDeviceFirst(['gpt-4o-mini', 'mistral'], task, (id) => canRunLocalModel(CPU_ONLY, id));
    expect(out[0]).toBe('mistral');
  });
  it('does NOT front a local model the device cannot run', () => {
    const out = preferOnDeviceFirst(['gpt-4o-mini', 'llama3.1'], task, (id) => canRunLocalModel(CPU_ONLY, id));
    expect(out[0]).toBe('gpt-4o-mini'); // llama3.1 stays at its ranked position
  });
});

describe('detectBrowserRuntime', () => {
  it('reports CPU-only when no WebGPU', () => {
    expect(detectBrowserRuntime({}).backends.has('gpu')).toBe(false);
  });
  it('adds GPU when navigator.gpu is present', () => {
    expect(detectBrowserRuntime({ gpu: {} }).backends.has('gpu')).toBe(true);
  });
  it('describeTier is human-readable', () => {
    expect(describeTier('npu')).toMatch(/NPU/);
    expect(describeTier(null)).toMatch(/not runnable/);
  });
});
