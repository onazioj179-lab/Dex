// =============================================================================
// DEX Platform — Wave 0 tests
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectHost, getPerfTier, presetFor, _resetForTest,
} from '../../src/main/compute/PerfTier';
import {
  pickBackend, isAvailable, disableBackend, enableBackend,
} from '../../src/main/compute/BackendSelector';
import { ComputeRouter } from '../../src/main/compute/ComputeRouter';

describe('PerfTier', () => {
  beforeEach(() => { _resetForTest(); delete process.env.DEX_PERF_TIER; });

  it('detects host info with sane defaults', () => {
    const h = detectHost();
    expect(h.cores).toBeGreaterThan(0);
    expect(h.physicalCores).toBeGreaterThan(0);
    expect(h.physicalCores).toBeLessThanOrEqual(h.cores);
    expect(typeof h.ramGb).toBe('number');
    expect(['win32','darwin','linux','freebsd','openbsd','sunos','aix','android','cygwin','netbsd','haiku']).toContain(h.platform);
  });

  it('classifies tiers monotonically', () => {
    expect(presetFor('ultra-low').particleBudget).toBeLessThan(presetFor('low').particleBudget);
    expect(presetFor('low').particleBudget).toBeLessThan(presetFor('mid').particleBudget);
    expect(presetFor('mid').particleBudget).toBeLessThan(presetFor('high').particleBudget);
    expect(presetFor('high').particleBudget).toBeLessThan(presetFor('workstation').particleBudget);
  });

  it('honors DEX_PERF_TIER env override', () => {
    process.env.DEX_PERF_TIER = 'workstation';
    expect(getPerfTier()).toBe('workstation');
    process.env.DEX_PERF_TIER = 'ultra-low';
    _resetForTest();
    expect(getPerfTier()).toBe('ultra-low');
  });

  it('ultra-low preset disables WebGPU and uses int4', () => {
    const p = presetFor('ultra-low');
    expect(p.webgpuEnabled).toBe(false);
    expect(p.onnxQuant).toBe('int4');
    expect(p.pathTracing).toBe(false);
  });

  it('workstation enables path tracing and uses fp16', () => {
    const p = presetFor('workstation');
    expect(p.pathTracing).toBe(true);
    expect(p.onnxQuant).toBe('fp16');
  });
});

describe('BackendSelector', () => {
  beforeEach(() => { _resetForTest(); delete process.env.DEX_PERF_TIER; });

  it('picks native-rust for FFT on main side', () => {
    const b = pickBackend('fft', { side: 'main' });
    expect(b).toBe('native-rust');
  });

  it('picks WebGPU for blur in renderer when available', () => {
    process.env.DEX_PERF_TIER = 'mid';
    _resetForTest();
    const b = pickBackend('blur-gaussian', { side: 'renderer', webgpuAvailable: true });
    expect(b).toBe('webgpu');
  });

  it('skips WebGPU on ultra-low tier', () => {
    process.env.DEX_PERF_TIER = 'ultra-low';
    _resetForTest();
    const b = pickBackend('blur-gaussian', { side: 'renderer', webgpuAvailable: true });
    expect(b).not.toBe('webgpu');
  });

  it('respects override when available', () => {
    const b = pickBackend('fft', { side: 'main', override: 'js' });
    expect(b).toBe('js');
  });

  it('disabled backends are unavailable', () => {
    disableBackend('webgpu');
    expect(isAvailable('webgpu', { side: 'renderer', webgpuAvailable: true })).toBe(false);
    enableBackend('webgpu');
    expect(isAvailable('webgpu', { side: 'renderer', webgpuAvailable: true })).toBe(true);
  });

  it('main side cannot use webgpu', () => {
    expect(isAvailable('webgpu', { side: 'main', webgpuAvailable: true })).toBe(false);
  });

  it('coreml only on darwin', () => {
    const winHost = { ...detectHost(), platform: 'win32' as const };
    expect(isAvailable('onnx-coreml', { side: 'main', host: winHost })).toBe(false);
  });
});

describe('ComputeRouter', () => {
  beforeEach(() => { ComputeRouter._resetForTest(); _resetForTest(); });

  it('runs registered handler on chosen backend', async () => {
    ComputeRouter.register<number, number>('fft', 'native-rust', (n) => n * 2);
    const out = await ComputeRouter.run<number, number>('fft', { side: 'main' }, 21);
    expect(out).toBe(42);
  });

  it('falls back to next backend when first throws', async () => {
    ComputeRouter.register<number, number>('fft', 'native-rust', () => { throw new Error('boom'); });
    ComputeRouter.register<number, number>('fft', 'js', (n) => n + 1);
    const out = await ComputeRouter.run<number, number>('fft', { side: 'main' }, 10);
    expect(out).toBe(11);
  });

  it('throws when no handler exists', async () => {
    await expect(ComputeRouter.run('blur-gaussian', { side: 'main' }, null)).rejects.toThrow(/no handler/);
  });
});
