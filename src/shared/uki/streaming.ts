// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Async-iterator helpers for token streams. Pure — no network. The actual
 * streaming source plugs in via createStreamFromAsyncIterable.
 */

// DEX v3.8.9 - UKI brain: streaming

export type StreamChunkType = 'token' | 'toolCall' | 'done' | 'error';

export interface StreamChunk {
  type: StreamChunkType;
  content?: string;
  /** Present when type === 'toolCall'. Raw JSON string. */
  toolCallJson?: string;
  /** Present when type === 'error'. */
  error?: string;
}

export interface StreamReader {
  [Symbol.asyncIterator](): AsyncIterator<StreamChunk>;
}

/** Wrap an async iterable of chunks as a StreamReader. */
export function createStreamFromAsyncIterable(src: AsyncIterable<StreamChunk>): StreamReader {
  return { [Symbol.asyncIterator]: () => src[Symbol.asyncIterator]() };
}

/** Wrap a sync array as a StreamReader (test fixture). */
export function createStreamFromArray(chunks: StreamChunk[]): StreamReader {
  async function* gen(): AsyncIterator<StreamChunk> {
    for (const c of chunks) yield c;
  }
  return { [Symbol.asyncIterator]: gen };
}

/**
 * Drain a stream into a single string. Concatenates all 'token' contents.
 * Stops at 'done' or first 'error' (rethrown).
 */
export async function collectStream(reader: StreamReader): Promise<string> {
  let out = '';
  for await (const chunk of reader) {
    if (chunk.type === 'token' && chunk.content) out += chunk.content;
    else if (chunk.type === 'done') break;
    else if (chunk.type === 'error') throw new Error(chunk.error ?? 'stream error');
  }
  return out;
}

/**
 * Map every chunk through a transform; non-token types pass through.
 */
export function mapStream(
  reader: StreamReader,
  transform: (s: string) => string,
): StreamReader {
  async function* gen(): AsyncIterator<StreamChunk> {
    for await (const chunk of reader) {
      if (chunk.type === 'token' && chunk.content !== undefined) {
        yield { type: 'token', content: transform(chunk.content) };
      } else {
        yield chunk;
      }
    }
  }
  return { [Symbol.asyncIterator]: gen };
}

/**
 * Tee a stream callback for every chunk (e.g. to update UI). Returns a new
 * reader that yields the same chunks.
 */
export function teeStream(
  reader: StreamReader,
  onChunk: (c: StreamChunk) => void,
): StreamReader {
  async function* gen(): AsyncIterator<StreamChunk> {
    for await (const chunk of reader) {
      try { onChunk(chunk); } catch { /* observer must not break stream */ }
      yield chunk;
    }
  }
  return { [Symbol.asyncIterator]: gen };
}

/**
 * Extract tool-call JSON segments from an array of chunks.
 */
export function collectToolCalls(chunks: StreamChunk[]): string[] {
  return chunks.filter((c) => c.type === 'toolCall' && c.toolCallJson).map((c) => c.toolCallJson!);
}
