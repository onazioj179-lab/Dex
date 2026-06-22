// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Forge - Browser-native transcode core
 *
 * Real, dependency-free transcoding for the formats actually achievable in the
 * browser:
 *   - IMAGE  -> PNG / JPEG / WebP  (decode -> canvas -> canvas.toBlob)
 *   - AUDIO  -> WAV (16/24-bit PCM, real WAV encoder over decodeAudioData)
 *
 * Everything else (MP3/AAC/Opus/FLAC audio, every video codec) is HONESTLY
 * reported as requiring the native encoder. We never fabricate a "completed"
 * file we did not actually produce.
 */

// ==================== SOURCE / TARGET CLASSIFICATION ====================

export type SourceKind = 'image' | 'audio' | 'video' | 'unknown';

const IMAGE_EXT = /\.(png|jpe?g|jfif|webp|gif|bmp|avif|tiff?)$/i;
const AUDIO_EXT = /\.(wav|mp3|aac|flac|ogg|oga|opus|m4a|aiff?|wma)$/i;
const VIDEO_EXT = /\.(mp4|mov|avi|mkv|webm|wmv|flv|m4v|ts|m2ts|mts|mpg|mpeg|mxf|r3d|braw|ari)$/i;

/** Best-effort detection of what a source file actually IS. MIME wins, then extension. */
export function detectSourceKind(file: File): SourceKind {
  const type = (file.type || '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  const name = file.name || '';
  if (IMAGE_EXT.test(name)) return 'image';
  if (AUDIO_EXT.test(name)) return 'audio';
  if (VIDEO_EXT.test(name)) return 'video';
  return 'unknown';
}

/** Image target formats we can REALLY encode via canvas.toBlob. */
export interface ImageTarget {
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  ext: 'png' | 'jpg' | 'webp';
}

/**
 * Map a user-facing format string (job.format / preset.format) to a real
 * canvas-encodable image target, or null if it is not a browser-native raster
 * image encode (e.g. TIFF, AVIF, GIF animation -> needs native).
 */
export function resolveImageTarget(format: string): ImageTarget | null {
  const f = (format || '').toLowerCase();
  if (f === 'png') return { mime: 'image/png', ext: 'png' };
  if (f === 'jpg' || f === 'jpeg') return { mime: 'image/jpeg', ext: 'jpg' };
  if (f === 'webp') {
    // Verify the runtime can actually encode WebP before promising it.
    if (canEncodeMime('image/webp')) return { mime: 'image/webp', ext: 'webp' };
    return null;
  }
  return null;
}

/** Is the target an audio WAV container we can really write? */
export function isWavTarget(format: string): boolean {
  return (format || '').toLowerCase() === 'wav';
}

/** Probe whether canvas.toBlob can emit a given mime. */
function canEncodeMime(mime: string): boolean {
  try {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    const url = c.toDataURL(mime);
    return url.startsWith(`data:${mime}`);
  } catch {
    return false;
  }
}

// ==================== IMAGE TRANSCODE (REAL) ====================

export interface ImageEncodeOptions {
  /** 0..1 JPEG/WebP quality. Ignored for PNG. */
  quality?: number;
  /** Optional explicit output resolution. If omitted, native resolution is kept. */
  width?: number;
  height?: number;
  /** When true and only one of width/height is set, preserve aspect ratio. */
  preserveAspect?: boolean;
}

export interface TranscodeResult {
  blob: Blob;
  ext: string;
  mime: string;
  width: number;
  height: number;
}

/** Decode a File into a drawable bitmap, preferring createImageBitmap, falling back to Image. */
async function decodeImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => { try { bitmap.close(); } catch { /* noop */ } } };
    } catch {
      /* fall through to HTMLImageElement */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Cannot decode image — unsupported or corrupt file'));
      el.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      release: () => { try { URL.revokeObjectURL(url); } catch { /* noop */ } },
    };
  } catch (e) {
    try { URL.revokeObjectURL(url); } catch { /* noop */ }
    throw e;
  }
}

/**
 * Real image transcode: decode the source, draw to a canvas at the chosen
 * resolution, and re-encode with canvas.toBlob honoring quality.
 */
export async function transcodeImage(
  file: File,
  target: ImageTarget,
  opts: ImageEncodeOptions = {},
): Promise<TranscodeResult> {
  const decoded = await decodeImage(file);
  try {
    const srcW = decoded.width || 1;
    const srcH = decoded.height || 1;

    // Resolve output dimensions, optionally preserving aspect when only one axis given.
    let outW = opts.width && opts.width > 0 ? Math.round(opts.width) : 0;
    let outH = opts.height && opts.height > 0 ? Math.round(opts.height) : 0;
    if (outW && !outH) outH = opts.preserveAspect === false ? srcH : Math.round(outW * (srcH / srcW));
    if (outH && !outW) outW = opts.preserveAspect === false ? srcW : Math.round(outH * (srcW / srcH));
    if (!outW) outW = srcW;
    if (!outH) outH = srcH;
    outW = Math.max(1, outW);
    outH = Math.max(1, outH);

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Cannot acquire canvas 2D context for image encoding');

    // JPEG has no alpha — flatten onto white so transparent PNGs do not go black.
    if (target.mime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.source, 0, 0, outW, outH);

    const quality = clamp01(opts.quality ?? 0.92);
    const blob = await canvasToBlob(canvas, target.mime, quality);
    if (!blob || blob.size === 0) throw new Error(`Encoder produced no data for ${target.mime}`);

    return { blob, ext: target.ext, mime: target.mime, width: outW, height: outH };
  } finally {
    decoded.release();
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.92;
  return Math.min(1, Math.max(0, n));
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    // PNG ignores quality; passing it is harmless.
    canvas.toBlob((b) => resolve(b), mime, quality);
  });
}

// ==================== AUDIO -> WAV (REAL PCM ENCODER) ====================

export interface WavEncodeOptions {
  /** 16 or 24-bit PCM. Defaults to 16. */
  bitDepth?: 16 | 24;
  /** Optional resample target. If omitted, the decoded sample rate is kept. */
  sampleRate?: number;
}

/**
 * Decode an audio File via AudioContext.decodeAudioData and write a real
 * little-endian PCM WAV blob. No external dependencies.
 */
export async function transcodeAudioToWav(file: File, opts: WavEncodeOptions = {}): Promise<TranscodeResult> {
  const Ctx: typeof AudioContext =
    (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
  if (!Ctx) throw new Error('Web Audio API unavailable — cannot decode audio');

  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new Ctx();
  let audioBuffer: AudioBuffer;
  try {
    // decodeAudioData callback form for broadest engine support.
    audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
      audioCtx.decodeAudioData(
        arrayBuffer.slice(0),
        (buf) => resolve(buf),
        (err) => reject(err instanceof Error ? err : new Error('Cannot decode audio — unsupported or corrupt file')),
      );
    });
  } finally {
    try { await audioCtx.close(); } catch { /* noop */ }
  }

  const bitDepth: 16 | 24 = opts.bitDepth === 24 ? 24 : 16;
  const blob = encodeWav(audioBuffer, bitDepth);
  return { blob, ext: 'wav', mime: 'audio/wav', width: 0, height: 0 };
}

/**
 * Encode an AudioBuffer to a 16- or 24-bit interleaved PCM WAV blob.
 * Implements the canonical RIFF/WAVE header + PCM data chunk by hand.
 */
export function encodeWav(buffer: AudioBuffer, bitDepth: 16 | 24): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const headerSize = 44;
  const out = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(out);

  // ---- RIFF header ----
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  // ---- fmt chunk ----
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);            // PCM fmt chunk size
  view.setUint16(20, 1, true);             // audioFormat = 1 (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  // ---- data chunk ----
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Gather channel data once (avoids per-sample getChannelData call cost).
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels[c] = buffer.getChannelData(c);

  let offset = headerSize;
  if (bitDepth === 16) {
    for (let i = 0; i < numFrames; i++) {
      for (let c = 0; c < numChannels; c++) {
        const s = clampSample(channels[c][i]);
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }
  } else {
    // 24-bit little-endian signed
    for (let i = 0; i < numFrames; i++) {
      for (let c = 0; c < numChannels; c++) {
        const s = clampSample(channels[c][i]);
        const val = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
        view.setUint8(offset, val & 0xff);
        view.setUint8(offset + 1, (val >> 8) & 0xff);
        view.setUint8(offset + 2, (val >> 16) & 0xff);
        offset += 3;
      }
    }
  }

  return new Blob([out], { type: 'audio/wav' });
}

function clampSample(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? 1 : n < -1 ? -1 : n;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

// ==================== HONEST CAPABILITY REPORT ====================

export interface TargetPlan {
  /** What we will actually do with this job. */
  route: 'image' | 'audio-wav' | 'native';
  /** Resolved image target when route === 'image'. */
  imageTarget?: ImageTarget;
  /** Human-readable reason when route === 'native'. */
  reason?: string;
}

/**
 * Decide, honestly, how a job can be processed in-browser. Returns a 'native'
 * route (with reason) whenever real in-browser encoding is not possible — the
 * caller must surface that as a needs-native state, never a fake completion.
 */
export function planTarget(file: File, format: string): TargetPlan {
  const kind = detectSourceKind(file);
  const fmt = (format || '').toLowerCase();

  if (kind === 'image') {
    const imageTarget = resolveImageTarget(fmt);
    if (imageTarget) return { route: 'image', imageTarget };
    return {
      route: 'native',
      reason: `Image target "${fmt.toUpperCase() || 'unknown'}" needs the native encoder (browser raster encode supports PNG/JPEG/WebP only).`,
    };
  }

  if (kind === 'audio') {
    if (isWavTarget(fmt)) return { route: 'audio-wav' };
    return {
      route: 'native',
      reason: `Lossy/compressed audio (${fmt.toUpperCase() || 'target'}) requires the native encoder — the browser can only write uncompressed WAV.`,
    };
  }

  if (kind === 'video') {
    const webCodecs = typeof (window as any).VideoEncoder === 'function';
    return {
      route: 'native',
      reason: webCodecs
        ? 'Video transcode requires the native encoder (WebCodecs VideoEncoder is present but full muxing/encode is not built without a dependency).'
        : 'Video transcode requires the native encoder — in-browser video encoding is unavailable without bundling ffmpeg.',
    };
  }

  return { route: 'native', reason: 'Unknown source type — cannot transcode in-browser.' };
}
