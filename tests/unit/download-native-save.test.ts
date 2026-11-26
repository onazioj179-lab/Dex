// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi } from 'vitest';
import { saveBlobNative } from '../../src/renderer/improvements500/downloadBlob';

describe('exports in the desktop app', () => {
  it('asks where to save, then writes the exact bytes', async () => {
    const invoke = vi.fn(async (ch: string) => (ch === 'dialog:showSaveDialog' ? { canceled: false, filePath: 'C:\out\trip.gpx' } : { ok: true }));
    const path = await saveBlobNative(invoke, 'trip.gpx', new Blob(['<gpx/>']));
    expect(path).toBe('C:\out\trip.gpx');
    expect(invoke).toHaveBeenCalledWith('dialog:showSaveDialog', expect.objectContaining({ defaultPath: 'trip.gpx', filters: [{ name: 'GPX', extensions: ['gpx'] }] }));
    expect(invoke).toHaveBeenCalledWith('fs:writeBase64', 'C:\out\trip.gpx', btoa('<gpx/>'));
  });

  it('does nothing when cancelled and reports a failed write', async () => {
    expect(await saveBlobNative(vi.fn().mockResolvedValue({ canceled: true }), 'a.txt', new Blob(['x']))).toBeNull();
    const fail = vi.fn(async (ch: string) => (ch === 'dialog:showSaveDialog' ? { filePath: 'C:\a.txt' } : { ok: false, error: 'disk full' }));
    await expect(saveBlobNative(fail, 'a.txt', new Blob(['x']))).rejects.toThrow('disk full');
  });
});
