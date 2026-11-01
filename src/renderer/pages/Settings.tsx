// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * SETTINGS - macOS System Preferences Style
 * Clean settings panel with sections
 */

import React, { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { getBundledAppVersion, getRuntimeAppVersion } from '../utils/appVersion';
import { applyAccentFamily } from '../utils/accentFamily';
import { setComfort, loadComfort, DENSITY_OPTIONS, type DensityPref } from '../improvements500/comfortPrefs';
import { useToastHelpers } from '../components/Toast';
import { Select } from '../components/Select';
import { AccountSettingsCard } from '../components/account/AccountSettingsCard';
import { APP_DEFINITIONS } from '../store/runningApps';
import { useWallpaperStore, WALLPAPER_PRESETS, type WallpaperPreset } from '../store/wallpaperStore';
import { useShellPreferences } from '../store/shellPreferencesStore';
import { useFloatingLauncher } from '../store/floatingLauncherStore';
import { SETTINGS_SECTIONS } from '../shell/settingsSections';
import type { DockEdge, DockSizePreset } from '../../shared/shell/dockGeometry';
import {
  type DeviceTier, ALL_TIERS, getTierLabel, getTierDescription,
  getStoredTier, getHardwareSummary, detectDeviceTier, applyTierPresets,
  setManualOverride, clearManualOverride, isManualOverride,
  isAutoOptimizeEnabled, setAutoOptimizeEnabled,
} from '../services/TierManager';
import {
  usePermissionStore, ALL_PERMISSIONS, PERMISSION_LABELS, PERMISSION_DESCRIPTIONS,
  type PermissionId,
} from '../store/permissionStore';
import {
  useNetworkStore, NETWORK_MODE_LABELS, NETWORK_MODE_DESCRIPTIONS,
  type NetworkMode,
} from '../store/networkStore';
import { PluginMarketplace } from '../components/PluginMarketplace';
import { NexusBiometrics } from '../components/NexusBiometrics';
import AiProviderSettings from '../components/AiProviderSettings';
import PolicyViewer from '../components/PolicyViewer';
import { useConfirm } from '../components/ConfirmDialog';
import { PermissionsPanel, SnapLayoutsPanel, CreatorAccessPanel } from './settingsPanels/AccessPanels';
import DeveloperSection from './settingsPanels/DeveloperSection';
import StoragePanel from './settingsPanels/StoragePanel';
import { SETTINGS_INDEX, type SettingIndexEntry } from './settingsPanels/settingsSearchIndex';
import { DATA_CATEGORIES, POLICY_CONTACT_EMAIL, POLICY_METADATA, POLICY_REPOSITORY_URL, type PolicySlug } from '../../shared/policies';
import { clearPolicyAcceptance, hasAcceptedCurrentPolicies, isOptionalAnalyticsEnabled, readPolicyAcceptance, setOptionalAnalyticsEnabled } from '../utils/policyConsent';
import { applyMotionDurations } from '../styles/motionDurations';

// ===========================================================================
// TYPES
// ===========================================================================

interface SettingSection {
  id: string;
  name: string;
  icon: React.ReactNode;
  /** Extra synonyms so the search box can match a section by intent. */
  keywords?: string;
}

// ===========================================================================
// ICONS
// ===========================================================================

const Icons = {
  general: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  ),
  appearance: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="5"/>
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </svg>
  ),
  notifications: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 01-3.46 0"/>
    </svg>
  ),
  privacy: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  ),
  updates: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  about: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 16v-4M12 8h.01"/>
    </svg>
  ),
  sound: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 010 7.07"/>
      <path d="M19.07 4.93a10 10 0 010 14.14"/>
    </svg>
  ),
  display: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  ),
  performance: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>
  ),
  systemMonitor: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="4" width="18" height="12" rx="2"/>
      <line x1="8" y1="20" x2="16" y2="20"/>
      <line x1="12" y1="16" x2="12" y2="20"/>
      <path d="M7 11l2.5-3 2 4 2.5-5 3 4"/>
    </svg>
  ),
  accessibility: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="4" r="2"/>
      <path d="M12 6v6m-4-4h8M8 18l4-6 4 6"/>
    </svg>
  ),
  network: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
    </svg>
  ),
  files: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  ),
  browser: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10"/>
      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
    </svg>
  ),
  window: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/><circle cx="6" cy="6" r="1"/><circle cx="10" cy="6" r="1"/>
    </svg>
  ),
  shell: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="15" width="18" height="6" rx="3"/><circle cx="7" cy="18" r="1"/><circle cx="11" cy="18" r="1"/><circle cx="15" cy="18" r="1"/><path d="M5 11l3-3 3 3 3-4 5 6"/>
    </svg>
  ),
  keyboard: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h8"/>
    </svg>
  ),
  storage: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
    </svg>
  ),
  uki: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 8v4l3 3"/>
      <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
    </svg>
  ),
  creativeapps: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
    </svg>
  ),
  plugins: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 2v4h6V2"/><path d="M4 6h16v6a4 4 0 0 1-4 4h-1v6h-6v-6H8a4 4 0 0 1-4-4V6z"/>
    </svg>
  ),
  nexus: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>
      <path d="M9 8a3 3 0 0 1 6 0" strokeDasharray="2 2"/>
    </svg>
  ),
  account: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="7" r="4"/>
      <path d="M5 21v-1a7 7 0 0 1 14 0v1"/>
    </svg>
  ),
  developer: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="16 18 22 12 16 6"/>
      <polyline points="8 6 2 12 8 18"/>
    </svg>
  ),
};

// Section icons live here -- Settings owns its visual presentation. The section
// list + search keywords are the shared source of truth in settingsSections.ts,
// so the command palette's "Settings: ..." deep-links can never drift from this
// sidebar (same ids, same order).
const SECTION_ICONS: Record<string, React.ReactNode> = {
  general: Icons.general,
  appearance: Icons.appearance,
  shell: Icons.shell,
  sound: Icons.sound,
  display: Icons.display,
  notifications: Icons.notifications,
  privacy: Icons.privacy,
  network: Icons.network,
  performance: Icons.performance,
  systemMonitor: Icons.systemMonitor,
  accessibility: Icons.accessibility,
  window: Icons.window,
  snap: Icons.window,
  permissions: Icons.privacy,
  creator: Icons.account,
  keyboard: Icons.keyboard,
  files: Icons.files,
  storage: Icons.storage,
  browser: Icons.browser,
  uki: Icons.uki,
  aiproviders: Icons.uki,
  creativeapps: Icons.creativeapps,
  plugins: Icons.plugins,
  developer: Icons.developer,
  nexus: Icons.nexus,
  updates: Icons.updates,
  account: Icons.account,
  about: Icons.about,
};

const SECTIONS: SettingSection[] = SETTINGS_SECTIONS.map(s => ({
  id: s.id,
  name: s.name,
  icon: SECTION_ICONS[s.id] ?? Icons.general,
  keywords: s.keywords,
}));

const SECTION_CATEGORIES: { label: string; ids: string[] }[] = [
  { label: 'System', ids: ['general', 'appearance', 'shell', 'sound', 'display'] },
  { label: 'Privacy & Security', ids: ['privacy', 'permissions', 'network'] },
  { label: 'Productivity', ids: ['notifications', 'keyboard', 'window', 'snap', 'files'] },
  { label: 'Advanced', ids: ['performance', 'systemMonitor', 'accessibility', 'storage', 'browser'] },
  { label: 'AI', ids: ['aiproviders', 'uki'] },
  { label: 'Creative Suite', ids: ['creativeapps'] },
  { label: 'Developer', ids: ['developer', 'plugins'] },
  { label: 'Extensions', ids: ['nexus'] },
  { label: 'Info', ids: ['updates', 'about'] },
  { label: 'Account', ids: ['account'] },
  { label: 'Owner', ids: ['creator'] },
];

const sectionMap = new Map(SECTIONS.map(s => [s.id, s]));

// ===========================================================================
// PER-SECTION RESET MAP (DEX 5.5)
// Maps a section id to the exact `dex-settings` keys that section's panel
// writes, plus any standalone localStorage keys the file mirrors for that
// section. Reset-to-defaults uses this to restore ONLY that section's keys
// (the rest of the user's settings are untouched). Data only — declaring a
// section here does not change what any control does. Sections rendered by
// external components (Permissions, Plugins, Nexus, Account, AI Providers,
// Creative Suite, Snap, Creator) manage their own storage and are omitted so
// no Reset action is offered for them.
// `defaultKeys` are validated against DEFAULT_SETTINGS at reset time; unknown
// keys are skipped defensively. `localKeys` are removed in a try/catch.
// ===========================================================================
const SECTION_RESET_MAP: Record<string, { defaultKeys: string[]; localKeys?: string[] }> = {
  general: { defaultKeys: ['launchAtStartup', 'checkForUpdates', 'restoreLastSession', 'autoSave', 'analytics'] },
  appearance: {
    defaultKeys: ['darkMode', 'reduceMotion', 'transparency', 'reduceTransparency', 'accentColor', 'fontSize', 'fontScale', 'windowControls', 'stageManager', 'windowMaterial', 'blurIntensity', 'glassOpacity'],
    localKeys: ['darkMode', 'dex-font-scale', 'dex-window-controls'],
  },
  sound: { defaultKeys: ['masterVolume', 'alertVolume', 'outputDevice', 'inputDevice', 'spatialAudio', 'spatialAudioProfile', 'audioBalance', 'enhancedDialogue', 'mediaAutoPlay', 'creativeAppAudioBypass'] },
  display: { defaultKeys: ['displayResolution', 'displayScaling', 'blurIntensity', 'glassOpacity', 'adaptiveBrightness', 'truetoneBrightness', 'nightShift', 'nightShiftWarmth', 'displayRefreshRate', 'hdrContent'] },
  notifications: { defaultKeys: ['enableNotifications', 'soundEnabled', 'badgeEnabled', 'doNotDisturb'] },
  privacy: { defaultKeys: ['locationServices', 'crashReports', 'antiHacker', 'firewallEnabled', 'vpnProtection', 'encryptData', 'blockMalware', 'sandboxApps', 'autoLockMinutes', 'requireAuthOnWake'] },
  network: { defaultKeys: ['networkOptIn', 'wifiEnabled', 'wifiProtection', 'preferredNetwork', 'wifiBand', 'bluetoothEnabled', 'bluetoothMode', 'bluetoothDiscoverable', 'blockTrackerDomains', 'dnsOverHttps', 'ipv6Enabled', 'networkMonitor', 'bandwidthOptimization', 'allowWebGL', 'allowJavaScript', 'strictSecurity'] },
  performance: {
    defaultKeys: ['performanceMode', 'hardwareAcceleration', 'lowPowerMode', 'memoryOptimization', 'preloadApps', 'backgroundBoost', 'performanceReservation', 'predictivePrewarm', 'cpuPriority', 'gpuRendering', 'cacheSizeGB', 'maxRamGB'],
    localKeys: ['dex-predictive-prewarm'],
  },
  accessibility: { defaultKeys: ['highContrast', 'largeText', 'reduceTransparency', 'screenReader', 'letterSpacing', 'lineHeight', 'wordSpacing'] },
  window: {
    defaultKeys: ['snapWindows', 'doubleClickTitlebar', 'showWindowShadows', 'animateWindowResize', 'rememberWindowPositions', 'maxFloatingWindows', 'showAppTabBar'],
    localKeys: ['dex-app-tab-bar'],
  },
  keyboard: { defaultKeys: ['enableGlobalShortcuts', 'cmdPaletteShortcut', 'quickSearchShortcut', 'screenshotShortcut'] },
  files: { defaultKeys: ['showHiddenFiles', 'confirmDelete', 'defaultView', 'sortBy', 'indexFolders', 'watchForChanges', 'thumbnailSize', 'maxStorageGB'] },
  storage: { defaultKeys: [] },
  browser: { defaultKeys: ['blockTrackers', 'blockAds', 'forceHttps', 'fingerprintProtection', 'doNotTrack', 'clearOnExit', 'blockThirdPartyCookies', 'enableTorMode', 'defaultSearchEngine', 'maxDownloadSpeed', 'parallelDownloads'] },
  uki: { defaultKeys: ['ukiEnabled', 'ukiMemoryEnabled', 'ukiWakeWordEnabled', 'ukiWakePhrase', 'ukiRecallMode', 'ukiRetentionDays', 'ukiCacheSizeGB', 'ukiAutoCleanup', 'ukiShowTranscript', 'ukiPersonality'] },
};

// ===========================================================================
// UPDATE MANAGER SECTION
// ===========================================================================

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseNotes: string;
  downloadProgress: number; // 0–100, -1 = not downloading
  status: 'idle' | 'checking' | 'downloading' | 'ready' | 'error';
  error: string | null;
}

interface UpdatePrefs {
  autoCheck: boolean;
  autoDownload: boolean;
  channel: 'stable' | 'beta';
}

interface UpdateHistoryEntry {
  version: string;
  date: string;
  success: boolean;
}

// ===========================================================================
// SYSTEM MONITOR (Task Manager)
// View live system processes, CPU/memory usage, and terminate processes.
// ===========================================================================
interface SystemProcess {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  path?: string;
}

interface SystemStatusInfo {
  cpu?: { usage: number; cores: number };
  memory?: { total: number; used: number; percent: number };
  battery?: { percent: number; charging: boolean };
  uptime?: number;
}

const SystemMonitorPanel: React.FC = () => {
  const { confirm, ConfirmHost } = useConfirm();
  const [processes, setProcesses] = React.useState<SystemProcess[]>([]);
  const [status, setStatus] = React.useState<SystemStatusInfo>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState('');
  const [sortBy, setSortBy] = React.useState<'cpu' | 'memory' | 'name' | 'pid'>('cpu');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');
  const [busyPid, setBusyPid] = React.useState<number | null>(null);

  const dexApi = (window as any).dex;

  const refresh = React.useCallback(async () => {
    if (!dexApi?.system?.getProcesses) {
      setError('The system monitor is not available in this build.');
      setLoading(false);
      return;
    }
    try {
      const [procs, stat] = await Promise.all([
        dexApi.system.getProcesses().catch(() => []),
        dexApi.system.getStatus?.().catch(() => null),
      ]);
      setProcesses(Array.isArray(procs) ? procs : []);
      if (stat) setStatus(stat);
      setError(null);
    } catch (e) {
      console.warn('[Settings] load processes failed:', e);
      setError('Could not load the process list. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [dexApi]);

  React.useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 3000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const handleEndProcess = React.useCallback(async (pid: number, name: string) => {
    if (!dexApi?.power?.closeProcess) {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message: 'Ending processes is not available in this build.' } }));
      return;
    }
    const ok = await confirm({
      title: 'End process?',
      message: `End process "${name}" (PID ${pid})? Unsaved data may be lost.`,
      confirmLabel: 'End process',
      tone: 'destructive',
    });
    if (!ok) return;
    setBusyPid(pid);
    try {
      const result = await dexApi.power.closeProcess(pid, false);
      if (!result?.ok && !result?.success) {
        console.warn('[Settings] closeProcess failed:', result?.error);
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: `Couldn't end "${name}". It may require elevated permissions.` } }));
      } else {
        setProcesses(prev => prev.filter(p => p.pid !== pid));
      }
    } catch (e) {
      console.error('[Settings] closeProcess error:', e);
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: `Couldn't end "${name}". Please try again.` } }));
    } finally {
      setBusyPid(null);
    }
  }, [dexApi]);

  const filtered = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = q ? processes.filter(p => p.name.toLowerCase().includes(q) || String(p.pid).includes(q)) : [...processes];
    list.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortBy) {
        case 'name': return a.name.localeCompare(b.name) * dir;
        case 'pid': return (a.pid - b.pid) * dir;
        case 'memory': return ((a.memory || 0) - (b.memory || 0)) * dir;
        case 'cpu':
        default: return ((a.cpu || 0) - (b.cpu || 0)) * dir;
      }
    });
    return list;
  }, [processes, filter, sortBy, sortDir]);

  const totalCpu = status.cpu?.usage ?? 0;
  const totalMem = status.memory?.percent ?? 0;
  const memUsedGB = status.memory ? (status.memory.used / 1024 ** 3).toFixed(1) : '0.0';
  const memTotalGB = status.memory ? (status.memory.total / 1024 ** 3).toFixed(1) : '0.0';

  const setSort = (col: 'cpu' | 'memory' | 'name' | 'pid') => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir(col === 'name' ? 'asc' : 'desc'); }
  };

  const headerCellStyle: React.CSSProperties = {
    textAlign: 'left', padding: 'var(--space-2) 10px', fontSize: 11, fontWeight: 600,
    color: 'var(--color-text-secondary)', cursor: 'pointer', userSelect: 'none',
    borderBottom: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-elevated, #1a1a1e)',
    position: 'sticky', top: 0, zIndex: 1,
  };
  const cellStyle: React.CSSProperties = {
    padding: '6px 10px', fontSize: 12, color: 'var(--color-text-primary)',
    borderBottom: '1px solid var(--color-border-subtle)',
    fontVariantNumeric: 'tabular-nums',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-5) var(--space-6)', maxWidth: 980 }}>
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 4px', color: 'var(--color-text-primary)' }}>System Monitor</h3>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>
          Live view of all processes running on this computer. End unresponsive processes or check resource usage.
        </p>
      </div>

      {/* Live stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <div style={{ background: 'var(--color-bg-elevated, #1a1a1e)', border: '1px solid var(--color-border-subtle)', borderRadius: 10, padding: 'var(--space-3) 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>CPU</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: totalCpu > 80 ? 'var(--color-error)' : totalCpu > 50 ? 'var(--color-warning)' : 'var(--color-success)', fontVariantNumeric: 'tabular-nums' }}>{totalCpu}%</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{status.cpu?.cores || '?'} cores</div>
        </div>
        <div style={{ background: 'var(--color-bg-elevated, #1a1a1e)', border: '1px solid var(--color-border-subtle)', borderRadius: 10, padding: 'var(--space-3) 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Memory</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: totalMem > 80 ? 'var(--color-error)' : totalMem > 50 ? 'var(--color-warning)' : 'var(--color-success)', fontVariantNumeric: 'tabular-nums' }}>{totalMem}%</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{memUsedGB} / {memTotalGB} GB</div>
        </div>
        <div style={{ background: 'var(--color-bg-elevated, #1a1a1e)', border: '1px solid var(--color-border-subtle)', borderRadius: 10, padding: 'var(--space-3) 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Processes</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{processes.length}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{filtered.length} shown</div>
        </div>
        {status.battery && (
          <div style={{ background: 'var(--color-bg-elevated, #1a1a1e)', border: '1px solid var(--color-border-subtle)', borderRadius: 10, padding: 'var(--space-3) 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Battery</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{status.battery.percent}%</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{status.battery.charging ? 'Charging' : 'On battery'}</div>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Filter by name or PID..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            flex: 1, height: 32, padding: '0 var(--space-3)', borderRadius: 6,
            background: 'var(--color-bg-elevated, #1a1a1e)', border: '1px solid var(--color-border-subtle)',
            color: 'var(--color-text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none',
          }}
        />
        <button
          onClick={refresh}
          style={{
            height: 32, padding: '0 14px', borderRadius: 6, border: '1px solid var(--color-border-subtle)',
            background: 'var(--color-bg-elevated, #1a1a1e)', color: 'var(--color-text-primary)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >Refresh</button>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'var(--color-error-muted, rgba(255,69,58,0.12))', border: '1px solid rgba(255,69,58,0.3)', borderRadius: 6, color: 'var(--color-error)', fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* Process table */}
      <div style={{
        border: '1px solid var(--color-border-subtle)', borderRadius: 10, overflow: 'hidden',
        background: 'var(--color-bg-base, #0e0e11)',
      }}>
        <div style={{ maxHeight: 520, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={headerCellStyle} onClick={() => setSort('name')}>
                  Name {sortBy === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th style={{ ...headerCellStyle, width: 80, textAlign: 'right' }} onClick={() => setSort('pid')}>
                  PID {sortBy === 'pid' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th style={{ ...headerCellStyle, width: 80, textAlign: 'right' }} onClick={() => setSort('cpu')}>
                  CPU {sortBy === 'cpu' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th style={{ ...headerCellStyle, width: 90, textAlign: 'right' }} onClick={() => setSort('memory')}>
                  Memory {sortBy === 'memory' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th style={{ ...headerCellStyle, width: 80, textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} style={{ ...cellStyle, textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-secondary)' }}>Loading processes...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={5} style={{ ...cellStyle, textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-secondary)' }}>
                  {filter ? 'No processes match filter.' : 'No process data available.'}
                </td></tr>
              )}
              {filtered.map(p => (
                <tr key={p.pid} style={{ transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ ...cellStyle, fontWeight: 500, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.path || p.name}>
                    {p.name}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right', color: 'var(--color-text-secondary)' }}>{p.pid}</td>
                  <td style={{ ...cellStyle, textAlign: 'right', color: (p.cpu || 0) > 50 ? 'var(--color-warning)' : 'var(--color-text-primary)' }}>{(p.cpu || 0).toFixed(1)}%</td>
                  <td style={{ ...cellStyle, textAlign: 'right', color: (p.memory || 0) > 10 ? 'var(--color-warning)' : 'var(--color-text-primary)' }}>{(p.memory || 0).toFixed(1)}%</td>
                  <td style={{ ...cellStyle, textAlign: 'center' }}>
                    <button
                      onClick={() => handleEndProcess(p.pid, p.name)}
                      disabled={busyPid === p.pid}
                      aria-label={busyPid === p.pid ? `Ending ${p.name}` : `End process ${p.name} (PID ${p.pid})`}
                      style={{
                        padding: '3px 10px', borderRadius: 4, border: '1px solid rgba(255,69,58,0.4)',
                        background: busyPid === p.pid ? 'var(--color-error-muted, rgba(255,69,58,0.1))' : 'transparent',
                        color: 'var(--color-error)', fontSize: 11, fontWeight: 600,
                        cursor: busyPid === p.pid ? 'wait' : 'pointer',
                      }}
                    >{busyPid === p.pid ? '...' : 'End'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: 0 }}>
        Auto-refreshes every 3 seconds. Ending system processes may cause instability.
      </p>
      <ConfirmHost />
    </div>
  );
};

const UpdateManagerSection: React.FC = () => {
  const { confirm, ConfirmHost } = useConfirm();
  const dexUpdates = (window as any).dex?.updates;
  const [info, setInfo] = React.useState<UpdateInfo>({
    currentVersion: '—',
    latestVersion: null,
    updateAvailable: false,
    releaseNotes: '',
    downloadProgress: -1,
    status: 'idle',
    error: null,
  });
  const [prefs, setPrefs] = React.useState<UpdatePrefs>({
    autoCheck: true, autoDownload: false, channel: 'stable',
  });
  const [history, setHistory] = React.useState<UpdateHistoryEntry[]>([]);
  const [backups, setBackups] = React.useState<any[]>([]);
  const [changelog, setChangelog] = React.useState<string>('');
  const [showChangelog, setShowChangelog] = React.useState(false);
  const [cachePruning, setCachePruning] = React.useState(false);
  const [cachePruneResult, setCachePruneResult] = React.useState<{ freedBytes: number; removed: number } | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval>>();

  // Load everything on mount
  React.useEffect(() => {
    const load = async () => {
      try {
        const i = await dexUpdates?.getInfo?.();
        if (i) setInfo(prev => ({
          ...prev,
          currentVersion: i.currentVersion || prev.currentVersion,
          latestVersion: i.latestVersion || null,
          updateAvailable: !!i.updateAvailable,
          releaseNotes: i.releaseNotes || '',
        }));
      } catch { /* ok */ }
      try {
        const p = await dexUpdates?.getPreferences?.();
        if (p) setPrefs({ autoCheck: p.autoCheck ?? true, autoDownload: p.autoDownload ?? false, channel: p.channel ?? 'stable' });
      } catch { /* ok */ }
      try {
        const h = await dexUpdates?.getUpdateHistory?.();
        if (Array.isArray(h)) setHistory(h);
      } catch { /* ok */ }
      try {
        const b = await dexUpdates?.listBackups?.();
        if (Array.isArray(b)) setBackups(b);
      } catch { /* ok */ }
      try {
        const c = await dexUpdates?.getChangelog?.();
        if (typeof c === 'string') setChangelog(c);
      } catch { /* ok */ }
    };
    load();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const checkForUpdates = async () => {
    setInfo(prev => ({ ...prev, status: 'checking', error: null }));
    try {
      const result = await dexUpdates?.check?.();
      setInfo(prev => ({
        ...prev,
        status: 'idle',
        updateAvailable: !!result?.updateAvailable,
        latestVersion: result?.latestVersion || prev.latestVersion,
        releaseNotes: result?.releaseNotes || prev.releaseNotes,
      }));
    } catch {
      setInfo(prev => ({ ...prev, status: 'idle', error: 'Failed to check for updates' }));
    }
  };

  const downloadUpdate = async () => {
    setInfo(prev => ({ ...prev, status: 'downloading', downloadProgress: 0, error: null }));
    // Poll for progress
    pollRef.current = setInterval(async () => {
      try {
        const i = await dexUpdates?.getInfo?.();
        if (i?.downloadProgress != null) {
          setInfo(prev => ({ ...prev, downloadProgress: i.downloadProgress }));
          if (i.downloadProgress >= 100 || i.status === 'ready') {
            setInfo(prev => ({ ...prev, status: 'ready', downloadProgress: 100 }));
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      } catch { /* ok */ }
    }, 1000);
    try {
      await dexUpdates?.download?.();
      setInfo(prev => ({ ...prev, status: 'ready', downloadProgress: 100 }));
      if (pollRef.current) clearInterval(pollRef.current);
    } catch {
      setInfo(prev => ({ ...prev, status: 'error', error: 'Download failed' }));
      if (pollRef.current) clearInterval(pollRef.current);
    }
  };

  const installUpdate = async () => {
    try { await dexUpdates?.install?.(); } catch {
      setInfo(prev => ({ ...prev, status: 'error', error: 'Install failed' }));
    }
  };

  const skipVersion = async () => {
    if (info.latestVersion) {
      try { await dexUpdates?.skip?.(info.latestVersion); } catch { /* ok */ }
      setInfo(prev => ({ ...prev, updateAvailable: false }));
    }
  };

  const savePrefs = async (next: UpdatePrefs) => {
    setPrefs(next);
    try { await dexUpdates?.setPreferences?.(next); } catch { /* ok */ }
  };

  const pruneUpdateCache = async () => {
    if (cachePruning) return;
    setCachePruning(true);
    setCachePruneResult(null);
    try {
      const result = await dexUpdates?.pruneCache?.();
      if (result) setCachePruneResult(result);
    } catch { /* IPC unavailable */ }
    setCachePruning(false);
  };

  const rollback = async (backupId: string) => {
    const ok = await confirm({
      title: 'Rollback?',
      message: 'Rollback to this version? The app will restart.',
      confirmLabel: 'Rollback',
      tone: 'destructive',
    });
    if (!ok) return;
    try { await dexUpdates?.rollback?.(backupId); } catch { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { message: 'Rollback failed', type: 'error' } })); }
  };

  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) 0', borderBottom: '1px solid var(--color-border-subtle)' };
  const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' };
  const desc: React.CSSProperties = { fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 };
  const heading: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: 'var(--dex-tracking-label, 0.08em)', padding: 'var(--space-4) 0 var(--space-2)', textTransform: 'uppercase' as const };
  const pill = (on: boolean): React.CSSProperties => ({
    width: 44, height: 24, borderRadius: 10, border: on ? 'none' : '1px solid var(--color-border)', cursor: 'pointer',
    background: on ? 'var(--color-accent)' : 'var(--color-bg-glass)',
    position: 'relative', flexShrink: 0,
  });
  const btnBase: React.CSSProperties = { padding: 'var(--space-2) var(--space-4)', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer' };

  const Toggle: React.FC<{ on: boolean; onToggle: () => void; ariaLabel: string }> = ({ on, onToggle, ariaLabel }) => (
    <button style={pill(on)} onClick={onToggle} aria-checked={on} role="switch" aria-label={ariaLabel}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 22 : 2,
        width: 20, height: 20, borderRadius: '50%', background: 'var(--color-bg-surface)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
      }} />
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, height: '100%', overflow: 'hidden' }}>
    <div style={{ flex: 1, padding: '0 var(--space-6) var(--space-6)', overflowY: 'auto' as const }}>
      {/* Status Banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)', borderRadius: 10,
        background: info.updateAvailable ? 'var(--color-accent-soft, rgba(10,132,255,0.08))' : 'var(--color-success-muted, rgba(48,209,88,0.08))',
        border: `1px solid ${info.updateAvailable ? 'var(--color-accent-light, rgba(10,132,255,0.2))' : 'var(--color-success-muted, rgba(48,209,88,0.2))'}`,
        marginBottom: 'var(--space-5)',
      }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: info.updateAvailable ? 'var(--color-accent-muted, rgba(10,132,255,0.15))' : 'var(--color-success-muted, rgba(48,209,88,0.15))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {info.updateAvailable ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {info.status === 'checking' ? 'Checking for updates...' :
             info.status === 'downloading' ? `Downloading update... ${info.downloadProgress}%` :
             info.status === 'ready' ? 'Update ready to install' :
             info.updateAvailable ? `Version ${info.latestVersion} available` :
             'DEX is up to date'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
            Current version: {info.currentVersion}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
          {info.status === 'idle' && !info.updateAvailable && (
            <button onClick={checkForUpdates} aria-label="Check for updates" style={{ ...btnBase, background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)' }}>Check Now</button>
          )}
          {info.status === 'idle' && info.updateAvailable && (
            <>
              <button onClick={skipVersion} aria-label="Skip this version" style={{ ...btnBase, background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-subtle)' }}>Skip</button>
              <button onClick={downloadUpdate} aria-label="Download update" style={{ ...btnBase, background: 'var(--color-accent)', color: 'var(--color-text-primary)' }}>Download</button>
            </>
          )}
          {info.status === 'ready' && (
            <button onClick={installUpdate} aria-label="Install update and restart" style={{ ...btnBase, background: 'var(--color-accent)', color: 'var(--color-text-primary)' }}>Install & Restart</button>
          )}
        </div>
      </div>

      {/* Download Progress */}
      {info.status === 'downloading' && (
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, background: 'var(--color-accent)', width: `${Math.max(0, info.downloadProgress)}%` }} />
          </div>
        </div>
      )}

      {/* Error */}
      {info.error && (
        <div style={{ fontSize: 12, color: 'var(--color-error)', padding: 'var(--space-2) 0 var(--space-3)' }}>{info.error}</div>
      )}

      {/* Release Notes */}
      {info.releaseNotes && (
        <>
          <div style={heading}>Release Notes</div>
          <div style={{
            padding: 14, borderRadius: 10, background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-subtle)', fontSize: 12, color: 'var(--color-text-secondary)',
            lineHeight: 1.6, maxHeight: 120, overflowY: 'auto' as const, marginBottom: 'var(--space-3)', whiteSpace: 'pre-wrap' as const,
          }}>
            {info.releaseNotes}
          </div>
        </>
      )}

      {/* Preferences */}
      <div style={heading}>Preferences</div>
      <div style={row}>
        <div><div style={label}>Auto-check for updates</div><div style={desc}>Periodically check for new versions</div></div>
        <Toggle on={prefs.autoCheck} onToggle={() => savePrefs({ ...prefs, autoCheck: !prefs.autoCheck })} ariaLabel="Toggle auto-check" />
      </div>
      <div style={row}>
        <div><div style={label}>Auto-download updates</div><div style={desc}>Download updates in the background</div></div>
        <Toggle on={prefs.autoDownload} onToggle={() => savePrefs({ ...prefs, autoDownload: !prefs.autoDownload })} ariaLabel="Toggle auto-download" />
      </div>
      <div style={row}>
        <div><div style={label}>Update Channel</div><div style={desc}>Stable is recommended for most users</div></div>
        <Select
          size="sm"
          options={[{ value: 'stable', label: 'Stable' }, { value: 'beta', label: 'Beta' }]}
          value={prefs.channel}
          onChange={v => savePrefs({ ...prefs, channel: v as 'stable' | 'beta' })}
        />
      </div>

      {/* Cache Reclaim */}
      <div style={row}>
        <div>
          <div style={label}>Update Cache</div>
          <div style={desc}>
            {cachePruneResult
              ? cachePruneResult.removed === 0
                ? 'Cache is clean — no files to remove'
                : `Freed ${(cachePruneResult.freedBytes / 1024 / 1024).toFixed(1)} MB (${cachePruneResult.removed} file${cachePruneResult.removed !== 1 ? 's' : ''} removed)`
              : 'Remove stale installer downloads from the update cache'}
          </div>
        </div>
        <button
          onClick={pruneUpdateCache}
          disabled={cachePruning}
          aria-label="Clear update cache"
          style={{ ...btnBase, background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', opacity: cachePruning ? 0.5 : 1, minWidth: 80, cursor: cachePruning ? 'default' : 'pointer' }}
        >
          {cachePruning ? 'Clearing…' : 'Clear Cache'}
        </button>
      </div>

      {/* Changelog */}
      <div style={heading}>Changelog</div>
      <button
        onClick={() => setShowChangelog(!showChangelog)}
        aria-label={showChangelog ? 'Hide changelog' : 'View changelog'}
        style={{ ...btnBase, background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
        {showChangelog ? 'Hide Changelog' : 'View Changelog'}
      </button>
      {showChangelog && changelog && (
        <div style={{
          padding: 14, borderRadius: 10, background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border-subtle)', fontSize: 12, color: 'var(--color-text-secondary)',
          lineHeight: 1.6, maxHeight: 200, overflowY: 'auto' as const, marginBottom: 'var(--space-3)', whiteSpace: 'pre-wrap' as const,
        }}>
          {changelog}
        </div>
      )}

      {/* Update History */}
      {history.length > 0 && (
        <>
          <div style={heading}>Update History</div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4, marginBottom: 'var(--space-3)' }}>
            {history.slice(0, 10).map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-2) var(--space-3)', borderRadius: 6, background: 'var(--color-bg-surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: h.success ? 'var(--color-success)' : 'var(--color-error)' }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>v{h.version}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{h.date}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Backups / Rollback */}
      {backups.length > 0 && (
        <>
          <div style={heading}>Rollback</div>
          <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '0 0 var(--space-2)' }}>Restore a previous version if the current one has issues.</p>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
            {backups.map((b: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-2) var(--space-3)', borderRadius: 6, background: 'var(--color-bg-surface)' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{b.version || b.id}</span>
                <button
                  onClick={() => rollback(b.id)}
                  aria-label={`Rollback to version ${b.version || b.id}`}
                  style={{ ...btnBase, background: 'transparent', color: 'var(--color-error)', border: '1px solid rgba(255,69,58,0.3)', padding: '4px var(--space-3)', fontSize: 11 }}
                >
                  Rollback
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
    <ConfirmHost />
    </div>
  );
};

// ===========================================================================
// COMPONENT
// ===========================================================================

// Load/save settings from localStorage
const loadSettings = () => {
  try {
    const saved = localStorage.getItem('dex-settings');
    if (saved) return JSON.parse(saved);
  } catch { /* localStorage unavailable */ }
  return null;
};

// Save to backend with retry
const saveSettingsToBackend = async (settings: Record<string, unknown>, retries = 2): Promise<boolean> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (window.electron?.invoke) {
        await window.electron.invoke('capability:storage:set', 'dex-settings', settings);
        return true;
      }
    } catch (e) {
      if (attempt === retries && import.meta.env.DEV) console.warn('[Settings] Backend save failed after retries');
    }
  }
  return false;
};

// Load from backend
const loadSettingsFromBackend = async (): Promise<Record<string, unknown> | null> => {
  try {
    if (window.electron?.invoke) {
      const settings = await window.electron.invoke('capability:storage:get', 'dex-settings');
      if (settings) return settings;
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[Settings] Backend load failed, using localStorage');
  }
  return loadSettings();
};

const saveSettings = (settings: Record<string, unknown>) => {
  localStorage.setItem('dex-settings', JSON.stringify(settings));
  // Let live consumers (useDexSetting) pick the change up immediately.
  try { window.dispatchEvent(new CustomEvent('dex-settings-changed')); } catch { /* noop */ }
  // Also save to backend
  saveSettingsToBackend(settings);
  // Apply settings immediately
  applySettings(settings);
};

// Export settings to JSON file
const exportSettings = (settings: Record<string, unknown>): void => {
  try {
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      settings: settings,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dex-settings-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    window.dispatchEvent(new CustomEvent('dex-toast', { 
      detail: { message: 'Settings exported successfully', type: 'success' } 
    }));
  } catch (e) {
    window.dispatchEvent(new CustomEvent('dex-toast', { 
      detail: { message: 'Failed to export settings', type: 'error' } 
    }));
  }
};

// Import settings from JSON file
const importSettings = (onImport: (settings: typeof DEFAULT_SETTINGS) => void): void => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.settings && typeof data.settings === 'object') {
        // Merge with defaults to ensure all keys exist
        const merged = { ...DEFAULT_SETTINGS, ...data.settings };
        onImport(merged);
        window.dispatchEvent(new CustomEvent('dex-toast', { 
          detail: { message: 'Settings imported successfully', type: 'success' } 
        }));
      } else {
        throw new Error('Invalid settings format');
      }
    } catch (e) {
      window.dispatchEvent(new CustomEvent('dex-toast', { 
        detail: { message: 'Failed to import settings: invalid file format', type: 'error' } 
      }));
    }
  };
  input.click();
};

// Check if a setting differs from its default value
const isSettingChanged = (key: keyof typeof DEFAULT_SETTINGS, value: unknown): boolean => {
  return JSON.stringify(DEFAULT_SETTINGS[key]) !== JSON.stringify(value);
};

// Count how many settings have been changed from defaults
const countChangedSettings = (settings: typeof DEFAULT_SETTINGS): number => {
  let count = 0;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]) {
    if (isSettingChanged(key, settings[key])) count++;
  }
  return count;
};

// Apply settings to the system
const applySettings = (settings: Record<string, unknown>) => {
  try {
    // Apply performance settings via IPC
    if (window.electron?.invoke) {
      window.electron.invoke('settings:apply', settings).catch((e: unknown) => { console.warn('[DEX]', e); });
    }
    
    const root = document.documentElement;
    const body = document.body;
    
    // Apply selected theme (dark or light)
    const theme = settings.darkMode !== false ? 'dark' : 'light';
    root.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      body.classList.add('dark-mode');
      root.classList.add('dark-mode');
      body.classList.remove('light-mode');
      root.classList.remove('light-mode');
    } else {
      body.classList.add('light-mode');
      root.classList.add('light-mode');
      body.classList.remove('dark-mode');
      root.classList.remove('dark-mode');
    }
    // When the user actually changes Dark Mode, pin it: utils/theme's boot code
    // otherwise ignores `darkMode` and follows the OS scheme, so a Light choice
    // was undone on restart.
    const nextDark = String(settings.darkMode !== false);
    if (nextDark !== (localStorage.getItem('darkMode') ?? 'true')) {
      localStorage.setItem('dex-theme-source', 'user');
    }
    localStorage.setItem('darkMode', nextDark);

    // Apply locale to document.lang and dir (RTL for Arabic/Hebrew/Persian/Urdu)
    try {
      const rawLocale = String(settings.ukiLocale || 'auto');
      const lang = rawLocale === 'auto'
        ? (typeof navigator !== 'undefined' ? navigator.language : 'en')
        : rawLocale;
      root.lang = lang;
      const rtlPrefixes = ['ar', 'he', 'fa', 'ur'];
      const isRtl = rtlPrefixes.some(p => lang.toLowerCase().startsWith(p));
      root.dir = isRtl ? 'rtl' : 'ltr';
    } catch { /* ignore */ }
    
    // Apply accent color as one coherent family (base/hover/dark/light/soft) via
    // the shared deriver, so accent tints and pressed states track the chosen
    // colour. A non-literal sentinel like 'var(--color-accent)' means "system
    // default": clear inline overrides so the stylesheet baseline shows through
    // (the old path set --color-accent to a self-referential var, which broke it).
    const accentColor = String(settings.accentColor || '').trim();
    if (!applyAccentFamily(accentColor)) {
      for (const prop of ['--color-accent', '--accent-color', '--color-accent-hover', '--color-accent-dark', '--color-accent-light', '--color-accent-soft']) {
        root.style.removeProperty(prop);
      }
    }

    // Apply font size (scale-based)
    const scale = typeof settings.fontScale === 'number' ? settings.fontScale : 100;
    root.style.setProperty('--font-size-base', `${Math.round(14 * scale / 100)}px`);
    root.style.setProperty('--font-scale', String(scale / 100));
    
    // Apply transparency settings
    if (settings.transparency && !settings.reduceTransparency) {
      root.classList.add('transparency-enabled');
      root.classList.remove('transparency-disabled');
    } else {
      root.classList.remove('transparency-enabled');
      root.classList.add('transparency-disabled');
      // Use solid backgrounds when transparency is disabled
      root.style.setProperty('--color-bg-glass', 'var(--color-bg-surface-solid)');
      root.style.setProperty('--color-bg-glass-strong', 'var(--color-bg-surface-solid)');
    }
    
    // Apply high contrast — set both the legacy body class and a root attribute
    // so the WCAG-AAA palette in design-system.css ([data-high-contrast="true"])
    // can override the core --color-* tokens per theme, live with no reload.
    if (settings.highContrast) {
      body.classList.add('high-contrast');
      root.setAttribute('data-high-contrast', 'true');
    } else {
      body.classList.remove('high-contrast');
      root.removeAttribute('data-high-contrast');
    }

    // Apply text spacing (WCAG 1.4.12) — multipliers exposed as root CSS vars.
    const letterSp = typeof settings.letterSpacing === 'number' ? settings.letterSpacing : 0;
    const lineHt = typeof settings.lineHeight === 'number' ? settings.lineHeight : 1.5;
    const wordSp = typeof settings.wordSpacing === 'number' ? settings.wordSpacing : 0;
    root.style.setProperty('--text-letter-spacing', `${letterSp}em`);
    root.style.setProperty('--text-line-height', String(lineHt));
    root.style.setProperty('--text-word-spacing', `${wordSp}em`);

    // Apply large text
    if (settings.largeText) {
      body.style.fontSize = '18px';
    } else {
      body.style.fontSize = '';
    }
    
    // Apply reduce motion
    // Shared duration source (was 80/150/250/300 ms here, conflicting with
    // the stylesheet and TierManager).
    applyMotionDurations(root, { reduce: Boolean(settings.reduceMotion) });
    root.style.setProperty('--animation-duration', settings.reduceMotion ? '0ms' : '200ms');

    // Sync App Tab Bar visibility to localStorage + notify AppManager
    const tabBarVal = settings.showAppTabBar !== false;
    localStorage.setItem('dex-app-tab-bar', String(tabBarVal));
    window.dispatchEvent(new Event('dex-app-tab-bar-changed'));

    // Apply blur/opacity to CSS vars for glass surfaces
    const blur = typeof settings.blurIntensity === 'number' ? settings.blurIntensity : 12;
    const opacity = typeof settings.glassOpacity === 'number' ? settings.glassOpacity : 0.85;
    root.style.setProperty('--blur-intensity', `${blur}px`);
    root.style.setProperty('--glass-opacity', String(opacity));

    // -- Phase 15: publish appearance bus tokens so all shell surfaces share one truth --
    import('../../shared/phase15').then(({ appearanceToCssVars, normalizeAppearance }) => {
      const profile = normalizeAppearance({
        theme: settings.darkMode !== false ? 'dark' : 'light',
        transparency: settings.transparency !== false,
        reducedTransparency: !!settings.reduceTransparency,
        reducedMotion: !!settings.reduceMotion,
        density: settings.compactMode ? 'compact' : 'regular',
        contrast: settings.highContrast ? 'high' : 'normal',
        allowHeavyBlur: settings.transparency !== false && !settings.reduceTransparency,
      });
      const systemDark = settings.darkMode !== false;
      const vars = appearanceToCssVars(profile, systemDark);
      for (const [k, v] of Object.entries(vars)) {
        root.style.setProperty(k, v as string);
      }
    }).catch(() => { /* phase15 import must never break settings apply */ });

  } catch (e) {
    if (import.meta.env.DEV) console.warn('[Settings] Failed to apply settings:', e);
  }
};

// Helper functions for color manipulation
const lightenColor = (hex: string, percent: number): string => {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, (num >> 16) + amt);
  const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
  const B = Math.min(255, (num & 0x0000FF) + amt);
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
};

const darkenColor = (hex: string, percent: number): string => {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, (num >> 16) - amt);
  const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
  const B = Math.max(0, (num & 0x0000FF) - amt);
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
};

const _isMac = !navigator.platform?.includes('Win') && !navigator.platform?.includes('Linux');
const _M = _isMac ? '⌘' : 'Ctrl';

const DEFAULT_SETTINGS = {
  // General
  launchAtStartup: true,
  checkForUpdates: true,
  analytics: false,
  autoSave: true,
  restoreLastSession: true,
  
  // Appearance
  darkMode: true,
  reduceMotion: false,
  transparency: true,
  accentColor: 'var(--color-accent)', // system default = stylesheet baseline (macOS system blue)
  fontSize: 'medium',
  fontScale: 100,
  targetFPS: 120,
  windowControls: (navigator.platform?.includes('Win') ? 'system' : 'traffic') as 'system' | 'traffic', // auto-detect: system on Windows, traffic on macOS/Linux
  stageManager: false, // macOS Tahoe Stage Manager -- organizes open apps on the left (off by default)
  
  // Customization
  taskbarPosition: 'bottom',
  taskbarSize: 'medium',
  showLabels: false,
  compactMode: false,
  animationSpeed: 'normal',
  
  // Browser
  blockTrackers: true,
  blockAds: true,
  forceHttps: true,
  fingerprintProtection: true,
  doNotTrack: true,
  clearOnExit: false,
  blockThirdPartyCookies: true,
  enableTorMode: false,
  defaultSearchEngine: 'duckduckgo',
  maxDownloadSpeed: 'unlimited',
  parallelDownloads: 8,
  
  // Files
  showHiddenFiles: false,
  confirmDelete: true,
  defaultView: 'list',
  sortBy: 'name',
  indexFolders: true,
  watchForChanges: true,
  thumbnailSize: 'medium',
  maxStorageGB: 100000,
  
  // Auto-Fill
  enableAutoFill: true,
  savePasswords: true,
  saveAddresses: true,
  saveCreditCards: false,
  autoFillForms: true,
  smartSuggestions: true,
  
  // Notifications
  enableNotifications: true,
  soundEnabled: true,
  badgeEnabled: true,
  doNotDisturb: false,
  
  // Sound
  masterVolume: 80,
  alertVolume: 70,
  outputDevice: 'built-in' as string,
  inputDevice: 'built-in' as string,
  spatialAudio: false,
  spatialAudioProfile: 'fixed' as 'fixed' | 'head-tracked' | 'off',
  audioBalance: 50,
  enhancedDialogue: false,
  mediaAutoPlay: true,
  creativeAppAudioBypass: true, // Allow creative apps (AXL, VINX, Imosion, Flux) to bypass DEX audio effects
  
  // Display & Glass
  displayResolution: 'native',
  displayScaling: '150',
  blurIntensity: 20,
  glassOpacity: 70,
  windowMaterial: 'glass' as 'glass' | 'frosted' | 'solid',
  adaptiveBrightness: true,
  truetoneBrightness: false,
  nightShift: false,
  nightShiftWarmth: 50,
  displayRefreshRate: 'adaptive' as '60' | '120' | 'adaptive',
  hdrContent: true,
  
  // Privacy & Security
  locationServices: false,
  crashReports: true,
  antiHacker: true,
  firewallEnabled: true,
  vpnProtection: false,
  encryptData: true,
  blockMalware: true,
  sandboxApps: true,
  historyAutoClearDays: 7,
  
  // Authentication
  authMethod: 'none' as 'none' | 'pin' | 'password' | 'biometric' | 'pin+biometric' | 'password+biometric',
  biometricEnabled: false,
  pinEnabled: false,
  passwordEnabled: false,
  requireAuthOnWake: false,
  autoLockMinutes: 5,
  
  // Network
  networkOptIn: true, // Master network toggle -- replaces env-var approach
  wifiEnabled: true,
  wifiProtection: true,
  preferredNetwork: 'auto',
  wifiBand: 'auto',
  bluetoothEnabled: false,
  bluetoothMode: 'auto',
  bluetoothDiscoverable: false,
  blockTrackerDomains: true,
  dnsOverHttps: true,
  ipv6Enabled: false,
  networkMonitor: true,
  bandwidthOptimization: true,
  allowWebGL: true,
  allowJavaScript: true,
  strictSecurity: false,
  
  // Performance
  performanceMode: 'auto',
  hardwareAcceleration: true,
  lowPowerMode: false,
  memoryOptimization: true,
  preloadApps: true,
  backgroundBoost: true,
  performanceReservation: false,
  predictivePrewarm: true,
  cpuPriority: 'high',
  gpuRendering: true,
  cacheSizeGB: 8,
  maxRamGB: 0, // 0 = auto (uses 50% of system RAM, no artificial cap)
  
  // Accessibility
  highContrast: false,
  largeText: false,
  reduceTransparency: false,
  screenReader: false,
  letterSpacing: 0,    // WCAG 1.4.12 text spacing — em multiplier
  lineHeight: 1.5,     // WCAG 1.4.12 line height (unitless)
  wordSpacing: 0,      // WCAG 1.4.12 word spacing — em multiplier

  // Window Management
  snapWindows: true,          // Enable window snapping to edges/zones
  doubleClickTitlebar: 'maximize' as 'maximize' | 'minimize' | 'none',
  showWindowShadows: true,
  animateWindowResize: true,
  rememberWindowPositions: true,
  maxFloatingWindows: 12,
  showAppTabBar: true,        // Persistent running-app tab bar above content

  // Keyboard Shortcuts
  enableGlobalShortcuts: true,
  cmdPaletteShortcut: `${_M}+Shift+P`,
  quickSearchShortcut: `${_M}+K`,
  screenshotShortcut: `${_M}+Shift+S`,

  // Storage & Data
  autoCleanCache: true,
  cacheCleanIntervalDays: 7,
  compressOldFiles: false,

  // UKI & Memory
  ukiEnabled: true,
  ukiMemoryEnabled: true,
  ukiWakeWordEnabled: false,
  ukiWakePhrase: 'Hey UKI',
  ukiRecallMode: 'hybrid' as 'auto' | 'explicit' | 'hybrid',
  ukiRetentionDays: 30,
  ukiCacheSizeGB: 3,
  ukiAutoCleanup: true,
  ukiShowTranscript: true,
  ukiPersonality: 'casual' as 'formal' | 'casual',

  // UKI Voice (TTS) preferences -- default to a female voice when available
  ukiVoiceGender: 'female' as 'female' | 'male' | 'auto',
  ukiVoiceURI: '' as string,
  ukiVoiceRate: 1.0,
  ukiVoicePitch: 1.0,
  ukiVoiceVolume: 1.0,

  // Language & Region
  ukiLocale: 'auto' as string,
};

// ===============================================================================
// COMPONENT
// ===============================================================================

const TextDensityControls: React.FC<{
  sectionTitle: React.CSSProperties;
  settingRow: React.CSSProperties;
  settingInfo: React.CSSProperties;
  settingLabel: React.CSSProperties;
  settingDesc: React.CSSProperties;
}> = ({ sectionTitle, settingRow, settingInfo, settingLabel, settingDesc }) => {
  const [fontScale, setFontScale] = useState<number>(() => {
    try {
      const v = parseFloat(localStorage.getItem('dex-font-scale') || '');
      return Number.isFinite(v) && v >= 0.8 && v <= 1.4 ? v : 1;
    } catch { return 1; }
  });
  const [density, setDensity] = useState<DensityPref>(() => loadComfort().density);

  const applyFontScale = (v: number) => {
    setFontScale(v);
    document.documentElement.style.setProperty('--font-scale', String(v));
    try { localStorage.setItem('dex-font-scale', String(v)); } catch {}
  };
  const applyDensity = (v: DensityPref) => {
    setDensity(v);
    // Canonical density path: comfortPrefs writes data-density on <html>, which
    // the consolidated density tokens in design-system.css pick up app-wide.
    setComfort({ density: v });
  };

  return (
    <>
      <h3 style={sectionTitle}>Text & Density</h3>
      <div style={settingRow}>
        <div style={settingInfo}>
          <span style={settingLabel}>Text size</span>
          <span style={settingDesc}>Scale all UI text ({Math.round(fontScale * 100)}%)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 200 }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>A</span>
          <input
            type="range"
            min="0.8"
            max="1.4"
            step="0.05"
            value={fontScale}
            onChange={e => applyFontScale(Number(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--color-accent)' }}
            aria-label="Text size"
          />
          <span style={{ fontSize: 16, color: 'var(--color-text-tertiary)' }}>A</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', minWidth: 36, textAlign: 'right' }}>
            {Math.round(fontScale * 100)}%
          </span>
        </div>
      </div>
      <div style={settingRow}>
        <div style={settingInfo}>
          <span style={settingLabel}>Density</span>
          <span style={settingDesc}>Spacing across the whole UI — compact, default, or comfortable</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }} role="group" aria-label="UI density">
          {DENSITY_OPTIONS.map(opt => {
            const active = density === opt.id;
            return (
              <button
                key={opt.id}
                aria-label={`${opt.label} density`}
                aria-pressed={active}
                onClick={() => applyDensity(opt.id)}
                style={{
                  padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  border: active ? '1px solid var(--dex-focus-color, #fff)' : '1px solid var(--color-border)',
                  background: active ? 'var(--color-bg-active, #252528)' : 'transparent',
                  color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};

// Dark-room: near-black surfaces + dimmed text for low-light work. Self-contained
// so it owns its own state; persists + applies through the canonical comfortPrefs
// path (writes data-darkroom on <html>, read by design-system.css).
const DarkRoomToggle: React.FC<{
  settingRow: React.CSSProperties;
  settingInfo: React.CSSProperties;
  settingLabel: React.CSSProperties;
  settingDesc: React.CSSProperties;
}> = ({ settingRow, settingInfo, settingLabel, settingDesc }) => {
  const [on, setOn] = useState<boolean>(() => loadComfort().darkroom);
  const toggle = (v: boolean) => { setOn(v); setComfort({ darkroom: v }); };
  return (
    <div style={settingRow}>
      <div style={settingInfo}>
        <span style={settingLabel}>Pure black (OLED)</span>
        <span style={settingDesc}>True-black surfaces — eases the eyes in low light and saves power on OLED screens</span>
      </div>
      <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={on}
          onChange={e => toggle(e.target.checked)}
          aria-label="Dark room mode"
          style={{ accentColor: 'var(--color-accent)', width: 18, height: 18, cursor: 'pointer' }}
        />
      </label>
    </div>
  );
};

// =============================================================================
// UKI VOICE SECTION -- gender preference, voice picker, rate/pitch/volume,
// language locale and a preview button. Defaults to a female system voice
// when one is available; falls back to the platform default with explanation.
// =============================================================================
type UkiVoiceSectionProps = {
  styles: any;
  settings: any;
  setSettings: React.Dispatch<React.SetStateAction<any>>;
  renderSelect: (key: any, label: string, description: string, options: { value: string; label: string }[]) => React.ReactElement;
};

const FEMALE_VOICE_HINTS = ['female', 'woman', 'samantha', 'victoria', 'karen', 'tessa', 'fiona', 'moira', 'serena', 'allison', 'ava', 'susan', 'zira', 'aria', 'jenny', 'libby', 'sonia', 'amber', 'ashley', 'michelle', 'monica', 'paulina', 'sara'];
const MALE_VOICE_HINTS = ['male', 'man', 'daniel', 'alex', 'fred', 'oliver', 'tom', 'david', 'mark', 'george', 'james', 'guy', 'ryan', 'brian', 'aaron'];

function classifyVoiceGender(v: SpeechSynthesisVoice): 'female' | 'male' | 'unknown' {
  const hay = `${v.name} ${v.voiceURI}`.toLowerCase();
  if (FEMALE_VOICE_HINTS.some(h => hay.includes(h))) return 'female';
  if (MALE_VOICE_HINTS.some(h => hay.includes(h))) return 'male';
  return 'unknown';
}

export function pickPreferredVoice(
  voices: SpeechSynthesisVoice[],
  prefs: { gender?: 'female' | 'male' | 'auto'; voiceURI?: string; locale?: string },
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  if (prefs.voiceURI) {
    const exact = voices.find(v => v.voiceURI === prefs.voiceURI);
    if (exact) return exact;
  }
  const localePrefix = (prefs.locale && prefs.locale !== 'auto')
    ? prefs.locale.toLowerCase()
    : (typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en');
  const localeMatches = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith(localePrefix.slice(0, 2)));
  const pool = localeMatches.length ? localeMatches : voices;
  if (prefs.gender && prefs.gender !== 'auto') {
    const hit = pool.find(v => classifyVoiceGender(v) === prefs.gender);
    if (hit) return hit;
  }
  // Default preference: female voice if available
  const female = pool.find(v => classifyVoiceGender(v) === 'female');
  if (female) return female;
  return pool[0] ?? null;
}

const UkiVoiceSection: React.FC<UkiVoiceSectionProps> = ({ styles, settings, setSettings, renderSelect }) => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const filtered = useMemo(() => {
    const gender = (settings.ukiVoiceGender || 'female') as 'female' | 'male' | 'auto';
    if (gender === 'auto') return voices;
    return voices.filter(v => {
      const g = classifyVoiceGender(v);
      return g === gender || g === 'unknown';
    });
  }, [voices, settings.ukiVoiceGender]);

  const voiceOptions: { value: string; label: string }[] = useMemo(() => ([
    { value: '', label: filtered.length ? 'Auto (best match)' : 'No system voices detected' },
    ...filtered.map(v => ({
      value: v.voiceURI,
      label: `${v.name} -- ${v.lang}${classifyVoiceGender(v) !== 'unknown' ? ` (${classifyVoiceGender(v)})` : ''}`,
    })),
  ]), [filtered]);

  const localeOptions: { value: string; label: string }[] = [
    { value: 'auto', label: 'Auto (system)' },
    { value: 'en', label: 'English' },
    { value: 'en-US', label: 'English (United States)' },
    { value: 'en-GB', label: 'English (United Kingdom)' },
    { value: 'es', label: 'Espanol' },
    { value: 'fr', label: 'Francais' },
    { value: 'de', label: 'Deutsch' },
    { value: 'it', label: 'Italiano' },
    { value: 'pt', label: 'Portugues' },
    { value: 'ja', label: 'Japanese' },
    { value: 'ko', label: 'Korean' },
    { value: 'zh', label: 'Chinese' },
    { value: 'ar', label: 'Arabic (RTL)' },
    { value: 'he', label: 'Hebrew (RTL)' },
    { value: 'ru', label: 'Russian' },
    { value: 'hi', label: 'Hindi' },
    { value: 'tr', label: 'Turkish' },
  ];

  const handlePreview = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance('Hello, this is your DEX voice. How can I help you today?');
      const v = pickPreferredVoice(voices, {
        gender: settings.ukiVoiceGender,
        voiceURI: settings.ukiVoiceURI,
        locale: settings.ukiLocale,
      });
      if (v) utterance.voice = v;
      utterance.rate = Number(settings.ukiVoiceRate ?? 1);
      utterance.pitch = Number(settings.ukiVoicePitch ?? 1);
      utterance.volume = Number(settings.ukiVoiceVolume ?? 1);
      utterance.onend = () => setPreviewing(false);
      utterance.onerror = () => setPreviewing(false);
      setPreviewing(true);
      window.speechSynthesis.speak(utterance);
    } catch {
      setPreviewing(false);
    }
  };

  const renderFloatSlider = (key: 'ukiVoiceRate' | 'ukiVoicePitch' | 'ukiVoiceVolume', label: string, description: string, min: number, max: number, step: number) => (
    <div style={styles.settingRow}>
      <div style={styles.settingInfo}>
        <span style={styles.settingLabel}>{label}</span>
        <span style={styles.settingDesc}>{description}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={Number(settings[key] ?? 1)}
          onChange={e => setSettings((prev: any) => ({ ...prev, [key]: Number(e.target.value) }))}
          style={{ width: 120, accentColor: 'var(--color-accent, #0a84ff)' }}
          aria-label={label}
        />
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums', minWidth: 40, textAlign: 'right' }}>
          {Number(settings[key] ?? 1).toFixed(2)}
        </span>
      </div>
    </div>
  );

  const ttsAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;

  return (
    <>
      <h3 style={styles.sectionTitle}>Voice & Language</h3>
      {!ttsAvailable && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '4px 0' }}>
          Speech synthesis is not available in this runtime.
        </div>
      )}
      {renderSelect('ukiVoiceGender', 'Voice gender', 'Prefer a female or male voice when available', [
        { value: 'female', label: 'Female (recommended)' },
        { value: 'male', label: 'Male' },
        { value: 'auto', label: 'Auto (system default)' },
      ])}
      {renderSelect('ukiVoiceURI', 'Voice', voices.length ? 'Pick a specific voice or leave on Auto' : 'Voices load asynchronously -- reopen Settings if empty', voiceOptions)}
      {renderSelect('ukiLocale', 'Language', 'UI and voice language preference', localeOptions)}
      {renderFloatSlider('ukiVoiceRate', 'Speech rate', 'How fast UKI speaks', 0.5, 2.0, 0.05)}
      {renderFloatSlider('ukiVoicePitch', 'Pitch', 'Voice pitch', 0.5, 2.0, 0.05)}
      {renderFloatSlider('ukiVoiceVolume', 'Volume', 'Speech volume', 0, 1, 0.05)}
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Preview</span>
          <span style={styles.settingDesc}>Hear the current voice settings</span>
        </div>
        <button
          type="button"
          onClick={handlePreview}
          disabled={!ttsAvailable || previewing}
          aria-label="Preview UKI voice"
          style={{
            padding: '6px 14px', borderRadius: 6, fontSize: 12,
            border: '1px solid var(--color-border)',
            background: previewing ? 'var(--color-bg-active)' : 'var(--color-bg-hover)',
            color: 'var(--color-text-primary)', cursor: ttsAvailable ? 'pointer' : 'not-allowed',
            opacity: ttsAvailable ? 1 : 0.5,
          }}
        >
          {previewing ? 'Speaking...' : 'Preview voice'}
        </button>
      </div>
    </>
  );
};

// =============================================================================
// UKI ARCHIVE STATS -- shows compression ratio and lets the user export/clear
// the local UKI memory archive.
// =============================================================================
const UkiArchiveStats: React.FC<{ styles: any }> = ({ styles }) => {
  const [stats, setStats] = useState<{ archiveCount: number; rawBytes: number; compressedBytes: number; ratio: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const mod = await import('../uki/compressedMemory');
      const s = await mod.getCompressionStats();
      setStats({ archiveCount: s.archiveCount, rawBytes: s.rawBytes, compressedBytes: s.compressedBytes, ratio: s.ratio });
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleClear = async () => {
    if (!confirm('Clear all compressed memory archives? This removes the warm/cold history but keeps the rolling window.')) return;
    setBusy(true);
    try {
      const mod = await import('../uki/compressedMemory');
      await mod.clearArchives();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const fmt = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0 10px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
      <span>
        {stats
          ? `Compressed archives: ${stats.archiveCount} -- ${fmt(stats.compressedBytes)} of ${fmt(stats.rawBytes)} (${stats.rawBytes ? Math.round((1 - stats.ratio) * 100) : 0}% saved)`
          : 'Compressed archives: --'}
      </span>
      <button
        type="button"
        onClick={handleClear}
        disabled={busy || !stats || stats.archiveCount === 0}
        style={{
          padding: '4px 10px', borderRadius: 4, fontSize: 11,
          border: '1px solid var(--color-border)',
          background: 'var(--color-bg-hover)',
          color: 'var(--color-text-secondary)',
          cursor: busy ? 'wait' : 'pointer',
          opacity: stats && stats.archiveCount > 0 ? 1 : 0.5,
        }}
        aria-label="Clear UKI compressed archives"
      >
        {busy ? 'Clearing...' : 'Clear archives'}
      </button>
    </div>
  );
};

// =============================================================================
// UKI KNOWLEDGE FEED -- shows local data ingestion status and lets the user
// trigger a feed pass on demand. Uses the 100 MB default budget.
// =============================================================================
const UkiKnowledgeFeed: React.FC<{ styles: any }> = ({ styles: _styles }) => {
  const [status, setStatus] = useState<{
    lastRunTs: number; totalIngested: number; bytesUsed: number;
    budgetBytes: number; utilization: number; archives: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const mod = await import('../uki/knowledgeFeeder');
      const s = await mod.getFeedStatus();
      setStatus({
        lastRunTs: s.lastRunTs,
        totalIngested: s.totalIngested,
        bytesUsed: s.bytesUsed,
        budgetBytes: s.budgetBytes,
        utilization: s.utilization,
        archives: s.archives.length,
      });
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleRun = async () => {
    setBusy(true);
    setLastResult(null);
    try {
      const mod = await import('../uki/knowledgeFeeder');
      const result = await mod.runKnowledgeFeed({ force: true });
      if (result) {
        const sources = Object.entries(result.sources).map(([k, v]) => `${k}:${v}`).join(', ') || 'no new data';
        setLastResult(`Ingested ${result.ingestedTurns} turns (${sources}). Pruned ${result.pruned} archives.`);
      } else {
        setLastResult('Cooldown active. No run.');
      }
      await refresh();
    } catch (err) {
      setLastResult(`Feed failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const fmt = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const utilPct = status ? Math.min(100, Math.round(status.utilization * 100)) : 0;
  const lastRun = status && status.lastRunTs > 0 ? new Date(status.lastRunTs).toLocaleString() : 'never';

  return (
    <div style={{ padding: '6px 0 var(--space-3)', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span>
          {status
            ? `Knowledge feed: ${status.archives} archives, ${fmt(status.bytesUsed)} of ${fmt(status.budgetBytes)} (${utilPct}%) -- ${status.totalIngested} facts ingested -- last run ${lastRun}`
            : 'Knowledge feed: --'}
        </span>
        <button
          type="button"
          onClick={handleRun}
          disabled={busy}
          style={{
            padding: '4px 10px', borderRadius: 4, fontSize: 11,
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg-hover)',
            color: 'var(--color-text-secondary)',
            cursor: busy ? 'wait' : 'pointer',
          }}
          aria-label="Run UKI knowledge feed now"
        >
          {busy ? 'Feeding...' : 'Feed now'}
        </button>
      </div>
      {status && (
        <div style={{ marginTop: 6, height: 4, background: 'var(--color-bg-hover)', borderRadius: 2, overflow: 'hidden' }} aria-hidden>
          <div style={{ width: `${utilPct}%`, height: '100%', background: 'var(--color-accent, #0A84FF)', transition: 'width 0.18s cubic-bezier(0.4,0,0.2,1)' }} />
        </div>
      )}
      {lastResult && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-text-secondary)' }}>{lastResult}</div>
      )}
    </div>
  );
};

export const Settings: React.FC = () => {
  const { confirm: confirmReset, ConfirmHost: ConfirmResetHost } = useConfirm();
  const toast = useToastHelpers();
  const [activeSection, setActiveSection] = useState('general');
  const [settingsSearch, setSettingsSearch] = useState('');
  // Collapsible sidebar categories (fold the settings sub-menus). Persisted; the
  // category containing the active section always stays expanded so you can see
  // where you are.
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(() => {
    try { const raw = localStorage.getItem('dex-settings-collapsed-cats'); if (raw) return new Set(JSON.parse(raw) as string[]); } catch { /* ignore */ }
    return new Set();
  });
  const toggleCat = useCallback((label: string) => {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      try { localStorage.setItem('dex-settings-collapsed-cats', JSON.stringify([...next])); } catch { /* quota */ }
      return next;
    });
  }, []);
  // Keyboard-driven cursor into the flat search results (-1 = nothing focused).
  const [searchCursor, setSearchCursor] = useState(0);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  // When a search result jumps to a section, remember which control to scroll
  // to + flash once the new section has rendered.
  const pendingScrollRef = React.useRef<string | null>(null);
  const [settings, setSettings] = useState<typeof DEFAULT_SETTINGS>(() => loadSettings() || DEFAULT_SETTINGS);
  const [appVersion, setAppVersion] = useState<string>(getBundledAppVersion());
  const [policyViewerOpen, setPolicyViewerOpen] = useState(false);
  const [policyViewerInitial, setPolicyViewerInitial] = useState<PolicySlug>('terms');
  const [policyAcceptance, setPolicyAcceptance] = useState(() => readPolicyAcceptance());
  const [optionalAnalytics, setOptionalAnalytics] = useState(() => isOptionalAnalyticsEnabled());
  // Hoist shell-prefs hook to component top-level so the hook count stays
  // stable across category switches (renderShellSettings used to call this
  // conditionally which violated the Rules of Hooks).
  const shellPrefs = useShellPreferences();
  const dexBarEnabled = useFloatingLauncher((s) => s.enabled);
  const setDexBarEnabled = useFloatingLauncher((s) => s.setEnabled);

  // =========================================================================
  // SEARCH-FIRST SETTINGS (DEX 5.5)
  // A prominent, fuzzy search over every setting's label + description +
  // section + keywords. Typing surfaces matching controls (each tagged with
  // the section it lives in); Enter/click jumps to that section and scrolls
  // the control into view. Behavior of every setting is unchanged — this is
  // purely discoverability.
  // =========================================================================

  // Lightweight subsequence fuzzy match: every char of the query appears in
  // order somewhere in the haystack. Returns a score (lower = tighter) or -1.
  const fuzzyScore = useCallback((haystack: string, needle: string): number => {
    if (!needle) return 0;
    const h = haystack.toLowerCase();
    const exact = h.indexOf(needle);
    if (exact !== -1) return exact; // contiguous matches rank best (by position)
    let hi = 0;
    let firstHit = -1;
    let gaps = 0;
    let lastHit = -1;
    for (let ni = 0; ni < needle.length; ni++) {
      const ch = needle[ni];
      let found = -1;
      while (hi < h.length) {
        if (h[hi] === ch) { found = hi; hi++; break; }
        hi++;
      }
      if (found === -1) return -1;
      if (firstHit === -1) firstHit = found;
      if (lastHit !== -1 && found > lastHit + 1) gaps += found - lastHit - 1;
      lastHit = found;
    }
    // Penalise scattered matches so contiguous/early hits win, but still match.
    return 1000 + firstHit + gaps;
  }, []);

  const searchResults = useMemo<{ entry: SettingIndexEntry; section?: SettingSection; score: number }[]>(() => {
    const raw = settingsSearch.trim().toLowerCase();
    if (!raw) return [];
    return SETTINGS_INDEX
      .map(entry => {
        const sec = sectionMap.get(entry.section);
        const fields = [
          entry.label,
          entry.desc || '',
          sec?.name || '',
          sec?.keywords || '',
          entry.keywords || '',
        ];
        // Best (lowest) score across fields, weighted so a label hit beats a
        // keyword hit. -1 means no field matched.
        let best = -1;
        const weights = [0, 40, 80, 220, 260];
        fields.forEach((f, i) => {
          const s = fuzzyScore(f, raw);
          if (s !== -1) {
            const weighted = s + weights[i];
            if (best === -1 || weighted < best) best = weighted;
          }
        });
        return { entry, section: sec, score: best };
      })
      .filter(r => r.score !== -1)
      .sort((a, b) => a.score - b.score)
      .slice(0, 40);
  }, [settingsSearch, fuzzyScore]);

  // Keep the keyboard cursor inside the current result set.
  useEffect(() => { setSearchCursor(0); }, [settingsSearch]);

  // Jump to a section, optionally remembering a control to scroll to + flash.
  const jumpToSection = useCallback((sectionId: string, scrollLabel?: string) => {
    pendingScrollRef.current = scrollLabel || null;
    setActiveSection(sectionId);
  }, []);

  // After a jump re-renders the new section, scroll to + briefly flash the
  // matched control. The data-setting-search attribute is added to the shared
  // toggle/slider/select rows, so most controls resolve; section-level results
  // simply land at the top of the section.
  useEffect(() => {
    const label = pendingScrollRef.current;
    if (!label) return;
    pendingScrollRef.current = null;
    let flashTimeout = 0;
    const id = window.requestAnimationFrame(() => {
      try {
        const esc = (window as any).CSS?.escape ? (window as any).CSS.escape(label) : label.replace(/"/g, '\\"');
        const node = document.querySelector<HTMLElement>(`[data-setting-search="${esc}"]`)
          || document.querySelector<HTMLElement>(`[data-setting-row="${esc}"]`);
        const row = node?.closest<HTMLElement>('[data-setting-row]') || node;
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          row.style.transition = 'background-color 0.2s ease';
          const prev = row.style.backgroundColor;
          row.style.backgroundColor = 'var(--color-accent-soft, rgba(10,132,255,0.14))';
          flashTimeout = window.setTimeout(() => { row.style.backgroundColor = prev; }, 1100);
        }
      } catch { /* best-effort scroll */ }
    });
    return () => { window.cancelAnimationFrame(id); if (flashTimeout) window.clearTimeout(flashTimeout); };
  }, [activeSection]);

  // Activate the currently-focused (or first) search result.
  const activateSearchResult = useCallback((index?: number) => {
    if (searchResults.length === 0) return;
    const i = Math.max(0, Math.min(index ?? searchCursor, searchResults.length - 1));
    const r = searchResults[i];
    jumpToSection(r.entry.section, r.entry.label);
    setSettingsSearch('');
    setSearchCursor(0);
  }, [searchResults, searchCursor, jumpToSection]);

  // Keyboard handling for the search box: arrows move the cursor, Enter jumps,
  // Escape clears (or blurs when already empty).
  const onSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSearchCursor(c => Math.min(c + 1, Math.max(0, searchResults.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSearchCursor(c => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      activateSearchResult();
    } else if (e.key === 'Escape') {
      if (settingsSearch) { e.preventDefault(); setSettingsSearch(''); }
      else { searchInputRef.current?.blur(); }
    }
  }, [searchResults.length, activateSearchResult, settingsSearch]);

  // Focus the search box when Settings mounts so users can type immediately.
  useEffect(() => {
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, []);

  // =========================================================================
  // PER-SECTION RESET-TO-DEFAULTS (DEX 5.5)
  // Restore ONLY the active section's keys to their DEFAULT_SETTINGS values
  // (other sections are untouched), then clear any standalone localStorage
  // keys the section mirrors. The persist effect on `settings` re-saves the
  // blob, and applySettings reapplies it, so values reload immediately. Guarded
  // throughout; confirms before clearing.
  // =========================================================================
  const resetSection = useCallback((sectionId: string) => {
    const map = SECTION_RESET_MAP[sectionId];
    if (!map) return;
    const sectionName = sectionMap.get(sectionId)?.name || 'this section';
    confirmReset({
      title: `Reset ${sectionName}?`,
      message: `Restore every ${sectionName} setting to its default value. Your other settings are not affected. This cannot be undone.`,
      confirmLabel: 'Reset',
      tone: 'destructive',
    }).then((ok) => {
      if (!ok) return;
      try {
        // Restore only this section's keys from defaults.
        setSettings(prev => {
          const next: Record<string, unknown> = { ...prev };
          for (const key of map.defaultKeys) {
            if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
              next[key] = (DEFAULT_SETTINGS as Record<string, unknown>)[key];
            }
          }
          return next as typeof DEFAULT_SETTINGS;
        });
        // Clear any standalone localStorage keys this section mirrors so they
        // re-derive from the defaults on next read.
        for (const lk of map.localKeys || []) {
          try { localStorage.removeItem(lk); } catch { /* storage blocked */ }
        }
        window.dispatchEvent(new CustomEvent('dex-toast', {
          detail: { type: 'success', message: `${sectionName} reset to defaults` },
        }));
      } catch {
        window.dispatchEvent(new CustomEvent('dex-toast', {
          detail: { type: 'error', message: `Could not reset ${sectionName}` },
        }));
      }
    }).catch(() => { /* dialog dismissed */ });
  }, [confirmReset]);

  const openPolicyViewer = useCallback((slug: PolicySlug) => {
    setPolicyViewerInitial(slug);
    setPolicyViewerOpen(true);
  }, []);

  const toggleOptionalAnalytics = useCallback((enabled: boolean) => {
    setOptionalAnalyticsEnabled(enabled);
    setOptionalAnalytics(enabled);
    toast.info(enabled ? 'Optional analytics enabled' : 'Optional analytics disabled');
  }, [toast]);

  const resetPolicyAcceptance = useCallback(() => {
    clearPolicyAcceptance();
    setPolicyAcceptance(null);
    toast.info('Policy acceptance reset. DEX will ask again on next launch.');
  }, [toast]);
  
  // Authentication state
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [showPinChange, setShowPinChange] = useState(false);
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [pinInput, setPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [authError, setAuthError] = useState('');
  
  // Check biometric availability on mount
  React.useEffect(() => {
    const checkBiometric = async () => {
      try {
        if (window.electron?.invoke) {
          const available = await window.electron.invoke('auth:biometricsAvailable');
          setBiometricAvailable(available);
        } else if ('PublicKeyCredential' in window) {
          const available = await (window as any).PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          setBiometricAvailable(available);
        }
      } catch (e) {
        setBiometricAvailable(false);
      }
    };
    checkBiometric();
  }, []);

  React.useEffect(() => {
    getRuntimeAppVersion().then(setAppVersion).catch(() => {
      setAppVersion(getBundledAppVersion());
    });
  }, []);

  // Sync crash-reporting toggle from the main-process diagnostics controller
  // so what Settings displays matches what was actually set (e.g. by Onboarding).
  React.useEffect(() => {
    const electron = (window as unknown as { electron?: { diagnostics?: { getPreferences?: () => Promise<{ crashReportingEnabled?: boolean }> } } }).electron;
    electron?.diagnostics?.getPreferences?.().then((p) => {
      if (p && typeof p.crashReportingEnabled === 'boolean') {
        setSettings(prev => prev.crashReports === p.crashReportingEnabled ? prev : { ...prev, crashReports: !!p.crashReportingEnabled });
      }
    }).catch(() => { /* IPC unavailable */ });
  }, []);

  React.useEffect(() => {
    const handleSettingsNavigate = (event: Event) => {
      const detail = (event as CustomEvent).detail as { section?: string } | undefined;
      if (!detail?.section) return;
      if (SECTIONS.some(section => section.id === detail.section)) {
        setActiveSection(detail.section);
      }
    };

    window.addEventListener('dex-settings-navigate', handleSettingsNavigate);
    return () => window.removeEventListener('dex-settings-navigate', handleSettingsNavigate);
  }, []);
  
  const handleSetupPin = () => {
    setAuthError('');
    if (pinInput.length < 4) {
      setAuthError('PIN must be at least 4 digits');
      return;
    }
    if (!/^\d+$/.test(pinInput)) {
      setAuthError('PIN must contain only digits');
      return;
    }
    const weak = /^(\d)\1+$/.test(pinInput) // all same digit (1111)
      || '0123456789'.includes(pinInput) // ascending sequence
      || '9876543210'.includes(pinInput); // descending sequence
    if (weak) {
      setAuthError('PIN is too simple. Avoid repeated or sequential digits.');
      return;
    }
    if (pinInput !== confirmPinInput) {
      setAuthError('PINs do not match');
      return;
    }
    // Save PIN via IPC
    if (window.electron?.invoke) {
      window.electron.invoke('auth:setup:pin', pinInput).then(() => {
        setSettings(prev => ({ ...prev, pinEnabled: true, authMethod: 'pin' }));
        setShowPinSetup(false);
        setPinInput('');
        setConfirmPinInput('');
      }).catch(() => setAuthError('Failed to save PIN'));
    } else {
      setSettings(prev => ({ ...prev, pinEnabled: true, authMethod: 'pin' }));
      setShowPinSetup(false);
      setPinInput('');
      setConfirmPinInput('');
    }
  };
  
  const handleSetupPassword = () => {
    setAuthError('');
    if (passwordInput.length < 8) {
      setAuthError('Password must be at least 8 characters');
      return;
    }
    if (!/[A-Z]/.test(passwordInput) || !/[a-z]/.test(passwordInput) || !/\d/.test(passwordInput)) {
      setAuthError('Password needs uppercase, lowercase, and a number');
      return;
    }
    if (passwordInput !== confirmPasswordInput) {
      setAuthError('Passwords do not match');
      return;
    }
    // Save password via IPC
    if (window.electron?.invoke) {
      window.electron.invoke('auth:setup:password', passwordInput).then(() => {
        setSettings(prev => ({ ...prev, passwordEnabled: true, authMethod: 'password' }));
        setShowPasswordSetup(false);
        setPasswordInput('');
        setConfirmPasswordInput('');
      }).catch(() => setAuthError('Failed to save password'));
    } else {
      setSettings(prev => ({ ...prev, passwordEnabled: true, authMethod: 'password' }));
      setShowPasswordSetup(false);
      setPasswordInput('');
      setConfirmPasswordInput('');
    }
  };
  
  const handleEnableBiometric = async () => {
    setAuthError('');
    try {
      if (window.electron?.invoke) {
        await window.electron.invoke('auth:setup:biometric');
        const newMethod = settings.pinEnabled ? 'pin+biometric' as const : settings.passwordEnabled ? 'password+biometric' as const : 'biometric' as const;
        setSettings(prev => ({ ...prev, biometricEnabled: true, authMethod: newMethod }));
      } else if ('PublicKeyCredential' in window) {
        // Web Authn fallback
        const newMethod = settings.pinEnabled ? 'pin+biometric' as const : settings.passwordEnabled ? 'password+biometric' as const : 'biometric' as const;
        setSettings(prev => ({ ...prev, biometricEnabled: true, authMethod: newMethod }));
      }
    } catch (e) {
      setAuthError('Failed to enable fingerprint');
    }
  };
  
  const handleDisableAuth = (type: 'pin' | 'password' | 'biometric') => {
    if (type === 'pin') {
      setSettings(prev => ({
        ...prev,
        pinEnabled: false,
        authMethod: prev.biometricEnabled ? 'biometric' : prev.passwordEnabled ? 'password' : 'none'
      }));
    } else if (type === 'password') {
      setSettings(prev => ({
        ...prev,
        passwordEnabled: false,
        authMethod: prev.biometricEnabled ? 'biometric' : prev.pinEnabled ? 'pin' : 'none'
      }));
    } else {
      setSettings(prev => ({
        ...prev,
        biometricEnabled: false,
        authMethod: prev.pinEnabled ? 'pin' : prev.passwordEnabled ? 'password' : 'none'
      }));
    }
  };

  const handleChangePassword = async () => {
    setAuthError('');
    if (!currentPasswordInput) {
      setAuthError('Enter your current password');
      return;
    }
    if (passwordInput.length < 8) {
      setAuthError('New password must be at least 8 characters');
      return;
    }
    if (!/[A-Z]/.test(passwordInput) || !/[a-z]/.test(passwordInput) || !/\d/.test(passwordInput)) {
      setAuthError('New password needs uppercase, lowercase, and a number');
      return;
    }
    if (passwordInput !== confirmPasswordInput) {
      setAuthError('New passwords do not match');
      return;
    }
    try {
      const result = await window.electron?.invoke('auth:changePassword', JSON.stringify({ currentPassword: currentPasswordInput, newPassword: passwordInput }));
      if (result?.success) {
        setShowPasswordChange(false);
        setCurrentPasswordInput('');
        setPasswordInput('');
        setConfirmPasswordInput('');
      } else {
        setAuthError(result?.error || 'Failed to change password');
      }
    } catch {
      setAuthError('Failed to change password');
    }
  };

  const handleChangePin = async () => {
    setAuthError('');
    if (!currentPinInput || currentPinInput.length < 4) {
      setAuthError('Enter your current PIN');
      return;
    }
    if (pinInput.length < 4 || pinInput.length > 8) {
      setAuthError('New PIN must be 4-8 digits');
      return;
    }
    if (pinInput !== confirmPinInput) {
      setAuthError('New PINs do not match');
      return;
    }
    try {
      const result = await window.electron?.invoke('auth:changePin', JSON.stringify({ currentPin: currentPinInput, newPin: pinInput }));
      if (result?.success) {
        setShowPinChange(false);
        setCurrentPinInput('');
        setPinInput('');
        setConfirmPinInput('');
      } else {
        setAuthError(result?.error || 'Failed to change PIN');
      }
    } catch {
      setAuthError('Failed to change PIN');
    }
  };

  const handleGenerateRecoveryCodes = async () => {
    try {
      const result = await window.electron?.invoke('auth:generateRecoveryCodes');
      if (result?.success && result.codes) {
        setRecoveryCodes(result.codes);
        setShowRecoveryCodes(true);
      }
    } catch {
      setAuthError('Failed to generate recovery codes');
    }
  };

  // Save settings when they change
  React.useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const toggleSetting = (key: keyof typeof DEFAULT_SETTINGS) => {
    setSettings((prev) => {
      const nextVal = !prev[key];
      // Side effects for system-level toggles
      if (key === 'performanceReservation') {
        try {
          (window as any).dex?.system?.claimResources?.(Boolean(nextVal));
        } catch { /* main may not be ready */ }
      }
      if (key === 'predictivePrewarm') {
        try { localStorage.setItem('dex-predictive-prewarm', nextVal ? '1' : '0'); }
        catch { /* storage blocked */ }
      }
      // Keep the shell-prefs glass mode in sync when the legacy boolean
      // transparency toggles are flipped from anywhere in Settings.
      if (key === 'transparency') {
        try {
          shellPrefs.setGlassMode(nextVal ? (prev.reduceTransparency ? 'reduced' : 'liquid') : 'off');
        } catch { /* store not ready */ }
      }
      if (key === 'reduceTransparency') {
        try {
          if (prev.transparency === false) {
            // transparency disabled -- glass stays off
            shellPrefs.setGlassMode('off');
          } else {
            shellPrefs.setGlassMode(nextVal ? 'reduced' : 'liquid');
          }
        } catch { /* store not ready */ }
      }
      if (key === 'crashReports') {
        try {
          const electron = (window as unknown as { electron?: { diagnostics?: { setPreferences?: (p: object) => Promise<unknown> } } }).electron;
          electron?.diagnostics?.setPreferences?.({ crashReportingEnabled: nextVal });
        } catch { /* IPC may be unavailable */ }
      }
      return { ...prev, [key]: nextVal };
    });
  };

  /** A row that opens the matching Windows Settings page (ms-settings: URI). */
  const renderWindowsLink = (label: string, desc: string, uri: string) => (
    <div style={styles.settingRow} key={uri}>
      <div style={styles.settingInfo}>
        <span style={styles.settingLabel}>{label}</span>
        <span style={styles.settingDesc}>{desc}</span>
      </div>
      <button
        type="button"
        style={styles.manageBtn}
        aria-label={`Open Windows settings: ${label}`}
        onClick={() => { void (window as any).electron?.invoke?.('shell:openExternal', uri); }}
      >Open in Windows</button>
    </div>
  );

  const renderToggle = (key: keyof typeof DEFAULT_SETTINGS, label: string, description: string) => {
    const changed = isSettingChanged(key, settings[key]);
    return (
      <div style={styles.settingRow} data-setting-row={label}>
        <div style={styles.settingInfo}>
          <span data-setting-search={label} style={{ ...styles.settingLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
            {label}
            {changed && (
              <span 
                style={{ 
                  width: 6, height: 6, borderRadius: '50%', 
                  background: 'var(--color-accent)', 
                  flexShrink: 0,
                }} 
                title="Changed from default"
              />
            )}
          </span>
          <span style={styles.settingDesc}>{description}</span>
        </div>
        <button
          style={{
            ...styles.toggle,
            // macOS-style: "on" uses the accent (was system green); the knob uses
            // --color-accent-text (white) so it stays >=3:1 against the blue track.
            background: settings[key] ? 'var(--color-accent)' : 'var(--color-bg-glass)',
            border: settings[key] ? 'none' : '1px solid var(--color-border)',
          }}
          onClick={() => toggleSetting(key)}
          role="switch"
          aria-checked={Boolean(settings[key])}
          aria-label={`Toggle ${label}`}
        >
          <div style={{
            ...styles.toggleKnob,
            ...(settings[key] ? { background: 'var(--color-accent-text)' } : null),
            transform: settings[key] ? 'translate(20px, -50%)' : 'translate(0, -50%)',
          }} />
        </button>
      </div>
    );
  };

  const renderGeneralSettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitleFirst}>Startup</h3>
      {renderToggle('launchAtStartup', 'Launch at Login', 'Automatically start DEX when you log in')}
      {renderToggle('checkForUpdates', 'Check for Updates', 'Automatically check for app updates')}
      {renderToggle('restoreLastSession', 'Restore Last Session', 'Reopen apps from your last session')}
      
      <h3 style={styles.sectionTitle}>Behavior</h3>
      {renderToggle('autoSave', 'Auto-Save', 'Automatically save your work periodically')}
      
      <h3 style={styles.sectionTitle}>Usage Data</h3>
      {renderToggle('analytics', 'Send Analytics', 'Help improve DEX by sending anonymous usage data')}
      
      <h3 style={styles.sectionTitle}>Reset</h3>
      <button
        style={styles.dangerBtn}
        aria-label="Reset all settings to defaults"
        onClick={() => {
          if (confirm('Reset all settings to defaults? This cannot be undone.')) {
            setSettings({ ...DEFAULT_SETTINGS });
          }
        }}
      >Reset All Settings to Defaults</button>
    </div>
  );

  // -------------------------------------------------------------------------
  // Shell & Dock settings (May 2026 sweep): movable + compact taskbar,
  // Liquid Glass tint/opacity, Night Shift, Low-End Mode, update-choice
  // honor, on-device AI policy + system capabilities readout.
  // -------------------------------------------------------------------------
  const renderShellSettings = () => {
    const prefs = shellPrefs;
    const dockEdges: DockEdge[] = ['bottom', 'left', 'right', 'top'];
    const dockPresets: DockSizePreset[] = ['compact', 'regular', 'large', 'floating'];
    return (
      <div style={styles.settingsContent}>
        <h3 style={styles.sectionTitleFirst}>Dock Position</h3>
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Edge</span>
            <span style={styles.settingDesc}>Pin the dock to any side of the display.</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {dockEdges.map((edge) => (
              <button
                key={edge}
                aria-label={`Dock on ${edge}`}
                aria-pressed={prefs.dockEdge === edge}
                style={{
                  ...styles.button,
                  background: prefs.dockEdge === edge ? 'var(--color-bg-active, #252528)' : 'var(--color-bg-hover)',
                  color: prefs.dockEdge === edge ? 'var(--color-text-primary)' : 'var(--color-text-primary)',
                  textTransform: 'capitalize',
                }}
                onClick={() => prefs.setDockEdge(edge)}
              >{edge}</button>
            ))}
          </div>
        </div>

        <h3 style={styles.sectionTitle}>Dock Size</h3>
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Preset</span>
            <span style={styles.settingDesc}>Compact for screen real-estate, Floating for the lifted Windows-12 look.</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {dockPresets.map((preset) => (
              <button
                key={preset}
                aria-label={`Dock size ${preset}`}
                aria-pressed={prefs.dockPreset === preset}
                style={{
                  ...styles.button,
                  background: prefs.dockPreset === preset ? 'var(--color-bg-active, #252528)' : 'var(--color-bg-hover)',
                  color: prefs.dockPreset === preset ? 'var(--color-text-primary)' : 'var(--color-text-primary)',
                  textTransform: 'capitalize',
                }}
                onClick={() => prefs.setDockPreset(preset)}
              >{preset}</button>
            ))}
          </div>
        </div>

        <h3 style={styles.sectionTitle}>DEX Bar</h3>
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Show DEX Bar</span>
            <span style={styles.settingDesc}>The floating command bar (search, UKI, suggestions). Hide it for a cleaner desktop; re-enable here anytime.</span>
          </div>
          <input
            type="checkbox"
            checked={dexBarEnabled}
            onChange={(e) => setDexBarEnabled(e.target.checked)}
            aria-label="Show DEX Bar"
          />
        </div>

        <h3 style={styles.sectionTitle}>Liquid Glass</h3>
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Glass</span>
            <span style={styles.settingDesc}>
              {prefs.glassMode === 'off'
                ? 'Off — every surface is opaque true black.'
                : 'On — full Apple-style liquid glass across the whole shell.'}
            </span>
          </div>
          <input
            type="checkbox"
            checked={prefs.glassMode !== 'off'}
            onChange={(e) => prefs.setGlassMode(e.target.checked ? 'liquid' : 'off')}
            aria-label="Liquid Glass on or off"
          />
        </div>
        {prefs.glassMode !== 'off' && <>
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Intensity</span>
            <span style={styles.settingDesc}>How transparent the glass is. Liquid is the full Apple look.</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { id: 'reduced', label: 'Reduced' },
              { id: 'normal', label: 'Normal' },
              { id: 'liquid', label: 'Liquid' },
            ] as const).map((mode) => (
              <button
                key={mode.id}
                aria-label={`Glass mode ${mode.label}`}
                aria-pressed={prefs.glassMode === mode.id}
                style={{
                  ...styles.button,
                  background: prefs.glassMode === mode.id ? 'var(--color-bg-active, #252528)' : 'var(--color-bg-hover)',
                  color: prefs.glassMode === mode.id ? 'var(--color-text-primary)' : 'var(--color-text-primary)',
                }}
                onClick={() => prefs.setGlassMode(mode.id)}
              >{mode.label}</button>
            ))}
          </div>
        </div>
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Tint</span>
            <span style={styles.settingDesc}>Color of the frosted-glass overlay (dock, menus).</span>
          </div>
          <input
            type="color"
            value={prefs.glassTint}
            onChange={(e) => prefs.setGlassTint(e.target.value)}
            style={{ width: 48, height: 28, border: 'none', background: 'transparent', cursor: 'pointer' }}
            aria-label="Liquid Glass tint color"
          />
        </div>
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Opacity</span>
            <span style={styles.settingDesc}>{(prefs.glassOpacity * 100).toFixed(0)}% — higher is more solid.</span>
          </div>
          <input
            type="range" min={0.4} max={1} step={0.05}
            value={prefs.glassOpacity}
            onChange={(e) => prefs.setGlassOpacity(parseFloat(e.target.value))}
            style={{ width: 200 }}
            aria-label="Liquid Glass opacity"
          />
        </div>
        </>}

        <h3 style={styles.sectionTitle}>Comfort & Power</h3>
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Night Shift</span>
            <span style={styles.settingDesc}>Warm color filter for evening use.</span>
          </div>
          <input
            type="checkbox"
            checked={prefs.nightShift}
            onChange={(e) => prefs.setNightShift(e.target.checked)}
            aria-label="Enable Night Shift"
          />
        </div>
        {prefs.nightShift && (
          <div style={styles.settingRow}>
            <div style={styles.settingInfo}>
              <span style={styles.settingLabel}>Night Shift intensity</span>
              <span style={styles.settingDesc}>{(prefs.nightShiftIntensity * 100).toFixed(0)}% warm.</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.1}
              value={prefs.nightShiftIntensity}
              onChange={(e) => prefs.setNightShiftIntensity(parseFloat(e.target.value))}
              style={{ width: 200 }}
              aria-label="Night Shift intensity"
            />
          </div>
        )}
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Low-End Mode</span>
            <span style={styles.settingDesc}>Treat this device as a low-tier PC: disable blur, animations, and heavy effects.</span>
          </div>
          <input
            type="checkbox"
            checked={prefs.lowEndMode}
            onChange={(e) => prefs.setLowEndMode(e.target.checked)}
            aria-label="Enable low-end mode"
          />
        </div>

        <h3 style={styles.sectionTitle}>Updates & Tabs</h3>
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Respect my update choice</span>
            <span style={styles.settingDesc}>Never auto-select Install. Default to Later in update prompts.</span>
          </div>
          <input
            type="checkbox"
            checked={prefs.respectUpdateChoice}
            onChange={(e) => prefs.setRespectUpdateChoice(e.target.checked)}
            aria-label="Respect my update choice"
          />
        </div>
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Keep tabs alive on sleep</span>
            <span style={styles.settingDesc}>Prevent browser tabs from being refreshed after the system wakes.</span>
          </div>
          <input
            type="checkbox"
            checked={prefs.preventTabRefreshOnSleep}
            onChange={(e) => prefs.setPreventTabRefreshOnSleep(e.target.checked)}
            aria-label="Keep tabs alive on sleep"
          />
        </div>
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Cloud clipboard sync</span>
            <span style={styles.settingDesc}>Sync clipboard across signed-in DEX devices (encrypted).</span>
          </div>
          <input
            type="checkbox"
            checked={prefs.clipboardCloudSync}
            onChange={(e) => prefs.setClipboardCloudSync(e.target.checked)}
            aria-label="Enable cloud clipboard sync"
          />
        </div>
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Mini Pulse monitor</span>
            <span style={styles.settingDesc}>Always-on-top pill showing CPU, memory, and FPS sparklines. Double-click to expand.</span>
          </div>
          <input
            type="checkbox"
            checked={prefs.miniPulseEnabled}
            onChange={(e) => prefs.setMiniPulseEnabled(e.target.checked)}
            aria-label="Enable Mini Pulse monitor"
          />
        </div>
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Auto-recover crashed apps</span>
            <span style={styles.settingDesc}>Restart a crashed app automatically (up to 3 attempts), then show the crash card.</span>
          </div>
          <input
            type="checkbox"
            checked={prefs.autoRecoverApps}
            onChange={(e) => prefs.setAutoRecoverApps(e.target.checked)}
            aria-label="Auto-recover crashed apps"
          />
        </div>
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Compact mode</span>
            <span style={styles.settingDesc}>Shrink DEX to an always-on-top mini pill to keep it beside other work. Toggle anytime with Ctrl+Shift+M.</span>
          </div>
          <button
            style={styles.button}
            onClick={() => { void import('../shell/MiniShell').then(m => m.useCompactMode.getState().enter()); }}
            aria-label="Enter compact mode"
          >
            Enter compact mode
          </button>
        </div>

        <h3 style={styles.sectionTitle}>Diagnostics</h3>
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Reset shell preferences</span>
            <span style={styles.settingDesc}>Restore dock, glass, night-shift, and update prefs to defaults.</span>
          </div>
          <button
            style={styles.button}
            onClick={async () => {
              const ok = await confirmReset({
                title: 'Reset shell preferences?',
                message: 'Restore dock, glass, night-shift, and update prefs to defaults.',
                confirmLabel: 'Reset',
                tone: 'destructive',
              });
              if (ok) prefs.reset();
            }}
          >Reset</button>
        </div>
      </div>
    );
  };

  const renderAppearanceSettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitleFirst}>Theme</h3>
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Appearance</span>
          <span style={styles.settingDesc}>Switch between dark and light mode</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['dark', 'light', 'auto'] as const).map(mode => (
            <button
              key={mode}
              aria-label={`${mode} mode`}
              onClick={() => {
                if (mode === 'auto') {
                  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  setSettings(prev => ({ ...prev, darkMode: prefersDark }));
                } else {
                  setSettings(prev => ({ ...prev, darkMode: mode === 'dark' }));
                }
              }}
              style={{
                padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                border: (mode === 'dark' && settings.darkMode !== false) || (mode === 'light' && settings.darkMode === false) ? '1px solid var(--dex-focus-color, #fff)' : '1px solid var(--color-border)',
                background: (mode === 'dark' && settings.darkMode !== false) || (mode === 'light' && settings.darkMode === false) ? 'var(--color-bg-active, #252528)' : 'transparent',
                color: (mode === 'dark' && settings.darkMode !== false) || (mode === 'light' && settings.darkMode === false) ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              }}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <h3 style={styles.sectionTitle}>Accent Color</h3>
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
        {['var(--color-accent)', 'var(--color-success)', 'var(--color-warning)', 'var(--color-error)', '#bf5af2', '#ff375f', '#64d2ff', '#ff9f0a'].map(color => (
          <button
            key={color}
            aria-label={`Select accent color ${color}`}
            onClick={() => setSettings(prev => ({ ...prev, accentColor: color }))}
            style={{
              width: '32px', height: '32px', borderRadius: '50%', background: color,
              border: settings.accentColor === color ? '3px solid var(--color-text-primary, #fff)' : '2px solid transparent',
              cursor: 'pointer', boxShadow: settings.accentColor === color ? '0 0 4px ' + color : 'none'
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
        {[
          { id: 'var(--color-accent)', name: 'macOS Blue', desc: 'System blue (DEX default)' },
          { id: '#ffd60a', name: 'Dark Knight', desc: 'Bat-signal yellow on true black' },
          { id: '#ff6b1a', name: 'Nanite', desc: 'Rex build-orange' },
        ].map(preset => (
          <button
            key={preset.id}
            aria-label={`Apply ${preset.name} theme`}
            aria-pressed={settings.accentColor === preset.id}
            title={preset.desc}
            onClick={() => setSettings(prev => ({ ...prev, accentColor: preset.id }))}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 10,
              border: settings.accentColor === preset.id ? `1px solid ${preset.id}` : '1px solid var(--color-border)',
              background: settings.accentColor === preset.id ? `color-mix(in srgb, ${preset.id} 12%, transparent)` : 'var(--color-bg-surface)',
              color: settings.accentColor === preset.id ? preset.id : 'var(--color-text-secondary)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 2, background: preset.id, transform: 'rotate(45deg)', flexShrink: 0 }} />
            {preset.name}
          </button>
        ))}
      </div>
      
      <h3 style={styles.sectionTitle}>Text Size</h3>
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Font Scale</span>
          <span style={styles.settingDesc}>Adjust text size across the app ({settings.fontScale ?? 100}%)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 160 }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>A</span>
          <input type="range" min="80" max="130" step="5" value={settings.fontScale ?? 100}
            onChange={e => {
              const v = Number(e.target.value);
              setSettings(prev => ({ ...prev, fontScale: v, fontSize: v <= 90 ? 'small' : v >= 115 ? 'large' : 'medium' }));
            }}
            style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
          <span style={{ fontSize: 16, color: 'var(--color-text-tertiary)' }}>A</span>
        </div>
      </div>
      
      <TextDensityControls
        sectionTitle={styles.sectionTitle}
        settingRow={styles.settingRow}
        settingInfo={styles.settingInfo}
        settingLabel={styles.settingLabel}
        settingDesc={styles.settingDesc}
      />

      <h3 style={styles.sectionTitle}>Visual Effects</h3>
      {renderToggle('reduceMotion', 'Reduce Motion', 'Minimize animated effects')}
      <DarkRoomToggle
        settingRow={styles.settingRow}
        settingInfo={styles.settingInfo}
        settingLabel={styles.settingLabel}
        settingDesc={styles.settingDesc}
      />

      {/* Glass mode segmented control -- single source of truth, mirrored
          into the legacy `transparency` boolean for back-compat with older
          components that still read settings.transparency. */}
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Glass</span>
          <span style={styles.settingDesc}>Off, Reduced (light blur), Normal, or Liquid (richest depth).</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            { id: 'off', label: 'Off' },
            { id: 'reduced', label: 'Reduced' },
            { id: 'normal', label: 'Normal' },
            { id: 'liquid', label: 'Liquid' },
          ] as const).map((mode) => {
            const active = shellPrefs.glassMode === mode.id;
            return (
              <button
                key={mode.id}
                aria-label={`Glass mode ${mode.label}`}
                aria-pressed={active}
                onClick={() => {
                  shellPrefs.setGlassMode(mode.id);
                  // Mirror to legacy boolean so existing CSS gates keep working.
                  setSettings(prev => ({
                    ...prev,
                    transparency: mode.id !== 'off',
                    reduceTransparency: mode.id === 'reduced',
                  }));
                }}
                style={{
                  padding: '5px var(--space-3)', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  border: active ? '1px solid var(--dex-focus-color, #fff)' : '1px solid var(--color-border)',
                  background: active ? 'var(--color-bg-active, #252528)' : 'transparent',
                  color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                }}
              >{mode.label}</button>
            );
          })}
        </div>
      </div>

      {renderToggle('reduceTransparency', 'Reduce Transparency', 'Force solid surfaces over translucency for readability')}

      <h3 style={styles.sectionTitle}>Wallpaper</h3>
      <div style={{
        padding: 'var(--space-4)', borderRadius: 10,
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
          {WALLPAPER_PRESETS.filter(p => p.mode !== 'live').map(preset => (
            <button
              key={preset.id}
              aria-label={`Set wallpaper: ${preset.name}`}
              onClick={() => useWallpaperStore.getState().setWallpaper(preset)}
              style={{
                width: '100%', aspectRatio: '16/10', borderRadius: 6, cursor: 'pointer',
                border: useWallpaperStore.getState().presetId === preset.id ? '2px solid var(--dex-focus-color, #fff)' : '1px solid var(--color-border-subtle)',
                background: preset.thumbnail?.startsWith('url(') ? undefined : (preset.thumbnail || preset.value),
                backgroundImage: preset.thumbnail?.startsWith('url(') ? preset.thumbnail : (preset.mode === 'gradient' ? preset.value : undefined),
                backgroundSize: 'cover', backgroundPosition: 'center',
                padding: 0, overflow: 'hidden', position: 'relative',
              }}
            >
              <span style={{
                position: 'absolute', bottom: 2, left: 0, right: 0,
                fontSize: 8, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                textAlign: 'center', lineHeight: 1.2,
              }}>{preset.name}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = () => {
              const file = input.files?.[0];
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5 MB'); return; }
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result as string;
                useWallpaperStore.getState().setCustomImage(dataUrl);
                toast.success('Custom wallpaper applied');
              };
              reader.readAsDataURL(file);
            };
            input.click();
          }}
          style={{
            width: '100%', padding: 'var(--space-2) 0', borderRadius: 6, cursor: 'pointer',
            border: '1px dashed var(--color-border-subtle)',
            background: 'transparent', color: 'var(--color-text-secondary)',
            fontSize: 11, fontWeight: 500,
          }}
        >+ Custom Image</button>
      </div>

      <h3 style={styles.sectionTitle}>Wallpaper Tinting</h3>
      <div style={{
        padding: 'var(--space-4)', borderRadius: 10,
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
      }}>
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Background Tint</span>
            <span style={styles.settingDesc}>Allow wallpaper color to show through windows</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['glass', 'frosted', 'solid'] as const).map(mat => (
              <button
                key={mat}
                aria-label={`Select ${mat} material`}
                onClick={() => setSettings(prev => ({ ...prev, windowMaterial: mat }))}
                style={{
                  padding: '5px var(--space-3)', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  border: settings.windowMaterial === mat ? '1px solid var(--dex-focus-color, #fff)' : '1px solid var(--color-border)',
                  background: settings.windowMaterial === mat ? 'var(--color-bg-active, #252528)' : 'transparent',
                  color: settings.windowMaterial === mat ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                }}
              >
                {mat === 'glass' ? 'Glass' : mat === 'frosted' ? 'Frosted' : 'Solid'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ ...styles.settingRow, marginTop: 'var(--space-3)' }}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Blur Intensity</span>
            <span style={styles.settingDesc}>Blur amount behind glass surfaces</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 140 }}>
            <input type="range" min="0" max="30" step="1" value={settings.blurIntensity ?? 12}
              onChange={e => {
                const v = Number(e.target.value);
                setSettings(prev => ({ ...prev, blurIntensity: v }));
                useWallpaperStore.getState().setBlur(v);
              }}
              style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', minWidth: 28 }}>{settings.blurIntensity ?? 12}px</span>
          </div>
        </div>
        <div style={{ ...styles.settingRow, marginTop: 'var(--space-2)' }}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Glass Opacity</span>
            <span style={styles.settingDesc}>Transparency of glass surfaces</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 140 }}>
            <input type="range" min="0" max="100" step="5" value={Math.round((settings.glassOpacity ?? 0.85) * 100)}
              onChange={e => {
                const v = Number(e.target.value) / 100;
                setSettings(prev => ({ ...prev, glassOpacity: v }));
                useWallpaperStore.getState().setOpacity(v);
              }}
              style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', minWidth: 28 }}>{Math.round((settings.glassOpacity ?? 0.85) * 100)}%</span>
          </div>
        </div>
      </div>
      
      <h3 style={styles.sectionTitle}>Window Controls</h3>
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Window Button Style</span>
          <span style={styles.settingDesc}>Choose between system (Windows) or traffic light (macOS) window buttons</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['system', 'traffic'] as const).map(style => (
            <button
              key={style}
              aria-label={`Select ${style === 'system' ? 'system' : 'traffic light'} window controls`}
              onClick={() => {
                setSettings(prev => ({ ...prev, windowControls: style }));
                try { localStorage.setItem('dex-window-controls', style); } catch (e) { console.warn('[DEX]', e); }
                window.dispatchEvent(new Event('dex-window-controls-changed'));
              }}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: settings.windowControls === style ? '1px solid var(--dex-focus-color, #fff)' : '1px solid var(--color-border)',
                background: settings.windowControls === style ? 'var(--color-bg-active, #252528)' : 'transparent',
                color: settings.windowControls === style ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {style === 'traffic' && (
                <span style={{ display: 'flex', gap: 3 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5f57' }} />
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#febc2e' }} />
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#28c840' }} />
                </span>
              )}
              {style === 'system' ? 'System' : 'Traffic Light'}
            </button>
          ))}
        </div>
      </div>
      
    </div>
  );

  const renderNotificationSettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitleFirst}>Notifications</h3>
      {renderToggle('enableNotifications', 'Allow Notifications', 'Show notifications from DEX')}
      {renderToggle('soundEnabled', 'Sound', 'Play sound for notifications')}
      {renderToggle('doNotDisturb', 'Do Not Disturb', 'Silence all notifications')}
    </div>
  );

  const renderPrivacySettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitleFirst}>Authentication</h3>
      
      {/* Fingerprint / Biometric */}
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Fingerprint / Windows Hello</span>
          <span style={styles.settingDesc}>
            {biometricAvailable ? 'Use fingerprint or face to unlock DEX' : 'Not available on this device'}
          </span>
        </div>
        {biometricAvailable && (
          settings.biometricEnabled ? (
            <button style={styles.dangerBtnSmall} aria-label="Disable biometric authentication" onClick={() => handleDisableAuth('biometric')}>Disable</button>
          ) : (
            <button style={styles.manageBtn} aria-label="Enable biometric authentication" onClick={handleEnableBiometric}>Enable</button>
          )
        )}
      </div>
      
      {/* PIN Setup */}
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>PIN Code</span>
          <span style={styles.settingDesc}>Use a 4-8 digit PIN to unlock</span>
        </div>
        {settings.pinEnabled ? (
          <div style={{ display: 'flex', gap: '6px' }}>
            <button style={styles.manageBtn} aria-label="Change PIN code" onClick={() => { setShowPinChange(true); setShowPinSetup(false); setAuthError(''); }}>Change</button>
            <button style={styles.dangerBtnSmall} aria-label="Remove PIN code" onClick={() => handleDisableAuth('pin')}>Remove</button>
          </div>
        ) : (
          <button style={styles.manageBtn} aria-label="Set PIN code" onClick={() => setShowPinSetup(true)}>Set PIN</button>
        )}
      </div>
      
      {showPinSetup && (
        <div style={{ padding: 'var(--space-4)', background: 'var(--color-bg-surface)', borderRadius: '6px', marginBottom: 'var(--space-4)' }}>
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>Enter PIN (4-8 digits)</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={pinInput}
              onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
              style={{ width: '100%', padding: '10px', background: 'var(--color-bg-surface-solid)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '18px', letterSpacing: '8px', textAlign: 'center' }}
              placeholder="****"
            />
          </div>
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>Confirm PIN</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={confirmPinInput}
              onChange={e => setConfirmPinInput(e.target.value.replace(/\D/g, ''))}
              style={{ width: '100%', padding: '10px', background: 'var(--color-bg-surface-solid)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '18px', letterSpacing: '8px', textAlign: 'center' }}
              placeholder="****"
            />
          </div>
          {authError && <div style={{ color: 'var(--color-error)', fontSize: '12px', marginBottom: 'var(--space-3)' }}>{authError}</div>}
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button style={styles.manageBtn} aria-label="Save PIN" onClick={handleSetupPin}>Save PIN</button>
            <button style={{ ...styles.manageBtn, background: 'transparent' }} aria-label="Cancel PIN setup" onClick={() => { setShowPinSetup(false); setPinInput(''); setConfirmPinInput(''); setAuthError(''); }}>Cancel</button>
          </div>
        </div>
      )}
      
      {showPinChange && (
        <div style={{ padding: 'var(--space-4)', background: 'var(--color-bg-surface)', borderRadius: '6px', marginBottom: 'var(--space-4)' }}>
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>Current PIN</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={currentPinInput}
              onChange={e => setCurrentPinInput(e.target.value.replace(/\D/g, ''))}
              style={{ width: '100%', padding: '10px', background: 'var(--color-bg-surface-solid)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '18px', letterSpacing: '8px', textAlign: 'center' }}
              placeholder="****"
            />
          </div>
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>New PIN (4-8 digits)</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={pinInput}
              onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
              style={{ width: '100%', padding: '10px', background: 'var(--color-bg-surface-solid)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '18px', letterSpacing: '8px', textAlign: 'center' }}
              placeholder="****"
            />
          </div>
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>Confirm New PIN</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={confirmPinInput}
              onChange={e => setConfirmPinInput(e.target.value.replace(/\D/g, ''))}
              style={{ width: '100%', padding: '10px', background: 'var(--color-bg-surface-solid)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '18px', letterSpacing: '8px', textAlign: 'center' }}
              placeholder="****"
            />
          </div>
          {authError && <div style={{ color: 'var(--color-error)', fontSize: '12px', marginBottom: 'var(--space-3)' }}>{authError}</div>}
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button style={styles.manageBtn} aria-label="Save new PIN" onClick={handleChangePin}>Change PIN</button>
            <button style={{ ...styles.manageBtn, background: 'transparent' }} aria-label="Cancel PIN change" onClick={() => { setShowPinChange(false); setCurrentPinInput(''); setPinInput(''); setConfirmPinInput(''); setAuthError(''); }}>Cancel</button>
          </div>
        </div>
      )}
      
      {/* Password Setup */}
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Password</span>
          <span style={styles.settingDesc}>Use a password to unlock</span>
        </div>
        {settings.passwordEnabled ? (
          <div style={{ display: 'flex', gap: '6px' }}>
            <button style={styles.manageBtn} aria-label="Change password" onClick={() => { setShowPasswordChange(true); setShowPasswordSetup(false); setAuthError(''); }}>Change</button>
            <button style={styles.dangerBtnSmall} aria-label="Remove password" onClick={() => handleDisableAuth('password')}>Remove</button>
          </div>
        ) : (
          <button style={styles.manageBtn} aria-label="Set password" onClick={() => setShowPasswordSetup(true)}>Set Password</button>
        )}
      </div>
      
      {showPasswordSetup && (
        <div style={{ padding: 'var(--space-4)', background: 'var(--color-bg-surface)', borderRadius: '6px', marginBottom: 'var(--space-4)' }}>
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>Enter Password (min 8 characters)</label>
            <input
              type="password"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              style={{ width: '100%', padding: '10px', background: 'var(--color-bg-surface-solid)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '14px' }}
              placeholder="Enter password"
            />
          </div>
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>Confirm Password</label>
            <input
              type="password"
              value={confirmPasswordInput}
              onChange={e => setConfirmPasswordInput(e.target.value)}
              style={{ width: '100%', padding: '10px', background: 'var(--color-bg-surface-solid)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '14px' }}
              placeholder="Confirm password"
            />
          </div>
          {authError && <div style={{ color: 'var(--color-error)', fontSize: '12px', marginBottom: 'var(--space-3)' }}>{authError}</div>}
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button style={styles.manageBtn} aria-label="Save password" onClick={handleSetupPassword}>Save Password</button>
            <button style={{ ...styles.manageBtn, background: 'transparent' }} aria-label="Cancel password setup" onClick={() => { setShowPasswordSetup(false); setPasswordInput(''); setConfirmPasswordInput(''); setAuthError(''); }}>Cancel</button>
          </div>
        </div>
      )}
      
      {showPasswordChange && (
        <div style={{ padding: 'var(--space-4)', background: 'var(--color-bg-surface)', borderRadius: '6px', marginBottom: 'var(--space-4)' }}>
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>Current Password</label>
            <input
              type="password"
              value={currentPasswordInput}
              onChange={e => setCurrentPasswordInput(e.target.value)}
              style={{ width: '100%', padding: '10px', background: 'var(--color-bg-surface-solid)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '14px' }}
              placeholder="Current password"
            />
          </div>
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>New Password (min 8 characters)</label>
            <input
              type="password"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              style={{ width: '100%', padding: '10px', background: 'var(--color-bg-surface-solid)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '14px' }}
              placeholder="New password"
            />
          </div>
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>Confirm New Password</label>
            <input
              type="password"
              value={confirmPasswordInput}
              onChange={e => setConfirmPasswordInput(e.target.value)}
              style={{ width: '100%', padding: '10px', background: 'var(--color-bg-surface-solid)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '14px' }}
              placeholder="Confirm new password"
            />
          </div>
          {authError && <div style={{ color: 'var(--color-error)', fontSize: '12px', marginBottom: 'var(--space-3)' }}>{authError}</div>}
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button style={styles.manageBtn} aria-label="Save new password" onClick={handleChangePassword}>Change Password</button>
            <button style={{ ...styles.manageBtn, background: 'transparent' }} aria-label="Cancel password change" onClick={() => { setShowPasswordChange(false); setCurrentPasswordInput(''); setPasswordInput(''); setConfirmPasswordInput(''); setAuthError(''); }}>Cancel</button>
          </div>
        </div>
      )}
      
      {/* Auto Lock */}
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Auto-Lock Timer</span>
          <span style={styles.settingDesc}>Lock DEX after inactivity</span>
        </div>
        <Select
          size="sm"
          options={[{ value: '0', label: 'Never' }, { value: '1', label: '1 minute' }, { value: '5', label: '5 minutes' }, { value: '15', label: '15 minutes' }, { value: '30', label: '30 minutes' }, { value: '60', label: '1 hour' }]}
          value={String(settings.autoLockMinutes)}
          onChange={v => setSettings(prev => ({ ...prev, autoLockMinutes: Number(v) }))}
        />
      </div>
      
      {/* Current Auth Status */}
      {(settings.pinEnabled || settings.passwordEnabled || settings.biometricEnabled) && (
        <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'rgba(48,209,88,0.1)', border: '1px solid rgba(48,209,88,0.2)', borderRadius: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-success)', fontSize: '13px', fontWeight: 500 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9,12 11,14 15,10"/></svg>
            Protected with: {[
              settings.biometricEnabled && 'Fingerprint',
              settings.pinEnabled && 'PIN',
              settings.passwordEnabled && 'Password'
            ].filter(Boolean).join(' + ')}
          </div>
        </div>
      )}
      
      {/* Recovery Codes */}
      {(settings.pinEnabled || settings.passwordEnabled) && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <div style={styles.settingRow}>
            <div style={styles.settingInfo}>
              <span style={styles.settingLabel}>Recovery Codes</span>
              <span style={styles.settingDesc}>Generate backup codes in case you forget your PIN or password</span>
            </div>
            <button style={styles.manageBtn} aria-label="Generate recovery codes" onClick={handleGenerateRecoveryCodes}>Generate</button>
          </div>
          {showRecoveryCodes && recoveryCodes.length > 0 && (
            <div style={{ padding: 'var(--space-4)', background: 'rgba(255,165,0,0.08)', border: '1px solid rgba(255,165,0,0.2)', borderRadius: '6px', marginBottom: 'var(--space-4)' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-warning)', marginBottom: '10px' }}>Save these codes somewhere safe!</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--color-text-primary)' }}>
                {recoveryCodes.map((code, i) => (
                  <div key={i} style={{ padding: '6px 10px', background: 'var(--color-bg-inset, rgba(0,0,0,0.2))', borderRadius: '4px', textAlign: 'center' }}>{code}</div>
                ))}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: 'var(--space-2)' }}>Each code can only be used once. Store them securely.</div>
              <button style={{ ...styles.manageBtn, marginTop: '10px' }} aria-label="Close recovery codes" onClick={() => setShowRecoveryCodes(false)}>Done</button>
            </div>
          )}
        </div>
      )}
      
      <h3 style={styles.sectionTitle}>Privacy</h3>
      {renderToggle('locationServices', 'Location Services', 'Allow DEX to access your location')}
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Crash reports</span>
          <span style={styles.settingDesc}>Kept on this device for diagnostics. DEX does not send crash reports, analytics or usage data anywhere.</span>
        </div>
      </div>
      
      {/* Fake protection toggles (firewall / anti-hacker / malware / sandbox /
          VPN / "protect stored data") and a status panel that reported them as
          "Active" / "Protected" were removed: nothing implemented them. This block
          states what actually protects the user. */}
      <h3 style={styles.sectionTitle}>How DEX protects you</h3>
      <div style={styles.aboutDetails}>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Lock screen</span>
          <span style={styles.aboutValue}>{settings.pinEnabled || settings.passwordEnabled ? 'PIN/password set (stored as an Argon2id hash)' : 'Not set: add a PIN or password above'}</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Password Vault</span>
          <span style={styles.aboutValue}>AES-256-GCM; key derived from your master password, never stored</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Malware &amp; firewall</span>
          <span style={styles.aboutValue}>Provided by Windows Security, not by DEX</span>
        </div>
      </div>
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Windows Security</span>
          <span style={styles.settingDesc}>Check Microsoft Defender Antivirus and Windows Firewall status</span>
        </div>
        <button
          type="button"
          style={styles.manageBtn}
          onClick={() => { void (window as any).electron?.invoke?.('shell:openExternal', 'windowsdefender:'); }}
        >Open</button>
      </div>

      <h3 style={styles.sectionTitle}>UKI Memory Privacy</h3>
      <div style={styles.aboutDetails}>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Memory Recording</span>
          <span style={{ color: settings.ukiMemoryEnabled ? 'var(--color-warning, #ff9f0a)' : 'var(--color-success, #30d158)' }}>
            {settings.ukiMemoryEnabled ? 'Recording' : 'Off'}
          </span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Storage</span>
          <span style={styles.aboutValue}>Stored on this device only</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Auto Cleanup</span>
          <span style={styles.aboutValue}>{settings.ukiAutoCleanup ? `Every ${settings.ukiRetentionDays || 30} days` : 'Manual'}</span>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>
        UKI memories are stored locally and never transmitted. Manage in <button style={{ background: 'none', border: 'none', color: 'var(--color-accent, #4A9EFF)', cursor: 'pointer', fontSize: 11, padding: 0 }} onClick={() => setActiveSection('uki')}>UKI &amp; Memory</button>
      </div>

      <h3 style={styles.sectionTitle}>Permission Controls</h3>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
        All permissions are OFF by default. Unused permissions auto-disable after the configured timeout.
      </div>
      {(() => {
        const { permissions, setPermission, setAutoDisableMinutes } = usePermissionStore.getState();
        return ALL_PERMISSIONS.map(id => {
          const entry = permissions[id];
          return (
            <div key={id} style={{ ...styles.settingRow, flexWrap: 'wrap' }}>
              <div style={styles.settingInfo}>
                <span style={styles.settingLabel}>{PERMISSION_LABELS[id]}</span>
                <span style={styles.settingDesc}>{PERMISSION_DESCRIPTIONS[id]}</span>
                {entry.enabled && entry.lastUsedAt && (
                  <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                    Last used: {new Date(entry.lastUsedAt).toLocaleTimeString()} &middot; Auto-off: {entry.autoDisableMinutes} min
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                {entry.enabled && (
                  <select
                    value={entry.autoDisableMinutes}
                    onChange={e => setAutoDisableMinutes(id, Number(e.target.value))}
                    style={{
                      background: 'var(--color-bg-surface)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 4, color: 'var(--color-text-secondary)',
                      fontSize: 11, padding: '4px 6px', cursor: 'pointer',
                    }}
                    aria-label={`Auto-disable timeout for ${PERMISSION_LABELS[id]}`}
                  >
                    <option value={5}>5 min</option>
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                    <option value={60}>1 hour</option>
                    <option value={1440}>Never</option>
                  </select>
                )}
                <label style={{ position: 'relative', display: 'inline-block', width: 42, height: 24, flexShrink: 0, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={entry.enabled}
                    onChange={e => setPermission(id, e.target.checked)}
                    style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                    aria-label={`Toggle ${PERMISSION_LABELS[id]} permission`}
                  />
                  <span style={{
                    position: 'absolute', inset: 0, borderRadius: 10,
                    background: entry.enabled ? 'var(--color-accent)' : 'var(--color-bg-hover)',
                    transition: 'background 0.2s ease',
                  }}>
                    <span style={{
                      position: 'absolute', left: entry.enabled ? 20 : 2, top: 2, width: 20, height: 20,
                      borderRadius: '50%', background: '#fff', transition: 'left 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }} />
                  </span>
                </label>
              </div>
            </div>
          );
        });
      })()}
      <button
        style={{ ...styles.dangerBtnSmall, marginTop: 'var(--space-2)', marginBottom: 'var(--space-4)' }}
        onClick={() => usePermissionStore.getState().revokeAll()}
        aria-label="Revoke all permissions"
      >
        Revoke All Permissions
      </button>

      <h3 style={styles.sectionTitle}>Danger Zone</h3>
      <button 
        style={styles.dangerBtn}
        aria-label="Clear all data"
        onClick={() => {
          if (confirm('Are you sure? This will delete all your data.')) {
            localStorage.clear();
            /* Data cleared successfully */
            window.location.reload();
          }
        }}
      >Clear All Data</button>
    </div>
  );

  const renderAboutSettings = () => (
    <div style={styles.settingsContent}>
      <div style={{ ...styles.aboutHeader, marginTop: 'var(--space-3)' }}>
        <div style={styles.appIcon}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <path d="M8 12h8M12 8v8" />
          </svg>
        </div>
        <div style={styles.appInfo}>
          <span style={styles.appName}>DEX</span>
        </div>
      </div>
      
      {/* Creator Watermark */}
      <div style={{
        padding: 'var(--space-5)', borderRadius: '10px', marginBottom: 'var(--space-5)',
        background: 'linear-gradient(135deg, rgba(74,158,255,0.08) 0%, rgba(99,102,241,0.06) 100%)',
        border: '1px solid var(--color-accent-light, rgba(74,158,255,0.15))',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -8, right: -8, width: 64, height: 64, borderRadius: '50%', background: 'var(--color-accent-soft, rgba(74,158,255,0.04))', pointerEvents: 'none' }} />
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-accent)', marginBottom: '6px', letterSpacing: '-0.02em' }}>
          Created by Onazi Treasure OJ
        </div>
        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)', lineHeight: 1.5 }}>
          Personal Control Hub for Desktop Automation
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <span>&copy; 2026 Onazi Treasure OJ</span>
          <span>MIT License</span>
          <span>All Rights Reserved</span>
        </div>
      </div>
      
      <div style={styles.aboutDetails}>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Edition</span>
          <span style={styles.aboutValue}>DEX Personal</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Released</span>
          <span style={styles.aboutValue}>May 2026</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Made by</span>
          <span style={styles.aboutValue}>Onazi Treasure OJ</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>License</span>
          <span style={styles.aboutValue}>MIT &middot; Free for personal use</span>
        </div>
      </div>

      {/* What you get -- user-facing capability snapshot */}
      <div style={{ marginTop: 'var(--space-2)', marginBottom: 18 }}>
        <h3 style={styles.sectionTitle}>What DEX does for you</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {[
            { title: 'One assistant for everything', body: 'Press the UKI key, type a command, get it done. Notes, files, timers, screenshots, focus mode -- all from one bar.' },
            { title: 'Plans you can preview', body: 'Anything risky shows you the steps first. You stay in control with a single Run or Cancel.' },
            { title: 'Apps that work together', body: 'Notes, Tasks, Files, Workflows, Vinx, Axl, Rewind and more share context so you never lose your place.' },
            { title: 'Yours, on your machine', body: 'Your patterns, history, and shortcuts stay on this device. Optional analytics is off by default.' },
            { title: 'Built for keyboards', body: 'Every action has a shortcut. The slash menu has dozens of commands; type / to see them.' },
            { title: 'Always improving', body: 'Free updates roll in automatically. New features show up here, with the changelog one click away.' },
          ].map(card => (
            <div key={card.title} style={{
              padding: 'var(--space-3) 14px', borderRadius: 10,
              border: '1px solid var(--color-border-subtle)',
              background: 'var(--color-bg-hover, rgba(255,255,255,0.03))',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--color-text-primary)', marginBottom: 4 }}>{card.title}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{card.body}</div>
            </div>
          ))}
        </div>
      </div>
      
      <div style={styles.aboutLinks}>
        <button style={styles.linkBtn} aria-label="Open DEX repository" onClick={() => (window as any).electron?.invoke?.('shell:openExternal', POLICY_REPOSITORY_URL) || window.open(POLICY_REPOSITORY_URL, '_blank', 'noopener,noreferrer')}>Repository</button>
        <button style={styles.linkBtn} aria-label="Open DEX policies" onClick={() => openPolicyViewer('terms')}>Policies</button>
        <button style={styles.linkBtn} aria-label="Report an issue" onClick={() => (window as any).electron?.invoke?.('shell:openExternal', `${POLICY_REPOSITORY_URL}/issues`) || window.open(`${POLICY_REPOSITORY_URL}/issues`, '_blank', 'noopener,noreferrer')}>Report Issue</button>
      </div>

      {/* Legal & Privacy */}
      <div style={{ marginTop: 'var(--space-6)' }}>
        <h3 style={styles.sectionTitle}>Legal & Privacy</h3>
        <div style={styles.aboutDetails}>
          <div style={styles.aboutRow}>
            <span style={styles.aboutLabel}>Policy State</span>
            <span style={{ ...styles.aboutValue, color: hasAcceptedCurrentPolicies(policyAcceptance) ? 'var(--color-success, #30d158)' : 'var(--color-error, #ff453a)' }}>
              {hasAcceptedCurrentPolicies(policyAcceptance) ? 'Accepted current policies' : 'Needs review'}
            </span>
          </div>
          <div style={styles.aboutRow}>
            <span style={styles.aboutLabel}>Accepted</span>
            <span style={styles.aboutValue}>{policyAcceptance?.acceptedAt ? new Date(policyAcceptance.acceptedAt).toLocaleString() : 'Not recorded'}</span>
          </div>
          <div style={styles.aboutRow}>
            <span style={styles.aboutLabel}>Contact</span>
            <span style={styles.aboutValue}>{POLICY_CONTACT_EMAIL}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 14 }}>
          {POLICY_METADATA.map(policy => (
            <button key={policy.slug} style={styles.linkBtn} onClick={() => openPolicyViewer(policy.slug)} aria-label={`Open ${policy.title}`}>
              {policy.title}
            </button>
          ))}
        </div>

        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Optional Product Analytics</span>
            <span style={styles.settingDesc}>Feature usage and performance signals used to improve DEX. Off by default.</span>
          </div>
          <label style={{ position: 'relative', display: 'inline-block', width: 42, height: 24, flexShrink: 0, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={optionalAnalytics}
              onChange={e => toggleOptionalAnalytics(e.target.checked)}
              style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
              aria-label="Toggle optional product analytics"
            />
            <span style={{ position: 'absolute', inset: 0, borderRadius: 10, background: optionalAnalytics ? 'var(--color-accent)' : 'var(--color-bg-hover)', transition: 'background 0.2s ease' }}>
              <span style={{ position: 'absolute', left: optionalAnalytics ? 20 : 2, top: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            </span>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 'var(--space-2)', marginBottom: 14 }}>
          {DATA_CATEGORIES.map(category => (
            <div key={category.id} style={{ padding: '10px var(--space-3)', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover, rgba(255,255,255,0.035))' }}>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--color-text-primary)' }}>{category.label}</div>
              <div style={{ fontSize: 10, color: 'var(--color-accent)', margin: '3px 0 5px' }}>{category.defaultState}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.45 }}>{category.purpose}</div>
            </div>
          ))}
        </div>

        <button style={styles.linkBtn} onClick={resetPolicyAcceptance} aria-label="Reset policy acceptance">
          Reset Policy Acceptance
        </button>
      </div>

      {/* Diagnostic Share */}
      <div style={{ marginTop: 'var(--space-6)' }}>
        <h3 style={styles.sectionTitle}>Diagnostics</h3>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)', lineHeight: '1.5' }}>
          Share diagnostic information with DEX for troubleshooting and product improvement.
          This includes your DEX version, OS, selected app usage stats, and error logs.
          Review before sending; personal files, passwords, and vault items are not collected by default.
        </p>
        <button
          aria-label="Share diagnostics via email"
          style={{
            ...styles.linkBtn,
            background: 'var(--color-accent-light)',
            border: '1px solid var(--color-accent-muted)',
            color: 'var(--color-accent)',
            padding: '10px var(--space-5)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
          onClick={async () => {
            const diag: string[] = [];
            diag.push('=== DEX Diagnostic Report ===');
            diag.push('Version: ' + appVersion);
            diag.push('Platform: ' + navigator.platform);
            diag.push('User Agent: ' + navigator.userAgent);
            diag.push('Language: ' + navigator.language);
            diag.push('Screen: ' + screen.width + 'x' + screen.height + ' @ ' + (window.devicePixelRatio || 1) + 'x');
            diag.push('Memory: ' + ((navigator as any).deviceMemory || 'unknown') + ' GB');
            diag.push('Cores: ' + (navigator.hardwareConcurrency || 'unknown'));
            diag.push('Online: ' + (navigator.onLine ? 'Yes' : 'No'));
            diag.push('Color Scheme: ' + (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'Dark' : 'Light'));
            diag.push('Timestamp: ' + new Date().toISOString());
            // Native WebView2 detection (desktop shell only) — the first thing
            // support needs when the app fails to start or renders blank.
            try {
              const wv = await (window as any).electron?.invoke?.('diagnostics:getWebView2');
              if (wv) {
                diag.push('');
                diag.push('=== WebView2 ===');
                diag.push('Runtime: ' + (wv.installed ? wv.version : 'NOT FOUND (' + (wv.error || 'unknown') + ')'));
                diag.push('Loader: ' + wv.linkage + ' | Process arch: ' + wv.processArch + ' | OS arch: ' + wv.osArch);
                if (wv.envOverride) diag.push('WEBVIEW2_BROWSER_EXECUTABLE_FOLDER: ' + wv.envOverride);
                diag.push('Registry: ' + JSON.stringify(wv.registry));
                diag.push('Startup log: ' + wv.startupLog);
              }
            } catch (e) { console.warn('[DEX]', e); }
            try {
              const eng = localStorage.getItem('dex-engagement-state');
              if (eng) {
                const parsed = JSON.parse(eng);
                diag.push('');
                diag.push('=== Usage Stats ===');
                diag.push('Sessions: ' + (parsed.stats?.totalSessions || 0));
                diag.push('Apps Used: ' + (parsed.stats?.appsUsed?.length || 0));
                diag.push('Current Streak: ' + (parsed.stats?.currentStreak || 0));
                diag.push('Achievements: ' + (parsed.unlockedAchievements?.length || 0));
              }
            } catch (e) { console.warn('[DEX]', e); }
            try {
              const keys = Object.keys(localStorage).filter(k => k.startsWith('dex-'));
              diag.push('');
              diag.push('=== Storage Keys ===');
              keys.forEach(k => diag.push(k + ': ' + ((localStorage.getItem(k) || '').length) + ' bytes'));
            } catch (e) { console.warn('[DEX]', e); }

            const body = encodeURIComponent(diag.join('\n'));
            const subject = encodeURIComponent('DEX Diagnostic Report - v' + appVersion);
            window.open('mailto:' + POLICY_CONTACT_EMAIL + '?subject=' + subject + '&body=' + body, '_blank', 'noopener,noreferrer');
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          Share Diagnostics via Email
        </button>
      </div>
    </div>
  );

  // =========================================================================
  // SLIDER HELPER
  // =========================================================================
  const renderSlider = (
    key: keyof typeof DEFAULT_SETTINGS,
    label: string,
    description: string,
    min: number,
    max: number,
    unit: string = '',
    step: number = 1,
  ) => (
    <div style={styles.settingRow} data-setting-row={label}>
      <div style={styles.settingInfo}>
        <span data-setting-search={label} style={styles.settingLabel}>{label}</span>
        <span style={styles.settingDesc}>{description}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={settings[key] as number}
          onChange={e => setSettings(prev => ({ ...prev, [key]: Number(e.target.value) }))}
          style={{ width: 120, accentColor: 'var(--color-accent, #0a84ff)' }}
          aria-label={label}
        />
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums', minWidth: 40, textAlign: 'right' }}>
          {settings[key]}{unit}
        </span>
      </div>
    </div>
  );

  // =========================================================================
  // SELECT HELPER
  // =========================================================================
  const renderSelect = (
    key: keyof typeof DEFAULT_SETTINGS,
    label: string,
    description: string,
    options: { value: string; label: string }[],
  ) => (
    <div style={styles.settingRow} data-setting-row={label}>
      <div style={styles.settingInfo}>
        <span data-setting-search={label} style={styles.settingLabel}>{label}</span>
        <span style={styles.settingDesc}>{description}</span>
      </div>
      <select
        className="settings-select"
        value={String(settings[key])}
        onChange={e => setSettings(prev => ({ ...prev, [key]: e.target.value }))}
        aria-label={label}
        style={{
          padding: '6px var(--space-3)', borderRadius: 6, fontSize: 12,
          border: '1px solid var(--color-border)', background: 'var(--color-bg-hover)',
          color: 'var(--color-text-primary)', outline: 'none', cursor: 'pointer',
        }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  // =========================================================================
  // SOUND SETTINGS
  // =========================================================================
  // Sound devices, volume, balance and spatial audio belong to Windows. The
  // previous controls here (volume, balance, device pickers with invented
  // "Built-in Speakers" entries, spatial profile, dialogue boost, creative
  // bypass, autoplay) were saved but read by nothing.
  const renderSoundSettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitleFirst}>Sound</h3>
      {renderWindowsLink('Output, input & volume', 'Speakers, headphones, microphones, balance and spatial sound are managed by Windows.', 'ms-settings:sound')}
      {renderWindowsLink('App volume', "Set DEX's volume relative to other apps.", 'ms-settings:apps-volume')}
    </div>
  );

  // =========================================================================
  // DISPLAY SETTINGS
  // =========================================================================
  // Resolution, scaling, brightness, refresh rate and HDR are Windows display
  // settings that DEX cannot change; those controls were saved but read by
  // nothing. Night Shift and glass have real controls elsewhere (linked).
  const renderDisplaySettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitleFirst}>Display</h3>
      {renderWindowsLink('Resolution, scale & refresh rate', 'Resolution, scaling, brightness, refresh rate and HDR are managed by Windows.', 'ms-settings:display')}
      {renderWindowsLink('Night light (Windows)', 'System-wide blue-light reduction for all apps.', 'ms-settings:nightlight')}

      <h3 style={styles.sectionTitle}>In DEX</h3>
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Night Shift</span>
          <span style={styles.settingDesc}>DEX's warm color filter and its intensity.</span>
        </div>
        <button type="button" style={styles.manageBtn} onClick={() => setActiveSection('shell')}>Shell &amp; Dock</button>
      </div>
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Glass &amp; blur</span>
          <span style={styles.settingDesc}>Blur intensity and glass opacity.</span>
        </div>
        <button type="button" style={styles.manageBtn} onClick={() => setActiveSection('appearance')}>Appearance</button>
      </div>
    </div>
  );

  // =========================================================================
  // SYSTEM MONITOR (Task Manager)
  // =========================================================================
  const renderSystemMonitor = () => <SystemMonitorPanel />;

  // =========================================================================
  // PERFORMANCE SETTINGS
  // =========================================================================
  const renderPerformanceSettings = () => (
    <div style={styles.settingsContent}>
      {/* ---- Device Performance Tier ---- */}
      <h3 style={styles.sectionTitleFirst}>Device Performance Tier</h3>
      {(() => {
        const currentTier = getStoredTier() || 'mid';
        const hw = getHardwareSummary();
        const manual = isManualOverride();
        const autoOpt = isAutoOptimizeEnabled();
        return (
          <>
            <div style={{ marginBottom: 'var(--space-3)', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              {hw.cores} cores &middot; {hw.memoryGB.toFixed(1)} GB RAM &middot; {hw.gpuRenderer.slice(0, 48)}
              {hw.weakGPU ? ' (weak GPU)' : ''}
            </div>
            {/* 5-segment tier selector */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 'var(--space-2)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--color-border-subtle)' }}>
              {ALL_TIERS.map((tier) => {
                const active = tier === currentTier;
                return (
                  <button
                    key={tier}
                    onClick={() => {
                      setManualOverride(tier);
                      applyTierPresets(tier);
                      window.location.reload();
                    }}
                    style={{
                      flex: 1, padding: 'var(--space-2) 4px', border: 'none', cursor: 'pointer',
                      background: active ? 'var(--color-bg-active, #252528)' : 'var(--color-bg-secondary)',
                      color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      fontSize: 11, fontWeight: active ? 700 : 500, transition: 'all 0.2s ease',
                    }}
                    title={getTierDescription(tier)}
                    aria-pressed={active}
                  >
                    {getTierLabel(tier)}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
              {getTierDescription(currentTier)}
              {manual ? ' (manual override)' : ' (auto-detected)'}
            </div>
            {manual && (
              <button
                onClick={() => {
                  clearManualOverride();
                  const detected = detectDeviceTier();
                  applyTierPresets(detected);
                  window.location.reload();
                }}
                style={{
                  background: 'none', border: '1px solid var(--color-border-subtle)',
                  color: 'var(--color-text-secondary)', borderRadius: 6, padding: '6px 14px',
                  cursor: 'pointer', fontSize: 12, marginBottom: 'var(--space-3)',
                }}
              >
                Reset to Auto-Detect
              </button>
            )}
            {/* Auto-optimize toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '0.5px solid var(--color-border-subtle)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>Daily Auto-Optimize</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Re-detect hardware and optimize settings each day</div>
              </div>
              <label style={{ position: 'relative', display: 'inline-block', width: 42, height: 24, flexShrink: 0, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoOpt}
                  onChange={(e) => setAutoOptimizeEnabled(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                />
                <span style={{
                  position: 'absolute', inset: 0, borderRadius: 10,
                  background: autoOpt ? 'var(--color-accent)' : 'var(--color-bg-hover)',
                  transition: 'background 0.2s ease',
                }}>
                  <span style={{
                    position: 'absolute', left: autoOpt ? 20 : 2, top: 2, width: 20, height: 20,
                    borderRadius: '50%', background: '#fff', transition: 'left 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  }} />
                </span>
              </label>
            </div>
          </>
        );
      })()}

      <h3 style={styles.sectionTitle}>Graphics</h3>
      {renderToggle('hardwareAcceleration', 'Hardware Acceleration', 'Use GPU for rendering and compositing')}
      {renderToggle('gpuRendering', 'GPU Rendering', 'Offload UI rendering to the graphics card')}

      <h3 style={styles.sectionTitle}>Power</h3>
      {renderSelect('performanceMode', 'Performance Mode', 'System-wide performance tier', [
        { value: 'auto', label: 'Auto (detect hardware)' },
        { value: 'low', label: 'Low (battery/old hardware)' },
        { value: 'balanced', label: 'Balanced' },
        { value: 'performance', label: 'High Performance' },
      ])}
      {renderToggle('lowPowerMode', 'Low Power Mode', 'Reduce animations and background activity to save battery')}

      <h3 style={styles.sectionTitle}>Memory</h3>
      {renderToggle('memoryOptimization', 'Memory Optimization', 'Automatically free unused memory')}

      <h3 style={styles.sectionTitle}>Startup</h3>
      {renderToggle('preloadApps', 'Preload Apps', 'Pre-load frequently used apps for faster launch')}

      <h3 style={styles.sectionTitle}>Resource Reservation</h3>
      {renderToggle(
        'performanceReservation',
        'Performance Mode',
        'Reserve CPU/GPU for the foreground app by lowering the priority of background processes (revertible).',
      )}
      {renderToggle(
        'predictivePrewarm',
        'Predictive Pre-warm',
        'Use your recent app-switching history to pre-warm the next likely app while the device is idle.',
      )}
    </div>
  );

  // =========================================================================
  // ACCESSIBILITY SETTINGS
  // =========================================================================
  const renderAccessibilitySettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitleFirst}>Vision</h3>
      {renderToggle('highContrast', 'Increase Contrast', 'Enhance visual distinction between UI elements')}
      {renderToggle('largeText', 'Larger Text', 'Use larger text size throughout the interface')}
      {renderToggle('reduceTransparency', 'Reduce Transparency', 'Use solid backgrounds instead of translucent surfaces')}

      <h3 style={styles.sectionTitle}>Text Spacing</h3>
      {renderSlider('letterSpacing', 'Letter Spacing', 'Space between characters (WCAG 1.4.12)', 0, 0.2, 'em', 0.01)}
      {renderSlider('lineHeight', 'Line Height', 'Spacing between lines of text (WCAG 1.4.12)', 1.2, 2, '', 0.05)}
      {renderSlider('wordSpacing', 'Word Spacing', 'Space between words (WCAG 1.4.12)', 0, 0.5, 'em', 0.02)}

      <h3 style={styles.sectionTitle}>Screen Reader</h3>
      {renderToggle('screenReader', 'Screen Reader', 'Enable screen reader support and ARIA announcements')}

      <h3 style={styles.sectionTitle}>Motion</h3>
      {renderToggle('reduceMotion', 'Reduce Motion', 'Minimize animations and motion effects')}
    </div>
  );

  // =========================================================================
  // NETWORK SETTINGS
  // =========================================================================
  const renderNetworkSettings = () => {
    const networkMode = useNetworkStore.getState().mode;
    const setNetworkMode = useNetworkStore.getState().setMode;
    return (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitleFirst}>Network Mode</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        {(['full', 'local-only', 'disabled'] as NetworkMode[]).map(m => {
          const selected = m === networkMode;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setNetworkMode(m)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
                background: selected ? 'var(--color-bg-active, #252528)' : 'transparent',
                border: `1px solid ${selected ? 'var(--dex-focus-color, #fff)' : 'var(--color-border, rgba(255,255,255,0.10))'}`,
                borderRadius: 6, padding: 'var(--space-3) 14px', cursor: 'pointer', textAlign: 'left',
                color: 'var(--color-text-primary)',
                transition: 'background 0.12s, border-color 0.12s',
              }}
            >
              <span style={{
                marginTop: 3, width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                background: selected ? 'var(--color-accent, #4A9EFF)' : 'transparent',
                border: `2px solid ${selected ? 'var(--color-accent, #4A9EFF)' : 'var(--color-border)'}`,
                boxShadow: selected ? 'inset 0 0 0 3px var(--color-bg-elevated, #111)' : 'none',
              }} />
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{NETWORK_MODE_LABELS[m]}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                  {NETWORK_MODE_DESCRIPTIONS[m]}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Wi-Fi, Bluetooth, IPv6, DNS-over-HTTPS, bandwidth and web-content
          toggles were removed: none was read by anything. Network Mode above is
          real; the rest is Windows' job. */}
      <h3 style={styles.sectionTitle}>Connections</h3>
      {renderWindowsLink('Wi-Fi', 'Networks, frequency band and hotspots are managed by Windows.', 'ms-settings:network-wifi')}
      {renderWindowsLink('Bluetooth & devices', 'Pairing, discoverability and device modes.', 'ms-settings:bluetooth')}
      {renderWindowsLink('Network & internet', 'IP settings, DNS (including DNS over HTTPS) and proxies.', 'ms-settings:network')}
    </div>
    );
  };

  // =========================================================================
  // FILES SETTINGS
  // =========================================================================
  const renderFilesSettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitleFirst}>File Browsing</h3>
      {renderToggle('showHiddenFiles', 'Show Hidden Files', 'Display hidden files and folders')}
      {renderToggle('confirmDelete', 'Confirm Delete', 'Ask for confirmation before deleting files')}
      {renderSelect('sortBy', 'Sort By', 'Default file sort order', [
        { value: 'name', label: 'Name' },
        { value: 'date', label: 'Date Modified' },
        { value: 'size', label: 'Size' },
        { value: 'type', label: 'Type' },
      ])}
      {renderSelect('thumbnailSize', 'Thumbnail Size', 'Size of file thumbnails in grid view', [
        { value: 'small', label: 'Small' },
        { value: 'medium', label: 'Medium' },
        { value: 'large', label: 'Large' },
      ])}
    </div>
  );

  // =========================================================================
  // BROWSER SETTINGS
  // =========================================================================
  const renderBrowserSettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitleFirst}>Privacy</h3>
      {renderToggle('blockTrackers', 'Block Trackers', 'Block cross-site trackers and fingerprinting')}
      {renderToggle('blockAds', 'Block Ads', 'Block advertisements and popups')}
      {renderToggle('fingerprintProtection', 'Fingerprint Protection', 'Prevent browser fingerprint tracking')}
      {renderToggle('doNotTrack', 'Do Not Track', 'Send Do Not Track header with requests')}
      {renderToggle('blockThirdPartyCookies', 'Block Third-Party Cookies', 'Prevent cross-site cookie tracking')}

      <h3 style={styles.sectionTitle}>Security</h3>
      {renderToggle('forceHttps', 'Force HTTPS', 'Automatically upgrade connections to HTTPS')}
      {renderToggle('clearOnExit', 'Clear on Exit', 'Clear browsing data when DEX closes')}
      {renderToggle('enableTorMode', 'Tor Mode', 'Route traffic through the Tor network for privacy')}

      <h3 style={styles.sectionTitle}>Search & Downloads</h3>
      {renderSelect('defaultSearchEngine', 'Search Engine', 'Default search engine for the browser', [
        { value: 'duckduckgo', label: 'DuckDuckGo' },
        { value: 'google', label: 'Google' },
        { value: 'bing', label: 'Bing' },
        { value: 'brave', label: 'Brave Search' },
      ])}
    </div>
  );

  // ===========================================================================
  // WINDOW MANAGEMENT SETTINGS
  // ===========================================================================
  const renderWindowSettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitleFirst}>Snapping & Layout</h3>
      {renderToggle('stageManager', 'Stage Manager', 'Organize open apps on the side for quick switching')}
      {renderToggle('showAppTabBar', 'App Tab Bar', 'Show running app tabs above the content area')}

      <h3 style={styles.sectionTitle}>Title Bar</h3>
      {renderSelect('windowControls', 'Window Button Style', 'Choose the style of window control buttons', [
        { value: 'system', label: 'System Default' },
        { value: 'traffic', label: 'macOS Traffic Lights' },
      ])}
    </div>
  );

  // ===========================================================================
  // KEYBOARD SHORTCUTS SETTINGS
  // ===========================================================================
  // The real global shortcuts, read from their handlers: CommandPalette.tsx
  // (Ctrl+K), UnifiedSystems.tsx (Ctrl+Shift+F) and AppManager.tsx's keydown
  // handler (everything else). This page used to list three bindings that were
  // all wrong (Ctrl+Shift+P did nothing; Ctrl+Shift+S is split view, not a
  // screenshot) and pointed to a customization screen that does not exist.
  // Keep this list in sync when a handler changes.
  const renderKeyboardSettings = () => {
    const groups: { title: string; rows: [string, string][] }[] = [
      { title: 'Everywhere', rows: [
        [`${_M}+K`, 'Command palette'],
        [`${_M}+Shift+F`, 'Search everything'],
        [`${_M}+1 … ${_M}+9`, 'Open Home, Settings, Files, Notes, Tasks, Browser, Gallery, Calendar, Kanban'],
        [`${_M}+Alt+1 … 9`, 'Switch to Project Space 1–9'],
        [`${_M}+Tab / ${_M}+Shift+Tab`, 'App switcher'],
      ] },
      { title: 'Apps & windows', rows: [
        [`${_M}+W`, 'Close the current app'],
        [`${_M}+Shift+W`, 'Close all apps'],
        [`${_M}+Shift+E`, 'Float / re-dock the current app'],
        [`${_M}+${String.fromCharCode(92)}`, 'Immersive focus (Esc to leave)'],
        [`${_M}+Shift+S`, 'Leave split view, or open the app menu'],
      ] },
      { title: 'Tiling', rows: [
        ['Win+Left / Right', 'Snap to the left / right half'],
        ['Win+Up / Down', 'Maximize / minimize'],
        ['Alt+Shift+Arrows', 'Top / bottom half, top quadrants'],
        ['Alt+Shift+1 … 6', 'Arrange all windows with a layout'],
        ['Win+` or Ctrl+Alt+`', 'Cycle floating windows'],
      ] },
    ];
    const keyStyle: React.CSSProperties = {
      padding: '4px var(--space-3)', borderRadius: 4, whiteSpace: 'nowrap',
      background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
      fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)',
      fontFamily: 'var(--font-mono)', letterSpacing: '0.02em',
    };
    return (
      <div style={styles.settingsContent}>
        {groups.map((g, gi) => (
          <React.Fragment key={g.title}>
            <h3 style={gi === 0 ? styles.sectionTitleFirst : styles.sectionTitle}>{g.title}</h3>
            {g.rows.map(([keys, action]) => (
              <div key={keys} style={styles.settingRow}>
                <div style={styles.settingInfo}>
                  <span style={styles.settingLabel}>{action}</span>
                </div>
                <kbd style={keyStyle}>{keys}</kbd>
              </div>
            ))}
          </React.Fragment>
        ))}
        <div style={{ ...styles.settingDesc, marginTop: 'var(--space-3)' }}>
          Shortcuts can't be changed yet.
        </div>
      </div>
    );
  };


  // ===========================================================================
  // STORAGE & DATA SETTINGS
  // ===========================================================================
  const renderStorageSettings = () => (
    <div style={styles.settingsContent}>
      <StoragePanel styles={styles} />

      <h3 style={styles.sectionTitle}>UKI Memory Archive</h3>
      <div style={styles.aboutDetails}>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Archive Status</span>
          <span style={{ color: settings.ukiMemoryEnabled ? 'var(--color-success, #30d158)' : 'var(--color-text-secondary)' }}>
            {settings.ukiMemoryEnabled ? 'Active' : 'Disabled'}
          </span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Retention</span>
          <span style={styles.aboutValue}>{settings.ukiRetentionDays || 30} days</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Size Limit</span>
          <span style={styles.aboutValue}>{settings.ukiCacheSizeGB || 3} GB</span>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>
        Manage memory settings in <button style={{ background: 'none', border: 'none', color: 'var(--color-accent, #4A9EFF)', cursor: 'pointer', fontSize: 11, padding: 0 }} onClick={() => setActiveSection('uki')}>UKI &amp; Memory</button>
      </div>
    </div>
  );

  // ===========================================================================
  // UKI & MEMORY SETTINGS
  // ===========================================================================
  const renderUkiSettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitleFirst}>UKI Voice Assistant</h3>
      {renderToggle('ukiEnabled', 'Enable UKI', 'Activate the UKI voice assistant')}
      {renderToggle('ukiShowTranscript', 'Show Transcript', 'Display speech transcription bubble during conversations')}

      <UkiVoiceSection
        styles={styles}
        settings={settings}
        setSettings={setSettings}
        renderSelect={renderSelect}
      />

      <h3 style={styles.sectionTitle}>Memory & Context</h3>
      {renderToggle('ukiMemoryEnabled', 'Memory Recording', 'Allow UKI to remember conversations and learn from interactions')}
      {renderSlider('ukiRetentionDays', 'Retention Period', 'How long to keep memory records before cleanup', 1, 365, ' days')}
      {renderToggle('ukiAutoCleanup', 'Auto Cleanup', 'Automatically remove expired memory records')}

      <h3 style={styles.sectionTitle}>Memory Management</h3>
      <UkiArchiveStats styles={styles} />
      <UkiKnowledgeFeed styles={styles} />
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button
          style={{ ...styles.secondaryBtn, flex: 1 }}
          onClick={async () => {
            try {
              const dex = (window as any).dex;
              if (dex?.uki?.memoryCleanup) {
                const removed = await dex.uki.memoryCleanup();
                toast.success(`Cleaned up ${removed} expired records`);
              } else {
                toast.info('Memory cleanup not available — native engine required');
              }
            } catch {
              toast.error('Cleanup failed');
            }
          }}
        >Run Cleanup</button>
        <button
          style={{ ...styles.dangerBtn, flex: 1 }}
          onClick={async () => {
            if (!confirm('Clear all UKI memory? This cannot be undone.')) return;
            try {
              const dex = (window as any).dex;
              if (dex?.uki?.memoryClear) {
                await dex.uki.memoryClear();
                toast.success('All UKI memory cleared');
              } else {
                toast.info('Memory clear not available — native engine required');
              }
            } catch {
              toast.error('Failed to clear memory');
            }
          }}
        >Clear All Memory</button>
      </div>
    </div>
  );

  // ===========================================================================
  // CREATIVE SUITE — PER-APP PROFILES
  // ===========================================================================
  const CREATIVE_APP_IDS = ['videoeditor', 'imosion', 'prism', 'flux', 'forge', 'axl'] as const;
  const [selectedCreativeApp, setSelectedCreativeApp] = useState<string | null>(null);
  const [creativeAppSettings, setCreativeAppSettings] = useState<Record<string, Record<string, unknown>>>(() => {
    try {
      const raw = localStorage.getItem('dex-creative-app-settings');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  // Persist per-app settings
  React.useEffect(() => {
    try { localStorage.setItem('dex-creative-app-settings', JSON.stringify(creativeAppSettings)); } catch { /* ignore */ }
  }, [creativeAppSettings]);

  const getAppSetting = (appId: string, key: string, fallback: unknown) => {
    return creativeAppSettings[appId]?.[key] ?? fallback;
  };
  const setAppSetting = (appId: string, key: string, value: unknown) => {
    setCreativeAppSettings(prev => ({ ...prev, [appId]: { ...prev[appId], [key]: value } }));
  };

  const renderCreativeAppsSettings = () => {
    const detail = selectedCreativeApp ? APP_DEFINITIONS[selectedCreativeApp] : null;

    return (
      <div style={styles.settingsContent}>
        <h3 style={styles.sectionTitleFirst}>DEX Creative Suite</h3>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 var(--space-4)', lineHeight: 1.5 }}>
          Manage individual creative applications. Each app has its own version, settings profile, and performance controls.
        </p>

        {/* App Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)', marginBottom: 'var(--space-5)' }}>
          {CREATIVE_APP_IDS.map(id => {
            const app = APP_DEFINITIONS[id];
            if (!app) return null;
            const isSelected = selectedCreativeApp === id;
            return (
              <button
                key={id}
                onClick={() => setSelectedCreativeApp(isSelected ? null : id)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '14px var(--space-2)', borderRadius: 10, cursor: 'pointer',
                  background: isSelected ? `${app.color}22` : 'var(--color-bg-surface)',
                  border: isSelected ? `1.5px solid ${app.color}` : '1.5px solid var(--color-border-subtle)',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: `linear-gradient(135deg, ${app.color}44, ${app.color}22)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, color: app.color,
                }}>
                  {app.name.charAt(0)}
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: isSelected ? app.color : 'var(--color-text-primary)' }}>
                  {app.name}
                </span>
                <span style={{ fontSize: 9, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  v{app.version || '—'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Detail Panel */}
        {detail && selectedCreativeApp && (
          <div style={{
            background: 'var(--color-bg-surface)', borderRadius: 10,
            border: `1px solid ${detail.color}33`, padding: 'var(--space-4)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <div style={{
                width: 48, height: 48, borderRadius: 10,
                background: `linear-gradient(135deg, ${detail.color}55, ${detail.color}22)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 700, color: detail.color,
              }}>
                {detail.name.charAt(0)}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--color-text-primary)' }}>
                  {detail.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  {detail.description || 'Creative application'}
                </div>
              </div>
            </div>

            {/* Version Info */}
            <h3 style={styles.sectionTitle}>App Info</h3>
            <div style={{ ...styles.aboutDetails, background: 'transparent', border: 'none', borderRadius: 0, padding: '0 0 4px' }}>
              <div style={styles.aboutRow}>
                <span style={styles.aboutLabel}>Version</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: detail.color }}>{detail.version || '—'}</span>
              </div>
              <div style={styles.aboutRow}>
                <span style={styles.aboutLabel}>Build Date</span>
                <span style={styles.aboutValue}>{detail.buildDate || '—'}</span>
              </div>
              <div style={styles.aboutRow}>
                <span style={styles.aboutLabel}>Shortcut</span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px var(--space-2)', borderRadius: 4,
                  background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)',
                }}>{detail.shortcut || '—'}</span>
              </div>
              <div style={styles.aboutRow}>
                <span style={styles.aboutLabel}>Status</span>
                <span style={{ color: 'var(--color-success, #30d158)', fontSize: 12 }}>Active</span>
              </div>
            </div>

            {/* Performance Controls */}
            <h3 style={styles.sectionTitle}>Performance</h3>
            <div style={styles.settingRow}>
              <div style={styles.settingInfo}>
                <span style={styles.settingLabel}>Quality Mode</span>
                <span style={styles.settingDesc}>Balance rendering quality vs performance</span>
              </div>
              <select
                value={getAppSetting(selectedCreativeApp, 'qualityMode', 'balanced') as string}
                onChange={e => setAppSetting(selectedCreativeApp, 'qualityMode', e.target.value)}
                style={{
                  background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
                  borderRadius: 4, color: 'var(--color-text-primary)', fontSize: 12, padding: '4px 10px',
                  outline: 'none', cursor: 'pointer',
                }}
              >
                <option value="performance">Performance</option>
                <option value="balanced">Balanced</option>
                <option value="quality">Quality</option>
              </select>
            </div>
            <div style={styles.settingRow}>
              <div style={styles.settingInfo}>
                <span style={styles.settingLabel}>GPU Acceleration</span>
                <span style={styles.settingDesc}>Use hardware acceleration for rendering</span>
              </div>
              <button
                style={{
                  ...styles.toggle,
                  background: getAppSetting(selectedCreativeApp, 'gpuAcceleration', true) ? 'var(--color-accent)' : 'var(--color-bg-glass)',
                  border: getAppSetting(selectedCreativeApp, 'gpuAcceleration', true) ? 'none' : '1px solid var(--color-border)',
                }}
                onClick={() => setAppSetting(selectedCreativeApp, 'gpuAcceleration', !getAppSetting(selectedCreativeApp, 'gpuAcceleration', true))}
              >
                <div style={{ ...styles.toggleKnob, transform: getAppSetting(selectedCreativeApp, 'gpuAcceleration', true) ? 'translate(20px, -50%)' : 'translate(0, -50%)' }} />
              </button>
            </div>
            <div style={styles.settingRow}>
              <div style={styles.settingInfo}>
                <span style={styles.settingLabel}>Auto-Save Interval</span>
                <span style={styles.settingDesc}>How often work is automatically saved</span>
              </div>
              <select
                value={getAppSetting(selectedCreativeApp, 'autoSaveInterval', '30') as string}
                onChange={e => setAppSetting(selectedCreativeApp, 'autoSaveInterval', e.target.value)}
                style={{
                  background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
                  borderRadius: 4, color: 'var(--color-text-primary)', fontSize: 12, padding: '4px 10px',
                  outline: 'none', cursor: 'pointer',
                }}
              >
                <option value="10">Every 10 seconds</option>
                <option value="30">Every 30 seconds</option>
                <option value="60">Every 60 seconds</option>
                <option value="120">Every 2 minutes</option>
                <option value="off">Disabled</option>
              </select>
            </div>

            {/* Cache & Data */}
            <h3 style={styles.sectionTitle}>Cache & Data</h3>
            <div style={styles.settingRow}>
              <div style={styles.settingInfo}>
                <span style={styles.settingLabel}>Cache Limit</span>
                <span style={styles.settingDesc}>Maximum cache size for this app</span>
              </div>
              <select
                value={getAppSetting(selectedCreativeApp, 'cacheLimit', '2') as string}
                onChange={e => setAppSetting(selectedCreativeApp, 'cacheLimit', e.target.value)}
                style={{
                  background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
                  borderRadius: 4, color: 'var(--color-text-primary)', fontSize: 12, padding: '4px 10px',
                  outline: 'none', cursor: 'pointer',
                }}
              >
                <option value="0.5">500 MB</option>
                <option value="1">1 GB</option>
                <option value="2">2 GB</option>
                <option value="4">4 GB</option>
                <option value="8">8 GB</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <button
                style={{ ...styles.secondaryBtn, flex: 1 }}
                onClick={() => {
                  setCreativeAppSettings(prev => {
                    const updated = { ...prev };
                    delete updated[selectedCreativeApp];
                    return updated;
                  });
                  toast.success(`${detail.name} settings reset to defaults`);
                }}
              >Reset to Defaults</button>
              <button
                style={{ ...styles.secondaryBtn, flex: 1, color: 'var(--color-warning, #FFD60A)' }}
                onClick={() => toast.success(`${detail.name} cache cleared`)}
              >Clear Cache</button>
            </div>
          </div>
        )}

        {/* Suite Overview */}
        {!selectedCreativeApp && (
          <>
            <h3 style={styles.sectionTitle}>Suite Overview</h3>
            <div style={styles.aboutDetails}>
              <div style={styles.aboutRow}>
                <span style={styles.aboutLabel}>Suite Version</span>
                <span style={styles.aboutValue}>1.0.0</span>
              </div>
              <div style={styles.aboutRow}>
                <span style={styles.aboutLabel}>Apps Installed</span>
                <span style={styles.aboutValue}>{CREATIVE_APP_IDS.length}</span>
              </div>
              <div style={styles.aboutRow}>
                <span style={styles.aboutLabel}>License</span>
                <span style={{ color: 'var(--color-success, #30d158)' }}>Included with DEX</span>
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 'var(--space-2)', lineHeight: 1.5 }}>
              Select an app above to view its version, configure performance, and manage per-app settings.
              Each creative app can be independently updated in future releases.
            </p>
          </>
        )}
      </div>
    );
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'general': return renderGeneralSettings();
      case 'appearance': return renderAppearanceSettings();
      case 'shell': return renderShellSettings();
      case 'sound': return renderSoundSettings();
      case 'display': return renderDisplaySettings();
      case 'notifications': return renderNotificationSettings();
      case 'privacy': return renderPrivacySettings();
      case 'network': return renderNetworkSettings();
      case 'performance': return renderPerformanceSettings();
      case 'systemMonitor': return renderSystemMonitor();
      case 'accessibility': return renderAccessibilitySettings();
      case 'window': return renderWindowSettings();
      case 'snap': return <SnapLayoutsPanel />;
      case 'permissions': return <PermissionsPanel />;
      case 'creator': return <CreatorAccessPanel />;
      case 'keyboard': return renderKeyboardSettings();
      case 'files': return renderFilesSettings();
      case 'storage': return renderStorageSettings();
      case 'browser': return renderBrowserSettings();
      case 'uki': return renderUkiSettings();
      case 'aiproviders': return <AiProviderSettings />;
      case 'creativeapps': return renderCreativeAppsSettings();
      case 'plugins': return <PluginMarketplace />;
      case 'developer': return <DeveloperSection onNavigate={jumpToSection} styles={styles} />;
      case 'nexus': return <NexusBiometrics />;
      case 'updates': return <UpdateManagerSection />;
      case 'account': return <AccountSettingsCard />;
      case 'about': return renderAboutSettings();
      default: return renderGeneralSettings();
    }
  };

  return (
    <div className="settings-shell" style={styles.container}>
      <style>{`
        .settings-nav:hover { background: var(--pg-row-hover) !important; color: var(--color-text-primary) !important; }
        .settings-nav:active { transform: scale(0.98); }
        .settings-nav[data-active="true"]::before {
          content: ''; position: absolute; left: 0; top: 6px; bottom: 6px;
          width: 2px; background: var(--color-accent); border-radius: 2px;
          box-shadow: 0 0 6px var(--color-accent-light, rgba(74,158,255,0.55));
        }
        .settings-btn:hover { background: var(--color-bg-hover) !important; }
        .settings-btn:active { transform: scale(0.97); }
        .settings-toggle:hover { background: var(--color-bg-hover) !important; }
        .settings-select:hover { border-color: var(--color-border-strong) !important; }
        .settings-action:hover { background: var(--color-bg-hover) !important; }
        .settings-danger:hover { background: rgba(255,69,58,0.18) !important; }
        .settings-color:hover { transform: scale(1.15); }
        .settings-shell input[type="range"] { accent-color: var(--color-accent); }
        .settings-shell input[type="checkbox"] { accent-color: var(--color-accent); }
        .settings-shell input[type="color"] { border-radius: 6px; box-shadow: inset 0 0 0 1px var(--color-border-subtle); }
        .settings-shell button[aria-pressed="true"] { box-shadow: inset 0 0 0 1px var(--color-border-subtle, rgba(255,255,255,0.14)), 0 6px 18px var(--color-accent-muted, rgba(10,132,255,0.18)); }
        .settings-shell button, .settings-shell input, .settings-shell select { transition: background-color 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease, transform 0.12s ease; }
        .settings-content::-webkit-scrollbar { width: 6px; }
        .settings-content::-webkit-scrollbar-track { background: transparent; }
        .settings-content::-webkit-scrollbar-thumb { background: var(--pg-border-strong); border-radius: 3px; }
        .settings-content::-webkit-scrollbar-thumb:hover { background: var(--pg-border-active); }
        @container (max-width: 760px) {
          .settings-shell { --pg-sidebar-width: 196px; }
        }
      `}</style>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={styles.sidebarTitle}>Settings</span>
        </div>

        <div style={{ padding: '0 var(--space-3) var(--space-2)' }}>
          <div
            style={{
              position: 'relative', display: 'flex', alignItems: 'center',
              background: 'var(--color-bg-hover)',
              border: `1px solid ${settingsSearch ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
              borderRadius: 4, transition: 'border-color 0.12s ease',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2"
              style={{ position: 'absolute', left: 9, pointerEvents: 'none' }} aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              role="searchbox"
              placeholder="Search"
              aria-label="Search all settings"
              aria-controls="settings-search-results"
              autoComplete="off"
              spellCheck={false}
              value={settingsSearch}
              onChange={e => setSettingsSearch(e.target.value)}
              onKeyDown={onSearchKeyDown}
              style={{
                width: '100%', padding: '7px 26px 7px 27px', fontSize: 12,
                background: 'transparent', border: 'none',
                color: 'var(--color-text-primary)', outline: 'none',
                fontFamily: 'var(--dex-font-ui, inherit)',
                boxSizing: 'border-box' as const,
              }}
            />
            {settingsSearch && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => { setSettingsSearch(''); searchInputRef.current?.focus(); }}
                style={{
                  position: 'absolute', right: 6, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', width: 16, height: 16, padding: 0,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Search results — every matching control, tagged by section. */}
        {settingsSearch.trim() && (
          <div
            id="settings-search-results"
            role="listbox"
            aria-label="Settings search results"
            style={{
              margin: '0 var(--space-3) var(--space-2)', borderRadius: 6, overflow: 'hidden',
              border: '1px solid var(--color-border-subtle)',
              background: 'var(--color-bg-surface)',
              maxHeight: 320, overflowY: 'auto',
            }}
          >
            <div style={{
              padding: '6px 10px', fontSize: 10, fontWeight: 600,
              color: 'var(--color-text-tertiary)', textTransform: 'uppercase' as const,
              letterSpacing: 'var(--dex-tracking-label, 0.08em)',
              borderBottom: '1px solid var(--color-border-subtle)',
              position: 'sticky', top: 0, background: 'var(--color-bg-surface)', zIndex: 1,
            }}>
              {searchResults.length > 0
                ? `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`
                : 'No matches'}
            </div>
            {searchResults.length === 0 ? (
              <div style={{ padding: 'var(--space-4) var(--space-3)', textAlign: 'center' as const }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  No settings match &ldquo;{settingsSearch.trim()}&rdquo;
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  Try a different term, like &ldquo;theme&rdquo;, &ldquo;privacy&rdquo;, or &ldquo;AI&rdquo;.
                </div>
              </div>
            ) : (
              searchResults.map((r, i) => {
                const active = i === searchCursor;
                return (
                  <button
                    key={`${r.entry.section}:${r.entry.label}:${i}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setSearchCursor(i)}
                    onClick={() => activateSearchResult(i)}
                    style={{
                      display: 'flex', width: '100%', alignItems: 'flex-start',
                      gap: 'var(--space-2)', padding: 'var(--space-2) 10px', textAlign: 'left' as const,
                      border: 'none', cursor: 'pointer',
                      borderBottom: '1px solid var(--color-border-subtle)',
                      background: active ? 'var(--pg-row-active, var(--color-bg-hover))' : 'transparent',
                    }}
                  >
                    <span style={{
                      marginTop: 1, flexShrink: 0,
                      color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                      display: 'flex',
                    }}>
                      {React.cloneElement(
                        (r.section?.icon as React.ReactElement) || Icons.general,
                        { width: 15, height: 15 } as any,
                      )}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        display: 'block', fontSize: 12.5, fontWeight: 500,
                        color: 'var(--color-text-primary)',
                        whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{r.entry.label}</span>
                      {r.entry.desc && (
                        <span style={{
                          fontSize: 10.5, color: 'var(--color-text-secondary)',
                          lineHeight: 1.35, marginTop: 1, overflow: 'hidden',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
                        } as React.CSSProperties}>{r.entry.desc}</span>
                      )}
                      <span style={{
                        display: 'inline-block', marginTop: 3, fontSize: 9.5, fontWeight: 600,
                        textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                        color: 'var(--color-text-tertiary)',
                        padding: '1px 6px', borderRadius: 4,
                        background: 'var(--color-bg-hover)',
                      }}>{r.section?.name || r.entry.section}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* Import/Export buttons */}
        <div style={{ padding: '0 var(--space-3) var(--space-2)', display: 'flex', gap: 6 }}>
          <button
            onClick={() => importSettings(setSettings)}
            aria-label="Import settings from file"
            style={{
              flex: 1, padding: '5px var(--space-2)', borderRadius: 4, fontSize: 10, fontWeight: 500,
              background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)',
              color: 'var(--color-text-secondary)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Import
          </button>
          <button
            onClick={() => exportSettings(settings)}
            aria-label="Export settings to file"
            style={{
              flex: 1, padding: '5px var(--space-2)', borderRadius: 4, fontSize: 10, fontWeight: 500,
              background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)',
              color: 'var(--color-text-secondary)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export
          </button>
        </div>

        {/* Changed settings count */}
        {countChangedSettings(settings) > 0 && (
          <div style={{ 
            padding: '6px var(--space-3)', margin: '0 var(--space-3) var(--space-2)', borderRadius: 4,
            background: 'var(--color-accent-soft, rgba(10,132,255,0.1))', border: '1px solid var(--color-accent-light, rgba(10,132,255,0.2))',
            fontSize: 10, color: 'var(--color-accent)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent)' }} />
            {countChangedSettings(settings)} setting{countChangedSettings(settings) !== 1 ? 's' : ''} changed from default
          </div>
        )}
        
        <div className="dex-scroll-fade-y" style={styles.sectionList}>
          {(() => {
            const q = settingsSearch.trim().toLowerCase();
            if (q) {
              // A section is relevant if its own name/keywords match the query
              // OR it owns at least one matched setting. Ordered by SECTIONS so
              // the list stays stable.
              const matchedSectionIds = new Set(searchResults.map(r => r.entry.section));
              const filtered = SECTIONS.filter(s =>
                matchedSectionIds.has(s.id)
                || s.name.toLowerCase().includes(q)
                || (s.keywords ? s.keywords.toLowerCase().includes(q) : false),
              );
              if (filtered.length === 0) {
                return (
                  <div style={{ padding: 'var(--space-3) 14px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    No matching sections.
                  </div>
                );
              }
              return (
                <React.Fragment>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: 'var(--dex-tracking-label, 0.08em)', padding: 'var(--space-3) 14px 4px' }}>
                    Sections ({filtered.length})
                  </div>
                  {filtered.map(section => (
                    <button
                      key={section.id}
                      className="settings-nav"
                      data-active={activeSection === section.id ? 'true' : undefined}
                      aria-current={activeSection === section.id ? 'page' : undefined}
                      aria-label={`Navigate to ${section.name} settings`}
                      style={{
                        ...styles.sectionItem,
                        background: activeSection === section.id ? 'var(--pg-row-active)' : 'transparent',
                        color: activeSection === section.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        boxShadow: activeSection === section.id ? 'inset 0 0 0 1px var(--pg-border-active)' : 'none',
                        fontWeight: activeSection === section.id ? 600 : 500,
                      }}
                      onClick={() => jumpToSection(section.id)}
                    >
                      <span style={{ ...styles.sectionIcon, color: activeSection === section.id ? 'var(--color-text-primary)' : 'currentColor' }}>{section.icon}</span>
                      <span>{section.name}</span>
                    </button>
                  ))}
                </React.Fragment>
              );
            }
            return SECTION_CATEGORIES.map(cat => {
              const items = cat.ids.map(id => sectionMap.get(id)).filter(Boolean) as SettingSection[];
              if (items.length === 0) return null;
              // Category folds shut on click, but never hides the active section.
              const catCollapsed = collapsedCats.has(cat.label) && !cat.ids.includes(activeSection);
              return (
                <React.Fragment key={cat.label}>
                  <button
                    type="button"
                    onClick={() => toggleCat(cat.label)}
                    aria-expanded={!catCollapsed}
                    aria-label={`${catCollapsed ? 'Expand' : 'Collapse'} ${cat.label}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: 'var(--dex-tracking-label, 0.08em)', padding: 'var(--space-3) 14px 4px' }}
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: catCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s ease', opacity: 0.7 }}><polyline points="6 9 12 15 18 9" /></svg>
                    <span>{cat.label}</span>
                  </button>
                  {!catCollapsed && items.map(section => (
                    <button
                      key={section.id}
                      className="settings-nav"
                      data-active={activeSection === section.id ? 'true' : undefined}
                      aria-current={activeSection === section.id ? 'page' : undefined}
                      aria-label={`Navigate to ${section.name} settings`}
                      style={{
                        ...styles.sectionItem,
                        background: activeSection === section.id ? 'var(--pg-row-active)' : 'transparent',
                        color: activeSection === section.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        boxShadow: activeSection === section.id ? 'inset 0 0 0 1px var(--pg-border-active)' : 'none',
                        fontWeight: activeSection === section.id ? 600 : 500,
                      }}
                      onClick={() => setActiveSection(section.id)}
                    >
                      <span style={{ ...styles.sectionIcon, color: activeSection === section.id ? 'var(--color-text-primary)' : 'currentColor' }}>{section.icon}</span>
                      <span>{section.name}</span>
                    </button>
                  ))}
                </React.Fragment>
              );
            });
          })()}
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        <div style={styles.header}>
          <span style={styles.headerTitle}>
            {SECTIONS.find(s => s.id === activeSection)?.name}
          </span>
          {SECTION_RESET_MAP[activeSection] && (
            <button
              type="button"
              className="settings-btn"
              aria-label={`Reset ${SECTIONS.find(s => s.id === activeSection)?.name} settings to defaults`}
              title="Restore this section's settings to their defaults"
              onClick={() => resetSection(activeSection)}
              style={{
                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)',
                color: 'var(--color-text-secondary)', cursor: 'pointer',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M3 12a9 9 0 109-9 9 9 0 00-6.36 2.64L3 8" />
                <polyline points="3 3 3 8 8 8" />
              </svg>
              Reset
            </button>
          )}
        </div>
        {renderContent()}
      </div>

      <PolicyViewer
        open={policyViewerOpen}
        initialPolicy={policyViewerInitial}
        onClose={() => setPolicyViewerOpen(false)}
      />
      <ConfirmResetHost />
    </div>
  );
};

// ===========================================================================
// STYLES
// ===========================================================================

const styles: Record<string, React.CSSProperties> = {
  // Outer shell. Transparent so the two glass panes (sidebar + content) read as
  // real see-through frosted glass over the desktop rather than frosting a solid
  // fill. The `.dex-liquid-glass` / `-strong` classes on the panes supply material.
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    containerType: 'inline-size',
    background: 'transparent',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)',
    fontSize: '13px',
    overflow: 'hidden',
    transition: 'background-color var(--duration-theme) ease, color var(--duration-theme) ease',
  },

  // Sidebar — frosted glass via `.dex-liquid-glass` on the element; only the
  // right divider + layout live here (background is supplied by the class).
  sidebar: {
    width: 'var(--pg-sidebar-width)',
    minWidth: 'var(--pg-sidebar-width)',
    borderRight: '1px solid var(--pg-border)',
    borderRadius: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sidebarHeader: {
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 14px',
    borderBottom: '1px solid var(--pg-border)',
  },
  sidebarTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.01em',
  },
  sectionList: {
    padding: 'var(--space-2)',
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    overflow: 'auto',
    flex: 1,
  },
  sectionItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '7px var(--space-3)',
    height: 'var(--pg-row-height)',
    borderRadius: 'var(--pg-row-radius)',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12.5px',
    fontWeight: 500,
    textAlign: 'left',
    transition: 'background-color 0.12s ease, color 0.12s ease',
    letterSpacing: '-0.01em',
    position: 'relative',
  },
  sectionIcon: {
    display: 'flex',
    alignItems: 'center',
  },

  // Generic small button (segmented controls, inline actions)
  button: {
    padding: '6px 14px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-hover)',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  // Main content pane — `.dex-liquid-glass-strong` on the element gives the
  // contrast-heavy frosted surface that long settings lists sit on. No radius
  // (full-bleed pane); the class supplies the background.
  main: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: 0,
  },
  // Toolbar header. Transparent so the content pane's glass reads through; the
  // bottom hairline stays for structure.
  header: {
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 18px',
    borderBottom: '1px solid var(--pg-border)',
    background: 'transparent',
  },
  headerTitle: {
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  settingsContent: {
    flex: 1,
    overflow: 'auto',
    padding: '4px var(--space-6) var(--space-6)',
    scrollBehavior: 'smooth',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--dex-tracking-label, 0.08em)',
    marginTop: '28px',
    marginBottom: '10px',
  },
  sectionTitleFirst: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--dex-tracking-label, 0.08em)',
    marginTop: 'var(--space-3)',
    marginBottom: '10px',
  },
  
  // Setting Row
  settingRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
    padding: '13px 0',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  settingInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  settingLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.01em',
  },
  settingDesc: {
    fontSize: '11.5px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.4',
  },
  
  // Toggle
  toggle: {
    width: '44px',
    height: '24px',
    borderRadius: '10px',
    border: 'none',
    cursor: 'pointer',
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    transition: 'background 0.15s ease',
  },
  toggleKnob: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: '#ffffff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    position: 'absolute',
    left: '2px',
    top: '50%',
    transform: 'translateY(-50%)',
    transition: 'transform 0.2s cubic-bezier(0.4,0,0.2,1)',
  },
  

  secondaryBtn: {
    marginTop: 'var(--space-3)',
    padding: '10px 18px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-hover)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  dangerBtn: {
    marginTop: 'var(--space-3)',
    padding: '10px 18px',
    borderRadius: '6px',
    border: 'none',
    background: 'rgba(255,69,58,0.12)',
    color: 'var(--color-error)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  dangerBtnSmall: {
    padding: '6px var(--space-3)',
    borderRadius: '4px',
    border: 'none',
    background: 'rgba(255,67,58,0.15)',
    color: 'var(--color-error)',
    fontSize: '12px',
    cursor: 'pointer',
  },
  
  // About
  aboutHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    marginBottom: 'var(--space-6)',
  },
  appIcon: {
    width: '72px',
    height: '72px',
    borderRadius: '14px',
    background: 'linear-gradient(135deg, #0a84ff 0%, #5e5ce6 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 16px var(--color-accent-muted, rgba(10,132,255,0.3)), 0 1px 3px rgba(0,0,0,0.2)',
  },
  appInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  appName: {
    fontSize: '22px',
    fontWeight: 700,
    letterSpacing: '-0.03em',
  },
  appVersion: {
    fontSize: '14px',
    color: 'var(--color-text-muted)',
  },
  aboutDetails: {
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '10px',
    padding: '4px var(--space-4)',
    marginBottom: 'var(--space-6)',
  },
  aboutRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  aboutLabel: {
    color: 'var(--color-text-secondary)',
    fontSize: '13px',
  },
  aboutValue: {
    color: 'var(--color-text-primary)',
    fontSize: '13px',
  },
  aboutLinks: {
    display: 'flex',
    gap: 'var(--space-3)',
  },
  linkBtn: {
    padding: '9px var(--space-4)',
    borderRadius: '6px',
    border: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface)',
    color: 'var(--color-accent)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  
  // Manage button
  manageBtn: {
    padding: '6px var(--space-3)',
    borderRadius: '4px',
    border: 'none',
    background: 'var(--color-bg-glass)',
    color: 'var(--color-accent)',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
};

Settings.displayName = 'Settings';
export default memo(Settings);

