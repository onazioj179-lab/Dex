// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export const T = {
  bg:       'var(--color-bg-base)',
  surface:  'var(--color-bg-surface)',
  inset:    'var(--color-bg-inset)',
  hover:    'var(--color-bg-hover)',
  active:   'var(--color-bg-active)',
  overlay:  'var(--color-bg-overlay)',
  glass:    'var(--color-bg-glass)',
  elevated: 'var(--color-bg-elevated)',
  text1:    'var(--color-text-primary)',
  text2:    'var(--color-text-secondary)',
  text3:    'var(--color-text-tertiary)',
  muted:    'var(--color-text-muted)',
  disabled: 'var(--color-text-disabled)',
  accent:   'var(--color-accent)',
  accentHover: 'var(--color-accent-hover)',
  accentLight: 'var(--color-accent-light)',
  success:  'var(--color-success)',
  warning:  'var(--color-warning)',
  error:    'var(--color-error)',
  border:   'var(--color-border)',
  borderSub:'var(--color-border-subtle)',
} as const;

export function toggleTheme(): void {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  applyTheme(next);
  // User explicitly toggled — pin and stop following OS
  localStorage.setItem('darkMode', (!isDark).toString());
  localStorage.setItem('dex-theme-source', 'user');
}

/**
 * Run a theme change with CSS transitions switched off for that one style
 * pass. Without this, flipping light/dark started a colour transition on every
 * element that declares one (thousands with a few apps open): measured in the
 * packaged app with 7 apps, 2.2 s of style recalculation per switch, 125 ms
 * with transitions suppressed. The suppressing <style> exists only for the
 * flush, so it costs nothing at any other time.
 */
export function withoutTransitions(change: () => void): void {
  if (typeof document === 'undefined') { change(); return; }
  const style = document.createElement('style');
  style.setAttribute('data-dex-theme-switch', '');
  style.textContent = '*,*::before,*::after{transition:none!important}';
  document.head.appendChild(style);
  try {
    change();
    // Flush styles while transitions are off, so none start for the change.
    void getComputedStyle(document.documentElement).color;
  } finally {
    style.remove();
  }
}

/** Set data-theme (and nothing else) without starting colour transitions. */
export function setThemeAttribute(theme: string): void {
  const root = document.documentElement;
  if (root.getAttribute('data-theme') === theme) return;
  withoutTransitions(() => root.setAttribute('data-theme', theme));
}

/** Apply a theme (dark|light) to root + body without persisting. */
export function applyTheme(theme: 'dark' | 'light'): void {
  const isDark = theme === 'dark';
  withoutTransitions(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.classList.toggle('dark-mode', isDark);
    document.body.classList.toggle('light-mode', !isDark);
    document.documentElement.classList.toggle('dark-mode', isDark);
    document.documentElement.classList.toggle('light-mode', !isDark);
  });
}

/**
 * Initialize theme on boot: if user has explicitly chosen one, honor it.
 * Otherwise follow OS prefers-color-scheme and update live as it changes.
 */
export function initTheme(): void {
  try {
    const source = localStorage.getItem('dex-theme-source');
    const stored = localStorage.getItem('darkMode');
    if (source === 'user' && stored !== null) {
      applyTheme(stored === 'true' ? 'dark' : 'light');
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', e => {
      // Only follow OS if the user hasn't pinned a choice
      if (localStorage.getItem('dex-theme-source') !== 'user') {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  } catch {
    applyTheme('dark');
  }
}

/** Reset theme to follow OS again. */
export function followSystemTheme(): void {
  try {
    localStorage.removeItem('dex-theme-source');
    localStorage.removeItem('darkMode');
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(mq.matches ? 'dark' : 'light');
  } catch { /* ignore */ }
}
