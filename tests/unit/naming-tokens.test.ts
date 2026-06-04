import { describe, it, expect } from 'vitest';
import { resolveNaming, sanitizeFilename } from '../../src/shared/creative/namingTokens';

const NOW = new Date(2026, 5, 4, 9, 7, 3); // 2026-06-04 09:07:03

describe('naming tokens', () => {
  it('resolves the common tokens', () => {
    const out = resolveNaming('{name}_{preset}_{index}.{ext}', {
      name: 'clip', preset: 'h264', index: 5, ext: 'mp4', now: NOW,
    });
    expect(out).toBe('clip_h264_005.mp4');
  });

  it('resolves date/time and dimensions', () => {
    const out = resolveNaming('{name}-{date}-{time}-{width}x{height}', {
      name: 'shot', width: 1920, height: 1080, now: NOW,
    });
    expect(out).toBe('shot-2026-06-04-090703-1920x1080');
  });

  it('honors index padding', () => {
    expect(resolveNaming('{index}', { index: 7, indexPad: 4, now: NOW })).toBe('0007');
  });

  it('leaves unknown tokens intact', () => {
    expect(resolveNaming('{name}_{bogus}', { name: 'a', now: NOW })).toBe('a_{bogus}');
  });

  it('sanitizes illegal characters and preserves extension', () => {
    const out = resolveNaming('{name}.{ext}', { name: 'a/b:c*d', ext: 'png', now: NOW });
    expect(out).toBe('a_b_c_d.png');
  });

  it('sanitizeFilename strips separators and falls back', () => {
    expect(sanitizeFilename('a/b\\c')).toBe('a_b_c');
    expect(sanitizeFilename('')).toBe('untitled');
  });
});
