// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Streaming reader for AI providers. Turns a raw streamed body (SSE `data:`
 * lines for OpenAI/Anthropic/Google, or NDJSON for Ollama) into incremental
 * content tokens, buffering partial lines across network chunk boundaries. The
 * provider's `parseStreamChunk` extracts text from each event, so this stays
 * provider-agnostic. Pure: no DOM, no network — feed it chunks.
 */

export type StreamFormat = 'sse' | 'ndjson';
export type ParseChunk = (data: string) => string;

export interface StreamParser {
  /** Feed a raw chunk; returns content tokens completed by it. */
  push(chunk: string): string[];
  /** Flush any buffered remainder at end-of-stream. */
  flush(): string[];
}

/** A stateful parser that handles partial lines split across chunks. */
export function createStreamParser(format: StreamFormat, parseChunk: ParseChunk): StreamParser {
  let buffer = '';

  const emit = (rawLine: string): string | null => {
    const line = rawLine.trim();
    if (line === '') return null;
    if (format === 'sse') {
      if (!line.startsWith('data:')) return null; // skip event:/id:/comments
      const data = line.slice(5).trim();
      if (data === '' || data === '[DONE]') return null;
      const t = parseChunk(data);
      return t || null;
    }
    // ndjson — one JSON object per line
    const t = parseChunk(line);
    return t || null;
  };

  return {
    push(chunk: string): string[] {
      buffer += chunk;
      const out: string[] = [];
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        const t = emit(line);
        if (t) out.push(t);
      }
      return out;
    },
    flush(): string[] {
      if (buffer === '') return [];
      const t = emit(buffer);
      buffer = '';
      return t ? [t] : [];
    },
  };
}

/** Assemble a full raw stream body into the complete text (one-shot). */
export function assembleStream(raw: string, format: StreamFormat, parseChunk: ParseChunk): string {
  const p = createStreamParser(format, parseChunk);
  return [...p.push(raw), ...p.flush()].join('');
}
