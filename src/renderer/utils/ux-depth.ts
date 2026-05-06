// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX UX Depth (Phase 7: Items 1276-1350)
// Accessibility, micro-interactions, haptics, sound design, polish
// =============================================================================

// =============================================================================
// ACCESSIBILITY ENHANCEMENTS (Items 1276-1300)
// =============================================================================

// ---------------------------------------------------------------------------
// 1276-1280. Screen Reader Support
// ---------------------------------------------------------------------------

export interface AriaLiveRegion {
  id: string;
  politeness: 'polite' | 'assertive' | 'off';
  atomic: boolean;
  relevant: ('additions' | 'removals' | 'text' | 'all')[];
}

export function createLiveRegion(config: Partial<AriaLiveRegion> = {}): HTMLElement {
  const region = document.createElement('div');
  region.id = config.id || `live-region-${Date.now()}`;
  region.setAttribute('aria-live', config.politeness || 'polite');
  region.setAttribute('aria-atomic', String(config.atomic ?? true));
  
  if (config.relevant) {
    region.setAttribute('aria-relevant', config.relevant.join(' '));
  }
  
  // Visually hidden but accessible
  Object.assign(region.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    padding: '0',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: '0',
  });
  
  document.body.appendChild(region);
  return region;
}

export function announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  const regionId = `sr-announce-${priority}`;
  let region = document.getElementById(regionId);
  
  if (!region) {
    region = createLiveRegion({ id: regionId, politeness: priority });
  }
  
  // Clear and re-announce
  region.textContent = '';
  setTimeout(() => {
    region!.textContent = message;
  }, 100);
}

export interface ScreenReaderHint {
  label: string;
  description?: string;
  shortcut?: string;
  role?: string;
  state?: Record<string, string | boolean>;
}

export function applyScreenReaderHints(element: HTMLElement, hints: ScreenReaderHint): void {
  if (hints.label) {
    element.setAttribute('aria-label', hints.label);
  }
  
  if (hints.description) {
    const descId = `desc-${Date.now()}`;
    const descEl = document.createElement('span');
    descEl.id = descId;
    descEl.textContent = hints.description;
    descEl.style.display = 'none';
    element.appendChild(descEl);
    element.setAttribute('aria-describedby', descId);
  }
  
  if (hints.shortcut) {
    element.setAttribute('aria-keyshortcuts', hints.shortcut);
  }
  
  if (hints.role) {
    element.setAttribute('role', hints.role);
  }
  
  if (hints.state) {
    for (const [key, value] of Object.entries(hints.state)) {
      element.setAttribute(`aria-${key}`, String(value));
    }
  }
}

// ---------------------------------------------------------------------------
// 1281-1285. Focus Management
// ---------------------------------------------------------------------------

export interface FocusTrap {
  activate: () => void;
  deactivate: () => void;
  pause: () => void;
  resume: () => void;
}

export function createFocusTrap(
  container: HTMLElement,
  options: {
    initialFocus?: HTMLElement | string;
    returnFocus?: boolean;
    escapeDeactivates?: boolean;
    clickOutsideDeactivates?: boolean;
    onActivate?: () => void;
    onDeactivate?: () => void;
  } = {}
): FocusTrap {
  let active = false;
  let paused = false;
  let previousFocus: HTMLElement | null = null;
  
  const getFocusableElements = (): HTMLElement[] => {
    const selector = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]',
    ].join(',');
    
    return Array.from(container.querySelectorAll(selector)) as HTMLElement[];
  };
  
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!active || paused) return;
    
    if (e.key === 'Escape' && options.escapeDeactivates) {
      deactivate();
      return;
    }
    
    if (e.key !== 'Tab') return;
    
    const focusable = getFocusableElements();
    if (focusable.length === 0) return;
    
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  
  const handleClickOutside = (e: MouseEvent) => {
    if (!active || paused) return;
    if (!options.clickOutsideDeactivates) return;
    if (!container.contains(e.target as Node)) {
      deactivate();
    }
  };
  
  const activate = () => {
    if (active) return;
    
    previousFocus = document.activeElement as HTMLElement;
    active = true;
    
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleClickOutside);
    
    // Set initial focus
    const focusable = getFocusableElements();
    let initialElement: HTMLElement | null = null;
    
    if (typeof options.initialFocus === 'string') {
      initialElement = container.querySelector(options.initialFocus);
    } else if (options.initialFocus) {
      initialElement = options.initialFocus;
    } else if (focusable.length > 0) {
      initialElement = focusable[0];
    }
    
    initialElement?.focus();
    options.onActivate?.();
  };
  
  const deactivate = () => {
    if (!active) return;
    
    active = false;
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('click', handleClickOutside);
    
    if (options.returnFocus && previousFocus) {
      previousFocus.focus();
    }
    
    options.onDeactivate?.();
  };
  
  return {
    activate,
    deactivate,
    pause: () => { paused = true; },
    resume: () => { paused = false; },
  };
}

export interface FocusRing {
  visible: boolean;
  offset: number;
  width: number;
  color: string;
  style: 'solid' | 'dashed' | 'double';
  radius?: number;
}

export const defaultFocusRing: FocusRing = {
  visible: true,
  offset: 2,
  width: 2,
  color: 'var(--accent-primary)',
  style: 'solid',
};

export function getFocusRingStyles(ring: FocusRing): string {
  if (!ring.visible) return 'outline: none;';
  
  return `
    outline: ${ring.width}px ${ring.style} ${ring.color};
    outline-offset: ${ring.offset}px;
    ${ring.radius ? `border-radius: ${ring.radius}px;` : ''}
  `;
}

// ---------------------------------------------------------------------------
// 1286-1290. Keyboard Navigation
// ---------------------------------------------------------------------------

export interface KeyboardNavigationConfig {
  roving: boolean;
  wrap: boolean;
  orientation: 'horizontal' | 'vertical' | 'both';
  homeEndKeys: boolean;
  typeahead: boolean;
  typeaheadTimeout: number;
}

export const defaultKeyboardNavConfig: KeyboardNavigationConfig = {
  roving: true,
  wrap: true,
  orientation: 'vertical',
  homeEndKeys: true,
  typeahead: true,
  typeaheadTimeout: 500,
};

export function createKeyboardNavigator(
  items: HTMLElement[],
  config: Partial<KeyboardNavigationConfig> = {}
): {
  handleKeyDown: (e: KeyboardEvent) => void;
  setActiveIndex: (index: number) => void;
  getActiveIndex: () => number;
} {
  const cfg = { ...defaultKeyboardNavConfig, ...config };
  let activeIndex = 0;
  let typeaheadBuffer = '';
  let typeaheadTimer: ReturnType<typeof setTimeout> | null = null;
  
  const updateTabIndex = () => {
    if (!cfg.roving) return;
    
    items.forEach((item, index) => {
      item.tabIndex = index === activeIndex ? 0 : -1;
    });
  };
  
  const setActiveIndex = (index: number) => {
    if (index < 0 || index >= items.length) return;
    
    activeIndex = index;
    updateTabIndex();
    items[activeIndex].focus();
  };
  
  const moveNext = () => {
    let next = activeIndex + 1;
    if (next >= items.length) {
      next = cfg.wrap ? 0 : activeIndex;
    }
    setActiveIndex(next);
  };
  
  const movePrev = () => {
    let prev = activeIndex - 1;
    if (prev < 0) {
      prev = cfg.wrap ? items.length - 1 : 0;
    }
    setActiveIndex(prev);
  };
  
  const handleTypeahead = (char: string) => {
    if (!cfg.typeahead) return false;
    
    if (typeaheadTimer) {
      clearTimeout(typeaheadTimer);
    }
    
    typeaheadBuffer += char.toLowerCase();
    
    typeaheadTimer = setTimeout(() => {
      typeaheadBuffer = '';
    }, cfg.typeaheadTimeout);
    
    // Find matching item
    const match = items.findIndex(item => {
      const text = item.textContent?.toLowerCase() || '';
      return text.startsWith(typeaheadBuffer);
    });
    
    if (match !== -1) {
      setActiveIndex(match);
      return true;
    }
    
    return false;
  };
  
  const handleKeyDown = (e: KeyboardEvent) => {
    const isHorizontal = cfg.orientation === 'horizontal' || cfg.orientation === 'both';
    const isVertical = cfg.orientation === 'vertical' || cfg.orientation === 'both';
    
    switch (e.key) {
      case 'ArrowDown':
        if (isVertical) {
          e.preventDefault();
          moveNext();
        }
        break;
        
      case 'ArrowUp':
        if (isVertical) {
          e.preventDefault();
          movePrev();
        }
        break;
        
      case 'ArrowRight':
        if (isHorizontal) {
          e.preventDefault();
          moveNext();
        }
        break;
        
      case 'ArrowLeft':
        if (isHorizontal) {
          e.preventDefault();
          movePrev();
        }
        break;
        
      case 'Home':
        if (cfg.homeEndKeys) {
          e.preventDefault();
          setActiveIndex(0);
        }
        break;
        
      case 'End':
        if (cfg.homeEndKeys) {
          e.preventDefault();
          setActiveIndex(items.length - 1);
        }
        break;
        
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (handleTypeahead(e.key)) {
            e.preventDefault();
          }
        }
    }
  };
  
  // Initialize
  updateTabIndex();
  
  return {
    handleKeyDown,
    setActiveIndex,
    getActiveIndex: () => activeIndex,
  };
}

// ---------------------------------------------------------------------------
// 1291-1295. Color Contrast & Vision
// ---------------------------------------------------------------------------

export interface ColorContrastResult {
  ratio: number;
  AA: { normal: boolean; large: boolean };
  AAA: { normal: boolean; large: boolean };
}

export function getContrastRatio(color1: string, color2: string): ColorContrastResult {
  const lum1 = getRelativeLuminance(parseColor(color1));
  const lum2 = getRelativeLuminance(parseColor(color2));
  
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  
  const ratio = (lighter + 0.05) / (darker + 0.05);
  
  return {
    ratio,
    AA: {
      normal: ratio >= 4.5,
      large: ratio >= 3,
    },
    AAA: {
      normal: ratio >= 7,
      large: ratio >= 4.5,
    },
  };
}

function parseColor(color: string): { r: number; g: number; b: number } {
  // Handle hex
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return { r, g, b };
  }
  
  // Handle rgb/rgba
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return {
      r: parseInt(match[1]),
      g: parseInt(match[2]),
      b: parseInt(match[3]),
    };
  }
  
  return { r: 0, g: 0, b: 0 };
}

function getRelativeLuminance(color: { r: number; g: number; b: number }): number {
  const { r, g, b } = color;
  
  const srgb = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export type ColorBlindnessType = 
  | 'protanopia' 
  | 'deuteranopia' 
  | 'tritanopia' 
  | 'achromatopsia';

export function simulateColorBlindness(
  color: { r: number; g: number; b: number },
  type: ColorBlindnessType
): { r: number; g: number; b: number } {
  const { r, g, b } = color;
  
  // Simulation matrices
  const matrices: Record<ColorBlindnessType, number[][]> = {
    protanopia: [
      [0.567, 0.433, 0],
      [0.558, 0.442, 0],
      [0, 0.242, 0.758],
    ],
    deuteranopia: [
      [0.625, 0.375, 0],
      [0.7, 0.3, 0],
      [0, 0.3, 0.7],
    ],
    tritanopia: [
      [0.95, 0.05, 0],
      [0, 0.433, 0.567],
      [0, 0.475, 0.525],
    ],
    achromatopsia: [
      [0.299, 0.587, 0.114],
      [0.299, 0.587, 0.114],
      [0.299, 0.587, 0.114],
    ],
  };
  
  const m = matrices[type];
  
  return {
    r: Math.round(m[0][0] * r + m[0][1] * g + m[0][2] * b),
    g: Math.round(m[1][0] * r + m[1][1] * g + m[1][2] * b),
    b: Math.round(m[2][0] * r + m[2][1] * g + m[2][2] * b),
  };
}

// ---------------------------------------------------------------------------
// 1296-1300. Reduced Motion
// ---------------------------------------------------------------------------

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function watchReducedMotion(callback: (prefersReduced: boolean) => void): () => void {
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  
  const handler = (e: MediaQueryListEvent) => callback(e.matches);
  
  mediaQuery.addEventListener('change', handler);
  
  // Call immediately with current value
  callback(mediaQuery.matches);
  
  return () => mediaQuery.removeEventListener('change', handler);
}

export interface MotionSafeAnimation {
  default: {
    duration: number;
    easing: string;
    keyframes: Keyframe[];
  };
  reduced: {
    duration: number;
    easing: string;
    keyframes: Keyframe[];
  };
}

export function getMotionSafeAnimation(animation: MotionSafeAnimation): {
  duration: number;
  easing: string;
  keyframes: Keyframe[];
} {
  return prefersReducedMotion() ? animation.reduced : animation.default;
}

export const fadeInAnimation: MotionSafeAnimation = {
  default: {
    duration: 200,
    easing: 'ease-out',
    keyframes: [
      { opacity: 0, transform: 'translateY(10px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
  },
  reduced: {
    duration: 150,
    easing: 'ease-out',
    keyframes: [
      { opacity: 0 },
      { opacity: 1 },
    ],
  },
};

export const slideInAnimation: MotionSafeAnimation = {
  default: {
    duration: 300,
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    keyframes: [
      { transform: 'translateX(100%)' },
      { transform: 'translateX(0)' },
    ],
  },
  reduced: {
    duration: 0,
    easing: 'linear',
    keyframes: [
      { opacity: 1 },
      { opacity: 1 },
    ],
  },
};


// =============================================================================
// MICRO-INTERACTIONS (Items 1301-1320)
// =============================================================================

// ---------------------------------------------------------------------------
// 1301-1305. Button Interactions
// ---------------------------------------------------------------------------

export interface ButtonInteractionConfig {
  pressScale: number;
  hoverScale: number;
  tapDuration: number;
  rippleEnabled: boolean;
  rippleColor: string;
}

export const defaultButtonInteraction: ButtonInteractionConfig = {
  pressScale: 0.97,
  hoverScale: 1.02,
  tapDuration: 150,
  rippleEnabled: true,
  rippleColor: 'rgba(255, 255, 255, 0.3)',
};

export function createRippleEffect(
  element: HTMLElement,
  event: MouseEvent,
  config: Partial<ButtonInteractionConfig> = {}
): void {
  const cfg = { ...defaultButtonInteraction, ...config };
  if (!cfg.rippleEnabled) return;
  
  const rect = element.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  
  const ripple = document.createElement('span');
  const size = Math.max(rect.width, rect.height) * 2;
  
  Object.assign(ripple.style, {
    position: 'absolute',
    left: `${x - size / 2}px`,
    top: `${y - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    backgroundColor: cfg.rippleColor,
    transform: 'scale(0)',
    opacity: '1',
    pointerEvents: 'none',
  });
  
  // Ensure parent has position
  const computedStyle = getComputedStyle(element);
  if (computedStyle.position === 'static') {
    element.style.position = 'relative';
  }
  element.style.overflow = 'hidden';
  
  element.appendChild(ripple);
  
  // Animate
  ripple.animate([
    { transform: 'scale(0)', opacity: '1' },
    { transform: 'scale(1)', opacity: '0' },
  ], {
    duration: 600,
    easing: 'ease-out',
  }).onfinish = () => ripple.remove();
}

// ---------------------------------------------------------------------------
// 1306-1310. Hover States
// ---------------------------------------------------------------------------

export interface HoverState {
  scale: number;
  translateY: number;
  shadowIntensity: number;
  brightness: number;
  transition: string;
}

export const defaultHoverState: HoverState = {
  scale: 1.02,
  translateY: -2,
  shadowIntensity: 1.2,
  brightness: 1.05,
  transition: 'transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease',
};

export function getHoverTransform(state: HoverState, isHovered: boolean): string {
  if (!isHovered) {
    return 'transform: scale(1) translateY(0); filter: brightness(1);';
  }
  
  return `
    transform: scale(${state.scale}) translateY(${state.translateY}px);
    filter: brightness(${state.brightness});
    transition: ${state.transition};
  `;
}

export interface MagneticHoverConfig {
  strength: number;
  radius: number;
}

export function createMagneticHover(
  element: HTMLElement,
  config: MagneticHoverConfig = { strength: 0.3, radius: 100 }
): () => void {
  const handleMouseMove = (e: MouseEvent) => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const deltaX = e.clientX - centerX;
    const deltaY = e.clientY - centerY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    if (distance < config.radius) {
      const strength = (1 - distance / config.radius) * config.strength;
      const moveX = deltaX * strength;
      const moveY = deltaY * strength;
      
      element.style.transform = `translate(${moveX}px, ${moveY}px)`;
    }
  };
  
  const handleMouseLeave = () => {
    element.style.transform = 'translate(0, 0)';
  };
  
  element.addEventListener('mousemove', handleMouseMove);
  element.addEventListener('mouseleave', handleMouseLeave);
  
  return () => {
    element.removeEventListener('mousemove', handleMouseMove);
    element.removeEventListener('mouseleave', handleMouseLeave);
  };
}

// ---------------------------------------------------------------------------
// 1311-1315. Loading States
// ---------------------------------------------------------------------------

export interface LoadingIndicator {
  type: 'spinner' | 'dots' | 'progress' | 'skeleton' | 'pulse';
  size: 'small' | 'medium' | 'large';
  color: string;
}

export function createLoadingSpinner(config: Partial<LoadingIndicator> = {}): string {
  const { type = 'spinner', size = 'medium', color = 'var(--accent-primary)' } = config;
  
  const sizes = { small: 16, medium: 24, large: 36 };
  const s = sizes[size];
  
  switch (type) {
    case 'spinner':
      return `
        <svg width="${s}" height="${s}" viewBox="0 0 24 24" class="loading-spinner">
          <circle cx="12" cy="12" r="10" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="31.4" stroke-linecap="round">
            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
          </circle>
        </svg>
      `;
    
    case 'dots':
      return `
        <div class="loading-dots" style="display: flex; gap: 4px;">
          ${[0, 1, 2].map(i => `
            <div style="width: ${s/3}px; height: ${s/3}px; border-radius: 50%; background: ${color}; animation: loadingDot 1.4s ease-in-out ${i * 0.16}s infinite both;"></div>
          `).join('')}
        </div>
      `;
    
    case 'pulse':
      return `
        <div style="width: ${s}px; height: ${s}px; border-radius: 50%; background: ${color}; animation: loadingPulse 1.5s ease-in-out infinite;"></div>
      `;
    
    default:
      return '';
  }
}

export interface SkeletonConfig {
  width: string;
  height: string;
  borderRadius: string;
  animation: 'shimmer' | 'pulse' | 'wave';
}

export function createSkeletonStyle(config: Partial<SkeletonConfig> = {}): string {
  const {
    width = '100%',
    height = '1em',
    borderRadius = '4px',
    animation = 'shimmer',
  } = config;
  
  const animations: Record<string, string> = {
    shimmer: 'background: linear-gradient(90deg, var(--surface-secondary) 25%, var(--surface-tertiary) 50%, var(--surface-secondary) 75%); background-size: 200% 100%; animation: skeletonShimmer 1.5s infinite;',
    pulse: 'background: var(--surface-secondary); animation: skeletonPulse 1.5s ease-in-out infinite;',
    wave: 'background: var(--surface-secondary); animation: skeletonWave 1.5s ease-in-out infinite;',
  };
  
  return `
    width: ${width};
    height: ${height};
    border-radius: ${borderRadius};
    ${animations[animation]}
  `;
}

// ---------------------------------------------------------------------------
// 1316-1320. Transitions
// ---------------------------------------------------------------------------

export interface PageTransition {
  enter: Keyframe[];
  exit: Keyframe[];
  duration: number;
  easing: string;
}

export const pageTransitions: Record<string, PageTransition> = {
  fade: {
    enter: [{ opacity: 0 }, { opacity: 1 }],
    exit: [{ opacity: 1 }, { opacity: 0 }],
    duration: 200,
    easing: 'ease-out',
  },
  slideUp: {
    enter: [
      { opacity: 0, transform: 'translateY(20px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    exit: [
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(-20px)' },
    ],
    duration: 300,
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  },
  slideRight: {
    enter: [
      { opacity: 0, transform: 'translateX(-100%)' },
      { opacity: 1, transform: 'translateX(0)' },
    ],
    exit: [
      { opacity: 1, transform: 'translateX(0)' },
      { opacity: 0, transform: 'translateX(100%)' },
    ],
    duration: 300,
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  },
  scale: {
    enter: [
      { opacity: 0, transform: 'scale(0.95)' },
      { opacity: 1, transform: 'scale(1)' },
    ],
    exit: [
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(1.05)' },
    ],
    duration: 250,
    easing: 'ease-out',
  },
};

export async function animatePageTransition(
  outgoing: HTMLElement | null,
  incoming: HTMLElement,
  transition: PageTransition
): Promise<void> {
  const options: KeyframeAnimationOptions = {
    duration: transition.duration,
    easing: transition.easing,
    fill: 'forwards',
  };
  
  // Animate out
  if (outgoing) {
    await outgoing.animate(transition.exit, options).finished;
    outgoing.style.display = 'none';
  }
  
  // Animate in
  incoming.style.display = '';
  await incoming.animate(transition.enter, options).finished;
}


// =============================================================================
// HAPTICS & SOUND DESIGN (Items 1321-1340)
// =============================================================================

// ---------------------------------------------------------------------------
// 1321-1325. Haptic Feedback
// ---------------------------------------------------------------------------

export type HapticType = 
  | 'light'
  | 'medium'
  | 'heavy'
  | 'selection'
  | 'success'
  | 'warning'
  | 'error';

export interface HapticPattern {
  type: HapticType;
  duration: number;
  intensity: number;
}

const hapticPatterns: Record<HapticType, HapticPattern> = {
  light: { type: 'light', duration: 10, intensity: 0.3 },
  medium: { type: 'medium', duration: 20, intensity: 0.5 },
  heavy: { type: 'heavy', duration: 30, intensity: 0.8 },
  selection: { type: 'selection', duration: 15, intensity: 0.4 },
  success: { type: 'success', duration: 25, intensity: 0.6 },
  warning: { type: 'warning', duration: 35, intensity: 0.7 },
  error: { type: 'error', duration: 50, intensity: 0.9 },
};

export function triggerHaptic(type: HapticType): void {
  const pattern = hapticPatterns[type];
  
  // Check for Vibration API support
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern.duration);
  }
}

export function triggerHapticPattern(pattern: number[]): void {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

// ---------------------------------------------------------------------------
// 1326-1335. Sound Design
// ---------------------------------------------------------------------------

export interface SoundEffect {
  id: string;
  name: string;
  url?: string;
  oscillatorType?: OscillatorType;
  frequency?: number;
  duration: number;
  volume: number;
  category: SoundCategory;
}

export type SoundCategory = 
  | 'ui'
  | 'notification'
  | 'success'
  | 'error'
  | 'ambient';

export class SoundManager {
  private audioContext: AudioContext | null = null;
  private sounds = new Map<string, SoundEffect>();
  private buffers = new Map<string, AudioBuffer>();
  private masterVolume = 0.5;
  private enabled = true;
  private categoryVolumes = new Map<SoundCategory, number>();
  
  constructor() {
    // Initialize with default category volumes
    const categories: SoundCategory[] = ['ui', 'notification', 'success', 'error', 'ambient'];
    categories.forEach(cat => this.categoryVolumes.set(cat, 1));
  }
  
  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }
  
  async loadSound(sound: SoundEffect): Promise<void> {
    this.sounds.set(sound.id, sound);
    
    if (sound.url) {
      try {
        const response = await fetch(sound.url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.getContext().decodeAudioData(arrayBuffer);
        this.buffers.set(sound.id, audioBuffer);
      } catch (e) {
        console.error(`Failed to load sound ${sound.id}:`, e);
      }
    }
  }
  
  play(soundId: string): void {
    if (!this.enabled) return;
    
    const sound = this.sounds.get(soundId);
    if (!sound) return;
    
    const ctx = this.getContext();
    const categoryVolume = this.categoryVolumes.get(sound.category) || 1;
    const finalVolume = this.masterVolume * sound.volume * categoryVolume;
    
    if (sound.url && this.buffers.has(soundId)) {
      // Play from buffer
      const source = ctx.createBufferSource();
      source.buffer = this.buffers.get(soundId)!;
      
      const gainNode = ctx.createGain();
      gainNode.gain.value = finalVolume;
      
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start();
    } else if (sound.oscillatorType && sound.frequency) {
      // Synthesize sound
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.type = sound.oscillatorType;
      oscillator.frequency.value = sound.frequency;
      
      gainNode.gain.setValueAtTime(finalVolume, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + sound.duration / 1000);
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.start();
      oscillator.stop(ctx.currentTime + sound.duration / 1000);
    }
  }
  
  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }
  
  setCategoryVolume(category: SoundCategory, volume: number): void {
    this.categoryVolumes.set(category, Math.max(0, Math.min(1, volume)));
  }
  
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  
  getMasterVolume(): number {
    return this.masterVolume;
  }
  
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Pre-defined UI sounds
export const uiSounds: SoundEffect[] = [
  {
    id: 'click',
    name: 'Click',
    oscillatorType: 'sine',
    frequency: 800,
    duration: 50,
    volume: 0.3,
    category: 'ui',
  },
  {
    id: 'hover',
    name: 'Hover',
    oscillatorType: 'sine',
    frequency: 600,
    duration: 30,
    volume: 0.1,
    category: 'ui',
  },
  {
    id: 'success',
    name: 'Success',
    oscillatorType: 'sine',
    frequency: 1200,
    duration: 150,
    volume: 0.4,
    category: 'success',
  },
  {
    id: 'error',
    name: 'Error',
    oscillatorType: 'sawtooth',
    frequency: 200,
    duration: 200,
    volume: 0.3,
    category: 'error',
  },
  {
    id: 'notification',
    name: 'Notification',
    oscillatorType: 'sine',
    frequency: 880,
    duration: 100,
    volume: 0.5,
    category: 'notification',
  },
];

// ---------------------------------------------------------------------------
// 1336-1340. Combined Feedback
// ---------------------------------------------------------------------------

export interface FeedbackConfig {
  haptic: boolean;
  sound: boolean;
  visual: boolean;
}

export const defaultFeedbackConfig: FeedbackConfig = {
  haptic: true,
  sound: true,
  visual: true,
};

export function triggerFeedback(
  type: 'tap' | 'success' | 'error' | 'warning',
  config: Partial<FeedbackConfig> = {}
): void {
  const cfg = { ...defaultFeedbackConfig, ...config };
  
  if (cfg.haptic) {
    const hapticMap: Record<string, HapticType> = {
      tap: 'light',
      success: 'success',
      error: 'error',
      warning: 'warning',
    };
    triggerHaptic(hapticMap[type]);
  }
  
  // Sound would be played through SoundManager instance
  // Visual feedback handled by caller
}


// =============================================================================
// FINAL POLISH (Items 1341-1350)
// =============================================================================

// ---------------------------------------------------------------------------
// 1341-1345. App Polish
// ---------------------------------------------------------------------------

export interface AppState {
  isReady: boolean;
  isLoading: boolean;
  hasError: boolean;
  error?: Error;
}

export function createAppInitializer(
  tasks: Array<{ name: string; run: () => Promise<void> }>
): {
  initialize: () => Promise<void>;
  getProgress: () => { current: number; total: number; currentTask: string };
  onProgress: (callback: (progress: number, task: string) => void) => () => void;
} {
  let currentTaskIndex = 0;
  let currentTaskName = '';
  const listeners = new Set<(progress: number, task: string) => void>();
  
  const notifyProgress = () => {
    const progress = currentTaskIndex / tasks.length;
    for (const listener of listeners) {
      listener(progress, currentTaskName);
    }
  };
  
  return {
    async initialize() {
      for (let i = 0; i < tasks.length; i++) {
        currentTaskIndex = i;
        currentTaskName = tasks[i].name;
        notifyProgress();
        
        await tasks[i].run();
      }
      
      currentTaskIndex = tasks.length;
      notifyProgress();
    },
    
    getProgress() {
      return {
        current: currentTaskIndex,
        total: tasks.length,
        currentTask: currentTaskName,
      };
    },
    
    onProgress(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  };
}

export interface SplashScreenConfig {
  logo: string;
  backgroundColor: string;
  textColor: string;
  progressColor: string;
  minDisplayTime: number;
}

export const defaultSplashConfig: SplashScreenConfig = {
  logo: '/logo.svg',
  backgroundColor: '#0a0a0a',
  textColor: '#ffffff',
  progressColor: '#3B82F6',
  minDisplayTime: 1500,
};

// ---------------------------------------------------------------------------
// 1346-1350. Performance Optimizations
// ---------------------------------------------------------------------------

export function deferNonCritical<T>(fn: () => T): Promise<T> {
  return new Promise((resolve) => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => resolve(fn()));
    } else {
      setTimeout(() => resolve(fn()), 0);
    }
  });
}

export function preloadResources(urls: string[]): void {
  urls.forEach(url => {
    const link = document.createElement('link');
    link.rel = 'preload';
    
    // Determine type
    if (url.endsWith('.js')) {
      link.as = 'script';
    } else if (url.endsWith('.css')) {
      link.as = 'style';
    } else if (url.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i)) {
      link.as = 'image';
    } else if (url.match(/\.(woff|woff2|ttf|otf)$/i)) {
      link.as = 'font';
      link.crossOrigin = 'anonymous';
    }
    
    link.href = url;
    document.head.appendChild(link);
  });
}

export function prefetchRoutes(routes: string[]): void {
  routes.forEach(route => {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = route;
    document.head.appendChild(link);
  });
}

export interface PerformanceMarks {
  mark: (name: string) => void;
  measure: (name: string, startMark: string, endMark?: string) => number;
  getMarks: () => PerformanceEntry[];
  getMeasures: () => PerformanceEntry[];
  clear: () => void;
}

export function createPerformanceTracker(): PerformanceMarks {
  const prefix = 'dex-';
  
  return {
    mark(name: string) {
      performance.mark(prefix + name);
    },
    
    measure(name: string, startMark: string, endMark?: string) {
      const measureName = prefix + name;
      
      performance.measure(
        measureName,
        prefix + startMark,
        endMark ? prefix + endMark : undefined
      );
      
      const entries = performance.getEntriesByName(measureName, 'measure');
      return entries.length > 0 ? entries[entries.length - 1].duration : 0;
    },
    
    getMarks() {
      return performance.getEntriesByType('mark').filter(e => e.name.startsWith(prefix));
    },
    
    getMeasures() {
      return performance.getEntriesByType('measure').filter(e => e.name.startsWith(prefix));
    },
    
    clear() {
      performance.clearMarks();
      performance.clearMeasures();
    },
  };
}

// Final exports bundle
export const DEX_VERSION = '3.5.0';
export const DEX_BUILD_DATE = new Date().toISOString();

export interface DEXConfig {
  version: string;
  features: {
    premiumUI: boolean;
    privacyFirst: boolean;
    accessibility: boolean;
    haptics: boolean;
    soundEffects: boolean;
  };
  performance: {
    virtualLists: boolean;
    lazyLoading: boolean;
    requestBatching: boolean;
  };
}

export const defaultDEXConfig: DEXConfig = {
  version: DEX_VERSION,
  features: {
    premiumUI: true,
    privacyFirst: true,
    accessibility: true,
    haptics: true,
    soundEffects: true,
  },
  performance: {
    virtualLists: true,
    lazyLoading: true,
    requestBatching: true,
  },
};


// =============================================================================
// EXPORTS
// =============================================================================

export {
  hapticPatterns,
};
