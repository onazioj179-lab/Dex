// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  parseCookies,
  serializeCookie,
  sanitizeFilenameStrict,
  encodeHex,
  decodeHex,
  parseIPv4,
  isIPv4,
  formatIPv4,
  parseIPv6,
  isIPv6,
  formatIPv6,
  jwtDecodeNoVerify,
  parseUrlExtended,
  buildUrlExtended,
  objectToFormData,
  formDataToObject,
  csvWrite,
  asciiTable,
  mdSerialize,
} from '../../src/renderer/improvements500';

describe('cookieParse', () => {
  it('parses simple cookie header', () => {
    expect(parseCookies('a=1; b=two; c=hello%20world')).toEqual({ a: '1', b: 'two', c: 'hello world' });
  });
  it('handles quoted values and bare names', () => {
    const out = parseCookies('flag; q="quoted value"');
    expect(out.flag).toBe('');
    expect(out.q).toBe('quoted value');
  });
  it('serializeCookie composes attributes', () => {
    const s = serializeCookie('sid', 'abc 123', { path: '/', httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 60 });
    expect(s.startsWith('sid=abc%20123')).toBe(true);
    expect(s).toContain('Path=/');
    expect(s).toContain('HttpOnly');
    expect(s).toContain('Secure');
    expect(s).toContain('SameSite=Lax');
    expect(s).toContain('Max-Age=60');
  });
  it('rejects invalid name', () => {
    expect(() => serializeCookie('bad name', 'x')).toThrow();
  });
});

describe('sanitizeFilenameStrict', () => {
  it('strips reserved chars and trailing dots/spaces', () => {
    expect(sanitizeFilenameStrict('a/b<c>.txt ')).toBe('a_b_c_.txt');
    expect(sanitizeFilenameStrict('foo...   ')).toBe('foo');
  });
  it('escapes Windows reserved names', () => {
    expect(sanitizeFilenameStrict('CON')).toBe('_CON');
    expect(sanitizeFilenameStrict('com1.txt')).toBe('_com1.txt');
  });
  it('truncates and preserves extension', () => {
    const longName = `${'a'.repeat(300)}.txt`;
    const out = sanitizeFilenameStrict(longName, { maxLength: 20 });
    expect(out.length).toBe(20);
    expect(out.endsWith('.txt')).toBe(true);
  });
  it('falls back to untitled for empty', () => {
    expect(sanitizeFilenameStrict('   ')).toBe('untitled');
  });
});

describe('hexCodec', () => {
  it('round-trips bytes', () => {
    const b = new Uint8Array([0, 1, 16, 255, 128]);
    const enc = encodeHex(b);
    expect(enc).toBe('000110ff80');
    expect(Array.from(decodeHex(enc))).toEqual(Array.from(b));
  });
  it('upper option', () => {
    expect(encodeHex(new Uint8Array([10, 11]), true)).toBe('0A0B');
  });
  it('rejects bad hex', () => {
    expect(() => decodeHex('zz')).toThrow();
    expect(() => decodeHex('abc')).toThrow();
  });
});

describe('ipParse', () => {
  it('IPv4 valid and invalid', () => {
    expect(Array.from(parseIPv4('192.168.1.1')!)).toEqual([192, 168, 1, 1]);
    expect(parseIPv4('256.0.0.1')).toBeNull();
    expect(parseIPv4('01.2.3.4')).toBeNull(); // leading zeros not allowed
    expect(parseIPv4('1.2.3')).toBeNull();
    expect(isIPv4('10.0.0.1')).toBe(true);
    expect(formatIPv4(new Uint8Array([1, 2, 3, 4]))).toBe('1.2.3.4');
  });
  it('IPv6 valid forms', () => {
    expect(parseIPv6('::1')).not.toBeNull();
    expect(parseIPv6('2001:db8::1')).not.toBeNull();
    expect(parseIPv6('::ffff:192.0.2.1')).not.toBeNull();
    expect(parseIPv6('2001:db8::g')).toBeNull();
    expect(parseIPv6('1::2::3')).toBeNull();
    expect(isIPv6('::1')).toBe(true);
  });
  it('IPv6 format roundtrip with :: compression', () => {
    const bytes = parseIPv6('2001:db8:0:0:0:0:0:1');
    expect(bytes).not.toBeNull();
    expect(formatIPv6(bytes!)).toBe('2001:db8::1');
  });
});

describe('jwtDecodeNoVerify', () => {
  it('decodes header and payload', () => {
    // header: {"alg":"none","typ":"JWT"} payload: {"sub":"42","name":"Ada"}
    const token = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiI0MiIsIm5hbWUiOiJBZGEifQ.sig';
    const d = jwtDecodeNoVerify<{ alg: string; typ: string }, { sub: string; name: string }>(token);
    expect(d.header.alg).toBe('none');
    expect(d.payload.sub).toBe('42');
    expect(d.payload.name).toBe('Ada');
    expect(d.signature).toBe('sig');
  });
  it('rejects malformed', () => {
    expect(() => jwtDecodeNoVerify('a.b')).toThrow();
    expect(() => jwtDecodeNoVerify('!!.bb.cc')).toThrow();
  });
});

describe('urlParseExtended', () => {
  it('parses and rebuilds', () => {
    const url = 'https://user:pw@example.com:8443/a/b?x=1&y=2&y=3#frag';
    const p = parseUrlExtended(url);
    expect(p.protocol).toBe('https:');
    expect(p.username).toBe('user');
    expect(p.hostname).toBe('example.com');
    expect(p.port).toBe('8443');
    expect(p.pathname).toBe('/a/b');
    expect(p.query.x).toBe('1');
    expect(p.query.y).toEqual(['2', '3']);
    expect(p.hash).toBe('#frag');
    const built = buildUrlExtended(p);
    const re = parseUrlExtended(built);
    expect(re.hostname).toBe('example.com');
    expect(re.query.y).toEqual(['2', '3']);
  });
});

describe('formData', () => {
  it('roundtrips object <-> form-encoded', () => {
    const enc = objectToFormData({ a: 1, b: 'two three', tags: ['x', 'y'] });
    const back = formDataToObject(enc);
    expect(back.a).toBe('1');
    expect(back.b).toBe('two three');
    expect(back.tags).toEqual(['x', 'y']);
  });
  it('skips null/undefined', () => {
    const enc = objectToFormData({ keep: 'yes', drop: null, gone: undefined });
    expect(enc.includes('drop')).toBe(false);
    expect(enc.includes('gone')).toBe(false);
  });
});

describe('csvWrite', () => {
  it('writes header and rows with quoting', () => {
    const out = csvWrite([
      { name: 'Ada, the great', age: 42 },
      { name: 'Bob "Bee"', age: 7 },
    ]);
    expect(out).toContain('"Ada, the great"');
    expect(out).toContain('"Bob ""Bee"""');
  });
  it('neutralizes formula injection', () => {
    const out = csvWrite([{ cell: '=SUM(A1)' }]);
    expect(out).toContain("'=SUM(A1)");
  });
});

describe('asciiTable', () => {
  it('renders headered table', () => {
    const out = asciiTable(
      [['1', 'Ada'], ['2', 'Bob']],
      { header: ['id', 'name'] },
    );
    const lines = out.split('\n');
    expect(lines[0]).toBe('+----+------+');
    expect(lines[1]).toContain('| id | name |');
  });
  it('right alignment', () => {
    const out = asciiTable([['1'], ['100']], { header: ['n'], align: ['right'] });
    expect(out).toContain('|   n |');
    expect(out).toContain('|   1 |');
    expect(out).toContain('| 100 |');
  });
});

describe('mdSerialize', () => {
  it('renders headings, lists, code, blockquote, hr', () => {
    const out = mdSerialize([
      { type: 'heading', level: 2, text: 'Title' },
      { type: 'paragraph', text: 'Hello.' },
      { type: 'bulletList', items: ['a', 'b'] },
      { type: 'orderedList', items: ['one', 'two'], start: 3 },
      { type: 'codeBlock', lang: 'ts', code: 'const x = 1;' },
      { type: 'blockquote', text: 'line 1\nline 2' },
      { type: 'hr' },
    ]);
    expect(out).toContain('## Title');
    expect(out).toContain('- a');
    expect(out).toContain('3. one');
    expect(out).toContain('4. two');
    expect(out).toContain('```ts');
    expect(out).toContain('> line 1');
    expect(out).toContain('> line 2');
    expect(out).toContain('---');
  });
});
