// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly terminate = vi.fn();
  readonly postMessage = vi.fn();

  constructor(_url: string) {
    FakeWorker.instances.push(this);
  }
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(async () => {
  const module = await import('../../src/renderer/services/WorkerPool');
  module.workerPool.terminate();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('WorkerPool lifecycle', () => {
  it('removes and reinstalls the visibility listener across restart', async () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const { WorkerPool } = await import('../../src/renderer/services/WorkerPool');
    const pool = new WorkerPool({ maxWorkers: 1, workerUrl: 'worker.js' });

    await pool.init();
    const visibilityHandler = add.mock.calls.filter(([type]) => type === 'visibilitychange').at(-1)?.[1];
    expect(visibilityHandler).toBeTypeOf('function');

    pool.terminate();
    expect(remove).toHaveBeenCalledWith('visibilitychange', visibilityHandler);

    await pool.init();
    expect(add.mock.calls.filter(([type]) => type === 'visibilitychange').length).toBeGreaterThanOrEqual(2);
    pool.terminate();
  });

  it('terminates a worker that exceeds its deadline instead of reusing it', async () => {
    vi.useFakeTimers();
    const { WorkerPool } = await import('../../src/renderer/services/WorkerPool');
    const pool = new WorkerPool({ maxWorkers: 1, workerUrl: 'worker.js', taskTimeout: 25 });

    const task = pool.submit('never-completes', {});
    const rejection = expect(task).rejects.toThrow('Task timeout');
  await Promise.resolve();
    const worker = FakeWorker.instances.at(-1);
    await vi.advanceTimersByTimeAsync(25);

    await rejection;
    expect(worker?.terminate).toHaveBeenCalledOnce();
    expect(pool.getStats()).toMatchObject({ totalWorkers: 0, busyWorkers: 0, pendingTasks: 0 });
    pool.terminate();
  });
});