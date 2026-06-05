// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { parseSSEChunk, SSEReader } from '../../src/shared/uki/sseParse';

describe('SSE parse', () => {
  it('extracts data payloads and detects done', () => {
    const r = parseSSEChunk('data: {"a":1}\ndata: {"b":2}\ndata: [DONE]\n');
    expect(r.events).toEqual(['{"a":1}', '{"b":2}']);
    expect(r.done).toBe(true);
  });

  it('ignores non-data lines and blanks', () => {
    const r = parseSSEChunk('event: foo\n\ndata: hi\n: comment\n');
    expect(r.events).toEqual(['hi']);
    expect(r.done).toBe(false);
  });

  it('SSEReader buffers payloads split across chunks', () => {
    const reader = new SSEReader();
    expect(reader.push('data: {"a"')).toEqual([]); // incomplete line
    expect(reader.push(':1}\n')).toEqual(['{"a":1}']);
    expect(reader.isDone()).toBe(false);
    expect(reader.push('data: [DONE]\n')).toEqual([]);
    expect(reader.isDone()).toBe(true);
  });
});
