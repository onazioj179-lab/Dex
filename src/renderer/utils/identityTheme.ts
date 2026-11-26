// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

export type DexIdentityThemeId = 'monolith';

export interface DexIdentityTheme {
  id: DexIdentityThemeId;
  name: string;
  description: string;
  accent: string;
  canvas: string;
  surface: string;
  preview: readonly [string, string, string];
}

/**
 * DEX Monolith is the product identity: armored geometry, technical precision,
 * and high-contrast instrumentation without character imagery or color accents.
 * The hierarchy is communicated through luminance, line weight, labels, and
 * shape so every system app and creative tool reads as one environment.
 */
export const DEX_IDENTITY_THEMES: readonly DexIdentityTheme[] = [
  {
    id: 'monolith',
    name: 'Monolith',
    description: 'Graphite, alloy, and white signal. The unified DEX system identity.',
    accent: '#F2F2F2',
    canvas: '#08090A',
    surface: '#121416',
    preview: ['#08090A', '#121416', '#F2F2F2'],
  },
] as const;

const THEME_IDS = new Set<string>(DEX_IDENTITY_THEMES.map(theme => theme.id));
const LEGACY_THEME_IDS = new Set(['signal', 'biocore', 'reactor', 'sentinel']);

export function isDexIdentityTheme(value: unknown): value is DexIdentityThemeId {
  return typeof value === 'string' && THEME_IDS.has(value);
}

export function getDexIdentityTheme(id: unknown): DexIdentityTheme {
  if (typeof id === 'string' && LEGACY_THEME_IDS.has(id)) return DEX_IDENTITY_THEMES[0];
  return DEX_IDENTITY_THEMES.find(theme => theme.id === id) ?? DEX_IDENTITY_THEMES[0];
}

export function applyIdentityTheme(id: unknown, persist = true): DexIdentityThemeId {
  const theme = getDexIdentityTheme(id);
  document.documentElement.setAttribute('data-dex-identity', theme.id);
  document.documentElement.setAttribute('data-dex-monochrome', 'true');
  if (persist) {
    try { localStorage.setItem('dex-identity-theme', theme.id); } catch { /* storage unavailable */ }
  }
  return theme.id;
}

/** Apply the saved identity before React paints. */
export function initializeIdentityTheme(): DexIdentityThemeId {
  let saved: unknown = null;
  try {
    const settings = localStorage.getItem('dex-settings');
    if (settings) saved = JSON.parse(settings)?.identityTheme;
    if (!isDexIdentityTheme(saved)) saved = localStorage.getItem('dex-identity-theme');
  } catch {
    saved = null;
  }
  return applyIdentityTheme(saved, false);
}
