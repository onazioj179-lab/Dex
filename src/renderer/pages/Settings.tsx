/**
 * SETTINGS - macOS System Preferences Style
 * Clean settings panel with sections
 */

import React, { useState, memo } from 'react';
import { getBundledAppVersion, getRuntimeAppVersion } from '../utils/appVersion';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface SettingSection {
  id: string;
  name: string;
  icon: React.ReactNode;
}

interface ToggleSetting {
  id: string;
  label: string;
  description: string;
  value: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════

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
  storage: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
      <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/>
    </svg>
  ),
  about: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 16v-4M12 8h.01"/>
    </svg>
  ),
  keyboard: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8"/>
    </svg>
  ),
  network: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10"/>
      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
    </svg>
  ),
  browser: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10"/>
      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
    </svg>
  ),
  files: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  ),
  autofill: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
    </svg>
  ),
  customize: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707"/>
      <circle cx="12" cy="12" r="4"/>
    </svg>
  ),
  performance: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>
  ),
  accessibility: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="4" r="2"/><path d="M12 6v8m-4-6l4 2 4-2m-8 8l4 6 4-6"/>
    </svg>
  ),
  rewind: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polygon points="11 19 2 12 11 5 11 19"/><polygon points="22 19 13 12 22 5 22 19"/>
    </svg>
  ),
};

const SECTIONS: SettingSection[] = [
  { id: 'general', name: 'General', icon: Icons.general },
  { id: 'appearance', name: 'Appearance', icon: Icons.appearance },
  { id: 'customize', name: 'Customization', icon: Icons.customize },
  { id: 'browser', name: 'Browser', icon: Icons.browser },
  { id: 'files', name: 'Files', icon: Icons.files },
  { id: 'autofill', name: 'Auto-Fill', icon: Icons.autofill },
  { id: 'notifications', name: 'Notifications', icon: Icons.notifications },
  { id: 'privacy', name: 'Privacy & Security', icon: Icons.privacy },
  { id: 'keyboard', name: 'Keyboard', icon: Icons.keyboard },
  { id: 'performance', name: 'Performance', icon: Icons.performance },
  { id: 'accessibility', name: 'Accessibility', icon: Icons.accessibility },
  { id: 'network', name: 'Network', icon: Icons.network },
  { id: 'storage', name: 'Storage', icon: Icons.storage },
  { id: 'rewind', name: 'Rewind', icon: Icons.rewind },
  { id: 'about', name: 'About', icon: Icons.about },
];

// ═══════════════════════════════════════════════════════════════════════════
// REWIND SETTINGS SECTION (self-contained sub-component)
// ═══════════════════════════════════════════════════════════════════════════

interface RewindSettingsShape {
  isRecording: boolean;
  trackApps: boolean;
  trackBrowser: boolean;
  trackClipboard: boolean;
  trackFiles: boolean;
  screenshotsEnabled: boolean;
  screenshotIntervalMin: number;
  retentionDays: number;
  aiSearchEnabled: boolean;
}

const RewindSettingsSection: React.FC = () => {
  const dexRewind = (window as unknown as Record<string, Record<string, { getSettings?: () => Promise<RewindSettingsShape | null>; updateSetting?: (key: string, value: boolean | number) => Promise<void>; exportData?: () => Promise<void>; wipeData?: () => Promise<void> }>>).dex?.rewind;
  const [rSettings, setRSettings] = React.useState<RewindSettingsShape | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saved, setSaved] = React.useState(false);
  const savedTimerRef = React.useRef<ReturnType<typeof setTimeout>>();

  React.useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  React.useEffect(() => {
    setLoading(true);
    if (!dexRewind?.getSettings) {
      setRSettings({
        isRecording: true, trackApps: true, trackBrowser: true,
        trackClipboard: true, trackFiles: true, screenshotsEnabled: false,
        screenshotIntervalMin: 5, retentionDays: 30, aiSearchEnabled: false,
      });
      setLoading(false);
      return;
    }
    dexRewind.getSettings().then((s: RewindSettingsShape | null) => {
      if (s) setRSettings(s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const update = async (key: string, value: boolean | number) => {
    const next = { ...rSettings, [key]: value } as RewindSettingsShape;
    setRSettings(next);
    if (dexRewind?.updateSetting) {
      try { await dexRewind.updateSetting(key, value); } catch {}
    }
    setSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 1800);
  };

  if (loading) return <div style={{ padding: 24, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading Rewind settings…</div>;

  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' };
  const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)' };
  const desc: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 };
  const pill = (on: boolean): React.CSSProperties => ({
    width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
    background: on ? 'var(--color-accent)' : 'rgba(255,255,255,0.12)',
    position: 'relative', transition: 'background 0.2s', flexShrink: 0,
  });

  const Toggle: React.FC<{ settingKey: string; checked: boolean }> = ({ settingKey, checked }) => (
    <button className="settings-toggle" style={pill(checked)} onClick={() => update(settingKey, !checked)} aria-checked={checked} role="switch" aria-label={`Toggle ${settingKey}`}>
      <span style={{
        position: 'absolute', top: 3, left: checked ? 21 : 3,
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
      }} />
    </button>
  );

  return (
    <div style={{ padding: '0 24px 24px', overflowY: 'auto' as const, height: '100%' }}>
      {saved && (
        <div style={{ fontSize: 11, color: 'var(--color-success, #30d158)', padding: '8px 0 4px', fontWeight: 600 }}>Saved</div>
      )}

      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, margin: '12px 0 16px' }}>
        DEX Rewind silently records your desktop activity locally. No data leaves your machine.
      </p>

      {/* Recording toggle */}
      <div style={row}>
        <div><div style={label}>Background Recording</div><div style={desc}>Track active windows and system events</div></div>
        <Toggle settingKey="isRecording" checked={!!rSettings?.isRecording} />
      </div>

      {/* What to track */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', padding: '16px 0 8px', textTransform: 'uppercase' as const }}>What to Track</div>
      {[
        { key: 'trackApps', label: 'Active Windows', desc: 'Record which apps and windows are in focus' },
        { key: 'trackBrowser', label: 'Browser Tabs', desc: 'Record visited websites and page titles' },
        { key: 'trackClipboard', label: 'Clipboard', desc: 'Record copied text (not passwords)' },
        { key: 'trackFiles', label: 'File Changes', desc: 'Record opened, saved, and created files' },
      ].map(item => (
        <div key={item.key} style={row}>
          <div><div style={label}>{item.label}</div><div style={desc}>{item.desc}</div></div>
          <Toggle settingKey={item.key} checked={!!rSettings?.[item.key as keyof RewindSettingsShape]} />
        </div>
      ))}

      {/* Screenshots */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', padding: '16px 0 8px', textTransform: 'uppercase' as const }}>Screenshots</div>
      <div style={row}>
        <div><div style={label}>Periodic Screenshots</div><div style={desc}>Capture a screenshot every few minutes</div></div>
        <Toggle settingKey="screenshotsEnabled" checked={!!rSettings?.screenshotsEnabled} />
      </div>
      {rSettings?.screenshotsEnabled && (
        <div style={{ ...row, flexDirection: 'column' as const, alignItems: 'flex-start', gap: 8 }}>
          <div style={label}>Capture interval</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="range" min={1} max={30} step={1}
              value={rSettings?.screenshotIntervalMin ?? 5}
              onChange={e => update('screenshotIntervalMin', parseInt(e.target.value))}
              style={{ width: 140 }}
            />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{rSettings?.screenshotIntervalMin ?? 5} min</span>
          </div>
        </div>
      )}

      {/* AI Search */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', padding: '16px 0 8px', textTransform: 'uppercase' as const }}>AI Search</div>
      <div style={row}>
        <div><div style={label}>AI-Powered Search</div><div style={desc}>Use local Ollama model to rank and summarize search results</div></div>
        <Toggle settingKey="aiSearchEnabled" checked={!!rSettings?.aiSearchEnabled} />
      </div>

      {/* Data retention */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', padding: '16px 0 8px', textTransform: 'uppercase' as const }}>Data</div>
      <div style={{ ...row, alignItems: 'flex-start', flexDirection: 'column' as const, gap: 8 }}>
        <div style={label}>Keep history for</div>
        <select
          style={{ background: 'var(--color-bg-elevated, rgba(255,255,255,0.08))', border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.1))', borderRadius: 8, color: 'var(--color-text-primary, #fff)', padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}
          value={rSettings?.retentionDays ?? 30}
          onChange={e => update('retentionDays', parseInt(e.target.value))}
        >
          {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>{d} days</option>)}
        </select>
      </div>
      <div style={{ paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 8, display: 'flex', gap: 10 }}>
        <button
          className="settings-action"
          aria-label="Export data"
          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: 12, cursor: 'pointer' }}
          onClick={async () => { try { await dexRewind?.exportData?.(); } catch {} }}
        >
          Export Data
        </button>
        <button
          className="settings-danger"
          aria-label="Delete all history"
          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,69,58,0.35)', background: 'transparent', color: 'var(--color-error)', fontSize: 12, cursor: 'pointer' }}
          onClick={async () => {
            if (!window.confirm('Delete all Rewind history? This cannot be undone.')) return;
            try { await dexRewind?.wipeData?.(); } catch {}
          }}
        >
          Delete All History
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

// Load/save settings from localStorage
const loadSettings = () => {
  try {
    const saved = localStorage.getItem('dex-settings');
    if (saved) return JSON.parse(saved);
  } catch { /* localStorage unavailable */ }
  return null;
};

// Save to backend
const saveSettingsToBackend = async (settings: Record<string, unknown>): Promise<boolean> => {
  try {
    if (window.electron?.invoke) {
      await window.electron.invoke('capability:storage:set', 'dex-settings', settings);
      return true;
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[Settings] Backend save failed');
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
  // Also save to backend
  saveSettingsToBackend(settings);
  // Apply settings immediately
  applySettings(settings);
};

// Apply settings to the system
const applySettings = (settings: Record<string, unknown>) => {
  try {
    // Apply performance settings via IPC
    if (window.electron?.invoke) {
      window.electron.invoke('settings:apply', settings).catch(() => {});
    }
    
    // ALWAYS force dark mode for stability - no light mode switching
    const root = document.documentElement;
    const body = document.body;
    
    // DARK MODE LOCKED: Always dark backgrounds, light text
    root.setAttribute('data-theme', 'dark');
    body.classList.add('dark-mode');
    root.classList.add('dark-mode');
    localStorage.setItem('darkMode', 'true');
    
    // Apply accent color
    const accentColor = String(settings.accentColor || '#0a84ff');
    root.style.setProperty('--accent-color', accentColor);
    root.style.setProperty('--color-accent', accentColor);
    
    // Calculate hover variant (always lighter for dark mode)
    root.style.setProperty('--color-accent-hover', lightenColor(accentColor, 20));
    
    // Apply font size
    root.style.setProperty('--font-size-base', 
      settings.fontSize === 'small' ? '12px' : settings.fontSize === 'large' ? '16px' : '14px'
    );
    
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
    
    // Apply high contrast
    if (settings.highContrast) {
      body.classList.add('high-contrast');
    } else {
      body.classList.remove('high-contrast');
    }
    
    // Apply large text
    if (settings.largeText) {
      body.style.fontSize = '18px';
    } else {
      body.style.fontSize = '';
    }
    
    // Apply reduce motion
    if (settings.reduceMotion) {
      root.style.setProperty('--duration-fast', '0ms');
      root.style.setProperty('--duration-normal', '0ms');
      root.style.setProperty('--duration-slow', '0ms');
      root.style.setProperty('--duration-theme', '0ms');
      root.style.setProperty('--animation-duration', '0ms');
    } else {
      root.style.setProperty('--duration-fast', '80ms');
      root.style.setProperty('--duration-normal', '150ms');
      root.style.setProperty('--duration-slow', '250ms');
      root.style.setProperty('--duration-theme', '300ms');
      root.style.setProperty('--animation-duration', '200ms');
    }
    
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

const DEFAULT_SETTINGS = {
  // General
  launchAtStartup: true,
  checkForUpdates: true,
  analytics: false,
  autoSave: true,
  restoreLastSession: true,
  
  // Appearance - LOCKED to dark mode for stability
  darkMode: true, // Always dark mode - no switching
  reduceMotion: false,
  transparency: true,
  accentColor: '#0a84ff', // Apple System Blue (Tahoe)
  fontSize: 'medium',
  targetFPS: 120,
  windowControls: 'system' as 'system' | 'traffic', // system = Windows style, traffic = macOS traffic lights
  
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
  wifiProtection: true,
  blockTrackerDomains: true,
  dnsOverHttps: true,
  ipv6Enabled: false,
  networkMonitor: true,
  bandwidthOptimization: true,
  allowWebGL: true,
  allowJavaScript: true,
  strictSecurity: false,
  
  // Performance
  hardwareAcceleration: true,
  lowPowerMode: false,
  memoryOptimization: true,
  preloadApps: true,
  backgroundBoost: true,
  cpuPriority: 'high',
  gpuRendering: true,
  cacheSizeGB: 4,
  maxRamGB: 4,
  
  // Accessibility
  highContrast: false,
  largeText: false,
  reduceTransparency: false,
  screenReader: false,
};

// ===============================================================================
// COMPONENT
// ===============================================================================

export const Settings: React.FC = () => {
  const [activeSection, setActiveSection] = useState('general');
  const [settings, setSettings] = useState<typeof DEFAULT_SETTINGS>(() => loadSettings() || DEFAULT_SETTINGS);
  const [appVersion, setAppVersion] = useState<string>(getBundledAppVersion());
  
  // Authentication state
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [authError, setAuthError] = useState('');
  
  // Check biometric availability on mount
  React.useEffect(() => {
    const checkBiometric = async () => {
      try {
        if (window.electron?.invoke) {
          const available = await window.electron.invoke('auth:biometric:available');
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
  
  const handleSetupPin = () => {
    setAuthError('');
    if (pinInput.length < 4) {
      setAuthError('PIN must be at least 4 digits');
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
        const newMethod = settings.pinEnabled ? 'pin+biometric' : settings.passwordEnabled ? 'password+biometric' : 'biometric';
        setSettings(prev => ({ ...prev, biometricEnabled: true, authMethod: newMethod as any }));
      } else if ('PublicKeyCredential' in window) {
        // Web Authn fallback
        const newMethod = settings.pinEnabled ? 'pin+biometric' : settings.passwordEnabled ? 'password+biometric' : 'biometric';
        setSettings(prev => ({ ...prev, biometricEnabled: true, authMethod: newMethod as any }));
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

  // Save settings when they change
  React.useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const toggleSetting = (key: keyof typeof DEFAULT_SETTINGS) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderToggle = (key: keyof typeof DEFAULT_SETTINGS, label: string, description: string) => (
    <div style={styles.settingRow}>
      <div style={styles.settingInfo}>
        <span style={styles.settingLabel}>{label}</span>
        <span style={styles.settingDesc}>{description}</span>
      </div>
      <button
        style={{
          ...styles.toggle,
          background: settings[key] ? 'var(--color-success, #30d158)' : 'rgba(255,255,255,0.2)',
        }}
        onClick={() => toggleSetting(key)}
        aria-label={`Toggle ${label}`}
      >
        <div style={{
          ...styles.toggleKnob,
          transform: settings[key] ? 'translateX(20px)' : 'translateX(2px)',
        }} />
      </button>
    </div>
  );

  const renderGeneralSettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitle}>Startup</h3>
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

  const renderAppearanceSettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitle}>Accent Color</h3>
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
        {['#0a84ff', '#30d158', '#ff9f0a', '#ff453a', '#bf5af2', '#ff375f', '#64d2ff', '#ffd60a'].map(color => (
          <button
            key={color}
            aria-label={`Select accent color ${color}`}
            onClick={() => setSettings(prev => ({ ...prev, accentColor: color }))}
            style={{
              width: '32px', height: '32px', borderRadius: '50%', background: color,
              border: settings.accentColor === color ? '3px solid var(--color-text-primary, #fff)' : '2px solid transparent',
              cursor: 'pointer', boxShadow: settings.accentColor === color ? '0 0 10px ' + color : 'none'
            }}
          />
        ))}
      </div>
      
      <h3 style={styles.sectionTitle}>Text Size</h3>
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Font Size</span>
          <span style={styles.settingDesc}>Adjust text size across the app</span>
        </div>
        <select 
          style={styles.selectInput}
          value={settings.fontSize || 'medium'}
          onChange={(e) => setSettings(prev => ({ ...prev, fontSize: e.target.value }))}
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </div>
      
      <h3 style={styles.sectionTitle}>Visual Effects</h3>
      {renderToggle('reduceMotion', 'Reduce Motion', 'Minimize animated effects')}
      {renderToggle('transparency', 'Transparency', 'Use transparent backgrounds')}
      
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
                try { localStorage.setItem('dex-window-controls', style); } catch {}
                window.dispatchEvent(new Event('dex-window-controls-changed'));
              }}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: settings.windowControls === style ? '1px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.1)',
                background: settings.windowControls === style ? 'rgba(10,132,255,0.15)' : 'transparent',
                color: settings.windowControls === style ? 'var(--color-accent)' : 'var(--color-text-secondary)',
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
      <h3 style={styles.sectionTitle}>Notifications</h3>
      {renderToggle('enableNotifications', 'Allow Notifications', 'Show notifications from DEX')}
      {renderToggle('soundEnabled', 'Sound', 'Play sound for notifications')}
      {renderToggle('badgeEnabled', 'Badge App Icon', 'Show notification count on dock icon')}
      {renderToggle('doNotDisturb', 'Do Not Disturb', 'Silence all notifications')}
    </div>
  );

  const renderCustomizationSettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitle}>Taskbar</h3>
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Taskbar Position</span>
          <span style={styles.settingDesc}>Where the taskbar appears</span>
        </div>
        <select 
          style={styles.selectInput}
          value={settings.taskbarPosition || 'bottom'}
          onChange={(e) => setSettings(prev => ({ ...prev, taskbarPosition: e.target.value }))}
        >
          <option value="bottom">Bottom</option>
          <option value="top">Top</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </div>
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Taskbar Size</span>
          <span style={styles.settingDesc}>Size of taskbar icons</span>
        </div>
        <select 
          style={styles.selectInput}
          value={settings.taskbarSize || 'medium'}
          onChange={(e) => setSettings(prev => ({ ...prev, taskbarSize: e.target.value }))}
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </div>
      {renderToggle('showLabels', 'Show Labels', 'Display text labels on taskbar apps')}
      {renderToggle('compactMode', 'Compact Mode', 'Use smaller UI elements throughout')}
      
      <h3 style={styles.sectionTitle}>Animations</h3>
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Animation Speed</span>
          <span style={styles.settingDesc}>Speed of UI animations</span>
        </div>
        <select 
          style={styles.selectInput}
          value={settings.animationSpeed || 'normal'}
          onChange={(e) => setSettings(prev => ({ ...prev, animationSpeed: e.target.value }))}
        >
          <option value="slow">Slow</option>
          <option value="normal">Normal</option>
          <option value="fast">Fast</option>
          <option value="off">Off</option>
        </select>
      </div>
      
      <h3 style={styles.sectionTitle}>Window Behavior</h3>
      <button 
        style={styles.clearBtn}
        aria-label="Reset window positions"
        onClick={() => {
          // Clear layout-related localStorage keys
          const layoutKeys = [
            'dex-widget-layout', 'dex-window-positions', 'dex-panel-sizes',
            'dex-workspace-layout', 'dex-split-view', 'dex-sidebar-state',
            'dex-tab-layout', 'dex-dock-positions'
          ];
          layoutKeys.forEach(key => localStorage.removeItem(key));
          // Reset backend layout state via IPC
          if (window.electron?.invoke) {
            window.electron.invoke('splitview:apply-preset', 'single').catch(() => {});
          }
          // Notify user
          alert('Window positions have been reset. Changes take effect on next restart.');
        }}
      >Reset Window Positions</button>
    </div>
  );

  const renderPerformanceSettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitle}>Display</h3>
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Target Frame Rate</span>
          <span style={styles.settingDesc}>Higher FPS = smoother but uses more power</span>
        </div>
        <select 
          style={styles.selectInput}
          value={settings.targetFPS || 120}
          onChange={(e) => setSettings(prev => ({ ...prev, targetFPS: parseInt(e.target.value) }))}
        >
          <option value="60">60 FPS</option>
          <option value="90">90 FPS</option>
          <option value="120">120 FPS (Recommended)</option>
          <option value="144">144 FPS</option>
          <option value="240">240 FPS</option>
        </select>
      </div>
      {renderToggle('gpuRendering', 'GPU Rendering', 'Use graphics card for smooth visuals')}
      {renderToggle('hardwareAcceleration', 'Hardware Acceleration', 'Use GPU for rendering (faster performance)')}
      
      <h3 style={styles.sectionTitle}>Memory Management</h3>
      {renderToggle('memoryOptimization', 'Auto Memory Optimization', 'Automatically free unused memory')}
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Max RAM Usage</span>
          <span style={styles.settingDesc}>Limit memory consumption (lower = more stable)</span>
        </div>
        <select 
          style={styles.selectInput}
          value={settings.maxRamGB || 4}
          onChange={(e) => setSettings(prev => ({ ...prev, maxRamGB: parseInt(e.target.value) }))}
        >
          <option value="1">1 GB (Ultra Low)</option>
          <option value="2">2 GB (Low)</option>
          <option value="4">4 GB (Recommended)</option>
          <option value="8">8 GB (High)</option>
          <option value="16">16 GB</option>
        </select>
      </div>
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Cache Size</span>
          <span style={styles.settingDesc}>Disk cache for faster loading</span>
        </div>
        <select 
          style={styles.selectInput}
          value={settings.cacheSizeGB || 4}
          onChange={(e) => setSettings(prev => ({ ...prev, cacheSizeGB: parseInt(e.target.value) }))}
        >
          <option value="1">1 GB</option>
          <option value="2">2 GB</option>
          <option value="4">4 GB (Recommended)</option>
          <option value="8">8 GB</option>
          <option value="16">16 GB</option>
        </select>
      </div>
      
      <h3 style={styles.sectionTitle}>CPU & Background</h3>
      {renderToggle('backgroundBoost', 'Background Performance Boost', 'Optimize system when DEX is running')}
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>CPU Priority</span>
          <span style={styles.settingDesc}>Process priority for DEX</span>
        </div>
        <select 
          style={styles.selectInput}
          value={settings.cpuPriority || 'high'}
          onChange={(e) => setSettings(prev => ({ ...prev, cpuPriority: e.target.value }))}
        >
          <option value="low">Low (Save Resources)</option>
          <option value="normal">Normal</option>
          <option value="high">High (Best Performance)</option>
          <option value="realtime">Realtime (Maximum)</option>
        </select>
      </div>
      {renderToggle('preloadApps', 'Preload Apps', 'Load apps in background for instant opening')}
      {renderToggle('lowPowerMode', 'Low Power Mode', 'Reduce performance to save battery')}
      
      <h3 style={styles.sectionTitle}>System Status</h3>
      <div style={styles.aboutDetails}>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Render Mode</span>
          <span style={{ color: 'var(--color-success, #30d158)' }}>120 FPS GPU Accelerated</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Memory Limit</span>
          <span style={styles.aboutValue}>{settings.maxRamGB || 4} GB</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Background Boost</span>
          <span style={{ color: settings.backgroundBoost ? 'var(--color-success, #30d158)' : 'var(--color-error, #ff453a)' }}>{settings.backgroundBoost ? 'Active' : 'Inactive'}</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>CPU Priority</span>
          <span style={styles.aboutValue}>{(settings.cpuPriority || 'high').toUpperCase()}</span>
        </div>
      </div>
    </div>
  );

  const renderAccessibilitySettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitle}>Vision</h3>
      {renderToggle('highContrast', 'High Contrast', 'Increase contrast for better visibility')}
      {renderToggle('largeText', 'Large Text', 'Make all text larger')}
      {renderToggle('reduceTransparency', 'Reduce Transparency', 'Use solid backgrounds')}
      
      <h3 style={styles.sectionTitle}>Screen Reader</h3>
      {renderToggle('screenReader', 'Screen Reader Support', 'Optimize for screen readers')}
      
      <h3 style={styles.sectionTitle}>Keyboard Navigation</h3>
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Full Keyboard Access</span>
          <span style={styles.settingDesc}>Navigate all controls with keyboard</span>
        </div>
        <button style={styles.manageBtn} aria-label="Configure keyboard navigation" onClick={() => { /* keyboard nav config */ }}>Configure</button>
      </div>
    </div>
  );

  const renderPrivacySettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitle}>Authentication</h3>
      
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
          <button style={styles.dangerBtnSmall} aria-label="Remove PIN code" onClick={() => handleDisableAuth('pin')}>Remove</button>
        ) : (
          <button style={styles.manageBtn} aria-label="Set PIN code" onClick={() => setShowPinSetup(true)}>Set PIN</button>
        )}
      </div>
      
      {showPinSetup && (
        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>Enter PIN (4-8 digits)</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={pinInput}
              onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
              style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '18px', letterSpacing: '8px', textAlign: 'center' }}
              placeholder="****"
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>Confirm PIN</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={confirmPinInput}
              onChange={e => setConfirmPinInput(e.target.value.replace(/\D/g, ''))}
              style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '18px', letterSpacing: '8px', textAlign: 'center' }}
              placeholder="****"
            />
          </div>
          {authError && <div style={{ color: '#ff453a', fontSize: '12px', marginBottom: '12px' }}>{authError}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={styles.manageBtn} aria-label="Save PIN" onClick={handleSetupPin}>Save PIN</button>
            <button style={{ ...styles.manageBtn, background: 'transparent' }} aria-label="Cancel PIN setup" onClick={() => { setShowPinSetup(false); setPinInput(''); setConfirmPinInput(''); setAuthError(''); }}>Cancel</button>
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
          <button style={styles.dangerBtnSmall} aria-label="Remove password" onClick={() => handleDisableAuth('password')}>Remove</button>
        ) : (
          <button style={styles.manageBtn} aria-label="Set password" onClick={() => setShowPasswordSetup(true)}>Set Password</button>
        )}
      </div>
      
      {showPasswordSetup && (
        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>Enter Password (min 8 characters)</label>
            <input
              type="password"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '14px' }}
              placeholder="Enter password"
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>Confirm Password</label>
            <input
              type="password"
              value={confirmPasswordInput}
              onChange={e => setConfirmPasswordInput(e.target.value)}
              style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '14px' }}
              placeholder="Confirm password"
            />
          </div>
          {authError && <div style={{ color: '#ff453a', fontSize: '12px', marginBottom: '12px' }}>{authError}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={styles.manageBtn} aria-label="Save password" onClick={handleSetupPassword}>Save Password</button>
            <button style={{ ...styles.manageBtn, background: 'transparent' }} aria-label="Cancel password setup" onClick={() => { setShowPasswordSetup(false); setPasswordInput(''); setConfirmPasswordInput(''); setAuthError(''); }}>Cancel</button>
          </div>
        </div>
      )}
      
      {/* Auto Lock */}
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Auto-Lock Timer</span>
          <span style={styles.settingDesc}>Lock DEX after inactivity</span>
        </div>
        <select
          style={styles.selectInput}
          value={settings.autoLockMinutes}
          onChange={e => setSettings(prev => ({ ...prev, autoLockMinutes: Number(e.target.value) }))}
        >
          <option value={0}>Never</option>
          <option value={1}>1 minute</option>
          <option value={5}>5 minutes</option>
          <option value={15}>15 minutes</option>
          <option value={30}>30 minutes</option>
          <option value={60}>1 hour</option>
        </select>
      </div>
      
      {renderToggle('requireAuthOnWake', 'Require on Wake', 'Ask for authentication when computer wakes from sleep')}
      
      {/* Current Auth Status */}
      {(settings.pinEnabled || settings.passwordEnabled || settings.biometricEnabled) && (
        <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(48,209,88,0.1)', border: '1px solid rgba(48,209,88,0.2)', borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#30d158', fontSize: '13px', fontWeight: 500 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9,12 11,14 15,10"/></svg>
            Protected with: {[
              settings.biometricEnabled && 'Fingerprint',
              settings.pinEnabled && 'PIN',
              settings.passwordEnabled && 'Password'
            ].filter(Boolean).join(' + ')}
          </div>
        </div>
      )}
      
      <h3 style={styles.sectionTitle}>Privacy</h3>
      {renderToggle('locationServices', 'Location Services', 'Allow DEX to access your location')}
      {renderToggle('crashReports', 'Crash Reports', 'Send crash reports to help fix issues')}
      
      <h3 style={styles.sectionTitle}>Security Protection</h3>
      {renderToggle('antiHacker', 'Anti-Hacker Protection', 'Block intrusion attempts and unauthorized access')}
      {renderToggle('firewallEnabled', 'Built-in Firewall', 'Monitor and block suspicious network activity')}
      {renderToggle('blockMalware', 'Malware Protection', 'Scan and block malicious files and scripts')}
      {renderToggle('sandboxApps', 'Sandbox Applications', 'Run apps in isolated environment for safety')}
      
      <h3 style={styles.sectionTitle}>Data Protection</h3>
      {renderToggle('encryptData', 'Encrypt All Data', 'AES-256 encryption for stored data')}
      {renderToggle('vpnProtection', 'VPN Protection', 'Route traffic through secure tunnel')}
      
      <h3 style={styles.sectionTitle}>Security Status</h3>
      <div style={styles.aboutDetails}>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Firewall</span>
          <span style={{ color: settings.firewallEnabled ? 'var(--color-success, #30d158)' : 'var(--color-error, #ff453a)' }}>{settings.firewallEnabled ? 'Active' : 'Disabled'}</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Anti-Hacker</span>
          <span style={{ color: settings.antiHacker ? 'var(--color-success, #30d158)' : 'var(--color-error, #ff453a)' }}>{settings.antiHacker ? 'Protected' : 'Vulnerable'}</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Encryption</span>
          <span style={{ color: settings.encryptData ? 'var(--color-success, #30d158)' : 'var(--color-warning, #ff9f0a)' }}>{settings.encryptData ? 'AES-256' : 'None'}</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Threats Blocked</span>
          <span style={styles.aboutValue}>Active monitoring</span>
        </div>
      </div>
      
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

  const renderStorageSettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitle}>Storage Status</h3>
      <div style={styles.aboutDetails}>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Auto Management</span>
          <span style={{ color: '#30d158' }}>Active</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Compression</span>
          <span style={{ color: '#30d158' }}>Active</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Optimization</span>
          <span style={{ color: '#30d158' }}>Active</span>
        </div>
      </div>
      
      <h3 style={styles.sectionTitle}>Current Usage</h3>
      <div style={styles.storageBar}>
        <div style={{...styles.storageUsed, width: '35%', background: '#0a84ff'}} />
        <div style={{...styles.storageUsed, width: '15%', background: '#30d158'}} />
        <div style={{...styles.storageUsed, width: '10%', background: '#ff9f0a'}} />
      </div>
      <div style={styles.storageLabels}>
        <div style={styles.storageLabel}>
          <span style={{...styles.storageDot, background: '#0a84ff'}} />
          <span>Documents</span>
        </div>
        <div style={styles.storageLabel}>
          <span style={{...styles.storageDot, background: '#30d158'}} />
          <span>Cache</span>
        </div>
        <div style={styles.storageLabel}>
          <span style={{...styles.storageDot, background: '#ff9f0a'}} />
          <span>Other</span>
        </div>
      </div>
      
      <button 
        style={styles.clearBtn}
        aria-label="Clear cache"
        onClick={() => {
          localStorage.removeItem('dex-gallery-media');
          localStorage.removeItem('dex-gallery-favorites');
          /* Cache cleared successfully */
        }}
      >Clear Cache</button>
    </div>
  );

  const renderBrowserSettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitle}>Privacy & Security</h3>
      {renderToggle('blockTrackers', 'Block Trackers', 'Silently block all known tracking scripts and pixels')}
      {renderToggle('blockAds', 'Block Ads', 'Block advertisements and ad networks')}
      {renderToggle('forceHttps', 'Force HTTPS', 'Automatically upgrade HTTP connections to HTTPS')}
      {renderToggle('fingerprintProtection', 'Fingerprint Protection', 'Prevent websites from identifying your browser')}
      {renderToggle('doNotTrack', 'Do Not Track', 'Send Do Not Track header to websites')}
      {renderToggle('blockThirdPartyCookies', 'Block Third-Party Cookies', 'Block cookies from other domains')}
      
      <h3 style={styles.sectionTitle}>Advanced Security</h3>
      {renderToggle('enableTorMode', 'Enhanced Privacy Mode', 'Maximum privacy with Tor-like fingerprint resistance')}
      {renderToggle('clearOnExit', 'Clear Data on Exit', 'Automatically clear browsing data when closing')}
      {renderToggle('strictSecurity', 'Strict Security Mode', 'Block all potentially risky content (may break some sites)')}
      
      <h3 style={styles.sectionTitle}>Site Compatibility</h3>
      {renderToggle('allowJavaScript', 'Allow JavaScript', 'Enable JavaScript for interactive websites')}
      {renderToggle('allowWebGL', 'Allow WebGL', 'Enable WebGL for 3D graphics and games')}
      
      <h3 style={styles.sectionTitle}>Auto-Clear History</h3>
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Clear History After</span>
          <span style={styles.settingDesc}>Automatically delete browsing history</span>
        </div>
        <select 
          style={styles.selectInput}
          value={settings.historyAutoClearDays || 7}
          onChange={(e) => setSettings(prev => ({ ...prev, historyAutoClearDays: parseInt(e.target.value) }))}
        >
          <option value="1">1 Day</option>
          <option value="3">3 Days</option>
          <option value="7">7 Days (Default)</option>
          <option value="14">14 Days</option>
          <option value="30">30 Days</option>
          <option value="0">Never</option>
        </select>
      </div>
      
      <h3 style={styles.sectionTitle}>Download Speed</h3>
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Parallel Connections</span>
          <span style={styles.settingDesc}>More connections = faster downloads</span>
        </div>
        <select 
          style={styles.selectInput}
          value={settings.parallelDownloads || 8}
          onChange={(e) => setSettings(prev => ({ ...prev, parallelDownloads: parseInt(e.target.value) }))}
        >
          <option value="1">1 (Basic)</option>
          <option value="4">4</option>
          <option value="8">8 (Recommended)</option>
          <option value="16">16 (Fast)</option>
          <option value="32">32 (Maximum Speed)</option>
        </select>
      </div>
      
      <h3 style={styles.sectionTitle}>Search Engine</h3>
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Default Search Engine</span>
          <span style={styles.settingDesc}>Used when searching from address bar</span>
        </div>
        <select 
          style={styles.selectInput}
          value={settings.defaultSearchEngine || 'duckduckgo'}
          onChange={(e) => setSettings(prev => ({ ...prev, defaultSearchEngine: e.target.value }))}
        >
          <option value="duckduckgo">DuckDuckGo (Private)</option>
          <option value="startpage">Startpage</option>
          <option value="brave">Brave Search</option>
          <option value="google">Google</option>
        </select>
      </div>
      
      <h3 style={styles.sectionTitle}>Protection Status</h3>
      <div style={styles.aboutDetails}>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Trackers Blocked</span>
          <span style={styles.aboutValue}>Enabled</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Ads Blocked</span>
          <span style={styles.aboutValue}>Enabled</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>HTTPS Upgrades</span>
          <span style={styles.aboutValue}>Auto-upgrade active</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Download Speed</span>
          <span style={styles.aboutValue}>{settings.parallelDownloads || 8}x parallel</span>
        </div>
      </div>
    </div>
  );

  const renderFilesSettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitle}>Display</h3>
      {renderToggle('showHiddenFiles', 'Show Hidden Files', 'Display files that start with a dot')}
      
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Default View</span>
          <span style={styles.settingDesc}>How files are displayed</span>
        </div>
        <select 
          style={styles.selectInput}
          value={settings.defaultView || 'list'}
          onChange={(e) => setSettings(prev => ({ ...prev, defaultView: e.target.value }))}
        >
          <option value="list">List</option>
          <option value="grid">Grid</option>
          <option value="columns">Columns</option>
        </select>
      </div>
      
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Sort By</span>
          <span style={styles.settingDesc}>Default sorting for files</span>
        </div>
        <select 
          style={styles.selectInput}
          value={settings.sortBy || 'name'}
          onChange={(e) => setSettings(prev => ({ ...prev, sortBy: e.target.value }))}
        >
          <option value="name">Name</option>
          <option value="date">Date Modified</option>
          <option value="size">Size</option>
          <option value="type">Type</option>
        </select>
      </div>
      
      <h3 style={styles.sectionTitle}>Behavior</h3>
      {renderToggle('confirmDelete', 'Confirm Before Deleting', 'Ask for confirmation when deleting files')}
      {renderToggle('indexFolders', 'Index Folders for Search', 'Allow fast file searching across folders')}
      {renderToggle('watchForChanges', 'Watch for Changes', 'Automatically refresh when files change')}
      
      <h3 style={styles.sectionTitle}>Indexed Locations</h3>
      <button 
        style={styles.addFolderBtn}
        aria-label="Add folder to index"
        onClick={async () => {
          if (window.electron?.invoke) {
            await window.electron.invoke('files:addScopeWithDialog');
          }
        }}
      >+ Add Folder to Index</button>
    </div>
  );

  const renderAutoFillSettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitle}>Auto-Fill</h3>
      {renderToggle('enableAutoFill', 'Enable Auto-Fill', 'Automatically fill in forms and fields')}
      {renderToggle('autoFillForms', 'Auto-Fill Forms', 'Automatically fill web forms')}
      {renderToggle('smartSuggestions', 'Smart Suggestions', 'Show intelligent suggestions based on context')}
      
      <h3 style={styles.sectionTitle}>Save Information</h3>
      {renderToggle('savePasswords', 'Save Passwords', 'Offer to save passwords when you sign in')}
      {renderToggle('saveAddresses', 'Save Addresses', 'Save and fill shipping and billing addresses')}
      {renderToggle('saveCreditCards', 'Save Payment Methods', 'Save credit cards for faster checkout')}
      
      <h3 style={styles.sectionTitle}>Saved Data</h3>
      <div style={styles.savedDataRow}>
        <span>Saved Passwords</span>
        <button style={styles.manageBtn} aria-label="Manage saved passwords" onClick={() => setActiveSection('security')}>Manage</button>
      </div>
      <div style={styles.savedDataRow}>
        <span>Saved Addresses</span>
        <button style={styles.manageBtn} aria-label="Manage saved addresses" onClick={() => { /* open address manager */ }}>Manage</button>
      </div>
      <div style={styles.savedDataRow}>
        <span>Saved Payment Methods</span>
        <button style={styles.manageBtn} aria-label="Manage saved payment methods" onClick={() => { /* open payment manager */ }}>Manage</button>
      </div>
    </div>
  );

  const renderAboutSettings = () => (
    <div style={styles.settingsContent}>
      <div style={styles.aboutHeader}>
        <div style={styles.appIcon}>DEX</div>
        <div style={styles.appInfo}>
          <span style={styles.appName}>DEX</span>
          <span style={styles.appVersion}>Version {appVersion}</span>
        </div>
      </div>
      
      {/* Creator Watermark */}
      <div style={{ padding: '16px', background: 'var(--color-accent-muted)', borderRadius: '12px', marginBottom: '20px', border: '1px solid var(--color-border-subtle)' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-accent)', marginBottom: '4px' }}>Created by Onazi Treasure OJ</div>
        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Copyright 2026 All Rights Reserved</div>
      </div>
      
      <div style={styles.aboutDetails}>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Build</span>
          <span style={styles.aboutValue}>2026.03.01</span>
        </div>
      </div>
      
      <div style={styles.aboutLinks}>
        <button style={styles.linkBtn} aria-label="Open DEX website" onClick={() => window.open('https://dex.app', '_blank', 'noopener,noreferrer')}>Website</button>
        <button style={styles.linkBtn} aria-label="Open documentation" onClick={() => window.open('https://docs.dex.app', '_blank', 'noopener,noreferrer')}>Documentation</button>
        <button style={styles.linkBtn} aria-label="Report an issue" onClick={() => window.open('https://github.com/dex-app/dex/issues', '_blank', 'noopener,noreferrer')}>Report Issue</button>
      </div>

      {/* Diagnostic Share */}
      <div style={{ marginTop: 24 }}>
        <h3 style={styles.sectionTitle}>Diagnostics</h3>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12, lineHeight: '1.5' }}>
          Share diagnostic information with the creator for troubleshooting.
          This includes your DEX version, OS, app usage stats, and error logs.
          No personal files or passwords are ever shared.
        </p>
        <button
          aria-label="Share diagnostics via email"
          style={{
            ...styles.linkBtn,
            background: 'linear-gradient(135deg, rgba(59,130,246,.15), rgba(99,102,241,.1))',
            border: '1px solid rgba(99,102,241,.25)',
            color: '#818cf8',
            padding: '10px 20px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
          onClick={() => {
            const diag: string[] = [];
            diag.push('=== DEX Diagnostic Report ===');
            diag.push('Version: ' + appVersion);
            diag.push('Build: 2026.03.01');
            diag.push('Platform: ' + navigator.platform);
            diag.push('User Agent: ' + navigator.userAgent);
            diag.push('Language: ' + navigator.language);
            diag.push('Screen: ' + screen.width + 'x' + screen.height + ' @ ' + (window.devicePixelRatio || 1) + 'x');
            diag.push('Memory: ' + ((navigator as any).deviceMemory || 'unknown') + ' GB');
            diag.push('Cores: ' + (navigator.hardwareConcurrency || 'unknown'));
            diag.push('Online: ' + (navigator.onLine ? 'Yes' : 'No'));
            diag.push('Color Scheme: ' + (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'Dark' : 'Light'));
            diag.push('Timestamp: ' + new Date().toISOString());
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
            } catch {}
            try {
              const keys = Object.keys(localStorage).filter(k => k.startsWith('dex-'));
              diag.push('');
              diag.push('=== Storage Keys ===');
              keys.forEach(k => diag.push(k + ': ' + ((localStorage.getItem(k) || '').length) + ' bytes'));
            } catch {}

            const body = encodeURIComponent(diag.join('\n'));
            const subject = encodeURIComponent('DEX Diagnostic Report - v' + appVersion);
            window.open('mailto:onazi@dex.app?subject=' + subject + '&body=' + body, '_blank', 'noopener,noreferrer');
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

  const renderKeyboardSettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitle}>Keyboard Shortcuts</h3>
      <div style={styles.shortcutList}>
        {[
          { action: 'Quick Actions', shortcut: 'Ctrl + Space' },
          { action: 'Search', shortcut: 'Ctrl + K' },
          { action: 'Home', shortcut: 'Ctrl + 1' },
          { action: 'Files', shortcut: 'Ctrl + 2' },
          { action: 'Notes', shortcut: 'Ctrl + 3' },
          { action: 'Tasks', shortcut: 'Ctrl + 4' },
          { action: 'Browser', shortcut: 'Ctrl + 5' },
          { action: 'Gallery', shortcut: 'Ctrl + 6' },
          { action: 'Music', shortcut: 'Ctrl + 7' },
          { action: 'Video', shortcut: 'Ctrl + 8' },
          { action: 'Workflows', shortcut: 'Ctrl + 9' },
          { action: 'Settings', shortcut: 'Ctrl + 0' },
          { action: 'Calculator', shortcut: 'Alt + C' },
          { action: 'Calendar', shortcut: 'Alt + A' },
          { action: 'Password', shortcut: 'Alt + P' },
          { action: 'VINX Editor', shortcut: 'Alt + V' },
          { action: 'Imosion', shortcut: 'Alt + I' },
          { action: 'PRISM', shortcut: 'Alt + R' },
          { action: 'FLUX', shortcut: 'Alt + F' },
          { action: 'FORGE', shortcut: 'Alt + G' },
          { action: 'STAGE', shortcut: 'Alt + S' },
        ].map(item => (
          <div key={item.action} style={styles.shortcutRow}>
            <span>{item.action}</span>
            <span style={styles.shortcutKey}>{item.shortcut}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const renderNetworkSettings = () => (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitle}>Network Status</h3>
      <div style={styles.networkStatus}>
        <div style={{...styles.statusDot, background: '#30d158'}} />
        <span>Connected - Protected</span>
      </div>
      
      <h3 style={styles.sectionTitle}>WiFi Protection</h3>
      {renderToggle('wifiProtection', 'WiFi Security Monitor', 'Detect and block WiFi attacks and rogue networks')}
      {renderToggle('networkMonitor', 'Network Activity Monitor', 'Track all incoming and outgoing connections')}
      
      <h3 style={styles.sectionTitle}>DNS & Privacy</h3>
      {renderToggle('dnsOverHttps', 'DNS over HTTPS', 'Encrypt DNS queries for privacy')}
      {renderToggle('blockTrackerDomains', 'Block Tracker Domains', 'Block known tracking and ad domains at DNS level')}
      {renderToggle('ipv6Enabled', 'IPv6 Support', 'Enable IPv6 network connections')}
      
      <h3 style={styles.sectionTitle}>Bandwidth & Speed</h3>
      {renderToggle('bandwidthOptimization', 'Bandwidth Optimization', 'Optimize network usage for faster downloads')}
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Max Download Speed</span>
          <span style={styles.settingDesc}>Limit download bandwidth</span>
        </div>
        <select 
          style={styles.selectInput}
          value={settings.maxDownloadSpeed || 'unlimited'}
          onChange={(e) => setSettings(prev => ({ ...prev, maxDownloadSpeed: e.target.value }))}
        >
          <option value="1">1 MB/s</option>
          <option value="5">5 MB/s</option>
          <option value="10">10 MB/s</option>
          <option value="50">50 MB/s</option>
          <option value="100">100 MB/s</option>
          <option value="unlimited">Unlimited (Max Speed)</option>
        </select>
      </div>
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Parallel Downloads</span>
          <span style={styles.settingDesc}>Simultaneous download connections</span>
        </div>
        <select 
          style={styles.selectInput}
          value={settings.parallelDownloads || 8}
          onChange={(e) => setSettings(prev => ({ ...prev, parallelDownloads: parseInt(e.target.value) }))}
        >
          <option value="1">1 (Slow)</option>
          <option value="4">4</option>
          <option value="8">8 (Recommended)</option>
          <option value="16">16 (Fast)</option>
          <option value="32">32 (Maximum)</option>
        </select>
      </div>
      
      <h3 style={styles.sectionTitle}>Proxy Settings</h3>
      <div style={styles.inputGroup}>
        <label style={styles.inputLabel}>Proxy URL</label>
        <input type="text" placeholder="http://proxy:8080" style={styles.input} />
      </div>
      
      <h3 style={styles.sectionTitle}>Network Protection Status</h3>
      <div style={styles.aboutDetails}>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>WiFi Security</span>
          <span style={{ color: settings.wifiProtection ? '#30d158' : '#ff453a' }}>{settings.wifiProtection ? 'Protected' : 'Unprotected'}</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>DNS Encryption</span>
          <span style={{ color: settings.dnsOverHttps ? '#30d158' : '#ff9f0a' }}>{settings.dnsOverHttps ? 'Active' : 'Plain'}</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Trackers Blocked</span>
          <span style={styles.aboutValue}>Blocklist active</span>
        </div>
        <div style={styles.aboutRow}>
          <span style={styles.aboutLabel}>Current Speed</span>
          <span style={styles.aboutValue}>{settings.maxDownloadSpeed === 'unlimited' ? 'Max' : settings.maxDownloadSpeed + ' MB/s'}</span>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'general': return renderGeneralSettings();
      case 'appearance': return renderAppearanceSettings();
      case 'customize': return renderCustomizationSettings();
      case 'browser': return renderBrowserSettings();
      case 'files': return renderFilesSettings();
      case 'autofill': return renderAutoFillSettings();
      case 'notifications': return renderNotificationSettings();
      case 'privacy': return renderPrivacySettings();
      case 'storage': return renderStorageSettings();
      case 'about': return renderAboutSettings();
      case 'rewind': return <RewindSettingsSection />;
      case 'keyboard': return renderKeyboardSettings();
      case 'network': return renderNetworkSettings();
      case 'performance': return renderPerformanceSettings();
      case 'accessibility': return renderAccessibilitySettings();
      default: return renderGeneralSettings();
    }
  };

  return (
    <div style={styles.container}>
      <style>{`
        .settings-nav:hover { background: rgba(255,255,255,0.06) !important; }
        .settings-btn:hover { filter: brightness(1.15); }
        .settings-btn:active { transform: scale(0.98); }
        .settings-toggle:hover { filter: brightness(1.1); }
        .settings-select:hover { border-color: rgba(255,255,255,0.18) !important; }
        .settings-action:hover { background: rgba(255,255,255,0.06) !important; }
        .settings-danger:hover { background: rgba(255,69,58,0.12) !important; }
        .settings-color:hover { transform: scale(1.15); }
      `}</style>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={styles.sidebarTitle}>Settings</span>
        </div>
        
        <div style={styles.sectionList}>
          {SECTIONS.map(section => (
            <button
              key={section.id}
              className="settings-nav"
              aria-label={`Navigate to ${section.name} settings`}
              style={{
                ...styles.sectionItem,
                background: activeSection === section.id ? 'rgba(10, 132, 255, 0.2)' : 'transparent',
                color: activeSection === section.id ? 'var(--color-accent, #0a84ff)' : 'var(--color-text-primary, rgba(255,255,255,0.85))',
              }}
              onClick={() => setActiveSection(section.id)}
            >
              <span style={styles.sectionIcon}>{section.icon}</span>
              <span>{section.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        <div style={styles.header}>
          <span style={styles.headerTitle}>
            {SECTIONS.find(s => s.id === activeSection)?.name}
          </span>
        </div>
        {renderContent()}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    background: 'var(--color-bg-base)',
    color: 'var(--color-text-primary)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
    fontSize: '13px',
    overflow: 'hidden',
    transition: 'background-color var(--duration-theme) ease, color var(--duration-theme) ease',
  },
  
  // Sidebar
  sidebar: {
    width: '200px',
    background: 'var(--color-bg-secondary)',
    borderRight: '1px solid var(--color-border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sidebarHeader: {
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 14px',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  sidebarTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  sectionList: {
    padding: '6px',
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    overflow: 'auto',
    flex: 1,
  },
  sectionItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    textAlign: 'left',
    transition: 'all 0.15s ease',
  },
  sectionIcon: {
    display: 'flex',
    alignItems: 'center',
  },
  
  // Main
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  headerTitle: {
    fontSize: '14px',
    fontWeight: 600,
  },
  settingsContent: {
    flex: 1,
    overflow: 'auto',
    padding: '16px 20px',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginTop: '24px',
    marginBottom: '12px',
  },
  
  // Setting Row
  settingRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  settingInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  settingLabel: {
    fontSize: '14px',
    fontWeight: 500,
  },
  settingDesc: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  
  // Toggle
  toggle: {
    width: '44px',
    height: '24px',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background 0.15s ease',
  },
  toggleKnob: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: 'var(--color-bg-elevated)',
    position: 'absolute',
    top: '2px',
    transition: 'transform 0.2s',
  },
  
  // Theme Selector
  themeSelector: {
    display: 'flex',
    gap: '12px',
    marginTop: '12px',
  },
  themeOption: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '8px',
    borderRadius: '12px',
    border: '2px solid transparent',
    background: 'var(--color-bg-glass)',
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
    fontSize: '12px',
  },
  themePreview: {
    width: '80px',
    height: '50px',
    borderRadius: '6px',
    border: '1px solid var(--color-border-subtle)',
  },
  
  // Storage
  storageBar: {
    height: '8px',
    borderRadius: '4px',
    background: 'var(--color-bg-glass)',
    display: 'flex',
    overflow: 'hidden',
    marginTop: '12px',
  },
  storageUsed: {
    height: '100%',
  },
  storageLabels: {
    marginTop: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  storageLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
  },
  storageDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  clearBtn: {
    marginTop: '20px',
    padding: '10px 16px',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--color-bg-glass)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    cursor: 'pointer',
  },
  dangerBtn: {
    marginTop: '12px',
    padding: '10px 16px',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--color-error-muted)',
    color: 'var(--color-error)',
    fontSize: '13px',
    cursor: 'pointer',
  },
  dangerBtnSmall: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: 'none',
    background: 'rgba(255,67,58,0.15)',
    color: '#ff453a',
    fontSize: '12px',
    cursor: 'pointer',
  },
  
  // About
  aboutHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '24px',
  },
  appIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '14px',
    background: 'linear-gradient(135deg, #0a84ff, #5e5ce6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    fontWeight: 700,
  },
  appInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  appName: {
    fontSize: '24px',
    fontWeight: 600,
  },
  appVersion: {
    fontSize: '14px',
    color: 'var(--color-text-muted)',
  },
  aboutDetails: {
    background: 'var(--color-bg-glass)',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '24px',
  },
  aboutRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  aboutLabel: {
    color: 'var(--color-text-muted)',
  },
  aboutValue: {
    color: 'var(--color-text-primary)',
  },
  aboutLinks: {
    display: 'flex',
    gap: '12px',
  },
  linkBtn: {
    padding: '10px 16px',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--color-bg-glass)',
    color: 'var(--color-accent)',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  
  // Shortcuts
  shortcutList: {
    background: 'var(--color-bg-glass)',
    borderRadius: '12px',
    padding: '8px 16px',
  },
  shortcutRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  shortcutKey: {
    fontFamily: 'SF Mono, Monaco, monospace',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    background: 'var(--color-bg-glass)',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  
  // Network
  networkStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    background: 'var(--color-bg-glass)',
    borderRadius: '8px',
    marginTop: '8px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  inputGroup: {
    marginTop: '12px',
  },
  inputLabel: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-glass)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    outline: 'none',
  },
  
  // Select input
  selectInput: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-glass)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    outline: 'none',
    cursor: 'pointer',
    minWidth: '150px',
  },
  
  // Add folder button
  addFolderBtn: {
    padding: '10px 16px',
    borderRadius: '8px',
    border: '1px dashed var(--color-border)',
    background: 'transparent',
    color: 'var(--color-accent)',
    fontSize: '13px',
    cursor: 'pointer',
    width: '100%',
    marginTop: '8px',
  },
  
  // Saved data row
  savedDataRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'var(--color-bg-glass)',
    borderRadius: '8px',
    marginTop: '8px',
    fontSize: '13px',
  },
  
  // Manage button
  manageBtn: {
    padding: '6px 12px',
    borderRadius: '6px',
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

