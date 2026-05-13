// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Generic worker pool with bounded concurrency (T6 perf — offload heavy
 * compute, T6-031 IPC backpressure pattern).
 *
 * Task functions return promises; the pool runs at most `concurrency`
 * tasks at once and queues the rest in FIFO order.
 */

export interface PoolStats { running: number; queued: number; completed: number; }

export class WorkerPool {
  private running = 0;
  private completed = 0;
  private queue: Array<() => void> = [];
  constructor(private readonly concurrency: number) {
    if (concurrency < 1) throw new Error('concurrency must be >= 1');
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.running++;
        Promise.resolve()
          .then(task)
          .then(
            (val) => { resolve(val); this.finish(); },
            (err) => { reject(err); this.finish(); },
          );
      };
      if (this.running < this.concurrency) start();
      else this.queue.push(start);
    });
  }

  private finish(): void {
    this.running--;
    this.completed++;
    const next = this.queue.shift();
    if (next) next();
  }

  stats(): PoolStats {
    return { running: this.running, queued: this.queue.length, completed: this.completed };
  }

  /** Drain — resolves once everything in flight finishes. */
  async drain(): Promise<void> {
    while (this.running > 0 || this.queue.length > 0) {
      await new Promise<void>((r) => setTimeout(r, 4));
    }
  }
}
