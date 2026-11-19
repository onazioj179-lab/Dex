// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Xack's native action history and this session's UKI permissions.
 *
 * The history is read from Rust (`xack:history`, kept in xack-history.jsonl):
 * every request UKI made, the decision (by policy, a session permission, the
 * user or a schedule), and how each run ended. Session permissions are the
 * "Allow this for the session" choices; revoking one takes effect at once.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  xackHistory,
  xackGrants,
  xackRevoke,
  xackClearHistory,
  XACK_CLASS_TEXT,
  type XackGrant,
  type XackHistoryItem,
} from '../uki/xack';
import { colors, radius, fontStack } from '../styles/tokens';
import { dexConfirm } from './dexConfirm';

const OUTCOME: Record<string, { label: string; color: string }> = {
  approved: { label: 'Approved', color: colors.accent.default },
  declined: { label: 'Declined', color: colors.semantic.warning },
  refused: { label: 'Refused', color: colors.semantic.error },
  started: { label: 'Running', color: colors.accent.default },
  completed: { label: 'Completed', color: colors.semantic.success },
  failed: { label: 'Failed', color: colors.semantic.error },
  cancelled: { label: 'Cancelled', color: colors.text.tertiary },
  'timed-out': { label: 'Timed out', color: colors.semantic.warning },
  revoked: { label: 'Revoked', color: colors.text.tertiary },
};

const BY: Record<string, string> = { policy: 'read-only', grant: 'session permission', user: 'you', schedule: 'when scheduled' };

function when(ts: number): string {
  try {
    const d = new Date(ts);
    const today = new Date();
    return d.toDateString() === today.toDateString() ? d.toLocaleTimeString() : d.toLocaleString();
  } catch {
    return String(ts);
  }
}

export function XackHistoryView(): React.ReactElement {
  const [items, setItems] = useState<XackHistoryItem[] | null>(null);
  const [grants, setGrants] = useState<XackGrant[]>([]);
  const [available, setAvailable] = useState(true);

  const refresh = useCallback(async () => {
    const [h, g] = await Promise.all([xackHistory(300), xackGrants()]);
    setAvailable(h !== null);
    setItems(h ?? []);
    setGrants(g ?? []);
  }, []);

  useEffect(() => {
    void refresh();
    const dex = (window as unknown as { dex?: { on?: (c: string, cb: () => void) => void; off?: (c: string, cb: () => void) => void } }).dex;
    const onEvent = () => { void refresh(); };
    dex?.on?.('xack:history', onEvent);
    return () => { dex?.off?.('xack:history', onEvent); };
  }, [refresh]);

  if (!available) {
    return <div style={empty}>Xack runs in the DEX desktop app. In this preview UKI's actions are checked in the page only.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <section style={section} aria-label="Session permissions">
        <div style={sectionHead}>
          <span style={sectionTitle}>Session permissions</span>
          <span style={hint}>Cleared when DEX restarts.</span>
          {grants.length > 0 && (
            <button type="button" style={{ ...chipBtn, marginLeft: 'auto' }} onClick={async () => { await xackRevoke(); void refresh(); }}>
              Revoke all
            </button>
          )}
        </div>
        {grants.length === 0 ? (
          <div style={hint}>None. UKI asks before anything that changes data, runs a program or sends data off this PC.</div>
        ) : grants.map((g) => (
          <div key={g.id} style={grantRow} data-testid="xack-grant">
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={mono}>{g.action}</span>
              <span style={{ display: 'block', color: colors.text.secondary, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {g.label}{g.scope ? ` · ${g.scope}` : ''} · up to "{XACK_CLASS_TEXT[g.maxClass]}" · used {g.uses}×
              </span>
            </span>
            <button type="button" style={chipBtn} onClick={async () => { await xackRevoke(g.id); void refresh(); }}>Revoke</button>
          </div>
        ))}
      </section>

      <div style={{ ...sectionHead, padding: '10px 16px 6px' }}>
        <span style={sectionTitle}>Native action history</span>
        <span style={hint}>{items?.length ?? 0} records</span>
        {items && items.length > 0 && (
          <button
            type="button"
            style={{ ...chipBtn, marginLeft: 'auto' }}
            onClick={async () => { if (await dexConfirm({ title: 'Clear UKI\'s action history?', message: 'This cannot be undone.', confirmLabel: 'Clear', tone: 'destructive' })) { await xackClearHistory(); void refresh(); } }}
          >Clear history</button>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 8px 16px' }}>
        {items && items.length === 0 && <div style={empty}>Nothing yet. Every action UKI asks Xack for appears here with who approved it and how it ended.</div>}
        {items?.map((e, i) => {
          const o = OUTCOME[e.outcome] ?? { label: e.outcome, color: colors.text.tertiary };
          return (
            <div key={`${e.ts}-${i}`} style={row} data-testid="xack-history-row">
              <span style={{ color: colors.text.tertiary, fontVariantNumeric: 'tabular-nums' }}>{when(e.ts)}</span>
              <span style={{ ...pill, color: o.color, background: `color-mix(in srgb, ${o.color} 16%, transparent)` }}>{o.label}</span>
              <span style={{ minWidth: 0 }}>
                <span style={mono}>{e.action ?? e.kind}</span>
                {e.class && <span style={classTag}>{XACK_CLASS_TEXT[e.class]}</span>}
                <span style={{ display: 'block', color: colors.text.secondary, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[e.summary, e.scope && e.scope !== e.summary ? `in ${e.scope}` : '', e.by && e.kind !== 'exec' ? `by ${BY[e.by] ?? e.by}` : '', e.detail, e.durationMs != null ? `${(e.durationMs / 1000).toFixed(1)} s` : '']
                    .filter(Boolean).join(' · ')}
                </span>
              </span>
              <span style={{ color: colors.text.tertiary }}>{e.app ?? ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const empty: React.CSSProperties = { padding: 40, textAlign: 'center', color: colors.text.tertiary, fontSize: 13 };
const section: React.CSSProperties = { padding: '10px 16px 12px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 };
const sectionHead: React.CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 12 };
const sectionTitle: React.CSSProperties = { fontWeight: 600, color: colors.text.primary, fontSize: 12.5 };
const hint: React.CSSProperties = { color: colors.text.tertiary, fontSize: 11.5 };
const grantRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: '1px solid var(--color-border-subtle)' };
const row: React.CSSProperties = { display: 'grid', gridTemplateColumns: '84px 84px 1fr auto', gap: 12, alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: 12 };
const pill: React.CSSProperties = { justifySelf: 'start', padding: '2px 8px', borderRadius: radius.full, fontSize: 10, fontWeight: 700 };
const mono: React.CSSProperties = { color: colors.text.primary, fontWeight: 600, fontFamily: fontStack.mono };
const classTag: React.CSSProperties = { marginLeft: 8, fontSize: 10, color: colors.text.tertiary };
const chipBtn: React.CSSProperties = {
  height: 24, padding: '0 10px', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', borderRadius: radius.full,
  border: '1px solid var(--color-border-control)', background: 'transparent', color: colors.text.secondary,
};
