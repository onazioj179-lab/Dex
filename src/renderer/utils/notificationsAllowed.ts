// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Settings > Notifications > "Allow Notifications". It used to be read by
// nothing, so turning it off changed nothing. Every popup path (in-app banner,
// Windows toast, web Notification) now checks this; notifications still land
// quietly in the notification center so nothing is lost.
//

import { useAuthStore } from '../store/useAuthStore';

export const DND_KEY = 'dex-dnd';

/**
 * Control Center / Settings "Do Not Disturb". It used to call a native channel
 * that answered "not ported" and nothing read the flag, so it silenced nothing.
 * Now it is a persisted flag every popup and sound path checks.
 */
export function doNotDisturbOn(): boolean {
  try { return localStorage.getItem(DND_KEY) === '1'; } catch { return false; }
}

export function setDoNotDisturbFlag(on: boolean): void {
  try {
    if (on) localStorage.setItem(DND_KEY, '1');
    else localStorage.removeItem(DND_KEY);
  } catch { /* storage unavailable: state lives in the store only */ }
}

/** True unless the user turned "Allow Notifications" off (default on) or Do Not Disturb is on. */
export function notificationsAllowed(): boolean {
  if (doNotDisturbOn()) return false;
  try {
    return JSON.parse(localStorage.getItem('dex-settings') || '{}').enableNotifications !== false;
  } catch {
    return true;
  }
}

/** Settings > Notifications > "Sound" (default on); off while Do Not Disturb is on. */
export function notificationSoundEnabled(): boolean {
  if (doNotDisturbOn()) return false;
  try {
    return JSON.parse(localStorage.getItem('dex-settings') || '{}').soundEnabled !== false;
  } catch {
    return true;
  }
}

/**
 * Flags for `notification-center:send`. Windows toasts appear on the desktop
 * ABOVE DEX's lock screen, so while DEX is locked they must not reveal the
 * notification's content: the native side then shows a generic "DEX / You
 * have a new notification". The full text stays in the notification center.
 */
export function osToastFlags(): { osToast: boolean; osToastPrivate: boolean; osToastSound: boolean } {
  let locked = false;
  try {
    const a = useAuthStore.getState();
    locked = Boolean(a.isLocked && a.isEnabled);
  } catch { /* store unavailable: treat as unlocked */ }
  return { osToast: notificationsAllowed(), osToastPrivate: locked, osToastSound: notificationSoundEnabled() };
}
