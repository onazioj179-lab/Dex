// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Lightweight EXIF parser for JPEG files.
 * Reads EXIF data from ArrayBuffer without external dependencies.
 * Supports camera, lens, ISO, aperture, shutter speed, GPS, dimensions.
 */

export interface ExifData {
  camera?: string;
  lens?: string;
  iso?: string;
  aperture?: string;
  shutterSpeed?: string;
  focalLength?: string;
  gpsLat?: number;
  gpsLon?: number;
  width?: number;
  height?: number;
  orientation?: number;
  dateTime?: string;
  software?: string;
  colorSpace?: string;
}

// EXIF tag IDs
const TAGS: Record<number, string> = {
  0x010f: 'make',
  0x0110: 'model',
  0x0112: 'orientation',
  0x011a: 'xResolution',
  0x011b: 'yResolution',
  0x0131: 'software',
  0x0132: 'dateTime',
  0x8769: 'exifIFD',
  0x8825: 'gpsIFD',
  // EXIF sub-IFD tags
  0x829a: 'exposureTime',
  0x829d: 'fNumber',
  0x8827: 'isoSpeedRatings',
  0x9003: 'dateTimeOriginal',
  0x920a: 'focalLength',
  0xa001: 'colorSpace',
  0xa002: 'pixelXDimension',
  0xa003: 'pixelYDimension',
  0xa434: 'lensModel',
  0xa435: 'lensSerialNumber',
};

// GPS tag IDs
const GPS_TAGS: Record<number, string> = {
  0x0001: 'latitudeRef',
  0x0002: 'latitude',
  0x0003: 'longitudeRef',
  0x0004: 'longitude',
};

function readString(view: DataView, offset: number, length: number): string {
  let str = '';
  for (let i = 0; i < length; i++) {
    const c = view.getUint8(offset + i);
    if (c === 0) break;
    str += String.fromCharCode(c);
  }
  return str.trim();
}

function readRational(view: DataView, offset: number, littleEndian: boolean): number {
  const numerator = view.getUint32(offset, littleEndian);
  const denominator = view.getUint32(offset + 4, littleEndian);
  return denominator === 0 ? 0 : numerator / denominator;
}

function readIFD(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  littleEndian: boolean,
  tagMap: Record<number, string>,
): Record<string, any> {
  const result: Record<string, any> = {};
  const count = view.getUint16(tiffStart + ifdOffset, littleEndian);

  for (let i = 0; i < count; i++) {
    const entryOffset = tiffStart + ifdOffset + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;

    const tag = view.getUint16(entryOffset, littleEndian);
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const numValues = view.getUint32(entryOffset + 4, littleEndian);
    const valueOffset = entryOffset + 8;

    const name = tagMap[tag];
    if (!name) continue;

    // Type sizes: 1=BYTE, 2=ASCII, 3=SHORT, 4=LONG, 5=RATIONAL
    const typeSize: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 10: 8 };
    const totalSize = (typeSize[type] || 1) * numValues;
    const dataOffset = totalSize > 4
      ? tiffStart + view.getUint32(valueOffset, littleEndian)
      : valueOffset;

    if (dataOffset + totalSize > view.byteLength) continue;

    switch (type) {
      case 2: // ASCII
        result[name] = readString(view, dataOffset, numValues);
        break;
      case 3: // SHORT
        result[name] = numValues === 1
          ? view.getUint16(dataOffset, littleEndian)
          : Array.from({ length: numValues }, (_, j) => view.getUint16(dataOffset + j * 2, littleEndian));
        break;
      case 4: // LONG
        result[name] = numValues === 1
          ? view.getUint32(dataOffset, littleEndian)
          : Array.from({ length: numValues }, (_, j) => view.getUint32(dataOffset + j * 4, littleEndian));
        break;
      case 5: // RATIONAL
        if (numValues === 1) {
          result[name] = readRational(view, dataOffset, littleEndian);
        } else {
          result[name] = Array.from({ length: numValues }, (_, j) =>
            readRational(view, dataOffset + j * 8, littleEndian));
        }
        break;
      default:
        if (numValues === 1 && type === 1) {
          result[name] = view.getUint8(dataOffset);
        }
        break;
    }
  }

  return result;
}

function dmsToDecimal(dms: number[], ref: string): number {
  if (!dms || dms.length < 3) return 0;
  const decimal = dms[0] + dms[1] / 60 + dms[2] / 3600;
  return (ref === 'S' || ref === 'W') ? -decimal : decimal;
}

function formatShutterSpeed(exposureTime: number): string {
  if (exposureTime >= 1) return `${exposureTime}s`;
  const denominator = Math.round(1 / exposureTime);
  return `1/${denominator}s`;
}

/**
 * Parse EXIF data from a JPEG ArrayBuffer.
 * Only reads the first 128KB (EXIF data is always near the start).
 */
export function parseExif(buffer: ArrayBuffer): ExifData | null {
  const view = new DataView(buffer);

  // Check JPEG SOI marker
  if (view.getUint16(0) !== 0xFFD8) return null;

  // Find APP1 marker (EXIF)
  let offset = 2;
  const maxSearch = Math.min(buffer.byteLength, 131072); // 128KB limit

  while (offset < maxSearch - 4) {
    const marker = view.getUint16(offset);
    if (marker === 0xFFE1) break; // APP1
    if ((marker & 0xFF00) !== 0xFF00) return null; // Not a valid marker
    const segmentLength = view.getUint16(offset + 2);
    offset += 2 + segmentLength;
  }

  if (offset >= maxSearch - 4) return null;

  // Read APP1 segment
  const app1Length = view.getUint16(offset + 2);
  const app1Start = offset + 4;

  // Verify "Exif\0\0" header
  if (readString(view, app1Start, 4) !== 'Exif') return null;

  const tiffStart = app1Start + 6;
  const tiffEnd = Math.min(app1Start + app1Length, view.byteLength);

  if (tiffStart + 8 > tiffEnd) return null;

  // Read byte order
  const byteOrder = view.getUint16(tiffStart);
  const littleEndian = byteOrder === 0x4949; // 'II'

  // Verify TIFF magic number
  if (view.getUint16(tiffStart + 2, littleEndian) !== 0x002A) return null;

  // Read IFD0 offset
  const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian);
  const ifd0 = readIFD(view, tiffStart, ifd0Offset, littleEndian, TAGS);

  const exifData: ExifData = {};

  // Camera make/model
  const make = ifd0.make || '';
  const model = ifd0.model || '';
  if (make || model) {
    // Avoid duplicating make in camera string if model already contains it
    exifData.camera = model.startsWith(make) ? model : `${make} ${model}`.trim();
  }

  exifData.orientation = ifd0.orientation;
  exifData.dateTime = ifd0.dateTimeOriginal || ifd0.dateTime;
  exifData.software = ifd0.software;

  // Read EXIF sub-IFD
  if (ifd0.exifIFD && typeof ifd0.exifIFD === 'number') {
    const exifSub = readIFD(view, tiffStart, ifd0.exifIFD, littleEndian, TAGS);

    if (exifSub.exposureTime) {
      exifData.shutterSpeed = formatShutterSpeed(exifSub.exposureTime);
    }
    if (exifSub.fNumber) {
      exifData.aperture = `f/${exifSub.fNumber}`;
    }
    if (exifSub.isoSpeedRatings != null) {
      exifData.iso = String(exifSub.isoSpeedRatings);
    }
    if (exifSub.focalLength) {
      exifData.focalLength = `${Math.round(exifSub.focalLength)}mm`;
    }
    if (exifSub.lensModel) {
      exifData.lens = exifSub.lensModel;
    }
    if (exifSub.pixelXDimension) exifData.width = exifSub.pixelXDimension;
    if (exifSub.pixelYDimension) exifData.height = exifSub.pixelYDimension;
    if (exifSub.colorSpace === 1) exifData.colorSpace = 'sRGB';
    else if (exifSub.colorSpace === 65535) exifData.colorSpace = 'Uncalibrated';
    exifData.dateTime = exifSub.dateTimeOriginal || exifData.dateTime;
  }

  // Read GPS IFD
  if (ifd0.gpsIFD && typeof ifd0.gpsIFD === 'number') {
    const gps = readIFD(view, tiffStart, ifd0.gpsIFD, littleEndian, GPS_TAGS);

    if (gps.latitude && gps.latitudeRef) {
      exifData.gpsLat = dmsToDecimal(gps.latitude, gps.latitudeRef);
    }
    if (gps.longitude && gps.longitudeRef) {
      exifData.gpsLon = dmsToDecimal(gps.longitude, gps.longitudeRef);
    }
  }

  return exifData;
}

/**
 * Load EXIF data from a file path (Electron file:// or local path).
 * Reads only the first 128KB of the file for EXIF parsing.
 */
export async function loadExifFromPath(filePath: string): Promise<ExifData | null> {
  try {
    // Use Electron IPC to read the first 128KB
    if (window.dex?.invoke) {
      const buffer = await window.dex.invoke('fs:readFileHead', fileUrlToPath(filePath), 131072);
      if (buffer instanceof ArrayBuffer) {
        return parseExif(buffer);
      }
      // Handle Uint8Array or Buffer-like response
      if (buffer && typeof buffer === 'object' && buffer.byteLength) {
        return parseExif(buffer.buffer || buffer);
      }
    }

    // Fallback: fetch via file protocol or blob URL
    const url = filePath.startsWith('file://') ? filePath
      : filePath.startsWith('/') || /^[a-zA-Z]:/.test(filePath) ? `file://${filePath.replace(/\\/g, '/')}` : filePath;

    const response = await fetch(url, {
      headers: { Range: 'bytes=0-131071' },
    });
    const buffer = await response.arrayBuffer();
    return parseExif(buffer);
  } catch {
    return null;
  }
}

/**
 * `file://C:/x/y.jpg` (or `file:///C:/x/y.jpg`) -> `C:/x/y.jpg`, the form the
 * native fs channels open. Plain paths pass through unchanged. Gallery builds
 * `file://` URLs for <img>, and native channels can't open those.
 */
export function fileUrlToPath(u: string): string {
  if (!/^file:\/\//i.test(u)) return u;
  let p = u.replace(/^file:\/\//i, '');
  if (/^\/[a-zA-Z]:[\/]/.test(p)) p = p.slice(1); // "/C:/..." -> "C:/..."
  try { p = decodeURI(p); } catch { /* not encoded */ }
  return p;
}
