// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX Notes -- Word Suggestion System
// ==========================================================================
// Frontend trie + bigram prediction with inline ghost text display.
// Records words to backend for frequency tracking across sessions.
// ==========================================================================

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Trie Node
// ---------------------------------------------------------------------------

interface TrieNode {
  children: Map<string, TrieNode>;
  word: string | null;
  frequency: number;
}

function createTrieNode(): TrieNode {
  return { children: new Map(), word: null, frequency: 0 };
}

// ---------------------------------------------------------------------------
// Trie
// ---------------------------------------------------------------------------

export class WordTrie {
  private root: TrieNode = createTrieNode();

  insert(word: string, frequency: number = 1): void {
    if (!word || word.length < 2) return;
    const lower = word.toLowerCase();
    let node = this.root;
    for (const ch of lower) {
      if (!node.children.has(ch)) {
        node.children.set(ch, createTrieNode());
      }
      node = node.children.get(ch)!;
    }
    node.word = lower;
    node.frequency += frequency;
  }

  search(prefix: string, limit: number = 8): Array<{ word: string; frequency: number }> {
    if (!prefix || prefix.length < 1) return [];
    const lower = prefix.toLowerCase();
    let node = this.root;
    for (const ch of lower) {
      if (!node.children.has(ch)) return [];
      node = node.children.get(ch)!;
    }
    // Collect all words under this prefix
    const results: Array<{ word: string; frequency: number }> = [];
    this.collect(node, results);
    // Sort by frequency descending, take top N
    results.sort((a, b) => b.frequency - a.frequency);
    return results.slice(0, limit);
  }

  private collect(node: TrieNode, results: Array<{ word: string; frequency: number }>): void {
    if (node.word) {
      results.push({ word: node.word, frequency: node.frequency });
    }
    for (const child of node.children.values()) {
      this.collect(child, results);
    }
  }

  clear(): void {
    this.root = createTrieNode();
  }
}

// ---------------------------------------------------------------------------
// Bigram Predictor
// ---------------------------------------------------------------------------

export class BigramPredictor {
  // Map<previousWord, Map<nextWord, frequency>>
  private bigrams: Map<string, Map<string, number>> = new Map();

  record(prev: string, next: string): void {
    if (!prev || !next) return;
    const p = prev.toLowerCase();
    const n = next.toLowerCase();
    if (!this.bigrams.has(p)) {
      this.bigrams.set(p, new Map());
    }
    const inner = this.bigrams.get(p)!;
    inner.set(n, (inner.get(n) || 0) + 1);
  }

  predict(prev: string, limit: number = 5): Array<{ word: string; frequency: number }> {
    if (!prev) return [];
    const p = prev.toLowerCase();
    const inner = this.bigrams.get(p);
    if (!inner) return [];
    const results: Array<{ word: string; frequency: number }> = [];
    for (const [word, freq] of inner) {
      results.push({ word, frequency: freq });
    }
    results.sort((a, b) => b.frequency - a.frequency);
    return results.slice(0, limit);
  }

  clear(): void {
    this.bigrams.clear();
  }
}

// ---------------------------------------------------------------------------
// Word Extraction
// ---------------------------------------------------------------------------

const WORD_RE = /[a-zA-Z']+/g;

export function extractWords(text: string): string[] {
  const matches = text.match(WORD_RE);
  return matches ? matches.filter(w => w.length >= 2) : [];
}

export function getLastWord(text: string, cursorPos: number): string {
  const before = text.slice(0, cursorPos);
  const match = before.match(/[a-zA-Z']+$/);
  return match ? match[0] : '';
}

export function getPreviousWord(text: string, cursorPos: number): string {
  const before = text.slice(0, cursorPos);
  const words = before.match(WORD_RE);
  if (!words || words.length < 2) return '';
  return words[words.length - 2];
}

// ---------------------------------------------------------------------------
// Suggestion Bar Component
// ---------------------------------------------------------------------------

interface SuggestionBarProps {
  suggestions: string[];
  onSelect: (word: string) => void;
  visible: boolean;
  position: { top: number; left: number };
}

const barStyles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    zIndex: 'var(--z-tooltip)',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(30,30,30,0.95)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    padding: '4px 0',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    minWidth: 140,
    maxWidth: 280,
    maxHeight: 200,
    overflow: 'auto',
  },
  item: {
    padding: '6px 12px',
    fontSize: 13,
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    transition: 'background 0.1s',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  itemActive: {
    background: 'rgba(100,210,255,0.12)',
    color: 'var(--color-text-primary)',
  },
  freq: {
    fontSize: 10,
    color: 'var(--color-text-tertiary)',
    marginLeft: 8,
  },
};

export const SuggestionBar: React.FC<SuggestionBarProps> = memo(({
  suggestions,
  onSelect,
  visible,
  position,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [suggestions]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        if (suggestions[activeIndex]) {
          e.preventDefault();
          onSelect(suggestions[activeIndex]);
        }
      } else if (e.key === 'Escape') {
        // Let parent handle hiding
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [visible, suggestions, activeIndex, onSelect]);

  if (!visible || suggestions.length === 0) return null;

  return (
    <div style={{ ...barStyles.container, top: position.top, left: position.left }}>
      {suggestions.map((word, i) => (
        <div
          key={word}
          style={{
            ...barStyles.item,
            ...(i === activeIndex ? barStyles.itemActive : {}),
          }}
          onMouseDown={e => { e.preventDefault(); onSelect(word); }}
          onMouseEnter={() => setActiveIndex(i)}
        >
          {word}
        </div>
      ))}
    </div>
  );
});

SuggestionBar.displayName = 'SuggestionBar';

// ---------------------------------------------------------------------------
// Ghost Text Overlay
// ---------------------------------------------------------------------------

interface GhostTextProps {
  text: string;
  visible: boolean;
}

export const GhostText: React.FC<GhostTextProps> = memo(({ text, visible }) => {
  if (!visible || !text) return null;
  return (
    <span
      style={{
        color: 'var(--color-text-tertiary)',
        pointerEvents: 'none',
        fontStyle: 'italic',
        userSelect: 'none',
      }}
    >
      {text}
    </span>
  );
});

GhostText.displayName = 'GhostText';

// ---------------------------------------------------------------------------
// Hook: useWordSuggestions
// ---------------------------------------------------------------------------

interface UseWordSuggestionsResult {
  suggestions: string[];
  ghostText: string;
  suggestionsVisible: boolean;
  suggestionsPosition: { top: number; left: number };
  handleTextChange: (text: string, cursorPos: number) => void;
  acceptSuggestion: (word: string) => string;
  hideSuggestions: () => void;
  trie: WordTrie;
  bigram: BigramPredictor;
}

export function useWordSuggestions(
  recordWordToBackend: (word: string) => Promise<void>,
  getSuggestionsFromBackend: (prefix: string) => Promise<void>,
): UseWordSuggestionsResult {
  const trie = useRef(new WordTrie());
  const bigram = useRef(new BigramPredictor());
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [ghostText, setGhostText] = useState('');
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const prevWordRef = useRef('');

  const handleTextChange = useCallback((text: string, cursorPos: number) => {
    const lastWord = getLastWord(text, cursorPos);
    const previousWord = getPreviousWord(text, cursorPos);

    // Record completed words (previous word changed means user moved past it)
    if (previousWord && previousWord !== prevWordRef.current && previousWord.length >= 3) {
      prevWordRef.current = previousWord;
      trie.current.insert(previousWord);
      recordWordToBackend(previousWord).catch((e: unknown) => { console.warn('[DEX]', e); });
    }

    // Record bigrams
    if (previousWord && lastWord && lastWord.length >= 2) {
      bigram.current.record(previousWord, lastWord);
    }

    if (lastWord.length >= 2) {
      // Get trie suggestions
      const trieSuggestions = trie.current.search(lastWord, 5);
      // Get bigram predictions
      const bigramPredictions = previousWord
        ? bigram.current.predict(previousWord, 3)
        : [];

      // Merge, deduplicate, prioritize bigram matches that start with prefix
      const seen = new Set<string>();
      const merged: string[] = [];

      for (const bp of bigramPredictions) {
        if (bp.word.startsWith(lastWord.toLowerCase()) && !seen.has(bp.word) && bp.word !== lastWord.toLowerCase()) {
          seen.add(bp.word);
          merged.push(bp.word);
        }
      }
      for (const ts of trieSuggestions) {
        if (!seen.has(ts.word) && ts.word !== lastWord.toLowerCase()) {
          seen.add(ts.word);
          merged.push(ts.word);
        }
      }

      if (merged.length > 0) {
        setSuggestions(merged.slice(0, 6));
        setGhostText(merged[0].slice(lastWord.length));
        setVisible(true);

        // Position at caret
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          setPosition({ top: rect.bottom + 4, left: rect.left });
        }
      } else {
        setSuggestions([]);
        setGhostText('');
        setVisible(false);
      }

      // Also fetch from backend for future use
      getSuggestionsFromBackend(lastWord).catch((e: unknown) => { console.warn('[DEX]', e); });
    } else {
      setSuggestions([]);
      setGhostText('');
      setVisible(false);
    }
  }, [recordWordToBackend, getSuggestionsFromBackend]);

  const acceptSuggestion = useCallback((word: string): string => {
    setVisible(false);
    setGhostText('');
    setSuggestions([]);
    return word;
  }, []);

  const hideSuggestions = useCallback(() => {
    setVisible(false);
    setGhostText('');
  }, []);

  return {
    suggestions,
    ghostText,
    suggestionsVisible: visible,
    suggestionsPosition: position,
    handleTextChange,
    acceptSuggestion,
    hideSuggestions,
    trie: trie.current,
    bigram: bigram.current,
  };
}

// ---------------------------------------------------------------------------
// Populate trie from backend word history
// ---------------------------------------------------------------------------

export async function populateTrieFromBackend(
  trie: WordTrie,
  bigram: BigramPredictor,
): Promise<void> {
  try {
    const dex = (window as any).dex;
    if (!dex?.invoke) return;
    const words: Array<{ word: string; frequency: number }> = await dex.invoke('dexnotes:get-word-suggestions', '');
    if (Array.isArray(words)) {
      for (const { word, frequency } of words) {
        trie.insert(word, frequency);
      }
    }
  } catch (_e) {
    // Silently fail -- suggestions are optional
  }
}
