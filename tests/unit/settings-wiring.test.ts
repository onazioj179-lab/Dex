// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Settings that used to be saved but read by nothing are now honored:
// "Allow Notifications" and the UKI toggles (via readDexSetting/useDexSetting).
//
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { notificationsAllowed, osToastFlags } from '../../src/renderer/utils/notificationsAllowed';
import { useAuthStore } from '../../src/renderer/store/useAuthStore';
import { readDexSetting, useDexSetting } from '../../src/renderer/hooks/useDexSetting';

const save = (s: Record<string, unknown>) => {
  localStorage.setItem('dex-settings', JSON.stringify(s));
  window.dispatchEvent(new CustomEvent('dex-settings-changed'));
};

describe('notificationsAllowed', () => {
  beforeEach(() => localStorage.clear());
  it('defaults to allowed and honors the toggle', () => {
    expect(notificationsAllowed()).toBe(true);
    save({ enableNotifications: false });
    expect(notificationsAllowed()).toBe(false);
    localStorage.setItem('dex-settings', '{broken');
    expect(notificationsAllowed()).toBe(true);
  });
});

describe('readDexSetting / useDexSetting', () => {
  beforeEach(() => localStorage.clear());
  it('falls back when unset and reads saved values', () => {
    expect(readDexSetting('ukiEnabled', true)).toBe(true);
    save({ ukiEnabled: false });
    expect(readDexSetting('ukiEnabled', true)).toBe(false);
  });
  it('re-renders when Settings saves', () => {
    const { result } = renderHook(() => useDexSetting('ukiShowTranscript', true));
    expect(result.current).toBe(true);
    act(() => save({ ukiShowTranscript: false }));
    expect(result.current).toBe(false);
  });
});

describe('OS toasts while DEX is locked', () => {
  beforeEach(() => localStorage.clear());
  it('are private only when a lock is enabled AND active', () => {
    useAuthStore.setState({ isLocked: false, isEnabled: true });
    expect(osToastFlags()).toEqual({ osToast: true, osToastPrivate: false });
    useAuthStore.setState({ isLocked: true, isEnabled: true });
    expect(osToastFlags()).toEqual({ osToast: true, osToastPrivate: true });
    useAuthStore.setState({ isLocked: true, isEnabled: false });
    expect(osToastFlags().osToastPrivate).toBe(false);
    save({ enableNotifications: false });
    expect(osToastFlags().osToast).toBe(false);
    useAuthStore.setState({ isLocked: false });
  });
});
