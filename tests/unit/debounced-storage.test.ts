// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debouncedStorage, sharedDebouncedStorage } from '../../src/renderer/utils/debouncedStorage';
import { __resetPersistOrWarn } from '../../src/renderer/utils/persistOrWarn';

describe('debounced workspace storage', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetPersistOrWarn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('preserves existing DEX data when a write exceeds the quota', () => {
    localStorage.setItem('dex-notes-draft', 'Keep this draft');
    const storage = debouncedStorage();
    const toast = vi.fn();
    window.addEventListener('dex-toast', toast);
    try {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Storage full', 'QuotaExceededError');
      });
      storage.setItem('dex-spatial-v1', 'new layout');
      vi.advanceTimersByTime(250);
      expect(localStorage.getItem('dex-notes-draft')).toBe('Keep this draft');
      expect(localStorage.getItem('dex-spatial-v1')).toBeNull();
      expect(toast).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('dex-toast', toast);
    }
  });

  it.each(['beforeunload', 'pagehide'])('saves the latest queued layout on %s', (event) => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    sharedDebouncedStorage.setItem('dex-spatial-v1', 'old layout');
    sharedDebouncedStorage.setItem('dex-spatial-v1', 'latest layout');
    expect(localStorage.getItem('dex-spatial-v1')).toBeNull();
    window.dispatchEvent(new Event(event));
    expect(localStorage.getItem('dex-spatial-v1')).toBe('latest layout');
    vi.advanceTimersByTime(250);
    expect(write.mock.calls).toEqual([['dex-spatial-v1', 'latest layout']]);
  });
});
