// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Verified-finding implementations (DEX_FEATURE_BACKLOG 08/09): the actionable
// notification model (freedesktop urgency/expiry/actions, MS activation/scenario,
// Apple categories/options, macOS Focus) and the CfAPI placeholder-file model.
import { describe, it, expect } from 'vitest';
import {
  urgencyFromByte, urgencyToPriority, URGENCY_BYTE,
  resolveExpiry, TIMEOUT_NEVER, TIMEOUT_SERVER_DEFAULT,
  actionsToFreedesktopList, actionsFromFreedesktopList, validateActions, canInvokeAction,
  resolveCategory, persistsUntilDismissed, passesFocus,
  type NotificationAction, type NotificationCategory, type FocusFilter,
} from '../../src/shared/notifications/actionable';
import {
  PLACEHOLDER_HEADER_BYTES, onDiskBytes, savedBytes, hydrate, dehydrate, onAccess,
  setPin, folderStorage, reclaimSpace, type PlaceholderFile,
} from '../../src/shared/sync/placeholderFile';

describe('notification urgency (freedesktop)', () => {
  it('maps bytes <-> urgency and onto center priority', () => {
    expect(URGENCY_BYTE).toEqual({ low: 0, normal: 1, critical: 2 });
    expect(urgencyFromByte(0)).toBe('low');
    expect(urgencyFromByte(2)).toBe('critical');
    expect(urgencyFromByte(5)).toBe('critical');
    expect(urgencyToPriority('critical')).toBe('urgent');
    expect(urgencyToPriority('low')).toBe('low');
  });
});

describe('expire_timeout resolution', () => {
  it('honours the sentinels', () => {
    expect(resolveExpiry(TIMEOUT_NEVER, 'normal')).toEqual({ expires: false, ms: 0 });
    expect(resolveExpiry(TIMEOUT_SERVER_DEFAULT, 'normal', 7000)).toEqual({ expires: true, ms: 7000 });
    expect(resolveExpiry(2500, 'normal')).toEqual({ expires: true, ms: 2500 });
  });
  it('critical never auto-expires regardless of timeout', () => {
    expect(resolveExpiry(2500, 'critical')).toEqual({ expires: false, ms: 0 });
    expect(resolveExpiry(TIMEOUT_SERVER_DEFAULT, 'critical')).toEqual({ expires: false, ms: 0 });
  });
});

describe('actions (freedesktop list + MS caps + Apple options)', () => {
  const reply: NotificationAction = { id: 'reply', label: 'Reply', activation: 'background', textInput: { buttonTitle: 'Send' } };
  const open: NotificationAction = { id: 'open', label: 'Open', activation: 'foreground' };
  const del: NotificationAction = { id: 'del', label: 'Delete', activation: 'background', options: { authenticationRequired: true, destructive: true } };

  it('round-trips the freedesktop flat (id,label) list', () => {
    const list = actionsToFreedesktopList([open, del]);
    expect(list).toEqual(['open', 'Open', 'del', 'Delete']);
    const back = actionsFromFreedesktopList(list);
    expect(back.map((a) => a.id)).toEqual(['open', 'del']);
  });
  it('enforces the <=5 inputs / <=5 buttons caps', () => {
    expect(validateActions([open, reply]).ok).toBe(true);
    const sixButtons = Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, label: `B${i}`, activation: 'foreground' as const }));
    expect(validateActions(sixButtons).ok).toBe(false);
    const sixInputs = Array.from({ length: 6 }, (_, i) => ({ id: `i${i}`, label: `I${i}`, activation: 'background' as const, textInput: {} }));
    expect(validateActions(sixInputs).ok).toBe(false);
  });
  it('authenticationRequired gates invocation on lock state', () => {
    expect(canInvokeAction(del, false)).toBe(false);
    expect(canInvokeAction(del, true)).toBe(true);
    expect(canInvokeAction(open, false)).toBe(true);
  });
});

describe('categories (Apple identifier matching)', () => {
  it('resolves a category by payload identifier', () => {
    const cats: NotificationCategory[] = [
      { id: 'message', actions: [{ id: 'reply', label: 'Reply', activation: 'background' }] },
    ];
    expect(resolveCategory(cats, 'message')?.actions[0].id).toBe('reply');
    expect(resolveCategory(cats, 'nope')).toBeNull();
    expect(resolveCategory(cats, undefined)).toBeNull();
  });
});

describe('persistence (MS scenario + freedesktop hints)', () => {
  it('reminder/alarm/incomingCall and resident persist; transient and default do not', () => {
    expect(persistsUntilDismissed({ scenario: 'alarm' })).toBe(true);
    expect(persistsUntilDismissed({ scenario: 'incomingCall' })).toBe(true);
    expect(persistsUntilDismissed({ resident: true })).toBe(true);
    expect(persistsUntilDismissed({ scenario: 'default' })).toBe(false);
    expect(persistsUntilDismissed({ transient: true, resident: true })).toBe(false);
    expect(persistsUntilDismissed({ urgency: 'critical' })).toBe(true);
  });
});

describe('Focus filtering (macOS)', () => {
  const allowMail: FocusFilter = { mode: 'allow', sources: ['mail'], allowTimeSensitive: true };
  const silenceSlack: FocusFilter = { mode: 'silence', sources: ['slack'], allowTimeSensitive: false };

  it('allow-list passes only listed sources', () => {
    expect(passesFocus(allowMail, { source: 'mail' })).toBe(true);
    expect(passesFocus(allowMail, { source: 'games' })).toBe(false);
  });
  it('silence-list blocks only listed sources', () => {
    expect(passesFocus(silenceSlack, { source: 'slack' })).toBe(false);
    expect(passesFocus(silenceSlack, { source: 'mail' })).toBe(true);
  });
  it('critical + time-sensitive override the filter', () => {
    expect(passesFocus(allowMail, { source: 'games', urgency: 'critical' })).toBe(true);
    expect(passesFocus(allowMail, { source: 'games', timeSensitive: true })).toBe(true);
    expect(passesFocus(silenceSlack, { source: 'slack', timeSensitive: true })).toBe(false); // override off
  });
  it('off delivers everything', () => {
    expect(passesFocus({ mode: 'off', sources: [], allowTimeSensitive: false }, { source: 'x' })).toBe(true);
  });
});

describe('CfAPI placeholder files', () => {
  const file = (over: Partial<PlaceholderFile> = {}): PlaceholderFile =>
    ({ path: '/a', logicalSize: 1_000_000, state: 'dehydrated', pin: 'unpinned', ...over });

  it('a dehydrated placeholder consumes only the ~1KB header', () => {
    expect(onDiskBytes(file())).toBe(PLACEHOLDER_HEADER_BYTES);
    expect(savedBytes(file())).toBe(1_000_000 - PLACEHOLDER_HEADER_BYTES);
    expect(onDiskBytes(file({ state: 'hydrated' }))).toBe(1_000_000);
  });
  it('on-access hydrates transparently', () => {
    expect(onAccess(file()).state).toBe('hydrated');
  });
  it('pinned files refuse to dehydrate; online-only dehydrates', () => {
    expect(dehydrate(file({ state: 'hydrated', pin: 'pinned' })).state).toBe('hydrated');
    expect(setPin(file({ state: 'hydrated' }), 'online-only').state).toBe('dehydrated');
    expect(setPin(file(), 'pinned').state).toBe('hydrated');
  });
  it('folderStorage aggregates on-disk vs logical', () => {
    const s = folderStorage([file(), file({ path: '/b', state: 'hydrated', logicalSize: 2000 })]);
    expect(s.totalLogical).toBe(1_002_000);
    expect(s.totalOnDisk).toBe(PLACEHOLDER_HEADER_BYTES + 2000);
    expect(s.hydratedCount).toBe(1);
    expect(s.dehydratedCount).toBe(1);
  });
  it('reclaimSpace dehydrates largest unpinned hydrated files first, never pinned', () => {
    const files = [
      file({ path: '/big', state: 'hydrated', logicalSize: 5_000_000 }),
      file({ path: '/pin', state: 'hydrated', logicalSize: 9_000_000, pin: 'pinned' }),
      file({ path: '/small', state: 'hydrated', logicalSize: 100_000 }),
    ];
    const after = reclaimSpace(files, 1_000_000);
    expect(after.find((f) => f.path === '/big')!.state).toBe('dehydrated');
    expect(after.find((f) => f.path === '/pin')!.state).toBe('hydrated'); // never touched
  });
});
