// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - POLISH - UI Engine
// Animations, themes, and accessibility
// Items 951-975 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// ITEM 951-955: ANIMATION SYSTEM
// =============================================================================

export interface Animation {
  id: string;
  name: string;
  type: AnimationType;
  duration: number;
  delay: number;
  easing: EasingFunction;
  iterations: number;
  direction: AnimationDirection;
  fillMode: AnimationFillMode;
  keyframes: Keyframe[];
  isPlaying: boolean;
  currentTime: number;
  playbackRate: number;
}

export type AnimationType = 
  | 'transform' | 'opacity' | 'color' | 'dimension'
  | 'path' | 'filter' | 'clip' | 'custom';

export type EasingFunction = 
  | 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out'
  | 'cubic-bezier' | 'spring' | 'steps';

export type AnimationDirection = 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
export type AnimationFillMode = 'none' | 'forwards' | 'backwards' | 'both';

export interface Keyframe {
  offset: number;
  properties: Record<string, number | string>;
  easing?: EasingFunction;
}

export interface AnimationPreset {
  name: string;
  category: string;
  animation: Omit<Animation, 'id' | 'isPlaying' | 'currentTime'>;
}

export const ANIMATION_PRESETS: AnimationPreset[] = [
  {
    name: 'fadeIn',
    category: 'entrance',
    animation: {
      name: 'Fade In',
      type: 'opacity',
      duration: 300,
      delay: 0,
      easing: 'ease-out',
      iterations: 1,
      direction: 'normal',
      fillMode: 'forwards',
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 1, properties: { opacity: 1 } }
      ],
      playbackRate: 1
    }
  },
  {
    name: 'fadeOut',
    category: 'exit',
    animation: {
      name: 'Fade Out',
      type: 'opacity',
      duration: 300,
      delay: 0,
      easing: 'ease-in',
      iterations: 1,
      direction: 'normal',
      fillMode: 'forwards',
      keyframes: [
        { offset: 0, properties: { opacity: 1 } },
        { offset: 1, properties: { opacity: 0 } }
      ],
      playbackRate: 1
    }
  },
  {
    name: 'slideInLeft',
    category: 'entrance',
    animation: {
      name: 'Slide In Left',
      type: 'transform',
      duration: 400,
      delay: 0,
      easing: 'ease-out',
      iterations: 1,
      direction: 'normal',
      fillMode: 'forwards',
      keyframes: [
        { offset: 0, properties: { translateX: -100, opacity: 0 } },
        { offset: 1, properties: { translateX: 0, opacity: 1 } }
      ],
      playbackRate: 1
    }
  },
  {
    name: 'scaleUp',
    category: 'entrance',
    animation: {
      name: 'Scale Up',
      type: 'transform',
      duration: 300,
      delay: 0,
      easing: 'spring',
      iterations: 1,
      direction: 'normal',
      fillMode: 'forwards',
      keyframes: [
        { offset: 0, properties: { scale: 0.8, opacity: 0 } },
        { offset: 1, properties: { scale: 1, opacity: 1 } }
      ],
      playbackRate: 1
    }
  },
  {
    name: 'bounce',
    category: 'attention',
    animation: {
      name: 'Bounce',
      type: 'transform',
      duration: 600,
      delay: 0,
      easing: 'ease-out',
      iterations: 1,
      direction: 'normal',
      fillMode: 'none',
      keyframes: [
        { offset: 0, properties: { translateY: 0 } },
        { offset: 0.4, properties: { translateY: -20 } },
        { offset: 0.6, properties: { translateY: -10 } },
        { offset: 0.8, properties: { translateY: -5 } },
        { offset: 1, properties: { translateY: 0 } }
      ],
      playbackRate: 1
    }
  },
  {
    name: 'shake',
    category: 'attention',
    animation: {
      name: 'Shake',
      type: 'transform',
      duration: 500,
      delay: 0,
      easing: 'linear',
      iterations: 1,
      direction: 'normal',
      fillMode: 'none',
      keyframes: [
        { offset: 0, properties: { translateX: 0 } },
        { offset: 0.2, properties: { translateX: -10 } },
        { offset: 0.4, properties: { translateX: 10 } },
        { offset: 0.6, properties: { translateX: -10 } },
        { offset: 0.8, properties: { translateX: 10 } },
        { offset: 1, properties: { translateX: 0 } }
      ],
      playbackRate: 1
    }
  },
  {
    name: 'pulse',
    category: 'attention',
    animation: {
      name: 'Pulse',
      type: 'transform',
      duration: 1000,
      delay: 0,
      easing: 'ease-in-out',
      iterations: -1,
      direction: 'alternate',
      fillMode: 'none',
      keyframes: [
        { offset: 0, properties: { scale: 1 } },
        { offset: 1, properties: { scale: 1.05 } }
      ],
      playbackRate: 1
    }
  }
];

export interface Transition {
  property: string;
  duration: number;
  delay: number;
  easing: EasingFunction;
}

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
  velocity: number;
}

// =============================================================================
// ITEM 956-960: THEME SYSTEM
// =============================================================================

export interface Theme {
  id: string;
  name: string;
  type: 'light' | 'dark' | 'auto';
  colors: ThemeColors;
  typography: ThemeTypography;
  spacing: ThemeSpacing;
  borders: ThemeBorders;
  shadows: ThemeShadows;
  animations: ThemeAnimations;
  custom: Record<string, string>;
}

export interface ThemeColors {
  primary: string;
  primaryHover: string;
  primaryActive: string;
  secondary: string;
  accent: string;
  background: string;
  backgroundSecondary: string;
  backgroundTertiary: string;
  surface: string;
  surfaceHover: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  border: string;
  borderHover: string;
  divider: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  focus: string;
  selection: string;
  overlay: string;
}

export interface ThemeTypography {
  fontFamily: string;
  fontFamilyMono: string;
  fontSizeXs: string;
  fontSizeSm: string;
  fontSizeMd: string;
  fontSizeLg: string;
  fontSizeXl: string;
  fontSize2xl: string;
  fontSize3xl: string;
  fontWeightNormal: number;
  fontWeightMedium: number;
  fontWeightSemibold: number;
  fontWeightBold: number;
  lineHeightTight: number;
  lineHeightNormal: number;
  lineHeightRelaxed: number;
  letterSpacingTight: string;
  letterSpacingNormal: string;
  letterSpacingWide: string;
}

export interface ThemeSpacing {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  xxl: string;
}

export interface ThemeBorders {
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  radiusFull: string;
  widthThin: string;
  widthMedium: string;
  widthThick: string;
}

export interface ThemeShadows {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  inner: string;
  none: string;
}

export interface ThemeAnimations {
  durationFast: string;
  durationNormal: string;
  durationSlow: string;
  easingDefault: string;
  easingIn: string;
  easingOut: string;
  easingInOut: string;
}

export const DEFAULT_LIGHT_THEME: Theme = {
  id: 'light',
  name: 'Light',
  type: 'light',
  colors: {
    primary: '#2563EB',
    primaryHover: '#1D4ED8',
    primaryActive: '#1E40AF',
    secondary: '#64748B',
    accent: '#8B5CF6',
    background: '#FFFFFF',
    backgroundSecondary: '#F8FAFC',
    backgroundTertiary: '#F1F5F9',
    surface: '#FFFFFF',
    surfaceHover: '#F8FAFC',
    text: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#94A3B8',
    textInverse: '#FFFFFF',
    border: '#E2E8F0',
    borderHover: '#CBD5E1',
    divider: '#E2E8F0',
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
    focus: 'rgba(37, 99, 235, 0.5)',
    selection: 'rgba(37, 99, 235, 0.2)',
    overlay: 'rgba(0, 0, 0, 0.5)'
  },
  typography: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    fontFamilyMono: 'JetBrains Mono, Fira Code, monospace',
    fontSizeXs: '0.75rem',
    fontSizeSm: '0.875rem',
    fontSizeMd: '1rem',
    fontSizeLg: '1.125rem',
    fontSizeXl: '1.25rem',
    fontSize2xl: '1.5rem',
    fontSize3xl: '2rem',
    fontWeightNormal: 400,
    fontWeightMedium: 500,
    fontWeightSemibold: 600,
    fontWeightBold: 700,
    lineHeightTight: 1.25,
    lineHeightNormal: 1.5,
    lineHeightRelaxed: 1.75,
    letterSpacingTight: '-0.025em',
    letterSpacingNormal: '0',
    letterSpacingWide: '0.025em'
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    xxl: '3rem'
  },
  borders: {
    radiusSm: '0.25rem',
    radiusMd: '0.5rem',
    radiusLg: '0.75rem',
    radiusFull: '9999px',
    widthThin: '1px',
    widthMedium: '2px',
    widthThick: '4px'
  },
  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
    inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.05)',
    none: 'none'
  },
  animations: {
    durationFast: '150ms',
    durationNormal: '300ms',
    durationSlow: '500ms',
    easingDefault: 'cubic-bezier(0.4, 0, 0.2, 1)',
    easingIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easingOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easingInOut: 'cubic-bezier(0.4, 0, 0.2, 1)'
  },
  custom: {}
};

export const DEFAULT_DARK_THEME: Theme = {
  ...DEFAULT_LIGHT_THEME,
  id: 'dark',
  name: 'Dark',
  type: 'dark',
  colors: {
    primary: '#3B82F6',
    primaryHover: '#2563EB',
    primaryActive: '#1D4ED8',
    secondary: '#94A3B8',
    accent: '#A78BFA',
    background: '#0F172A',
    backgroundSecondary: '#1E293B',
    backgroundTertiary: '#334155',
    surface: '#1E293B',
    surfaceHover: '#334155',
    text: '#F8FAFC',
    textSecondary: '#CBD5E1',
    textMuted: '#64748B',
    textInverse: '#0F172A',
    border: '#334155',
    borderHover: '#475569',
    divider: '#334155',
    success: '#4ADE80',
    warning: '#FBBF24',
    error: '#F87171',
    info: '#60A5FA',
    focus: 'rgba(59, 130, 246, 0.5)',
    selection: 'rgba(59, 130, 246, 0.3)',
    overlay: 'rgba(0, 0, 0, 0.7)'
  }
};

// =============================================================================
// ITEM 961-965: ACCESSIBILITY
// =============================================================================

export interface AccessibilitySettings {
  reduceMotion: boolean;
  reduceTransparency: boolean;
  increaseContrast: boolean;
  colorBlindMode: ColorBlindMode;
  fontSize: FontSizeScale;
  focusIndicators: boolean;
  screenReaderOptimized: boolean;
  keyboardNavigation: boolean;
  captions: boolean;
  audioDescriptions: boolean;
  dyslexiaFont: boolean;
  animationSpeed: number;
}

export type ColorBlindMode = 
  | 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia'
  | 'achromatopsia' | 'protanomaly' | 'deuteranomaly' | 'tritanomaly';

export type FontSizeScale = 'small' | 'normal' | 'large' | 'extra-large';

export interface AccessibilityAuditResult {
  element: string;
  issue: AccessibilityIssue;
  severity: 'error' | 'warning' | 'suggestion';
  message: string;
  fix?: string;
  wcagCriteria?: string;
}

export type AccessibilityIssue = 
  | 'missing-alt' | 'missing-label' | 'low-contrast' | 'missing-heading-structure'
  | 'missing-lang' | 'missing-focus-indicator' | 'keyboard-trap'
  | 'missing-skip-link' | 'invalid-aria' | 'duplicate-id'
  | 'empty-link' | 'empty-button' | 'form-without-label';

export interface FocusTrap {
  id: string;
  container: string;
  firstFocusable?: string;
  lastFocusable?: string;
  initialFocus?: string;
  returnFocus?: string;
  isActive: boolean;
}

export interface KeyboardShortcut {
  id: string;
  keys: string[];
  action: string;
  description: string;
  category: string;
  isGlobal: boolean;
  isEnabled: boolean;
}

// =============================================================================
// ITEM 966-970: LAYOUT SYSTEM
// =============================================================================

export interface LayoutConfig {
  type: LayoutType;
  direction: 'horizontal' | 'vertical';
  gap: number;
  padding: number;
  alignment: Alignment;
  distribution: Distribution;
  wrap: boolean;
  responsive: ResponsiveBreakpoints;
}

export type LayoutType = 'flex' | 'grid' | 'stack' | 'split' | 'dock' | 'float';

export type Alignment = 'start' | 'center' | 'end' | 'stretch' | 'baseline';

export type Distribution = 
  | 'start' | 'center' | 'end' | 'space-between'
  | 'space-around' | 'space-evenly';

export interface ResponsiveBreakpoints {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
}

export const DEFAULT_BREAKPOINTS: ResponsiveBreakpoints = {
  xs: 0,
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
  xxl: 1400
};

export interface GridConfig {
  columns: number;
  rows?: number;
  gap: number;
  rowGap?: number;
  columnGap?: number;
  autoFlow: 'row' | 'column' | 'dense';
  areas?: string[][];
}

// =============================================================================
// ITEM 971-975: UI ENGINE
// =============================================================================

export class UIEngine {
  private activeTheme: Theme;
  private themes: Map<string, Theme> = new Map();
  private animations: Map<string, Animation> = new Map();
  private focusTraps: Map<string, FocusTrap> = new Map();
  private shortcuts: Map<string, KeyboardShortcut> = new Map();
  private accessibilitySettings: AccessibilitySettings;
  private listeners: Map<string, Set<(event: UIEvent) => void>> = new Map();
  
  constructor() {
    // Initialize themes
    this.themes.set('light', DEFAULT_LIGHT_THEME);
    this.themes.set('dark', DEFAULT_DARK_THEME);
    this.activeTheme = DEFAULT_LIGHT_THEME;
    
    // Initialize accessibility
    this.accessibilitySettings = {
      reduceMotion: false,
      reduceTransparency: false,
      increaseContrast: false,
      colorBlindMode: 'none',
      fontSize: 'normal',
      focusIndicators: true,
      screenReaderOptimized: false,
      keyboardNavigation: true,
      captions: false,
      audioDescriptions: false,
      dyslexiaFont: false,
      animationSpeed: 1
    };
    
    // Load animation presets
    for (const preset of ANIMATION_PRESETS) {
      const anim: Animation = {
        ...preset.animation,
        id: preset.name,
        isPlaying: false,
        currentTime: 0
      };
      this.animations.set(preset.name, anim);
    }
  }
  
  // Theme management
  setTheme(themeId: string): void {
    const theme = this.themes.get(themeId);
    if (theme) {
      this.activeTheme = theme;
      this.applyTheme(theme);
      this.emit('theme-changed', { theme });
    }
  }
  
  getTheme(): Theme {
    return { ...this.activeTheme };
  }
  
  createTheme(theme: Omit<Theme, 'id'>): Theme {
    const newTheme: Theme = {
      ...theme,
      id: this.generateId('theme')
    };
    
    this.themes.set(newTheme.id, newTheme);
    this.emit('theme-created', { theme: newTheme });
    return newTheme;
  }
  
  updateTheme(themeId: string, updates: Partial<Theme>): Theme | null {
    const theme = this.themes.get(themeId);
    if (!theme) return null;
    
    Object.assign(theme, updates);
    
    if (this.activeTheme.id === themeId) {
      this.applyTheme(theme);
    }
    
    this.emit('theme-updated', { theme });
    return theme;
  }
  
  deleteTheme(themeId: string): void {
    if (themeId === 'light' || themeId === 'dark') return;
    
    this.themes.delete(themeId);
    
    if (this.activeTheme.id === themeId) {
      this.setTheme('light');
    }
    
    this.emit('theme-deleted', { themeId });
  }
  
  getThemes(): Theme[] {
    return Array.from(this.themes.values());
  }
  
  private applyTheme(theme: Theme): void {
    // Generate CSS variables
    const root = document.documentElement;
    if (!root) return;
    
    // Colors
    for (const [key, value] of Object.entries(theme.colors)) {
      root.style.setProperty(`--color-${this.kebabCase(key)}`, value);
    }
    
    // Typography
    for (const [key, value] of Object.entries(theme.typography)) {
      const cssValue = typeof value === 'number' ? String(value) : value;
      root.style.setProperty(`--typography-${this.kebabCase(key)}`, cssValue);
    }
    
    // Spacing
    for (const [key, value] of Object.entries(theme.spacing)) {
      root.style.setProperty(`--spacing-${key}`, value);
    }
    
    // Borders
    for (const [key, value] of Object.entries(theme.borders)) {
      root.style.setProperty(`--border-${this.kebabCase(key)}`, value);
    }
    
    // Shadows
    for (const [key, value] of Object.entries(theme.shadows)) {
      root.style.setProperty(`--shadow-${key}`, value);
    }
    
    // Animations
    for (const [key, value] of Object.entries(theme.animations)) {
      root.style.setProperty(`--animation-${this.kebabCase(key)}`, value);
    }
    
    // Custom
    for (const [key, value] of Object.entries(theme.custom)) {
      root.style.setProperty(`--${key}`, value);
    }
  }
  
  // Animation management
  playAnimation(animationId: string, target?: HTMLElement): void {
    const animation = this.animations.get(animationId);
    if (!animation) return;
    
    animation.isPlaying = true;
    animation.currentTime = 0;
    
    this.emit('animation-started', { animationId, target });
  }
  
  pauseAnimation(animationId: string): void {
    const animation = this.animations.get(animationId);
    if (animation) {
      animation.isPlaying = false;
      this.emit('animation-paused', { animationId });
    }
  }
  
  stopAnimation(animationId: string): void {
    const animation = this.animations.get(animationId);
    if (animation) {
      animation.isPlaying = false;
      animation.currentTime = 0;
      this.emit('animation-stopped', { animationId });
    }
  }
  
  getAnimation(animationId: string): Animation | undefined {
    return this.animations.get(animationId);
  }
  
  getAnimationPresets(category?: string): AnimationPreset[] {
    if (category) {
      return ANIMATION_PRESETS.filter(p => p.category === category);
    }
    return [...ANIMATION_PRESETS];
  }
  
  // Accessibility
  getAccessibilitySettings(): AccessibilitySettings {
    return { ...this.accessibilitySettings };
  }
  
  updateAccessibilitySettings(settings: Partial<AccessibilitySettings>): void {
    this.accessibilitySettings = { ...this.accessibilitySettings, ...settings };
    this.applyAccessibilitySettings();
    this.emit('accessibility-updated', { settings: this.accessibilitySettings });
  }
  
  private applyAccessibilitySettings(): void {
    const root = document.documentElement;
    if (!root) return;
    
    // Apply settings as data attributes for CSS
    root.setAttribute('data-reduce-motion', String(this.accessibilitySettings.reduceMotion));
    root.setAttribute('data-reduce-transparency', String(this.accessibilitySettings.reduceTransparency));
    root.setAttribute('data-increase-contrast', String(this.accessibilitySettings.increaseContrast));
    root.setAttribute('data-color-blind-mode', this.accessibilitySettings.colorBlindMode);
    root.setAttribute('data-font-size', this.accessibilitySettings.fontSize);
    root.setAttribute('data-dyslexia-font', String(this.accessibilitySettings.dyslexiaFont));
  }
  
  runAccessibilityAudit(): AccessibilityAuditResult[] {
    const results: AccessibilityAuditResult[] = [];
    
    // Check for missing alt attributes
    const images = document.querySelectorAll('img:not([alt])');
    images.forEach((img, i) => {
      results.push({
        element: `img[${i}]`,
        issue: 'missing-alt',
        severity: 'error',
        message: 'Image is missing alt attribute',
        fix: 'Add descriptive alt text or alt="" for decorative images',
        wcagCriteria: '1.1.1'
      });
    });
    
    // Check for missing form labels
    const inputs = document.querySelectorAll('input:not([aria-label]):not([aria-labelledby])');
    inputs.forEach((input, i) => {
      const id = input.getAttribute('id');
      if (!id || !document.querySelector(`label[for="${id}"]`)) {
        results.push({
          element: `input[${i}]`,
          issue: 'form-without-label',
          severity: 'error',
          message: 'Form input is missing associated label',
          fix: 'Add a label element with for attribute matching input id',
          wcagCriteria: '1.3.1'
        });
      }
    });
    
    // Check for empty buttons
    const buttons = document.querySelectorAll('button');
    buttons.forEach((btn, i) => {
      if (!btn.textContent?.trim() && !btn.getAttribute('aria-label')) {
        results.push({
          element: `button[${i}]`,
          issue: 'empty-button',
          severity: 'error',
          message: 'Button has no accessible name',
          fix: 'Add text content or aria-label',
          wcagCriteria: '4.1.2'
        });
      }
    });
    
    this.emit('accessibility-audit-complete', { results });
    return results;
  }
  
  // Focus management
  createFocusTrap(container: string, options?: Partial<FocusTrap>): FocusTrap {
    const trap: FocusTrap = {
      id: this.generateId('trap'),
      container,
      isActive: false,
      ...options
    };
    
    this.focusTraps.set(trap.id, trap);
    this.emit('focus-trap-created', { trap });
    return trap;
  }
  
  activateFocusTrap(trapId: string): void {
    const trap = this.focusTraps.get(trapId);
    if (trap) {
      trap.isActive = true;
      this.emit('focus-trap-activated', { trapId });
    }
  }
  
  deactivateFocusTrap(trapId: string): void {
    const trap = this.focusTraps.get(trapId);
    if (trap) {
      trap.isActive = false;
      this.emit('focus-trap-deactivated', { trapId });
    }
  }
  
  // Keyboard shortcuts
  registerShortcut(shortcut: Omit<KeyboardShortcut, 'id'>): KeyboardShortcut {
    const newShortcut: KeyboardShortcut = {
      ...shortcut,
      id: this.generateId('shortcut')
    };
    
    this.shortcuts.set(newShortcut.id, newShortcut);
    this.emit('shortcut-registered', { shortcut: newShortcut });
    return newShortcut;
  }
  
  unregisterShortcut(shortcutId: string): void {
    this.shortcuts.delete(shortcutId);
    this.emit('shortcut-unregistered', { shortcutId });
  }
  
  getShortcuts(category?: string): KeyboardShortcut[] {
    let shortcuts = Array.from(this.shortcuts.values());
    if (category) {
      shortcuts = shortcuts.filter(s => s.category === category);
    }
    return shortcuts;
  }
  
  // Utilities
  generateCSSVariable(name: string, value: string): string {
    return `--${this.kebabCase(name)}: ${value};`;
  }
  
  getCSSVariable(name: string): string {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(`--${name}`)
      .trim();
  }
  
  private kebabCase(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  }
  
  // Event handling
  on(event: string, callback: (event: UIEvent) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }
  
  off(event: string, callback: (event: UIEvent) => void): void {
    this.listeners.get(event)?.delete(callback);
  }
  
  private emit(event: string, data: Record<string, unknown>): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const uiEvent: UIEvent = { type: event, data, timestamp: Date.now() };
      listeners.forEach(callback => callback(uiEvent));
    }
  }
  
  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

// =============================================================================
// TYPES
// =============================================================================

export interface UIEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createUIEngine = () => new UIEngine();

export default { UIEngine, createUIEngine };
