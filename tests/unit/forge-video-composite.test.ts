// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// FORGE WebM compositing: the Crop & Pad, Watermark and Subtitle panels used to
// record settings that no encoder read. These pin the geometry they now drive.

import { describe, it, expect, vi } from 'vitest';
import {
  framedOutputSize, frameRects, anchorBox, activeCue, drawComposite,
} from '../../src/renderer/DEXAPPLICATIONS/forge/videoComposite';

describe('framedOutputSize', () => {
  it('keeps the source shape for free, and sets an even width from the ratio otherwise', () => {
    expect(framedOutputSize(1280, 720, 'free')).toEqual({ width: 1280, height: 720 });
    expect(framedOutputSize(1280, 720, '1:1')).toEqual({ width: 720, height: 720 });
    expect(framedOutputSize(1280, 720, '9:16')).toEqual({ width: 406, height: 720 });
    expect(framedOutputSize(1920, 1080, '4:3')).toEqual({ width: 1440, height: 1080 });
  });
});

describe('frameRects', () => {
  it('crop takes the centred region with the output ratio and fills the frame', () => {
    const { src, dst } = frameRects(1920, 1080, 1080, 1080, 'crop');
    expect(src).toEqual({ x: 420, y: 0, w: 1080, h: 1080 });
    expect(dst).toEqual({ x: 0, y: 0, w: 1080, h: 1080 });
  });
  it('pad fits the whole source and centres it', () => {
    const { src, dst } = frameRects(1920, 1080, 1080, 1080, 'pad');
    expect(src).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
    expect(dst.x).toBe(0);
    expect(dst.w).toBe(1080);
    expect(dst.h).toBeCloseTo(607.5);
    expect(dst.y).toBeCloseTo((1080 - 607.5) / 2);
  });
  it('crops a tall source vertically', () => {
    const { src } = frameRects(1080, 1920, 1280, 720, 'crop');
    expect(src.w).toBe(1080);
    expect(src.h).toBeCloseTo(607.5);
    expect(src.y).toBeCloseTo((1920 - 607.5) / 2);
  });
});

describe('anchorBox', () => {
  it('places boxes at each corner with the margin', () => {
    expect(anchorBox('top-left', 1000, 500, 100, 20, 10)).toEqual({ x: 10, y: 10 });
    expect(anchorBox('bottom-right', 1000, 500, 100, 20, 10)).toEqual({ x: 890, y: 470 });
    expect(anchorBox('top-center', 1000, 500, 100, 20, 10)).toEqual({ x: 450, y: 10 });
    expect(anchorBox('center', 1000, 500, 100, 20, 10)).toEqual({ x: 450, y: 240 });
  });
});

describe('activeCue', () => {
  const cues = [{ start: 5, end: 7, text: 'b' }, { start: 1, end: 3, text: 'a' }];
  it('finds the cue on screen, end exclusive', () => {
    expect(activeCue(cues, 1)?.text).toBe('a');
    expect(activeCue(cues, 6.9)?.text).toBe('b');
    expect(activeCue(cues, 3)).toBeNull();
    expect(activeCue(cues, 4)).toBeNull();
  });
});

describe('drawComposite', () => {
  function fakeCtx() {
    const calls: Array<[string, ...unknown[]]> = [];
    const ctx: Record<string, unknown> = {
      save: () => calls.push(['save']), restore: () => calls.push(['restore']),
      fillRect: (...a: unknown[]) => calls.push(['fillRect', ...a]),
      drawImage: (...a: unknown[]) => calls.push(['drawImage', ...a]),
      fillText: (...a: unknown[]) => calls.push(['fillText', ...a]),
      strokeText: (...a: unknown[]) => calls.push(['strokeText', ...a]),
      measureText: (t: string) => ({ width: t.length * 10 }),
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  }
  const src = {} as CanvasImageSource;

  it('pads, draws the frame, a text watermark and the current outlined cue', () => {
    const { ctx, calls } = fakeCtx();
    drawComposite(ctx, src, 1920, 1080, 720, 720, {
      aspect: '1:1', mode: 'pad', padColor: '#112233',
      watermark: { type: 'text', text: 'DEX', opacity: 50, position: 'bottom-right' },
      subtitles: { cues: [{ start: 0, end: 2, text: 'Hello\nworld' }], font: 'Arial', size: 24, position: 'Bottom', style: 'Outline' },
    }, 1);
    expect(calls[0]).toEqual(['fillRect', 0, 0, 720, 720]);
    expect(calls[1][0]).toBe('drawImage');
    const texts = calls.filter(c => c[0] === 'fillText').map(c => c[1]);
    expect(texts).toEqual(['DEX', 'Hello', 'world']);
    expect(calls.filter(c => c[0] === 'strokeText')).toHaveLength(2);
  });

  it('draws no cue outside its time and no padding when cropping', () => {
    const { ctx, calls } = fakeCtx();
    drawComposite(ctx, src, 1920, 1080, 720, 720, {
      aspect: '1:1', mode: 'crop',
      subtitles: { cues: [{ start: 0, end: 2, text: 'x' }], font: 'Arial', size: 24, position: 'Top', style: 'Box' },
    }, 5);
    expect(calls.map(c => c[0])).toEqual(['drawImage']);
  });

  it('skips an image watermark whose image did not load', () => {
    const { ctx, calls } = fakeCtx();
    const warn = vi.fn();
    drawComposite(ctx, src, 100, 100, 100, 100, { watermark: { type: 'image', opacity: 80, position: 'center' } }, 0);
    expect(calls.filter(c => c[0] === 'drawImage')).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('jobEffectTags', () => {
  it('lists what a job will apply, and nothing for a plain job', async () => {
    const { jobEffectTags } = await import('../../src/renderer/DEXAPPLICATIONS/forge/Forge');
    expect(jobEffectTags({})).toEqual([]);
    expect(jobEffectTags({ trimIn: 0.1, trimOut: 0.5, cropAspect: '1:1', cropMode: 'pad', watermark: { type: 'text' }, subtitleBurnIn: {}, subtitleCues: [{}, {}] }))
      .toEqual(['Trim 10–50%', 'Pad 1:1', 'Watermark', 'Subtitles (2)']);
    expect(jobEffectTags({ cropAspect: 'free', trimIn: 0, trimOut: 1 })).toEqual([]);
  });
});
