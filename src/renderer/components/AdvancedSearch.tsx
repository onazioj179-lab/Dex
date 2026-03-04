/**
 * DEX Search Components
 * Advanced search with filters and suggestions
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

// ==================== TYPES ====================

interface SearchResult {
  id: string;
  title: string;
  description?: string;
  category?: string;
  icon?: string;
  metadata?: Record<string, any>;
}

interface SearchFilter {
  id: string;
  label: string;
  type: 'select' | 'multiselect' | 'date' | 'range' | 'toggle';
  options?: { value: string; label: string }[];
  value?: any;
}

interface GlobalSearchProps {
  placeholder?: string;
  onSearch: (query: string, filters: Record<string, any>) => Promise<SearchResult[]>;
  onSelect?: (result: SearchResult) => void;
  filters?: SearchFilter[];
  recentSearches?: string[];
  suggestions?: string[];
  categories?: { id: string; label: string; icon?: string }[];
  maxResults?: number;
  debounceMs?: number;
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  loading?: boolean;
  onClear?: () => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
}

interface SearchResultsProps {
  results: SearchResult[];
  query: string;
  onSelect: (result: SearchResult) => void;
  selectedIndex: number;
  onHover: (index: number) => void;
  loading?: boolean;
  emptyMessage?: string;
}

// ==================== SEARCH INPUT ====================

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder = 'Search...',
  loading = false,
  onClear,
  onSubmit,
  autoFocus = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
    },
    icon: {
      position: 'absolute',
      left: 14,
      fontSize: 16,
      color: 'var(--color-text-muted)',
      pointerEvents: 'none',
    },
    input: {
      width: '100%',
      padding: '12px 40px 12px 44px',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
      fontSize: 14,
      outline: 'none',
      transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    },
    clearBtn: {
      position: 'absolute',
      right: 14,
      background: 'none',
      border: 'none',
      padding: 4,
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: 14,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    loader: {
      position: 'absolute',
      right: 14,
      width: 16,
      height: 16,
      border: '2px solid var(--color-border)',
      borderTopColor: 'var(--color-accent)',
      borderRadius: '50%',
      animation: 'searchSpin 0.6s linear infinite',
    },
  };

  return (
    <div style={styles.container as any}>
      <span style={styles.icon as any}>search</span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit?.();
          if (e.key === 'Escape') onClear?.();
        }}
        placeholder={placeholder}
        style={styles.input}
      />
      {loading ? (
        <div style={styles.loader as any} />
      ) : value ? (
        <button
          style={styles.clearBtn as any}
          onClick={onClear}
          tabIndex={-1}
        >
          x
        </button>
      ) : null}
      <style>{`
        @keyframes searchSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

// ==================== SEARCH RESULTS ====================

export const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  query,
  onSelect,
  selectedIndex,
  onHover,
  loading = false,
  emptyMessage = 'No results found',
}) => {
  const highlightMatch = (text: string, query: string): React.ReactNode => {
    if (!query) return text;

    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark
          key={i}
          style={{
            background: 'var(--color-accent-light)',
            color: 'var(--color-text)',
            padding: '0 2px',
            borderRadius: 2,
          }}
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: 'var(--color-bg)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
      maxHeight: 400,
      overflow: 'auto',
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 16px',
      cursor: 'pointer',
      transition: 'background 0.1s ease',
    },
    icon: {
      fontSize: 20,
      flexShrink: 0,
    },
    content: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    description: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      marginTop: 2,
    },
    category: {
      fontSize: 11,
      color: 'var(--color-accent)',
      background: 'var(--color-accent-light)',
      padding: '2px 8px',
      borderRadius: 10,
      flexShrink: 0,
    },
    empty: {
      padding: 32,
      textAlign: 'center',
      color: 'var(--color-text-muted)',
    },
    loading: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 12,
    },
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading as any}>
          <div
            style={{
              width: 20,
              height: 20,
              border: '2px solid var(--color-border)',
              borderTopColor: 'var(--color-accent)',
              borderRadius: '50%',
              animation: 'searchSpin 0.6s linear infinite',
            }}
          />
          <span style={{ color: 'var(--color-text-muted)' }}>Searching...</span>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.empty as any}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>search</div>
          <p>{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {results.map((result, index) => (
        <div
          key={result.id}
          style={{
            ...styles.item,
            background:
              index === selectedIndex ? 'var(--color-bg-secondary)' : 'transparent',
          }}
          onClick={() => onSelect(result)}
          onMouseEnter={() => onHover(index)}
        >
          <span style={styles.icon}>{result.icon || 'file'}</span>
          <div style={styles.content}>
            <div style={styles.title}>{highlightMatch(result.title, query)}</div>
            {result.description && (
              <div style={styles.description}>
                {highlightMatch(result.description, query)}
              </div>
            )}
          </div>
          {result.category && (
            <span style={styles.category}>{result.category}</span>
          )}
        </div>
      ))}
    </div>
  );
};

// ==================== GLOBAL SEARCH ====================

export const GlobalSearch: React.FC<GlobalSearchProps> = ({
  placeholder = 'Search everywhere...',
  onSearch,
  onSelect,
  filters = [],
  recentSearches = [],
  suggestions = [],
  categories = [],
  maxResults = 10,
  debounceMs = 300,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [activeFilters, setActiveFilters] = useState<Record<string, any>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const searchResults = await onSearch(searchQuery, activeFilters);
        setResults(searchResults.slice(0, maxResults));
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [onSearch, activeFilters, maxResults]
  );

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(query);
    }, debounceMs);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, performSearch, debounceMs]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const itemCount = results.length || recentSearches.length || suggestions.length;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, itemCount - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const handleSelect = (result: SearchResult) => {
    onSelect?.(result);
    setIsOpen(false);
    setQuery('');
  };

  const showRecent = !query && recentSearches.length > 0;
  const showSuggestions = !query && suggestions.length > 0;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      width: '100%',
      maxWidth: 600,
    },
    dropdown: {
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      marginTop: 8,
      zIndex: 1000,
    },
    section: {
      padding: 8,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
      padding: '8px 12px',
      letterSpacing: '0.5px',
    },
    quickItem: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      cursor: 'pointer',
      borderRadius: 6,
      fontSize: 13,
      color: 'var(--color-text)',
    },
    categoryChips: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      padding: '8px 12px',
    },
    categoryChip: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 12px',
      background: 'var(--color-bg-secondary)',
      borderRadius: 16,
      cursor: 'pointer',
      fontSize: 13,
      border: 'none',
      color: 'var(--color-text)',
    },
    filterBar: {
      display: 'flex',
      gap: 8,
      padding: '8px 0',
      flexWrap: 'wrap',
    },
  };

  return (
    <div
      ref={containerRef}
      style={styles.container as any}
      onKeyDown={handleKeyDown}
    >
      <SearchInput
        value={query}
        onChange={(value) => {
          setQuery(value);
          setSelectedIndex(-1);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        loading={loading}
        onClear={() => {
          setQuery('');
          setResults([]);
        }}
      />

      {filters.length > 0 && (
        <div style={styles.filterBar}>
          {filters.map((filter) => (
            <select
              key={filter.id}
              value={activeFilters[filter.id] || ''}
              onChange={(e) =>
                setActiveFilters((prev) => ({
                  ...prev,
                  [filter.id]: e.target.value,
                }))
              }
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                fontSize: 12,
              }}
            >
              <option value="">{filter.label}</option>
              {filter.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ))}
        </div>
      )}

      {isOpen && (
        <div style={styles.dropdown as any}>
          {query ? (
            <SearchResults
              results={results}
              query={query}
              onSelect={handleSelect}
              selectedIndex={selectedIndex}
              onHover={setSelectedIndex}
              loading={loading}
            />
          ) : (
            <div
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
              }}
            >
              {categories.length > 0 && (
                <div style={styles.section}>
                  <div style={styles.sectionTitle}>Categories</div>
                  <div style={styles.categoryChips}>
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        style={styles.categoryChip}
                        onClick={() => setQuery(`category:${cat.id} `)}
                      >
                        {cat.icon && <span>{cat.icon}</span>}
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showRecent && (
                <div style={styles.section}>
                  <div style={styles.sectionTitle}>Recent Searches</div>
                  {recentSearches.map((search, index) => (
                    <div
                      key={index}
                      style={{
                        ...styles.quickItem,
                        background:
                          selectedIndex === index
                            ? 'var(--color-bg-secondary)'
                            : 'transparent',
                      }}
                      onClick={() => setQuery(search)}
                    >
                      <span>clock</span>
                      {search}
                    </div>
                  ))}
                </div>
              )}

              {showSuggestions && (
                <div style={styles.section}>
                  <div style={styles.sectionTitle}>Suggestions</div>
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      style={{
                        ...styles.quickItem,
                        background:
                          selectedIndex === index + recentSearches.length
                            ? 'var(--color-bg-secondary)'
                            : 'transparent',
                      }}
                      onClick={() => setQuery(suggestion)}
                    >
                      <span>lightbulb</span>
                      {suggestion}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ==================== INLINE SEARCH ====================

interface InlineSearchProps {
  items: SearchResult[];
  onSelect: (item: SearchResult) => void;
  placeholder?: string;
  filterKeys?: string[];
}

export const InlineSearch: React.FC<InlineSearchProps> = ({
  items,
  onSelect,
  placeholder = 'Filter...',
  filterKeys = ['title', 'description'],
}) => {
  const [query, setQuery] = useState('');

  const filteredItems = useMemo(() => {
    if (!query) return items;

    const lowerQuery = query.toLowerCase();
    return items.filter((item) =>
      filterKeys.some((key) => {
        const value = (item as any)[key];
        return value && String(value).toLowerCase().includes(lowerQuery);
      })
    );
  }, [items, query, filterKeys]);

  return (
    <div>
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder={placeholder}
        onClear={() => setQuery('')}
      />
      <div style={{ marginTop: 12 }}>
        {filteredItems.map((item) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'background 0.1s ease',
            }}
            onClick={() => onSelect(item)}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {item.icon && <span style={{ fontSize: 18 }}>{item.icon}</span>}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: 'var(--color-text)' }}>
                {item.title}
              </div>
              {item.description && (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--color-text-muted)',
                    marginTop: 2,
                  }}
                >
                  {item.description}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GlobalSearch;
