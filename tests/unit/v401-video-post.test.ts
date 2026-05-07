// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Platform v4.0.1 - Wave C video post tests
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  chooseProxySpec, estimateProxyBytes, proxyCacheKey,
  detectScenes,
  alignClipsByAudio,
  parseSrt, serializeSrt, parseVtt, serializeVtt,
  computeHistogram,
  runQc,
  framesToTimecode, timecodeToFrames,
} from '../../src/shared/video/post';

describe('proxy spec', () => {
  it('chooses prores for 4K', () => {
    const s = chooseProxySpec({ id: '1', width: 3840, height: 2160, fps: 30, durationMs: 60000, bytes: 5e10 }, 50);
    expect(s.codec).toBe('prores_proxy');
  });
  it('chooses h264 for 1080', () => {
    const s = chooseProxySpec({ id: '1', width: 1920, height: 1080, fps: 30, durationMs: 60000, bytes: 1e9 }, 50);
    expect(s.codec).toBe('h264');
  });
  it('estimateProxyBytes scales with duration', () => {
    const s = { resolution: 'half' as const, codec: 'h264' as const, bitrateMbps: 8 };
    expect(estimateProxyBytes({ id: '1', width: 1920, height: 1080, fps: 30, durationMs: 10000, bytes: 0 }, s)).toBeGreaterThan(0);
  });
  it('cache key deterministic', () => {
    const s = { resolution: 'half' as const, codec: 'h264' as const, bitrateMbps: 8 };
    expect(proxyCacheKey('a', s)).toBe(proxyCacheKey('a', s));
  });
});

describe('scene detection', () => {
  it('finds luma jump cuts', () => {
    const frames = [
      { timeMs: 0, meanLuma: 10, histogramHash: 0.1 },
      { timeMs: 100, meanLuma: 12, histogramHash: 0.1 },
      { timeMs: 200, meanLuma: 200, histogramHash: 0.9 },
      { timeMs: 300, meanLuma: 200, histogramHash: 0.9 },
    ];
    const cuts = detectScenes(frames);
    expect(cuts.length).toBeGreaterThan(0);
  });
  it('respects min scene length', () => {
    const frames = Array.from({ length: 20 }, (_, i) => ({ timeMs: i * 50, meanLuma: i * 30, histogramHash: i * 0.05 }));
    const cuts = detectScenes(frames, { minSceneMs: 1000 });
    expect(cuts.length).toBeLessThan(5);
  });
});

describe('audio align', () => {
  it('finds zero offset on identical', () => {
    const sr = 8000;
    const samples = new Float32Array(sr);
    for (let i = 0; i < sr; i++) samples[i] = Math.sin(i * 0.05);
    const ref = { id: 'r', samples, sampleRate: sr, offsetMs: 0 };
    const other = { id: 'o', samples, sampleRate: sr, offsetMs: 0 };
    const out = alignClipsByAudio(ref, [other], 200);
    expect(Math.abs(out[0].offsetMs)).toBeLessThan(50);
  });
});

describe('SRT', () => {
  const sample = `1\n00:00:01,500 --> 00:00:02,800\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld\n`;
  it('parses', () => {
    const cues = parseSrt(sample);
    expect(cues).toHaveLength(2);
    expect(cues[0].startMs).toBe(1500);
    expect(cues[0].endMs).toBe(2800);
    expect(cues[1].text).toBe('World');
  });
  it('round-trips', () => {
    const cues = parseSrt(sample);
    const ser = serializeSrt(cues);
    expect(parseSrt(ser)).toEqual(cues);
  });
});

describe('VTT', () => {
  it('parses VTT', () => {
    const text = `WEBVTT\n\n00:00:01.500 --> 00:00:02.800\nHi`;
    const cues = parseVtt(text);
    expect(cues[0].startMs).toBe(1500);
  });
  it('serializes VTT', () => {
    const out = serializeVtt([{ index: 1, startMs: 1500, endMs: 2800, text: 'Hi' }]);
    expect(out).toMatch(/WEBVTT/);
    expect(out).toMatch(/00:00:01.500/);
  });
});

describe('histogram', () => {
  it('counts pixels', () => {
    const px = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]);
    const h = computeHistogram(px);
    expect(h.r[0]).toBe(1);
    expect(h.r[255]).toBe(1);
  });
});

describe('QC', () => {
  it('passes good clip', () => {
    const r = runQc({ width: 1920, height: 1080, fps: 30, durationMs: 5000, hasAudio: true, hasVideo: true }, {});
    expect(r.ok).toBe(true);
  });
  it('flags odd dimensions', () => {
    const r = runQc({ width: 1921, height: 1080, fps: 30, durationMs: 5000, hasAudio: false, hasVideo: true }, {});
    expect(r.issues.find(i => i.id === 'odd-dim')).toBeDefined();
  });
  it('flags peak over target', () => {
    const r = runQc({ width: 1920, height: 1080, fps: 30, durationMs: 5000, hasAudio: true, hasVideo: true, truePeakDb: -0.1 }, { truePeakDb: -1 });
    expect(r.ok).toBe(false);
  });
});

describe('timecode', () => {
  it('frames -> timecode', () => {
    expect(framesToTimecode(48, 24)).toBe('00:00:02:00');
  });
  it('round-trips', () => {
    expect(timecodeToFrames(framesToTimecode(150, 30), 30)).toBe(150);
  });
});
