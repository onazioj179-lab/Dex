import { describe, it, expect } from 'vitest';
import { naturalCompare, sortNatural } from '../../src/shared/format/naturalSort';

describe('natural sort', () => {
  it('orders numbers within strings numerically', () => {
    expect(naturalCompare('file2', 'file10')).toBeLessThan(0);
    expect(naturalCompare('file10', 'file2')).toBeGreaterThan(0);
    expect(naturalCompare('a', 'a')).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(naturalCompare('Apple', 'apple')).toBe(0);
  });

  it('shorter prefix sorts first', () => {
    expect(naturalCompare('img1', 'img1a')).toBeLessThan(0);
  });

  it('sorts an array naturally', () => {
    expect(sortNatural(['file10', 'file2', 'file1'])).toEqual(['file1', 'file2', 'file10']);
  });

  it('sorts by key extractor', () => {
    const items = [{ n: 'v10' }, { n: 'v2' }];
    expect(sortNatural(items, (x) => x.n).map((x) => x.n)).toEqual(['v2', 'v10']);
  });
});
