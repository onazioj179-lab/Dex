// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { emptySyncQueue, enqueue, pending, take, ack, type SyncOp } from '../../src/shared/sync/syncQueue';

const op = (id: string, entity: string, key: string, ts: number): SyncOp =>
  ({ id, entity, key, kind: 'set', value: `${key}${ts}`, ts, actor: 'x' });

describe('sync queue', () => {
  it('coalesces repeated edits to the same (entity,key), keeping the latest', () => {
    let q = enqueue(emptySyncQueue(), op('1', 'note', 'a', 1));
    q = enqueue(q, op('2', 'note', 'a', 2));
    expect(pending(q)).toBe(1);
    expect(q.ops[0].ts).toBe(2);
    expect(q.ops[0].id).toBe('2');
  });

  it('keeps the existing op when the incoming is older', () => {
    let q = enqueue(emptySyncQueue(), op('1', 'note', 'a', 5));
    q = enqueue(q, op('2', 'note', 'a', 3));
    expect(q.ops[0].ts).toBe(5);
  });

  it('appends distinct targets, takes oldest, and acks by id', () => {
    let q = emptySyncQueue();
    q = enqueue(q, op('1', 'note', 'a', 1));
    q = enqueue(q, op('2', 'note', 'b', 1));
    q = enqueue(q, op('3', 'task', 'c', 1));
    expect(pending(q)).toBe(3);
    expect(take(q, 2).map((o) => o.id)).toEqual(['1', '2']);
    q = ack(q, ['1', '2']);
    expect(pending(q)).toBe(1);
    expect(q.ops[0].id).toBe('3');
  });

  it('is immutable (original queue unchanged)', () => {
    const q0 = enqueue(emptySyncQueue(), op('1', 'note', 'a', 1));
    enqueue(q0, op('2', 'note', 'b', 1));
    expect(pending(q0)).toBe(1);
  });
});
