/**
 * DEX Advanced Search
 * Universal search with filters, suggestions, and history
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

// ==================== TYPES ====================

interface SearchFilter {
  id: string;
  label: string;
  type: 'select' | 'multiselect' | 'date' | 'range' | 'boolean';
  options?: { value: string; label: string }[];
  value?: any;
}

interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  category?: string;
  metadata?: Record<string, string>;
}

interface SearchProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSearch?: (query: string, filters: Record<string, any>) => void;
  filters?: SearchFilter[];
  suggestions?: string[];
  results?: SearchResult[];
  recentSearches?: string[];
  onResultClick?: (result: SearchResult) => void;
  onClearRecent?: () => void;
  loading?: boolean;
  showFilters?: boolean;
  showHistory?: boolean;
  autoFocus?: boolean;
  variant?: 'default' | 'minimal' | 'filled';
  size?: 'small' | 'medium' | 'large';
}

interface SearchHistoryEntry {
  query: string;
  timestamp: number;
  filters?: Record<string, any>;
}

// ==================== ICONS ====================

const Icons = {
  search: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  clear: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
  filter: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  history: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  arrow: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  close: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
};

// ==================== SEARCH INPUT COMPONENT ====================

export const SearchInput: React.FC<SearchProps> = ({
  placeholder = 'Search...',
  value: controlledValue,
  onChange,
  onSearch,
  filters = [],
  suggestions = [],
  results = [],
  recentSearches = [],
  onResultClick,
  onClearRecent,
  loading = false,
  showFilters = false,
  showHistory = true,
  autoFocus = false,
  variant = 'default',
  size = 'medium',
}) => {
  const [internalValue, setInternalValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, any>>({});
  const [selectedIndex, setSelectedIndex] = useState(-1);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const value = controlledValue ?? internalValue;

  // Size styles
  const sizeStyles = {
    small: { height: 32, fontSize: 13, iconSize: 14, padding: '0 10px' },
    medium: { height: 40, fontSize: 14, iconSize: 16, padding: '0 14px' },
    large: { height: 48, fontSize: 15, iconSize: 18, padding: '0 18px' },
  };

  const currentSize = sizeStyles[size];

  // Handle value change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (controlledValue === undefined) {
      setInternalValue(newValue);
    }
    onChange?.(newValue);
    setShowDropdown(true);
    setSelectedIndex(-1);
  };

  // Handle search submit
  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (value.trim()) {
      onSearch?.(value.trim(), filterValues);
      setShowDropdown(false);
    }
  };

  // Handle clear
  const handleClear = () => {
    if (controlledValue === undefined) {
      setInternalValue('');
    }
    onChange?.('');
    inputRef.current?.focus();
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const items = [...suggestions, ...results.map(r => r.title)];
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, items.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        if (selectedIndex >= 0 && selectedIndex < items.length) {
          if (selectedIndex < suggestions.length) {
            if (controlledValue === undefined) {
              setInternalValue(suggestions[selectedIndex]);
            }
            onChange?.(suggestions[selectedIndex]);
          } else {
            const resultIndex = selectedIndex - suggestions.length;
            onResultClick?.(results[resultIndex]);
          }
          setShowDropdown(false);
        } else {
          handleSubmit();
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        inputRef.current?.blur();
        break;
    }
  };

  // Handle filter change
  const handleFilterChange = (filterId: string, value: any) => {
    setFilterValues(prev => ({ ...prev, [filterId]: value }));
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setShowFilterPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Variant styles
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'minimal':
        return {
          background: 'transparent',
          border: 'none',
          borderBottom: `1px solid ${isFocused ? 'var(--color-accent)' : 'var(--color-border)'}`,
          borderRadius: 0,
        };
      case 'filled':
        return {
          background: 'var(--color-bg-tertiary)',
          border: `2px solid ${isFocused ? 'var(--color-accent)' : 'transparent'}`,
          borderRadius: 10,
        };
      default:
        return {
          background: 'var(--color-bg-secondary)',
          border: `1px solid ${isFocused ? 'var(--color-accent)' : 'var(--color-border)'}`,
          borderRadius: 10,
        };
    }
  };

  const activeFiltersCount = Object.values(filterValues).filter(v => v != null && v !== '').length;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      width: '100%',
    },
    inputWrapper: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      height: currentSize.height,
      padding: currentSize.padding,
      transition: 'all 0.2s',
      ...getVariantStyles(),
    },
    icon: {
      color: isFocused ? 'var(--color-accent)' : 'var(--color-text-muted)',
      flexShrink: 0,
      transition: 'color 0.2s',
    },
    input: {
      flex: 1,
      border: 'none',
      background: 'transparent',
      outline: 'none',
      fontSize: currentSize.fontSize,
      color: 'var(--color-text-primary)',
    },
    clearBtn: {
      width: 20,
      height: 20,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      opacity: 0.6,
      transition: 'opacity 0.15s',
      flexShrink: 0,
    },
    filterBtn: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '4px 8px',
      background: activeFiltersCount > 0 ? 'var(--color-accent)' : 'transparent',
      border: 'none',
      borderRadius: 6,
      cursor: 'pointer',
      color: activeFiltersCount > 0 ? '#fff' : 'var(--color-text-muted)',
      fontSize: 12,
      transition: 'all 0.15s',
      flexShrink: 0,
    },
    dropdown: {
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      marginTop: 8,
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
      maxHeight: 400,
      overflowY: 'auto',
      zIndex: 1000,
    },
    section: {
      padding: 8,
    },
    sectionTitle: {
      padding: '8px 12px',
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 12px',
      borderRadius: 8,
      cursor: 'pointer',
      transition: 'background 0.1s',
    },
    itemSelected: {
      background: 'var(--color-bg-tertiary)',
    },
    itemIcon: {
      width: 32,
      height: 32,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-tertiary)',
      borderRadius: 8,
      color: 'var(--color-text-secondary)',
    },
    itemContent: {
      flex: 1,
      minWidth: 0,
    },
    itemTitle: {
      fontSize: 14,
      color: 'var(--color-text-primary)',
    },
    itemSubtitle: {
      fontSize: 12,
      color: 'var(--color-text-secondary)',
      marginTop: 2,
    },
    itemCategory: {
      fontSize: 11,
      padding: '2px 6px',
      background: 'var(--color-accent-muted)',
      color: 'var(--color-accent)',
      borderRadius: 4,
    },
    loading: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      color: 'var(--color-text-muted)',
    },
    clearHistory: {
      padding: '8px 12px',
      fontSize: 12,
      color: 'var(--color-text-muted)',
      cursor: 'pointer',
      textAlign: 'center',
      borderTop: '1px solid var(--color-border)',
    },
    filterPanel: {
      padding: 16,
      borderBottom: '1px solid var(--color-border)',
    },
    filterGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
      gap: 12,
    },
    filterItem: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    },
    filterLabel: {
      fontSize: 12,
      fontWeight: 500,
      color: 'var(--color-text-secondary)',
    },
    filterSelect: {
      padding: '8px 10px',
      background: 'var(--color-bg-tertiary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      fontSize: 13,
      color: 'var(--color-text-primary)',
      outline: 'none',
    },
  };

  const shouldShowDropdown = showDropdown && (
    loading ||
    suggestions.length > 0 ||
    results.length > 0 ||
    (showHistory && recentSearches.length > 0 && !value) ||
    (showFilters && filters.length > 0)
  );

  return (
    <div style={styles.container} ref={dropdownRef}>
      <form onSubmit={handleSubmit}>
        <div style={styles.inputWrapper}>
          <span style={styles.icon}>{Icons.search}</span>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleChange}
            onFocus={() => { setIsFocused(true); setShowDropdown(true); }}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            style={styles.input}
            autoFocus={autoFocus}
          />
          {loading && (
            <div style={{ ...styles.clearBtn, animation: 'spin 1s linear infinite' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8" />
              </svg>
            </div>
          )}
          {value && !loading && (
            <button
              type="button"
              style={styles.clearBtn}
              onClick={handleClear}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
            >
              {Icons.clear}
            </button>
          )}
          {showFilters && filters.length > 0 && (
            <button
              type="button"
              style={styles.filterBtn}
              onClick={() => setShowFilterPanel(!showFilterPanel)}
            >
              {Icons.filter}
              {activeFiltersCount > 0 && <span>{activeFiltersCount}</span>}
            </button>
          )}
        </div>
      </form>

      {shouldShowDropdown && (
        <div style={styles.dropdown}>
          <style>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>

          {/* Filter Panel */}
          {showFilterPanel && filters.length > 0 && (
            <div style={styles.filterPanel}>
              <div style={styles.filterGrid}>
                {filters.map(filter => (
                  <div key={filter.id} style={styles.filterItem}>
                    <label style={styles.filterLabel}>{filter.label}</label>
                    {filter.type === 'select' && (
                      <select
                        style={styles.filterSelect}
                        value={filterValues[filter.id] || ''}
                        onChange={e => handleFilterChange(filter.id, e.target.value)}
                      >
                        <option value="">All</option>
                        {filter.options?.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}
                    {filter.type === 'boolean' && (
                      <button
                        style={{
                          ...styles.filterSelect,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                        onClick={() => handleFilterChange(filter.id, !filterValues[filter.id])}
                      >
                        <span>{filterValues[filter.id] ? 'Yes' : 'No'}</span>
                        {filterValues[filter.id] && Icons.check}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={styles.loading}>Searching...</div>
          )}

          {/* Recent Searches */}
          {!loading && showHistory && recentSearches.length > 0 && !value && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Recent Searches</div>
              {recentSearches.slice(0, 5).map((query, index) => (
                <div
                  key={query}
                  style={{
                    ...styles.item,
                    ...(selectedIndex === index ? styles.itemSelected : {}),
                  }}
                  onClick={() => {
                    if (controlledValue === undefined) {
                      setInternalValue(query);
                    }
                    onChange?.(query);
                    onSearch?.(query, filterValues);
                    setShowDropdown(false);
                  }}
                >
                  <span style={{ color: 'var(--color-text-muted)' }}>{Icons.history}</span>
                  <span style={styles.itemTitle}>{query}</span>
                </div>
              ))}
              {onClearRecent && (
                <div style={styles.clearHistory} onClick={onClearRecent}>
                  Clear recent searches
                </div>
              )}
            </div>
          )}

          {/* Suggestions */}
          {!loading && suggestions.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Suggestions</div>
              {suggestions.map((suggestion, index) => (
                <div
                  key={suggestion}
                  style={{
                    ...styles.item,
                    ...(selectedIndex === index ? styles.itemSelected : {}),
                  }}
                  onClick={() => {
                    if (controlledValue === undefined) {
                      setInternalValue(suggestion);
                    }
                    onChange?.(suggestion);
                    setShowDropdown(false);
                  }}
                >
                  <span style={{ color: 'var(--color-text-muted)' }}>{Icons.arrow}</span>
                  <span style={styles.itemTitle}>{suggestion}</span>
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          {!loading && results.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Results</div>
              {results.map((result, index) => {
                const resultIndex = suggestions.length + index;
                return (
                  <div
                    key={result.id}
                    style={{
                      ...styles.item,
                      ...(selectedIndex === resultIndex ? styles.itemSelected : {}),
                    }}
                    onClick={() => {
                      onResultClick?.(result);
                      setShowDropdown(false);
                    }}
                  >
                    <div style={styles.itemIcon}>
                      {result.icon || Icons.search}
                    </div>
                    <div style={styles.itemContent}>
                      <div style={styles.itemTitle}>{result.title}</div>
                      {result.subtitle && <div style={styles.itemSubtitle}>{result.subtitle}</div>}
                    </div>
                    {result.category && (
                      <span style={styles.itemCategory}>{result.category}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ==================== HOOK: useSearch ====================

interface UseSearchOptions<T> {
  data: T[];
  searchFields: (keyof T)[];
  filterFn?: (item: T, filters: Record<string, any>) => boolean;
}

export function useSearch<T>({ data, searchFields, filterFn }: UseSearchOptions<T>) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({});

  const results = useMemo(() => {
    let filtered = data;

    // Apply text search
    if (query) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter(item =>
        searchFields.some(field => {
          const value = item[field];
          return typeof value === 'string' && value.toLowerCase().includes(lowerQuery);
        })
      );
    }

    // Apply custom filters
    if (filterFn) {
      filtered = filtered.filter(item => filterFn(item, filters));
    }

    return filtered;
  }, [data, query, filters, searchFields, filterFn]);

  return {
    query,
    setQuery,
    filters,
    setFilters,
    setFilter: (key: string, value: any) => setFilters(prev => ({ ...prev, [key]: value })),
    results,
    resultCount: results.length,
    totalCount: data.length,
    clearFilters: () => { setQuery(''); setFilters({}); },
  };
}

// ==================== HOOK: useSearchHistory ====================

export const useSearchHistory = (key: string = 'dex-search-history', maxItems: number = 20) => {
  const [history, setHistory] = useState<SearchHistoryEntry[]>(() => {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  });

  const addToHistory = useCallback((query: string, filters?: Record<string, any>) => {
    if (!query.trim()) return;

    setHistory(prev => {
      const filtered = prev.filter(h => h.query !== query);
      const newHistory = [{ query, timestamp: Date.now(), filters }, ...filtered].slice(0, maxItems);
      localStorage.setItem(key, JSON.stringify(newHistory));
      return newHistory;
    });
  }, [key, maxItems]);

  const removeFromHistory = useCallback((query: string) => {
    setHistory(prev => {
      const newHistory = prev.filter(h => h.query !== query);
      localStorage.setItem(key, JSON.stringify(newHistory));
      return newHistory;
    });
  }, [key]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(key);
  }, [key]);

  return {
    history,
    recentQueries: history.map(h => h.query),
    addToHistory,
    removeFromHistory,
    clearHistory,
  };
};

export default SearchInput;
