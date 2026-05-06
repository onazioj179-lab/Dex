// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Unified Search Service
 * 
 * Consolidates search functionality across multiple UI components:
 * - SpotlightSearch (Ctrl+Space) - macOS-style search + launch
 * - GlobalSearchOverlay (Ctrl+Shift+F) - Deep content search
 * - CommandPalette (Ctrl+K) - Quick actions launcher
 * 
 * Provides:
 * - Shared search index for apps, files, notes, tasks
 * - Fuzzy matching with highlight spans
 * - Category filtering and result ranking
 * - Calculator and unit conversion
 * - Recent searches and suggestions
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export type SearchCategory =
  | 'app'
  | 'action'
  | 'setting'
  | 'note'
  | 'task'
  | 'file'
  | 'calculator'
  | 'unit'
  | 'web'
  | 'recent';

export interface HighlightSpan {
  start: number;
  end: number;
}

export interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  category: SearchCategory;
  icon?: string;
  score: number;
  highlights: HighlightSpan[];
  action?: () => void;
  deepLink?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchSource {
  id: string;
  name: string;
  category: SearchCategory;
  search: (query: string) => Promise<SearchResult[]>;
  priority: number;
}

export interface UnifiedSearchState {
  // State
  query: string;
  results: SearchResult[];
  isSearching: boolean;
  selectedIndex: number;
  recentSearches: string[];
  enabledCategories: Set<SearchCategory>;
  
  // Actions
  setQuery: (query: string) => void;
  search: (query: string, categories?: SearchCategory[]) => Promise<void>;
  setSelectedIndex: (index: number) => void;
  executeResult: (result: SearchResult) => void;
  addRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
  toggleCategory: (category: SearchCategory) => void;
}

// ---------------------------------------------------------------------------
// FUZZY MATCHING
// ---------------------------------------------------------------------------

/**
 * Calculate fuzzy match score between query and text.
 * Returns score (higher = better match) and highlight positions.
 */
export function fuzzyMatch(query: string, text: string): { score: number; highlights: HighlightSpan[] } {
  if (!query || !text) return { score: 0, highlights: [] };
  
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const highlights: HighlightSpan[] = [];
  
  // Exact substring match gets highest score
  const exactIndex = t.indexOf(q);
  if (exactIndex !== -1) {
    return {
      score: 100 + (q.length / t.length) * 50 + (exactIndex === 0 ? 25 : 0),
      highlights: [{ start: exactIndex, end: exactIndex + q.length }],
    };
  }
  
  // Fuzzy character-by-character matching
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  let lastMatchIndex = -1;
  
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Start or extend a highlight span
      if (lastMatchIndex === ti - 1 && highlights.length > 0) {
        highlights[highlights.length - 1].end = ti + 1;
      } else {
        highlights.push({ start: ti, end: ti + 1 });
      }
      
      lastMatchIndex = ti;
      qi++;
      consecutive++;
      score += consecutive * 2;
      
      // Bonus for word boundary matches
      if (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '-' || t[ti - 1] === '_') {
        score += 5;
      }
    } else {
      consecutive = 0;
    }
  }
  
  // Only return score if all query characters were matched
  return qi === q.length ? { score, highlights } : { score: 0, highlights: [] };
}

// ---------------------------------------------------------------------------
// CALCULATOR & UNIT CONVERSION
// ---------------------------------------------------------------------------

/**
 * Try to evaluate a mathematical expression.
 */
export function tryCalculate(query: string): SearchResult | null {
  const expr = query.trim();
  
  // Check if it looks like a math expression
  if (!/^[\d\s+\-*/%^().]+$/.test(expr.replace(/,/g, ''))) {
    return null;
  }
  
  try {
    // Normalize expression
    const normalized = expr
      .replace(/,/g, '')      // Remove thousands separators
      .replace(/\^/g, '**')   // Use ** for power
      .replace(/%(?!\d)/g, '/100'); // Convert trailing % to division
    
    // Use Function constructor for safe evaluation (no eval)
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${normalized})`)();
    
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      const formatted = Number.isInteger(result) 
        ? result.toLocaleString() 
        : result.toLocaleString(undefined, { maximumFractionDigits: 10 });
      
      return {
        id: 'calculator-result',
        title: `= ${formatted}`,
        subtitle: `${expr}`,
        category: 'calculator',
        score: 200,
        highlights: [],
        action: () => navigator.clipboard.writeText(String(result)),
      };
    }
  } catch {
    // Not a valid expression
  }
  
  return null;
}

/**
 * Unit conversion lookup tables
 */
const UNIT_CONVERSIONS: Record<string, { toBase: number; baseUnit: string }> = {
  // Length (base: meters)
  m: { toBase: 1, baseUnit: 'm' },
  km: { toBase: 1000, baseUnit: 'm' },
  cm: { toBase: 0.01, baseUnit: 'm' },
  mm: { toBase: 0.001, baseUnit: 'm' },
  mi: { toBase: 1609.344, baseUnit: 'm' },
  ft: { toBase: 0.3048, baseUnit: 'm' },
  in: { toBase: 0.0254, baseUnit: 'm' },
  yd: { toBase: 0.9144, baseUnit: 'm' },
  
  // Weight (base: grams)
  g: { toBase: 1, baseUnit: 'g' },
  kg: { toBase: 1000, baseUnit: 'g' },
  mg: { toBase: 0.001, baseUnit: 'g' },
  lb: { toBase: 453.592, baseUnit: 'g' },
  lbs: { toBase: 453.592, baseUnit: 'g' },
  oz: { toBase: 28.3495, baseUnit: 'g' },
  
  // Volume (base: liters)
  l: { toBase: 1, baseUnit: 'l' },
  ml: { toBase: 0.001, baseUnit: 'l' },
  gal: { toBase: 3.78541, baseUnit: 'l' },
  qt: { toBase: 0.946353, baseUnit: 'l' },
  pt: { toBase: 0.473176, baseUnit: 'l' },
  cup: { toBase: 0.236588, baseUnit: 'l' },
};

/**
 * Try to parse and convert units.
 */
export function tryUnitConvert(query: string): SearchResult | null {
  // Match patterns like "10 km to mi" or "5 lb in kg"
  const match = query.trim().match(/^([\d.]+)\s*([a-z]+)\s+(?:to|in|as)\s+([a-z]+)$/i);
  if (!match) return null;
  
  const [, valueStr, fromUnit, toUnit] = match;
  const value = parseFloat(valueStr);
  if (isNaN(value)) return null;
  
  const from = fromUnit.toLowerCase();
  const to = toUnit.toLowerCase();
  
  // Temperature special handling
  if (['c', 'f', 'k'].includes(from) && ['c', 'f', 'k'].includes(to)) {
    let celsius: number;
    if (from === 'c') celsius = value;
    else if (from === 'f') celsius = (value - 32) * 5 / 9;
    else celsius = value - 273.15; // Kelvin
    
    let result: number;
    if (to === 'c') result = celsius;
    else if (to === 'f') result = celsius * 9 / 5 + 32;
    else result = celsius + 273.15;
    
    const formatted = Math.round(result * 100) / 100;
    return {
      id: 'unit-result',
      title: `= ${formatted} °${to.toUpperCase()}`,
      subtitle: `${value} °${from.toUpperCase()}`,
      category: 'unit',
      score: 190,
      highlights: [],
      action: () => navigator.clipboard.writeText(String(formatted)),
    };
  }
  
  // Standard unit conversion
  const fromInfo = UNIT_CONVERSIONS[from];
  const toInfo = UNIT_CONVERSIONS[to];
  
  if (!fromInfo || !toInfo || fromInfo.baseUnit !== toInfo.baseUnit) {
    return null;
  }
  
  const baseValue = value * fromInfo.toBase;
  const result = baseValue / toInfo.toBase;
  const formatted = Math.round(result * 1e6) / 1e6;
  
  return {
    id: 'unit-result',
    title: `= ${formatted} ${to}`,
    subtitle: `${value} ${from}`,
    category: 'unit',
    score: 190,
    highlights: [],
    action: () => navigator.clipboard.writeText(String(formatted)),
  };
}

// ---------------------------------------------------------------------------
// SEARCH SOURCES REGISTRY
// ---------------------------------------------------------------------------

const searchSources: SearchSource[] = [];

export function registerSearchSource(source: SearchSource): void {
  const existing = searchSources.findIndex(s => s.id === source.id);
  if (existing !== -1) {
    searchSources[existing] = source;
  } else {
    searchSources.push(source);
    searchSources.sort((a, b) => b.priority - a.priority);
  }
}

export function unregisterSearchSource(id: string): void {
  const index = searchSources.findIndex(s => s.id === id);
  if (index !== -1) {
    searchSources.splice(index, 1);
  }
}

export function getSearchSources(): SearchSource[] {
  return [...searchSources];
}

// ---------------------------------------------------------------------------
// ZUSTAND STORE
// ---------------------------------------------------------------------------

const MAX_RECENT_SEARCHES = 10;

export const useUnifiedSearchStore = create<UnifiedSearchState>((set, get) => ({
  query: '',
  results: [],
  isSearching: false,
  selectedIndex: 0,
  recentSearches: [],
  enabledCategories: new Set([
    'app', 'action', 'setting', 'note', 'task', 'file', 'calculator', 'unit', 'web', 'recent'
  ]),
  
  setQuery: (query) => set({ query }),
  
  search: async (query, categories) => {
    if (!query.trim()) {
      set({ results: [], isSearching: false, selectedIndex: 0 });
      return;
    }
    
    set({ isSearching: true, query });
    
    const enabledCats = categories 
      ? new Set(categories)
      : get().enabledCategories;
    
    const allResults: SearchResult[] = [];
    
    // Check calculator first
    if (enabledCats.has('calculator')) {
      const calcResult = tryCalculate(query);
      if (calcResult) allResults.push(calcResult);
    }
    
    // Check unit conversion
    if (enabledCats.has('unit')) {
      const unitResult = tryUnitConvert(query);
      if (unitResult) allResults.push(unitResult);
    }
    
    // Search all registered sources
    const sourcePromises = searchSources
      .filter(source => enabledCats.has(source.category))
      .map(async (source) => {
        try {
          const results = await source.search(query);
          return results;
        } catch (e) {
          console.warn(`[UnifiedSearch] Source ${source.id} failed:`, e);
          return [];
        }
      });
    
    const sourceResults = await Promise.all(sourcePromises);
    sourceResults.forEach(results => allResults.push(...results));
    
    // Sort by score, then by category priority
    allResults.sort((a, b) => b.score - a.score);
    
    // Limit results per category to avoid overwhelming UI
    const resultsByCategory = new Map<SearchCategory, number>();
    const limitedResults = allResults.filter(result => {
      const count = resultsByCategory.get(result.category) || 0;
      if (count >= 5 && result.category !== 'calculator' && result.category !== 'unit') {
        return false;
      }
      resultsByCategory.set(result.category, count + 1);
      return true;
    });
    
    set({ 
      results: limitedResults.slice(0, 20), 
      isSearching: false,
      selectedIndex: 0,
    });
  },
  
  setSelectedIndex: (index) => set({ selectedIndex: index }),
  
  executeResult: (result) => {
    if (result.action) {
      result.action();
    } else if (result.deepLink) {
      // Navigate via deep link
      (window as any).dex?.invoke?.('deeplink:navigate', result.deepLink);
    }
    
    // Add to recent if it was a search, not calculator/unit
    const query = get().query;
    if (query && result.category !== 'calculator' && result.category !== 'unit') {
      get().addRecentSearch(query);
    }
    
    // Clear search
    set({ query: '', results: [], selectedIndex: 0 });
  },
  
  addRecentSearch: (query) => {
    const { recentSearches } = get();
    const filtered = recentSearches.filter(s => s !== query);
    const updated = [query, ...filtered].slice(0, MAX_RECENT_SEARCHES);
    set({ recentSearches: updated });
    
    // Persist to localStorage
    try {
      localStorage.setItem('dex-recent-searches', JSON.stringify(updated));
    } catch { /* quota exceeded */ }
  },
  
  clearRecentSearches: () => {
    set({ recentSearches: [] });
    try {
      localStorage.removeItem('dex-recent-searches');
    } catch { /* */ }
  },
  
  toggleCategory: (category) => {
    const { enabledCategories } = get();
    const newSet = new Set(enabledCategories);
    if (newSet.has(category)) {
      newSet.delete(category);
    } else {
      newSet.add(category);
    }
    set({ enabledCategories: newSet });
  },
}));

// Initialize recent searches from localStorage
try {
  const saved = localStorage.getItem('dex-recent-searches');
  if (saved) {
    useUnifiedSearchStore.setState({ recentSearches: JSON.parse(saved) });
  }
} catch { /* */ }

// ---------------------------------------------------------------------------
// UTILITY HOOKS
// ---------------------------------------------------------------------------

/**
 * Hook for keyboard navigation in search results
 */
export function useSearchKeyboardNavigation(
  onSelect: (result: SearchResult) => void,
  onClose: () => void
) {
  const { results, selectedIndex, setSelectedIndex } = useUnifiedSearchStore();
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(Math.min(selectedIndex + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(Math.max(selectedIndex - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          onSelect(results[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };
  
  return { handleKeyDown };
}
