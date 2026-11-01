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

/** True unless the user turned "Allow Notifications" off (default on). */
export function notificationsAllowed(): boolean {
  try {
    return JSON.parse(localStorage.getItem('dex-settings') || '{}').enableNotifications !== false;
  } catch {
    return true;
  }
}
