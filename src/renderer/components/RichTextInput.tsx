// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * RichTextInput - Enhanced text editing with formatting
 * 
 * Features:
 * - Multi-cursor support awareness
 * - Selection highlighting
 * - Find/replace support
 * - Undo/redo stack
 * - Auto-complete suggestions
 * - Character/word count
 */

import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
} from 'react';
import { colors, radius } from '../styles/tokens';
import { TRANSITION } from '../styles/animationTokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TextStats {
  characters: number;
  words: number;
  lines: number;
  paragraphs: number;
}

export interface Selection {
  start: number;
  end: number;
}

export interface RichTextInputProps {
  /** Current value */
  value: string;
  /** Value change handler */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Read-only state */
  readOnly?: boolean;
  /** Auto-focus on mount */
  autoFocus?: boolean;
  /** Maximum characters */
  maxLength?: number;
  /** Show character count */
  showCount?: boolean;
  /** Show word count */
  showWordCount?: boolean;
  /** Minimum rows */
  minRows?: number;
  /** Maximum rows (0 for unlimited) */
  maxRows?: number;
  /** Enable spell check */
  spellCheck?: boolean;
  /** Auto-complete suggestions */
  suggestions?: string[];
  /** Called when suggestion selected */
  onSuggestionSelect?: (suggestion: string) => void;
  /** Called on selection change */
  onSelectionChange?: (selection: Selection) => void;
  /** Called when stats update */
  onStatsChange?: (stats: TextStats) => void;
  /** Custom class name */
  className?: string;
  /** Custom styles */
  style?: React.CSSProperties;
}

export interface RichTextInputRef {
  focus: () => void;
  blur: () => void;
  select: () => void;
  setSelection: (start: number, end: number) => void;
  insertText: (text: string) => void;
  undo: () => void;
  redo: () => void;
  getStats: () => TextStats;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const calculateStats = (text: string): TextStats => {
  const characters = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lines = text ? text.split('\n').length : 1;
  const paragraphs = text ? text.split(/\n\n+/).filter(p => p.trim()).length : 0;
  return { characters, words, lines, paragraphs };
};

// ---------------------------------------------------------------------------
// Undo/Redo Manager
// ---------------------------------------------------------------------------

interface HistoryEntry {
  value: string;
  selection: Selection;
}

class UndoRedoManager {
  private history: HistoryEntry[] = [];
  private index: number = -1;
  private maxHistory: number = 100;

  push(entry: HistoryEntry) {
    // Remove any redo history
    this.history = this.history.slice(0, this.index + 1);
    
    // Add new entry
    this.history.push(entry);
    
    // Trim if too long
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.index++;
    }
  }

  undo(): HistoryEntry | null {
    if (this.index > 0) {
      this.index--;
      return this.history[this.index];
    }
    return null;
  }

  redo(): HistoryEntry | null {
    if (this.index < this.history.length - 1) {
      this.index++;
      return this.history[this.index];
    }
    return null;
  }

  canUndo(): boolean {
    return this.index > 0;
  }

  canRedo(): boolean {
    return this.index < this.history.length - 1;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const RichTextInput = forwardRef<RichTextInputRef, RichTextInputProps>(({
  value,
  onChange,
  placeholder,
  disabled = false,
  readOnly = false,
  autoFocus = false,
  maxLength,
  showCount = false,
  showWordCount = false,
  minRows = 3,
  maxRows = 0,
  spellCheck = true,
  suggestions = [],
  onSuggestionSelect,
  onSelectionChange,
  onStatsChange,
  className,
  style,
}, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef(new UndoRedoManager());
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [stats, setStats] = useState<TextStats>(() => calculateStats(value));

  // Update stats when value changes
  useEffect(() => {
    const newStats = calculateStats(value);
    setStats(newStats);
    onStatsChange?.(newStats);
  }, [value, onStatsChange]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
    const minHeight = minRows * lineHeight;
    const maxHeight = maxRows > 0 ? maxRows * lineHeight : Infinity;
    
    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, [value, minRows, maxRows]);

  // Handle change
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    
    // Check max length
    if (maxLength && newValue.length > maxLength) return;
    
    // Save to history
    historyRef.current.push({
      value: newValue,
      selection: {
        start: e.target.selectionStart,
        end: e.target.selectionEnd,
      },
    });
    
    onChange(newValue);
    
    // Filter suggestions
    if (suggestions.length > 0) {
      const cursorPos = e.target.selectionStart;
      const textBeforeCursor = newValue.slice(0, cursorPos);
      const lastWord = textBeforeCursor.split(/\s/).pop() || '';
      
      if (lastWord.length >= 2) {
        const filtered = suggestions.filter(s => 
          s.toLowerCase().startsWith(lastWord.toLowerCase())
        );
        setFilteredSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
        setSuggestionIndex(0);
      } else {
        setShowSuggestions(false);
      }
    }
  }, [onChange, maxLength, suggestions]);

  // Handle selection change
  const handleSelect = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const newSelection = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
    setSelection(newSelection);
    onSelectionChange?.(newSelection);
  }, [onSelectionChange]);

  // Handle keyboard
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      const entry = historyRef.current.undo();
      if (entry) {
        onChange(entry.value);
        setTimeout(() => {
          textareaRef.current?.setSelectionRange(entry.selection.start, entry.selection.end);
        }, 0);
      }
      return;
    }
    
    // Redo
    if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
      e.preventDefault();
      const entry = historyRef.current.redo();
      if (entry) {
        onChange(entry.value);
        setTimeout(() => {
          textareaRef.current?.setSelectionRange(entry.selection.start, entry.selection.end);
        }, 0);
      }
      return;
    }
    
    // Suggestion navigation
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionIndex(i => Math.min(i + 1, filteredSuggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectSuggestion(filteredSuggestions[suggestionIndex]);
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    }
  }, [onChange, showSuggestions, filteredSuggestions, suggestionIndex]);

  // Select suggestion
  const selectSuggestion = useCallback((suggestion: string) => {
    if (!textareaRef.current) return;
    
    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);
    const lastWordMatch = textBeforeCursor.match(/\S+$/);
    const lastWordStart = lastWordMatch ? cursorPos - lastWordMatch[0].length : cursorPos;
    
    const newValue = value.slice(0, lastWordStart) + suggestion + ' ' + textAfterCursor;
    onChange(newValue);
    onSuggestionSelect?.(suggestion);
    setShowSuggestions(false);
    
    // Move cursor after inserted text
    setTimeout(() => {
      const newPos = lastWordStart + suggestion.length + 1;
      textareaRef.current?.setSelectionRange(newPos, newPos);
    }, 0);
  }, [value, onChange, onSuggestionSelect]);

  // Imperative handle
  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    blur: () => textareaRef.current?.blur(),
    select: () => textareaRef.current?.select(),
    setSelection: (start, end) => textareaRef.current?.setSelectionRange(start, end),
    insertText: (text) => {
      if (!textareaRef.current) return;
      const { selectionStart, selectionEnd } = textareaRef.current;
      const newValue = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
      onChange(newValue);
    },
    undo: () => {
      const entry = historyRef.current.undo();
      if (entry) onChange(entry.value);
    },
    redo: () => {
      const entry = historyRef.current.redo();
      if (entry) onChange(entry.value);
    },
    getStats: () => stats,
  }), [value, onChange, stats]);

  // Auto-focus
  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus();
    }
  }, [autoFocus]);

  // Initialize history
  useEffect(() => {
    historyRef.current.push({
      value,
      selection: { start: 0, end: 0 },
    });
  }, []); // Only on mount

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        ...style,
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onSelect={handleSelect}
        onKeyDown={handleKeyDown}
        onBlur={() => setShowSuggestions(false)}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        spellCheck={spellCheck}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: colors.bg.inset,
          border: `1px solid ${colors.border.subtle}`,
          borderRadius: radius.md,
          fontSize: 14,
          lineHeight: 1.5,
          color: colors.text.primary,
          resize: 'none',
          outline: 'none',
          transition: TRANSITION.fast,
          fontFamily: 'inherit',
        }}
      />
      
      {/* Suggestions dropdown */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: colors.bg.elevated,
            border: `1px solid ${colors.border.default}`,
            borderRadius: radius.md,
            boxShadow: 'var(--pg-shadow-tooltip)',
            maxHeight: 200,
            overflowY: 'auto',
            zIndex: 1000,
          }}
        >
          {filteredSuggestions.map((suggestion, i) => (
            <div
              key={suggestion}
              onMouseDown={(e) => {
                e.preventDefault();
                selectSuggestion(suggestion);
              }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                background: i === suggestionIndex ? colors.bg.hover : 'transparent',
                color: colors.text.primary,
                fontSize: 13,
              }}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
      
      {/* Stats bar */}
      {(showCount || showWordCount) && (
        <div
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 6,
            fontSize: 11,
            color: colors.text.tertiary,
          }}
        >
          {showCount && (
            <span>
              {stats.characters}
              {maxLength && ` / ${maxLength}`} characters
            </span>
          )}
          {showWordCount && (
            <span>{stats.words} words</span>
          )}
        </div>
      )}
    </div>
  );
});

RichTextInput.displayName = 'RichTextInput';

// ---------------------------------------------------------------------------
// Find/Replace Hook
// ---------------------------------------------------------------------------

export interface FindReplaceState {
  query: string;
  replacement: string;
  matches: number[];
  currentMatch: number;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
}

export const useFindReplace = (text: string, onChange: (text: string) => void) => {
  const [state, setState] = useState<FindReplaceState>({
    query: '',
    replacement: '',
    matches: [],
    currentMatch: -1,
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
  });

  // Find matches
  const find = useCallback((query: string, options?: Partial<FindReplaceState>) => {
    const opts = { ...state, ...options, query };
    setState(opts);

    if (!query) {
      setState(s => ({ ...s, matches: [], currentMatch: -1 }));
      return;
    }

    try {
      let pattern = opts.useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (opts.wholeWord) pattern = `\\b${pattern}\\b`;
      const flags = opts.caseSensitive ? 'g' : 'gi';
      const regex = new RegExp(pattern, flags);
      
      const matches: number[] = [];
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push(match.index);
      }
      
      setState(s => ({ ...s, matches, currentMatch: matches.length > 0 ? 0 : -1 }));
    } catch {
      setState(s => ({ ...s, matches: [], currentMatch: -1 }));
    }
  }, [text, state]);

  // Navigate matches
  const nextMatch = useCallback(() => {
    setState(s => ({
      ...s,
      currentMatch: s.matches.length > 0
        ? (s.currentMatch + 1) % s.matches.length
        : -1,
    }));
  }, []);

  const prevMatch = useCallback(() => {
    setState(s => ({
      ...s,
      currentMatch: s.matches.length > 0
        ? (s.currentMatch - 1 + s.matches.length) % s.matches.length
        : -1,
    }));
  }, []);

  // Replace
  const replace = useCallback(() => {
    if (state.currentMatch < 0 || !state.query) return;
    
    const index = state.matches[state.currentMatch];
    const newText = text.slice(0, index) + state.replacement + text.slice(index + state.query.length);
    onChange(newText);
  }, [text, onChange, state]);

  const replaceAll = useCallback(() => {
    if (!state.query) return;
    
    try {
      let pattern = state.useRegex ? state.query : state.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (state.wholeWord) pattern = `\\b${pattern}\\b`;
      const flags = state.caseSensitive ? 'g' : 'gi';
      const regex = new RegExp(pattern, flags);
      
      onChange(text.replace(regex, state.replacement));
    } catch {
      // Invalid regex
    }
  }, [text, onChange, state]);

  return {
    ...state,
    setQuery: (query: string) => find(query),
    setReplacement: (replacement: string) => setState(s => ({ ...s, replacement })),
    setCaseSensitive: (caseSensitive: boolean) => find(state.query, { caseSensitive }),
    setWholeWord: (wholeWord: boolean) => find(state.query, { wholeWord }),
    setUseRegex: (useRegex: boolean) => find(state.query, { useRegex }),
    nextMatch,
    prevMatch,
    replace,
    replaceAll,
  };
};

export default RichTextInput;
