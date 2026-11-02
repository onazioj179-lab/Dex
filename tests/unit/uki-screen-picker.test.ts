// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi } from 'vitest';
import { captureViaPicker } from '../../src/renderer/uki/screenCapture';

describe('UKI screen sharing via the system picker', () => {
  it('returns null when the user cancels the picker', async () => {
    const gdm = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    expect(await captureViaPicker(gdm)).toBeNull();
    expect(gdm).toHaveBeenCalledWith({ video: { frameRate: 1 }, audio: false });
  });

  it('always stops every track, even if reading the frame fails', async () => {
    const stop = vi.fn();
    const stream = { getVideoTracks: () => [{ stop }], getTracks: () => [{ stop }] } as unknown as MediaStream;
    const gdm = vi.fn().mockResolvedValue(stream);
    await captureViaPicker(gdm); // jsdom cannot play video -> null, but must still release
    expect(stop).toHaveBeenCalled();
  });

  it('is unavailable without a picker', async () => {
    expect(await captureViaPicker(null)).toBeNull();
  });
});
