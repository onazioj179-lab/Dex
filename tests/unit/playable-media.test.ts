// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { localPathOf, needsPreparing, preparePlayable } from '../../src/renderer/services/media/playableMedia';
import { timeAt, formatMediaTime } from '../../src/renderer/components/media/MediaScrubber';
import { MEDIA_ORIGIN } from '../../src/renderer/utils/mediaUrl';

afterEach(() => { delete (globalThis as { dex?: unknown }).dex; });

function fakeBridge(prepareResult: Record<string, unknown>, events: Array<[string, Record<string, unknown>]> = []) {
  const handlers = new Map<string, (...a: unknown[]) => void>();
  const dex = {
    invoke: vi.fn(async () => {
      // Events arrive after the call answers, as they do from the native thread.
      setTimeout(() => { for (const [ch, p] of events) handlers.get(ch)?.(p); }, 0);
      return prepareResult;
    }),
    on: (ch: string, fn: (...a: unknown[]) => void) => { handlers.set(ch, fn); },
    off: vi.fn(),
  };
  (globalThis as { dex?: unknown }).dex = dex;
  return dex;
}

describe('playable media', () => {
  it('finds the local file behind a media src', () => {
    expect(localPathOf(`${MEDIA_ORIGIN}/${encodeURIComponent('C:\\Videos\\a b.mkv')}`)).toBe('C:\\Videos\\a b.mkv');
    expect(localPathOf('C:\\x.avi')).toBe('C:\\x.avi');
    expect(localPathOf('https://example.com/a.mp4')).toBeNull();
    expect(localPathOf('blob:abc')).toBeNull();
  });

  it('streams playable types and prepares the rest', () => {
    for (const f of ['a.mp4', 'a.webm', 'a.mp3', 'a.flac', 'a.MOV', 'a.m4a']) expect(needsPreparing(f)).toBe(false);
    for (const f of ['a.mkv', 'a.avi', 'a.wmv', 'a.flv', 'a.wma', 'a.ape', 'a.aiff', 'a.ts']) expect(needsPreparing(f)).toBe(true);
  });

  it('returns the cached file at once when it is ready', async () => {
    fakeBridge({ ok: true, status: 'ready', path: 'C:\\cache\\x.mp4' });
    await expect(preparePlayable('C:\\v.mkv')).resolves.toMatch(/cache.x\.mp4$/);
  });

  it('follows progress events to the converted file', async () => {
    fakeBridge({ ok: true, status: 'working', id: 'j1' }, [
      ['media:prepare-progress', { id: 'other', percent: 90 }],
      ['media:prepare-progress', { id: 'j1', percent: 40 }],
      ['media:prepare-done', { id: 'j1', ok: true, path: 'C:\\cache\\y.mp4' }],
    ]);
    const seen: number[] = [];
    const url = await preparePlayable('C:\\v.avi', (p) => seen.push(p));
    expect(seen).toEqual([40]);
    expect(url).toMatch(/cache.y\.mp4$/);
  });

  it('reports why a file cannot play', async () => {
    fakeBridge({ ok: false, needsFfmpeg: true, error: 'Playing this format needs FFmpeg.' });
    await expect(preparePlayable('C:\\v.wmv')).rejects.toThrow(/FFmpeg/);
    fakeBridge({ ok: true, status: 'working', id: 'j2' }, [['media:prepare-done', { id: 'j2', ok: false, error: 'bad file' }]]);
    await expect(preparePlayable('C:\\v.wmv')).rejects.toThrow('bad file');
  });

  it('scrubber maths', () => {
    expect(timeAt(150, 100, 200, 7200)).toBe(1800);
    expect(timeAt(50, 100, 200, 60)).toBe(0);
    expect(timeAt(400, 100, 200, 60)).toBe(60);
    expect(formatMediaTime(3725)).toBe('1:02:05');
    expect(formatMediaTime(65)).toBe('1:05');
  });
});
