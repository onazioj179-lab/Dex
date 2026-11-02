// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Minimal, dependency-free image metadata reader for PRISM's Image info panel.
// Reads JPEG EXIF (camera, date taken, exposure, orientation, whether GPS
// location is present) and PNG / GIF / WebP dimensions. Never throws: bad or
// truncated data yields whatever was readable.
//

export interface ImageMetadata {
  format: string;
  width?: number;
  height?: number;
  make?: string;
  model?: string;
  takenAt?: string;
  orientation?: number;
  exposure?: string;
  fNumber?: string;
  iso?: number;
  focalLength?: string;
  software?: string;
  /** The file carries GPS location data (EXIF GPS IFD). */
  hasLocation: boolean;
}

const ascii = (v: DataView, off: number, len: number) => {
  let s = '';
  for (let i = 0; i < len && off + i < v.byteLength; i++) { const c = v.getUint8(off + i); if (c === 0) break; s += String.fromCharCode(c); }
  return s.trim();
};

function readExif(v: DataView, tiff: number, out: ImageMetadata): void {
  const le = v.getUint16(tiff) === 0x4949;
  const u16 = (o: number) => v.getUint16(o, le);
  const u32 = (o: number) => v.getUint32(o, le);
  if (u16(tiff + 2) !== 42) return;
  const typeSize: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const value = (entry: number) => {
    const type = u16(entry + 2), count = u32(entry + 4);
    const size = (typeSize[type] ?? 1) * count;
    const at = size <= 4 ? entry + 8 : tiff + u32(entry + 8);
    if (at + size > v.byteLength) return undefined;
    if (type === 2) return ascii(v, at, count);
    if (type === 3) return u16(at);
    if (type === 4) return u32(at);
    if (type === 5) { const n = u32(at), d = u32(at + 4); return d ? n / d : undefined; }
    return undefined;
  };
  const walk = (ifd: number, visit: (tag: number, entry: number) => void) => {
    if (ifd <= 0 || ifd + 2 > v.byteLength) return;
    const n = u16(ifd);
    for (let i = 0; i < n && ifd + 2 + i * 12 + 12 <= v.byteLength; i++) visit(u16(ifd + 2 + i * 12), ifd + 2 + i * 12);
  };
  let exifIfd = 0;
  walk(tiff + u32(tiff + 4), (tag, e) => {
    if (tag === 0x010f) out.make = value(e) as string;
    else if (tag === 0x0110) out.model = value(e) as string;
    else if (tag === 0x0112) out.orientation = value(e) as number;
    else if (tag === 0x0131) out.software = value(e) as string;
    else if (tag === 0x0132 && !out.takenAt) out.takenAt = value(e) as string;
    else if (tag === 0x8769) exifIfd = tiff + (value(e) as number);
    else if (tag === 0x8825) out.hasLocation = true;
  });
  walk(exifIfd, (tag, e) => {
    const val = value(e);
    if (tag === 0x9003 && typeof val === 'string') out.takenAt = val;
    else if (tag === 0x829a && typeof val === 'number') out.exposure = val >= 1 ? `${val}s` : `1/${Math.round(1 / val)}s`;
    else if (tag === 0x829d && typeof val === 'number') out.fNumber = `f/${Math.round(val * 10) / 10}`;
    else if (tag === 0x8827 && typeof val === 'number') out.iso = val;
    else if (tag === 0x920a && typeof val === 'number') out.focalLength = `${Math.round(val * 10) / 10} mm`;
    else if (tag === 0xa002 && typeof val === 'number') out.width = val;
    else if (tag === 0xa003 && typeof val === 'number') out.height = val;
  });
}

export function readImageMetadata(buf: ArrayBuffer): ImageMetadata {
  const v = new DataView(buf);
  const out: ImageMetadata = { format: 'unknown', hasLocation: false };
  try {
    if (v.byteLength >= 4 && v.getUint16(0) === 0xffd8) {
      out.format = 'JPEG';
      let off = 2;
      while (off + 4 <= v.byteLength) {
        if (v.getUint8(off) !== 0xff) break;
        const marker = v.getUint8(off + 1);
        const len = v.getUint16(off + 2);
        if (marker === 0xe1 && ascii(v, off + 4, 4) === 'Exif') readExif(v, off + 10, out);
        else if (marker >= 0xc0 && marker <= 0xc3 && off + 9 <= v.byteLength) { out.height = v.getUint16(off + 5); out.width = v.getUint16(off + 7); }
        if (marker === 0xda) break;
        off += 2 + len;
      }
    } else if (v.byteLength >= 24 && v.getUint32(0) === 0x89504e47) {
      out.format = 'PNG'; out.width = v.getUint32(16); out.height = v.getUint32(20);
    } else if (v.byteLength >= 10 && ascii(v, 0, 3) === 'GIF') {
      out.format = 'GIF'; out.width = v.getUint16(6, true); out.height = v.getUint16(8, true);
    } else if (v.byteLength >= 30 && ascii(v, 0, 4) === 'RIFF' && ascii(v, 8, 4) === 'WEBP') {
      out.format = 'WebP';
      if (ascii(v, 12, 4) === 'VP8X') { out.width = 1 + (v.getUint32(24, true) & 0xffffff); out.height = 1 + (v.getUint32(27, true) & 0xffffff); }
    }
  } catch { /* truncated or corrupt: return what we have */ }
  return out;
}

/** "2024:05:01 10:20:30" -> a locale date string (or the raw value). */
export function formatExifDate(s?: string): string | undefined {
  if (!s) return undefined;
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/.exec(s);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).toLocaleString() : s;
}
