// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { buildProjectReport } from '../../src/renderer/DEXAPPLICATIONS/standalone/projectReport';

const now = new Date('2026-11-18T12:00:00').getTime();
const base = { projectName: 'Launch', kindLabel: 'Work workspace', notes: [{ title: 'Plan', updated_at: now - 3600_000 }], activity: [{ label: 'Opened Notes', ts: now }], now };

describe('project report', () => {
  it('counts real tasks and calls it at risk only when something is overdue', () => {
    const r = buildProjectReport({ ...base, tasks: [
      { title: 'Ship', dueDate: '2026-11-17' },
      { title: 'Review', dueDate: '2026-11-18', dueTime: '17:00' },
      { title: 'Docs', dueDate: '2026-11-21' },
      { title: 'Old', completed: true, dueDate: '2026-11-01' },
      { title: 'Later', dueDate: '2026-12-30' },
      { title: 'Snoozed', dueDate: '2026-11-10', snoozedUntil: '2026-11-20' },
    ] });
    expect(r.status).toBe('at-risk');
    expect(r.markdown).toContain('**Status:** At risk — 1 overdue');
    expect(r.markdown).toContain('- Open: 5 · Done: 1 · Overdue: 1 · Due today: 1 · Next 7 days: 1');
    expect(r.markdown).toContain('### Overdue\n- Ship (due 2026-11-17)');
    expect(r.markdown).not.toContain('Snoozed (due');
  });
  it('on track with nothing overdue; honest when sources are missing', () => {
    expect(buildProjectReport({ ...base, tasks: [{ title: 'A', dueDate: '2026-11-25' }] }).status).toBe('on-track');
    const r = buildProjectReport({ ...base, tasks: null, notes: null, activity: [] });
    expect(r.markdown).toContain('The Tasks list could not be read.');
    expect(r.markdown).toContain('Notes could not be read.');
    expect(r.markdown).toContain('Nothing recorded this session.');
    expect(buildProjectReport({ ...base, tasks: [] }).status).toBe('no-tasks');
  });
});
