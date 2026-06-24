// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Actionable-notification model (DEX_FEATURE_BACKLOG 08, research-verified).
 *
 * Complements `group.ts` (priority/coalescing) and `center.ts` (presentation)
 * with the cross-platform PRIMITIVES the three desktop notification systems
 * standardise — each line here is backed by a 3-vote-verified primary-source
 * claim:
 *   - freedesktop org.freedesktop.Notifications: urgency BYTE (0/1/2 =
 *     Low/Normal/Critical; critical never auto-expires), expire_timeout sentinels
 *     (-1 server-default, 0 never, >0 ms), actions as flat (id,label) pairs with a
 *     reserved "default" key, and transient/resident hints.
 *   - Microsoft adaptive toasts: ToastActivationType (foreground/background/
 *     protocol), Scenario (reminder/alarm/incomingCall persist until dismissed),
 *     and the ≤5 inputs / ≤5 buttons caps.
 *   - Apple UNNotification: category↔action split keyed by an identifier string,
 *     UNTextInputNotificationAction (inline reply), and UNNotificationActionOptions
 *     (authenticationRequired / destructive / foreground).
 *   - macOS Focus: per-source allow-list / silence-list filtering + a
 *     time-sensitive override (a per-app capability separate from the filter).
 *
 * Pure: no DOM, no IO — the shell's notification host applies these decisions.
 */

import type { NotificationPriority } from './group';

// ---- Urgency (freedesktop) --------------------------------------------------

export type Urgency = 'low' | 'normal' | 'critical';

/** The wire BYTE values the freedesktop spec assigns. */
export const URGENCY_BYTE: Record<Urgency, 0 | 1 | 2> = { low: 0, normal: 1, critical: 2 };

export function urgencyFromByte(b: number): Urgency {
  return b >= 2 ? 'critical' : b <= 0 ? 'low' : 'normal';
}

/** Map freedesktop urgency onto DEX's existing 4-level center priority. */
export function urgencyToPriority(u: Urgency): NotificationPriority {
  switch (u) {
    case 'critical': return 'urgent';
    case 'normal': return 'normal';
    case 'low': return 'low';
  }
}

// ---- Expiry (freedesktop expire_timeout) ------------------------------------

export const TIMEOUT_SERVER_DEFAULT = -1;
export const TIMEOUT_NEVER = 0;

export interface Expiry {
  /** Whether the notification auto-dismisses at all. */
  expires: boolean;
  /** Auto-dismiss delay in ms (only meaningful when `expires`). */
  ms: number;
}

/**
 * Resolve a freedesktop `expire_timeout` into a concrete expiry, applying the
 * critical-never-expires rule: critical urgency ALWAYS persists until dismissed,
 * regardless of the requested timeout.
 */
export function resolveExpiry(timeout: number, urgency: Urgency, serverDefaultMs = 6000): Expiry {
  if (urgency === 'critical') return { expires: false, ms: 0 };
  if (timeout === TIMEOUT_NEVER) return { expires: false, ms: 0 };
  if (timeout === TIMEOUT_SERVER_DEFAULT) return { expires: true, ms: serverDefaultMs };
  if (timeout > 0) return { expires: true, ms: timeout };
  // Any other negative value is treated as server-default (defensive).
  return { expires: true, ms: serverDefaultMs };
}

// ---- Actions (freedesktop + MS + Apple) -------------------------------------

/** How invoking an action behaves (Microsoft ToastActivationType). */
export type ActivationType = 'foreground' | 'background' | 'protocol';

/** Per-action behaviour flags (Apple UNNotificationActionOptions). */
export interface ActionOptions {
  /** Only invokable on an unlocked device — a gate for sensitive actions. */
  authenticationRequired?: boolean;
  /** Rendered as destructive (e.g. Delete). */
  destructive?: boolean;
  /** Brings the host app to the foreground when invoked. */
  foreground?: boolean;
}

export interface NotificationAction {
  id: string;
  label: string;
  activation: ActivationType;
  options?: ActionOptions;
  /** Present for inline text-input actions (Apple UNTextInputNotificationAction). */
  textInput?: { placeholder?: string; buttonTitle?: string };
}

/** The reserved freedesktop action id for "clicked the notification body". */
export const DEFAULT_ACTION_KEY = 'default';

/** Microsoft caps: at most 5 inputs and 5 buttons. */
export const MAX_INPUTS = 5;
export const MAX_BUTTONS = 5;

/** Serialise actions to the freedesktop flat [id,label,id,label,…] list. */
export function actionsToFreedesktopList(actions: ReadonlyArray<NotificationAction>): string[] {
  const out: string[] = [];
  for (const a of actions) { out.push(a.id, a.label); }
  return out;
}

/** Parse the freedesktop flat list back into structured actions (foreground default). */
export function actionsFromFreedesktopList(list: ReadonlyArray<string>): NotificationAction[] {
  const out: NotificationAction[] = [];
  for (let i = 0; i + 1 < list.length; i += 2) {
    out.push({ id: list[i], label: list[i + 1], activation: 'foreground' });
  }
  return out;
}

export interface ActionValidation { ok: boolean; reason: string }

/** Enforce the Microsoft input/button caps (≤5 each). */
export function validateActions(actions: ReadonlyArray<NotificationAction>): ActionValidation {
  const inputs = actions.filter((a) => a.textInput).length;
  const buttons = actions.length - inputs;
  if (inputs > MAX_INPUTS) return { ok: false, reason: `too many inputs (${inputs} > ${MAX_INPUTS})` };
  if (buttons > MAX_BUTTONS) return { ok: false, reason: `too many buttons (${buttons} > ${MAX_BUTTONS})` };
  return { ok: true, reason: 'ok' };
}

/** Apple authenticationRequired gate: can this action run right now? */
export function canInvokeAction(action: NotificationAction, deviceUnlocked: boolean): boolean {
  return action.options?.authenticationRequired ? deviceUnlocked : true;
}

// ---- Categories (Apple) -----------------------------------------------------

/** A registered action set keyed by an identifier string (Apple UNNotificationCategory). */
export interface NotificationCategory {
  id: string;
  actions: NotificationAction[];
}

/** Resolve a notification's category by the identifier string in its payload. */
export function resolveCategory(
  categories: ReadonlyArray<NotificationCategory>,
  categoryId: string | undefined,
): NotificationCategory | null {
  if (!categoryId) return null;
  return categories.find((c) => c.id === categoryId) ?? null;
}

// ---- Scenario / persistence (MS + freedesktop hints) ------------------------

export type Scenario = 'default' | 'reminder' | 'alarm' | 'incomingCall';

/**
 * Whether a notification stays on screen until explicitly dismissed. Reminder/
 * Alarm/IncomingCall scenarios and the freedesktop `resident` hint persist;
 * `transient` and critical urgency also force persistence (critical) or override
 * the server's persistence (transient bypasses it).
 */
export function persistsUntilDismissed(opts: {
  scenario?: Scenario;
  urgency?: Urgency;
  resident?: boolean;
  transient?: boolean;
}): boolean {
  if (opts.urgency === 'critical') return true;
  if (opts.transient) return false; // bypasses persistence
  if (opts.resident) return true;
  return opts.scenario === 'reminder' || opts.scenario === 'alarm' || opts.scenario === 'incomingCall';
}

// ---- Focus filtering (macOS) ------------------------------------------------

export interface FocusFilter {
  /** off = deliver all; allow = only `sources`; silence = block `sources`. */
  mode: 'off' | 'allow' | 'silence';
  sources: string[];
  /** Let time-sensitive notifications break through (per-app capability). */
  allowTimeSensitive: boolean;
}

export interface FocusCandidate {
  source: string;
  /** App is granted the time-sensitive capability AND marked this one urgent. */
  timeSensitive?: boolean;
  urgency?: Urgency;
}

/**
 * Decide whether a notification passes the active Focus. Critical urgency and a
 * time-sensitive notification (when the filter permits the override) always pass;
 * otherwise allow-list / silence-list membership by source governs delivery.
 */
export function passesFocus(filter: FocusFilter, notif: FocusCandidate): boolean {
  if (filter.mode === 'off') return true;
  if (notif.urgency === 'critical') return true;
  if (filter.allowTimeSensitive && notif.timeSensitive) return true;
  const listed = filter.sources.includes(notif.source);
  return filter.mode === 'allow' ? listed : !listed;
}
