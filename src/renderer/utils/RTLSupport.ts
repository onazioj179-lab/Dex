// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// RTL Language Support System for DEX
// Complete right-to-left layout support for Arabic, Hebrew, Persian, Urdu, and all RTL languages

const RTL_LOCALES = new Set([
  'ar', 'ar-SA', 'ar-EG', 'ar-AE', 'ar-MA', 'ar-DZ', 'ar-TN', 'ar-LB', 'ar-JO', 'ar-SY', 'ar-IQ', 'ar-KW', 'ar-BH', 'ar-QA', 'ar-OM', 'ar-YE',
  'he', 'he-IL',
  'fa', 'fa-IR',
  'ur', 'ur-PK',
  'ps', 'ps-AF',
  'sd', 'sd-PK',
  'yi',
  'arc',
  'dv', 'dv-MV',
  'ku-Arab',
  'ckb',
  'syr'
]);

const DIRECTIONAL_ICONS = new Set([
  'arrow-left', 'arrow-right', 'chevron-left', 'chevron-right',
  'arrow-back', 'arrow-forward', 'play', 'fast-forward', 'fast-rewind',
  'skip-next', 'skip-previous', 'progress', 'indent', 'outdent',
  'reply', 'forward', 'undo', 'redo', 'sort-ascending', 'sort-descending',
  'text-align-left', 'text-align-right', 'list-bullet', 'list-ordered',
  'panel-left', 'panel-right', 'sidebar-left', 'sidebar-right',
  'navigate-back', 'navigate-forward', 'expand-right', 'collapse-left'
]);

type Direction = 'ltr' | 'rtl';

interface RTLState {
  direction: Direction;
  locale: string;
  isRTL: boolean;
}

type RTLChangeCallback = (state: RTLState) => void;

class RTLManager {
  private state: RTLState = {
    direction: 'ltr',
    locale: 'en',
    isRTL: false
  };

  private changeCallbacks: Set<RTLChangeCallback> = new Set();
  private styleElement: HTMLStyleElement | null = null;

  initialize(locale: string): void {
    this.setLocale(locale);
  }

  setLocale(locale: string): void {
    const isRTL = this.isRTLLocale(locale);
    const direction: Direction = isRTL ? 'rtl' : 'ltr';

    this.state = { direction, locale, isRTL };

    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('dir', direction);
      document.documentElement.setAttribute('lang', locale);
    }

    this.injectRTLOverrides();

    for (const cb of this.changeCallbacks) {
      try { cb(this.state); } catch (_e) { /* ignore */ }
    }
  }

  isRTLLocale(locale: string): boolean {
    if (RTL_LOCALES.has(locale)) return true;
    const base = locale.split('-')[0];
    return RTL_LOCALES.has(base);
  }

  getDirection(): Direction {
    return this.state.direction;
  }

  isRTL(): boolean {
    return this.state.isRTL;
  }

  getLocale(): string {
    return this.state.locale;
  }

  getState(): RTLState {
    return { ...this.state };
  }

  onChange(callback: RTLChangeCallback): () => void {
    this.changeCallbacks.add(callback);
    return () => { this.changeCallbacks.delete(callback); };
  }

  shouldMirrorIcon(iconName: string): boolean {
    return this.state.isRTL && DIRECTIONAL_ICONS.has(iconName);
  }

  getTextDirection(text: string): Direction {
    if (!text || text.length === 0) return this.state.direction;

    let rtlCount = 0;
    let ltrCount = 0;

    for (let i = 0; i < Math.min(text.length, 200); i++) {
      const code = text.charCodeAt(i);
      if ((code >= 0x0590 && code <= 0x05FF) ||
          (code >= 0x0600 && code <= 0x06FF) ||
          (code >= 0x0700 && code <= 0x074F) ||
          (code >= 0x0780 && code <= 0x07BF) ||
          (code >= 0x08A0 && code <= 0x08FF) ||
          (code >= 0xFB50 && code <= 0xFDFF) ||
          (code >= 0xFE70 && code <= 0xFEFF)) {
        rtlCount++;
      } else if ((code >= 0x0041 && code <= 0x005A) ||
                 (code >= 0x0061 && code <= 0x007A) ||
                 (code >= 0x00C0 && code <= 0x024F)) {
        ltrCount++;
      }
    }

    if (rtlCount === 0 && ltrCount === 0) return this.state.direction;
    return rtlCount > ltrCount ? 'rtl' : 'ltr';
  }

  getParagraphDirection(text: string): Direction {
    return this.getTextDirection(text);
  }

  private injectRTLOverrides(): void {
    if (typeof document === 'undefined') return;

    const id = 'dex-rtl-overrides';
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }

    const style = document.createElement('style');
    style.id = id;

    if (this.state.isRTL) {
      style.textContent = `
        :root[dir="rtl"] {
          direction: rtl;
        }

        :root[dir="rtl"] .dex-sidebar {
          order: 1;
        }
        :root[dir="rtl"] .dex-main-content {
          order: 0;
        }

        :root[dir="rtl"] .dex-dock-vertical {
          inset-inline-end: 0;
          inset-inline-start: auto;
        }

        :root[dir="rtl"] .dex-icon-directional {
          transform: scaleX(-1);
        }

        :root[dir="rtl"] p,
        :root[dir="rtl"] .dex-paragraph {
          text-align: start;
        }

        :root[dir="rtl"] .dex-timeline {
          direction: rtl;
        }

        :root[dir="rtl"] .dex-game-hud-health {
          inset-inline-end: var(--spacing-4);
          inset-inline-start: auto;
        }
        :root[dir="rtl"] .dex-game-hud-minimap {
          inset-inline-start: var(--spacing-4);
          inset-inline-end: auto;
        }

        :root[dir="rtl"] [data-number-display] {
          direction: ltr;
          unicode-bidi: isolate;
        }
      `;
    } else {
      style.textContent = `
        :root[dir="ltr"] {
          direction: ltr;
        }
      `;
    }

    document.head.appendChild(style);
    this.styleElement = style;
  }

  destroy(): void {
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }
    this.changeCallbacks.clear();
  }
}

export function injectLogicalPropertyCSS(): void {
  if (typeof document === 'undefined') return;
  const id = 'dex-logical-properties';
  if (document.getElementById(id)) return;

  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    .ml-auto { margin-inline-start: auto; }
    .mr-auto { margin-inline-end: auto; }
    .ml-0 { margin-inline-start: 0; }
    .mr-0 { margin-inline-end: 0; }
    .ml-1 { margin-inline-start: 0.25rem; }
    .mr-1 { margin-inline-end: 0.25rem; }
    .ml-2 { margin-inline-start: 0.5rem; }
    .mr-2 { margin-inline-end: 0.5rem; }
    .ml-3 { margin-inline-start: 0.75rem; }
    .mr-3 { margin-inline-end: 0.75rem; }
    .ml-4 { margin-inline-start: 1rem; }
    .mr-4 { margin-inline-end: 1rem; }

    .pl-0 { padding-inline-start: 0; }
    .pr-0 { padding-inline-end: 0; }
    .pl-1 { padding-inline-start: 0.25rem; }
    .pr-1 { padding-inline-end: 0.25rem; }
    .pl-2 { padding-inline-start: 0.5rem; }
    .pr-2 { padding-inline-end: 0.5rem; }
    .pl-3 { padding-inline-start: 0.75rem; }
    .pr-3 { padding-inline-end: 0.75rem; }
    .pl-4 { padding-inline-start: 1rem; }
    .pr-4 { padding-inline-end: 1rem; }

    .left-0 { inset-inline-start: 0; }
    .right-0 { inset-inline-end: 0; }

    .border-l { border-inline-start-width: 1px; }
    .border-r { border-inline-end-width: 1px; }

    .text-left { text-align: start; }
    .text-right { text-align: end; }

    .float-left { float: inline-start; }
    .float-right { float: inline-end; }

    .rounded-l { border-start-start-radius: 0.25rem; border-end-start-radius: 0.25rem; }
    .rounded-r { border-start-end-radius: 0.25rem; border-end-end-radius: 0.25rem; }
  `;
  document.head.appendChild(style);
}

export const rtlManager = new RTLManager();
export { RTLManager };
export type { RTLState, Direction, RTLChangeCallback };
