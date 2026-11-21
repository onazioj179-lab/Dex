// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AsyncResourceTimeoutError, useAsyncResource } from '../../src/renderer/utils/useAsyncResource';

it('reports a timed-out request, cancels it and lets the user retry', async () => {
  vi.useFakeTimers();
  try {
    let firstSignal: AbortSignal | undefined;
    const load = vi.fn<(signal: AbortSignal) => Promise<string>>()
      .mockImplementationOnce(signal => {
        firstSignal = signal;
        return new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      })
      .mockResolvedValueOnce('loaded');
    const { result } = renderHook(() => useAsyncResource(load, { timeoutMs: 100 }));

    expect(result.current.loading).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(result.current.error).toBeInstanceOf(AsyncResourceTimeoutError);
    expect(result.current.loading).toBe(false);
    expect(firstSignal?.aborted).toBe(true);

    await act(async () => result.current.reload());
    expect(result.current.data).toBe('loaded');
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});
