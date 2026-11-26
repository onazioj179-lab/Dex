// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Apps that were merged into another app's tabs. Anything that still opens the
// old id (a pin, a shortcut, UKI, a restored session) lands on the right tab
// of the app that now holds it.

export const MERGED_APPS: Record<string, { to: string; tab: string }> = {
  kanban: { to: 'activity', tab: 'board' },
  liveactivity: { to: 'activity', tab: 'live' },
  learn: { to: 'activity', tab: 'learn' },
  uki: { to: 'nexus', tab: 'uki' },
};

export const APP_TAB_EVENT = 'dex-app-tab';
const key = (appId: string) => `dex-app-tab:${appId}`;

/** Ask `appId` to show `tab` (now if it is mounted, else when it mounts). */
export function requestAppTab(appId: string, tab: string): void {
  try { localStorage.setItem(key(appId), tab); } catch { /* storage blocked */ }
  try { window.dispatchEvent(new CustomEvent(APP_TAB_EVENT, { detail: { appId, tab } })); } catch { /* non-DOM */ }
}

export function storedAppTab(appId: string): string | null {
  try { return localStorage.getItem(key(appId)); } catch { return null; }
}
