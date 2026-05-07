// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Lightweight i18n helpers: ICU-lite message format, RTL detection,
 * locale fallback chain.
 */

// DEX v3.8.9 - i18n

/**
 * Format messages with `{name}` substitution and `{count, plural, one{...} other{...}}`
 * pluralisation.
 *
 * Not a full ICU implementation; covers the cases the renderer actually
 * needs without pulling a heavy library.
 */
export function format(template: string, vars: Record<string, string | number>): string {
  // Plural blocks first.
  let out = template.replace(
    /\{(\w+),\s*plural,\s*one\{([^}]*)\}\s*other\{([^}]*)\}\s*\}/g,
    (_full, name: string, one: string, other: string) => {
      const n = Number(vars[name] ?? 0);
      const branch = n === 1 ? one : other;
      return branch.replace(/#/g, String(n));
    },
  );
  // Simple {name} replacement.
  out = out.replace(/\{(\w+)\}/g, (_full, name: string) => {
    if (vars[name] === undefined) return `{${name}}`;
    return String(vars[name]);
  });
  return out;
}

const RTL_LOCALES = new Set(['ar', 'fa', 'he', 'ur', 'yi', 'ps', 'sd']);

export function isRtl(locale: string): boolean {
  if (!locale) return false;
  return RTL_LOCALES.has(locale.toLowerCase().split(/[-_]/)[0]);
}

/**
 * Resolve the most-specific available locale.
 *
 *   resolveLocale('es-MX', ['en', 'es', 'es-MX']) -> 'es-MX'
 *   resolveLocale('es-MX', ['en', 'es'])          -> 'es'
 *   resolveLocale('es-MX', ['en'])                -> 'en'
 */
export function resolveLocale(requested: string, available: string[], fallback: string = 'en'): string {
  const norm = (s: string) => s.toLowerCase().replace(/_/g, '-');
  const want = norm(requested);
  const set = new Set(available.map(norm));
  if (set.has(want)) return available.find((a) => norm(a) === want) ?? fallback;
  const lang = want.split('-')[0];
  if (set.has(lang)) return available.find((a) => norm(a) === lang) ?? fallback;
  return fallback;
}
