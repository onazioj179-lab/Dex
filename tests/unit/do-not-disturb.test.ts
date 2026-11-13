// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Do Not Disturb (Control Center, Settings) called a native channel that
// answered "not ported" and nothing read the flag: it silenced nothing.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  doNotDisturbOn, notificationsAllowed, notificationSoundEnabled, osToastFlags, DND_KEY,
} from '../../src/renderer/utils/notificationsAllowed';
import { useNotificationCenterStore } from '../../src/renderer/store/unifiedSystemsStore';

describe('Do Not Disturb', () => {
  beforeEach(() => { localStorage.clear(); useNotificationCenterStore.setState({ doNotDisturb: false }); });

  it('is off by default and lets notifications through', () => {
    expect(doNotDisturbOn()).toBe(false);
    expect(notificationsAllowed()).toBe(true);
    expect(notificationSoundEnabled()).toBe(true);
  });

  it('turning it on silences banners, sounds and Windows toasts, and persists', async () => {
    await useNotificationCenterStore.getState().setDoNotDisturb(true);
    expect(useNotificationCenterStore.getState().doNotDisturb).toBe(true);
    expect(localStorage.getItem(DND_KEY)).toBe('1');
    expect(notificationsAllowed()).toBe(false);
    expect(notificationSoundEnabled()).toBe(false);
    expect(osToastFlags().osToast).toBe(false);
  });

  it('turning it off restores the user settings', async () => {
    await useNotificationCenterStore.getState().setDoNotDisturb(true);
    await useNotificationCenterStore.getState().setDoNotDisturb(false);
    expect(localStorage.getItem(DND_KEY)).toBeNull();
    expect(notificationsAllowed()).toBe(true);
    localStorage.setItem('dex-settings', JSON.stringify({ soundEnabled: false }));
    expect(notificationSoundEnabled()).toBe(false);
  });
});
