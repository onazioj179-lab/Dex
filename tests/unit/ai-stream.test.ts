// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { createStreamParser, assembleStream } from '../../src/renderer/uki/providers/stream';
import { openaiProvider } from '../../src/renderer/uki/providers/openai';
import { ollamaProvider } from '../../src/renderer/uki/providers/ollama';

describe('AI streaming reader', () => {
  it('assembles an OpenAI SSE stream into full text', () => {
    const raw =
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n' +
      'data: [DONE]\n\n';
    expect(assembleStream(raw, 'sse', openaiProvider.parseStreamChunk)).toBe('Hello');
  });

  it('assembles an Ollama NDJSON stream', () => {
    const raw = '{"message":{"content":"a"}}\n{"message":{"content":"b"}}\n';
    expect(assembleStream(raw, 'ndjson', ollamaProvider.parseStreamChunk)).toBe('ab');
  });

  it('buffers a line split across chunk boundaries', () => {
    const p = createStreamParser('sse', openaiProvider.parseStreamChunk);
    // first chunk ends mid-line (no newline yet) → nothing emitted
    expect(p.push('data: {"choices":[{"delta":{"content":"Hi"}}]}')).toEqual([]);
    // newline arrives in the next chunk → the token completes
    expect(p.push('\n')).toEqual(['Hi']);
  });

  it('skips non-data SSE lines and [DONE]', () => {
    const p = createStreamParser('sse', openaiProvider.parseStreamChunk);
    expect(p.push('event: message\n: keep-alive comment\ndata: [DONE]\n')).toEqual([]);
  });

  it('flushes a trailing line without a newline', () => {
    const p = createStreamParser('ndjson', ollamaProvider.parseStreamChunk);
    expect(p.push('{"message":{"content":"x"}}')).toEqual([]); // no newline
    expect(p.flush()).toEqual(['x']);
  });
});
