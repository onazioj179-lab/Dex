// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Filesystem adapter abstraction. The renderer should never touch fs directly;
 * production code passes a host-supplied implementation that bridges to a
 * permissioned IPC channel. Tests use the in-memory implementation.
 */

export interface FsAdapter {
  read(path: string): Promise<string>;
  write(path: string, contents: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  remove(path: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

export class InMemoryFsAdapter implements FsAdapter {
  private readonly store = new Map<string, string>();

  async read(path: string): Promise<string> {
    const v = this.store.get(path);
    if (v === undefined) throw new Error(`ENOENT: ${path}`);
    return v;
  }

  async write(path: string, contents: string): Promise<void> {
    this.store.set(path, contents);
  }

  async exists(path: string): Promise<boolean> {
    return this.store.has(path);
  }

  async remove(path: string): Promise<void> {
    this.store.delete(path);
  }

  async list(prefix: string): Promise<string[]> {
    const out: string[] = [];
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) out.push(k);
    }
    out.sort();
    return out;
  }

  /** Sync helper for setup; not part of the interface contract. */
  seed(entries: Record<string, string>): void {
    for (const [k, v] of Object.entries(entries)) this.store.set(k, v);
  }
}
