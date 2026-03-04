/**
 * DEX Tag Input & Chips Component
 * Multi-value inputs with tags and chips
 */

import React, { useState, useRef, useCallback, KeyboardEvent } from 'react';

// ==================== TYPES ====================

interface Tag {
  id: string;
  label: string;
  color?: string;
  icon?: React.ReactNode;
  removable?: boolean;
}

interface TagInputProps {
  value?: string[];
  defaultValue?: string[];
  onChange?: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  allowDuplicates?: boolean;
  delimiters?: string[];
  validateTag?: (tag: string) => boolean;
  transformTag?: (tag: string) => string;
  suggestions?: string[];
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'outlined' | 'filled';
}

interface ChipInputProps {
  value?: Tag[];
  defaultValue?: Tag[];
  onChange?: (chips: Tag[]) => void;
  placeholder?: string;
  maxChips?: number;
  colorPalette?: string[];
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

interface TagListProps {
  tags: Tag[];
  onRemove?: (id: string) => void;
  onClick?: (tag: Tag) => void;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'solid' | 'outline';
  wrap?: boolean;
}

// ==================== TAG INPUT ====================

export const TagInput: React.FC<TagInputProps> = ({
  value: controlledValue,
  defaultValue = [],
  onChange,
  placeholder = 'Add tags...',
  maxTags,
  allowDuplicates = false,
  delimiters = ['Enter', ',', 'Tab'],
  validateTag = () => true,
  transformTag = tag => tag.trim(),
  suggestions = [],
  disabled = false,
  size = 'md',
  variant = 'default',
}) => {
  const [internalTags, setInternalTags] = useState<string[]>(defaultValue);
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const tags = controlledValue ?? internalTags;

  const sizeConfig = {
    sm: { padding: '4px 8px', fontSize: 12, tagPadding: '2px 6px', gap: 4 },
    md: { padding: '6px 10px', fontSize: 13, tagPadding: '4px 8px', gap: 6 },
    lg: { padding: '8px 12px', fontSize: 14, tagPadding: '6px 10px', gap: 8 },
  };

  const config = sizeConfig[size];

  const filteredSuggestions = suggestions.filter(
    s => s.toLowerCase().includes(inputValue.toLowerCase()) && !tags.includes(s)
  );

  const addTag = useCallback((tagValue: string) => {
    const transformed = transformTag(tagValue);
    if (!transformed) return;
    if (!validateTag(transformed)) return;
    if (!allowDuplicates && tags.includes(transformed)) return;
    if (maxTags && tags.length >= maxTags) return;

    const newTags = [...tags, transformed];
    setInternalTags(newTags);
    onChange?.(newTags);
    setInputValue('');
    setShowSuggestions(false);
    setSelectedSuggestion(-1);
  }, [tags, transformTag, validateTag, allowDuplicates, maxTags, onChange]);

  const removeTag = useCallback((index: number) => {
    const newTags = tags.filter((_, i) => i !== index);
    setInternalTags(newTags);
    onChange?.(newTags);
  }, [tags, onChange]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestion(prev =>
          prev < filteredSuggestions.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestion(prev =>
          prev > 0 ? prev - 1 : filteredSuggestions.length - 1
        );
        return;
      }
      if (e.key === 'Enter' && selectedSuggestion >= 0) {
        e.preventDefault();
        addTag(filteredSuggestions[selectedSuggestion]);
        return;
      }
    }

    if (delimiters.includes(e.key)) {
      e.preventDefault();
      addTag(inputValue);
    }

    if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Check for delimiter characters in paste
    for (const delimiter of delimiters) {
      if (delimiter.length === 1 && value.includes(delimiter)) {
        const parts = value.split(delimiter);
        parts.forEach(part => {
          if (part.trim()) addTag(part);
        });
        return;
      }
    }

    setInputValue(value);
    setShowSuggestions(value.length > 0 && suggestions.length > 0);
    setSelectedSuggestion(-1);
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
    },
    inputWrapper: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: config.gap,
      padding: config.padding,
      background: variant === 'filled' ? 'var(--color-bg-tertiary)' : 'var(--color-bg-secondary)',
      border: variant === 'outlined' || variant === 'default' ? '1px solid var(--color-border)' : 'none',
      borderRadius: 6,
      borderColor: isFocused ? 'var(--color-accent)' : 'var(--color-border)',
      opacity: disabled ? 0.5 : 1,
      cursor: disabled ? 'not-allowed' : 'text',
      transition: 'border-color 0.15s',
    },
    tag: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: config.tagPadding,
      background: 'var(--color-accent-alpha)',
      borderRadius: 4,
      fontSize: config.fontSize - 1,
      color: 'var(--color-accent)',
    },
    tagRemove: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 14,
      height: 14,
      background: 'transparent',
      border: 'none',
      borderRadius: 2,
      cursor: 'pointer',
      color: 'inherit',
      fontSize: 12,
      padding: 0,
      marginLeft: 2,
    },
    input: {
      flex: 1,
      minWidth: 80,
      background: 'transparent',
      border: 'none',
      outline: 'none',
      fontSize: config.fontSize,
      color: 'var(--color-text)',
    },
    suggestions: {
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      marginTop: 4,
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
      maxHeight: 200,
      overflowY: 'auto',
      zIndex: 100,
    },
    suggestion: {
      padding: '8px 12px',
      cursor: 'pointer',
      fontSize: config.fontSize,
      color: 'var(--color-text)',
      transition: 'background 0.1s',
    },
    suggestionSelected: {
      background: 'var(--color-bg-hover)',
    },
  };

  return (
    <div style={styles.container}>
      <div
        style={styles.inputWrapper}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag, index) => (
          <span key={index} style={styles.tag}>
            {tag}
            {!disabled && (
              <button
                style={styles.tagRemove}
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(index);
                }}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          style={styles.input}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setIsFocused(true);
            if (inputValue && suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          onBlur={() => {
            setIsFocused(false);
            setTimeout(() => setShowSuggestions(false), 200);
          }}
          placeholder={tags.length === 0 ? placeholder : ''}
          disabled={disabled}
        />
      </div>

      {showSuggestions && filteredSuggestions.length > 0 && (
        <div style={styles.suggestions}>
          {filteredSuggestions.map((suggestion, index) => (
            <div
              key={suggestion}
              style={{
                ...styles.suggestion,
                ...(index === selectedSuggestion ? styles.suggestionSelected : {}),
              }}
              onMouseDown={() => addTag(suggestion)}
              onMouseEnter={() => setSelectedSuggestion(index)}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== CHIP INPUT ====================

export const ChipInput: React.FC<ChipInputProps> = ({
  value: controlledValue,
  defaultValue = [],
  onChange,
  placeholder = 'Add items...',
  maxChips,
  colorPalette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
  disabled = false,
  size = 'md',
}) => {
  const [internalChips, setInternalChips] = useState<Tag[]>(defaultValue);
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const chips = controlledValue ?? internalChips;

  const sizeConfig = {
    sm: { padding: '4px 8px', fontSize: 12, chipHeight: 22 },
    md: { padding: '6px 10px', fontSize: 13, chipHeight: 26 },
    lg: { padding: '8px 12px', fontSize: 14, chipHeight: 30 },
  };

  const config = sizeConfig[size];

  const getRandomColor = () => {
    return colorPalette[Math.floor(Math.random() * colorPalette.length)];
  };

  const addChip = useCallback((label: string) => {
    if (!label.trim()) return;
    if (maxChips && chips.length >= maxChips) return;
    if (chips.some(c => c.label === label)) return;

    const newChip: Tag = {
      id: `chip-${Date.now()}`,
      label: label.trim(),
      color: getRandomColor(),
      removable: true,
    };

    const newChips = [...chips, newChip];
    setInternalChips(newChips);
    onChange?.(newChips);
    setInputValue('');
  }, [chips, maxChips, onChange]);

  const removeChip = useCallback((id: string) => {
    const newChips = chips.filter(c => c.id !== id);
    setInternalChips(newChips);
    onChange?.(newChips);
  }, [chips, onChange]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addChip(inputValue);
    }

    if (e.key === 'Backspace' && !inputValue && chips.length > 0) {
      removeChip(chips[chips.length - 1].id);
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 6,
      padding: config.padding,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      borderColor: isFocused ? 'var(--color-accent)' : 'var(--color-border)',
      transition: 'border-color 0.15s',
      cursor: disabled ? 'not-allowed' : 'text',
      opacity: disabled ? 0.5 : 1,
    },
    chip: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: config.chipHeight,
      padding: '0 10px',
      borderRadius: config.chipHeight / 2,
      fontSize: config.fontSize - 1,
      fontWeight: 500,
      color: '#fff',
    },
    chipRemove: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 16,
      height: 16,
      background: 'rgba(255, 255, 255, 0.2)',
      border: 'none',
      borderRadius: '50%',
      cursor: 'pointer',
      color: '#fff',
      fontSize: 10,
      padding: 0,
    },
    input: {
      flex: 1,
      minWidth: 80,
      background: 'transparent',
      border: 'none',
      outline: 'none',
      fontSize: config.fontSize,
      color: 'var(--color-text)',
    },
  };

  return (
    <div
      style={styles.container}
      onClick={() => inputRef.current?.focus()}
    >
      {chips.map(chip => (
        <span
          key={chip.id}
          style={{ ...styles.chip, background: chip.color }}
        >
          {chip.icon && <span>{chip.icon}</span>}
          {chip.label}
          {chip.removable !== false && !disabled && (
            <button
              style={styles.chipRemove}
              onClick={(e) => {
                e.stopPropagation();
                removeChip(chip.id);
              }}
            >
              ×
            </button>
          )}
        </span>
      ))}
      <input
        ref={inputRef}
        style={styles.input}
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={chips.length === 0 ? placeholder : ''}
        disabled={disabled}
      />
    </div>
  );
};

// ==================== TAG LIST ====================

export const TagList: React.FC<TagListProps> = ({
  tags,
  onRemove,
  onClick,
  size = 'md',
  variant = 'default',
  wrap = true,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const sizeConfig = {
    sm: { padding: '2px 6px', fontSize: 11, gap: 4 },
    md: { padding: '4px 10px', fontSize: 12, gap: 6 },
    lg: { padding: '6px 12px', fontSize: 13, gap: 8 },
  };

  const config = sizeConfig[size];

  const getVariantStyles = (tag: Tag): React.CSSProperties => {
    const baseColor = tag.color || 'var(--color-accent)';
    const isHovered = hoveredId === tag.id;

    switch (variant) {
      case 'solid':
        return {
          background: baseColor,
          color: '#fff',
        };
      case 'outline':
        return {
          background: isHovered ? `${baseColor}20` : 'transparent',
          border: `1px solid ${baseColor}`,
          color: baseColor,
        };
      case 'default':
      default:
        return {
          background: `${baseColor}20`,
          color: baseColor,
        };
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexWrap: wrap ? 'wrap' : 'nowrap',
      gap: config.gap,
      overflow: wrap ? 'visible' : 'auto',
    },
    tag: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: config.padding,
      borderRadius: 4,
      fontSize: config.fontSize,
      fontWeight: 500,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'background 0.15s',
      whiteSpace: 'nowrap',
    },
    icon: {
      display: 'flex',
      alignItems: 'center',
      fontSize: config.fontSize,
    },
    remove: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 14,
      height: 14,
      background: 'transparent',
      border: 'none',
      borderRadius: 2,
      cursor: 'pointer',
      color: 'inherit',
      fontSize: 12,
      padding: 0,
      opacity: 0.7,
    },
  };

  return (
    <div style={styles.container}>
      {tags.map(tag => (
        <span
          key={tag.id}
          style={{ ...styles.tag, ...getVariantStyles(tag) }}
          onClick={() => onClick?.(tag)}
          onMouseEnter={() => setHoveredId(tag.id)}
          onMouseLeave={() => setHoveredId(null)}
        >
          {tag.icon && <span style={styles.icon}>{tag.icon}</span>}
          {tag.label}
          {tag.removable !== false && onRemove && (
            <button
              style={styles.remove}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(tag.id);
              }}
            >
              ×
            </button>
          )}
        </span>
      ))}
    </div>
  );
};

// ==================== MENTION INPUT ====================

interface MentionInputProps {
  value?: string;
  onChange?: (value: string) => void;
  onMention?: (mention: string) => void;
  mentionUsers?: { id: string; name: string; avatar?: string }[];
  mentionTrigger?: string;
  placeholder?: string;
  disabled?: boolean;
}

export const MentionInput: React.FC<MentionInputProps> = ({
  value = '',
  onChange,
  onMention,
  mentionUsers = [],
  mentionTrigger = '@',
  placeholder = 'Type a message...',
  disabled = false,
}) => {
  const [inputValue, setInputValue] = useState(value);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredUsers = mentionUsers.filter(user =>
    user.name.toLowerCase().includes(mentionSearch.toLowerCase())
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange?.(newValue);

    // Check for mention trigger
    const lastWord = newValue.split(' ').pop() || '';
    if (lastWord.startsWith(mentionTrigger) && lastWord.length > 1) {
      setMentionSearch(lastWord.slice(1));
      setShowMentions(true);
      setSelectedIndex(0);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (user: { id: string; name: string }) => {
    const words = inputValue.split(' ');
    words[words.length - 1] = `${mentionTrigger}${user.name}`;
    const newValue = words.join(' ') + ' ';
    setInputValue(newValue);
    onChange?.(newValue);
    onMention?.(user.id);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showMentions) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev =>
        prev < filteredUsers.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev =>
        prev > 0 ? prev - 1 : filteredUsers.length - 1
      );
    } else if (e.key === 'Enter' && filteredUsers[selectedIndex]) {
      e.preventDefault();
      insertMention(filteredUsers[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowMentions(false);
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
    },
    input: {
      width: '100%',
      padding: '10px 12px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      fontSize: 13,
      color: 'var(--color-text)',
      outline: 'none',
    },
    mentions: {
      position: 'absolute',
      bottom: '100%',
      left: 0,
      right: 0,
      marginBottom: 4,
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
      maxHeight: 200,
      overflowY: 'auto',
      zIndex: 100,
    },
    mentionItem: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 12px',
      cursor: 'pointer',
      transition: 'background 0.1s',
    },
    avatar: {
      width: 28,
      height: 28,
      borderRadius: '50%',
      background: 'var(--color-bg-tertiary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
      overflow: 'hidden',
    },
    name: {
      fontSize: 13,
      color: 'var(--color-text)',
    },
  };

  return (
    <div style={styles.container}>
      {showMentions && filteredUsers.length > 0 && (
        <div style={styles.mentions}>
          {filteredUsers.map((user, index) => (
            <div
              key={user.id}
              style={{
                ...styles.mentionItem,
                background: index === selectedIndex
                  ? 'var(--color-bg-hover)'
                  : 'transparent',
              }}
              onClick={() => insertMention(user)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div style={styles.avatar}>
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  user.name.substring(0, 2).toUpperCase()
                )}
              </div>
              <span style={styles.name}>{user.name}</span>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        style={styles.input}
        value={inputValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShowMentions(false), 200)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
};

export default TagInput;
