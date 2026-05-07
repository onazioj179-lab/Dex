// =============================================================================
// DEX Platform - DEX v3.10.0 wave R - video pipeline tests
// =============================================================================
import { describe, expect, it } from 'vitest';
import {
  CODEC_PRESETS, acesToneMap, buildHistogram, buildVectorscope, buildWaveformScope,
  checkBroadcastLegal, checkLoudness, chromaKey, detectSceneChanges, framesFromTimecode,
  liftGammaGain, linearToSrgb, lumaKey, multicamSyncOffset, parseSrt, planProxy,
  planRenderFarm, renderSrt, renderTtml, renderVtt, rgbToHsv, rgbToLuma709, rgbToLuma2020,
  rgbToYCbCr, rippleEdit, rollEdit, shouldSmartRender, shiftCaptions, slideEdit, slipEdit,
  srgbToLinear, timecodeFromFrames,
} from '../../src/shared/video';
import type { Clip } from '../../src/shared/video';

const baseClips: Clip[] = [
  { id: 'a', track: 0, start: 0, duration: 100, sourceIn: 0, sourceDuration: 200 },
  { id: 'b', track: 0, start: 100, duration: 100, sourceIn: 0, sourceDuration: 200 },
  { id: 'c', track: 0, start: 200, duration: 100, sourceIn: 0, sourceDuration: 200 },
];

describe('wave R video pipeline', () => {
  it('ripple shifts downstream clips', () => {
    const r = rippleEdit(baseClips, 'a', 20);
    expect(r[0].duration).toBe(120);
    expect(r[1].start).toBe(120);
    expect(r[2].start).toBe(220);
  });
  it('roll moves boundary preserving program duration', () => {
    const r = rollEdit(baseClips, 'a', 'b', 10);
    expect(r[0].duration).toBe(110);
    expect(r[1].start).toBe(110);
    expect(r[1].duration).toBe(90);
  });
  it('slip clamps to source extents', () => {
    const s = slipEdit(baseClips[0], 50);
    expect(s.sourceIn).toBe(50);
    const overflow = slipEdit(baseClips[0], 999);
    expect(overflow.sourceIn).toBe(100);
  });
  it('slide preserves middle clip duration', () => {
    const s = slideEdit(baseClips, 'b', 5);
    expect(s[1].duration).toBe(100);
    expect(s[0].duration).toBe(105);
    expect(s[2].duration).toBe(95);
  });
  it('multicam finds best lag', () => {
    const ref = [0, 1, 0, 0, 0, 1, 0, 0];
    const tgt = [0, 0, 0, 1, 0, 0, 0, 1];
    expect(multicamSyncOffset(ref, tgt, 4)).toBe(2);
  });
  it('plans proxy size & bitrate', () => {
    const p = planProxy(3840, 2160, 24, 'h264');
    expect(p.proxyWidth).toBe(1280);
    expect(p.proxyHeight).toBe(720);
    expect(p.estimatedBitrateKbps).toBeGreaterThan(0);
  });
  it('smart render only when codec match without effects', () => {
    expect(shouldSmartRender('h264', 'h264', false)).toBe(true);
    expect(shouldSmartRender('h264', 'h264', true)).toBe(false);
    expect(shouldSmartRender('h264', 'h265', false)).toBe(false);
  });
  it('detects scene cuts above threshold', () => {
    expect(detectSceneChanges([0.1, 0.1, 0.5, 0.5, 0.1], 0.3)).toEqual([2, 4]);
  });
  it('timecode round trip', () => {
    const tc = timecodeFromFrames(3725, 24);
    expect(framesFromTimecode(tc, 24)).toBe(3725);
  });
  it('plans render farm chunks', () => {
    const c = planRenderFarm(100, 4, 30);
    expect(c.length).toBe(4);
    expect(c[0]).toEqual({ node: 0, startFrame: 0, endFrame: 30 });
    expect(c[3]).toEqual({ node: 3, startFrame: 90, endFrame: 100 });
  });
});

describe('wave R color', () => {
  it('luma 709/2020 weights sum to 1', () => {
    expect(rgbToLuma709(1, 1, 1)).toBeCloseTo(1, 6);
    expect(rgbToLuma2020(1, 1, 1)).toBeCloseTo(1, 6);
  });
  it('YCbCr round-trips zero on grey', () => {
    const v = rgbToYCbCr(0.5, 0.5, 0.5);
    expect(v.cb).toBeCloseTo(0, 6);
    expect(v.cr).toBeCloseTo(0, 6);
  });
  it('sRGB transfer round-trips', () => {
    expect(linearToSrgb(srgbToLinear(0.5))).toBeCloseTo(0.5, 5);
  });
  it('aces tone map clamps to 0..1', () => {
    expect(acesToneMap(0)).toBeCloseTo(0, 6);
    expect(acesToneMap(10)).toBeLessThanOrEqual(1);
  });
  it('lift gamma gain identity', () => {
    const out = liftGammaGain([0.5, 0.5, 0.5], [0, 0, 0], [1, 1, 1], [1, 1, 1]);
    expect(out[0]).toBeCloseTo(0.5, 6);
  });
  it('hsv from primary', () => {
    const r = rgbToHsv(1, 0, 0);
    expect(r.h).toBeCloseTo(0, 4);
    expect(r.s).toBeCloseTo(1, 4);
  });
  it('waveform/vectorscope/histogram populate', () => {
    expect(buildWaveformScope([0, 0.5, 1], 4).reduce((a, b) => a + b, 0)).toBe(3);
    expect(buildHistogram([0.1, 0.2], 8).reduce((a, b) => a + b, 0)).toBe(2);
    expect(buildVectorscope([{ cb: 0, cr: 0 }], 4).length).toBe(4);
  });
});

describe('wave R captions', () => {
  const sample = '1\n00:00:01,000 --> 00:00:02,500\nHello world\n\n2\n00:00:03,000 --> 00:00:04,000\nLine 2';
  it('parses SRT', () => {
    const c = parseSrt(sample);
    expect(c.length).toBe(2);
    expect(c[0].start).toBe(1);
    expect(c[0].end).toBe(2.5);
    expect(c[1].text).toBe('Line 2');
  });
  it('renders SRT round trip', () => {
    const c = parseSrt(sample);
    const out = renderSrt(c);
    expect(out).toContain('00:00:01,000 --> 00:00:02,500');
  });
  it('renders VTT header', () => {
    const out = renderVtt(parseSrt(sample));
    expect(out.startsWith('WEBVTT')).toBe(true);
    expect(out).toContain('.');
  });
  it('renders TTML xml', () => {
    const out = renderTtml(parseSrt(sample));
    expect(out).toContain('<tt');
    expect(out).toContain('begin="1.000s"');
  });
  it('shifts captions, clamps negative', () => {
    const c = shiftCaptions(parseSrt(sample), -5);
    expect(c[0].start).toBe(0);
  });
  it('chroma key returns 0 for matching hue', () => {
    expect(chromaKey([0, 1, 0], 120, 20)).toBe(0);
    expect(chromaKey([1, 0, 0], 120, 20)).toBeGreaterThan(0);
  });
  it('luma key ramps', () => {
    expect(lumaKey(0.1, 0.2, 0.8)).toBe(0);
    expect(lumaKey(0.9, 0.2, 0.8)).toBe(1);
    expect(lumaKey(0.5, 0.2, 0.8)).toBeCloseTo(0.5, 4);
  });
  it('codec presets populated', () => {
    expect(CODEC_PRESETS.youtube_1080p.codec).toBe('h264');
    expect(CODEC_PRESETS.prores_422.bitrateKbps).toBeGreaterThan(100000);
  });
  it('loudness within tolerance', () => {
    expect(checkLoudness(-23.5, -23, 1).pass).toBe(true);
    expect(checkLoudness(-19, -23, 1).pass).toBe(false);
  });
  it('broadcast legal range', () => {
    expect(checkBroadcastLegal([0.5, 0.5, 0.5])).toBe(true);
    expect(checkBroadcastLegal([0.99, 0.99, 0.99])).toBe(false);
  });
});
