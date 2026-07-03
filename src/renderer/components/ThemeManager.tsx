// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Theme Manager
 * Advanced theme customization with accent colors and presets
 */
import React, { useState, useEffect, useCallback } from 'react';
import { applyAccentFamily } from '../utils/accentFamily';

// Theme presets
export interface ThemePreset {
  id: string;
  name: string;
  isDark: boolean;
  accentColor: string;
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'dark-default',
    name: 'Dark Default',
    isDark: true,
    accentColor: '', // empty = defer to the stylesheet baseline accent (Omnitrix green)
    bgPrimary: '#18181b',
    bgSecondary: '#111113',
    bgTertiary: '#27272a',
    textPrimary: '#fafafa',
    textSecondary: '#a1a1aa',
    border: '#27272a',
  },
  {
    id: 'dark-purple',
    name: 'Dark Purple',
    isDark: true,
    accentColor: '#a855f7',
    bgPrimary: '#1a1625',
    bgSecondary: '#130f1d',
    bgTertiary: '#2d2640',
    textPrimary: '#faf5ff',
    textSecondary: '#c4b5fd',
    border: '#3b2d5a',
  },
  {
    id: 'dark-green',
    name: 'Dark Emerald',
    isDark: true,
    accentColor: '#10b981',
    bgPrimary: '#141f1a',
    bgSecondary: '#0c1512',
    bgTertiary: '#1e302a',
    textPrimary: '#f0fdf4',
    textSecondary: '#86efac',
    border: '#2d4a40',
  },
  {
    id: 'dark-orange',
    name: 'Dark Orange',
    isDark: true,
    accentColor: '#f97316',
    bgPrimary: '#1c1714',
    bgSecondary: '#140f0c',
    bgTertiary: '#2d2318',
    textPrimary: '#fff7ed',
    textSecondary: '#fdba74',
    border: '#4a3520',
  },
  {
    id: 'dark-rose',
    name: 'Dark Rose',
    isDark: true,
    accentColor: '#f43f5e',
    bgPrimary: '#1c1418',
    bgSecondary: '#140c10',
    bgTertiary: '#2d1c24',
    textPrimary: '#fff1f2',
    textSecondary: '#fda4af',
    border: '#4a2030',
  },
  {
    id: 'light-default',
    name: 'Light Default',
    isDark: false,
    accentColor: '', // empty = defer to the stylesheet baseline accent
    bgPrimary: '#ffffff',
    bgSecondary: '#f8fafc',
    bgTertiary: '#e2e8f0',
    textPrimary: '#1e293b',
    textSecondary: '#64748b',
    border: '#e2e8f0',
  },
  {
    id: 'light-warm',
    name: 'Light Warm',
    isDark: false,
    accentColor: '#f59e0b',
    bgPrimary: '#fffbeb',
    bgSecondary: '#fef3c7',
    bgTertiary: '#fde68a',
    textPrimary: '#451a03',
    textSecondary: '#92400e',
    border: '#fcd34d',
  },
  {
    id: 'light-blue',
    name: 'Light Blue',
    isDark: false,
    accentColor: '#0ea5e9',
    bgPrimary: '#f0f9ff',
    bgSecondary: '#e0f2fe',
    bgTertiary: '#bae6fd',
    textPrimary: '#0c4a6e',
    textSecondary: '#0369a1',
    border: '#7dd3fc',
  },
];

// Accent color options
export const ACCENT_COLORS = [
  { id: 'blue', color: '#3b82f6', name: 'Blue' },
  { id: 'purple', color: '#a855f7', name: 'Purple' },
  { id: 'pink', color: '#ec4899', name: 'Pink' },
  { id: 'red', color: '#ef4444', name: 'Red' },
  { id: 'orange', color: '#f97316', name: 'Orange' },
  { id: 'amber', color: '#f59e0b', name: 'Amber' },
  { id: 'green', color: '#22c55e', name: 'Green' },
  { id: 'teal', color: '#14b8a6', name: 'Teal' },
  { id: 'cyan', color: '#06b6d4', name: 'Cyan' },
  { id: 'indigo', color: '#6366f1', name: 'Indigo' },
];

// Apply theme to document
export const applyTheme = (preset: ThemePreset) => {
  const root = document.documentElement;
  
  // Expand the preset accent into the full coherent --color-accent-* family
  // (shared deriver) rather than only the base, so hover/dark/light/soft/muted
  // track the chosen colour. An empty accent means "defer to the stylesheet
  // baseline": clear any inline family instead of forcing a colour.
  if (!preset.accentColor || !applyAccentFamily(preset.accentColor)) {
    for (const prop of ['--color-accent', '--accent-color', '--color-accent-hover', '--color-accent-dark', '--color-accent-light', '--color-accent-soft', '--color-accent-muted']) {
      root.style.removeProperty(prop);
    }
  }
  root.style.setProperty('--color-bg-primary', preset.bgPrimary);
  root.style.setProperty('--color-bg-secondary', preset.bgSecondary);
  root.style.setProperty('--color-bg-tertiary', preset.bgTertiary);
  root.style.setProperty('--color-text-primary', preset.textPrimary);
  root.style.setProperty('--color-text-secondary', preset.textSecondary);
  root.style.setProperty('--color-border', preset.border);
  
  if (preset.isDark) {
    root.setAttribute('data-theme', 'dark');
    document.body.classList.add('dark-mode');
  } else {
    root.setAttribute('data-theme', 'light');
    document.body.classList.remove('dark-mode');
  }
  
  // Save to localStorage
  localStorage.setItem('dex-theme-preset', preset.id);
  localStorage.setItem('dex-dark-mode', String(preset.isDark));
  localStorage.setItem('dex-accent-color', preset.accentColor);
};

// Apply just the accent colour as the full coherent --color-accent-* family.
// Delegates to the shared deriver (one source of truth for accent expansion).
export const applyAccentColor = (color: string) => {
  applyAccentFamily(color);
  try { localStorage.setItem('dex-accent-color', color); } catch { /* quota */ }
};

// Get current theme from localStorage
export const getCurrentTheme = (): ThemePreset => {
  try {
    const presetId = localStorage.getItem('dex-theme-preset');
    if (presetId) {
      const preset = THEME_PRESETS.find(p => p.id === presetId);
      if (preset) return preset;
    }
    
    // Fall back to dark/light detection. No stored accent = defer to the
    // stylesheet baseline (empty), never force a hardcoded colour at boot.
    const isDark = localStorage.getItem('dex-dark-mode') !== 'false';
    const accentColor = localStorage.getItem('dex-accent-color') || '';
    
    const basePreset = isDark ? THEME_PRESETS[0] : THEME_PRESETS[5];
    return { ...basePreset, accentColor };
  } catch {
    return THEME_PRESETS[0];
  }
};

// Initialize theme on app load
export const initializeTheme = () => {
  // One-time migration: the old applyTheme auto-saved the hardcoded '#3b82f6'
  // default on every boot, so installs carry it without the user ever choosing
  // it. Clear that stored value once so the stylesheet baseline (Omnitrix
  // green) becomes the effective default; deliberate accent picks survive.
  try {
    if (!localStorage.getItem('dex-accent-omnitrix-migrated')) {
      if (localStorage.getItem('dex-accent-color') === '#3b82f6') {
        localStorage.removeItem('dex-accent-color');
      }
      localStorage.setItem('dex-accent-omnitrix-migrated', '1');
    }
  } catch { /* quota/unavailable */ }
  const theme = getCurrentTheme();
  applyTheme(theme);
};

// Toggle between dark and light theme
export const toggleTheme = () => {
  const current = getCurrentTheme();
  const isDark = current.isDark;
  
  // Find corresponding theme in opposite mode
  const newPreset = isDark ? THEME_PRESETS[5] : THEME_PRESETS[0];
  applyTheme({ ...newPreset, accentColor: current.accentColor });
};

// Icons
const Icons = {
  sun: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  moon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  palette: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/><circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/><circle cx="6.5" cy="12.5" r="0.5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"/></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
  x: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

// Theme Manager Panel
interface ThemeManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThemeManager: React.FC<ThemeManagerProps> = ({ isOpen, onClose }) => {
  const [currentTheme, setCurrentTheme] = useState<ThemePreset>(getCurrentTheme());
  const [tab, setTab] = useState<'presets' | 'colors'>('presets');

  const handleApplyPreset = useCallback((preset: ThemePreset) => {
    applyTheme(preset);
    setCurrentTheme(preset);
  }, []);

  const handleApplyAccent = useCallback((color: string) => {
    applyAccentColor(color);
    setCurrentTheme(prev => ({ ...prev, accentColor: color }));
  }, []);

  const toggleDarkMode = useCallback(() => {
    const isDark = !currentTheme.isDark;
    const newPreset = isDark ? THEME_PRESETS[0] : THEME_PRESETS[5];
    handleApplyPreset({ ...newPreset, accentColor: currentTheme.accentColor });
  }, [currentTheme, handleApplyPreset]);

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onMouseDown={onClose} role="presentation"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      tabIndex={-1}
      ref={(el) => el?.focus()}
    >
      <div style={styles.panel} onMouseDown={e => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.headerTitle}>
            {Icons.palette}
            <span>Theme Manager</span>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>{Icons.x}</button>
        </div>

        {/* Quick Toggle */}
        <div style={styles.quickToggle}>
          <button
            onClick={toggleDarkMode}
            style={{
              ...styles.toggleBtn,
              background: currentTheme.isDark ? 'var(--color-accent-muted, rgba(59, 130, 246, 0.2))' : 'transparent',
            }}
          >
            {Icons.moon}
            <span>Dark</span>
          </button>
          <button
            onClick={toggleDarkMode}
            style={{
              ...styles.toggleBtn,
              background: !currentTheme.isDark ? 'var(--color-accent-muted, rgba(59, 130, 246, 0.2))' : 'transparent',
            }}
          >
            {Icons.sun}
            <span>Light</span>
          </button>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            onClick={() => setTab('presets')}
            style={{ ...styles.tab, ...(tab === 'presets' && styles.tabActive) }}
          >Presets</button>
          <button
            onClick={() => setTab('colors')}
            style={{ ...styles.tab, ...(tab === 'colors' && styles.tabActive) }}
          >Accent Colors</button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {tab === 'presets' ? (
            <div style={styles.presetGrid}>
              {THEME_PRESETS.map(preset => (
                <div
                  key={preset.id}
                  onClick={() => handleApplyPreset(preset)}
                  style={{
                    ...styles.presetCard,
                    borderColor: currentTheme.id === preset.id ? preset.accentColor : 'var(--color-border, #27272a)',
                  }}
                >
                  <div
                    style={{
                      ...styles.presetPreview,
                      background: preset.bgPrimary,
                      borderColor: preset.border,
                    }}
                  >
                    <div style={{ ...styles.presetAccent, background: preset.accentColor }} />
                    <div style={{ ...styles.presetText, background: preset.textPrimary }} />
                    <div style={{ ...styles.presetText, background: preset.textSecondary, width: '60%' }} />
                  </div>
                  <div style={styles.presetName}>{preset.name}</div>
                  {currentTheme.id === preset.id && (
                    <span style={styles.presetCheck}>{Icons.check}</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={styles.colorGrid}>
              {ACCENT_COLORS.map(({ id, color, name }) => (
                <div
                  key={id}
                  onClick={() => handleApplyAccent(color)}
                  style={styles.colorItem}
                >
                  <div
                    style={{
                      ...styles.colorSwatch,
                      background: color,
                      boxShadow: currentTheme.accentColor === color
                        ? `0 0 0 3px var(--color-bg-elevated, #18181b), 0 0 0 5px ${color}`
                        : 'none',
                    }}
                  >
                    {currentTheme.accentColor === color && (
                      <span style={{ color: '#fff' }}>{Icons.check}</span>
                    )}
                  </div>
                  <span style={styles.colorName}>{name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.3)',
    zIndex: 'var(--z-max)',
    // Flex centering -> panel lands on whole pixels (no translate(-50%) blur).
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--dex-space-6, var(--space-6))',
  },
  panel: {
    // Responsive width: never overflows a small window.
    width: 'min(500px, 100%)',
    maxHeight: '80vh',
    background: 'var(--color-bg-elevated, #18181b)',
    borderRadius: '10px',
    border: '1px solid var(--color-border, #27272a)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px var(--space-4)',
    borderBottom: '1px solid var(--color-border, #27272a)',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--color-text-primary, #fafafa)',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-tertiary)',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
  },
  quickToggle: {
    display: 'flex',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--color-border, #27272a)',
  },
  toggleBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: '10px',
    background: 'transparent',
    border: '1px solid var(--color-border, #27272a)',
    borderRadius: '6px',
    color: 'var(--color-text-primary, #fafafa)',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  tabs: {
    display: 'flex',
    gap: '4px',
    padding: 'var(--space-2) var(--space-4)',
    borderBottom: '1px solid var(--color-border, #27272a)',
  },
  tab: {
    flex: 1,
    padding: 'var(--space-2) var(--space-4)',
    background: 'transparent',
    border: 'none',
    borderRadius: '4px',
    color: 'var(--color-text-tertiary)',
    fontSize: '13px',
    cursor: 'pointer',
  },
  tabActive: {
    background: 'rgba(59, 130, 246, 0.15)',
    color: '#3b82f6',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-4)',
  },
  presetGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 'var(--space-3)',
  },
  presetCard: {
    position: 'relative',
    padding: 'var(--space-3)',
    borderRadius: '6px',
    border: '2px solid var(--color-border, #27272a)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  presetPreview: {
    height: '60px',
    borderRadius: '4px',
    border: '1px solid',
    padding: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  presetAccent: {
    width: '30px',
    height: '6px',
    borderRadius: '3px',
  },
  presetText: {
    width: '80%',
    height: '4px',
    borderRadius: '2px',
    opacity: 0.6,
  },
  presetName: {
    fontSize: '12px',
    color: 'var(--color-text-primary, #fafafa)',
    fontWeight: 500,
  },
  presetCheck: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    color: '#3b82f6',
  },
  colorGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 'var(--space-4)',
  },
  colorItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-2)',
    cursor: 'pointer',
  },
  colorSwatch: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
  },
  colorName: {
    fontSize: '11px',
    color: 'var(--color-text-secondary, #a1a1aa)',
  },
};

export default ThemeManager;
