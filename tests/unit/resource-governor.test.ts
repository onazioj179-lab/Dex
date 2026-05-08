import { describe, it, expect } from 'vitest';
import { allocate, pickEvictionVictim, type AppLoad, DEFAULT_POLICY } from '../../src/shared/runtime/resourceGovernor';

const fg: AppLoad = { appId: 'fg', weight: 'critical', foreground: true, cpuPctUsed: 10, ramMbUsed: 0, gpuMemMbUsed: 0, suspended: false };
const bg1: AppLoad = { appId: 'b1', weight: 'normal', foreground: false, cpuPctUsed: 5, ramMbUsed: 0, gpuMemMbUsed: 100, suspended: false };
const bg2: AppLoad = { appId: 'b2', weight: 'low', foreground: false, cpuPctUsed: 5, ramMbUsed: 0, gpuMemMbUsed: 800, suspended: false };

describe('resource governor', () => {
  it('foreground gets bias share', () => {
    const out = allocate([fg, bg1, bg2]);
    const fgAlloc = out.find(a => a.appId === 'fg')!;
    expect(fgAlloc.cpuPct).toBeCloseTo(DEFAULT_POLICY.totalCpuPct * 0.7);
  });
  it('suspended apps get zero', () => {
    const out = allocate([{ ...fg, suspended: true }, bg1]);
    expect(out.find(a => a.appId === 'fg')?.cpuPct).toBe(0);
  });
  it('eviction victim is lowest-weight, highest-gpu background', () => {
    expect(pickEvictionVictim([fg, bg1, bg2])).toBe('b2');
  });
});
