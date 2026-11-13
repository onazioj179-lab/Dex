// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi } from 'vitest';
import { appBackLabel, registerBackHandler, tryAppBack, tryAppForward } from '../../src/renderer/services/backNavigation';

describe('system back (predictive)', () => {
  it('the front app handles Back while it has somewhere to go', () => {
    let idx = 2;
    const off = registerBackHandler('files', {
      canGoBack: () => idx > 0,
      goBack: () => { idx--; },
      canGoForward: () => idx < 2,
      goForward: () => { idx++; },
      backLabel: () => ['C:', 'Users', 'Docs'][idx - 1] ?? null,
    });
    expect(appBackLabel('files')).toBe('Users');
    expect(tryAppBack('files')).toBe(true);
    expect(tryAppBack('files')).toBe(true);
    expect(idx).toBe(0);
    // Nowhere left: the shell switches apps instead.
    expect(tryAppBack('files')).toBe(false);
    expect(appBackLabel('files')).toBeNull();
    expect(tryAppForward('files')).toBe(true);
    expect(idx).toBe(1);
    off();
    expect(tryAppBack('files')).toBe(false);
  });

  it('apps without a handler, or a throwing one, fall through to the shell', () => {
    expect(tryAppBack('notes')).toBe(false);
    expect(tryAppBack(null)).toBe(false);
    const off = registerBackHandler('bad', { canGoBack: () => { throw new Error('x'); }, goBack: vi.fn() });
    expect(tryAppBack('bad')).toBe(false);
    off();
  });

  it('an old registration cannot remove a newer one', () => {
    const offOld = registerBackHandler('browser', { canGoBack: () => true, goBack: vi.fn() });
    const go = vi.fn();
    const offNew = registerBackHandler('browser', { canGoBack: () => true, goBack: go });
    offOld();
    expect(tryAppBack('browser')).toBe(true);
    expect(go).toHaveBeenCalled();
    offNew();
  });
});
