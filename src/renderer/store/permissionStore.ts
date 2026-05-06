// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX Platform -- Permission Control Store
// Individual permission toggles for hardware access (mic, camera, bluetooth,
// wifi, gps, network, screen recording, notifications).
// All OFF by default. Auto-disable after 15 min of non-use.
// ===========================================================================
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { debouncedJsonStorage } from '../utils/debouncedStorage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type PermissionId =
  | 'microphone'
  | 'camera'
  | 'bluetooth'
  | 'wifi'
  | 'gps'
  | 'network'
  | 'screen_recording'
  | 'notifications';

export interface PermissionEntry {
  enabled: boolean;
  grantedAt: number | null;
  lastUsedAt: number | null;
  autoDisableMinutes: number; // default 15
}

export const ALL_PERMISSIONS: PermissionId[] = [
  'microphone', 'camera', 'bluetooth', 'wifi', 'gps',
  'network', 'screen_recording', 'notifications',
];

export const PERMISSION_LABELS: Record<PermissionId, string> = {
  microphone: 'Microphone',
  camera: 'Camera',
  bluetooth: 'Bluetooth',
  wifi: 'Wi-Fi',
  gps: 'Location',
  network: 'Network',
  screen_recording: 'Screen Recording',
  notifications: 'Notifications',
};

export const PERMISSION_DESCRIPTIONS: Record<PermissionId, string> = {
  microphone: 'Allow apps to access your microphone',
  camera: 'Allow apps to access your camera',
  bluetooth: 'Allow apps to discover and connect Bluetooth devices',
  wifi: 'Allow apps to scan and manage Wi-Fi connections',
  gps: 'Allow apps to access your location',
  network: 'Allow apps to access the internet',
  screen_recording: 'Allow apps to record or share your screen',
  notifications: 'Allow apps to send you notifications',
};

// ---------------------------------------------------------------------------
// Default state — everything OFF
// ---------------------------------------------------------------------------
function defaultEntry(): PermissionEntry {
  return { enabled: false, grantedAt: null, lastUsedAt: null, autoDisableMinutes: 15 };
}

function defaultPermissions(): Record<PermissionId, PermissionEntry> {
  const perms = {} as Record<PermissionId, PermissionEntry>;
  for (const id of ALL_PERMISSIONS) perms[id] = defaultEntry();
  return perms;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
interface PermissionState {
  permissions: Record<PermissionId, PermissionEntry>;
  /** Toggle a permission on/off. When toggled ON, grantedAt is set. */
  setPermission: (id: PermissionId, enabled: boolean) => void;
  /** Mark a permission as "in use" (resets auto-disable timer). */
  markUsed: (id: PermissionId) => void;
  /** Change the auto-disable timeout for a permission. */
  setAutoDisableMinutes: (id: PermissionId, minutes: number) => void;
  /** Revoke all permissions. */
  revokeAll: () => void;
  /** Get list of currently active (enabled) permission IDs. */
  activePermissions: () => PermissionId[];
}

export const usePermissionStore = create<PermissionState>()(
  persist(
    (set, get) => ({
      permissions: defaultPermissions(),

      setPermission: (id, enabled) => set(state => ({
        permissions: {
          ...state.permissions,
          [id]: {
            ...state.permissions[id],
            enabled,
            grantedAt: enabled ? Date.now() : null,
            lastUsedAt: enabled ? Date.now() : null,
          },
        },
      })),

      markUsed: (id) => set(state => {
        if (!state.permissions[id]?.enabled) return state;
        return {
          permissions: {
            ...state.permissions,
            [id]: { ...state.permissions[id], lastUsedAt: Date.now() },
          },
        };
      }),

      setAutoDisableMinutes: (id, minutes) => set(state => ({
        permissions: {
          ...state.permissions,
          [id]: { ...state.permissions[id], autoDisableMinutes: Math.max(1, minutes) },
        },
      })),

      revokeAll: () => set({ permissions: defaultPermissions() }),

      activePermissions: () => {
        const { permissions } = get();
        return ALL_PERMISSIONS.filter(id => permissions[id].enabled);
      },
    }),
    {
      name: 'dex-permissions',
      storage: debouncedJsonStorage,
    },
  ),
);

// ---------------------------------------------------------------------------
// Auto-disable timer — runs every 60s, disables permissions unused for N min
// ---------------------------------------------------------------------------
let _autoDisableInterval: ReturnType<typeof setInterval> | null = null;

export function startPermissionAutoDisable(): void {
  if (_autoDisableInterval) return;
  _autoDisableInterval = setInterval(() => {
    const { permissions, setPermission } = usePermissionStore.getState();
    const now = Date.now();
    for (const id of ALL_PERMISSIONS) {
      const entry = permissions[id];
      if (!entry.enabled) continue;
      const lastUsed = entry.lastUsedAt || entry.grantedAt || 0;
      const timeoutMs = entry.autoDisableMinutes * 60_000;
      if (now - lastUsed >= timeoutMs) {
        setPermission(id, false);
      }
    }
  }, 60_000);
}

export function stopPermissionAutoDisable(): void {
  if (_autoDisableInterval) {
    clearInterval(_autoDisableInterval);
    _autoDisableInterval = null;
  }
}

// ---------------------------------------------------------------------------
// Anti-Spy Shield — tracks access attempts and blocks unauthorized usage
// ---------------------------------------------------------------------------
export interface AccessLog {
  permissionId: PermissionId;
  appId: string;
  timestamp: number;
  allowed: boolean;
}

const _accessLog: AccessLog[] = [];
const MAX_LOG_SIZE = 500;

/** Check if a permission is granted. Logs the access attempt. */
export function checkPermissionAccess(permissionId: PermissionId, appId: string): boolean {
  const { permissions } = usePermissionStore.getState();
  const entry = permissions[permissionId];
  const allowed = entry?.enabled ?? false;

  _accessLog.push({ permissionId, appId, timestamp: Date.now(), allowed });
  if (_accessLog.length > MAX_LOG_SIZE) _accessLog.splice(0, _accessLog.length - MAX_LOG_SIZE);

  if (allowed) {
    // Mark as used so auto-disable timer resets
    usePermissionStore.getState().markUsed(permissionId);
  }

  return allowed;
}

/** Get access log for security dashboard (Nexus) */
export function getAccessLog(): AccessLog[] {
  return [..._accessLog];
}

/** Get blocked access count */
export function getBlockedCount(): number {
  return _accessLog.filter(e => !e.allowed).length;
}

/** Get allowed access count */
export function getAllowedCount(): number {
  return _accessLog.filter(e => e.allowed).length;
}

/** Get security summary for Nexus display */
export function getSecuritySummary() {
  const { permissions } = usePermissionStore.getState();
  const active = ALL_PERMISSIONS.filter(id => permissions[id].enabled);
  const inactive = ALL_PERMISSIONS.filter(id => !permissions[id].enabled);
  const totalBlocked = _accessLog.filter(e => !e.allowed).length;
  const totalAllowed = _accessLog.filter(e => e.allowed).length;
  const recentBlocks = _accessLog.filter(e => !e.allowed && Date.now() - e.timestamp < 3600_000);
  const last24h = _accessLog.filter(e => Date.now() - e.timestamp < 86400_000);

  return {
    totalPermissions: ALL_PERMISSIONS.length,
    activePermissions: active.length,
    inactivePermissions: inactive.length,
    activeList: active,
    inactiveList: inactive,
    totalBlocked,
    totalAllowed,
    recentBlocksLastHour: recentBlocks.length,
    accessLast24h: last24h.length,
    antiSpyActive: true,
    autoDisableActive: _autoDisableInterval !== null,
    shieldScore: Math.round(((inactive.length / ALL_PERMISSIONS.length) * 70) + (totalBlocked > 0 ? 20 : 0) + (_autoDisableInterval ? 10 : 0)),
  };
}

// Expose for UKI / system tools
(window as any).__dexPermissions = usePermissionStore;
