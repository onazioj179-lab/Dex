// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { boardToCsv, csvCell } from '../../src/renderer/DEXAPPLICATIONS/standalone/kanbanExport';

describe('Kanban CSV export', () => {
  it('quotes commas, quotes and newlines (RFC 4180)', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('plain')).toBe('plain');
  });

  it('never lets a cell run as a spreadsheet formula', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('one row per card with its column as status', () => {
    const csv = boardToCsv([
      { title: 'To do', cards: [{ title: 'Write spec', description: '', priority: 'high', dueDate: '2026-12-01', createdAt: new Date(2026, 10, 17, 12).getTime(), labels: [{ text: 'docs' }], checklist: [{ done: true }, { done: false }] }] },
      { title: 'Done', cards: [] },
    ]);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('Title,Status,Priority,Due,Labels,Checklist,Repeats,Created,Description');
    expect(lines[1]).toBe('Write spec,To do,high,2026-12-01,docs,1/2,,2026-11-17,');
    expect(lines).toHaveLength(2);
  });
});
