// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Settings
 * Clean settings panel with sections
 */

import { CREATOR_NAME, CREATOR_CREDIT } from '../../shared/creator';
import React, { useState, useEffect, useMemo, memo, useCallback, useSyncExternalStore } from 'react';
import { getBundledAppVersion, getRuntimeAppVersion, formatDisplayVersion, getBuildInfo, formatBuildInfo } from '../utils/appVersion';
import { openWithShell } from '../utils/openWithShell';
import { isTauri } from '../services/platform/tauriCompat';
import { SoftwareUpdatePanel } from '../components/SoftwareUpdatePanel';
import { applyAccentFamily } from '../utils/accentFamily';
import { setComfort, loadComfort, DENSITY_OPTIONS, type DensityPref } from '../improvements500/comfortPrefs';
import { useToastHelpers } from '../components/Toast';
import { tooltipsEnabled, setTooltipsEnabled } from '../services/tooltips';
import { DexSearchInput } from '../styles/components';
import { Select } from '../components/Select';
import { BrowserTabsSetting } from './settingsPanels/BrowserTabsSetting';
import { BrowserProxyPanel } from './settingsPanels/BrowserProxyPanel';
import { DexSwitch, CAPSULE_SELECTED_BG, SegmentedControl } from '../components/controls';
import { AccountSettingsCard } from '../components/account/AccountSettingsCard';
import { APP_DEFINITIONS } from '../store/runningApps';
import { useWallpaperStore, WALLPAPER_PRESETS, type WallpaperPreset } from '../store/wallpaperStore';
import { useShellPreferences } from '../store/shellPreferencesStore';
import { useNotificationCenterStore } from '../store/unifiedSystemsStore';
import { InterfaceTransparencyControl } from '../components/InterfaceTransparencyControl';
import { isSoundEnabled, setSoundEnabled, subscribeSoundEnabled, getSoundVolume, setSoundVolume, playToggle } from '../shell/SpatialAudio';
import { useFloatingLauncher } from '../store/floatingLauncherStore';
import { DOCK_POSITIONS } from '../components/dock/dockLayout';
import { useDockStore } from '../store/dockStore';
const DOCK_SELECT: React.CSSProperties = { minHeight: 28, padding: '0 8px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontSize: 13, fontFamily: 'inherit' };
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
import GlobalShortcutsPanel from './settingsPanels/GlobalShortcutsPanel';
import { pickUkiVoice, DEFAULT_RATE } from '../uki/voice';
import { SpatialDesktopPanel } from './settingsPanels/SpatialDesktopPanel';
import { TouchInputPanel } from './settingsPanels/TouchInputPanel';
import { UmariFoldersSection } from './settingsPanels/UmariFoldersSection';
import { SETTINGS_INDEX, type SettingIndexEntry } from './settingsPanels/settingsSearchIndex';
import { DATA_CATEGORIES, POLICY_CONTACT_EMAIL, POLICY_METADATA, POLICY_REPOSITORY_URL, type PolicySlug } from '../../shared/policies';
import { applyMotionDurations } from '../styles/motionDurations';
import { applyGlassVars } from '../store/shellPreferencesStore';
import { currentTheme, getThemePreference, setThemePreference, THEME_CHANGED_EVENT, type ThemePreference } from '../utils/theme';
import { setReduceMotionOverride } from '../utils/MotionController';
import { createTapCounter, discoverEasterEgg } from '../services/easterEggs';
import { colorInputValue } from '../utils/canvasTheme';
import { useDexSetting, writeDexSetting } from '../hooks/useDexSetting';
import { dexConfirm } from '../components/dexConfirm';
import { toLocalDateInput } from '../utils/localDate';

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
  touch: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 11V5a2 2 0 0 1 4 0v6"/><path d="M13 10.5V9a2 2 0 0 1 4 0v3.5"/><path d="M9 11l-1.6-1.6a2 2 0 0 0-2.8 2.8L9 17c1.2 1.6 2.6 3 5 3h1a5 5 0 0 0 5-5v-2"/>
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
  touch: Icons.touch,
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
  { label: 'Productivity', ids: ['notifications', 'touch', 'window', 'snap', 'files'] },
  { label: 'Advanced', ids: ['performance', 'systemMonitor', 'accessibility', 'storage', 'browser'] },
  { label: 'AI', ids: ['aiproviders', 'uki'] },
  { label: 'Creative Suite', ids: ['creativeapps'] },
  { label: 'Developer', ids: ['developer', 'plugins'] },
  { label: 'Extensions', ids: ['nexus'] },
  { label: 'Info', ids: ['keyboard', 'updates', 'about'] },
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
  general: { defaultKeys: [] },
  appearance: {
    defaultKeys: ['darkMode', 'reduceMotion', 'transparency', 'reduceTransparency', 'accentColor', 'fontSize', 'windowControls', 'windowMaterial', 'blurIntensity', 'glassOpacity'],
    localKeys: ['darkMode', 'dex-font-scale', 'dex-window-controls'],
  },
  sound: { defaultKeys: [] },
  display: { defaultKeys: ['blurIntensity', 'glassOpacity', 'nightShift'] },
  notifications: { defaultKeys: ['enableNotifications', 'soundEnabled'] },
  privacy: { defaultKeys: ['locationServices', 'crashReports'] },
  performance: {
    defaultKeys: ['predictivePrewarm'],
    localKeys: ['dex-predictive-prewarm'],
  },
  accessibility: { defaultKeys: ['highContrast', 'largeText', 'reduceTransparency', 'letterSpacing', 'lineHeight', 'wordSpacing'] },
  window: {
    defaultKeys: ['showAppTabBar'],
    localKeys: ['dex-app-tab-bar'],
  },
  keyboard: { defaultKeys: [] },
  files: { defaultKeys: ['showHiddenFiles', 'confirmDelete', 'sortBy', 'thumbnailSize'] },
  storage: { defaultKeys: [] },
  browser: { defaultKeys: ['blockTrackers', 'blockAds', 'forceHttps', 'defaultSearchEngine'] },
  uki: { defaultKeys: ['ukiEnabled', 'ukiMemoryEnabled', 'ukiRetentionDays', 'ukiAutoCleanup', 'ukiShowTranscript'] },
};

// ===========================================================================
// UPDATE MANAGER SECTION
// ===========================================================================

// ===========================================================================
// SYSTEM MONITOR -> Task Manager
// Settings used to carry a second, separately polling copy of Task Manager's
// process table. One tool owns processes now; this section points to it.
// ===========================================================================
const SystemMonitorPanel: React.FC = () => {
  const open = () => window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appId: 'taskmanager', appName: 'Task Manager' } }));
  const shortcut = APP_DEFINITIONS.taskmanager?.shortcut;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-5) var(--space-6)', maxWidth: 640 }}>
      <h3 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', margin: 0, color: 'var(--color-text-primary)' }}>System Monitor</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '10px 0', borderTop: '1px solid var(--color-border-subtle)', borderBottom: '1px solid var(--color-border-subtle)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>Task Manager</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Processes, performance history, DEX apps and diagnostics.{shortcut ? ` ${shortcut}` : ''}</div>
        </div>
        <button
          type="button"
          onClick={open}
          style={{ height: 28, padding: '0 12px', borderRadius: 9999, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
        >Open Task Manager</button>
      </div>
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
      if (window.dex?.invoke) {
        await window.dex.invoke('capability:storage:set', 'dex-settings', settings);
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
    if (window.dex?.invoke) {
      const settings = await window.dex.invoke('capability:storage:get', 'dex-settings');
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
  try { window.dispatchEvent(new CustomEvent('dex-settings-changed', { detail: { source: 'settings' } })); } catch { /* noop */ }
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
    a.download = `dex-settings-${toLocalDateInput(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    window.dispatchEvent(new CustomEvent('dex-toast', { 
      detail: { message: 'Settings exported', type: 'success' } 
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
          detail: { message: 'Settings imported', type: 'success' } 
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
    if (window.dex?.invoke) {
      window.dex.invoke('settings:apply', settings).catch((e: unknown) => { console.warn('[DEX]', e); });
    }
    
    const root = document.documentElement;
    const body = document.body;
    
    // Theme: `darkMode` mirrors the applied theme (the page keeps it in step
    // with THEME_CHANGED_EVENT), so it only differs from what is on screen when
    // something set it directly, e.g. an imported settings file. Only then is
    // it a choice to persist; otherwise following the system stays intact.
    const theme = settings.darkMode !== false ? 'dark' : 'light';
    if (theme !== currentTheme()) setThemePreference(theme);

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
      for (const prop of ['--color-accent', '--accent-color', '--color-accent-hover', '--color-accent-dark', '--color-accent-light', '--color-accent-soft', '--color-accent-fill']) {
        root.style.removeProperty(prop);
      }
      root.removeAttribute('data-dex-custom-accent');
    }

    // Text size lives in `dex-font-scale` (Text & Density control, restored at
    // boot by main.tsx); re-apply it so saving another setting never resets it.
    let scale = 1;
    try {
      const v = parseFloat(localStorage.getItem('dex-font-scale') || '');
      if (Number.isFinite(v) && v >= 0.8 && v <= 1.4) scale = v;
    } catch { /* storage blocked */ }
    root.style.setProperty('--font-scale', String(scale));
    
    // Reduce Transparency is an accessibility override on top of the Interface
    // Transparency slider: it forces opaque surfaces without losing the slider
    // position. applyGlassVars is the only writer of the glass tokens.
    if (settings.reduceTransparency) {
      root.classList.remove('transparency-enabled');
      root.classList.add('transparency-disabled');
      root.setAttribute('data-reduce-transparency', 'true');
    } else {
      root.classList.add('transparency-enabled');
      root.classList.remove('transparency-disabled');
      root.removeAttribute('data-reduce-transparency');
    }
    try { applyGlassVars(useShellPreferences.getState()); } catch { /* store not ready */ }
    
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
    // Reach JS-driven motion too (isReduceMotion + the .reduce-motion class).
    // Off = follow the OS setting, not "force motion on".
    setReduceMotionOverride(settings.reduceMotion ? true : null);
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
        // Mirrored as data-dex-* for the shell CSS (see globals.css, Phase 15).
        root.setAttribute(`data-${k.slice(2)}`, String(v));
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
  // Appearance
  darkMode: true,
  reduceMotion: false,
  transparency: true,
  accentColor: 'var(--color-accent)', // system default = stylesheet baseline (macOS system blue)
  fontSize: 'medium',
  windowControls: (navigator.platform?.includes('Win') ? 'system' : 'traffic') as 'system' | 'traffic', // auto-detect: system on Windows, traffic on macOS/Linux

  // Customization
  compactMode: false,

  // Browser
  blockTrackers: true,
  blockAds: true,
  forceHttps: true,
  defaultSearchEngine: 'duckduckgo',

  // Files
  showHiddenFiles: false,
  confirmDelete: true,
  sortBy: 'name',
  thumbnailSize: 'medium',

  // Notifications
  enableNotifications: true,
  soundEnabled: true,

  // Display & Glass
  blurIntensity: 20,
  glassOpacity: 70,
  windowMaterial: 'glass' as 'glass' | 'frosted' | 'solid',
  nightShift: false,

  // Privacy & Security
  locationServices: false,
  crashReports: true,

  // Authentication
  authMethod: 'none' as 'none' | 'pin' | 'password' | 'biometric' | 'pin+biometric' | 'password+biometric',
  biometricEnabled: false,
  pinEnabled: false,
  passwordEnabled: false,

  // Performance
  predictivePrewarm: true,

  // Accessibility
  highContrast: false,
  largeText: false,
  reduceTransparency: false,
  letterSpacing: 0,    // WCAG 1.4.12 text spacing — em multiplier
  lineHeight: 1.5,     // WCAG 1.4.12 line height (unitless)
  wordSpacing: 0,      // WCAG 1.4.12 word spacing — em multiplier

  // Window Management
  showAppTabBar: true,        // Persistent running-app tab bar above content

  // UKI & Memory
  ukiEnabled: true,
  ukiMemoryEnabled: true,
  ukiRetentionDays: 30,
  ukiAutoCleanup: true,
  ukiShowTranscript: true,

  // UKI Voice (TTS) preferences -- default to a female voice when available
  ukiVoiceGender: 'female' as 'female' | 'male' | 'auto',
  ukiVoiceURI: '' as string,
  ukiVoiceRate: DEFAULT_RATE,
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
        <SegmentedControl
          aria-label="UI density"
          value={density}
          onChange={applyDensity}
          options={DENSITY_OPTIONS.map(opt => ({ value: opt.id, label: opt.label }))}
        />
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
      <DexSwitch checked={on} onChange={toggle} label="Pure black (OLED)" />
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
  // Same choice UKI makes when she speaks (uki/voice.ts): a British woman by default.
  return pickUkiVoice(voices, { gender: prefs.gender, voiceURI: prefs.voiceURI });
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
            padding: '6px 14px', borderRadius: 9999, fontSize: 12,
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
/** Saved UKI memory: view, delete one, export all. Reads the real encrypted store. */
const UkiMemoryViewer: React.FC<{ styles: any }> = ({ styles }) => {
  const toast = useToastHelpers();
  const [turns, setTurns] = useState<Array<{ id: string; ts: number; user: string; ukiResponse: string }>>([]);
  const [open, setOpen] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const mem = await import('../uki/memory');
      setTurns((await mem.readTurns()).slice().reverse().slice(0, 100));
    } catch { setTurns([]); }
  }, []);
  useEffect(() => { if (open) void refresh(); }, [open, refresh]);
  useEffect(() => {
    const h = () => { if (open) void refresh(); };
    window.addEventListener('dex-uki-memory-changed', h);
    return () => window.removeEventListener('dex-uki-memory-changed', h);
  }, [open, refresh]);

  const remove = async (id: string) => {
    const mem = await import('../uki/memory');
    await mem.deleteTurn(id);
    void refresh();
  };
  const exportAll = async () => {
    try {
      const mem = await import('../uki/memory');
      const data = await mem.exportUkiMemory();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `uki-memory-${toLocalDateInput(new Date())}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Exported ${data.turns.length} remembered exchanges`);
    } catch {
      toast.error('Export failed');
    }
  };

  return (
    <div style={{ marginBottom: 'var(--space-3)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <button style={{ ...styles.secondaryBtn, flex: 1 }} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Hide saved memory' : 'View saved memory'}
        </button>
        <button style={{ ...styles.secondaryBtn, flex: 1 }} onClick={() => void exportAll()}>Export memory (JSON)</button>
      </div>
      {open && (
        <div role="list" aria-label="Saved UKI memory" style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
          {turns.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Nothing saved. UKI only remembers while Memory Recording is on.</div>
          ) : turns.map((t) => (
            <div role="listitem" key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{new Date(t.ts).toLocaleString()}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.user}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.ukiResponse}</div>
              </div>
              <button
                onClick={() => void remove(t.id)}
                aria-label={`Forget: ${t.user.slice(0, 40)}`}
                style={{ ...styles.secondaryBtn, padding: '2px 8px', fontSize: 11, flexShrink: 0 }}
              >Forget</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

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
    if (!(await dexConfirm({ title: 'Clear all compressed memory archives?', message: 'This removes the warm and cold history but keeps the rolling window.', confirmLabel: 'Clear', tone: 'destructive' }))) return;
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
          padding: '4px 10px', borderRadius: 9999, fontSize: 11,
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
            padding: '4px 10px', borderRadius: 9999, fontSize: 11,
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
          <div style={{ width: `${utilPct}%`, height: '100%', background: 'var(--color-accent-fill)', transition: 'width 0.18s cubic-bezier(0.4,0,0.2,1)' }} />
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
  const [settings, setSettings] = useState<typeof DEFAULT_SETTINGS>(() => ({
    ...(loadSettings() || DEFAULT_SETTINGS),
    // The stored copy can be stale (the OS flipped while following the system,
    // or a schedule applied); the applied theme is the truth.
    darkMode: currentTheme() === 'dark',
  }));
  const [themePref, setThemePref] = useState<ThemePreference>(() => getThemePreference());
  useEffect(() => {
    const onTheme = () => {
      const dark = currentTheme() === 'dark';
      setThemePref(getThemePreference());
      setSettings((prev) => (prev.darkMode === dark ? prev : { ...prev, darkMode: dark }));
    };
    window.addEventListener(THEME_CHANGED_EVENT, onTheme);
    window.addEventListener('storage', onTheme);
    return () => {
      window.removeEventListener(THEME_CHANGED_EVENT, onTheme);
      window.removeEventListener('storage', onTheme);
    };
  }, []);
  // Other surfaces (e.g. the Browser's privacy panel) write single keys through
  // writeDexSetting; pick those up so this page never saves a stale copy over them.
  useEffect(() => {
    const onExternal = (e: Event) => {
      if ((e as CustomEvent).detail?.source === 'settings') return;
      const latest = loadSettings();
      if (latest) setSettings((prev) => ({ ...prev, ...latest, darkMode: currentTheme() === 'dark' }));
    };
    window.addEventListener('dex-settings-changed', onExternal);
    return () => window.removeEventListener('dex-settings-changed', onExternal);
  }, []);
  const [appVersion, setAppVersion] = useState<string>(formatDisplayVersion(getBundledAppVersion()));
  const versionTaps = React.useRef(createTapCounter(7, 3000));
  const [policyViewerOpen, setPolicyViewerOpen] = useState(false);
  const [policyViewerInitial, setPolicyViewerInitial] = useState<PolicySlug>('terms');
  // Hoist shell-prefs hook to component top-level so the hook count stays
  // stable across category switches (renderShellSettings used to call this
  // conditionally which violated the Rules of Hooks).
  const shellPrefs = useShellPreferences();
  const wallpaperOverlay = useWallpaperStore((s) => s.opacity);
  const uiSoundsOn = useSyncExternalStore(subscribeSoundEnabled, isSoundEnabled);
  const uiSoundVolume = useSyncExternalStore(subscribeSoundEnabled, getSoundVolume);
  const dock = useDockStore();
  const dexBarEnabled = useFloatingLauncher((s) => s.enabled);
  const setDexBarEnabled = useFloatingLauncher((s) => s.setEnabled);
  const dnd = useNotificationCenterStore((s) => s.doNotDisturb);
  const setDnd = useNotificationCenterStore((s) => s.setDoNotDisturb);

  // Launch at Login reflects the real per-user Run entry, not a stored flag.
  const [launchAtLogin, setLaunchAtLogin] = useState({ supported: false, enabled: false, busy: false });
  const reopenApps = useDexSetting<boolean>('session.reopenApps', false);
  useEffect(() => {
    let alive = true;
    (window as any).dex?.system?.getLaunchAtLogin?.()
      .then((r: { supported?: boolean; enabled?: boolean } | null) => {
        if (alive && r) setLaunchAtLogin({ supported: !!r.supported, enabled: !!r.enabled, busy: false });
      })
      .catch(() => { /* bridge absent: row stays hidden */ });
    return () => { alive = false; };
  }, []);
  const toggleLaunchAtLogin = useCallback(async () => {
    const want = !launchAtLogin.enabled;
    setLaunchAtLogin((p) => ({ ...p, busy: true }));
    try {
      const r = await (window as any).dex?.system?.setLaunchAtLogin?.(want);
      setLaunchAtLogin({ supported: true, enabled: !!r?.enabled, busy: false });
      if (!r?.success) toast.error('Could not change the startup entry');
    } catch {
      setLaunchAtLogin((p) => ({ ...p, busy: false }));
      toast.error('Could not change the startup entry');
    }
  }, [launchAtLogin.enabled, toast]);

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
  // Security-question recovery enrolment (the guaranteed way back in).
  const [showSecurityQuestions, setShowSecurityQuestions] = useState(false);
  const [securityQuestionsSet, setSecurityQuestionsSet] = useState(false);
  const SECURITY_QUESTION_PROMPTS = [
    'What was the name of your first pet?',
    'What is your mother\'s maiden name?',
    'What was the name of your first school?',
    'In what city were you born?',
    'What was your childhood nickname?',
    'What is the name of your favorite teacher?',
  ];
  const [securityQA, setSecurityQA] = useState<{ question: string; answer: string }[]>([
    { question: SECURITY_QUESTION_PROMPTS[0], answer: '' },
    { question: SECURITY_QUESTION_PROMPTS[1], answer: '' },
    { question: SECURITY_QUESTION_PROMPTS[2], answer: '' },
  ]);

  const handleSaveSecurityQuestions = async () => {
    setAuthError('');
    if (securityQA.some(q => !q.question.trim() || !q.answer.trim())) {
      setAuthError('Fill in every question and answer.');
      return;
    }
    const questionSet = new Set(securityQA.map(q => q.question.trim().toLowerCase()));
    if (questionSet.size !== securityQA.length) {
      setAuthError('Choose distinct questions.');
      return;
    }
    try {
      const result = await window.dex?.invoke('auth:setup:securityQuestions', securityQA);
      if (result?.success) {
        setSecurityQuestionsSet(true);
        setShowSecurityQuestions(false);
        setSecurityQA(prev => prev.map(q => ({ ...q, answer: '' })));
      } else {
        setAuthError(result?.error || 'Failed to save security questions');
      }
    } catch {
      setAuthError('Failed to save security questions');
    }
  };
  
  // Check biometric availability on mount
  React.useEffect(() => {
    const checkBiometric = async () => {
      try {
        if (window.dex?.invoke) {
          const available = await window.dex.invoke('auth:biometricsAvailable');
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

  // Reflect whether security questions are already enrolled.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.dex?.invoke('auth:getSecurityQuestions');
        if (!cancelled) setSecurityQuestionsSet(!!res?.enabled);
      } catch { /* leave as not-set */ }
    })();
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    getRuntimeAppVersion().then(v => setAppVersion(formatDisplayVersion(v))).catch(() => {
      setAppVersion(formatDisplayVersion(getBundledAppVersion()));
    });
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
    if (window.dex?.invoke) {
      window.dex.invoke('auth:setup:pin', pinInput).then(() => {
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
    if (window.dex?.invoke) {
      window.dex.invoke('auth:setup:password', passwordInput).then(() => {
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
      if (window.dex?.invoke) {
        // Native answers {success:false,error} when Windows Hello is cancelled,
        // unavailable or the credential could not be saved. Don't claim it's on.
        const res = await window.dex.invoke('auth:setup:biometric') as { success?: boolean; error?: string } | undefined;
        if (!res || res.success !== true) {
          setAuthError(res?.error || 'Fingerprint sign-in was not enabled');
          return;
        }
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
    // Actually erase the stored credential natively (not just flip local UI).
    const channel = type === 'pin' ? 'auth:disablePin'
      : type === 'password' ? 'auth:disablePassword'
      : 'auth:disableBiometric';
    void window.dex?.invoke?.(channel);
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
      const result = await window.dex?.invoke('auth:changePassword', JSON.stringify({ currentPassword: currentPasswordInput, newPassword: passwordInput }));
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
      const result = await window.dex?.invoke('auth:changePin', JSON.stringify({ currentPin: currentPinInput, newPin: pinInput }));
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
      const result = await window.dex?.invoke('auth:generateRecoveryCodes');
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
      if (key === 'predictivePrewarm') {
        try { localStorage.setItem('dex-predictive-prewarm', nextVal ? '1' : '0'); }
        catch { /* storage blocked */ }
      }
      // Keep the shell-prefs glass mode in sync when the legacy boolean
      // transparency toggles are flipped from anywhere in Settings.
      if (key === 'transparency') {
        try {
          if (nextVal && !prev.reduceTransparency) {
            // Turning glass on from opaque lands at a visible 60% (opacity 1 would look unchanged).
            if (shellPrefs.glassMode === 'off') shellPrefs.setInterfaceTransparency(60);
          } else {
            shellPrefs.setGlassMode(nextVal ? 'reduced' : 'off');
          }
        } catch { /* store not ready */ }
      }
      if (key === 'reduceTransparency') {
        try {
          if (prev.transparency === false) {
            // transparency disabled -- glass stays off
            shellPrefs.setGlassMode('off');
          } else {
            if (nextVal) shellPrefs.setGlassMode('reduced');
            else if (shellPrefs.glassMode === 'reduced') shellPrefs.setInterfaceTransparency(60);
          }
        } catch { /* store not ready */ }
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
        onClick={() => { void openWithShell('external', uri, `Windows settings (${label})`); }}
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
                  background: 'var(--color-accent-fill)', 
                  flexShrink: 0,
                }} 
                title="Changed from default"
              />
            )}
          </span>
          <span style={styles.settingDesc}>{description}</span>
        </div>
        <DexSwitch checked={Boolean(settings[key])} onChange={() => toggleSetting(key)} label={label} />
      </div>
    );
  };

  // A switch row for values that live outside DEFAULT_SETTINGS (native state,
  // other stores). Same markup as renderToggle.
  const renderLiveToggle = (label: string, description: string, checked: boolean, onChange: () => void, disabled = false) => (
    <div style={styles.settingRow} data-setting-row={label}>
      <div style={styles.settingInfo}>
        <span data-setting-search={label} style={styles.settingLabel}>{label}</span>
        <span style={styles.settingDesc}>{description}</span>
      </div>
      <DexSwitch checked={checked} onChange={() => onChange()} label={label} disabled={disabled} />
    </div>
  );

  const renderGeneralSettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitleFirst}>Startup</h3>
      {launchAtLogin.supported && renderLiveToggle('Launch at Login', 'Start DEX when you sign in to Windows', launchAtLogin.enabled, toggleLaunchAtLogin, launchAtLogin.busy)}
      {renderLiveToggle(
        'Reopen apps and windows',
        'When DEX starts, open the apps and extra windows (such as Notes 2) that were open when you last closed it. Up to 12. Not after an unexpected close.',
        reopenApps,
        () => writeDexSetting('session.reopenApps', !reopenApps),
      )}

      <h3 style={styles.sectionTitle}>Reset</h3>
      <button
        style={styles.dangerBtn}
        aria-label="Reset all settings to defaults"
        onClick={async () => {
          const ok = await confirmReset({
            title: 'Reset all settings?',
            message: 'Every setting returns to its default. Your files, notes and apps are not affected.',
            confirmLabel: 'Reset',
            tone: 'destructive',
          });
          if (ok) setSettings({ ...DEFAULT_SETTINGS });
        }}
      >Reset All Settings</button>
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

        <h3 style={styles.sectionTitle}>Dock</h3>
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Style</span>
            <span style={styles.settingDesc}>The Morphing Dock opens from a search button and keeps windows clear of it. The DEX Bar is the floating command bar.</span>
          </div>
          <select value={dock.style} onChange={(e) => dock.setPrefs({ style: e.target.value === 'classic' ? 'classic' : 'morphing' })} aria-label="Dock style" style={DOCK_SELECT}>
            <option value="morphing">Morphing Dock</option>
            <option value="classic">DEX Bar</option>
          </select>
        </div>
        {dock.style === 'morphing' && (
          <>
            <div style={styles.settingRow}>
              <div style={styles.settingInfo}>
                <span style={styles.settingLabel}>Position</span>
                <span style={styles.settingDesc}>Choose an edge or corner, or drag the Dock’s search button.</span>
              </div>
              <select value={dock.edge + ':' + dock.align} onChange={(e) => {
                const position = DOCK_POSITIONS.find(p => p.edge + ':' + p.align === e.target.value);
                if (position) dock.setPrefs({ edge: position.edge, align: position.align });
              }} aria-label="Dock position" style={DOCK_SELECT}>
                {DOCK_POSITIONS.map(p => <option key={p.edge + ':' + p.align} value={p.edge + ':' + p.align}>{p.label}</option>)}
              </select>
            </div>
            <div style={styles.settingRow}>
              <div style={styles.settingInfo}>
                <span style={styles.settingLabel}>Collapse automatically</span>
                <span style={styles.settingDesc}>Return to the search button after opening an app, on Escape, or when the pointer leaves.</span>
              </div>
              <input type="checkbox" checked={dock.autoCollapse} onChange={(e) => dock.setPrefs({ autoCollapse: e.target.checked })} aria-label="Collapse the Dock automatically" />
            </div>
          </>
        )}
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Workspace padding</span>
            <span style={styles.settingDesc}>Space kept between windows and the screen edges, top bar and Dock: {dock.workspacePadding} px.</span>
          </div>
          <input type="range" min={0} max={48} step={4} value={dock.workspacePadding} onChange={(e) => dock.setPrefs({ workspacePadding: Number(e.target.value) })} aria-label="Workspace padding" />
        </div>

        {dock.style === 'classic' && (<>
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
        </>)}

        <h3 style={styles.sectionTitle}>Liquid Glass</h3>
        <InterfaceTransparencyControl styles={styles} />
        {prefs.glassMode !== 'off' && (
          <div style={styles.settingRow}>
            <div style={styles.settingInfo}>
              <span style={styles.settingLabel}>Tint</span>
              <span style={styles.settingDesc}>Color of the frosted-glass overlay (dock, menus).</span>
            </div>
            <input
              type="color"
              value={colorInputValue(prefs.glassTint)}
              onChange={(e) => prefs.setGlassTint(e.target.value)}
              style={{ width: 48, height: 28, border: 'none', background: 'transparent', cursor: 'pointer' }}
              aria-label="Liquid Glass tint color"
            />
          </div>
        )}

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
            <span style={styles.settingLabel}>Desktop creator mark</span>
            <span style={styles.settingDesc}>Show a small &ldquo;{CREATOR_NAME}&rdquo; in the corner of the desktop. It sits behind windows and icons.</span>
          </div>
          <input
            type="checkbox"
            checked={prefs.showCreatorMark}
            onChange={(e) => prefs.setShowCreatorMark(e.target.checked)}
            aria-label="Show desktop creator mark"
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
          <span style={styles.settingDesc}>Dark, light, or follow the system appearance</span>
        </div>
        <SegmentedControl
          aria-label="Appearance"
          value={themePref}
          onChange={(mode) => setThemePreference(mode)}
          options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'Auto' }]}
        />
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

      {/* Interface Transparency -- the single glass-to-opaque control, mirrored
          into the legacy `transparency` boolean for older components that
          still read settings.transparency. */}
      <InterfaceTransparencyControl
        styles={styles}
        onChange={(pct) => setSettings(prev => ({ ...prev, transparency: pct > 0 }))}
      />

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
            <span style={styles.settingLabel}>Wallpaper Overlay</span>
            <span style={styles.settingDesc}>Dims the wallpaper behind the desktop for readability</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 140 }}>
            <input type="range" min="0" max="100" step="5" value={Math.round(wallpaperOverlay * 100)}
              onChange={e => useWallpaperStore.getState().setOpacity(Number(e.target.value) / 100)}
              aria-label="Wallpaper overlay"
              style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', minWidth: 28 }}>{Math.round(wallpaperOverlay * 100)}%</span>
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
      {renderLiveToggle('Do Not Disturb', 'Silence banners and sounds', dnd, () => void setDnd(!dnd))}
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
      
      {/* Current Auth Status */}
      {(settings.pinEnabled || settings.passwordEnabled || settings.biometricEnabled) && (
        <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '6px' }}>
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
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-warning)', marginBottom: '10px' }}>Save these codes somewhere safe.</div>
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
      
      {/* Security Questions -- account recovery so you're never locked out */}
      {(settings.pinEnabled || settings.passwordEnabled) && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <div style={styles.settingRow}>
            <div style={styles.settingInfo}>
              <span style={styles.settingLabel}>Security Questions {securityQuestionsSet ? '(set up)' : ''}</span>
              <span style={styles.settingDesc}>Recover your account and reset your password if you ever forget it — you're never locked out</span>
            </div>
            <button style={styles.manageBtn} aria-label="Set up security questions" onClick={() => { setShowSecurityQuestions(v => !v); setAuthError(''); }}>
              {securityQuestionsSet ? 'Change' : 'Set up'}
            </button>
          </div>
          {showSecurityQuestions && (
            <div style={{ padding: 'var(--space-4)', background: 'rgba(74,158,255,0.06)', border: '1px solid rgba(74,158,255,0.18)', borderRadius: '6px', marginBottom: 'var(--space-4)' }}>
              {securityQA.map((qa, i) => (
                <div key={i} style={{ marginBottom: 'var(--space-3)' }}>
                  <select
                    value={qa.question}
                    aria-label={`Security question ${i + 1}`}
                    onChange={e => setSecurityQA(prev => prev.map((q, j) => j === i ? { ...q, question: e.target.value } : q))}
                    style={{ width: '100%', padding: '8px', marginBottom: '6px', background: 'var(--color-bg-inset, rgba(0,0,0,0.2))', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '13px' }}
                  >
                    {SECURITY_QUESTION_PROMPTS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <input
                    type="text"
                    value={qa.answer}
                    aria-label={`Answer ${i + 1}`}
                    autoComplete="off"
                    placeholder="Your answer"
                    onChange={e => setSecurityQA(prev => prev.map((q, j) => j === i ? { ...q, answer: e.target.value } : q))}
                    style={{ width: '100%', padding: '8px', background: 'var(--color-bg-inset, rgba(0,0,0,0.2))', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
              {authError && <div style={{ color: 'var(--color-danger, #ff5f57)', fontSize: '12px', marginBottom: '8px' }}>{authError}</div>}
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button style={styles.manageBtn} aria-label="Save security questions" onClick={handleSaveSecurityQuestions}>Save</button>
                <button style={{ ...styles.manageBtn, background: 'transparent' }} aria-label="Cancel security questions" onClick={() => { setShowSecurityQuestions(false); setAuthError(''); }}>Cancel</button>
              </div>
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
          onClick={() => { void openWithShell('external', 'windowsdefender:', 'Windows Security'); }}
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
        onClick={async () => {
          const ok = await confirmReset({
            title: 'Reset DEX?',
            message: 'Clears settings, layouts and app preferences on this device, then restarts DEX. Notes, files and vault items are kept. The previous preferences file is saved as a backup.',
            confirmLabel: 'Reset DEX',
            tone: 'destructive',
          });
          if (!ok) return;
          try { await (window as any).dex?.invoke?.('storage:resetKv'); } catch { /* bridge absent */ }
          try { localStorage.clear(); } catch { /* storage blocked */ }
          window.location.reload();
        }}
      >Reset DEX</button>
    </div>
  );

  /** "Windows · Desktop app" from the running environment, not a constant. */
  const aboutPlatform = (): string => {
    const uaPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;
    const os = uaPlatform || (/Windows/i.test(navigator.userAgent) ? 'Windows' : /Mac/i.test(navigator.userAgent) ? 'macOS' : /Linux/i.test(navigator.userAgent) ? 'Linux' : 'Unknown');
    const host = isTauri() ? 'Desktop app' : 'Web preview';
    return `${os} · ${host}`;
  };

  const DATA_STATE_LABEL: Record<string, string> = {
    local: 'Stays on this computer',
    'when-used': 'Only when you use the feature',
    off: 'Off until you turn it on',
    'user-submitted': 'Only what you send',
    'feature-controlled': 'Only with your permission',
    never: 'Never collected',
  };

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
          <span style={styles.appName}>DEX OS</span>
          <span
            onClick={() => { if (versionTaps.current.tap()) discoverEasterEgg('version-tap'); }}
            style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums', cursor: 'default', userSelect: 'none' }}
          >Version {appVersion}</span>
        </div>
      </div>

      {/* Official creator attribution (shown in every official DEX build). The
          legal copyright holder line stays alongside it. */}
      <div data-dex-creator={CREATOR_NAME} style={{
        padding: 'var(--space-4) var(--space-5)', borderRadius: 'var(--radius-md, 10px)', marginBottom: 'var(--space-5)',
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
          {CREATOR_CREDIT}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          DEX Blue Modern
        </div>
      </div>

      <div style={styles.aboutDetails}>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Version</span>
          <span style={styles.aboutValue}>{appVersion}</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Build</span>
          <span style={{ ...styles.aboutValue, fontVariantNumeric: 'tabular-nums' }} data-testid="about-build-id">{getBuildInfo().buildId}{getBuildInfo().serial ? ` (${getBuildInfo().serial})` : ''}</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Channel</span>
          <span style={styles.aboutValue}>{getBuildInfo().channel[0].toUpperCase() + getBuildInfo().channel.slice(1)}{import.meta.env.PROD ? '' : ' (dev server)'}</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Commit</span>
          <span style={{ ...styles.aboutValue, fontFamily: 'var(--font-mono, Consolas, monospace)' }}>{getBuildInfo().commit}</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Built</span>
          <span style={styles.aboutValue}>{getBuildInfo().builtAt ? `${getBuildInfo().builtAt.replace('T', ' ').replace('Z', ' UTC')}` : 'Unknown'}</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Build info</span>
          <button type="button" style={styles.secondaryBtn} data-testid="about-copy-build"
            onClick={() => { void navigator.clipboard?.writeText(formatBuildInfo()).then(() => window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: 'Build info copied' } })), () => window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Could not copy' } }))); }}>Copy</button>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Platform</span>
          <span style={styles.aboutValue}>{aboutPlatform()}</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Updates</span>
          <span style={styles.aboutValue}>Install new versions from the Releases page</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Creator</span>
          <span style={styles.aboutValue}>{CREATOR_NAME}</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Copyright</span>
          <span style={styles.aboutValue}>&copy; 2026 Onazi Treasure OJ</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>License</span>
          <span style={styles.aboutValue}>DEX Software License Agreement v1.0</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Open-source notices</span>
          <span style={styles.aboutValue}>See NOTICE (bundled third-party licenses)</span>
        </div>
      </div>

      <div style={styles.aboutLinks}>
        <button style={styles.linkBtn} aria-label="Open DEX repository" onClick={() => { void openWithShell('external', POLICY_REPOSITORY_URL, 'the DEX repository'); }}>Repository</button>
        <button style={styles.linkBtn} aria-label="Open DEX policies" onClick={() => openPolicyViewer('terms')}>Policies</button>
        <button style={styles.linkBtn} aria-label="Report an issue" onClick={() => { void openWithShell('external', `${POLICY_REPOSITORY_URL}/issues`, 'the issue tracker'); }}>Report Issue</button>
      </div>

      {/* Legal & Privacy */}
      <div style={{ marginTop: 'var(--space-6)' }}>
        <h3 style={styles.sectionTitle}>Legal & Privacy</h3>
        <div style={styles.aboutDetails}>
          <div style={styles.aboutRow}>
            <span style={styles.aboutLabel}>Contact</span>
            <span style={styles.aboutValue}>{POLICY_CONTACT_EMAIL}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 14 }}>
          <button style={styles.linkBtn} onClick={() => window.dispatchEvent(new Event('dex-open-onboarding-review'))} aria-label="Review the Terms of Service and Privacy Notice decision">
            Review terms decision
          </button>
          {POLICY_METADATA.map(policy => (
            <button key={policy.slug} style={styles.linkBtn} onClick={() => openPolicyViewer(policy.slug)} aria-label={`Open ${policy.title}`}>
              {policy.title}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 'var(--space-2)', marginBottom: 14 }}>
          {DATA_CATEGORIES.map(category => (
            <div key={category.id} style={{ padding: '10px var(--space-3)', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover, rgba(255,255,255,0.035))' }}>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--color-text-primary)' }}>{category.label}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', margin: '3px 0 5px' }}>{DATA_STATE_LABEL[category.defaultState]}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.45 }}>{category.purpose}</div>
            </div>
          ))}
        </div>

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
              const wv = await (window as any).dex?.invoke?.('diagnostics:getWebView2');
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
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Interface sounds</span>
          <span style={styles.settingDesc}>Tones for toggles, notifications, copy and errors. Media apps are unaffected.</span>
        </div>
        <input
          type="checkbox"
          checked={uiSoundsOn}
          onChange={(e) => setSoundEnabled(e.target.checked)}
          aria-label="Interface sounds"
        />
      </div>
      <div style={{ ...styles.settingRow, opacity: uiSoundsOn ? 1 : 0.5 }}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Interface volume</span>
          <span style={styles.settingDesc}>{Math.round(uiSoundVolume * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(uiSoundVolume * 100)}
          disabled={!uiSoundsOn}
          onChange={(e) => setSoundVolume(Number(e.target.value) / 100)}
          onPointerUp={(e) => playToggle(e.currentTarget.getBoundingClientRect().left + e.currentTarget.offsetWidth / 2)}
          aria-label="Interface sound volume"
          style={{ width: 160, accentColor: 'var(--color-accent)' }}
        />
      </div>
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
              <DexSwitch checked={autoOpt} onChange={(v) => setAutoOptimizeEnabled(v)} label="Daily Auto-Optimize" />
            </div>
          </>
        );
      })()}

      <h3 style={styles.sectionTitle}>Apps</h3>
      {renderToggle(
        'predictivePrewarm',
        'Predictive Pre-warm',
        'Use your recent app-switching history to pre-warm the next likely app while the device is idle.',
      )}

      <h3 style={styles.sectionTitle}>Browser tabs</h3>
      <BrowserTabsSetting />
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
                background: selected ? 'var(--color-accent-fill)' : 'transparent',
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
      {renderToggle('blockTrackers', 'Block Trackers', 'Block known cross-site trackers')}
      {renderToggle('blockAds', 'Block Ads', 'Block known ad servers')}
      {renderToggle('forceHttps', 'Force HTTPS', 'Upgrade http:// pages to https://')}
      <BrowserProxyPanel styles={styles} />

      <h3 style={styles.sectionTitle}>Search</h3>
      {renderSelect('defaultSearchEngine', 'Search Engine', 'Default search engine for the browser', [
        { value: 'duckduckgo', label: 'DuckDuckGo' },
        { value: 'google', label: 'Google' },
        { value: 'bing', label: 'Bing' },
        { value: 'brave', label: 'Brave Search' },
        { value: 'startpage', label: 'Startpage' },
      ])}
    </div>
  );

  // ===========================================================================
  // WINDOW MANAGEMENT SETTINGS
  // ===========================================================================
  const renderWindowSettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitleFirst}>Snapping & Layout</h3>
      {renderToggle('showAppTabBar', 'App Tab Bar', 'Show running app tabs above the content area')}

      <h3 style={styles.sectionTitle}>Spatial Desktop</h3>
      <SpatialDesktopPanel />

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
  const [showTips, setShowTips] = useState(tooltipsEnabled);
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
      { title: 'DEX Code', rows: [
        [`${_M}+/`, 'Comment or uncomment the selected lines'],
        ['Tab / Shift+Tab', 'Indent / outdent the selected lines'],
        ['Alt+Up / Down', 'Move the line up / down'],
        ['Shift+Alt+Up / Down', 'Duplicate the line'],
        [`${_M}+M`, 'Jump to the matching bracket'],
        ['F12 / Shift+F12', 'Go to definition / find references'],
      ] },
      { title: 'Spatial desktop', rows: [
        [`${_M}+Alt+S`, 'Turn the spatial desktop on / off'],
        [`${_M}+Alt+= / -`, 'Zoom in / out'],
        [`${_M}+Alt+0`, 'Actual size (100%)'],
        [`${_M}+Alt+F`, 'Show all windows'],
        [`${_M}+Alt+Enter`, 'Zoom to the front window'],
        [`${_M}+Alt+Arrows`, 'Pan the canvas'],
        [`${_M}+Alt+Backspace`, 'Previous view'],
        [`${_M}+Alt+W`, 'Find a window (list of all windows and groups)'],
        [`${_M}+Alt+G`, 'Group the windows in view'],
        ['Wheel / two-finger scroll', 'Pan (over the desktop, or once an app has scrolled to its end)'],
        [`${_M}+wheel or pinch`, 'Zoom at the pointer (over the desktop)'],
        ['Alt+wheel', 'Zoom at the pointer (anywhere)'],
        ['Middle-drag, or Space+drag', 'Pan'],
      ] },
    ];
    const keyStyle: React.CSSProperties = {
      padding: '4px var(--space-3)', borderRadius: 4, whiteSpace: 'nowrap',
      background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
      fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)',
      fontFamily: 'var(--font-mono)', letterSpacing: '0.02em',
    };
    const tips: [string, string][] = [
      ['Find anything', `${_M}+K opens the command palette; ${_M}+Shift+F searches files, notes and settings.`],
      ['Undo and redo', `${_M}+Z undoes and ${_M}+Shift+Z (or ${_M}+Y) redoes in the app you are using.`],
      ['Windows', 'Double-click a window header to maximize it; drag the header to move it; drag an edge to resize.'],
      ['Ask UKI', 'UKI can open apps, find files and run tasks; anything that changes your system asks first.'],
    ];
    return (
      <div style={styles.settingsContent}>
        <h3 style={styles.sectionTitleFirst}>Getting around</h3>
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Show tooltips</span>
            <span style={styles.settingDesc}>Little labels that pop up when the pointer rests on a control. Off: what they said is here in Help.</span>
          </div>
          <input type="checkbox" checked={showTips} onChange={(e) => { setTooltipsEnabled(e.target.checked); setShowTips(e.target.checked); }} aria-label="Show tooltips" />
        </div>
        {tips.map(([label, desc]) => (
          <div key={label} style={styles.settingRow}>
            <div style={styles.settingInfo}>
              <span style={styles.settingLabel}>{label}</span>
              <span style={styles.settingDesc}>{desc}</span>
            </div>
          </div>
        ))}
        <GlobalShortcutsPanel styles={styles} />
        {groups.map((g) => (
          <React.Fragment key={g.title}>
            <h3 style={styles.sectionTitle}>{g.title}</h3>
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
          The in-app shortcuts above are fixed; system-wide ones can be changed under System-wide shortcuts.
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

      <UmariFoldersSection styles={styles} />

      <h3 style={styles.sectionTitle}>Memory Management</h3>
      <UkiArchiveStats styles={styles} />
      <UkiMemoryViewer styles={styles} />
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
            const ok = await confirmReset({
              title: 'Clear UKI memory?',
              message: 'Deletes conversations, archives, transcript and reasoning trail. Saved workflows are kept. This cannot be undone.',
              confirmLabel: 'Clear',
              tone: 'destructive',
            });
            if (!ok) return;
            try {
              // This used to clear only the native archive, leaving the
              // encrypted conversation store and transcript in place.
              const { clearAllUkiMemory } = await import('../uki/memory');
              const cleared = await clearAllUkiMemory();
              window.dispatchEvent(new CustomEvent('dex-uki-memory-changed'));
              toast.success(`Cleared: ${cleared.join(', ')}`);
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

  const renderCreativeAppsSettings = () => {
    const detail = selectedCreativeApp ? APP_DEFINITIONS[selectedCreativeApp] : null;

    return (
      <div style={styles.settingsContent}>
        <h3 style={styles.sectionTitleFirst}>DEX Creative Suite</h3>

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
                  background: `${app.color}33`,
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
                background: `${detail.color}33`,
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
      case 'touch': return <TouchInputPanel />;
      case 'files': return renderFilesSettings();
      case 'storage': return renderStorageSettings();
      case 'browser': return renderBrowserSettings();
      case 'uki': return renderUkiSettings();
      case 'aiproviders': return <AiProviderSettings />;
      case 'creativeapps': return renderCreativeAppsSettings();
      case 'plugins': return <PluginMarketplace />;
      case 'developer': return <DeveloperSection onNavigate={jumpToSection} styles={styles} />;
      case 'nexus': return <NexusBiometrics />;
      case 'updates': return <SoftwareUpdatePanel />;
      case 'account': return <AccountSettingsCard />;
      case 'about': return renderAboutSettings();
      default: return renderGeneralSettings();
    }
  };

  return (
    <div className="settings-shell" style={styles.container}>
      <style>{`
        .settings-nav:hover { background: var(--pg-row-hover) !important; color: var(--color-text-primary) !important; }
        /* The selected row is its soft fill alone (no extra accent bar). */
        .settings-btn:hover { background: var(--color-bg-hover) !important; }
        .settings-btn:active { transform: scale(0.97); }
        .settings-toggle:hover { background: var(--color-bg-hover) !important; }
        .settings-select:hover { border-color: var(--color-border-strong) !important; }
        .settings-action:hover { background: var(--color-bg-hover) !important; }
        .settings-danger:hover { background: rgba(255,69,58,0.18) !important; }
        .settings-color:hover { box-shadow: 0 0 0 1px var(--color-border-strong); }
        .settings-shell input[type="range"] { accent-color: var(--color-accent); }
        .settings-shell input[type="checkbox"] { accent-color: var(--color-accent); }
        .settings-shell input[type="color"] { border-radius: 6px; box-shadow: inset 0 0 0 1px var(--color-border-subtle); }
        .settings-shell button, .settings-shell input, .settings-shell select { transition: background-color 0.14s ease, border-color 0.14s ease, color 0.14s ease; }
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
          <DexSearchInput
            ref={searchInputRef}
            size="sm"
            fullWidth
            placeholder="Search"
            aria-label="Search all settings"
            aria-controls={settingsSearch.trim() ? 'settings-search-results' : undefined}
            autoComplete="off"
            spellCheck={false}
            value={settingsSearch}
            onChange={e => setSettingsSearch(e.target.value)}
            onClear={() => { setSettingsSearch(''); searchInputRef.current?.focus(); }}
            onKeyDown={onSearchKeyDown}
          />
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
              color: 'var(--color-text-tertiary)', textTransform: 'none' as const,
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
                        textTransform: 'none' as const, letterSpacing: '0.01em',
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
              flex: 1, padding: '5px var(--space-2)', borderRadius: 9999, fontSize: 10.5, fontWeight: 500,
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
              flex: 1, padding: '5px var(--space-2)', borderRadius: 9999, fontSize: 10.5, fontWeight: 500,
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
            padding: '6px var(--space-3)', margin: '0 var(--space-3) var(--space-2)', borderRadius: 9999,
            background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)',
            fontSize: 10, color: 'var(--color-text-secondary)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent-fill)' }} />
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
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'none' as const, letterSpacing: 'var(--dex-tracking-label, 0.08em)', padding: 'var(--space-3) 14px 4px' }}>
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
                        background: activeSection === section.id ? CAPSULE_SELECTED_BG : 'transparent',
                        color: activeSection === section.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        boxShadow: 'none',
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
                    style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'none' as const, letterSpacing: 'var(--dex-tracking-label, 0.08em)', padding: 'var(--space-3) 14px 4px' }}
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
                        background: activeSection === section.id ? CAPSULE_SELECTED_BG : 'transparent',
                        color: activeSection === section.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        boxShadow: 'none',
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
    background: 'var(--color-bg-secondary)',
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
    minHeight: 'var(--dex-control-h-md)',
    borderRadius: 10,
    flexShrink: 0,
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
    background: 'var(--color-bg-surface)',
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
    height: 'var(--app-header-height)',
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
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textTransform: 'none',
    letterSpacing: '-0.01em',
    marginTop: '28px',
    marginBottom: '10px',
  },
  sectionTitleFirst: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textTransform: 'none',
    letterSpacing: '-0.01em',
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
    padding: '12px 0',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  settingInfo: {
    flex: '1 1 160px',
    minWidth: 0,
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
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.4',
  },
  
  // Toggle
  

  secondaryBtn: {
    marginTop: 'var(--space-3)',
    minHeight: 'var(--dex-control-h-md)',
    padding: '0 var(--space-3)',
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
    minHeight: 'var(--dex-control-h-md)',
    padding: '0 var(--space-3)',
    borderRadius: 9999,
    border: 'none',
    background: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
    // Toward the text colour: lighter in dark, darker in light. Plain error red
    // on its own tint was 3.95:1 in dark mode.
    color: 'color-mix(in srgb, var(--color-error) 75%, var(--color-text-primary))',
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
    background: 'var(--color-accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
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

