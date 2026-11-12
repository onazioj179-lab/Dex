// =============================================================================
// DEX Platform — persistOrWarn: failed saves are reported, once per key
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { persistOrWarn, __resetPersistOrWarn } from '../../src/renderer/utils/persistOrWarn';

describe('persistOrWarn', () => {
  const toasts: string[] = [];
  const onToast = (e: Event) => toasts.push((e as CustomEvent).detail.message);
  beforeEach(() => { toasts.length = 0; __resetPersistOrWarn(); localStorage.clear(); window.addEventListener('dex-toast', onToast); });
  afterEach(() => { window.removeEventListener('dex-toast', onToast); vi.restoreAllMocks(); });

  it('saves and reports success', () => {
    expect(persistOrWarn('k', 'v', 'thing')).toBe(true);
    expect(localStorage.getItem('k')).toBe('v');
    expect(toasts).toEqual([]);
  });

  it('reports a full store once per key until a save succeeds again', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    expect(persistOrWarn('k', 'a', 'your boards')).toBe(false);
    expect(persistOrWarn('k', 'b', 'your boards')).toBe(false);
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toContain("Couldn't save your boards");
    expect(persistOrWarn('other', 'c', 'notes')).toBe(false);
    expect(toasts).toHaveLength(2);
    spy.mockRestore();
    expect(persistOrWarn('k', 'd', 'your boards')).toBe(true);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    expect(persistOrWarn('k', 'e', 'your boards')).toBe(false);
    expect(toasts).toHaveLength(3);
  });
});
