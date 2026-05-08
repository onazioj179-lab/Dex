// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// readerSummary
//
// Pure extractive summarizer for DEX's reader-mode feature. Implements the
// "better reader mode summaries" feedback. No external models, no network,
// no DOM. Scores sentences by:
//   1. Term frequency of non-stopword tokens (TF).
//   2. Inverse document position bonus (early sentences carry more weight).
//   3. Sentence length sweet-spot (very short / very long sentences penalised).
//
// Returns the top-N sentences in the original order, joined into a paragraph.
// =============================================================================

const STOPWORDS = new Set<string>([
  'a','an','and','are','as','at','be','but','by','for','from','has','have','he','her','his',
  'i','in','is','it','its','not','of','on','or','our','she','that','the','their','them',
  'they','this','to','was','we','were','what','when','where','which','who','will','with',
  'you','your','about','also','can','do','does','if','into','no','so','than','then','these',
  'there','those','too','very','just','one','two','some','any','all','because','more','most',
  'now','out','over','than','up','down','off','only','my','me','his','hers','us','let',
]);

export interface SummaryOptions {
  /** Number of sentences to keep. Default 3. */
  sentences?: number;
  /** Minimum chars in a sentence to be considered. Default 25. */
  minSentenceChars?: number;
  /** Maximum chars in a sentence to be considered. Default 320. */
  maxSentenceChars?: number;
}

export interface SummaryResult {
  summary: string;
  /** Sentences chosen, in original order. */
  picks: string[];
  /** Total sentences detected in the source. */
  totalSentences: number;
}

/** Split text into sentences using punctuation cues. Keeps the terminator. */
export function splitSentences(text: string): string[] {
  if (!text) return [];
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  // Splits on ., !, ? followed by whitespace + capital / quote / digit, while
  // keeping the terminator attached to the preceding sentence.
  const parts = cleaned.split(/(?<=[.!?])\s+(?=[A-Z0-9"'`])/g);
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Tokenize a string into lowercase non-stopword terms. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\-\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Score every sentence in `text` and return the top-N as an extractive
 * summary. Picks are returned in the original order so the result reads
 * naturally.
 */
export function summarize(text: string, options: SummaryOptions = {}): SummaryResult {
  const targetCount = Math.max(1, options.sentences ?? 3);
  const minChars = options.minSentenceChars ?? 25;
  const maxChars = options.maxSentenceChars ?? 320;

  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return { summary: '', picks: [], totalSentences: 0 };
  }
  if (sentences.length <= targetCount) {
    return {
      summary: sentences.join(' '),
      picks: sentences.slice(),
      totalSentences: sentences.length,
    };
  }

  // Build term frequency over the entire document.
  const termFreq = new Map<string, number>();
  const sentenceTokens: string[][] = sentences.map((s) => {
    const toks = tokenize(s);
    for (const t of toks) termFreq.set(t, (termFreq.get(t) || 0) + 1);
    return toks;
  });

  // Score sentences.
  const scores: { idx: number; score: number }[] = sentences.map((s, idx) => {
    const len = s.length;
    if (len < minChars || len > maxChars) {
      return { idx, score: -Infinity };
    }
    const toks = sentenceTokens[idx];
    if (toks.length === 0) return { idx, score: -Infinity };
    let raw = 0;
    for (const t of toks) raw += termFreq.get(t) || 0;
    // Normalise by sentence length so we don't only pick the longest one.
    const norm = raw / Math.sqrt(toks.length);
    // Position bonus: linearly decreasing from 1.0 -> 0.5 across the document.
    const positionBonus = 1.0 - 0.5 * (idx / Math.max(1, sentences.length - 1));
    return { idx, score: norm * positionBonus };
  });

  // Pick the top-N indices then sort them back into source order.
  const ordered = scores
    .filter((s) => Number.isFinite(s.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, targetCount)
    .map((s) => s.idx)
    .sort((a, b) => a - b);

  const picks = ordered.map((i) => sentences[i]);
  return {
    summary: picks.join(' '),
    picks,
    totalSentences: sentences.length,
  };
}
