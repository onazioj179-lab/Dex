// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Comment thread + version diff primitives (T4-003, T4-008, T4-022, T4-024).
 *
 * Pure data layer for collaboration. Render layers live elsewhere.
 */

export interface CommentAuthor {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}

export interface Comment {
  id: string;
  threadId: string;
  author: CommentAuthor;
  body: string;
  /** Optional anchor — canvas region (PRISM/FLUX), paragraph (Notes), card (Tasks). */
  anchor?: string;
  ts: number;
  /** Replies to this comment (nested one level for now). */
  replies?: readonly Comment[];
  /** Mentions extracted at write time. */
  mentions?: readonly string[];
}

const MENTION_RE = /@([a-z0-9_.-]+)/gi;

export function extractMentions(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(MENTION_RE)) {
    if (m[1]) out.push(m[1].toLowerCase());
  }
  return Array.from(new Set(out));
}

export function newComment(
  threadId: string,
  author: CommentAuthor,
  body: string,
  anchor?: string,
): Comment {
  return {
    id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    threadId,
    author,
    body,
    anchor,
    ts: Date.now(),
    mentions: extractMentions(body),
  };
}

/* ---- version diff (T4-008) ----
 * Line-level diff for plain text. Returns ops to apply to old to get new.
 */

export type DiffOp =
  | { op: 'keep'; line: string }
  | { op: 'del'; line: string }
  | { op: 'add'; line: string };

export function lineDiff(oldText: string, newText: string): DiffOp[] {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  // LCS DP table.
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  // Walk the table.
  const out: DiffOp[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ op: 'keep', line: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ op: 'del', line: a[i] }); i++; }
    else { out.push({ op: 'add', line: b[j] }); j++; }
  }
  while (i < n) { out.push({ op: 'del', line: a[i++] }); }
  while (j < m) { out.push({ op: 'add', line: b[j++] }); }
  return out;
}

/** Summary counts (helper for diff badges). */
export function diffStats(ops: readonly DiffOp[]): { added: number; removed: number; kept: number } {
  let added = 0, removed = 0, kept = 0;
  for (const op of ops) {
    if (op.op === 'add') added++;
    else if (op.op === 'del') removed++;
    else kept++;
  }
  return { added, removed, kept };
}
