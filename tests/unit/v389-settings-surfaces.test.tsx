// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Platform - test
// =============================================================================
// Tests for v3.8.9 wave E settings panes - Devices, Activity, Plugins,
// Memory, Accessibility, Storage, Trash + Versions. jsdom +
// @testing-library/react.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { DevicesPane } from '../../src/renderer/components/settings/DevicesPane';
import { ActivityPane } from '../../src/renderer/components/settings/ActivityPane';
import { PluginsPane } from '../../src/renderer/components/settings/PluginsPane';
import { MemoryPane } from '../../src/renderer/components/settings/MemoryPane';
import { AccessibilityPane, type AccessibilitySettings } from '../../src/renderer/components/settings/AccessibilityPane';
import { StoragePane } from '../../src/renderer/components/settings/StoragePane';
import { TrashAndVersionsPane } from '../../src/renderer/components/settings/TrashAndVersionsPane';
import { formatBytes, formatRelative } from '../../src/renderer/components/settings/SettingsPaneShell';

import { createSessionStore, addSession, type DeviceSession } from '../../src/shared/account/sessions';
import { createAuditLog, appendAudit } from '../../src/shared/account/auditLog';
import type { PluginManifest, CapabilityLedger } from '../../src/shared/plugin/manifest';
import { createCapabilityLedger, grantCapability } from '../../src/shared/plugin/manifest';
import { createMemoryStore, addMemory } from '../../src/shared/uki/memory';
import { createTrashState, pushToTrash } from '../../src/shared/cloud/trashBin';
import { createVersionedFile, pushVersion } from '../../src/shared/cloud/versioning';
import type { UsageItem } from '../../src/shared/cloud/storageBreakdown';

// ---------------- helpers ----------------

const NOW = 1_700_000_000_000;

function makeSession(over: Partial<DeviceSession> = {}): Omit<DeviceSession, 'createdAt' | 'lastSeenAt'> {
  return {
    id: over.id ?? 'sess-1',
    deviceName: over.deviceName ?? 'My Mac',
    platform: over.platform ?? 'mac',
    fingerprint: over.fingerprint ?? 'fp1',
    ipHash: over.ipHash ?? 'iph1',
    geoCoarse: over.geoCoarse ?? 'NL',
    trusted: over.trusted ?? false,
    current: over.current ?? false,
  };
}

// ---------------- Helpers ----------------

describe('settings shell helpers', () => {
  it('formatBytes handles zero and negative', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-100)).toBe('0 B');
  });
  it('formatBytes formats sizes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024 * 5)).toBe('5.0 MB');
  });
  it('formatRelative handles fresh', () => {
    expect(formatRelative(NOW, NOW)).toBe('just now');
  });
  it('formatRelative formats minutes/hours/days', () => {
    expect(formatRelative(NOW - 5 * 60_000, NOW)).toBe('5m ago');
    expect(formatRelative(NOW - 3 * 3_600_000, NOW)).toBe('3h ago');
    expect(formatRelative(NOW - 2 * 86_400_000, NOW)).toBe('2d ago');
  });
});

// ---------------- DevicesPane ----------------

describe('DevicesPane', () => {
  it('renders empty state', () => {
    render(<DevicesPane store={createSessionStore()} now={NOW} />);
    expect(screen.getByTestId('devices-empty')).toBeTruthy();
  });
  it('renders sessions sorted with current first', () => {
    let s = createSessionStore();
    s = addSession(s, makeSession({ id: 'a', current: false, trusted: true }), NOW - 10_000);
    s = addSession(s, makeSession({ id: 'b', current: true, trusted: true }), NOW);
    render(<DevicesPane store={s} now={NOW} />);
    const rows = screen.getAllByTestId(/devices-row-/);
    expect(rows[0].getAttribute('data-testid')).toBe('devices-row-b');
    expect(screen.getByTestId('devices-current-b')).toBeTruthy();
  });
  it('hides revoke for current session and shows for others', () => {
    let s = createSessionStore();
    s = addSession(s, makeSession({ id: 'a', current: true, trusted: true }), NOW);
    s = addSession(s, makeSession({ id: 'b', trusted: true }), NOW);
    render(<DevicesPane store={s} now={NOW} />);
    expect(screen.queryByTestId('devices-revoke-a')).toBeNull();
    expect(screen.getByTestId('devices-revoke-b')).toBeTruthy();
  });
  it('shows trust button only for untrusted', () => {
    let s = createSessionStore();
    s = addSession(s, makeSession({ id: 'a', current: true, trusted: false }), NOW);
    render(<DevicesPane store={s} now={NOW} />);
    expect(screen.getByTestId('devices-trust-a')).toBeTruthy();
  });
  it('fires revoke and trust callbacks', () => {
    let s = createSessionStore();
    s = addSession(s, makeSession({ id: 'a', current: true }), NOW);
    s = addSession(s, makeSession({ id: 'b' }), NOW);
    const onRevoke = vi.fn();
    const onTrust = vi.fn();
    render(<DevicesPane store={s} now={NOW} onRevoke={onRevoke} onTrust={onTrust} />);
    fireEvent.click(screen.getByTestId('devices-revoke-b'));
    fireEvent.click(screen.getByTestId('devices-trust-b'));
    expect(onRevoke).toHaveBeenCalledWith('b');
    expect(onTrust).toHaveBeenCalledWith('b');
  });
  it('revokeAllOthers passes the current session id', () => {
    let s = createSessionStore();
    s = addSession(s, makeSession({ id: 'a', current: true }), NOW);
    s = addSession(s, makeSession({ id: 'b' }), NOW);
    const onRevokeAll = vi.fn();
    render(<DevicesPane store={s} now={NOW} onRevokeAllOthers={onRevokeAll} />);
    fireEvent.click(screen.getByTestId('devices-revoke-others'));
    expect(onRevokeAll).toHaveBeenCalledWith('a');
  });
});

// ---------------- ActivityPane ----------------

describe('ActivityPane', () => {
  it('renders rows and empty state on mismatched search', () => {
    let log = createAuditLog();
    log = appendAudit(log, { kind: 'sign-in', actor: 'user', ts: NOW });
    log = appendAudit(log, { kind: 'sign-out', actor: 'user', ts: NOW + 1000 });
    render(<ActivityPane log={log} now={NOW + 2000} />);
    expect(screen.getAllByTestId(/activity-row-/).length).toBe(2);
    fireEvent.change(screen.getByTestId('activity-search'), { target: { value: 'nomatch' } });
    expect(screen.getByTestId('activity-empty')).toBeTruthy();
  });
  it('filters by kind via search box', () => {
    let log = createAuditLog();
    log = appendAudit(log, { kind: 'sign-in', actor: 'user', ts: NOW });
    log = appendAudit(log, { kind: 'sign-out', actor: 'user', ts: NOW + 1000 });
    render(<ActivityPane log={log} now={NOW + 2000} />);
    fireEvent.change(screen.getByTestId('activity-search'), { target: { value: 'sign-in' } });
    expect(screen.getAllByTestId(/activity-row-/).length).toBe(1);
  });
  it('export buttons emit text + csv payloads', () => {
    let log = createAuditLog();
    log = appendAudit(log, { kind: 'sign-in', actor: 'user', ts: NOW });
    const onExport = vi.fn();
    render(<ActivityPane log={log} now={NOW} onExport={onExport} />);
    fireEvent.click(screen.getByTestId('activity-export-text'));
    fireEvent.click(screen.getByTestId('activity-export-csv'));
    expect(onExport).toHaveBeenCalledTimes(2);
    expect(onExport.mock.calls[0][0]).toBe('text');
    expect(onExport.mock.calls[1][0]).toBe('csv');
    expect(typeof onExport.mock.calls[0][1]).toBe('string');
  });
});

// ---------------- PluginsPane ----------------

describe('PluginsPane', () => {
  const plugin: PluginManifest = {
    id: 'p1', name: 'Plugin 1', version: '1.0.0', author: 'me',
    dexVersion: '3.8.9', entryPoint: 'index.js', capabilities: ['fs:read'],
  };

  it('renders empty state', () => {
    render(<PluginsPane plugins={[]} ledger={createCapabilityLedger()} now={NOW} />);
    expect(screen.getByTestId('plugins-empty')).toBeTruthy();
  });
  it('shows uninstall and grants', () => {
    let ledger = createCapabilityLedger();
    ledger = grantCapability(ledger, { pluginId: 'p1', capability: 'fs:read', grantedAt: NOW - 10_000 });
    const onRevoke = vi.fn();
    const onUninstall = vi.fn();
    render(<PluginsPane plugins={[plugin]} ledger={ledger} now={NOW} onRevoke={onRevoke} onUninstall={onUninstall} />);
    fireEvent.click(screen.getByTestId('plugins-uninstall-p1'));
    fireEvent.click(screen.getByTestId('plugins-revoke-p1-fs:read'));
    expect(onUninstall).toHaveBeenCalledWith('p1');
    expect(onRevoke).toHaveBeenCalledWith('p1', 'fs:read');
  });
  it('shows no-grants state when ledger empty for plugin', () => {
    render(<PluginsPane plugins={[plugin]} ledger={createCapabilityLedger()} now={NOW} />);
    expect(screen.getByTestId('plugins-no-grants-p1')).toBeTruthy();
  });
});

// ---------------- MemoryPane ----------------

describe('MemoryPane', () => {
  it('wraps MemoryInspector with shell chrome', () => {
    const store = createMemoryStore();
    addMemory(store, { content: 'hello', kind: 'long', tags: ['x'], now: NOW });
    render(<MemoryPane store={store} now={NOW} />);
    expect(screen.getByTestId('settings-pane-memory')).toBeTruthy();
    expect(screen.getByTestId('memory-inspector')).toBeTruthy();
  });
});

// ---------------- AccessibilityPane ----------------

describe('AccessibilityPane', () => {
  const init: AccessibilitySettings = {
    contrast: 'system',
    colorBlind: 'none',
    density: 'default',
    reducedMotion: false,
  };
  it('renders all controls', () => {
    render(<AccessibilityPane value={init} onChange={() => {}} />);
    expect(screen.getByTestId('a11y-contrast')).toBeTruthy();
    expect(screen.getByTestId('a11y-colorblind')).toBeTruthy();
    expect(screen.getByTestId('a11y-density')).toBeTruthy();
    expect(screen.getByTestId('a11y-reduced-motion')).toBeTruthy();
  });
  it('emits contrast change', () => {
    const onChange = vi.fn();
    render(<AccessibilityPane value={init} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('a11y-contrast'), { target: { value: 'high-dark' } });
    expect(onChange).toHaveBeenCalledWith({ ...init, contrast: 'high-dark' });
  });
  it('emits density change', () => {
    const onChange = vi.fn();
    render(<AccessibilityPane value={init} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('a11y-density'), { target: { value: 'compact' } });
    expect(onChange).toHaveBeenCalledWith({ ...init, density: 'compact' });
  });
  it('toggles reduced motion', () => {
    const onChange = vi.fn();
    render(<AccessibilityPane value={init} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('a11y-reduced-motion'));
    expect(onChange).toHaveBeenCalledWith({ ...init, reducedMotion: true });
  });
});

// ---------------- StoragePane ----------------

describe('StoragePane', () => {
  const items: UsageItem[] = [
    { id: 'n1', category: 'notes', bytes: 1024 * 100, lastAccessedAt: NOW },
    { id: 'm1', category: 'media', bytes: 1024 * 1024 * 200, lastAccessedAt: NOW - 86_400_000 * 365, label: 'big.mp4' },
    { id: 'c1', category: 'cache', bytes: 1024 * 1024 * 50, lastAccessedAt: NOW - 86_400_000 * 30 },
  ];
  it('lists categories sorted by size', () => {
    render(<StoragePane items={items} now={NOW} />);
    const rows = screen.getAllByTestId(/storage-cat-/);
    expect(rows[0].getAttribute('data-testid')).toBe('storage-cat-media');
  });
  it('renders largest items', () => {
    render(<StoragePane items={items} now={NOW} />);
    expect(screen.getByTestId('storage-largest')).toBeTruthy();
    expect(screen.getByTestId('storage-item-m1')).toBeTruthy();
  });
  it('clean callback fires with category', () => {
    const onClean = vi.fn();
    render(<StoragePane items={items} now={NOW} onCleanCategory={onClean} />);
    fireEvent.click(screen.getByTestId('storage-clean-cache'));
    expect(onClean).toHaveBeenCalledWith('cache');
  });
  it('renders suggestions when stale + large items present', () => {
    render(<StoragePane items={items} now={NOW} />);
    // big.mp4 is huge and old -> should appear in suggestions
    expect(screen.queryByTestId('storage-suggestions')).toBeTruthy();
  });
});

// ---------------- TrashAndVersionsPane ----------------

describe('TrashAndVersionsPane', () => {
  it('shows empty state', () => {
    render(<TrashAndVersionsPane trash={createTrashState()} now={NOW} />);
    expect(screen.getByTestId('trash-empty')).toBeTruthy();
  });
  it('renders trash entries newest-first', () => {
    let trash = createTrashState();
    trash = pushToTrash(trash, { id: 'old', originalPath: '/old.txt', bytes: 100 }, NOW - 86_400_000);
    trash = pushToTrash(trash, { id: 'new', originalPath: '/new.txt', bytes: 200 }, NOW);
    render(<TrashAndVersionsPane trash={trash} now={NOW} />);
    const rows = screen.getAllByTestId(/trash-row-/);
    expect(rows[0].getAttribute('data-testid')).toBe('trash-row-new');
  });
  it('restore + purge callbacks', () => {
    let trash = createTrashState();
    trash = pushToTrash(trash, { id: 'a', originalPath: '/a.txt', bytes: 100 }, NOW);
    const onRestore = vi.fn();
    const onPurge = vi.fn();
    render(<TrashAndVersionsPane trash={trash} now={NOW} onRestore={onRestore} onPurge={onPurge} />);
    fireEvent.click(screen.getByTestId('trash-restore-a'));
    fireEvent.click(screen.getByTestId('trash-purge-a'));
    expect(onRestore).toHaveBeenCalledWith('a');
    expect(onPurge).toHaveBeenCalledWith('a');
  });
  it('empty trash button disabled when empty', () => {
    render(<TrashAndVersionsPane trash={createTrashState()} now={NOW} />);
    expect((screen.getByTestId('trash-empty-all') as HTMLButtonElement).disabled).toBe(true);
  });
  it('empty trash button enabled and fires when populated', () => {
    let trash = createTrashState();
    trash = pushToTrash(trash, { id: 'a', originalPath: '/a.txt', bytes: 100 }, NOW);
    const onEmpty = vi.fn();
    render(<TrashAndVersionsPane trash={trash} now={NOW} onEmptyTrash={onEmpty} />);
    fireEvent.click(screen.getByTestId('trash-empty-all'));
    expect(onEmpty).toHaveBeenCalled();
  });
  it('renders versions section with current marker', () => {
    let f = createVersionedFile('file-1');
    f = pushVersion(f, { versionId: 'v1', bytes: 100, contentId: 'c1', createdAt: NOW - 10_000 });
    f = pushVersion(f, { versionId: 'v2', bytes: 200, contentId: 'c2', createdAt: NOW });
    render(<TrashAndVersionsPane trash={createTrashState()} versions={f} now={NOW} />);
    expect(screen.getByTestId('versions-current-v2')).toBeTruthy();
    expect(screen.getByTestId('versions-rollback-v1')).toBeTruthy();
    expect(screen.queryByTestId('versions-rollback-v2')).toBeNull();
  });
  it('rollback callback fires', () => {
    let f = createVersionedFile('file-1');
    f = pushVersion(f, { versionId: 'v1', bytes: 100, contentId: 'c1', createdAt: NOW - 10_000 });
    f = pushVersion(f, { versionId: 'v2', bytes: 200, contentId: 'c2', createdAt: NOW });
    const onRollback = vi.fn();
    render(<TrashAndVersionsPane trash={createTrashState()} versions={f} now={NOW} onRollback={onRollback} />);
    fireEvent.click(screen.getByTestId('versions-rollback-v1'));
    expect(onRollback).toHaveBeenCalledWith('v1');
  });
});
