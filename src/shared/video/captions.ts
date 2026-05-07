// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Platform - DEX v3.10.0 wave R - captions (SRT/VTT/TTML/SCC)
// =============================================================================

export interface Caption { readonly start: number; readonly end: number; readonly text: string }

function pad(n: number, w: number = 2): string { return String(n).padStart(w, '0'); }

function formatSrtTime(s: number): string {
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(sec)},${pad(milli, 3)}`;
}

function formatVttTime(s: number): string {
  return formatSrtTime(s).replace(',', '.');
}

function parseSrtTime(s: string): number {
  const m = /^(\d+):(\d+):(\d+)[,.](\d+)$/.exec(s.trim());
  if (!m) return 0;
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10) + parseInt(m[4], 10) / 1000;
}

export function parseSrt(input: string): Caption[] {
  const out: Caption[] = [];
  const blocks = input.replace(/\r\n/g, '\n').trim().split(/\n{2,}/);
  for (const b of blocks) {
    const lines = b.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length < 2) continue;
    const timing = lines[0].includes('-->') ? lines[0] : lines[1];
    const idx = lines.indexOf(timing);
    const tm = /(\S+)\s*-->\s*(\S+)/.exec(timing);
    if (!tm) continue;
    out.push({ start: parseSrtTime(tm[1]), end: parseSrtTime(tm[2]), text: lines.slice(idx + 1).join('\n') });
  }
  return out;
}

export function renderSrt(caps: readonly Caption[]): string {
  return caps.map((c, i) => `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.text}`).join('\n\n') + '\n';
}

export function renderVtt(caps: readonly Caption[]): string {
  const body = caps.map((c) => `${formatVttTime(c.start)} --> ${formatVttTime(c.end)}\n${c.text}`).join('\n\n');
  return `WEBVTT\n\n${body}\n`;
}

export function renderTtml(caps: readonly Caption[]): string {
  const body = caps.map((c) => `<p begin="${c.start.toFixed(3)}s" end="${c.end.toFixed(3)}s">${c.text}</p>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<tt xmlns="http://www.w3.org/ns/ttml"><body><div>\n${body}\n</div></body></tt>`;
}

export function shiftCaptions(caps: readonly Caption[], deltaSeconds: number): Caption[] {
  return caps.map((c) => ({ start: Math.max(0, c.start + deltaSeconds), end: Math.max(0, c.end + deltaSeconds), text: c.text }));
}

export function chromaKey(rgb: readonly [number, number, number], keyHueDeg: number, tolerance: number): number {
  // returns alpha 0..1 (0 = keyed out)
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const diff = Math.abs(((h - keyHueDeg + 540) % 360) - 180);
  const sat = max === 0 ? 0 : d / max;
  if (sat < 0.1) return 1;
  return diff < tolerance ? 0 : Math.min(1, (diff - tolerance) / 30);
}

export function lumaKey(luma: number, low: number, high: number): number {
  if (luma <= low) return 0;
  if (luma >= high) return 1;
  return (luma - low) / (high - low);
}

export interface CodecPreset { codec: string; container: string; bitrateKbps: number; pixelFormat: string }

export const CODEC_PRESETS: Readonly<Record<string, CodecPreset>> = {
  youtube_1080p: { codec: 'h264', container: 'mp4', bitrateKbps: 8000, pixelFormat: 'yuv420p' },
  youtube_4k: { codec: 'h265', container: 'mp4', bitrateKbps: 35000, pixelFormat: 'yuv420p10le' },
  prores_422: { codec: 'prores', container: 'mov', bitrateKbps: 147000, pixelFormat: 'yuv422p10le' },
  dnxhd_185: { codec: 'dnxhd', container: 'mxf', bitrateKbps: 185000, pixelFormat: 'yuv422p' },
  web_av1: { codec: 'av1', container: 'webm', bitrateKbps: 4500, pixelFormat: 'yuv420p' },
};

export function checkLoudness(programLufs: number, targetLufs: number, tolerance: number = 1): { pass: boolean; deltaDb: number } {
  const delta = programLufs - targetLufs;
  return { pass: Math.abs(delta) <= tolerance, deltaDb: delta };
}

export function checkBroadcastLegal(rgb: RGB): boolean {
  return rgb.every((c) => c >= 0.064 && c <= 0.94);
}

type RGB = readonly [number, number, number];
