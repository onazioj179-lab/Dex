// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Task Manager › Startup: what Windows starts at sign-in (Run keys for you and
// all users, both Startup folders) with the enabled state Windows records.
// Read-only here; changes go through Windows Settings › Startup apps.

import React, { useEffect, useMemo, useState } from 'react';
import { DexFloatingSearch, DexCapsuleButton } from './controls';

interface StartupItem { name: string; command: string; location: string; enabled: boolean }

export const StartupItemsView: React.FC = () => {
  const [items, setItems] = useState<StartupItem[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const load = () => {
    const dex = (window as unknown as { dex?: { invoke?: (c: string) => Promise<any> } }).dex;
    if (!dex?.invoke) { setError('Startup items come from the DEX desktop app; they are not available here.'); setItems([]); return; }
    setItems(null);
    dex.invoke('system:getStartupItems').then((r) => {
      if (r?.success && Array.isArray(r.items)) { setItems(r.items); setError(''); }
      else { setItems([]); setError('Could not read the startup list.'); }
    }).catch((e) => { setItems([]); setError(String(e?.message || e)); });
  };
  useEffect(load, []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (items ?? []).filter((i) => !t || `${i.name} ${i.command} ${i.location}`.toLowerCase().includes(t))
      .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));
  }, [items, q]);
  const enabledCount = (items ?? []).filter((i) => i.enabled).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', flexWrap: 'wrap' }}>
        <DexFloatingSearch value={q} onChange={setQ} label="Search startup items" size="sm" width={240} />
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
          {items ? `${items.length} items · ${enabledCount} start at sign-in` : 'Reading…'}
        </span>
        <span style={{ flex: 1 }} />
        <DexCapsuleButton size="sm" onClick={load} style={{ border: '1px solid var(--color-border-subtle)' }}>Refresh</DexCapsuleButton>
        <DexCapsuleButton
          size="sm"
          onClick={() => { void (window as any).dex?.invoke?.('shell:openExternal', 'ms-settings:startupapps'); }}
          style={{ border: '1px solid var(--color-border-subtle)' }}
        >
          Manage in Windows Settings
        </DexCapsuleButton>
      </div>
      {error && <div role="alert" style={{ padding: '0 12px 8px', fontSize: 12, color: 'var(--color-text-secondary)' }}>{error}</div>}
      <div role="table" aria-label="Startup items" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 12px 12px' }}>
        <div role="row" style={{ ...row, color: 'var(--color-text-tertiary)', fontWeight: 600, position: 'sticky', top: 0, background: 'var(--color-bg-base)' }}>
          <span role="columnheader">Name</span><span role="columnheader">Status</span><span role="columnheader">Where</span><span role="columnheader">Command</span>
        </div>
        {shown.map((i) => (
          <div role="row" key={`${i.location}:${i.name}`} style={row}>
            <span role="cell" style={{ color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</span>
            <span role="cell" style={{ color: i.enabled ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>{i.enabled ? 'Enabled' : 'Disabled'}</span>
            <span role="cell" style={{ color: 'var(--color-text-secondary)' }}>{i.location}</span>
            <span role="cell" title={i.command} style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.command}</span>
          </div>
        ))}
        {items && shown.length === 0 && !error && (
          <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>{q ? 'Nothing matches.' : 'Nothing starts at sign-in.'}</div>
        )}
      </div>
    </div>
  );
};

const row: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'minmax(140px, 1.2fr) 80px minmax(130px, 0.9fr) minmax(160px, 2fr)', gap: 12,
  alignItems: 'center', height: 30, fontSize: 12, borderBottom: '1px solid var(--color-border-subtle)',
};

export default StartupItemsView;
