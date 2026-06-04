// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Daily report (Rewind export / share, Home digest). Renders a markdown summary
 * from the insights view-model. Integration layer composing `insights` +
 * `format` helpers. Pure: no DOM, no IO.
 */

import type { RewindInsights } from './insights';
import { formatDuration } from '../format/units';

/** Two-digit hour label "09:00". */
function hourLabel(h: number): string {
  return h < 0 ? '—' : `${String(h).padStart(2, '0')}:00`;
}

/** Render a markdown daily report from insights. */
export function dailyReportMarkdown(date: string, insights: RewindInsights, appNames: Record<string, string> = {}): string {
  const lines: string[] = [];
  lines.push(`# Activity — ${date}`);
  lines.push('');

  if (insights.eventCount === 0) {
    lines.push('_No activity recorded._');
    return lines.join('\n');
  }

  lines.push(`- **Sessions:** ${insights.sessionCount}`);
  lines.push(`- **Events:** ${insights.eventCount}`);
  lines.push(`- **Focus score:** ${insights.focus}/100`);
  lines.push(`- **Peak hour:** ${hourLabel(insights.peakHour)}`);
  if (insights.topApp) lines.push(`- **Top app:** ${appNames[insights.topApp] ?? insights.topApp}`);
  lines.push('');

  if (insights.appUsage.length > 0) {
    lines.push('## Time per app');
    for (const u of insights.appUsage.slice(0, 8)) {
      const name = appNames[u.appId] ?? u.appId;
      lines.push(`- ${name}: ${formatDuration(u.ms)} (${Math.round(u.share * 100)}%)`);
    }
  }
  return lines.join('\n');
}
