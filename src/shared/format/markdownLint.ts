// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Lightweight Markdown linting (DEX v6 Track G). Catches the common authoring
 * mistakes -- heading levels that skip a rank, links/images with no URL, links
 * with empty text, and an unbalanced code fence. Pure + unit-tested; the
 * Markdown editor surfaces the count so writers can fix issues as they go.
 * Deliberately conservative: structural checks only, no style opinions.
 */

export interface MarkdownIssue {
  /** 1-based line number. */
  line: number;
  message: string;
}

export function lintMarkdown(md: string): MarkdownIssue[] {
  const issues: MarkdownIssue[] = [];
  const lines = md.split('\n');

  let prevHeading = 0;
  let fenceCount = 0;
  let lastFenceLine = 0;
  let inFence = false;

  lines.forEach((line, i) => {
    const ln = i + 1;

    // Code fences toggle "inside code" -- their delimiter lines are not linted.
    if (/^\s*```/.test(line)) {
      fenceCount++;
      lastFenceLine = ln;
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const heading = /^(#{1,6})\s/.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (prevHeading > 0 && level > prevHeading + 1) {
        issues.push({ line: ln, message: `Heading skips from h${prevHeading} to h${level}` });
      }
      prevHeading = level;
    }

    // Links and images: ![alt](url) / [text](url)
    const linkRe = /(!?)\[([^\]]*)\]\(([^)]*)\)/g;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(line)) !== null) {
      const isImage = m[1] === '!';
      const text = m[2].trim();
      const url = m[3].trim();
      if (url === '') {
        issues.push({ line: ln, message: isImage ? 'Image has no source URL' : 'Link has no URL' });
      } else if (!isImage && text === '') {
        issues.push({ line: ln, message: 'Link has empty text' });
      }
    }
  });

  if (fenceCount % 2 !== 0) {
    issues.push({ line: lastFenceLine, message: 'Unclosed code block (``` is unbalanced)' });
  }

  return issues;
}
