// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Newline-delimited JSON (NDJSON) chunked parser. Tolerates record boundaries
 * being split across chunks. Yields parsed objects per push and reports
 * malformed lines via the onError callback rather than throwing.
 */

export interface ChunkedJsonOptions {
  onError?: (line: string, err: unknown) => void;
  /** Maximum buffered bytes before pending data is dropped (defense). */
  maxBufferBytes?: number;
}

export class ChunkedJsonParser<T = unknown> {
  private buffer = '';
  private readonly onError?: (line: string, err: unknown) => void;
  private readonly maxBuf: number;

  constructor(opts: ChunkedJsonOptions = {}) {
    this.onError = opts.onError;
    this.maxBuf = opts.maxBufferBytes ?? 1024 * 1024;
  }

  push(chunk: string): T[] {
    this.buffer += chunk;
    if (this.buffer.length > this.maxBuf) {
      // Drop everything up to last newline to bound memory.
      const cut = this.buffer.lastIndexOf('\n');
      this.buffer = cut >= 0 ? this.buffer.slice(cut + 1) : '';
    }
    const out: T[] = [];
    let nl = this.buffer.indexOf('\n');
    while (nl !== -1) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (line.length > 0) {
        try {
          out.push(JSON.parse(line) as T);
        } catch (err) {
          this.onError?.(line, err);
        }
      }
      nl = this.buffer.indexOf('\n');
    }
    return out;
  }

  flush(): T[] {
    const tail = this.buffer.trim();
    this.buffer = '';
    if (tail.length === 0) return [];
    try {
      return [JSON.parse(tail) as T];
    } catch (err) {
      this.onError?.(tail, err);
      return [];
    }
  }
}
