// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * useHeavyCompute - Hook for offloading heavy computations to worker threads
 * 
 * Usage:
 * ```tsx
 * const { compute, isComputing, error } = useHeavyCompute();
 * 
 * // Apply image filter
 * const result = await compute('apply-image-filter', {
 *   imageData: Array.from(ctx.getImageData(0, 0, w, h).data),
 *   width: w,
 *   height: h,
 *   filter: 'grayscale'
 * });
 * ```
 */

import { useState, useCallback, useRef } from 'react';

type ComputeOperation =
  | 'apply-image-filter'
  | 'generate-waveform'
  | 'interpolate-keyframes'
  | 'transform-vertices'
  | 'batch-process';

interface ComputeResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  duration?: number;
}

/**
 * Hook for offloading heavy computations to the creative-processing worker
 */
export function useHeavyCompute() {
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const compute = useCallback(async <T = any>(
    operation: ComputeOperation,
    payload: Record<string, any>
  ): Promise<ComputeResult<T>> => {
    setIsComputing(true);
    setError(null);
    abortRef.current = false;

    const startTime = performance.now();

    try {
      const result = await window.dex?.invoke('thread:creative-processing', {
        type: operation,
        payload,
      });

      if (abortRef.current) {
        return { success: false, error: 'Operation aborted' };
      }

      const duration = performance.now() - startTime;

      if (result?.error) {
        setError(result.error);
        return { success: false, error: result.error, duration };
      }

      return { success: true, data: result?.payload as T, duration };
    } catch (err: any) {
      const errorMsg = err?.message || 'Computation failed';
      setError(errorMsg);
      return { success: false, error: errorMsg, duration: performance.now() - startTime };
    } finally {
      setIsComputing(false);
    }
  }, []);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  return { compute, isComputing, error, abort };
}

/**
 * Pre-warm the creative worker to reduce latency on first use
 */
export async function prewarmCreativeWorker(): Promise<void> {
  try {
    await window.dex?.invoke('thread:creative-processing', {
      type: 'heartbeat',
      payload: {},
    });
  } catch {
    // Worker not ready yet, ignore
  }
}

/**
 * Batch multiple operations for efficiency
 */
export async function batchCompute<T = any>(
  operations: Array<{
    type: ComputeOperation;
    payload: Record<string, any>;
  }>
): Promise<ComputeResult<T[]>> {
  const startTime = performance.now();

  try {
    const result = await window.dex?.invoke('thread:creative-processing', {
      type: 'batch-process',
      payload: { operations },
    });

    const duration = performance.now() - startTime;

    if (result.error) {
      return { success: false, error: result.error, duration };
    }

    return { success: true, data: result.payload?.results as T[], duration };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Batch computation failed', duration: performance.now() - startTime };
  }
}
