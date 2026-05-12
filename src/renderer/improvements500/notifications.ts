// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Quiet hours scheduler (T9-025) and notification snooze/group/per-app mute
 * (T4-036, T4-037, T4-038, T9-014).
 *
 * Pure helpers + simple persistent store via localStorage. No timers — the
 * notification system queries `shouldDeliver()` at delivery time.
 */

export interface QuietHours {
  /** When false the policy is bypassed entirely. */
  enabled: boolean;
  /** 0-23 inclusive start hour (local time). */
  startHour: number;
  /** 0-23 inclusive end hour (local time). end<start means cross-midnight. */
  endHour: number;
  /** 0..6 weekdays where Sunday=0. Empty = every day. */
  weekdays: readonly number[];
}

export interface NotificationPrefs {
  dnd: boolean;
  quietHours: QuietHours;
  /** appId → muted */
  muted: Record<string, boolean>;
  /** appId → unix ms snooze-until (0/undefined = not snoozed) */
  snoozedUntil: Record<string, number>;
}

const STORAGE_KEY = 'dex:notifications:prefs';

function freshDefault(): NotificationPrefs {
  return {
    dnd: false,
    quietHours: { enabled: false, startHour: 22, endHour: 7, weekdays: [] },
    muted: {},
    snoozedUntil: {},
  };
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function loadPrefs(): NotificationPrefs {
  if (!isBrowser()) return freshDefault();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshDefault();
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    const base = freshDefault();
    return {
      ...base,
      ...parsed,
      quietHours: { ...base.quietHours, ...(parsed.quietHours ?? {}) },
      muted: { ...(parsed.muted ?? {}) },
      snoozedUntil: { ...(parsed.snoozedUntil ?? {}) },
    };
  } catch { return freshDefault(); }
}

export function savePrefs(prefs: NotificationPrefs): void {
  if (!isBrowser()) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* quota */ }
}

export function setDnd(enabled: boolean): NotificationPrefs {
  const prefs = loadPrefs();
  prefs.dnd = enabled;
  savePrefs(prefs);
  return prefs;
}

export function setQuietHours(qh: QuietHours): NotificationPrefs {
  const prefs = loadPrefs();
  prefs.quietHours = qh;
  savePrefs(prefs);
  return prefs;
}

export function setAppMuted(appId: string, muted: boolean): NotificationPrefs {
  const prefs = loadPrefs();
  if (muted) prefs.muted[appId] = true;
  else delete prefs.muted[appId];
  savePrefs(prefs);
  return prefs;
}

export function snoozeApp(appId: string, durationMs: number): NotificationPrefs {
  const prefs = loadPrefs();
  prefs.snoozedUntil[appId] = Date.now() + durationMs;
  savePrefs(prefs);
  return prefs;
}

/** True when a notification for this app should be delivered now. */
export function shouldDeliver(appId: string, now: Date = new Date(), prefs: NotificationPrefs = loadPrefs()): boolean {
  if (prefs.dnd) return false;
  if (prefs.muted[appId]) return false;
  const sn = prefs.snoozedUntil[appId];
  if (sn && sn > now.getTime()) return false;
  if (prefs.quietHours.enabled && inQuietHours(prefs.quietHours, now)) return false;
  return true;
}

export function inQuietHours(qh: QuietHours, now: Date = new Date()): boolean {
  if (qh.weekdays.length > 0 && !qh.weekdays.includes(now.getDay())) return false;
  const h = now.getHours();
  if (qh.endHour === qh.startHour) return false;
  if (qh.endHour > qh.startHour) {
    return h >= qh.startHour && h < qh.endHour;
  }
  // Cross-midnight, e.g. 22..7.
  return h >= qh.startHour || h < qh.endHour;
}

/** Group a list of pending notifications by appId (T9-014). */
export function groupByApp<T extends { appId: string }>(items: readonly T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const list = out.get(it.appId) ?? [];
    list.push(it);
    out.set(it.appId, list);
  }
  return out;
}

/** Reset prefs (test helper). */
export function _resetPrefs(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(STORAGE_KEY);
}
