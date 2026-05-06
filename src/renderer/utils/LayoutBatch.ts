// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX -- Layout Batch Utility
 * Prevents layout thrashing by batching DOM reads and writes
 * into separate phases within a single animation frame.
 */

type ReadCallback = () => void;
type WriteCallback = () => void;

let pendingReads: ReadCallback[] = [];
let pendingWrites: WriteCallback[] = [];
let scheduled = false;

function flush(): void {
  scheduled = false;

  // Phase 1: Execute all reads first
  const reads = pendingReads;
  pendingReads = [];
  for (let i = 0; i < reads.length; i++) {
    try { reads[i](); } catch (e) {
      if (import.meta.env?.DEV) console.warn('[LayoutBatch] Read error:', e);
    }
  }

  // Phase 2: Execute all writes after reads
  const writes = pendingWrites;
  pendingWrites = [];
  for (let i = 0; i < writes.length; i++) {
    try { writes[i](); } catch (e) {
      if (import.meta.env?.DEV) console.warn('[LayoutBatch] Write error:', e);
    }
  }

  // If more work was scheduled during flush, run another frame
  if (pendingReads.length > 0 || pendingWrites.length > 0) {
    scheduleFlush();
  }
}

function scheduleFlush(): void {
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(flush);
  }
}

/**
 * Schedule a DOM read operation. All reads execute before any writes
 * in the same animation frame.
 */
export function batchRead(fn: ReadCallback): void {
  pendingReads.push(fn);
  scheduleFlush();
}

/**
 * Schedule a DOM write operation. Writes execute after all reads
 * in the same animation frame.
 */
export function batchWrite(fn: WriteCallback): void {
  pendingWrites.push(fn);
  scheduleFlush();
}

/**
 * Measure an element's layout properties safely within the read phase.
 * Returns a promise that resolves with the measured values.
 */
export function measure<T>(fn: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    batchRead(() => {
      try { resolve(fn()); } catch (e) { reject(e); }
    });
  });
}

/**
 * Mutate the DOM safely within the write phase.
 * Returns a promise that resolves when the write completes.
 */
export function mutate(fn: WriteCallback): Promise<void> {
  return new Promise((resolve, reject) => {
    batchWrite(() => {
      try { fn(); resolve(); } catch (e) { reject(e); }
    });
  });
}
