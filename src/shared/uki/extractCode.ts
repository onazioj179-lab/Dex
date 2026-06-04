// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Code-block extraction from Markdown (UKI response rendering — syntax
 * highlighting targets, per-block copy buttons, "run this" actions). Pure: no
 * DOM, no IO.
 */

export interface CodeBlock {
  /** Fence language tag ("ts", "bash", …) or '' when omitted. */
  lang: string;
  code: string;
}

const FENCE_RE = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;

/** All fenced code blocks in `markdown`, in document order. */
export function extractCodeBlocks(markdown: string): CodeBlock[] {
  const out: CodeBlock[] = [];
  FENCE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE_RE.exec(markdown)) !== null) {
    out.push({ lang: m[1] ?? '', code: m[2].replace(/\n$/, '') });
  }
  return out;
}

/** True when the markdown contains at least one fenced code block. */
export function hasCodeBlock(markdown: string): boolean {
  FENCE_RE.lastIndex = 0;
  return FENCE_RE.test(markdown);
}

/** Inline `code` spans (single backticks), excluding fenced blocks. */
export function extractInlineCode(markdown: string): string[] {
  const withoutFences = markdown.replace(FENCE_RE, '');
  const out: string[] = [];
  const re = /`([^`\n]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(withoutFences)) !== null) out.push(m[1]);
  return out;
}
