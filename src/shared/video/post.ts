// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Wave C v4.0.1 - VINX video post pipeline.
// Proxy registry, scene detection, multicam sync, captions parsers, QC.
// All pure functions; no FFmpeg/Electron.

// ---------- Proxy workflow ----------

export type ProxyResolution = '480p' | '720p' | '1080p' | 'half' | 'quarter';
export type ProxyCodec = 'prores_proxy' | 'h264' | 'dnxhr_lb';

export interface ProxySpec {
  resolution: ProxyResolution;
  codec: ProxyCodec;
  bitrateMbps: number;
}

export interface SourceClip {
  id: string;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  bytes: number;
}

export interface ProxyRecord {
  sourceId: string;
  spec: ProxySpec;
  proxyPath: string;
  status: 'pending' | 'transcoding' | 'ready' | 'failed';
  bytes: number;
  generatedAt: number | null;
}

export function chooseProxySpec(clip: SourceClip, budgetMbps: number): ProxySpec {
  if (clip.height >= 2160 || clip.bytes > 10_000_000_000) {
    return { resolution: '720p', codec: 'prores_proxy', bitrateMbps: Math.min(budgetMbps, 30) };
  }
  if (clip.height >= 1080) {
    return { resolution: '720p', codec: 'h264', bitrateMbps: Math.min(budgetMbps, 8) };
  }
  return { resolution: 'half', codec: 'h264', bitrateMbps: Math.min(budgetMbps, 4) };
}

export function estimateProxyBytes(clip: SourceClip, spec: ProxySpec): number {
  const seconds = clip.durationMs / 1000;
  return Math.round((spec.bitrateMbps * 1_000_000 / 8) * seconds);
}

export function proxyCacheKey(sourceId: string, spec: ProxySpec): string {
  return `${sourceId}|${spec.resolution}|${spec.codec}|${spec.bitrateMbps}`;
}

// ---------- Scene detection (frame-energy heuristic) ----------

export interface FrameEnergyPoint { timeMs: number; meanLuma: number; histogramHash: number }

export interface SceneCut { atMs: number; confidence: number; reason: string }

export function detectScenes(
  frames: ReadonlyArray<FrameEnergyPoint>,
  options: { lumaDelta?: number; histDelta?: number; minSceneMs?: number } = {},
): SceneCut[] {
  const lumaThr = options.lumaDelta ?? 18;
  const histThr = options.histDelta ?? 0.2;
  const minScene = options.minSceneMs ?? 500;
  const cuts: SceneCut[] = [];
  let lastCut = -Infinity;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    const lumaDiff = Math.abs(b.meanLuma - a.meanLuma);
    const histDiff = Math.abs(b.histogramHash - a.histogramHash);
    let confidence = 0;
    let reason = '';
    if (lumaDiff > lumaThr) { confidence += 0.6; reason = 'luma jump'; }
    if (histDiff > histThr) { confidence += 0.5; reason = reason ? `${reason} + hist` : 'histogram shift'; }
    if (confidence >= 0.5 && b.timeMs - lastCut >= minScene) {
      cuts.push({ atMs: b.timeMs, confidence: Math.min(1, confidence), reason });
      lastCut = b.timeMs;
    }
  }
  return cuts;
}

// ---------- Multicam sync (audio waveform alignment via cross-correlation) ----------

export interface ClipWaveform { id: string; samples: Float32Array; sampleRate: number; offsetMs: number }

export function alignClipsByAudio(
  reference: ClipWaveform,
  others: ReadonlyArray<ClipWaveform>,
  searchMs: number = 5000,
): Array<{ id: string; offsetMs: number; correlation: number }> {
  const out: Array<{ id: string; offsetMs: number; correlation: number }> = [];
  for (const c of others) {
    const sr = Math.min(reference.sampleRate, c.sampleRate);
    const maxLag = Math.floor((searchMs / 1000) * sr);
    const a = downsampleTo(reference.samples, reference.sampleRate, sr);
    const b = downsampleTo(c.samples, c.sampleRate, sr);
    let bestLag = 0; let bestCorr = -Infinity;
    const window = Math.min(a.length, b.length, sr * 5);
    for (let lag = -maxLag; lag <= maxLag; lag++) {
      let s = 0;
      for (let i = 0; i < window; i++) {
        const ai = i;
        const bi = i + lag;
        if (bi < 0 || bi >= b.length) continue;
        s += a[ai] * b[bi];
      }
      if (s > bestCorr) { bestCorr = s; bestLag = lag; }
    }
    out.push({ id: c.id, offsetMs: (bestLag / sr) * 1000, correlation: bestCorr });
  }
  return out;
}

function downsampleTo(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (toRate >= fromRate) return samples;
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i++) out[i] = samples[Math.floor(i * ratio)];
  return out;
}

// ---------- Captions: SRT + VTT parse / serialize ----------

export interface CaptionCue { index: number; startMs: number; endMs: number; text: string }

export function parseSrt(text: string): CaptionCue[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const cues: CaptionCue[] = [];
  let i = 0;
  while (i < lines.length) {
    const idxLine = lines[i].trim();
    if (!idxLine) { i++; continue; }
    const idx = parseInt(idxLine, 10);
    if (!Number.isFinite(idx)) { i++; continue; }
    const timing = lines[i + 1] || '';
    const m = timing.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
    if (!m) { i++; continue; }
    const startMs = (+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000 + +m[4];
    const endMs = (+m[5] * 3600 + +m[6] * 60 + +m[7]) * 1000 + +m[8];
    let j = i + 2;
    const buf: string[] = [];
    while (j < lines.length && lines[j].trim() !== '') { buf.push(lines[j]); j++; }
    cues.push({ index: idx, startMs, endMs, text: buf.join('\n') });
    i = j + 1;
  }
  return cues;
}

function pad(n: number, w: number): string { return String(n).padStart(w, '0'); }

export function serializeSrt(cues: ReadonlyArray<CaptionCue>): string {
  const fmt = (ms: number) => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const r = ms % 1000;
    return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(r, 3)}`;
  };
  return cues.map((c, i) =>
    `${c.index || i + 1}\n${fmt(c.startMs)} --> ${fmt(c.endMs)}\n${c.text}\n`,
  ).join('\n');
}

export function parseVtt(text: string): CaptionCue[] {
  const cleaned = text.replace(/^WEBVTT.*$/m, '').replace(/\r/g, '');
  const blocks = cleaned.split(/\n\n+/).filter(b => b.trim());
  const cues: CaptionCue[] = [];
  let idx = 1;
  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l !== '');
    let timingLine = lines[0];
    let textStart = 1;
    if (!timingLine.includes('-->') && lines[1]) {
      timingLine = lines[1];
      textStart = 2;
    }
    const m = timingLine.match(/(\d{2}):(\d{2})[:.](\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2})[:.](\d{2})\.(\d{3})/);
    if (!m) continue;
    const startMs = (+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000 + +m[4];
    const endMs = (+m[5] * 3600 + +m[6] * 60 + +m[7]) * 1000 + +m[8];
    cues.push({ index: idx++, startMs, endMs, text: lines.slice(textStart).join('\n') });
  }
  return cues;
}

export function serializeVtt(cues: ReadonlyArray<CaptionCue>): string {
  const fmt = (ms: number) => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const r = ms % 1000;
    return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(r, 3)}`;
  };
  return 'WEBVTT\n\n' + cues.map(c =>
    `${fmt(c.startMs)} --> ${fmt(c.endMs)}\n${c.text}\n`,
  ).join('\n');
}

// ---------- Color scopes (waveform / vectorscope summaries) ----------

export interface RgbHistogram { r: Uint32Array; g: Uint32Array; b: Uint32Array }

export function computeHistogram(rgba: Uint8Array | Uint8ClampedArray): RgbHistogram {
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  for (let i = 0; i < rgba.length; i += 4) {
    r[rgba[i]]++; g[rgba[i + 1]]++; b[rgba[i + 2]]++;
  }
  return { r, g, b };
}

export function lumaWaveformColumns(
  rgba: Uint8Array | Uint8ClampedArray, width: number, columns: number,
): Uint32Array {
  const height = rgba.length / 4 / width;
  const colWidth = Math.max(1, Math.floor(width / columns));
  const out = new Uint32Array(columns * 256);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const luma = Math.min(255, Math.round(0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]));
      const col = Math.min(columns - 1, Math.floor(x / colWidth));
      out[col * 256 + luma]++;
    }
  }
  return out;
}

// ---------- Export QC ----------

export interface QcReport {
  ok: boolean;
  issues: Array<{ id: string; severity: 'warning' | 'error'; message: string }>;
}

export interface ClipQcInput {
  width: number; height: number; fps: number; durationMs: number;
  loudnessLufs?: number; truePeakDb?: number; hasAudio: boolean; hasVideo: boolean;
}

export function runQc(
  clip: ClipQcInput,
  target: { lufs?: number; truePeakDb?: number; aspect?: 'landscape' | 'portrait' | 'square'; minDurationMs?: number },
): QcReport {
  const issues: QcReport['issues'] = [];
  if (!clip.hasVideo && !clip.hasAudio) {
    issues.push({ id: 'empty', severity: 'error', message: 'Clip has neither audio nor video.' });
  }
  if (clip.width % 2 !== 0 || clip.height % 2 !== 0) {
    issues.push({ id: 'odd-dim', severity: 'warning', message: 'Odd dimensions may break codecs.' });
  }
  if (clip.fps <= 0) {
    issues.push({ id: 'fps', severity: 'error', message: 'FPS must be positive.' });
  }
  if (target.aspect) {
    const ratio = clip.width / clip.height;
    const expected = target.aspect === 'landscape' ? 16 / 9 : target.aspect === 'portrait' ? 9 / 16 : 1;
    if (Math.abs(ratio - expected) > 0.05) {
      issues.push({ id: 'aspect', severity: 'warning', message: `Aspect ${ratio.toFixed(2)} differs from target ${expected.toFixed(2)}.` });
    }
  }
  if (target.minDurationMs && clip.durationMs < target.minDurationMs) {
    issues.push({ id: 'duration', severity: 'warning', message: 'Duration below minimum.' });
  }
  if (target.lufs !== undefined && clip.loudnessLufs !== undefined) {
    if (Math.abs(clip.loudnessLufs - target.lufs) > 1.5) {
      issues.push({ id: 'lufs', severity: 'warning', message: `Loudness ${clip.loudnessLufs.toFixed(1)} LUFS off target ${target.lufs}.` });
    }
  }
  if (target.truePeakDb !== undefined && clip.truePeakDb !== undefined && clip.truePeakDb > target.truePeakDb) {
    issues.push({ id: 'peak', severity: 'error', message: `True peak ${clip.truePeakDb.toFixed(2)} dB exceeds ${target.truePeakDb} dB.` });
  }
  return { ok: !issues.some(i => i.severity === 'error'), issues };
}

// ---------- Timecode ----------

export function framesToTimecode(frames: number, fps: number, dropFrame = false): string {
  if (fps <= 0) return '00:00:00:00';
  if (dropFrame && Math.round(fps) === 30) {
    const dropFrames = 2;
    const frameRate = 29.97;
    const framesPerMinute = Math.round(frameRate * 60) - dropFrames;
    const framesPer10Minutes = framesPerMinute * 10 + dropFrames;
    const d = Math.floor(frames / framesPer10Minutes);
    const m = frames % framesPer10Minutes;
    let f = frames + dropFrames * 9 * d;
    if (m > dropFrames) f += dropFrames * Math.floor((m - dropFrames) / framesPerMinute);
    const fpsRound = Math.round(fps);
    const ff = f % fpsRound;
    const ss = Math.floor(f / fpsRound) % 60;
    const mm = Math.floor(f / (fpsRound * 60)) % 60;
    const hh = Math.floor(f / (fpsRound * 3600));
    return `${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)};${pad(ff, 2)}`;
  }
  const fpsRound = Math.round(fps);
  const ff = frames % fpsRound;
  const ss = Math.floor(frames / fpsRound) % 60;
  const mm = Math.floor(frames / (fpsRound * 60)) % 60;
  const hh = Math.floor(frames / (fpsRound * 3600));
  return `${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)}:${pad(ff, 2)}`;
}

export function timecodeToFrames(timecode: string, fps: number): number {
  const m = timecode.match(/^(\d{2}):(\d{2}):(\d{2})[:;](\d{2})$/);
  if (!m) return 0;
  return ((+m[1] * 3600) + (+m[2] * 60) + (+m[3])) * Math.round(fps) + (+m[4]);
}
