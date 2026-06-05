// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { emptyQueue, enqueue, peek, dequeue, size, isEmpty, toArray } from '../../src/shared/automation/queue';

describe('priority queue', () => {
  it('orders by priority then FIFO', () => {
    let q = emptyQueue<string>();
    q = enqueue(q, 'a', 1);
    q = enqueue(q, 'b', 2);
    q = enqueue(q, 'c', 1);
    expect(toArray(q)).toEqual(['b', 'a', 'c']); // b(2) first, then a,c FIFO at priority 1
    expect(peek(q)).toBe('b');
    expect(size(q)).toBe(3);
  });

  it('dequeues highest priority and returns a new queue', () => {
    let q = enqueue(enqueue(emptyQueue<string>(), 'low', 0), 'high', 5);
    const r = dequeue(q);
    expect(r.value).toBe('high');
    expect(toArray(r.queue)).toEqual(['low']);
    // original untouched (immutable)
    expect(size(q)).toBe(2);
  });

  it('handles empty queues', () => {
    const q = emptyQueue<number>();
    expect(isEmpty(q)).toBe(true);
    expect(peek(q)).toBeNull();
    expect(dequeue(q).value).toBeNull();
  });
});
