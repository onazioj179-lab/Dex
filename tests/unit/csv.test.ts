import { describe, it, expect } from 'vitest';
import { parseCsv, toCsv } from '../../src/shared/format/csv';

describe('csv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('parses quoted fields with delimiters and newlines', () => {
    expect(parseCsv('"x,y",z')).toEqual([['x,y', 'z']]);
    expect(parseCsv('"line1\nline2",b')).toEqual([['line1\nline2', 'b']]);
  });

  it('parses escaped quotes', () => {
    expect(parseCsv('"he said ""hi""",b')).toEqual([['he said "hi"', 'b']]);
  });

  it('handles CRLF and trailing newline', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('stringifies, quoting only when needed', () => {
    expect(toCsv([['a', 'b'], ['1', '2']])).toBe('a,b\n1,2');
    expect(toCsv([['has,comma', 'x']])).toBe('"has,comma",x');
    expect(toCsv([['quote"here']])).toBe('"quote""here"');
    expect(toCsv([[1, 2]])).toBe('1,2'); // numbers coerced
  });

  it('round-trips', () => {
    const rows = [['name', 'note'], ['Trailer', 'has, commas and "quotes"']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
