// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Clean UI System - Professional, minimal, and accessible UI components
// Pure SVG icons, consistent styling, no emojis
// ===========================================================================

import { escapeHtml } from '../../shared/util/text';

// ===========================================================================
// ICONS - Pure SVG Sharp Style
// ===========================================================================

export const Icons = {
  // Navigation
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path d="M9 22V12h6v10"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`,
  forward: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`,
  up: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>`,
  down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`,
  
  // Actions
  add: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  remove: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  delete: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`,
  save: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`,
  paste: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>`,
  undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>`,
  redo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>`,
  
  // Files
  file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>`,
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  video: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`,
  audio: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  code: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  
  // Media Controls
  play: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`,
  skipBack: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>`,
  skipForward: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>`,
  volume: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>`,
  volumeMute: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`,
  
  // Tools
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-1.42 3.42 2 2 0 01-1.42-.59l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-3.42-1.42 2 2 0 01.59-1.42l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1.08 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 011.42-3.42 2 2 0 011.42.59l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 013.42 1.42 2 2 0 01-.59 1.42l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
  filter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
  sort: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="16" y2="6"/><line x1="4" y1="12" x2="12" y2="12"/><line x1="4" y1="18" x2="8" y2="18"/></svg>`,
  layers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  
  // UKI
  assistant: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  mic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
  
  // Status
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  
  // Misc
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`,
  maximize: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>`,
  minimize: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
  list: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`,
  unlock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
};

// ===========================================================================
// THEME SYSTEM
// ===========================================================================

export interface Theme {
  id: string;
  name: string;
  isDark: boolean;
  colors: ThemeColors;
}

export interface ThemeColors {
  // Background
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgElevated: string;
  
  // Foreground
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  
  // Brand
  accent: string;
  accentHover: string;
  accentActive: string;
  
  // Semantic
  success: string;
  warning: string;
  error: string;
  info: string;
  
  // Border
  border: string;
  borderFocus: string;
  
  // Interactive
  hover: string;
  active: string;
  selected: string;
  disabled: string;
}

export const DarkTheme: Theme = {
  id: 'dark',
  name: 'Dark',
  isDark: true,
  colors: {
    bgPrimary: '#0C0C0E',
    bgSecondary: '#161618',
    bgTertiary: '#1E1E22',
    bgElevated: '#1A1A1E',
    
    textPrimary: '#FFFFFF',
    textSecondary: '#B8B8BD',
    textTertiary: '#8E8E93',
    textInverse: '#0C0C0E',
    
    accent: '#4A9EFF',
    accentHover: '#6CB2FF',
    accentActive: '#3A8EEF',
    
    success: '#34C759',
    warning: '#FF9F0A',
    error: '#FF453A',
    info: '#4A9EFF',
    
    border: 'rgba(255, 255, 255, 0.14)',
    borderFocus: '#4A9EFF',
    
    hover: 'rgba(255, 255, 255, 0.06)',
    active: 'rgba(255, 255, 255, 0.1)',
    selected: 'rgba(74, 158, 255, 0.15)',
    disabled: 'rgba(255, 255, 255, 0.25)'
  }
};

export const LightTheme: Theme = {
  id: 'light',
  name: 'Light',
  isDark: false,
  colors: {
    bgPrimary: '#FFFFFF',
    bgSecondary: '#F5F5F7',
    bgTertiary: '#E8E8EA',
    bgElevated: '#FFFFFF',
    
    textPrimary: '#1D1D1F',
    textSecondary: '#6E6E73',
    textTertiary: '#86868B',
    textInverse: '#FFFFFF',
    
    accent: '#007AFF',
    accentHover: '#0071E3',
    accentActive: '#0060C0',
    
    success: '#34C759',
    warning: '#FF9500',
    error: '#FF3B30',
    info: '#007AFF',
    
    border: '#D1D1D6',
    borderFocus: '#007AFF',
    
    hover: 'rgba(0, 0, 0, 0.04)',
    active: 'rgba(0, 0, 0, 0.08)',
    selected: 'rgba(0, 122, 255, 0.1)',
    disabled: 'rgba(0, 0, 0, 0.25)'
  }
};

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  
  for (const [key, value] of Object.entries(theme.colors)) {
    const cssVar = `--color-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    root.style.setProperty(cssVar, value);
  }
  
  root.setAttribute('data-theme', theme.id);
  root.classList.toggle('dark', theme.isDark);
}

// ===========================================================================
// BASE STYLES
// ===========================================================================

export const BaseStyles = `
:root {
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'Berkeley Mono', 'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', 'Menlo', 'Monaco', 'Consolas', monospace;
  --font-family: var(--font-mono);
  
  --radius-sm: 3px;
  --radius-md: 4px;
  --radius-lg: 6px;
  --radius-xl: 8px;
  
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 2px 6px rgba(0, 0, 0, 0.25);
  --shadow-lg: 0 4px 12px rgba(0, 0, 0, 0.3);
  --shadow-xl: 0 8px 24px rgba(0, 0, 0, 0.35);
  
  --transition-fast: 80ms ease;
  --transition-normal: 150ms ease;
  --transition-slow: 250ms ease;
  
  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
  --spacing-5: 20px;
  --spacing-6: 24px;
  --spacing-8: 32px;
  --spacing-10: 40px;
  --spacing-12: 48px;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  font-family: var(--font-mono);
  font-size: 14px;
  line-height: 1.6;
  letter-spacing: 0.01em;
  color: var(--color-text-primary);
  background: var(--color-bg-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-feature-settings: 'liga' 1, 'calt' 1;
}

/* Focus styles */
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Selection */
::selection {
  background: var(--color-accent);
  color: white;
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.18);
}

/* Screen reader only */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;

// ===========================================================================
// COMPONENT STYLES
// ===========================================================================

export const ComponentStyles = {
  // Buttons
  button: {
    base: `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-2);
      padding: var(--spacing-2) var(--spacing-4);
      font-size: 14px;
      font-weight: 500;
      font-family: var(--font-mono);
      letter-spacing: 0.01em;
      line-height: 1;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all var(--transition-fast);
      user-select: none;
    `,
    primary: `
      background: var(--color-accent);
      border-color: var(--color-accent);
      color: #000000;
    `,
    secondary: `
      background: transparent;
      border-color: var(--color-border);
      color: var(--color-text-primary);
    `,
    ghost: `
      background: transparent;
      border-color: transparent;
      color: var(--color-text-secondary);
    `,
    danger: `
      background: transparent;
      border-color: var(--color-error);
      color: var(--color-error);
    `,
    icon: `
      padding: var(--spacing-2);
      border-radius: var(--radius-sm);
    `,
    disabled: `
      opacity: 0.4;
      cursor: not-allowed;
      pointer-events: none;
    `
  },

  // Inputs
  input: {
    base: `
      width: 100%;
      padding: var(--spacing-2) var(--spacing-3);
      font-size: 14px;
      font-family: var(--font-mono);
      letter-spacing: 0.01em;
      color: var(--color-text-primary);
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      transition: border-color var(--transition-fast);
    `,
    focus: `
      border-color: var(--color-accent);
      outline: none;
    `,
    error: `
      border-color: var(--color-error);
    `
  },

  // Cards
  card: {
    base: `
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      overflow: hidden;
    `,
    elevated: `
      background: var(--color-bg-elevated);
      box-shadow: var(--shadow-md);
    `
  },

  // Panels
  panel: {
    base: `
      background: var(--color-bg-secondary);
      border-right: 1px solid var(--color-border);
    `,
    header: `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-3) var(--spacing-4);
      border-bottom: 1px solid var(--color-border);
    `
  },

  // Toolbar
  toolbar: {
    base: `
      display: flex;
      align-items: center;
      gap: var(--spacing-1);
      padding: var(--spacing-2);
      background: var(--color-bg-secondary);
      border-bottom: 1px solid var(--color-border);
    `,
    separator: `
      width: 1px;
      height: 24px;
      margin: 0 var(--spacing-2);
      background: var(--color-border);
    `
  },

  // Tabs
  tabs: {
    list: `
      display: flex;
      gap: 0;
      border-bottom: 1px solid var(--color-border);
    `,
    tab: `
      padding: var(--spacing-2) var(--spacing-4);
      font-size: 12px;
      font-family: var(--font-mono);
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: var(--color-text-tertiary);
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      transition: all var(--transition-fast);
    `,
    tabActive: `
      color: var(--color-text-primary);
      border-bottom-color: var(--color-accent);
    `
  },

  // Dialog
  dialog: {
    overlay: `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: var(--z-modal-backdrop);
    `,
    content: `
      width: 100%;
      max-width: 480px;
      max-height: 85vh;
      background: var(--color-bg-elevated);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-xl);
      overflow: hidden;
    `,
    header: `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-4);
      border-bottom: 1px solid var(--color-border);
    `,
    body: `
      padding: var(--spacing-4);
      overflow-y: auto;
    `,
    footer: `
      display: flex;
      justify-content: flex-end;
      gap: var(--spacing-2);
      padding: var(--spacing-4);
      border-top: 1px solid var(--color-border);
    `
  },

  // Menu
  menu: {
    base: `
      min-width: 180px;
      padding: var(--spacing-1);
      background: var(--color-bg-elevated);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
    `,
    item: `
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      padding: var(--spacing-2) var(--spacing-3);
      font-size: 12px;
      font-family: var(--font-mono);
      color: var(--color-text-primary);
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: background var(--transition-fast);
    `,
    itemHover: `
      background: var(--color-hover);
    `,
    separator: `
      height: 1px;
      margin: var(--spacing-1) 0;
      background: var(--color-border);
    `
  },

  // Toast
  toast: {
    base: `
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      padding: var(--spacing-3) var(--spacing-4);
      font-family: var(--font-mono);
      font-size: 12px;
      background: var(--color-bg-elevated);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-md);
    `,
    success: `border-left: 3px solid var(--color-success);`,
    warning: `border-left: 3px solid var(--color-warning);`,
    error: `border-left: 3px solid var(--color-error);`,
    info: `border-left: 3px solid var(--color-info);`
  },

  // Tooltip
  tooltip: {
    base: `
      padding: var(--spacing-1) var(--spacing-2);
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--color-text-primary);
      background: var(--color-bg-elevated);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      box-shadow: var(--shadow-sm);
    `
  },

  // Badge
  badge: {
    base: `
      display: inline-flex;
      align-items: center;
      padding: 2px var(--spacing-2);
      font-size: 11px;
      font-weight: 500;
      font-family: var(--font-mono);
      letter-spacing: 0.02em;
      border-radius: var(--radius-sm);
    `,
    default: `
      background: var(--color-bg-tertiary);
      color: var(--color-text-secondary);
    `,
    primary: `
      background: rgba(74, 158, 255, 0.14);
      color: var(--color-accent);
    `,
    success: `
      background: rgba(52, 199, 89, 0.14);
      color: var(--color-success);
    `,
    warning: `
      background: rgba(255, 159, 10, 0.14);
      color: var(--color-warning);
    `,
    error: `
      background: rgba(255, 69, 58, 0.14);
      color: var(--color-error);
    `
  }
};

// ===========================================================================
// LAYOUT UTILITIES
// ===========================================================================

export const LayoutUtils = {
  flex: {
    row: 'display: flex; flex-direction: row;',
    col: 'display: flex; flex-direction: column;',
    center: 'display: flex; align-items: center; justify-content: center;',
    between: 'display: flex; align-items: center; justify-content: space-between;',
    start: 'display: flex; align-items: flex-start;',
    end: 'display: flex; align-items: flex-end;'
  },
  grid: {
    base: 'display: grid;',
    cols2: 'display: grid; grid-template-columns: repeat(2, 1fr);',
    cols3: 'display: grid; grid-template-columns: repeat(3, 1fr);',
    cols4: 'display: grid; grid-template-columns: repeat(4, 1fr);'
  },
  overflow: {
    hidden: 'overflow: hidden;',
    auto: 'overflow: auto;',
    scroll: 'overflow: scroll;'
  },
  position: {
    relative: 'position: relative;',
    absolute: 'position: absolute;',
    fixed: 'position: fixed;',
    sticky: 'position: sticky;'
  }
};

// ===========================================================================
// ANIMATION UTILITIES
// ===========================================================================

export const Animations = {
  fadeIn: `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `,
  fadeOut: `
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
  `,
  slideUp: `
    @keyframes slideUp {
      from { transform: translateY(10px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `,
  slideDown: `
    @keyframes slideDown {
      from { transform: translateY(-10px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `,
  scaleIn: `
    @keyframes scaleIn {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
  `,
  spin: `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `,
  pulse: `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `
};

// ===========================================================================
// ICON COMPONENT
// ===========================================================================

export interface IconProps {
  name: keyof typeof Icons;
  size?: number;
  color?: string;
  className?: string;
}

export function createIcon(props: IconProps): string {
  const { name, size = 20, color = 'currentColor', className = '' } = props;
  const svg = Icons[name] || Icons.info;
  
  return `<span class="icon ${className}" style="width: ${size}px; height: ${size}px; color: ${color}; display: inline-flex;">${svg}</span>`;
}

// ===========================================================================
// UI MANAGER
// ===========================================================================

export class UIManager {
  private static instance: UIManager;
  private currentTheme: Theme = DarkTheme;
  private toasts: HTMLElement[] = [];

  private constructor() {
    this.injectStyles();
    applyTheme(this.currentTheme);
  }

  static getInstance(): UIManager {
    if (!UIManager.instance) {
      UIManager.instance = new UIManager();
    }
    return UIManager.instance;
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.id = 'dex-ui-styles';
    style.textContent = BaseStyles + Object.values(Animations).join('\n');
    document.head.appendChild(style);
  }

  setTheme(theme: Theme): void {
    this.currentTheme = theme;
    applyTheme(theme);
  }

  getTheme(): Theme {
    return this.currentTheme;
  }

  toggleTheme(): void {
    const newTheme = this.currentTheme.isDark ? LightTheme : DarkTheme;
    this.setTheme(newTheme);
  }

  showToast(message: string, type: 'success' | 'warning' | 'error' | 'info' = 'info', duration: number = 3000): void {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cssText = ComponentStyles.toast.base + ComponentStyles.toast[type];
    // Escape the message: callers pass user-derived text (imported asset/part
    // names, file names), so raw interpolation into innerHTML is an XSS sink.
    toast.innerHTML = `
      ${createIcon({ name: type === 'success' ? 'check' : type === 'warning' ? 'warning' : type === 'error' ? 'error' : 'info', size: 18 })}
      <span>${escapeHtml(message)}</span>
    `;

    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = 'position: fixed; bottom: 20px; right: 20px; display: flex; flex-direction: column; gap: 8px; z-index: var(--z-toast, 9900);';
      document.body.appendChild(container);
    }

    container.appendChild(toast);
    toast.style.animation = 'slideUp 200ms ease';

    setTimeout(() => {
      toast.style.animation = 'fadeOut 200ms ease forwards';
      setTimeout(() => toast.remove(), 200);
    }, duration);
  }
}

// ===========================================================================
// EXPORTS
// ===========================================================================

export const getUIManager = () => UIManager.getInstance();

export default {
  Icons,
  DarkTheme,
  LightTheme,
  applyTheme,
  BaseStyles,
  ComponentStyles,
  LayoutUtils,
  Animations,
  createIcon,
  UIManager,
  getUIManager
};
