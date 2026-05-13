// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * AsyncMutex: cooperative async mutual-exclusion lock. Acquirers wait in
 * FIFO order. `runExclusive` is the safe path; `acquire` is for advanced use.
 */

export interface MutexRelease {
  (): void;
}

export class AsyncMutex {
  private _locked = false;
  private readonly waiters: Array<(release: MutexRelease) => void> = [];

  get locked(): boolean {
    return this._locked;
  }

  acquire(): Promise<MutexRelease> {
    return new Promise<MutexRelease>((resolve) => {
      const tryGrant = (): void => {
        if (!this._locked) {
          this._locked = true;
          let released = false;
          const release: MutexRelease = () => {
            if (released) return;
            released = true;
            this._locked = false;
            const next = this.waiters.shift();
            if (next) {
              // Defer to a microtask to avoid stack growth.
              Promise.resolve().then(() => next(this.bindRelease()));
            }
          };
          resolve(release);
        } else {
          this.waiters.push(resolve);
        }
      };
      tryGrant();
    });
  }

  async runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private bindRelease(): MutexRelease {
    this._locked = true;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this._locked = false;
      const next = this.waiters.shift();
      if (next) Promise.resolve().then(() => next(this.bindRelease()));
    };
  }
}
