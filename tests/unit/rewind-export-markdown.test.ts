// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { dayToMarkdown } from '../../src/shared/rewind/exportMarkdown';
import type { DaySummary } from '../../src/shared/rewind/daySummary';

const summary: DaySummary = {
  eventCount: 3, focus: 80, topApp: 'videoeditor', totalActiveMs: 120_000, peakHour: 9,
};

describe('rewind export markdown', () => {
  it('renders an empty day', () => {
    const md = dayToMarkdown('Jun 4', { eventCount: 0, focus: 0, topApp: null, totalActiveMs: 0, peakHour: null });
    expect(md).toContain('# Rewind — Jun 4');
    expect(md).toContain('_No activity recorded._');
  });

  it('renders a summary', () => {
    const md = dayToMarkdown('Jun 4', summary);
    expect(md).toContain('- **Events:** 3');
    expect(md).toContain('- **Focus:** 80/100');
    expect(md).toContain('- **Top app:** videoeditor');
    expect(md).toContain('- **Active time:** 2m 00s');
    expect(md).toContain('- **Peak hour:** 09:00');
  });

  it('renders sessions when provided', () => {
    const md = dayToMarkdown('Jun 4', summary, [
      { id: 's1', startTs: 0, endTs: 60_000, appIds: ['a'], primaryAppId: 'a', eventCount: 2, label: 'a session' },
    ]);
    expect(md).toContain('## Sessions');
    expect(md).toContain('- a session (1m 00s)');
  });
});
