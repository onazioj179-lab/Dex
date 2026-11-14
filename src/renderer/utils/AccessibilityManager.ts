// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// WCAG 2.1 AA Accessibility System for DEX
// Complete keyboard navigation, focus management, ARIA, contrast, and screen reader support

interface FocusTrapOptions {
  element: HTMLElement;
  onEscape?: () => void;
  initialFocus?: HTMLElement | string;
  returnFocus?: HTMLElement;
}

interface ContrastResult {
  ratio: number;
  passesAA: boolean;
  passesAALarge: boolean;
  passesAAA: boolean;
}

class AccessibilityManager {
  private focusTraps: Map<HTMLElement, FocusTrap> = new Map();
  private skipNavInjected = false;
  private focusStyleInjected = false;
  private announcer: HTMLElement | null = null;
  private reducedMotion = false;
  private initialized = false;

  initialize(): void {
    if (this.initialized || typeof document === 'undefined') return;

    this.injectFocusStyles();
    this.injectSkipNavigation();
    this.createAnnouncer();
    this.detectReducedMotion();
    this.setupKeyboardDetection();

    this.initialized = true;
  }

  private injectFocusStyles(): void {
    if (this.focusStyleInjected) return;
    const id = 'dex-a11y-focus-styles';
    if (document.getElementById(id)) return;

    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      :focus:not(:focus-visible) {
        outline: none;
      }

      .dex-focus-visible:focus {
        outline: 2px solid var(--dex-focus-color, #ffffff);
        outline-offset: 2px;
      }

      [aria-disabled="true"] {
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: none;
      }

      .dex-skip-nav {
        position: absolute;
        top: -100px;
        left: 0;
        z-index: var(--z-emergency);
        padding: 8px 16px;
        background: var(--color-bg-primary, #fff);
        color: var(--color-text-primary, #000);
        border: 2px solid var(--color-accent-primary, #2563eb);
        font-size: 14px;
        text-decoration: none;
        border-radius: 3px;
      }

      .dex-skip-nav:focus {
        top: 8px;
        left: 8px;
      }

      .dex-sr-only {
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

      .dex-live-region {
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

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      }
    `;
    document.head.appendChild(style);
    this.focusStyleInjected = true;
  }

  private injectSkipNavigation(): void {
    if (this.skipNavInjected) return;
    const existing = document.querySelector('.dex-skip-nav');
    if (existing) return;

    const skipLink = document.createElement('a');
    skipLink.className = 'dex-skip-nav';
    skipLink.href = '#dex-main-content';
    skipLink.textContent = 'Skip to main content';
    skipLink.addEventListener('click', (e) => {
      e.preventDefault();
      const main = document.getElementById('dex-main-content');
      if (main) {
        main.setAttribute('tabindex', '-1');
        main.focus();
        main.removeAttribute('tabindex');
      }
    });

    document.body.insertBefore(skipLink, document.body.firstChild);
    this.skipNavInjected = true;
  }

  private createAnnouncer(): void {
    if (this.announcer) return;

    const polite = document.createElement('div');
    polite.id = 'dex-announcer-polite';
    polite.className = 'dex-live-region';
    polite.setAttribute('aria-live', 'polite');
    polite.setAttribute('aria-atomic', 'true');
    polite.setAttribute('role', 'status');
    document.body.appendChild(polite);

    const assertive = document.createElement('div');
    assertive.id = 'dex-announcer-assertive';
    assertive.className = 'dex-live-region';
    assertive.setAttribute('aria-live', 'assertive');
    assertive.setAttribute('aria-atomic', 'true');
    assertive.setAttribute('role', 'alert');
    document.body.appendChild(assertive);

    this.announcer = polite;
  }

  announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    const id = priority === 'assertive' ? 'dex-announcer-assertive' : 'dex-announcer-polite';
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = '';
    requestAnimationFrame(() => {
      el.textContent = message;
    });
  }

  private detectReducedMotion(): void {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = mq.matches;
    mq.addEventListener('change', (e) => {
      this.reducedMotion = e.matches;
    });
  }

  isReducedMotion(): boolean {
    return this.reducedMotion;
  }

  private setupKeyboardDetection(): void {
    let usingKeyboard = false;

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        usingKeyboard = true;
        document.body.classList.add('dex-keyboard-user');
      }
    });

    document.addEventListener('mousedown', () => {
      usingKeyboard = false;
      document.body.classList.remove('dex-keyboard-user');
    });
  }

  createFocusTrap(options: FocusTrapOptions): FocusTrap {
    const trap = new FocusTrap(options);
    this.focusTraps.set(options.element, trap);
    return trap;
  }

  removeFocusTrap(element: HTMLElement): void {
    const trap = this.focusTraps.get(element);
    if (trap) {
      trap.deactivate();
      this.focusTraps.delete(element);
    }
  }

  moveFocusToPanel(panel: HTMLElement): void {
    const focusable = this.getFirstFocusable(panel);
    if (focusable) {
      focusable.focus();
    } else {
      panel.setAttribute('tabindex', '-1');
      panel.focus();
    }
  }

  getFirstFocusable(container: HTMLElement): HTMLElement | null {
    const focusableSelectors = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
    return container.querySelector(focusableSelectors);
  }

  getAllFocusable(container: HTMLElement): HTMLElement[] {
    const focusableSelectors = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
    return Array.from(container.querySelectorAll(focusableSelectors));
  }

  setAriaLabel(element: HTMLElement, label: string): void {
    element.setAttribute('aria-label', label);
  }

  setAriaExpanded(element: HTMLElement, expanded: boolean): void {
    element.setAttribute('aria-expanded', String(expanded));
  }

  setAriaSelected(element: HTMLElement, selected: boolean): void {
    element.setAttribute('aria-selected', String(selected));
  }

  setAriaBusy(element: HTMLElement, busy: boolean): void {
    element.setAttribute('aria-busy', String(busy));
  }

  setAriaDisabled(element: HTMLElement, disabled: boolean): void {
    element.setAttribute('aria-disabled', String(disabled));
  }

  destroy(): void {
    for (const [, trap] of this.focusTraps) {
      trap.deactivate();
    }
    this.focusTraps.clear();
    this.initialized = false;
  }
}

class FocusTrap {
  private element: HTMLElement;
  private onEscape?: () => void;
  private returnFocusEl?: HTMLElement;
  private active = false;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(options: FocusTrapOptions) {
    this.element = options.element;
    this.onEscape = options.onEscape;
    this.returnFocusEl = options.returnFocus || (document.activeElement as HTMLElement);
  }

  activate(): void {
    if (this.active) return;
    this.active = true;

    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.onEscape) {
        e.preventDefault();
        e.stopPropagation();
        this.onEscape();
        return;
      }

      if (e.key === 'Tab') {
        const focusable = accessibilityManager.getAllFocusable(this.element);
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    this.element.addEventListener('keydown', this.keyHandler);

    requestAnimationFrame(() => {
      const firstFocusable = accessibilityManager.getFirstFocusable(this.element);
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        this.element.setAttribute('tabindex', '-1');
        this.element.focus();
      }
    });
  }

  deactivate(): void {
    if (!this.active) return;
    this.active = false;

    if (this.keyHandler) {
      this.element.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }

    if (this.returnFocusEl && document.body.contains(this.returnFocusEl)) {
      this.returnFocusEl.focus();
    }
  }

  isActive(): boolean {
    return this.active;
  }
}

function getLuminance(r: number, g: number, b: number): number {
  const sRGB = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

function parseColor(color: string): [number, number, number] | null {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16)
      ];
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16)
      ];
    }
  }

  const rgbMatch = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
  }

  return null;
}

// AVAILABLE FOR A FUTURE DEV OVERLAY: checkContrast / getLuminance compute live WCAG ratios for any fg/bg pair and can power an on-screen contrast inspector.
export function checkContrast(foreground: string, background: string): ContrastResult {
  const fg = parseColor(foreground);
  const bg = parseColor(background);

  if (!fg || !bg) {
    return { ratio: 0, passesAA: false, passesAALarge: false, passesAAA: false };
  }

  const l1 = getLuminance(fg[0], fg[1], fg[2]);
  const l2 = getLuminance(bg[0], bg[1], bg[2]);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  const ratio = (lighter + 0.05) / (darker + 0.05);

  return {
    ratio: Math.round(ratio * 100) / 100,
    passesAA: ratio >= 4.5,
    passesAALarge: ratio >= 3,
    passesAAA: ratio >= 7
  };
}

export function checkNonTextContrast(color1: string, color2: string): boolean {
  const result = checkContrast(color1, color2);
  return result.ratio >= 3;
}

export const accessibilityManager = new AccessibilityManager();

export {
  AccessibilityManager,
  FocusTrap,
};
export type {
  FocusTrapOptions,
  ContrastResult
};
