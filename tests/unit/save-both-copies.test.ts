// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// A save counts when either copy (app storage or the native store) is written;
// the native reply is read, not ignored.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { saveBothCopies } from '../../src/renderer/utils/saveBothCopies';

const full = () => vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
const setBridge = (invoke?: (...a: unknown[]) => Promise<unknown>) => { (globalThis as any).dex = invoke ? { invoke } : undefined; };

describe('saveBothCopies', () => {
  afterEach(() => { vi.restoreAllMocks(); setBridge(undefined); localStorage.clear(); });

  it('preview (no bridge): ok when app storage takes it', async () => {
    const r = await saveBothCopies('k', '{"a":1}', 'the thing');
    expect(r).toEqual({ ok: true, local: true, native: null });
    expect(localStorage.getItem('k')).toBe('{"a":1}');
  });

  it('preview (no bridge): a full store is a failure with a reason', async () => {
    full();
    const r = await saveBothCopies('k', 'x', 'the thing');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Couldn't save the thing: app storage is full/);
  });

  it('full app storage but the native copy written: saved', async () => {
    full();
    const invoke = vi.fn().mockResolvedValue({ success: true });
    setBridge(invoke);
    const r = await saveBothCopies('k', 'x', 'the thing');
    expect(r).toEqual({ ok: true, local: false, native: true });
    expect(invoke).toHaveBeenCalledWith('capability:storage:set', 'k', 'x');
  });

  it('reads {success:false} and rejections from the native store', async () => {
    full();
    setBridge(vi.fn().mockResolvedValue({ success: false, error: 'disk full' }));
    expect((await saveBothCopies('k', 'x', 'it')).ok).toBe(false);
    setBridge(vi.fn().mockRejectedValue(new Error('ipc down')));
    const r = await saveBothCopies('k', 'x', 'it');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/DEX data folder could not be written/);
  });

  it('a throwing bridge does not break the local save', async () => {
    setBridge(() => { throw new Error('sync throw'); });
    const r = await saveBothCopies('k', 'y', 'it');
    expect(r).toEqual({ ok: true, local: true, native: false });
  });
});
