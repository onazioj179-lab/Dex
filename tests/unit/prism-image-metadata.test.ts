// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// PRISM image metadata reader: JPEG EXIF (camera, date, exposure, GPS
// presence), PNG dimensions, and safe handling of truncated input.
//
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readImageMetadata, formatExifDate } from '../../src/renderer/DEXAPPLICATIONS/prism/imageMetadata';

/** Build a big-endian JPEG with an APP1 EXIF block. */
function jpegWithExif(): ArrayBuffer {
  const make = 'Canon\0', model = 'EOS R6\0', date = '2024:05:01 10:20:30\0';
  // TIFF: header(8) + IFD0 (2 + 4*12 + 4) + EXIF IFD (2 + 3*12 + 4) + data
  const ifd0 = 8, ifd0Len = 2 + 4 * 12 + 4;
  const exif = ifd0 + ifd0Len, exifLen = 2 + 3 * 12 + 4;
  let data = exif + exifLen;
  const tiff: number[] = [];
  const u16 = (n: number) => tiff.push((n >> 8) & 255, n & 255);
  const u32 = (n: number) => tiff.push((n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255);
  const strs: number[] = [];
  const place = (s: string) => { const at = data + strs.length; for (const c of s) strs.push(c.charCodeAt(0)); return at; };
  tiff.push(0x4d, 0x4d); u16(42); u32(ifd0);
  const makeAt = place(make), modelAt = place(model), dateAt = place(date);
  const ratAt = data + strs.length; // exposure 1/250 then f/2.8 (28/10)
  [0, 0, 0, 1, 0, 0, 0, 250, 0, 0, 0, 28, 0, 0, 0, 10].forEach((b) => strs.push(b));
  u16(4);
  u16(0x010f); u16(2); u32(make.length); u32(makeAt);
  u16(0x0110); u16(2); u32(model.length); u32(modelAt);
  u16(0x8769); u16(4); u32(1); u32(exif);
  u16(0x8825); u16(4); u32(1); u32(0);
  u32(0);
  u16(3);
  u16(0x9003); u16(2); u32(date.length); u32(dateAt);
  u16(0x829a); u16(5); u32(1); u32(ratAt);
  u16(0x829d); u16(5); u32(1); u32(ratAt + 8);
  u32(0);
  const body = [...tiff, ...strs];
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...body]; // "Exif\0\0"
  const len = app1.length + 2;
  const bytes = [0xff, 0xd8, 0xff, 0xe1, (len >> 8) & 255, len & 255, ...app1,
    0xff, 0xc0, 0, 11, 8, 0x01, 0xe0, 0x02, 0x80, 3, 0, 0, 0, // SOF0: 480 x 640
    0xff, 0xda, 0, 2];
  return new Uint8Array(bytes).buffer;
}

describe('PRISM image metadata', () => {
  it('reads JPEG EXIF camera, date, exposure, size and GPS presence', () => {
    const m = readImageMetadata(jpegWithExif());
    expect(m.format).toBe('JPEG');
    expect(m.make).toBe('Canon');
    expect(m.model).toBe('EOS R6');
    expect(m.takenAt).toBe('2024:05:01 10:20:30');
    expect(m.exposure).toBe('1/250s');
    expect(m.fNumber).toBe('f/2.8');
    expect(m.hasLocation).toBe(true);
    expect([m.width, m.height]).toEqual([640, 480]);
  });

  it('reads PNG dimensions', () => {
    const b = new Uint8Array(24);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const v = new DataView(b.buffer);
    v.setUint32(16, 1920); v.setUint32(20, 1080);
    expect(readImageMetadata(b.buffer)).toMatchObject({ format: 'PNG', width: 1920, height: 1080, hasLocation: false });
  });

  it('never throws on truncated or junk data', () => {
    const full = new Uint8Array(jpegWithExif());
    for (const n of [0, 3, 10, 40, 90]) expect(() => readImageMetadata(full.slice(0, n).buffer)).not.toThrow();
    expect(readImageMetadata(new Uint8Array([1, 2, 3]).buffer).format).toBe('unknown');
  });

  it('formats EXIF dates', () => {
    expect(formatExifDate('2024:05:01 10:20:30')).toBe(new Date(2024, 4, 1, 10, 20).toLocaleString());
    expect(formatExifDate(undefined)).toBeUndefined();
  });
});
