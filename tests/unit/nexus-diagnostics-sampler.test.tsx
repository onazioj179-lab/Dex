// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Nexus > Diagnostics live figures: a sample whose reply never arrives must not
// stop the sampler (the overlap guard used to wait on it forever).

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import NexusDiagnostics, { withTimeout } from '../../src/renderer/components/NexusDiagnostics';

const SELF = { available: true, processCount: 7, memoryMB: 912, hostMemoryMB: 60, cpuPercent: 3.2 };
const SYSTEM = { cpuPercent: 20, memoryPercent: 50, memoryUsedMB: 8192, memoryTotalMB: 16384 };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (window as unknown as { dex?: unknown }).dex;
});

describe('withTimeout', () => {
  it('passes values through, and turns failures and stalls into null', async () => {
    vi.useFakeTimers();
    await expect(withTimeout(Promise.resolve(5), 100)).resolves.toBe(5);
    await expect(withTimeout(Promise.reject(new Error('x')), 100)).resolves.toBeNull();
    const stalled = withTimeout(new Promise(() => undefined), 100);
    await vi.advanceTimersByTimeAsync(100);
    await expect(stalled).resolves.toBeNull();
  });
});

describe('Diagnostics sampler', () => {
  it('shows the figures after a first sample that never replies', async () => {
    vi.useFakeTimers();
    let selfCalls = 0;
    const invoke = vi.fn((channel: string) => {
      if (channel === 'xenon:selfSample') {
        selfCalls += 1;
        // The first reply is lost; later ones arrive.
        return selfCalls === 1 ? new Promise(() => undefined) : Promise.resolve(SELF);
      }
      if (channel === 'xenon:systemSample') return Promise.resolve(SYSTEM);
      return Promise.resolve(null);
    });
    (window as unknown as { dex: unknown }).dex = { invoke };

    render(<NexusDiagnostics />);
    // Resources pane (the default section): the "DEX memory" stat.
    const memory = () => screen.getByText('DEX memory').nextElementSibling?.textContent;
    expect(memory()).toBe('—');

    // Past the per-sample time box and the next 3 s tick.
    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });
    expect(selfCalls).toBeGreaterThan(1);
    expect(memory()).toBe('912 MB');
  });
});
