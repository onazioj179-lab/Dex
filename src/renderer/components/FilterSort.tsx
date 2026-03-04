/**
 * DEX Filter & Sort Components
 * Data filtering and sorting utilities
 */

import React, { useState, useCallback, useMemo } from 'react';

// ==================== TYPES ====================

interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

interface FilterConfig {
  key: string;
  label: string;
  type: 'select' | 'multiselect' | 'range' | 'date-range' | 'search' | 'checkbox' | 'toggle';
  options?: FilterOption[];
  min?: number;
  max?: number;
}

interface ActiveFilter {
  key: string;
  value: any;
  label: string;
}

interface FilterBarProps {
  filters: FilterConfig[];
  activeFilters: Record<string, any>;
  onFilterChange: (key: string, value: any) => void;
  onClearAll?: () => void;
}

interface SortOption {
  value: string;
  label: string;
}

interface SortBarProps {
  options: SortOption[];
  value: string;
  direction: 'asc' | 'desc';
  onChange: (value: string, direction: 'asc' | 'desc') => void;
}

// ==================== FILTER BAR ====================

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  activeFilters,
  onFilterChange,
  onClearAll,
}) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  const renderFilter = (config: FilterConfig) => {
    const value = activeFilters[config.key];

    switch (config.type) {
      case 'select':
        return (
          <select
            value={value || ''}
            onChange={(e) => onFilterChange(config.key, e.target.value || null)}
            style={filterInputStyle}
          >
            <option value="">All {config.label}</option>
            {config.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} {opt.count !== undefined && `(${opt.count})`}
              </option>
            ))}
          </select>
        );

      case 'multiselect':
        return (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setExpanded(expanded === config.key ? null : config.key)}
              style={filterInputStyle}
            >
              {(value as string[])?.length
                ? `${(value as string[]).length} selected`
                : `Select ${config.label}`}
              <span style={{ marginLeft: 8 }}>▼</span>
            </button>
            {expanded === config.key && (
              <div style={dropdownStyle as any}>
                {config.options?.map((opt) => (
                  <label key={opt.value} style={checkboxLabelStyle}>
                    <input
                      type="checkbox"
                      checked={(value as string[])?.includes(opt.value) || false}
                      onChange={(e) => {
                        const current = (value as string[]) || [];
                        onFilterChange(
                          config.key,
                          e.target.checked
                            ? [...current, opt.value]
                            : current.filter((v) => v !== opt.value)
                        );
                      }}
                    />
                    {opt.label}
                    {opt.count !== undefined && (
                      <span style={{ color: 'var(--color-text-muted)', marginLeft: 4 }}>
                        ({opt.count})
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
        );

      case 'range':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              placeholder="Min"
              value={value?.min || ''}
              min={config.min}
              max={config.max}
              onChange={(e) =>
                onFilterChange(config.key, {
                  ...value,
                  min: e.target.value ? Number(e.target.value) : null,
                })
              }
              style={{ ...filterInputStyle, width: 80 }}
            />
            <span style={{ color: 'var(--color-text-muted)' }}>to</span>
            <input
              type="number"
              placeholder="Max"
              value={value?.max || ''}
              min={config.min}
              max={config.max}
              onChange={(e) =>
                onFilterChange(config.key, {
                  ...value,
                  max: e.target.value ? Number(e.target.value) : null,
                })
              }
              style={{ ...filterInputStyle, width: 80 }}
            />
          </div>
        );

      case 'date-range':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="date"
              value={value?.start || ''}
              onChange={(e) =>
                onFilterChange(config.key, { ...value, start: e.target.value || null })
              }
              style={filterInputStyle}
            />
            <span style={{ color: 'var(--color-text-muted)' }}>to</span>
            <input
              type="date"
              value={value?.end || ''}
              onChange={(e) =>
                onFilterChange(config.key, { ...value, end: e.target.value || null })
              }
              style={filterInputStyle}
            />
          </div>
        );

      case 'search':
        return (
          <input
            type="text"
            placeholder={`Search ${config.label}...`}
            value={value || ''}
            onChange={(e) => onFilterChange(config.key, e.target.value || null)}
            style={filterInputStyle}
          />
        );

      case 'checkbox':
        return (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={value || false}
              onChange={(e) => onFilterChange(config.key, e.target.checked)}
            />
            {config.label}
          </label>
        );

      case 'toggle':
        return (
          <button
            onClick={() => onFilterChange(config.key, !value)}
            style={{
              ...filterInputStyle,
              background: value ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
              color: value ? 'white' : 'var(--color-text)',
            }}
          >
            {config.label}
          </button>
        );

      default:
        return null;
    }
  };

  const activeFilterCount = Object.values(activeFilters).filter(
    (v) => v !== null && v !== undefined && (Array.isArray(v) ? v.length > 0 : true)
  ).length;

  const styles: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
    padding: 16,
    background: 'var(--color-bg-secondary)',
    borderRadius: 8,
  };

  return (
    <div style={styles}>
      {filters.map((config) => (
        <div key={config.key}>
          {config.type !== 'checkbox' && config.type !== 'toggle' && (
            <label
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--color-text-muted)',
                marginBottom: 4,
              }}
            >
              {config.label}
            </label>
          )}
          {renderFilter(config)}
        </div>
      ))}
      {activeFilterCount > 0 && onClearAll && (
        <button
          onClick={onClearAll}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: 4,
            background: 'var(--color-bg-tertiary)',
            color: 'var(--color-text)',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Clear All ({activeFilterCount})
        </button>
      )}
    </div>
  );
};

// Shared styles
const filterInputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  fontSize: 13,
  minWidth: 120,
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  zIndex: 100,
  minWidth: 200,
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  maxHeight: 250,
  overflow: 'auto',
  marginTop: 4,
};

const checkboxLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  cursor: 'pointer',
  fontSize: 13,
};

// ==================== SORT BAR ====================

export const SortBar: React.FC<SortBarProps> = ({
  options,
  value,
  direction,
  onChange,
}) => {
  const handleChange = (newValue: string) => {
    if (newValue === value) {
      onChange(value, direction === 'asc' ? 'desc' : 'asc');
    } else {
      onChange(newValue, 'asc');
    }
  };

  const styles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  return (
    <div style={styles}>
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Sort by:</span>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => handleChange(opt.value)}
          style={{
            padding: '6px 12px',
            border: 'none',
            borderRadius: 4,
            background: value === opt.value ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
            color: value === opt.value ? 'white' : 'var(--color-text)',
            cursor: 'pointer',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {opt.label}
          {value === opt.value && (
            <span>{direction === 'asc' ? 'arrow-up' : 'arrow-down'}</span>
          )}
        </button>
      ))}
    </div>
  );
};

// ==================== FILTER CHIPS ====================

interface FilterChipsProps {
  filters: ActiveFilter[];
  onRemove: (key: string) => void;
  onClearAll?: () => void;
}

export const FilterChips: React.FC<FilterChipsProps> = ({
  filters,
  onRemove,
  onClearAll,
}) => {
  if (filters.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {filters.map((filter) => (
        <span
          key={filter.key}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 8px 4px 12px',
            background: 'var(--color-bg-tertiary)',
            borderRadius: 16,
            fontSize: 13,
            color: 'var(--color-text)',
          }}
        >
          <span style={{ color: 'var(--color-text-muted)' }}>{filter.label}:</span>
          {Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value)}
          <button
            onClick={() => onRemove(filter.key)}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
              padding: 0,
              fontSize: 14,
            }}
          >
            ×
          </button>
        </span>
      ))}
      {onClearAll && (
        <button
          onClick={onClearAll}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: 'var(--color-accent)',
            fontSize: 13,
            textDecoration: 'underline',
          }}
        >
          Clear all
        </button>
      )}
    </div>
  );
};

// ==================== QUICK FILTERS ====================

interface QuickFilter {
  id: string;
  label: string;
  filters: Record<string, any>;
}

interface QuickFiltersProps {
  presets: QuickFilter[];
  onApply: (filters: Record<string, any>) => void;
  activePreset?: string;
}

export const QuickFilters: React.FC<QuickFiltersProps> = ({
  presets,
  onApply,
  activePreset,
}) => {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {presets.map((preset) => (
        <button
          key={preset.id}
          onClick={() => onApply(preset.filters)}
          style={{
            padding: '6px 12px',
            border: activePreset === preset.id
              ? '2px solid var(--color-accent)'
              : '1px solid var(--color-border)',
            borderRadius: 16,
            background: activePreset === preset.id
              ? 'var(--color-accent-light)'
              : 'var(--color-bg)',
            color: 'var(--color-text)',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
};

// ==================== SEARCH WITH FILTERS ====================

interface SearchWithFiltersProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  filters?: {
    key: string;
    label: string;
    options: FilterOption[];
  }[];
  activeFilters?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
}

export const SearchWithFilters: React.FC<SearchWithFiltersProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  filters = [],
  activeFilters = {},
  onFilterChange,
  suggestions = [],
  onSuggestionClick,
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filteredSuggestions = useMemo(() => {
    if (!value) return [];
    return suggestions.filter((s) =>
      s.toLowerCase().includes(value.toLowerCase())
    ).slice(0, 5);
  }, [value, suggestions]);

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: 8,
          background: 'var(--color-bg-secondary)',
          borderRadius: 8,
          border: '1px solid var(--color-border)',
        }}
      >
        <span style={{ color: 'var(--color-text-muted)' }}>search</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={placeholder}
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            color: 'var(--color-text)',
            outline: 'none',
            fontSize: 14,
          }}
        />
        {filters.map((filter) => (
          <select
            key={filter.key}
            value={activeFilters[filter.key] || ''}
            onChange={(e) => onFilterChange?.(filter.key, e.target.value)}
            style={{
              padding: '4px 8px',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              fontSize: 12,
            }}
          >
            <option value="">{filter.label}</option>
            {filter.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ))}
      </div>

      {showSuggestions && filteredSuggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 100,
          }}
        >
          {filteredSuggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => {
                onSuggestionClick?.(suggestion);
                onChange(suggestion);
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                cursor: 'pointer',
                color: 'var(--color-text)',
                fontSize: 13,
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== USE FILTER HOOK ====================

export function useFilters<T>(
  data: T[],
  filterFn: (item: T, filters: Record<string, any>) => boolean
) {
  const [filters, setFilters] = useState<Record<string, any>>({});

  const updateFilter = useCallback((key: string, value: any) => {
    setFilters((prev) => {
      if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
        const { [key]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: value };
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
  }, []);

  const filteredData = useMemo(() => {
    if (Object.keys(filters).length === 0) return data;
    return data.filter((item) => filterFn(item, filters));
  }, [data, filters, filterFn]);

  const getActiveFilters = useCallback(
    (labels: Record<string, string>): ActiveFilter[] => {
      return Object.entries(filters).map(([key, value]) => ({
        key,
        value,
        label: labels[key] || key,
      }));
    },
    [filters]
  );

  return {
    filters,
    setFilters,
    updateFilter,
    clearFilters,
    filteredData,
    getActiveFilters,
    filterCount: Object.keys(filters).length,
  };
}

// ==================== USE SORT HOOK ====================

export function useSort<T>(data: T[], defaultSort?: { key: keyof T; direction: 'asc' | 'desc' }) {
  const [sortKey, setSortKey] = useState<keyof T | null>(defaultSort?.key ?? null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultSort?.direction ?? 'asc');

  const setSort = useCallback((key: keyof T, direction?: 'asc' | 'desc') => {
    if (key === sortKey && !direction) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(direction ?? 'asc');
    }
  }, [sortKey]);

  const clearSort = useCallback(() => {
    setSortKey(null);
  }, []);

  const sortedData = useMemo(() => {
    if (!sortKey) return data;

    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortDirection]);

  return {
    sortKey,
    sortDirection,
    setSort,
    clearSort,
    sortedData,
  };
}

export default FilterBar;
