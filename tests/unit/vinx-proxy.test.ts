// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi } from 'vitest';
import { hasDiskPath, playbackSource, makeProxy } from '../../src/renderer/DEXAPPLICATIONS/vinx/mediaProxy';

describe('VINX editing proxies', () => {
  it('only disk-imported video can have a proxy', () => {
    expect(hasDiskPath({ type: 'video', path: 'C:\\clips\\a.mov' })).toBe(true);
    expect(hasDiskPath({ type: 'video', path: 'blob:http://x/1' })).toBe(false);
    expect(hasDiskPath({ type: 'audio', path: 'C:\\a.wav' })).toBe(false);
  });

  it('plays the proxy only while proxies are on and not exporting', () => {
    const m = { path: 'C:\\a.mov', proxyPath: 'C:\\out\\p.mp4' };
    expect(playbackSource(m, true, false)).toBe('C:\\out\\p.mp4');
    expect(playbackSource(m, true, true)).toBe('C:\\a.mov');
    expect(playbackSource(m, false, false)).toBe('C:\\a.mov');
    expect(playbackSource({ path: 'C:\\a.mov', proxyPath: null }, true, false)).toBe('C:\\a.mov');
  });

  it('asks the native transcoder for a scaled H.264 copy', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true, output: 'C:\\out\\p.mp4' });
    const r = await makeProxy({ type: 'video', path: 'C:\\a.mov' }, { resolution: '1/4' }, invoke);
    expect(r).toEqual({ ok: true, proxyPath: 'C:\\out\\p.mp4' });
    expect(invoke).toHaveBeenCalledWith('video:transcode', 'C:\\a.mov', expect.objectContaining({ scale: '1/4', videoCodec: 'libx264' }));
  });

  it('reports a missing ffmpeg or blob media honestly', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: false, error: 'ffmpeg not found on PATH' });
    expect(await makeProxy({ type: 'video', path: 'C:\\a.mov' }, { resolution: '1/2' }, invoke)).toEqual({ ok: false, error: 'ffmpeg not found on PATH' });
    expect((await makeProxy({ type: 'video', path: 'blob:x' }, { resolution: '1/2' }, invoke)).ok).toBe(false);
  });
});
