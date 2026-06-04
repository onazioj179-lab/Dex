import { describe, it, expect } from 'vitest';
import { parseBytes, parseBytesOr } from '../../src/shared/format/byteParse';

describe('byte parse', () => {
  it('parses binary units', () => {
    expect(parseBytes('1.5 MB')).toBe(Math.round(1.5 * 1024 * 1024));
    expect(parseBytes('500kb')).toBe(500 * 1024);
    expect(parseBytes('2 GiB')).toBe(2 * 1024 ** 3);
    expect(parseBytes('1 b')).toBe(1);
  });

  it('treats a bare number as bytes', () => {
    expect(parseBytes('1024')).toBe(1024);
  });

  it('returns null for invalid input', () => {
    expect(parseBytes('abc')).toBeNull();
    expect(parseBytes('5 zz')).toBeNull();
    expect(parseBytes('')).toBeNull();
  });

  it('parseBytesOr falls back', () => {
    expect(parseBytesOr('nope', 4096)).toBe(4096);
    expect(parseBytesOr('1kb', 0)).toBe(1024);
  });
});
