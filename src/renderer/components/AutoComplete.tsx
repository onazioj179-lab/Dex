/**
 * DEX AutoComplete Component
 * Type-ahead search with suggestions
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

// ==================== TYPES ====================

interface AutoCompleteOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  description?: string;
  disabled?: boolean;
  group?: string;
}

interface AutoCompleteProps {
  options: AutoCompleteOption[];
  value?: string;
  onChange?: (value: string) => void;
  onSelect?: (option: AutoCompleteOption) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  clearable?: boolean;
  freeSolo?: boolean;
  filterMode?: 'startsWith' | 'contains' | 'fuzzy';
  maxSuggestions?: number;
  minChars?: number;
  debounceMs?: number;
  renderOption?: (option: AutoCompleteOption, isHighlighted: boolean) => React.ReactNode;
  noOptionsText?: string;
  groupBy?: boolean;
}

interface CommandAutoCompleteProps {
  commands: Array<{
    id: string;
    name: string;
    shortcut?: string;
    icon?: React.ReactNode;
    category?: string;
  }>;
  onSelect?: (commandId: string) => void;
  placeholder?: string;
}

interface MentionAutoCompleteProps {
  users: Array<{
    id: string;
    name: string;
    username: string;
    avatar?: string;
  }>;
  value: string;
  onChange: (value: string) => void;
  onMention?: (userId: string) => void;
  placeholder?: string;
}

// ==================== HOOKS ====================

const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
};

// ==================== AUTOCOMPLETE ====================

export const AutoComplete: React.FC<AutoCompleteProps> = ({
  options,
  value: controlledValue,
  onChange,
  onSelect,
  placeholder = 'Search...',
  disabled = false,
  loading = false,
  clearable = true,
  freeSolo = false,
  filterMode = 'contains',
  maxSuggestions = 10,
  minChars = 0,
  debounceMs = 150,
  renderOption,
  noOptionsText = 'No results found',
  groupBy = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(controlledValue || '');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const debouncedInput = useDebounce(inputValue, debounceMs);

  // Filter options
  const filteredOptions = useMemo(() => {
    if (debouncedInput.length < minChars) return [];

    const query = debouncedInput.toLowerCase();

    const filtered = options.filter(opt => {
      if (opt.disabled) return false;

      const label = opt.label.toLowerCase();

      switch (filterMode) {
        case 'startsWith':
          return label.startsWith(query);
        case 'fuzzy': {
          let searchIndex = 0;
          for (const char of label) {
            if (char === query[searchIndex]) {
              searchIndex++;
            }
            if (searchIndex === query.length) return true;
          }
          return false;
        }
        default:
          return label.includes(query);
      }
    });

    return filtered.slice(0, maxSuggestions);
  }, [options, debouncedInput, filterMode, maxSuggestions, minChars]);

  // Group options if needed
  const groupedOptions = useMemo(() => {
    if (!groupBy) return { '': filteredOptions };

    return filteredOptions.reduce((acc, opt) => {
      const group = opt.group || '';
      if (!acc[group]) acc[group] = [];
      acc[group].push(opt);
      return acc;
    }, {} as Record<string, AutoCompleteOption[]>);
  }, [filteredOptions, groupBy]);

  const flatOptions = Object.values(groupedOptions).flat();

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange?.(newValue);
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  // Handle option select
  const handleSelect = useCallback((option: AutoCompleteOption) => {
    setInputValue(option.label);
    onChange?.(option.value);
    onSelect?.(option);
    setIsOpen(false);
    inputRef.current?.focus();
  }, [onChange, onSelect]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < flatOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : flatOptions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && flatOptions[highlightedIndex]) {
          handleSelect(flatOptions[highlightedIndex]);
        } else if (freeSolo) {
          setIsOpen(false);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  };

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const highlightedEl = listRef.current.children[highlightedIndex] as HTMLElement;
      highlightedEl?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!inputRef.current?.parentElement?.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      width: '100%',
    },
    inputWrapper: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
    },
    input: {
      width: '100%',
      padding: '10px 12px',
      paddingRight: clearable || loading ? 36 : 12,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      fontSize: 14,
      color: 'var(--color-text)',
      outline: 'none',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    },
    inputFocused: {
      borderColor: 'var(--color-accent)',
      boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)',
    },
    clearButton: {
      position: 'absolute',
      right: 8,
      width: 24,
      height: 24,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'none',
      border: 'none',
      borderRadius: 4,
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: 14,
    },
    spinner: {
      position: 'absolute',
      right: 12,
      width: 16,
      height: 16,
      border: '2px solid var(--color-border)',
      borderTopColor: 'var(--color-accent)',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    },
    dropdown: {
      position: 'absolute',
      top: 'calc(100% + 4px)',
      left: 0,
      right: 0,
      maxHeight: 300,
      overflowY: 'auto',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
      zIndex: 1000,
    },
    groupLabel: {
      padding: '8px 12px',
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      background: 'var(--color-bg-tertiary)',
    },
    option: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 12px',
      cursor: 'pointer',
      transition: 'background 0.1s',
    },
    optionHighlighted: {
      background: 'var(--color-bg-tertiary)',
    },
    optionIcon: {
      fontSize: 16,
      flexShrink: 0,
    },
    optionContent: {
      flex: 1,
      minWidth: 0,
    },
    optionLabel: {
      fontSize: 14,
      color: 'var(--color-text)',
    },
    optionDescription: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      marginTop: 2,
    },
    noResults: {
      padding: '16px 12px',
      fontSize: 14,
      color: 'var(--color-text-muted)',
      textAlign: 'center',
    },
  };

  let optionIndex = -1;

  return (
    <div style={styles.container as any}>
      <div style={styles.inputWrapper as any}>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            ...styles.input,
            ...(isOpen ? styles.inputFocused : {}),
            opacity: disabled ? 0.5 : 1,
          }}
        />

        {loading ? (
          <div style={styles.spinner as any} />
        ) : clearable && inputValue ? (
          <button
            style={styles.clearButton as any}
            onClick={() => {
              setInputValue('');
              onChange?.('');
              inputRef.current?.focus();
            }}
          >
            ×
          </button>
        ) : null}
      </div>

      {isOpen && (inputValue.length >= minChars || flatOptions.length > 0) && (
        <div style={styles.dropdown}>
          {flatOptions.length === 0 && !loading ? (
            <div style={styles.noResults as any}>{noOptionsText}</div>
          ) : (
            <ul ref={listRef} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {Object.entries(groupedOptions).map(([group, groupOptions]) => (
                <React.Fragment key={group}>
                  {group && groupBy && (
                    <li style={styles.groupLabel}>{group}</li>
                  )}
                  {groupOptions.map((option) => {
                    optionIndex++;
                    const currentIndex = optionIndex;
                    const isHighlighted = highlightedIndex === currentIndex;

                    return (
                      <li
                        key={option.value}
                        style={{
                          ...styles.option,
                          ...(isHighlighted ? styles.optionHighlighted : {}),
                        }}
                        onClick={() => handleSelect(option)}
                        onMouseEnter={() => setHighlightedIndex(currentIndex)}
                      >
                        {renderOption ? (
                          renderOption(option, isHighlighted)
                        ) : (
                          <>
                            {option.icon && (
                              <span style={styles.optionIcon}>{option.icon}</span>
                            )}
                            <div style={styles.optionContent as any}>
                              <div style={styles.optionLabel}>{option.label}</div>
                              {option.description && (
                                <div style={styles.optionDescription}>
                                  {option.description}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </li>
                    );
                  })}
                </React.Fragment>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

// ==================== COMMAND AUTOCOMPLETE ====================

export const CommandAutoComplete: React.FC<CommandAutoCompleteProps> = ({
  commands,
  onSelect,
  placeholder = 'Type a command...',
}) => {
  const options: AutoCompleteOption[] = commands.map(cmd => ({
    value: cmd.id,
    label: cmd.name,
    icon: cmd.icon,
    description: cmd.shortcut,
    group: cmd.category,
  }));

  return (
    <AutoComplete
      options={options}
      placeholder={placeholder}
      onSelect={(option) => onSelect?.(option.value)}
      groupBy
      renderOption={(option, isHighlighted) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
          <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>
            {option.icon}
          </span>
          <span style={{ flex: 1, color: 'var(--color-text)' }}>
            {option.label}
          </span>
          {option.description && (
            <span
              style={{
                fontSize: 12,
                color: 'var(--color-text-muted)',
                background: 'var(--color-bg-tertiary)',
                padding: '2px 8px',
                borderRadius: 4,
                fontFamily: 'monospace',
              }}
            >
              {option.description}
            </span>
          )}
        </div>
      )}
    />
  );
};

// ==================== MENTION AUTOCOMPLETE ====================

export const MentionAutoComplete: React.FC<MentionAutoCompleteProps> = ({
  users,
  value,
  onChange,
  onMention,
  placeholder = 'Type @ to mention someone...',
}) => {
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredUsers = useMemo(() => {
    if (!mentionQuery) return users;
    const query = mentionQuery.toLowerCase();
    return users.filter(
      u => u.name.toLowerCase().includes(query) ||
        u.username.toLowerCase().includes(query)
    );
  }, [users, mentionQuery]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const cursor = e.target.selectionStart || 0;

    onChange(newValue);
    setCursorPosition(cursor);

    // Check for @ mention
    const textBeforeCursor = newValue.slice(0, cursor);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      setShowMentions(true);
      setMentionQuery(mentionMatch[1]);
    } else {
      setShowMentions(false);
      setMentionQuery('');
    }
  };

  const handleSelectUser = (user: typeof users[0]) => {
    const textBeforeCursor = value.slice(0, cursorPosition);
    const textAfterCursor = value.slice(cursorPosition);

    // Find the @ position
    const mentionStart = textBeforeCursor.lastIndexOf('@');
    const newValue =
      textBeforeCursor.slice(0, mentionStart) +
      `@${user.username} ` +
      textAfterCursor;

    onChange(newValue);
    onMention?.(user.id);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      width: '100%',
    },
    input: {
      width: '100%',
      padding: '10px 12px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      fontSize: 14,
      color: 'var(--color-text)',
      outline: 'none',
    },
    dropdown: {
      position: 'absolute',
      top: 'calc(100% + 4px)',
      left: 0,
      right: 0,
      maxHeight: 200,
      overflowY: 'auto',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
      zIndex: 1000,
    },
    user: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 12px',
      cursor: 'pointer',
      transition: 'background 0.1s',
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: '50%',
      background: 'var(--color-accent)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 14,
      fontWeight: 600,
      color: '#fff',
      overflow: 'hidden',
    },
    avatarImg: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
    userInfo: {
      flex: 1,
    },
    userName: {
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text)',
    },
    userUsername: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container as any}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        placeholder={placeholder}
        style={styles.input}
      />

      {showMentions && filteredUsers.length > 0 && (
        <div style={styles.dropdown}>
          {filteredUsers.map(user => (
            <div
              key={user.id}
              style={styles.user}
              onClick={() => handleSelectUser(user)}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-tertiary)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              <div style={styles.avatar}>
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name} style={styles.avatarImg} />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </div>
              <div style={styles.userInfo as any}>
                <div style={styles.userName}>{user.name}</div>
                <div style={styles.userUsername}>@{user.username}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== TAG AUTOCOMPLETE ====================

interface TagAutoCompleteProps {
  suggestions: string[];
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  allowCustom?: boolean;
}

export const TagAutoComplete: React.FC<TagAutoCompleteProps> = ({
  suggestions,
  value,
  onChange,
  placeholder = 'Add tags...',
  allowCustom = true,
}) => {
  const [inputValue, setInputValue] = useState('');

  const availableSuggestions = suggestions.filter(
    s => !value.includes(s) && s.toLowerCase().includes(inputValue.toLowerCase())
  );

  const handleSelect = (tag: string) => {
    if (!value.includes(tag)) {
      onChange([...value, tag]);
    }
    setInputValue('');
  };

  const handleRemove = (tag: string) => {
    onChange(value.filter(t => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && inputValue && allowCustom) {
      e.preventDefault();
      handleSelect(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      handleRemove(value[value.length - 1]);
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
    },
    inputArea: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      padding: 8,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
    },
    tag: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '4px 8px',
      background: 'var(--color-accent-light, rgba(59, 130, 246, 0.1))',
      borderRadius: 4,
      fontSize: 13,
      color: 'var(--color-accent)',
    },
    removeButton: {
      background: 'none',
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      color: 'var(--color-accent)',
      fontSize: 14,
      lineHeight: 1,
    },
    input: {
      flex: 1,
      minWidth: 100,
      padding: '4px 0',
      background: 'none',
      border: 'none',
      fontSize: 14,
      color: 'var(--color-text)',
      outline: 'none',
    },
    dropdown: {
      position: 'absolute',
      top: 'calc(100% + 4px)',
      left: 0,
      right: 0,
      maxHeight: 200,
      overflowY: 'auto',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
      zIndex: 1000,
    },
    suggestion: {
      padding: '10px 12px',
      fontSize: 14,
      color: 'var(--color-text)',
      cursor: 'pointer',
    },
  };

  return (
    <div style={styles.container as any}>
      <div style={styles.inputArea as any}>
        {value.map(tag => (
          <span key={tag} style={styles.tag}>
            {tag}
            <button style={styles.removeButton} onClick={() => handleRemove(tag)}>
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          style={styles.input}
        />
      </div>

      {inputValue && availableSuggestions.length > 0 && (
        <div style={styles.dropdown}>
          {availableSuggestions.map(suggestion => (
            <div
              key={suggestion}
              style={styles.suggestion}
              onClick={() => handleSelect(suggestion)}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-tertiary)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AutoComplete;
