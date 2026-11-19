import { toLocalDateInput } from '../../utils/localDate';
// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Kanban board → CSV (RFC 4180 quoting). One row per card, with its column as
// the status. Cells that start with = + - @ are prefixed with ' so a
// spreadsheet never runs them as formulas (CSV injection).

export interface ExportCard {
  title: string; description: string; priority: string; dueDate?: string; createdAt: number;
  labels: { text: string }[]; checklist: { done: boolean }[]; recurrence?: string;
}
export interface ExportColumn { title: string; cards: ExportCard[] }

export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function boardToCsv(columns: ExportColumn[]): string {
  const head = ['Title', 'Status', 'Priority', 'Due', 'Labels', 'Checklist', 'Repeats', 'Created', 'Description'];
  const rows = [head.join(',')];
  for (const col of columns) {
    for (const c of col.cards) {
      const done = c.checklist.filter((x) => x.done).length;
      rows.push([
        c.title, col.title, c.priority, c.dueDate ?? '', c.labels.map((l) => l.text).join('; '),
        c.checklist.length ? `${done}/${c.checklist.length}` : '', c.recurrence && c.recurrence !== 'none' ? c.recurrence : '',
        toLocalDateInput(new Date(c.createdAt)), c.description,
      ].map(csvCell).join(','));
    }
  }
  return rows.join('\r\n') + '\r\n';
}
