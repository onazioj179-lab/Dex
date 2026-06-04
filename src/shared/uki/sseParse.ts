// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Server-Sent Events parsing (UKI provider streaming). OpenAI/Anthropic-style
 * streaming responses arrive as `data: {...}` lines terminated by `data: [DONE]`.
 * This extracts the JSON payloads from a chunk of the stream and flags
 * completion. Pure: no DOM, no network — the transport layer feeds it text.
 */

export interface SSEParseResult {
  /** Raw `data:` payloads (excluding the [DONE] sentinel). */
  events: string[];
  /** True when a `[DONE]` sentinel was seen. */
  done: boolean;
}

/** Parse SSE `data:` lines out of a text chunk. */
export function parseSSEChunk(chunk: string): SSEParseResult {
  const events: string[] = [];
  let done = false;
  for (const rawLine of chunk.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (payload === '') continue;
    if (payload === '[DONE]') { done = true; continue; }
    events.push(payload);
  }
  return { events, done };
}

/**
 * Stateful incremental SSE reader: feed it chunks (which may split events across
 * boundaries); it buffers partial lines and yields complete `data:` payloads.
 */
export class SSEReader {
  private buffer = '';
  private finished = false;

  /** Feed a chunk; returns the complete payloads it unlocked. */
  push(chunk: string): string[] {
    this.buffer += chunk;
    const out: string[] = [];
    let nl: number;
    while ((nl = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, nl).trimEnd();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '') continue;
      if (payload === '[DONE]') { this.finished = true; continue; }
      out.push(payload);
    }
    return out;
  }

  /** True once a `[DONE]` sentinel has been read. */
  isDone(): boolean { return this.finished; }
}
