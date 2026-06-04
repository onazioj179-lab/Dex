// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Markdown → plain text (UKI read-aloud/TTS, notification previews, plain-text
 * summaries). Strips common Markdown syntax while keeping the readable content.
 * Heuristic and order-sensitive; not a full parser. Pure: no DOM, no IO.
 */

/** Strip Markdown formatting, returning readable plain text. */
export function stripMarkdown(md: string): string {
  let s = md;

  // Fenced code blocks → keep inner text, drop fences.
  s = s.replace(/```[a-z]*\n?([\s\S]*?)```/gi, '$1');
  // Inline code → inner text.
  s = s.replace(/`([^`]+)`/g, '$1');
  // Images ![alt](url) → alt.
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Links [text](url) → text.
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // Headings: drop leading #'s.
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  // Blockquotes: drop leading '>'.
  s = s.replace(/^\s{0,3}>\s?/gm, '');
  // Unordered list markers.
  s = s.replace(/^\s*[-*+]\s+/gm, '');
  // Ordered list markers.
  s = s.replace(/^\s*\d+\.\s+/gm, '');
  // Bold/italic (**, __, *, _) — remove the markers, keep content.
  s = s.replace(/(\*\*|__)(.*?)\1/g, '$2');
  s = s.replace(/(\*|_)(.*?)\1/g, '$2');
  // Strikethrough.
  s = s.replace(/~~(.*?)~~/g, '$1');
  // Horizontal rules.
  s = s.replace(/^\s*([-*_])\1{2,}\s*$/gm, '');
  // Collapse 3+ newlines.
  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}

/** First `maxLen` chars of the plain-text form, with an ellipsis if truncated. */
export function plainPreview(md: string, maxLen = 140): string {
  const plain = stripMarkdown(md).replace(/\s+/g, ' ').trim();
  return plain.length > maxLen ? plain.slice(0, maxLen - 1) + '…' : plain;
}
