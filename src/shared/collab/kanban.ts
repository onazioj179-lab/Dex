// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Kanban board model. Pure: rendering happens elsewhere.
 */

// DEX v3.8.9 - kanban

export interface KanbanCard {
  id: string;
  title: string;
  body?: string;
  assigneeId?: string;
  dueAt?: number;
  labels?: string[];
}

export interface KanbanColumn {
  id: string;
  title: string;
  cards: KanbanCard[];
  /** Soft work-in-progress limit; the UI warns when exceeded. */
  wipLimit?: number;
}

export interface KanbanBoard {
  id: string;
  title: string;
  columns: KanbanColumn[];
}

export function createBoard(id: string, title: string, columnTitles: string[] = ['Backlog', 'In progress', 'Done']): KanbanBoard {
  return {
    id,
    title,
    columns: columnTitles.map((t, i) => ({ id: `col-${i}`, title: t, cards: [] })),
  };
}

export function addCard(board: KanbanBoard, columnId: string, card: KanbanCard): KanbanBoard {
  return {
    ...board,
    columns: board.columns.map((c) => c.id === columnId ? { ...c, cards: [...c.cards, card] } : c),
  };
}

export function moveCard(board: KanbanBoard, cardId: string, toColumnId: string, toIndex?: number): KanbanBoard {
  let card: KanbanCard | undefined;
  const stripped = board.columns.map((c) => {
    const idx = c.cards.findIndex((x) => x.id === cardId);
    if (idx < 0) return c;
    card = c.cards[idx];
    return { ...c, cards: c.cards.filter((x) => x.id !== cardId) };
  });
  if (!card) return board;
  return {
    ...board,
    columns: stripped.map((c) => {
      if (c.id !== toColumnId) return c;
      const cards = [...c.cards];
      const insertAt = toIndex === undefined ? cards.length : Math.max(0, Math.min(toIndex, cards.length));
      cards.splice(insertAt, 0, card!);
      return { ...c, cards };
    }),
  };
}

export function removeCard(board: KanbanBoard, cardId: string): KanbanBoard {
  return {
    ...board,
    columns: board.columns.map((c) => ({ ...c, cards: c.cards.filter((x) => x.id !== cardId) })),
  };
}

export function wipExceeded(column: KanbanColumn): boolean {
  return column.wipLimit !== undefined && column.cards.length > column.wipLimit;
}
