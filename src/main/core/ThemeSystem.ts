// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Theme System
// Phase 41: True black system-grade theming with instant switching
// ===========================================================================

import log from 'electron-log';
import { nativeTheme, BrowserWindow } from 'electron';
import Store from 'electron-store';

// ===========================================================================
// TYPES
// ===========================================================================

export type ThemeMode = 'system' | 'light' | 'dark' | 'true-black';

export interface ThemeConfig {
  mode: ThemeMode;
  accentColor: string;
  reducedMotion: boolean;
  highContrast: boolean;
  fontSize: 'small' | 'medium' | 'large';
  fontScale: number;
  borderRadius: 'none' | 'subtle' | 'rounded';
  density: 'compact' | 'comfortable' | 'spacious';
}

export interface ThemeTokens {
  // Surface colors
  surfaceBase: string;
  surfaceElevated: string;
  surfaceHover: string;
  surfaceActive: string;
  surfaceOverlay: string;

  // Text colors
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;

  // Border colors
  borderSubtle: string;
  borderStrong: string;
  borderFocus: string;

  // Accent colors
  accentPrimary: string;
  accentSecondary: string;
  accentMuted: string;

  // Semantic colors
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  error: string;
  errorBg: string;
  info: string;
  infoBg: string;

  // Shadows
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;

  // Spacing scale
  space1: string;
  space2: string;
  space3: string;
  space4: string;
  space5: string;
  space6: string;
  space8: string;

  // Typography scale
  textXs: string;
  textSm: string;
  textBase: string;
  textLg: string;
  textXl: string;
  text2xl: string;

  // Radius scale
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  radiusFull: string;

  // Transitions
  transitionFast: string;
  transitionBase: string;
  transitionSlow: string;
}

// ===========================================================================
// THEME PALETTES
// ===========================================================================

const LIGHT_TOKENS: ThemeTokens = {
  // Surface colors
  surfaceBase: '#ffffff',
  surfaceElevated: '#f8f9fa',
  surfaceHover: '#f1f3f5',
  surfaceActive: '#e9ecef',
  surfaceOverlay: 'rgba(0, 0, 0, 0.5)',

  // Text colors
  textPrimary: '#1a1a1a',
  textSecondary: '#495057',
  textMuted: '#868e96',
  textInverse: '#ffffff',

  // Border colors
  borderSubtle: '#e9ecef',
  borderStrong: '#ced4da',
  borderFocus: '#339af0',

  // Accent colors
  accentPrimary: '#339af0',
  accentSecondary: '#228be6',
  accentMuted: 'rgba(51, 154, 240, 0.1)',

  // Semantic colors
  success: '#40c057',
  successBg: 'rgba(64, 192, 87, 0.1)',
  warning: '#fab005',
  warningBg: 'rgba(250, 176, 5, 0.1)',
  error: '#fa5252',
  errorBg: 'rgba(250, 82, 82, 0.1)',
  info: '#339af0',
  infoBg: 'rgba(51, 154, 240, 0.1)',

  // Shadows
  shadowSm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  shadowMd: '0 4px 6px rgba(0, 0, 0, 0.07)',
  shadowLg: '0 10px 15px rgba(0, 0, 0, 0.1)',

  // Spacing
  space1: '4px',
  space2: '8px',
  space3: '12px',
  space4: '16px',
  space5: '20px',
  space6: '24px',
  space8: '32px',

  // Typography
  textXs: '11px',
  textSm: '13px',
  textBase: '14px',
  textLg: '16px',
  textXl: '18px',
  text2xl: '24px',

  // Radius
  radiusSm: '4px',
  radiusMd: '8px',
  radiusLg: '12px',
  radiusFull: '9999px',

  // Transitions
  transitionFast: '100ms ease',
  transitionBase: '200ms ease',
  transitionSlow: '300ms ease',
};

const DARK_TOKENS: ThemeTokens = {
  // Surface colors
  surfaceBase: '#1a1a1a',
  surfaceElevated: '#252525',
  surfaceHover: '#2d2d2d',
  surfaceActive: '#353535',
  surfaceOverlay: 'rgba(0, 0, 0, 0.7)',

  // Text colors
  textPrimary: '#f1f3f5',
  textSecondary: '#adb5bd',
  textMuted: '#6c757d',
  textInverse: '#1a1a1a',

  // Border colors
  borderSubtle: '#2d2d2d',
  borderStrong: '#404040',
  borderFocus: '#339af0',

  // Accent colors
  accentPrimary: '#339af0',
  accentSecondary: '#4dabf7',
  accentMuted: 'rgba(51, 154, 240, 0.15)',

  // Semantic colors
  success: '#51cf66',
  successBg: 'rgba(81, 207, 102, 0.15)',
  warning: '#fcc419',
  warningBg: 'rgba(252, 196, 25, 0.15)',
  error: '#ff6b6b',
  errorBg: 'rgba(255, 107, 107, 0.15)',
  info: '#339af0',
  infoBg: 'rgba(51, 154, 240, 0.15)',

  // Shadows (subtle in dark mode)
  shadowSm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  shadowMd: '0 4px 6px rgba(0, 0, 0, 0.4)',
  shadowLg: '0 10px 15px rgba(0, 0, 0, 0.5)',

  // Spacing (same as light)
  space1: '4px',
  space2: '8px',
  space3: '12px',
  space4: '16px',
  space5: '20px',
  space6: '24px',
  space8: '32px',

  // Typography (same as light)
  textXs: '11px',
  textSm: '13px',
  textBase: '14px',
  textLg: '16px',
  textXl: '18px',
  text2xl: '24px',

  // Radius (same as light)
  radiusSm: '4px',
  radiusMd: '8px',
  radiusLg: '12px',
  radiusFull: '9999px',

  // Transitions (same as light)
  transitionFast: '100ms ease',
  transitionBase: '200ms ease',
  transitionSlow: '300ms ease',
};

const TRUE_BLACK_TOKENS: ThemeTokens = {
  // Surface colors - TRUE BLACK for OLED
  surfaceBase: '#000000',
  surfaceElevated: '#0a0a0a',
  surfaceHover: '#141414',
  surfaceActive: '#1a1a1a',
  surfaceOverlay: 'rgba(0, 0, 0, 0.85)',

  // Text colors
  textPrimary: '#ffffff',
  textSecondary: '#b0b0b0',
  textMuted: '#707070',
  textInverse: '#000000',

  // Border colors
  borderSubtle: '#1a1a1a',
  borderStrong: '#2a2a2a',
  borderFocus: '#339af0',

  // Accent colors
  accentPrimary: '#339af0',
  accentSecondary: '#4dabf7',
  accentMuted: 'rgba(51, 154, 240, 0.2)',

  // Semantic colors
  success: '#51cf66',
  successBg: 'rgba(81, 207, 102, 0.2)',
  warning: '#fcc419',
  warningBg: 'rgba(252, 196, 25, 0.2)',
  error: '#ff6b6b',
  errorBg: 'rgba(255, 107, 107, 0.2)',
  info: '#339af0',
  infoBg: 'rgba(51, 154, 240, 0.2)',

  // Shadows (minimal for true black)
  shadowSm: '0 1px 2px rgba(255, 255, 255, 0.05)',
  shadowMd: '0 4px 6px rgba(255, 255, 255, 0.03)',
  shadowLg: '0 10px 15px rgba(255, 255, 255, 0.02)',

  // Spacing
  space1: '4px',
  space2: '8px',
  space3: '12px',
  space4: '16px',
  space5: '20px',
  space6: '24px',
  space8: '32px',

  // Typography
  textXs: '11px',
  textSm: '13px',
  textBase: '14px',
  textLg: '16px',
  textXl: '18px',
  text2xl: '24px',

  // Radius
  radiusSm: '4px',
  radiusMd: '8px',
  radiusLg: '12px',
  radiusFull: '9999px',

  // Transitions
  transitionFast: '100ms ease',
  transitionBase: '200ms ease',
  transitionSlow: '300ms ease',
};

// ===========================================================================
// STORE
// ===========================================================================

const themeStore = new Store<{
  config: ThemeConfig;
  customTokens: Partial<ThemeTokens>;
}>({
  name: 'theme-system',
  defaults: {
    config: {
      mode: 'system',
      accentColor: '#339af0',
      reducedMotion: false,
      highContrast: false,
      fontSize: 'medium',
      fontScale: 1,
      borderRadius: 'rounded',
      density: 'comfortable',
    },
    customTokens: {},
  },
});

// ===========================================================================
// THEME SYSTEM
// ===========================================================================

class ThemeSystem {
  private static instance: ThemeSystem;
  private initialized = false;
  private windows: Set<BrowserWindow> = new Set();
  private currentTokens: ThemeTokens = DARK_TOKENS;
  private changeListeners: Set<(tokens: ThemeTokens, mode: ThemeMode) => void> = new Set();

  private constructor() {}

  static getInstance(): ThemeSystem {
    if (!ThemeSystem.instance) {
      ThemeSystem.instance = new ThemeSystem();
    }
    return ThemeSystem.instance;
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Listen for system theme changes
    nativeTheme.on('updated', () => {
      const config = themeStore.get('config');
      if (config.mode === 'system') {
        this.applyTheme();
      }
    });

    // Apply initial theme
    this.applyTheme();

    this.initialized = true;
    log.info('[ThemeSystem] Initialized');
  }

  // -------------------------------------------------------------------------
  // WINDOW MANAGEMENT
  // -------------------------------------------------------------------------

  registerWindow(window: BrowserWindow): void {
    this.windows.add(window);
    window.on('closed', () => this.windows.delete(window));
    
    // Send current theme to window
    this.sendThemeToWindow(window);
  }

  private sendThemeToWindow(window: BrowserWindow): void {
    if (window.isDestroyed()) return;
    
    const config = themeStore.get('config');
    const effectiveMode = this.getEffectiveMode();
    
    window.webContents.send('theme:changed', {
      tokens: this.currentTokens,
      mode: effectiveMode,
      config,
    });
  }

  private broadcastTheme(): void {
    this.windows.forEach(window => this.sendThemeToWindow(window));
  }

  // -------------------------------------------------------------------------
  // THEME APPLICATION
  // -------------------------------------------------------------------------

  private applyTheme(): void {
    const config = themeStore.get('config');
    const customTokens = themeStore.get('customTokens');
    const effectiveMode = this.getEffectiveMode();

    // Select base tokens
    let baseTokens: ThemeTokens;
    switch (effectiveMode) {
      case 'light':
        baseTokens = LIGHT_TOKENS;
        break;
      case 'true-black':
        baseTokens = TRUE_BLACK_TOKENS;
        break;
      case 'dark':
      default:
        baseTokens = DARK_TOKENS;
        break;
    }

    // Apply custom accent color
    if (config.accentColor !== '#339af0') {
      baseTokens = {
        ...baseTokens,
        accentPrimary: config.accentColor,
        accentSecondary: this.lightenColor(config.accentColor, 15),
        accentMuted: this.addAlpha(config.accentColor, 0.15),
        borderFocus: config.accentColor,
      };
    }

    // Apply font scale
    if (config.fontScale !== 1) {
      baseTokens = {
        ...baseTokens,
        textXs: `${Math.round(11 * config.fontScale)}px`,
        textSm: `${Math.round(13 * config.fontScale)}px`,
        textBase: `${Math.round(14 * config.fontScale)}px`,
        textLg: `${Math.round(16 * config.fontScale)}px`,
        textXl: `${Math.round(18 * config.fontScale)}px`,
        text2xl: `${Math.round(24 * config.fontScale)}px`,
      };
    }

    // Apply border radius preference
    if (config.borderRadius === 'none') {
      baseTokens = {
        ...baseTokens,
        radiusSm: '0',
        radiusMd: '0',
        radiusLg: '0',
      };
    } else if (config.borderRadius === 'subtle') {
      baseTokens = {
        ...baseTokens,
        radiusSm: '2px',
        radiusMd: '4px',
        radiusLg: '6px',
      };
    }

    // Apply density
    if (config.density === 'compact') {
      baseTokens = {
        ...baseTokens,
        space1: '2px',
        space2: '4px',
        space3: '8px',
        space4: '12px',
        space5: '16px',
        space6: '20px',
        space8: '28px',
      };
    } else if (config.density === 'spacious') {
      baseTokens = {
        ...baseTokens,
        space1: '6px',
        space2: '10px',
        space3: '16px',
        space4: '20px',
        space5: '24px',
        space6: '32px',
        space8: '40px',
      };
    }

    // Apply reduced motion
    if (config.reducedMotion) {
      baseTokens = {
        ...baseTokens,
        transitionFast: '0ms',
        transitionBase: '0ms',
        transitionSlow: '0ms',
      };
    }

    // Merge with custom tokens
    this.currentTokens = { ...baseTokens, ...customTokens };

    // Broadcast to windows
    this.broadcastTheme();

    // Notify listeners
    this.changeListeners.forEach(cb => cb(this.currentTokens, effectiveMode));
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  getConfig(): ThemeConfig {
    return themeStore.get('config');
  }

  async setConfig(updates: Partial<ThemeConfig>): Promise<ThemeConfig> {
    const current = themeStore.get('config');
    const updated = { ...current, ...updates };
    themeStore.set('config', updated);
    this.applyTheme();
    return updated;
  }

  async setMode(mode: ThemeMode): Promise<void> {
    await this.setConfig({ mode });
  }

  getEffectiveMode(): Exclude<ThemeMode, 'system'> {
    const config = themeStore.get('config');
    if (config.mode === 'system') {
      return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    }
    return config.mode;
  }

  getTokens(): ThemeTokens {
    return this.currentTokens;
  }

  async setCustomTokens(tokens: Partial<ThemeTokens>): Promise<void> {
    themeStore.set('customTokens', tokens);
    this.applyTheme();
  }

  async resetCustomTokens(): Promise<void> {
    themeStore.set('customTokens', {});
    this.applyTheme();
  }

  // -------------------------------------------------------------------------
  // COLOR UTILITIES
  // -------------------------------------------------------------------------

  private lightenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00ff) + amt);
    const B = Math.min(255, (num & 0x0000ff) + amt);
    return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
  }

  private addAlpha(hex: string, alpha: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const R = (num >> 16) & 0xff;
    const G = (num >> 8) & 0xff;
    const B = num & 0xff;
    return `rgba(${R}, ${G}, ${B}, ${alpha})`;
  }

  // -------------------------------------------------------------------------
  // LISTENERS
  // -------------------------------------------------------------------------

  onThemeChange(callback: (tokens: ThemeTokens, mode: ThemeMode) => void): () => void {
    this.changeListeners.add(callback);
    return () => this.changeListeners.delete(callback);
  }

  // -------------------------------------------------------------------------
  // CSS GENERATION
  // -------------------------------------------------------------------------

  generateCSSVariables(): string {
    const tokens = this.currentTokens;
    return `
:root {
  /* Surface colors */
  --surface-base: ${tokens.surfaceBase};
  --surface-elevated: ${tokens.surfaceElevated};
  --surface-hover: ${tokens.surfaceHover};
  --surface-active: ${tokens.surfaceActive};
  --surface-overlay: ${tokens.surfaceOverlay};

  /* Text colors */
  --text-primary: ${tokens.textPrimary};
  --text-secondary: ${tokens.textSecondary};
  --text-muted: ${tokens.textMuted};
  --text-inverse: ${tokens.textInverse};

  /* Border colors */
  --border-subtle: ${tokens.borderSubtle};
  --border-strong: ${tokens.borderStrong};
  --border-focus: ${tokens.borderFocus};

  /* Accent colors */
  --accent-primary: ${tokens.accentPrimary};
  --accent-secondary: ${tokens.accentSecondary};
  --accent-muted: ${tokens.accentMuted};

  /* Semantic colors */
  --success: ${tokens.success};
  --success-bg: ${tokens.successBg};
  --warning: ${tokens.warning};
  --warning-bg: ${tokens.warningBg};
  --error: ${tokens.error};
  --error-bg: ${tokens.errorBg};
  --info: ${tokens.info};
  --info-bg: ${tokens.infoBg};

  /* Shadows */
  --shadow-sm: ${tokens.shadowSm};
  --shadow-md: ${tokens.shadowMd};
  --shadow-lg: ${tokens.shadowLg};

  /* Spacing */
  --space-1: ${tokens.space1};
  --space-2: ${tokens.space2};
  --space-3: ${tokens.space3};
  --space-4: ${tokens.space4};
  --space-5: ${tokens.space5};
  --space-6: ${tokens.space6};
  --space-8: ${tokens.space8};

  /* Typography */
  --text-xs: ${tokens.textXs};
  --text-sm: ${tokens.textSm};
  --text-base: ${tokens.textBase};
  --text-lg: ${tokens.textLg};
  --text-xl: ${tokens.textXl};
  --text-2xl: ${tokens.text2xl};

  /* Radius */
  --radius-sm: ${tokens.radiusSm};
  --radius-md: ${tokens.radiusMd};
  --radius-lg: ${tokens.radiusLg};
  --radius-full: ${tokens.radiusFull};

  /* Transitions */
  --transition-fast: ${tokens.transitionFast};
  --transition-base: ${tokens.transitionBase};
  --transition-slow: ${tokens.transitionSlow};
}
    `.trim();
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const themeSystem = ThemeSystem.getInstance();
export default themeSystem;
