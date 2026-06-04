// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Rewind day export to Markdown (Rewind "export report", journaling, sharing).
 * Renders a `DaySummary` (+ optional session list) as a readable markdown
 * document. Pure: composes `daySummary` and the shared formatters. No DOM/IO.
 */

import type { DaySummary } from './daySummary';
import type { TimelineSession } from './timeline';
import { formatDuration } from '../format/units';

function pad2(n: number): string { return String(n).padStart(2, '0'); }

/** Render a day summary (and optional sessions) as markdown. */
export function dayToMarkdown(dateLabel: string, summary: DaySummary, sessions: readonly TimelineSession[] = []): string {
  const lines: string[] = [];
  lines.push(`# Rewind — ${dateLabel}`, '');

  if (summary.eventCount === 0) {
    lines.push('_No activity recorded._');
    return lines.join('\n');
  }

  lines.push('## Summary', '');
  lines.push(`- **Events:** ${summary.eventCount}`);
  lines.push(`- **Focus:** ${summary.focus}/100`);
  if (summary.topApp) lines.push(`- **Top app:** ${summary.topApp}`);
  lines.push(`- **Active time:** ${formatDuration(summary.totalActiveMs)}`);
  if (summary.peakHour !== null) lines.push(`- **Peak hour:** ${pad2(summary.peakHour)}:00`);

  if (sessions.length > 0) {
    lines.push('', '## Sessions', '');
    for (const s of sessions) {
      lines.push(`- ${s.label} (${formatDuration(Math.max(0, s.endTs - s.startTs))})`);
    }
  }
  return lines.join('\n');
}
