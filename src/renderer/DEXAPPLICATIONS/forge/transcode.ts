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

/**
 * Resolve output dimensions for a resize (pure — shared by the image and video
 * transcode paths, unit-tested). When only one axis is given, aspect ratio is
 * preserved unless preserveAspect === false. Even-number rounding keeps video
 * encoders (which require 2-divisible dimensions) happy. Result is always >= 2.
 */
export function computeScaledDimensions(
  srcW: number,
  srcH: number,
  targetW?: number,
  targetH?: number,
  preserveAspect = true,
  evenOnly = false,
): { width: number; height: number } {
  const sW = srcW > 0 ? srcW : 1;
  const sH = srcH > 0 ? srcH : 1;
  let outW = targetW && targetW > 0 ? Math.round(targetW) : 0;
  let outH = targetH && targetH > 0 ? Math.round(targetH) : 0;
  if (outW && !outH) outH = preserveAspect === false ? sH : Math.round(outW * (sH / sW));
  if (outH && !outW) outW = preserveAspect === false ? sW : Math.round(outH * (sW / sH));
  if (!outW) outW = sW;
  if (!outH) outH = sH;
  outW = Math.max(evenOnly ? 2 : 1, outW);
  outH = Math.max(evenOnly ? 2 : 1, outH);
  if (evenOnly) {
    if (outW % 2 !== 0) outW += 1;
    if (outH % 2 !== 0) outH += 1;
  }
  return { width: outW, height: outH };
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
    const { width: outW, height: outH } = computeScaledDimensions(
      srcW, srcH, opts.width, opts.height, opts.preserveAspect !== false,
    );

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
  /** Trim start as a 0..1 fraction of the source duration. Defaults to 0. */
  trimIn?: number;
  /** Trim end as a 0..1 fraction of the source duration. Defaults to 1. */
  trimOut?: number;
  /**
   * Loudness normalization target in dBFS (the Forge UI labels it "LUFS").
   * When set, the decoded PCM is gain-adjusted so its integrated RMS loudness
   * matches the target. This is an RMS approximation of LUFS — true ITU-R
   * BS.1770 K-weighting needs a filterbank we do not bundle — but it is a real,
   * audible loudness match, not a no-op. Gain is capped so peaks never exceed
   * 0 dBFS (no clipping). A typical target is -14 (streaming) to -16.
   */
  normalizeDb?: number;
}

/** Real peak/amplitude data for drawing a waveform, plus the clip duration. */
export interface AudioPeaks {
  /** Per-bucket peak amplitude, each in 0..1. */
  peaks: number[];
  /** Decoded duration in seconds. */
  duration: number;
  sampleRate: number;
  numChannels: number;
}

/**
 * Decode an audio File and reduce it to `buckets` peak-amplitude samples for
 * waveform rendering. Mixes all channels to mono and takes the max |sample| per
 * bucket so transients stay visible. No external dependencies.
 */
export async function decodeAudioPeaks(file: File, buckets = 480): Promise<AudioPeaks> {
  const Ctx: typeof AudioContext =
    (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
  if (!Ctx) throw new Error('Web Audio API unavailable — cannot decode audio');
  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new Ctx();
  let audioBuffer: AudioBuffer;
  try {
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

  const len = audioBuffer.length;
  const chans = audioBuffer.numberOfChannels;
  const channelData: Float32Array[] = [];
  for (let c = 0; c < chans; c++) channelData.push(audioBuffer.getChannelData(c));
  const n = Math.max(1, Math.min(buckets, len));
  const samplesPerBucket = Math.max(1, Math.floor(len / n));
  const peaks: number[] = new Array(n).fill(0);
  let globalMax = 0.0001;
  for (let b = 0; b < n; b++) {
    const start = b * samplesPerBucket;
    const end = Math.min(len, start + samplesPerBucket);
    let peak = 0;
    for (let i = start; i < end; i++) {
      let mixed = 0;
      for (let c = 0; c < chans; c++) mixed += channelData[c][i];
      const v = Math.abs(mixed / chans);
      if (v > peak) peak = v;
    }
    peaks[b] = peak;
    if (peak > globalMax) globalMax = peak;
  }
  // Normalize so the loudest bucket reaches 1.0 (quiet clips still read clearly).
  for (let b = 0; b < n; b++) peaks[b] = peaks[b] / globalMax;
  return { peaks, duration: audioBuffer.duration, sampleRate: audioBuffer.sampleRate, numChannels: chans };
}

/** A minimal AudioBuffer-shaped view that encodeWav can consume directly. */
interface BufferLike {
  numberOfChannels: number;
  sampleRate: number;
  length: number;
  getChannelData(channel: number): Float32Array;
}

/** Slice a decoded AudioBuffer to the [trimIn, trimOut] fraction of its length. */
function sliceBuffer(buffer: AudioBuffer, trimIn: number, trimOut: number): BufferLike {
  const total = buffer.length;
  const startFrame = Math.max(0, Math.min(total - 1, Math.floor(trimIn * total)));
  const endFrame = Math.max(startFrame + 1, Math.min(total, Math.ceil(trimOut * total)));
  const sliceLen = endFrame - startFrame;
  const chans = buffer.numberOfChannels;
  const sliced: Float32Array[] = [];
  for (let c = 0; c < chans; c++) sliced.push(buffer.getChannelData(c).slice(startFrame, endFrame));
  return {
    numberOfChannels: chans,
    sampleRate: buffer.sampleRate,
    length: sliceLen,
    getChannelData: (c: number) => sliced[c],
  };
}

/**
 * In-place RMS loudness normalization of an AudioBuffer's channel data toward a
 * target dBFS. Returns the applied gain (1 = unchanged). Clip-safe: the gain is
 * never allowed to push the true peak above 0 dBFS. Silence is left untouched.
 */
export function normalizeAudioBufferRms(buffer: AudioBuffer, targetDb: number): number {
  const numChannels = buffer.numberOfChannels;
  const numFrames = buffer.length;
  if (numChannels === 0 || numFrames === 0) return 1;

  let sumSquares = 0;
  let peak = 0;
  let count = 0;
  for (let c = 0; c < numChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < numFrames; i++) {
      const s = data[i];
      sumSquares += s * s;
      const a = s < 0 ? -s : s;
      if (a > peak) peak = a;
    }
    count += numFrames;
  }
  const rms = Math.sqrt(sumSquares / count);
  // Nothing to normalize: digital silence or no headroom information.
  if (rms <= 1e-6 || peak <= 1e-6) return 1;

  const targetLinear = Math.pow(10, targetDb / 20);
  let gain = targetLinear / rms;
  // Clip guard: never let the loudest sample exceed full scale.
  const maxGain = 0.999 / peak;
  if (gain > maxGain) gain = maxGain;
  if (!Number.isFinite(gain) || gain <= 0) return 1;
  // No-op if the change is inaudible (< ~0.1 dB) to avoid needless float churn.
  if (Math.abs(20 * Math.log10(gain)) < 0.1) return 1;

  for (let c = 0; c < numChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < numFrames; i++) data[i] = data[i] * gain;
  }
  return gain;
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

  // Optional loudness normalization (mutates the decoded PCM in place before
  // we serialize the WAV). Real, audible gain — never a stored no-op.
  if (typeof opts.normalizeDb === 'number') {
    normalizeAudioBufferRms(audioBuffer, opts.normalizeDb);
  }

  const bitDepth: 16 | 24 = opts.bitDepth === 24 ? 24 : 16;
  const trimIn = Math.max(0, Math.min(1, opts.trimIn ?? 0));
  const trimOut = Math.max(trimIn, Math.min(1, opts.trimOut ?? 1));
  const source: BufferLike = (trimIn > 0 || trimOut < 1) ? sliceBuffer(audioBuffer, trimIn, trimOut) : audioBuffer;
  const blob = encodeWav(source, bitDepth);
  return { blob, ext: 'wav', mime: 'audio/wav', width: 0, height: 0 };
}

/**
 * Encode an AudioBuffer (or BufferLike slice) to a 16- or 24-bit interleaved PCM
 * WAV blob. Implements the canonical RIFF/WAVE header + PCM data chunk by hand.
 */
export function encodeWav(buffer: BufferLike, bitDepth: 16 | 24): Blob {
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
  route: 'image' | 'audio-wav' | 'video-webm' | 'native';
  /** Resolved image target when route === 'image'. */
  imageTarget?: ImageTarget;
  /** Human-readable reason when route === 'native'. */
  reason?: string;
}

/** Does this target string map to a WebM video container we can really encode? */
export function isWebmVideoTarget(format: string): boolean {
  const f = (format || '').toLowerCase();
  return f === 'webm' || f === 'vp9' || f === 'vp8' || f === 'vp9/webm' || f === 'vp8/webm';
}

/** True when the runtime can record a WebM video stream (MediaRecorder + a VP codec). */
export function canEncodeWebmVideo(): boolean {
  if (typeof MediaRecorder === 'undefined' || typeof document === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    if (typeof (c as any).captureStream !== 'function') return false;
    return ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .some(m => MediaRecorder.isTypeSupported(m));
  } catch { return false; }
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
    // WebM (VP8/VP9 + Opus) IS achievable in-browser via canvas.captureStream
    // + MediaRecorder — a real re-encode (see transcodeVideoToWebm). Every
    // other video container (MP4/H.264/HEVC/ProRes/...) still needs the native
    // encoder; the browser has no muxer for them.
    if (isWebmVideoTarget(fmt) && canEncodeWebmVideo()) return { route: 'video-webm' };
    return {
      route: 'native',
      reason: 'Video transcode to this container requires the native encoder. In-browser Forge can re-encode video to WebM (VP9) — pick the "WebM VP9" preset.',
    };
  }

  return { route: 'native', reason: 'Unknown source type — cannot transcode in-browser.' };
}

// ==================== REAL VIDEO -> WEBM (canvas capture + MediaRecorder) ====

export interface VideoEncodeOptions {
  /** Output width. If omitted, source width is kept. */
  width?: number;
  /** Output height. If omitted, preserves aspect from width, else source. */
  height?: number;
  /** Target video bitrate in bits/sec (default 8 Mbps). */
  videoBitsPerSecond?: number;
  /** Progress 0..1 as the source plays through. */
  onProgress?: (fraction: number) => void;
}

/** Pick the best-supported WebM video mime the runtime can record. */
export function pickWebmVideoMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const m of candidates) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* keep trying */ }
  }
  return null;
}

/**
 * Re-encode a video File to WebM (VP9/VP8 + Opus) entirely in-browser: decode
 * with a hidden <video>, draw each frame to a canvas at the target resolution,
 * capture that canvas as a video track, tap the element's audio as an audio
 * track, and record the combined stream with MediaRecorder. Produces a REAL,
 * playable .webm.
 *
 * This is a REAL-TIME re-encode (the source plays through once), so a 60s clip
 * takes ~60s — honest, not faked. Resolution downscaling is applied on the
 * draw. Audio is included when the source has a decodable track.
 */
export async function transcodeVideoToWebm(
  file: File,
  opts: VideoEncodeOptions = {},
): Promise<TranscodeResult> {
  const mime = pickWebmVideoMime();
  if (!mime) throw new Error('This runtime cannot record WebM video (MediaRecorder/VP codec unavailable).');

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true; // allow programmatic play without a gesture
  video.playsInline = true;
  (video as any).crossOrigin = 'anonymous';

  const cleanup = (extra?: () => void) => {
    try { extra?.(); } catch { /* noop */ }
    try { URL.revokeObjectURL(url); } catch { /* noop */ }
  };

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Could not decode this video source in the browser.'));
  });

  const srcW = video.videoWidth || 1;
  const srcH = video.videoHeight || 1;
  const { width, height } = computeScaledDimensions(srcW, srcH, opts.width, opts.height, true, true);
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) { cleanup(); throw new Error('Cannot acquire canvas 2D context for video encoding.'); }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const fps = 30;
  const canvasStream = (canvas as any).captureStream(fps) as MediaStream;

  // Tap the source audio (best-effort — silent/absent tracks are fine).
  let audioCtx: AudioContext | null = null;
  try {
    audioCtx = new AudioContext();
    const srcNode = audioCtx.createMediaElementSource(video);
    const dest = audioCtx.createMediaStreamDestination();
    srcNode.connect(dest);
    // Do NOT connect to audioCtx.destination — this is an offline capture, not playback.
    dest.stream.getAudioTracks().forEach(t => canvasStream.addTrack(t));
  } catch {
    try { audioCtx?.close(); } catch { /* noop */ }
    audioCtx = null;
  }

  const recorder = new MediaRecorder(canvasStream, {
    mimeType: mime,
    videoBitsPerSecond: opts.videoBitsPerSecond ?? 8_000_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  let rafId = 0;
  const draw = () => {
    ctx.drawImage(video, 0, 0, width, height);
    if (duration > 0 && opts.onProgress) {
      try { opts.onProgress(Math.min(0.99, video.currentTime / duration)); } catch { /* noop */ }
    }
    rafId = requestAnimationFrame(draw);
  };

  const blob = await new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    recorder.onerror = () => reject(new Error('Video recorder failed mid-encode.'));
    video.onended = () => {
      cancelAnimationFrame(rafId);
      if (recorder.state === 'recording') recorder.stop();
    };
    recorder.start(200);
    video.play().then(() => { rafId = requestAnimationFrame(draw); }).catch(reject);
  });

  cleanup(() => { cancelAnimationFrame(rafId); try { audioCtx?.close(); } catch { /* noop */ } });
  if (!blob || blob.size === 0) throw new Error('Video encoder produced no data.');
  try { opts.onProgress?.(1); } catch { /* noop */ }

  return { blob, ext: 'webm', mime: 'video/webm', width, height };
}
