// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Lightweight ID3 tag parser for MP3 files.
 * Supports ID3v2.3/v2.4 (header) and ID3v1 (footer fallback).
 * Reads metadata without external dependencies.
 */

export interface AudioMetadata {
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  genre?: string;
  trackNumber?: string;
  comment?: string;
  albumArtist?: string;
  composer?: string;
  duration?: number;
  bitrate?: number;
  sampleRate?: number;
  artwork?: string; // base64 data URI
}

// ID3v1 genre list (standard 80 + extensions)
const ID3V1_GENRES: string[] = [
  'Blues', 'Classic Rock', 'Country', 'Dance', 'Disco', 'Funk', 'Grunge',
  'Hip-Hop', 'Jazz', 'Metal', 'New Age', 'Oldies', 'Other', 'Pop', 'R&B',
  'Rap', 'Reggae', 'Rock', 'Techno', 'Industrial', 'Alternative', 'Ska',
  'Death Metal', 'Pranks', 'Soundtrack', 'Euro-Techno', 'Ambient', 'Trip-Hop',
  'Vocal', 'Jazz+Funk', 'Fusion', 'Trance', 'Classical', 'Instrumental',
  'Acid', 'House', 'Game', 'Sound Clip', 'Gospel', 'Noise', 'AlternRock',
  'Bass', 'Soul', 'Punk', 'Space', 'Meditative', 'Instrumental Pop',
  'Instrumental Rock', 'Ethnic', 'Gothic', 'Darkwave', 'Techno-Industrial',
  'Electronic', 'Pop-Folk', 'Eurodance', 'Dream', 'Southern Rock', 'Comedy',
  'Cult', 'Gangsta', 'Top 40', 'Christian Rap', 'Pop/Funk', 'Jungle',
  'Native American', 'Cabaret', 'New Wave', 'Psychadelic', 'Rave', 'Showtunes',
  'Trailer', 'Lo-Fi', 'Tribal', 'Acid Punk', 'Acid Jazz', 'Polka', 'Retro',
  'Musical', 'Rock & Roll', 'Hard Rock',
];

// ID3v2 frame IDs
const FRAME_MAP: Record<string, keyof AudioMetadata> = {
  TIT2: 'title',
  TPE1: 'artist',
  TALB: 'album',
  TDRC: 'year',
  TYER: 'year',
  TCON: 'genre',
  TRCK: 'trackNumber',
  COMM: 'comment',
  TPE2: 'albumArtist',
  TCOM: 'composer',
};

function readLatin1(data: Uint8Array, offset: number, length: number): string {
  let str = '';
  for (let i = 0; i < length; i++) {
    const c = data[offset + i];
    if (c === 0) break;
    str += String.fromCharCode(c);
  }
  return str.trim();
}

function readUTF16(data: Uint8Array, offset: number, length: number): string {
  if (length < 2) return '';
  const view = new DataView(data.buffer, data.byteOffset + offset, length);
  const bom = view.getUint16(0);
  const littleEndian = bom === 0xFFFE;
  const start = (bom === 0xFEFF || bom === 0xFFFE) ? 2 : 0;
  let str = '';
  for (let i = start; i < length - 1; i += 2) {
    const c = view.getUint16(i, littleEndian);
    if (c === 0) break;
    str += String.fromCharCode(c);
  }
  return str.trim();
}

function readUTF8(data: Uint8Array, offset: number, length: number): string {
  const decoder = new TextDecoder('utf-8');
  const slice = data.slice(offset, offset + length);
  // Remove null terminator
  const nullIdx = slice.indexOf(0);
  return decoder.decode(nullIdx >= 0 ? slice.slice(0, nullIdx) : slice).trim();
}

function decodeTextFrame(data: Uint8Array, offset: number, size: number): string {
  if (size < 2) return '';
  const encoding = data[offset];
  const textOffset = offset + 1;
  const textLength = size - 1;

  switch (encoding) {
    case 0: // ISO-8859-1
      return readLatin1(data, textOffset, textLength);
    case 1: // UTF-16 with BOM
      return readUTF16(data, textOffset, textLength);
    case 2: // UTF-16BE without BOM
      return readUTF16(data, textOffset, textLength);
    case 3: // UTF-8
      return readUTF8(data, textOffset, textLength);
    default:
      return readLatin1(data, textOffset, textLength);
  }
}

function parseGenre(genreStr: string): string {
  // Handle "(0)" or "(0)Blues" format
  const match = genreStr.match(/^\((\d+)\)/);
  if (match) {
    const idx = parseInt(match[1], 10);
    const suffix = genreStr.slice(match[0].length).trim();
    return suffix || ID3V1_GENRES[idx] || genreStr;
  }
  // Handle plain number
  const idx = parseInt(genreStr, 10);
  if (!isNaN(idx) && idx >= 0 && idx < ID3V1_GENRES.length) {
    return ID3V1_GENRES[idx];
  }
  return genreStr;
}

function parseID3v2(data: Uint8Array): AudioMetadata | null {
  // Check "ID3" header
  if (data[0] !== 0x49 || data[1] !== 0x44 || data[2] !== 0x33) return null;

  const version = data[3]; // 3 or 4
  const flags = data[5];
  const hasExtHeader = (flags & 0x40) !== 0;

  // Synchsafe size
  const size = (data[6] << 21) | (data[7] << 14) | (data[8] << 7) | data[9];
  const totalSize = Math.min(size + 10, data.length);

  let offset = 10;

  // Skip extended header if present
  if (hasExtHeader) {
    const extSize = (data[10] << 21) | (data[11] << 14) | (data[12] << 7) | data[13];
    offset += (version === 4 ? extSize : extSize + 4);
  }

  const meta: AudioMetadata = {};
  let artworkMime = '';
  let artworkData: Uint8Array | null = null;

  while (offset < totalSize - 10) {
    const frameId = readLatin1(data, offset, 4);
    if (!frameId || frameId[0] === '\0') break;

    let frameSize: number;
    if (version === 4) {
      // v2.4 uses synchsafe integers for frame size
      frameSize = (data[offset + 4] << 21) | (data[offset + 5] << 14) | (data[offset + 6] << 7) | data[offset + 7];
    } else {
      // v2.3 uses regular integers
      frameSize = (data[offset + 4] << 24) | (data[offset + 5] << 16) | (data[offset + 6] << 8) | data[offset + 7];
    }

    const frameOffset = offset + 10;
    offset += 10 + frameSize;

    if (frameSize <= 0 || frameOffset + frameSize > totalSize) continue;

    // Text frames
    const metaKey = FRAME_MAP[frameId];
    if (metaKey && frameId.startsWith('T')) {
      const value = decodeTextFrame(data, frameOffset, frameSize);
      if (value) {
        (meta as any)[metaKey] = metaKey === 'genre' ? parseGenre(value) : value;
      }
      continue;
    }

    // APIC: Attached picture (album art)
    if (frameId === 'APIC' && !artworkData) {
      const encoding = data[frameOffset];
      let pos = frameOffset + 1;
      // Read MIME type (null-terminated)
      let mime = '';
      while (pos < frameOffset + frameSize && data[pos] !== 0) {
        mime += String.fromCharCode(data[pos++]);
      }
      pos++; // skip null
      pos++; // skip picture type byte
      // Skip description (null-terminated, encoding-dependent)
      if (encoding === 1 || encoding === 2) {
        // UTF-16: look for double null
        while (pos < frameOffset + frameSize - 1) {
          if (data[pos] === 0 && data[pos + 1] === 0) { pos += 2; break; }
          pos += 2;
        }
      } else {
        while (pos < frameOffset + frameSize && data[pos] !== 0) pos++;
        pos++;
      }
      artworkMime = mime || 'image/jpeg';
      artworkData = data.slice(pos, frameOffset + frameSize);
    }
  }

  // Convert artwork to data URI
  if (artworkData && artworkData.length > 0) {
    let binary = '';
    for (let i = 0; i < artworkData.length; i++) {
      binary += String.fromCharCode(artworkData[i]);
    }
    meta.artwork = `data:${artworkMime};base64,${btoa(binary)}`;
  }

  return Object.keys(meta).length > 0 ? meta : null;
}

function parseID3v1(data: Uint8Array): AudioMetadata | null {
  // ID3v1 is the last 128 bytes of the file
  if (data.length < 128) return null;
  const tagStart = data.length - 128;

  // Check "TAG" header
  if (data[tagStart] !== 0x54 || data[tagStart + 1] !== 0x41 || data[tagStart + 2] !== 0x47) {
    return null;
  }

  const meta: AudioMetadata = {};
  const title = readLatin1(data, tagStart + 3, 30);
  const artist = readLatin1(data, tagStart + 33, 30);
  const album = readLatin1(data, tagStart + 63, 30);
  const year = readLatin1(data, tagStart + 93, 4);
  const genreIdx = data[tagStart + 127];

  if (title) meta.title = title;
  if (artist) meta.artist = artist;
  if (album) meta.album = album;
  if (year) meta.year = year;
  if (genreIdx < ID3V1_GENRES.length) meta.genre = ID3V1_GENRES[genreIdx];

  // ID3v1.1: track number
  if (data[tagStart + 125] === 0 && data[tagStart + 126] !== 0) {
    meta.trackNumber = String(data[tagStart + 126]);
  }

  return Object.keys(meta).length > 0 ? meta : null;
}

/**
 * Parse ID3 tags from an MP3 ArrayBuffer.
 * Tries ID3v2 first (more complete), falls back to ID3v1.
 */
export function parseID3(buffer: ArrayBuffer): AudioMetadata | null {
  const data = new Uint8Array(buffer);
  return parseID3v2(data) || parseID3v1(data);
}

/**
 * Load audio metadata from a file path.
 * Reads the first 512KB for ID3v2 + last 128 bytes for ID3v1.
 */
export async function loadAudioMetadata(filePath: string): Promise<AudioMetadata | null> {
  try {
    if (window.electron?.invoke) {
      // Read first 512KB for ID3v2 header
      const buffer = await window.electron.invoke('fs:readFileHead', filePath, 524288);
      if (buffer) {
        const ab = buffer instanceof ArrayBuffer ? buffer : buffer.buffer || buffer;
        const result = parseID3(ab);
        if (result) return result;
      }
    }

    // Fallback: fetch
    const url = filePath.startsWith('file://') ? filePath
      : filePath.startsWith('/') || /^[a-zA-Z]:/.test(filePath) ? `file://${filePath.replace(/\\/g, '/')}` : filePath;

    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return parseID3(buffer);
  } catch {
    return null;
  }
}
