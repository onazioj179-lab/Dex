// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Select Component
 * Dropdown select with search and multi-select
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import DexIcon from './DexIcon';

// ==================== TYPES ====================

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
  icon?: React.ReactNode;
  description?: string;
}

interface SelectProps {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  clearable?: boolean;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  error?: string;
  grouped?: boolean;
}

interface MultiSelectProps {
  options: SelectOption[];
  value?: string[];
  defaultValue?: string[];
  onChange?: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  maxSelected?: number;
  size?: 'sm' | 'md' | 'lg';
}

interface ComboboxProps {
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  onInputChange?: (input: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  allowCustomValue?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

interface AsyncSelectProps {
  loadOptions: (inputValue: string) => Promise<SelectOption[]>;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  debounceMs?: number;
}

// ==================== SELECT ====================

export const Select: React.FC<SelectProps> = ({
  options,
  value: controlledValue,
  defaultValue,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  searchable = false,
  clearable = false,
  size = 'md',
  loading = false,
  error,
  grouped = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState(defaultValue || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentValue = controlledValue !== undefined ? controlledValue : value;
  const selectedOption = options.find(o => o.value === currentValue);

  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    return options.filter(o =>
      o.label.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [options, searchQuery]);

  const groupedOptions = useMemo(() => {
    if (!grouped) return { '': filteredOptions };

    return filteredOptions.reduce((acc, option) => {
      const group = option.group || '';
      if (!acc[group]) acc[group] = [];
      acc[group].push(option);
      return acc;
    }, {} as Record<string, SelectOption[]>);
  }, [filteredOptions, grouped]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchable && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, searchable]);

  const handleSelect = (option: SelectOption) => {
    if (option.disabled) return;
    setValue(option.value);
    onChange?.(option.value);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setValue('');
    onChange?.('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex(prev =>
            prev < filteredOptions.length - 1 ? prev + 1 : 0
          );
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (isOpen && filteredOptions[highlightedIndex]) {
          handleSelect(filteredOptions[highlightedIndex]);
        } else {
          setIsOpen(true);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSearchQuery('');
        break;
    }
  };

  const sizes = {
    sm: { height: 32, fontSize: 12, padding: '0 10px' },
    md: { height: 40, fontSize: 14, padding: '0 12px' },
    lg: { height: 48, fontSize: 16, padding: '0 16px' },
  };

  const s = sizes[size];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      width: '100%',
    },
    control: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      height: s.height,
      padding: s.padding,
      background: 'rgba(22,24,28,0.96)',
      border: `1px solid ${error ? 'var(--color-error)' : isOpen ? 'rgba(10,132,255,0.45)' : 'var(--color-border)'}`,
      borderRadius: 8,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      boxShadow: 'inset 0 0.5px 0 var(--color-bg-hover)',
      transition: 'all 0.15s',
    },
    controlFocused: {
      boxShadow: `0 0 0 2px ${error ? 'rgba(239, 68, 68, 0.2)' : 'rgba(10,132,255,0.18)'}`,
    },
    value: {
      flex: 1,
      fontSize: s.fontSize,
      color: selectedOption ? 'var(--color-text-primary, #f5f5f7)' : 'var(--color-text-tertiary)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    searchInput: {
      flex: 1,
      border: 'none',
      background: 'none',
      outline: 'none',
      fontSize: s.fontSize,
      color: 'var(--color-text-primary, #f5f5f7)',
    },
    clearButton: {
      padding: 4,
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: 12,
    },
    arrow: {
      color: 'var(--color-text-muted)',
      fontSize: 10,
      transition: 'transform 0.2s',
      transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
    },
    menu: {
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      marginTop: 4,
      background: 'rgba(18,20,24,0.98)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      boxShadow: '0 16px 36px rgba(0,0,0,0.42)',
      maxHeight: 240,
      overflow: 'auto',
      zIndex: 2400,
    },
    group: {
      padding: '8px 12px 4px',
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    },
    option: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 12px',
      fontSize: s.fontSize,
      color: 'var(--color-text-primary, #f5f5f7)',
      cursor: 'pointer',
      transition: 'background 0.1s',
    },
    optionHighlighted: {
      background: 'var(--color-bg-hover)',
    },
    optionSelected: {
      background: 'rgba(10,132,255,0.14)',
      color: '#7cb8ff',
    },
    optionDisabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
    optionIcon: {
      flexShrink: 0,
    },
    optionContent: {
      flex: 1,
      minWidth: 0,
    },
    optionLabel: {
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    optionDescription: {
      fontSize: 11,
      color: 'var(--color-text-muted)',
      marginTop: 2,
    },
    loading: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      color: 'var(--color-text-muted)',
    },
    empty: {
      padding: 20,
      textAlign: 'center',
      color: 'var(--color-text-muted)',
      fontSize: 13,
    },
    error: {
      fontSize: 12,
      color: 'var(--color-error)',
      marginTop: 4,
    },
  };

  return (
    <div ref={containerRef} style={styles.container}>
      <div
        style={{
          ...styles.control,
          ...(isOpen ? styles.controlFocused : {}),
        }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
      >
        {searchable && isOpen ? (
          <input
            ref={inputRef}
            type="text"
            style={styles.searchInput}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={selectedOption?.label || placeholder}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span style={styles.value}>
            {selectedOption?.icon}
            {selectedOption?.label || placeholder}
          </span>
        )}

        {loading && <span>Loading...</span>}
        {clearable && currentValue && !loading && (
          <button style={styles.clearButton} onClick={handleClear} aria-label="Clear selection">
            <DexIcon name="close" size={12} />
          </button>
        )}
        <span style={styles.arrow}><DexIcon name="chevron-down" size={12} /></span>
      </div>

      {isOpen && (
        <div style={styles.menu}>
          {loading ? (
            <div style={styles.loading}>Loading...</div>
          ) : filteredOptions.length === 0 ? (
            <div style={styles.empty}>No options found</div>
          ) : grouped ? (
            Object.entries(groupedOptions).map(([group, groupOptions]) => (
              <div key={group}>
                {group && <div style={styles.group}>{group}</div>}
                {groupOptions.map((option, index) => {
                  const globalIndex = filteredOptions.indexOf(option);
                  return (
                    <div
                      key={option.value}
                      style={{
                        ...styles.option,
                        ...(globalIndex === highlightedIndex ? styles.optionHighlighted : {}),
                        ...(option.value === currentValue ? styles.optionSelected : {}),
                        ...(option.disabled ? styles.optionDisabled : {}),
                      }}
                      onClick={() => handleSelect(option)}
                      onMouseEnter={() => setHighlightedIndex(globalIndex)}
                    >
                      {option.icon && <span style={styles.optionIcon}>{option.icon}</span>}
                      <div style={styles.optionContent}>
                        <div style={styles.optionLabel}>{option.label}</div>
                        {option.description && (
                          <div style={styles.optionDescription}>{option.description}</div>
                        )}
                      </div>
                      {option.value === currentValue && <span>check</span>}
                    </div>
                  );
                })}
              </div>
            ))
          ) : (
            filteredOptions.map((option, index) => (
              <div
                key={option.value}
                style={{
                  ...styles.option,
                  ...(index === highlightedIndex ? styles.optionHighlighted : {}),
                  ...(option.value === currentValue ? styles.optionSelected : {}),
                  ...(option.disabled ? styles.optionDisabled : {}),
                }}
                onClick={() => handleSelect(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                {option.icon && <span style={styles.optionIcon}>{option.icon}</span>}
                <div style={styles.optionContent}>
                  <div style={styles.optionLabel}>{option.label}</div>
                  {option.description && (
                    <div style={styles.optionDescription}>{option.description}</div>
                  )}
                </div>
                {option.value === currentValue && <span>check</span>}
              </div>
            ))
          )}
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
};

// ==================== MULTI SELECT ====================

export const MultiSelect: React.FC<MultiSelectProps> = ({
  options,
  value: controlledValue,
  defaultValue = [],
  onChange,
  placeholder = 'Select...',
  disabled = false,
  searchable = true,
  maxSelected,
  size = 'md',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [values, setValues] = useState<string[]>(defaultValue);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentValues = controlledValue !== undefined ? controlledValue : values;
  const selectedOptions = options.filter(o => currentValues.includes(o.value));

  const filteredOptions = useMemo(() => {
    return options.filter(o =>
      o.label.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [options, searchQuery]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = (option: SelectOption) => {
    if (option.disabled) return;

    let newValues: string[];
    if (currentValues.includes(option.value)) {
      newValues = currentValues.filter(v => v !== option.value);
    } else {
      if (maxSelected && currentValues.length >= maxSelected) return;
      newValues = [...currentValues, option.value];
    }

    setValues(newValues);
    onChange?.(newValues);
    setSearchQuery('');
  };

  const handleRemove = (value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newValues = currentValues.filter(v => v !== value);
    setValues(newValues);
    onChange?.(newValues);
  };

  const sizes = {
    sm: { minHeight: 32, fontSize: 12 },
    md: { minHeight: 40, fontSize: 14 },
    lg: { minHeight: 48, fontSize: 16 },
  };

  const s = sizes[size];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      width: '100%',
    },
    control: {
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
      minHeight: s.minHeight,
      padding: '6px 12px',
      background: 'rgba(22,24,28,0.96)',
      border: `1px solid ${isOpen ? 'rgba(10,132,255,0.45)' : 'var(--color-border)'}`,
      borderRadius: 8,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      boxShadow: 'inset 0 0.5px 0 var(--color-bg-hover)',
    },
    tag: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      background: 'var(--color-border-subtle)',
      borderRadius: 4,
      fontSize: s.fontSize - 2,
      color: 'var(--color-text-primary, #f5f5f7)',
    },
    tagRemove: {
      padding: 0,
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: 12,
      marginLeft: 2,
    },
    input: {
      flex: 1,
      minWidth: 60,
      border: 'none',
      background: 'none',
      outline: 'none',
      fontSize: s.fontSize,
      color: 'var(--color-text)',
    },
    placeholder: {
      color: 'var(--color-text-muted)',
      fontSize: s.fontSize,
    },
    menu: {
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      marginTop: 4,
      background: 'rgba(18,20,24,0.98)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      boxShadow: '0 16px 36px rgba(0,0,0,0.42)',
      maxHeight: 240,
      overflow: 'auto',
      zIndex: 2400,
    },
    option: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 12px',
      fontSize: s.fontSize,
      color: 'var(--color-text-primary, #f5f5f7)',
      cursor: 'pointer',
    },
    checkbox: {
      width: 16,
      height: 16,
      borderRadius: 4,
      border: '2px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 10,
      flexShrink: 0,
    },
    checkboxChecked: {
      background: 'var(--color-accent)',
      borderColor: 'var(--color-accent)',
      color: '#fff',
    },
  };

  return (
    <div ref={containerRef} style={styles.container}>
      <div style={styles.control} onClick={() => !disabled && setIsOpen(!isOpen)}>
        {selectedOptions.map(option => (
          <span key={option.value} style={styles.tag}>
            {option.label}
            <button
              style={styles.tagRemove}
              onClick={(e) => handleRemove(option.value, e)}
            >
              
            </button>
          </span>
        ))}

        {searchable ? (
          <input
            ref={inputRef}
            type="text"
            style={styles.input}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={selectedOptions.length === 0 ? placeholder : ''}
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(true);
            }}
          />
        ) : (
          selectedOptions.length === 0 && (
            <span style={styles.placeholder}>{placeholder}</span>
          )
        )}
      </div>

      {isOpen && (
        <div style={styles.menu}>
          {filteredOptions.map(option => {
            const isSelected = currentValues.includes(option.value);
            const isDisabled = option.disabled ||
              (maxSelected && !isSelected && currentValues.length >= maxSelected);

            return (
              <div
                key={option.value}
                style={{
                  ...styles.option,
                  opacity: isDisabled ? 0.5 : 1,
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                }}
                onClick={() => !isDisabled && handleToggle(option)}
              >
                <div
                  style={{
                    ...styles.checkbox,
                    ...(isSelected ? styles.checkboxChecked : {}),
                  }}
                >
                  {isSelected && 'check'}
                </div>
                {option.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ==================== ASYNC SELECT ====================

export const AsyncSelect: React.FC<AsyncSelectProps> = ({
  loadOptions,
  value,
  onChange,
  placeholder = 'Search...',
  disabled = false,
  debounceMs = 300,
}) => {
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleInputChange = async (input: string) => {
    setInputValue(input);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!input) {
      setOptions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await loadOptions(input);
        setOptions(results);
      } catch (error) {
        console.error('Failed to load options:', error);
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, debounceMs);
  };

  return (
    <Select
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      searchable
      loading={loading}
    />
  );
};

export default Select;
