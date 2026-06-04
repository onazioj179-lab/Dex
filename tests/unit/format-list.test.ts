import { describe, it, expect } from 'vitest';
import { joinWithAnd, summarizeList, pluralize } from '../../src/shared/format/list';

describe('format list', () => {
  it('joins with and', () => {
    expect(joinWithAnd([])).toBe('');
    expect(joinWithAnd(['a'])).toBe('a');
    expect(joinWithAnd(['a', 'b'])).toBe('a and b');
    expect(joinWithAnd(['a', 'b', 'c'])).toBe('a, b and c');
    expect(joinWithAnd(['a', 'b'], 'or')).toBe('a or b');
  });

  it('filters out blanks', () => {
    expect(joinWithAnd(['a', '', 'b'])).toBe('a and b');
  });

  it('summarizes with +N more', () => {
    expect(summarizeList(['a', 'b', 'c', 'd', 'e'], 3)).toBe('a, b, c +2 more');
    expect(summarizeList(['a', 'b'], 3)).toBe('a, b');
    expect(summarizeList([], 3)).toBe('');
    expect(summarizeList(['a', 'b', 'c'], 0)).toBe('3 items');
    expect(summarizeList(['a'], 0)).toBe('1 item');
  });

  it('pluralizes', () => {
    expect(pluralize(1, 'file')).toBe('1 file');
    expect(pluralize(3, 'file')).toBe('3 files');
    expect(pluralize(2, 'entry', 'entries')).toBe('2 entries');
  });
});
