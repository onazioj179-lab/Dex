// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Video pipeline primitives - wave R.
 * Deterministic timeline / EDL math: ripple, roll, slip, slide, multicam sync,
 * proxy planning, smart-render decisions, scene change detection.
 */
// DEX v3.10.0 wave R - video pipeline core

export interface Clip {
  readonly id: string;
  readonly track: number;
  start: number;        // timeline frame
  duration: number;     // frames
  sourceIn: number;     // frames into source
  readonly sourceDuration: number;
}

export function rippleEdit(clips: readonly Clip[], clipId: string, deltaFrames: number): Clip[] {
  const out = clips.map((c) => ({ ...c }));
  const idx = out.findIndex((c) => c.id === clipId);
  if (idx < 0) return out;
  const target = out[idx];
  target.duration = Math.max(1, target.duration + deltaFrames);
  for (let i = idx + 1; i < out.length; i++) {
    if (out[i].track === target.track) out[i].start += deltaFrames;
  }
  return out;
}

export function rollEdit(clips: readonly Clip[], leftId: string, rightId: string, deltaFrames: number): Clip[] {
  const out = clips.map((c) => ({ ...c }));
  const left = out.find((c) => c.id === leftId);
  const right = out.find((c) => c.id === rightId);
  if (!left || !right) return out;
  const max = Math.min(right.duration - 1, left.sourceDuration - left.sourceIn - left.duration);
  const min = -(left.duration - 1);
  const d = Math.max(min, Math.min(max, deltaFrames));
  left.duration += d;
  right.start += d;
  right.duration -= d;
  right.sourceIn += d;
  return out;
}

export function slipEdit(clip: Clip, deltaFrames: number): Clip {
  const max = clip.sourceDuration - clip.duration - clip.sourceIn;
  const min = -clip.sourceIn;
  const d = Math.max(min, Math.min(max, deltaFrames));
  return { ...clip, sourceIn: clip.sourceIn + d };
}

export function slideEdit(clips: readonly Clip[], clipId: string, deltaFrames: number): Clip[] {
  const out = clips.map((c) => ({ ...c }));
  const idx = out.findIndex((c) => c.id === clipId);
  if (idx <= 0 || idx >= out.length - 1) return out;
  const left = out[idx - 1];
  const me = out[idx];
  const right = out[idx + 1];
  const min = -(left.duration - 1);
  const max = right.duration - 1;
  const d = Math.max(min, Math.min(max, deltaFrames));
  left.duration += d;
  me.start += d;
  right.start += d;
  right.duration -= d;
  return out;
}

export function multicamSyncOffset(referenceWaveform: readonly number[], targetWaveform: readonly number[], maxLagFrames: number): number {
  let bestLag = 0;
  let bestScore = -Infinity;
  const n = Math.min(referenceWaveform.length, targetWaveform.length);
  for (let lag = -maxLagFrames; lag <= maxLagFrames; lag++) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const j = i + lag;
      if (j < 0 || j >= n) continue;
      s += referenceWaveform[i] * targetWaveform[j];
    }
    if (s > bestScore) { bestScore = s; bestLag = lag; }
  }
  return bestLag;
}

export function planProxy(width: number, height: number, fps: number, codec: string): { proxyWidth: number; proxyHeight: number; proxyFps: number; proxyCodec: string; estimatedBitrateKbps: number } {
  const targetW = Math.min(1280, width);
  const scale = targetW / width;
  const proxyW = Math.round(width * scale);
  const proxyH = Math.round(height * scale);
  const bitrate = Math.round((proxyW * proxyH * fps) / 100);
  return { proxyWidth: proxyW, proxyHeight: proxyH, proxyFps: fps, proxyCodec: 'prores_proxy', estimatedBitrateKbps: bitrate };
}

export function shouldSmartRender(sourceCodec: string, targetCodec: string, hasEffects: boolean): boolean {
  if (hasEffects) return false;
  return sourceCodec === targetCodec;
}

export function detectSceneChanges(luminanceFrames: readonly number[], threshold: number = 0.3): number[] {
  const cuts: number[] = [];
  for (let i = 1; i < luminanceFrames.length; i++) {
    if (Math.abs(luminanceFrames[i] - luminanceFrames[i - 1]) >= threshold) cuts.push(i);
  }
  return cuts;
}

export function timecodeFromFrames(frames: number, fps: number): string {
  const total = Math.max(0, Math.floor(frames));
  const f = total % Math.round(fps);
  const s = Math.floor(total / fps);
  const sec = s % 60;
  const min = Math.floor(s / 60) % 60;
  const hr = Math.floor(s / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hr)}:${pad(min)}:${pad(sec)}:${pad(f)}`;
}

export function framesFromTimecode(tc: string, fps: number): number {
  const [hh, mm, ss, ff] = tc.split(':').map((n) => parseInt(n, 10) || 0);
  return Math.round((hh * 3600 + mm * 60 + ss) * fps + ff);
}

export function planRenderFarm(totalFrames: number, nodeCount: number, framesPerChunk: number): { node: number; startFrame: number; endFrame: number }[] {
  const chunks: { node: number; startFrame: number; endFrame: number }[] = [];
  let chunkIdx = 0;
  for (let f = 0; f < totalFrames; f += framesPerChunk) {
    chunks.push({ node: chunkIdx % Math.max(1, nodeCount), startFrame: f, endFrame: Math.min(totalFrames, f + framesPerChunk) });
    chunkIdx++;
  }
  return chunks;
}
