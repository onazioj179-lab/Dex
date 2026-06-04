import { describe, it, expect } from 'vitest';
import { lwwSet, lwwMerge, lwwMapSet, lwwMapDelete, lwwMapMerge, lwwMapValues } from '../../src/shared/sync/lww';

describe('lww register', () => {
  it('higher timestamp wins (commutatively)', () => {
    const a = lwwSet('a', 1, 'x');
    const b = lwwSet('b', 2, 'y');
    expect(lwwMerge(a, b).value).toBe('b');
    expect(lwwMerge(b, a).value).toBe('b');
  });

  it('ties broken deterministically by actor id', () => {
    const a = lwwSet('a', 5, 'alice');
    const b = lwwSet('b', 5, 'bob');
    expect(lwwMerge(a, b).actor).toBe('bob'); // 'bob' > 'alice'
    expect(lwwMerge(b, a).actor).toBe('bob');
  });
});

describe('lww map', () => {
  it('per-key last-writer-wins with tombstone delete', () => {
    let m = lwwMapSet<string>({}, 'name', 'A', 1, 'x');
    m = lwwMapSet(m, 'name', 'B', 2, 'y'); // newer wins
    m = lwwMapSet(m, 'age', '30', 1, 'x');
    expect(lwwMapValues(m)).toEqual({ name: 'B', age: '30' });
    m = lwwMapDelete(m, 'age', 3, 'x');
    expect(lwwMapValues(m)).toEqual({ name: 'B' });
  });

  it('merge converges regardless of order (eventual consistency)', () => {
    let a = lwwMapSet<string>({}, 'k', 'a1', 1, 'x');
    a = lwwMapSet(a, 'only-a', 'x', 1, 'x');
    let b = lwwMapSet<string>({}, 'k', 'b2', 2, 'y');
    b = lwwMapSet(b, 'only-b', 'y', 1, 'y');
    const ab = lwwMapValues(lwwMapMerge(a, b));
    const ba = lwwMapValues(lwwMapMerge(b, a));
    expect(ab).toEqual(ba);
    expect(ab).toEqual({ k: 'b2', 'only-a': 'x', 'only-b': 'y' });
  });

  it('a newer set revives a deleted key (timestamp wins)', () => {
    let m = lwwMapSet<string>({}, 'k', 'v', 1, 'x');
    m = lwwMapDelete(m, 'k', 2, 'x');
    m = lwwMapSet(m, 'k', 'revived', 3, 'y');
    expect(lwwMapValues(m)).toEqual({ k: 'revived' });
  });
});
