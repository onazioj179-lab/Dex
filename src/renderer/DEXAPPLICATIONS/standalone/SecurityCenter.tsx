// =============================================================================
// DEX Platform - SECURITY CENTER
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Surfaces the UKI action audit trail: a live, traceable record of every action
// the assistant invokes — which app, the (redacted) args, whether it was allowed
// (ran / denied / failed / blocked), and when. Built on the DEX app standard
// (AppShell chrome + menus + StatusBar) and reads the bounded audit ring buffer
// the appActionRegistry records, updating live via the dex-uki-action-audit event.
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/appShell';
import type { MenuGroup } from '../../components/appShell/menuTypes';
import {
  getUkiActionAudit,
  registerUkiAppAction,
  unregisterUkiAppAction,
  type UkiActionAuditEntry,
  type UkiActionOutcome,
} from '../../uki/appActionRegistry';
import { registerUkiAppContext, unregisterUkiAppContext } from '../../uki/appContextRegistry';
import { colors, radius, fontStack } from '../../styles/tokens';

const OUTCOME_COLOR: Record<UkiActionOutcome, string> = {
  ran: colors.semantic.success,
  denied: colors.semantic.warning,
  failed: colors.semantic.error,
  blocked: colors.text.tertiary,
};
const OUTCOME_LABEL: Record<UkiActionOutcome, string> = {
  ran: 'Ran', denied: 'Denied', failed: 'Failed', blocked: 'Blocked',
};

type Filter = 'all' | 'mutations' | UkiActionOutcome;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'mutations', label: 'Writes' },
  { id: 'ran', label: 'Ran' },
  { id: 'denied', label: 'Denied' },
  { id: 'failed', label: 'Failed' },
  { id: 'blocked', label: 'Blocked' },
];

function fmtTime(ts: number): string {
  try { return new Date(ts).toLocaleTimeString(); } catch { return String(ts); }
}

const SecurityCenter: React.FC = () => {
  const [entries, setEntries] = useState<readonly UkiActionAuditEntry[]>(() => getUkiActionAudit().slice());
  const [filter, setFilter] = useState<Filter>('all');

  // Live-update as the assistant runs actions.
  useEffect(() => {
    const refresh = () => setEntries(getUkiActionAudit().slice());
    window.addEventListener('dex-uki-action-audit', refresh as EventListener);
    return () => window.removeEventListener('dex-uki-action-audit', refresh as EventListener);
  }, []);

  const newestFirst = useMemo(() => [...entries].reverse(), [entries]);
  const visible = useMemo(() => newestFirst.filter((e) =>
    filter === 'all' ? true : filter === 'mutations' ? e.mutates : e.outcome === filter,
  ), [newestFirst, filter]);

  const stats = useMemo(() => {
    let mutations = 0, denied = 0, failed = 0;
    for (const e of entries) {
      if (e.mutates) mutations++;
      if (e.outcome === 'denied') denied++;
      if (e.outcome === 'failed') failed++;
    }
    return { total: entries.length, mutations, denied, failed };
  }, [entries]);

  // UKI awareness: the assistant can read its own recent activity.
  useEffect(() => {
    registerUkiAppContext('security', () => ({
      appId: 'security',
      custom: { auditedActions: getUkiActionAudit().length },
    }));
    registerUkiAppAction('security', {
      id: 'security.recentActivity',
      description: 'list the most recent UKI actions from the audit trail with their outcome.',
      args: [],
      example: '{}',
      mutates: false,
    }, () => {
      const log = getUkiActionAudit();
      if (!log.length) return 'No UKI actions have been recorded yet.';
      return log.slice(-15).reverse().map((e) => `${OUTCOME_LABEL[e.outcome]}: ${e.id} (${e.appId})`).join('\n');
    });
    return () => {
      unregisterUkiAppContext('security');
      unregisterUkiAppAction('security.recentActivity');
    };
  }, []);

  const menus: MenuGroup[] = [{
    id: 'view', label: 'View',
    sections: [{
      id: 'filter', label: 'Filter',
      items: FILTERS.map((f) => ({ id: `view.${f.id}`, label: f.label, checked: filter === f.id, run: () => setFilter(f.id) })),
    }],
  }];

  const stat = (label: string, value: number, accent?: string): React.ReactNode => (
    <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: radius.xl, padding: '12px 16px', minWidth: 110 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.tertiary }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent || colors.text.primary, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );

  return (
    <AppShell
      appId="security"
      menus={menus}
      title="Security Center"
      surface="plain"
      status={{
        left: <span>{stats.total} audited UKI actions</span>,
        right: <span>{stats.mutations} writes · {stats.denied} denied · {stats.failed} failed</span>,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, fontFamily: fontStack.ui }}>
        {/* Summary */}
        <div style={{ display: 'flex', gap: 12, padding: 16, flexWrap: 'wrap', borderBottom: '1px solid var(--color-border-subtle)' }}>
          {stat('Total', stats.total, colors.accent.default)}
          {stat('Writes', stats.mutations, colors.semantic.warning)}
          {stat('Denied', stats.denied, colors.semantic.warning)}
          {stat('Failed', stats.failed, colors.semantic.error)}
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 4, padding: '10px 16px 6px' }}>
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              height: 26, padding: '0 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer', borderRadius: radius.md,
              border: '1px solid var(--color-border-subtle)',
              background: filter === f.id ? colors.accent.light : 'transparent',
              color: filter === f.id ? colors.accent.default : colors.text.secondary,
            }}>{f.label}</button>
          ))}
        </div>

        {/* Audit list */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '4px 8px 16px' }}>
          {visible.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: colors.text.tertiary, fontSize: 13 }}>
              {stats.total === 0
                ? 'No UKI actions recorded yet. Anything the assistant does to your apps will appear here — fully traceable.'
                : 'No actions match this filter.'}
            </div>
          ) : visible.map((e) => (
            <div key={`${e.ts}-${e.id}`} style={{
              display: 'grid', gridTemplateColumns: '72px 84px 1fr auto', gap: 12, alignItems: 'center',
              padding: '8px 10px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: 12,
            }}>
              <span style={{ color: colors.text.tertiary, fontVariantNumeric: 'tabular-nums' }}>{fmtTime(e.ts)}</span>
              <span style={{
                justifySelf: 'start', padding: '2px 8px', borderRadius: radius.full, fontSize: 10, fontWeight: 700,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                color: OUTCOME_COLOR[e.outcome], background: `color-mix(in srgb, ${OUTCOME_COLOR[e.outcome]} 16%, transparent)`,
              }}>{OUTCOME_LABEL[e.outcome]}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ color: colors.text.primary, fontWeight: 600, fontFamily: fontStack.mono }}>{e.id}</span>
                {e.mutates && <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, color: colors.semantic.warning, border: `1px solid ${colors.semantic.warning}`, borderRadius: 3, padding: '0 4px', textTransform: 'uppercase' }}>write</span>}
                <span style={{ display: 'block', color: colors.text.secondary, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.result}</span>
              </span>
              <span style={{ color: colors.text.tertiary }}>{e.appId}</span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
};

export default SecurityCenter;
