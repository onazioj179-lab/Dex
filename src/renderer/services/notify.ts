// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX 5.5 — Unified Notification path (renderer side).
 *
 * THIS IS THE SINGLE RENDERER NOTIFICATION ENTRY POINT. Every notification a
 * renderer surface raises should flow through `notify()` (or one of the level
 * helpers). It does two things, in order, and never throws:
 *
 *   1. Surfaces a transient banner immediately via the canonical
 *      `dex-notification` CustomEvent. AppManager already listens for this and
 *      renders the top-right banner stack, so existing callers that fire the
 *      event directly keep working unchanged (this is the back-compat shim).
 *   2. Persists the notification to the native Unified Notification Hub
 *      (`notification-center:*` channels, backed by dex.db) so it survives a
 *      reload and shows up in the Notification Center / bell with grouping +
 *      priority. The hub `notifications` table has no priority/icon/source
 *      columns, so those travel inside the existing free-form `action` JSON
 *      envelope (which round-trips through the DB untouched) under a reserved
 *      `_dexMeta` key. No Rust change is required.
 *
 * Graceful degradation: if the hub channel is missing or returns null (Tauri /
 * Electron parity, or an older preload), the banner still shows and persistence
 * is silently skipped — we never throw and never block the UI.
 */

import type { NotificationPriority } from '../../shared/notifications/group';
import {
  resolveExpiry, urgencyToPriority, persistsUntilDismissed,
  type Urgency, type Scenario,
} from '../../shared/notifications/actionable';

export type NotificationIcon = 'info' | 'success' | 'warning' | 'error';

/** Optional deep-link / action target carried with a notification. */
export interface NotifyAction {
  /** Deep-link target consumed by `deeplink:navigate` (the hub center click). */
  target?: string;
  /** Free-form label (shown by surfaces that render an action button). */
  label?: string;
  [key: string]: unknown;
}

export interface NotifyInput {
  title: string;
  body?: string;
  /** Source app / category — drives grouping in the center. Default 'System'. */
  source?: string;
  /** Priority ordering in banners + center. Default 'normal'. */
  priority?: NotificationPriority;
  /** Left-badge severity icon. Defaults from priority when omitted. */
  icon?: NotificationIcon;
  /** Auto-dismiss duration for the transient banner (ms). */
  duration?: number;
  /**
   * freedesktop urgency (low/normal/critical). When set and `priority` is
   * omitted, it derives the priority; `critical` is never auto-dismissed.
   */
  urgency?: Urgency;
  /**
   * freedesktop `expire_timeout` (−1 server-default, 0 never, >0 ms). Resolved
   * against urgency to compute the banner's auto-dismiss when `duration` is unset.
   */
  expireTimeout?: number;
  /**
   * Microsoft toast scenario. `reminder`/`alarm`/`incomingCall` stay on screen
   * until dismissed (persistent banner).
   */
  scenario?: Scenario;
  /** Deep-link / action payload (persisted, used on center click). */
  action?: NotifyAction;
  /** Transient action buttons for the banner (NOT persisted — closures). */
  actions?: { label: string; onClick: () => void }[];
  /**
   * When true, only show the transient banner and skip hub persistence
   * (e.g. ultra-ephemeral UI feedback). Defaults to false.
   */
  transientOnly?: boolean;
}

/** Reserved key inside the hub `action` JSON for DEX notification metadata. */
export const DEX_NOTIFY_META_KEY = '_dexMeta';

interface DexNotifyMeta {
  priority: NotificationPriority;
  icon: NotificationIcon;
  source: string;
}

const VALID_ICONS: readonly NotificationIcon[] = ['info', 'success', 'warning', 'error'];
const VALID_PRIORITIES: readonly NotificationPriority[] = ['low', 'normal', 'high', 'urgent'];

/** Map a severity icon to a sensible default priority. */
function priorityFromIcon(icon: NotificationIcon | undefined): NotificationPriority {
  switch (icon) {
    case 'error': return 'high';
    case 'warning': return 'normal';
    default: return 'normal';
  }
}

/** Map a priority to a sensible default severity icon. */
function iconFromPriority(priority: NotificationPriority): NotificationIcon {
  switch (priority) {
    case 'urgent': return 'error';
    case 'high': return 'warning';
    default: return 'info';
  }
}

export function normalizeIcon(value: unknown, fallback: NotificationIcon = 'info'): NotificationIcon {
  return typeof value === 'string' && (VALID_ICONS as readonly string[]).includes(value)
    ? (value as NotificationIcon)
    : fallback;
}

export function normalizePriority(
  value: unknown,
  fallback: NotificationPriority = 'normal',
): NotificationPriority {
  return typeof value === 'string' && (VALID_PRIORITIES as readonly string[]).includes(value)
    ? (value as NotificationPriority)
    : fallback;
}

/**
 * Build the `action` envelope persisted to the hub: the caller's own action
 * payload plus a reserved `_dexMeta` block carrying priority/icon/source. Kept
 * as a plain object so the Rust hub serializes it verbatim.
 */
export function buildHubAction(
  action: NotifyAction | undefined,
  meta: DexNotifyMeta,
): Record<string, unknown> {
  return { ...(action ?? {}), [DEX_NOTIFY_META_KEY]: meta };
}

/**
 * Decode the `_dexMeta` block from a persisted hub `action` string (or object).
 * Returns null when absent/unparseable so callers can fall back to defaults.
 */
export function readHubMeta(action: unknown): DexNotifyMeta | null {
  let obj: any = action;
  if (typeof action === 'string') {
    if (!action) return null;
    try { obj = JSON.parse(action); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object') return null;
  const meta = obj[DEX_NOTIFY_META_KEY];
  if (!meta || typeof meta !== 'object') return null;
  return {
    priority: normalizePriority(meta.priority),
    icon: normalizeIcon(meta.icon),
    source: typeof meta.source === 'string' && meta.source ? meta.source : 'System',
  };
}

/** Safe access to the IPC bridge; null in non-bridge contexts (SSR/tests). */
function bridge(): { invoke: (channel: string, ...args: unknown[]) => Promise<any> } | null {
  const dex = (typeof window !== 'undefined' ? (window as any).dex : null) || null;
  return dex && typeof dex.invoke === 'function' ? dex : null;
}

/**
 * Fire the transient banner via the canonical CustomEvent. This is exactly the
 * contract AppManager's `dex-notification` listener consumes, so the banner
 * appears immediately regardless of hub availability.
 */
export function emitBanner(input: NotifyInput, icon: NotificationIcon, priority: NotificationPriority): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(
      new CustomEvent('dex-notification', {
        detail: {
          title: input.title,
          body: input.body,
          icon,
          priority,
          source: input.source,
          duration: input.duration,
          actions: input.actions,
          // Marks events that notify() already persists to the hub directly, so
          // the UnifiedSystemsProvider bridge does not persist them a second
          // time. Legacy dispatchers (without this flag) get persisted there.
          _dexPersisted: !input.transientOnly,
        },
      }),
    );
  } catch {
    /* never let UI feedback throw */
  }
}

/**
 * Persist to the Unified Notification Hub. Returns the new row id, or -1 when
 * the channel is unavailable / disabled (matching the hub's own contract). Never
 * throws — degrades to -1 on any failure so the banner path is unaffected.
 */
export async function persistToHub(
  input: NotifyInput,
  icon: NotificationIcon,
  priority: NotificationPriority,
): Promise<number> {
  const dex = bridge();
  if (!dex) return -1;
  try {
    const action = buildHubAction(input.action, {
      priority,
      icon,
      source: input.source || 'System',
    });
    const id = await dex.invoke('notification-center:send', {
      app: input.source || 'System',
      title: input.title,
      body: input.body || '',
      action,
    });
    // Ask the center/bell to refresh (covers the panel-closed case where the
    // hub's own `:new` broadcast is not wired through this preload's allowlist).
    if (typeof id === 'number' && id >= 0 && typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('dex-notification-persisted')); } catch { /* noop */ }
    }
    return typeof id === 'number' ? id : -1;
  } catch {
    return -1;
  }
}

/**
 * THE single notification entry point. Shows a banner now and persists to the
 * hub (unless `transientOnly`). Returns the hub row id (-1 when not persisted).
 */
export async function notify(input: NotifyInput): Promise<number> {
  if (!input || !input.title) return -1;
  // Urgency (freedesktop) derives priority when no explicit priority is given.
  const derivedPriority = input.priority
    ?? (input.urgency ? urgencyToPriority(input.urgency) : priorityFromIcon(input.icon));
  const icon = input.icon ? normalizeIcon(input.icon) : iconFromPriority(derivedPriority);
  const priority = normalizePriority(derivedPriority);

  // Resolve the banner's auto-dismiss from the verified notification model
  // (DEX_FEATURE_BACKLOG 08): critical urgency + reminder/alarm/incomingCall
  // scenarios are persistent (duration<=0 = no auto-dismiss); otherwise an
  // explicit `expireTimeout` is resolved against urgency. A caller-set `duration`
  // always wins (back-compat).
  let resolved = input;
  if (input.duration === undefined && (input.urgency || input.scenario || input.expireTimeout !== undefined)) {
    const u: Urgency = input.urgency ?? 'normal';
    let duration: number | undefined;
    if (persistsUntilDismissed({ scenario: input.scenario, urgency: u })) {
      duration = 0; // never auto-dismiss
    } else if (input.expireTimeout !== undefined) {
      const e = resolveExpiry(input.expireTimeout, u);
      duration = e.expires ? e.ms : 0;
    }
    if (duration !== undefined) resolved = { ...input, duration };
  }

  emitBanner(resolved, icon, priority);

  if (resolved.transientOnly) return -1;
  return persistToHub(resolved, icon, priority);
}

// ---------------------------------------------------------------------------
// Level helpers — terse call sites, all routed through the single path.
// ---------------------------------------------------------------------------

export const notifyInfo = (title: string, body?: string, opts?: Partial<NotifyInput>) =>
  notify({ title, body, icon: 'info', priority: 'normal', ...opts });

export const notifySuccess = (title: string, body?: string, opts?: Partial<NotifyInput>) =>
  notify({ title, body, icon: 'success', priority: 'normal', ...opts });

export const notifyWarning = (title: string, body?: string, opts?: Partial<NotifyInput>) =>
  notify({ title, body, icon: 'warning', priority: 'high', ...opts });

export const notifyError = (title: string, body?: string, opts?: Partial<NotifyInput>) =>
  notify({ title, body, icon: 'error', priority: 'urgent', ...opts });
