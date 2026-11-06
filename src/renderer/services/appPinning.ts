// =============================================================================
// DEX Platform — Shared app pinning service
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// The one API every surface uses to pin apps (App Menu, context menus, the
// title-bar menu, search results, Task Manager, Home). Backed by the single
// app pin store (store/dockPinStore.ts) so Dock and App Menu pins persist in
// one place, keyed by stable app ids, with no duplicates.

import { useShallow } from 'zustand/react/shallow';
import { useDockPins } from '../store/dockPinStore';
import { useInstalledAppsStore } from '../store/installedAppsStore';
import { APP_DEFINITIONS } from '../store/runningApps';
import { isPinnable } from './appRegistry';

export type PinTarget = 'dock' | 'menu';

const TARGET_LABEL: Record<PinTarget, string> = { dock: 'the Dock', menu: 'the App Menu' };

function toast(message: string) {
  try { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message } })); } catch { /* non-DOM */ }
}

function visible(id: string): boolean {
  if (!APP_DEFINITIONS[id]) return false;
  try { return useInstalledAppsStore.getState().isInstalled(id); } catch { return true; }
}

export const appPinning = {
  canPin: (appId: string): boolean => isPinnable(appId),

  isPinned(target: PinTarget, appId: string): boolean {
    const s = useDockPins.getState();
    return target === 'dock' ? s.isPinned(appId) : s.isMenuPinned(appId);
  },

  pin(target: PinTarget, appId: string, opts: { quiet?: boolean; index?: number } = {}): boolean {
    if (!isPinnable(appId)) return false;
    const s = useDockPins.getState();
    if (this.isPinned(target, appId) && opts.index === undefined) return true;
    if (target === 'dock') {
      if (opts.index !== undefined) s.moveTo(appId, opts.index); else s.pinApp(appId);
    } else s.pinToMenu(appId);
    const ok = this.isPinned(target, appId);
    if (!opts.quiet) toast(ok ? `Pinned ${APP_DEFINITIONS[appId]?.name ?? appId} to ${TARGET_LABEL[target]}` : `${TARGET_LABEL[target]} is full; unpin something first`);
    return ok;
  },

  unpin(target: PinTarget, appId: string, opts: { quiet?: boolean } = {}): void {
    const s = useDockPins.getState();
    if (!this.isPinned(target, appId)) return;
    if (target === 'dock') s.unpinApp(appId); else s.unpinFromMenu(appId);
    if (!opts.quiet) toast(`Unpinned ${APP_DEFINITIONS[appId]?.name ?? appId} from ${TARGET_LABEL[target]}`);
  },

  toggle(target: PinTarget, appId: string): void {
    if (this.isPinned(target, appId)) this.unpin(target, appId); else this.pin(target, appId);
  },

  /** Move an app within a pinned list (by index in that list). */
  reorder(target: PinTarget, from: number, to: number): void {
    const s = useDockPins.getState();
    if (target === 'dock') s.reorder(from, to); else s.reorderMenu(from, to);
  },

  /**
   * Place `appId` at `beforeId`'s position (pinning it first if needed). With
   * `beforeId` null it goes to the end. Works on the raw stored order, so apps
   * hidden from view (removed) keep their place.
   */
  place(target: PinTarget, appId: string, beforeId: string | null): void {
    if (!isPinnable(appId) || appId === beforeId) return;
    const s = useDockPins.getState();
    if (target === 'dock') {
      const order = [...s.pins].sort((a, b) => a.position - b.position).map(p => p.id).filter(id => id !== appId);
      const at = beforeId === null ? order.length : Math.max(0, order.indexOf(beforeId));
      s.moveTo(appId, at);
      return;
    }
    if (!s.isMenuPinned(appId)) s.pinToMenu(appId);
    const list = useDockPins.getState().menuPins;
    const from = list.indexOf(appId);
    if (from < 0) return;
    // reorderMenu removes first, then inserts: index in the list without appId.
    const rest = list.filter(id => id !== appId);
    const to = beforeId === null ? rest.length : rest.indexOf(beforeId);
    if (to >= 0) useDockPins.getState().reorderMenu(from, Math.min(to, rest.length));
  },

  /** Ordered dock app ids, filtered to installed, known apps. */
  dockIds(): string[] {
    return [...useDockPins.getState().pins].sort((a, b) => a.position - b.position).map(p => p.id).filter(visible);
  },

  menuIds(): string[] {
    return useDockPins.getState().menuPins.filter(visible);
  },
};

/** Ordered, de-duplicated, installed dock app ids. */
export function useDockAppIds(): string[] {
  useInstalledAppsStore(s => s);
  return useDockPins(useShallow(s => [...s.pins].sort((a, b) => a.position - b.position).map(p => p.id).filter(visible)));
}

export function useMenuPinnedIds(): string[] {
  useInstalledAppsStore(s => s);
  return useDockPins(useShallow(s => s.menuPins.filter(visible)));
}

export function usePinState(appId: string): { dock: boolean; menu: boolean } {
  return useDockPins(useShallow(s => ({ dock: s.pins.some(p => p.id === appId), menu: s.menuPins.includes(appId) })));
}
