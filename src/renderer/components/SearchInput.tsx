// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * SearchInput - shared filter / search input for app surfaces.
 *
 * Controlled component with a clear-button affordance and consistent
 * sizing. Apps that previously implemented their own search input
 * should consume this so keyboard behavior (Esc to clear, Enter to
 * submit) stays uniform.
 */

import React, { memo, useCallback } from 'react';

export interface SearchInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Called when the user presses Enter. */
  onSubmit?: (value: string) => void;
  /** Called when the user presses Escape (or clicks clear). */
  onClear?: () => void;
  /** Auto-focus on mount. */
  autoFocus?: boolean;
  /** Disable input. */
  disabled?: boolean;
  /** Compact (smaller height + font). */
  compact?: boolean;
  /** ARIA label. Default "Search". */
  ariaLabel?: string;
  /** Optional className passthrough. */
  className?: string;
  /** Optional inline style passthrough on the wrapper. */
  style?: React.CSSProperties;
}

const wrapperStyle: React.CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  width: '100%',
};

function inputStyle(compact: boolean, disabled: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: compact ? '4px 28px 4px 28px' : '6px 32px 6px 32px',
    fontSize: compact ? 12 : 13,
    lineHeight: 1.4,
    color: 'var(--color-text-primary)',
    background: 'var(--color-surface-2, var(--color-surface))',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 8,
    outline: 'none',
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'text',
    transition: 'border-color 120ms ease, background 120ms ease',
  };
}

const iconStyle: React.CSSProperties = {
  position: 'absolute',
  left: 8,
  top: '50%',
  transform: 'translateY(-50%)',
  width: 14,
  height: 14,
  color: 'var(--color-text-tertiary, var(--color-text-secondary))',
  pointerEvents: 'none',
};

const clearStyle: React.CSSProperties = {
  position: 'absolute',
  right: 6,
  top: '50%',
  transform: 'translateY(-50%)',
  width: 18,
  height: 18,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  color: 'var(--color-text-secondary)',
  cursor: 'pointer',
  borderRadius: 4,
  fontSize: 14,
  lineHeight: 1,
  padding: 0,
};

export const SearchInput = memo<SearchInputProps>(({
  value,
  onChange,
  placeholder = 'Search',
  onSubmit,
  onClear,
  autoFocus,
  disabled = false,
  compact = false,
  ariaLabel = 'Search',
  className,
  style,
}) => {
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSubmit?.(value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (value) {
        onChange('');
        onClear?.();
      }
    }
  }, [value, onChange, onSubmit, onClear]);

  const handleClear = useCallback(() => {
    onChange('');
    onClear?.();
  }, [onChange, onClear]);

  return (
    <div className={className} style={{ ...wrapperStyle, ...style }}>
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        style={iconStyle}
        aria-hidden="true"
      >
        <circle cx="7" cy="7" r="5" />
        <line x1="11" y1="11" x2="14" y2="14" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        style={inputStyle(compact, disabled)}
      />
      {value && !disabled ? (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          style={clearStyle}
        >
          {'\u00D7'}
        </button>
      ) : null}
    </div>
  );
});

SearchInput.displayName = 'SearchInput';

export default SearchInput;
