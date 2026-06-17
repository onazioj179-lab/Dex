// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  countWords,
  countSentences,
  countParagraphs,
  countSyllables,
  readingTimeMinutes,
  fleschReadingEase,
  fleschKincaidGrade,
  readabilityLabel,
  analyzeText,
} from '../../src/shared/text/documentStats';

describe('countWords', () => {
  it('counts whitespace-delimited words', () => {
    expect(countWords('the quick brown fox')).toBe(4);
    expect(countWords('  spaced   out  words ')).toBe(3);
  });
  it('is 0 for empty/whitespace', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n  ')).toBe(0);
  });
});

describe('countSentences', () => {
  it('counts terminal punctuation', () => {
    expect(countSentences('One. Two! Three?')).toBe(3);
  });
  it('treats unpunctuated non-empty text as one sentence', () => {
    expect(countSentences('just a fragment')).toBe(1);
  });
  it('is 0 for empty', () => {
    expect(countSentences('')).toBe(0);
  });
});

describe('countParagraphs', () => {
  it('counts blank-line-separated blocks', () => {
    expect(countParagraphs('Para one.\n\nPara two.\n\nPara three.')).toBe(3);
  });
  it('is 1 for a single block and 0 for empty', () => {
    expect(countParagraphs('one block only')).toBe(1);
    expect(countParagraphs('')).toBe(0);
  });
});

describe('countSyllables', () => {
  it('handles short and common words', () => {
    expect(countSyllables('cat')).toBe(1);
    expect(countSyllables('the')).toBe(1);
  });
  it('counts vowel groups in longer words', () => {
    expect(countSyllables('apple')).toBe(2);
    expect(countSyllables('beautiful')).toBe(3);
  });
  it('is 0 for non-alphabetic', () => {
    expect(countSyllables('123')).toBe(0);
  });
});

describe('readingTimeMinutes', () => {
  it('rounds up at ~200 wpm, min 1', () => {
    expect(readingTimeMinutes(1)).toBe(1);
    expect(readingTimeMinutes(200)).toBe(1);
    expect(readingTimeMinutes(201)).toBe(2);
    expect(readingTimeMinutes(0)).toBe(0);
  });
});

describe('Flesch scores', () => {
  it('reading ease is clamped 0-100', () => {
    expect(fleschReadingEase(0, 0, 0)).toBe(0);
    const ease = fleschReadingEase(100, 10, 150);
    expect(ease).toBeGreaterThanOrEqual(0);
    expect(ease).toBeLessThanOrEqual(100);
  });
  it('grade level is non-negative and rises with complexity', () => {
    const simple = fleschKincaidGrade(10, 2, 12);   // short words, short sentences
    const complex = fleschKincaidGrade(40, 1, 90);  // long sentence, many syllables
    expect(simple).toBeGreaterThanOrEqual(0);
    expect(complex).toBeGreaterThan(simple);
  });
});

describe('readabilityLabel', () => {
  it('bands the ease score', () => {
    expect(readabilityLabel(95)).toBe('Very easy');
    expect(readabilityLabel(65)).toBe('Plain');
    expect(readabilityLabel(10)).toBe('Very hard');
  });
});

describe('analyzeText', () => {
  it('returns all-zero stats for empty text', () => {
    const s = analyzeText('');
    expect(s.words).toBe(0);
    expect(s.sentences).toBe(0);
    expect(s.paragraphs).toBe(0);
    expect(s.readingTimeMinutes).toBe(0);
    expect(s.gradeLevel).toBe(0);
  });
  it('produces a coherent report for real prose', () => {
    const s = analyzeText('The cat sat on the mat. The dog ran in the park.');
    expect(s.words).toBe(12);
    expect(s.sentences).toBe(2);
    expect(s.paragraphs).toBe(1);
    expect(s.readingTimeMinutes).toBe(1);
    expect(s.gradeLevel).toBeGreaterThanOrEqual(0);
    expect(typeof s.readability).toBe('string');
  });
});
