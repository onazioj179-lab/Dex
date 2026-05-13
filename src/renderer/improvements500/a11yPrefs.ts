// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * OS accessibility preference hooks (T1-055, T1-056).
 */

import { useEffect, useState } from 'react';

function readMatch(query: string): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(query).matches;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(readMatch(query));
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

export function useHighContrast(): boolean {
  return useMediaQuery('(prefers-contrast: more)');
}

export function useDarkScheme(): boolean {
  return useMediaQuery('(prefers-color-scheme: dark)');
}

export const a11yPrefs = {
  reducedMotion(): boolean { return readMatch('(prefers-reduced-motion: reduce)'); },
  highContrast(): boolean { return readMatch('(prefers-contrast: more)'); },
  darkScheme(): boolean { return readMatch('(prefers-color-scheme: dark)'); },
};
