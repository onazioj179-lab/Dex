import { describe, it, expect } from 'vitest';
import { LwwMap, RgaText } from '../../src/shared/sync/crdt';

describe('CRDT — LwwMap', () => {
  it('two replicas converge', () => {
    const a = new LwwMap<string>('A');
    const b = new LwwMap<string>('B');
    const op1 = a.set('k', 'a-val');
    const op2 = b.set('k', 'b-val');
    a.apply(op2);
    b.apply(op1);
    expect(a.get('k')).toBe(b.get('k'));
  });
  it('delete after set wins by ts', () => {
    const a = new LwwMap<string>('A');
    a.set('k', 'v');
    a.del('k');
    expect(a.get('k')).toBeUndefined();
  });
});

describe('CRDT — RgaText', () => {
  it('insert characters', () => {
    const a = new RgaText('A');
    a.insert(-1, 'h');
    a.insert(0, 'i');
    expect(a.toString()).toBe('hi');
  });
  it('two replicas converge after concurrent inserts', () => {
    const a = new RgaText('A');
    const b = new RgaText('B');
    const op1 = a.insert(-1, 'x');
    const op2 = b.insert(-1, 'y');
    a.apply(op2);
    b.apply(op1);
    expect(a.toString()).toBe(b.toString());
  });
});
