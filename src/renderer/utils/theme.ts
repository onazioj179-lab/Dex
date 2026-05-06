// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
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
  document.documentElement.setAttribute('data-theme', next);
  document.body.classList.toggle('dark-mode', !isDark);
  document.body.classList.toggle('light-mode', isDark);
  document.documentElement.classList.toggle('dark-mode', !isDark);
  document.documentElement.classList.toggle('light-mode', isDark);
  localStorage.setItem('darkMode', (!isDark).toString());
}
