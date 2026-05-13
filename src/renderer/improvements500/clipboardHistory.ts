// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Bounded ring buffer of recent clipboard items (in-memory only).
 * Used by the secureClipboard panel; never persisted to disk.
 */

export interface ClipEntry { id: string; text: string; ts: number; }

export class ClipboardHistory {
  private buf: ClipEntry[] = [];
  constructor(private readonly capacity = 20) {}

  push(text: string, ts: number = Date.now()): ClipEntry {
    const trimmed = text.length > 4000 ? text.slice(0, 4000) : text;
    const entry: ClipEntry = { id: `${ts}-${Math.random().toString(36).slice(2, 8)}`, text: trimmed, ts };
    // De-dupe consecutive equal entries.
    if (this.buf.length > 0 && this.buf[0].text === trimmed) return this.buf[0];
    this.buf.unshift(entry);
    if (this.buf.length > this.capacity) this.buf.length = this.capacity;
    return entry;
  }

  list(): readonly ClipEntry[] { return this.buf; }
  size(): number { return this.buf.length; }

  remove(id: string): boolean {
    const i = this.buf.findIndex((e) => e.id === id);
    if (i === -1) return false;
    this.buf.splice(i, 1);
    return true;
  }

  clear(): void { this.buf.length = 0; }
}
