// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Sequential async work queue. Tasks run one-at-a-time in FIFO order. Each
 * call to enqueue returns a promise that resolves with the task's result or
 * rejects with its error - independent of preceding tasks.
 */

type Task<T> = () => Promise<T>;

interface QueueItem {
  run: () => Promise<void>;
}

export class AsyncQueue {
  private readonly items: QueueItem[] = [];
  private running = false;

  enqueue<T>(task: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.items.push({
        run: async () => {
          try {
            const value = await task();
            resolve(value);
          } catch (err) {
            reject(err);
          }
        },
      });
      void this.tick();
    });
  }

  get pending(): number {
    return this.items.length + (this.running ? 1 : 0);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    const next = this.items.shift();
    if (!next) return;
    this.running = true;
    try {
      await next.run();
    } finally {
      this.running = false;
      if (this.items.length > 0) void this.tick();
    }
  }
}
