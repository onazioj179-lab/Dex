import { describe, it, expect } from 'vitest';
import { diffLines, diffStats } from '../../src/shared/uki/diffLines';

describe('diff lines', () => {
  it('diffs a single changed line', () => {
    expect(diffLines('a\nb\nc', 'a\nx\nc')).toEqual([
      { type: 'eq', line: 'a' },
      { type: 'del', line: 'b' },
      { type: 'add', line: 'x' },
      { type: 'eq', line: 'c' },
    ]);
  });

  it('handles pure add / pure delete', () => {
    expect(diffLines('', 'a')).toEqual([{ type: 'add', line: 'a' }]);
    expect(diffLines('a', '')).toEqual([{ type: 'del', line: 'a' }]);
    expect(diffLines('', '')).toEqual([]);
  });

  it('identical texts are all eq', () => {
    expect(diffLines('a\nb', 'a\nb').every((d) => d.type === 'eq')).toBe(true);
  });

  it('summarizes stats', () => {
    const d = diffLines('a\nb\nc', 'a\nx\nc');
    expect(diffStats(d)).toEqual({ added: 1, removed: 1, unchanged: 2 });
  });
});
