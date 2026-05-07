// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Threaded comment model for collaboration.
 */

// DEX v3.8.9 - comments

export interface CommentNode {
  id: string;
  parentId?: string;
  authorId: string;
  body: string;
  createdAt: number;
  editedAt?: number;
  resolved?: boolean;
  reactions?: Record<string, string[]>;     // reaction-name -> userIds
}

export interface CommentTree {
  byId: Map<string, CommentNode>;
  rootIds: string[];
}

export function createCommentTree(): CommentTree {
  return { byId: new Map(), rootIds: [] };
}

export function addComment(tree: CommentTree, c: CommentNode): CommentTree {
  const next = { byId: new Map(tree.byId), rootIds: [...tree.rootIds] };
  next.byId.set(c.id, c);
  if (!c.parentId) next.rootIds.push(c.id);
  return next;
}

export function editComment(tree: CommentTree, id: string, body: string, now: number = Date.now()): CommentTree {
  const existing = tree.byId.get(id);
  if (!existing) return tree;
  const next = { byId: new Map(tree.byId), rootIds: tree.rootIds };
  next.byId.set(id, { ...existing, body, editedAt: now });
  return next;
}

export function resolveComment(tree: CommentTree, id: string): CommentTree {
  const existing = tree.byId.get(id);
  if (!existing) return tree;
  const next = { byId: new Map(tree.byId), rootIds: tree.rootIds };
  next.byId.set(id, { ...existing, resolved: true });
  return next;
}

export function deleteComment(tree: CommentTree, id: string): CommentTree {
  if (!tree.byId.has(id)) return tree;
  const next = { byId: new Map(tree.byId), rootIds: tree.rootIds.filter((r) => r !== id) };
  // Cascade: drop direct children too.
  for (const node of [...next.byId.values()]) {
    if (node.parentId === id) next.byId.delete(node.id);
  }
  next.byId.delete(id);
  return next;
}

export function childrenOf(tree: CommentTree, id: string): CommentNode[] {
  return [...tree.byId.values()].filter((n) => n.parentId === id).sort((a, b) => a.createdAt - b.createdAt);
}

export function unresolvedCount(tree: CommentTree): number {
  let n = 0;
  for (const c of tree.byId.values()) if (!c.resolved) n += 1;
  return n;
}
