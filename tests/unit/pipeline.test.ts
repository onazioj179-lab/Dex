// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { runPipeline, composeSteps } from '../../src/shared/automation/pipeline';

describe('pipeline', () => {
  it('runs steps in order', () => {
    const r = runPipeline(2, [
      { name: 'double', run: (x: number) => x * 2 },
      { name: 'inc', run: (x: number) => x + 1 },
    ]);
    expect(r).toEqual({ value: 5, ok: true, completed: ['double', 'inc'] });
  });

  it('stops at the first failure and reports where', () => {
    const r = runPipeline(2, [
      { name: 'a', run: (x: number) => x },
      { name: 'boom', run: () => { throw new Error('nope'); } },
      { name: 'c', run: (x: number) => x + 100 },
    ]);
    expect(r.ok).toBe(false);
    expect(r.failedAt).toBe('boom');
    expect(r.error).toBe('nope');
    expect(r.completed).toEqual(['a']);
    expect(r.value).toBe(2);
  });

  it('composeSteps throws on failure, returns value on success', () => {
    const ok = composeSteps<number>([{ name: 'inc', run: (x) => x + 1 }]);
    expect(ok(1)).toBe(2);
    const bad = composeSteps<number>([{ name: 'boom', run: () => { throw new Error('x'); } }]);
    expect(() => bad(1)).toThrow(/pipeline failed at "boom"/);
  });
});
