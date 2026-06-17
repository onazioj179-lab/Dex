// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Document Intelligence -- the ONE pure, tested source of text statistics and
// reading metrics for DEX. Notes had `countWords` in its document model and a
// private `readingMinutes` in its editor, with no reading LEVEL or paragraph
// count at all; this consolidates those and adds the professional metrics
// (sentences, paragraphs, Flesch reading-ease, Flesch-Kincaid grade level,
// reading + speaking time). Pure (no DOM/IPC) so Notes, DEX Code, UKI context,
// and tests all share one implementation.

export interface DocumentStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
  paragraphs: number;
  syllables: number;
  /** Minutes to read silently (~200 wpm). 0 for empty text. */
  readingTimeMinutes: number;
  /** Minutes to read aloud (~130 wpm). */
  speakingTimeMinutes: number;
  /** Flesch reading ease, clamped 0-100 (higher = easier). */
  fleschReadingEase: number;
  /** Flesch-Kincaid US grade level (0 = trivial). */
  gradeLevel: number;
  /** Human band for the ease score, e.g. "Plain". */
  readability: string;
}

const WORDS_PER_MINUTE_READ = 200;
const WORDS_PER_MINUTE_SPOKEN = 130;

/** Whitespace-delimited word count. */
export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Sentence count. A non-empty doc with no terminal punctuation counts as 1. */
export function countSentences(text: string): number {
  const matches = text.match(/[^\s.!?][^.!?]*[.!?]+/g);
  const n = matches ? matches.length : 0;
  return n === 0 && text.trim() ? 1 : n;
}

/** Paragraph count (blocks separated by a blank line; non-empty text is >= 1). */
export function countParagraphs(text: string): number {
  const blocks = text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  if (blocks.length) return blocks.length;
  return text.trim() ? 1 : 0;
}

/** Heuristic syllable count for a single word (vowel groups, minus silent endings). */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '') // drop common silent endings
    .replace(/^y/, '')
    .match(/[aeiouy]+/g); // each maximal vowel run ~ one syllable
  return Math.max(1, groups ? groups.length : 1);
}

/** Total syllables across all alphabetic words in the text. */
export function countTextSyllables(text: string): number {
  const words = text.toLowerCase().match(/[a-z]+/g);
  if (!words) return 0;
  let total = 0;
  for (const w of words) total += countSyllables(w);
  return total;
}

/** Whole minutes to read `words` at the given pace (min 1 for any text). */
export function readingTimeMinutes(words: number, wpm = WORDS_PER_MINUTE_READ): number {
  return words > 0 ? Math.max(1, Math.ceil(words / wpm)) : 0;
}

/** Flesch reading ease (0-100, higher is easier). */
export function fleschReadingEase(words: number, sentences: number, syllables: number): number {
  if (words === 0 || sentences === 0) return 0;
  const ease = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
  return Math.round(Math.max(0, Math.min(100, ease)));
}

/** Flesch-Kincaid US grade level (0 = trivial). */
export function fleschKincaidGrade(words: number, sentences: number, syllables: number): number {
  if (words === 0 || sentences === 0) return 0;
  const grade = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
  return Math.max(0, Math.round(grade * 10) / 10);
}

/** Human-readable band for a Flesch reading-ease score. */
export function readabilityLabel(ease: number): string {
  if (ease >= 90) return 'Very easy';
  if (ease >= 70) return 'Easy';
  if (ease >= 60) return 'Plain';
  if (ease >= 50) return 'Fairly hard';
  if (ease >= 30) return 'Hard';
  return 'Very hard';
}

/** Full statistics for a block of plain text. */
export function analyzeText(text: string, opts: { wpm?: number } = {}): DocumentStats {
  const words = countWords(text);
  const sentences = countSentences(text);
  const syllables = countTextSyllables(text);
  const ease = fleschReadingEase(words, sentences, syllables);
  return {
    words,
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/g, '').length,
    sentences,
    paragraphs: countParagraphs(text),
    syllables,
    readingTimeMinutes: readingTimeMinutes(words, opts.wpm),
    speakingTimeMinutes: readingTimeMinutes(words, WORDS_PER_MINUTE_SPOKEN),
    fleschReadingEase: ease,
    gradeLevel: fleschKincaidGrade(words, sentences, syllables),
    readability: readabilityLabel(ease),
  };
}
