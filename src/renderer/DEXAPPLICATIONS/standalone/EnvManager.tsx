// =============================================================================
// DEX Platform - Environment Variables (Tier 5 / 44)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
//
// View the live system environment (read-only) and manage DEX-owned overlays
// (a global set + per-app sets, persisted under userData). Keyboard-first.
// Backed by window.dex.env (main/controllers/EnvController.ts); degrades to a
// clear empty state when the native bridge is unavailable (web preview).
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { glassPanel, glassButton } from '../../styles/glassMenu';
import DexIcon from '../../components/DexIcon';
import EmptyState from '../../components/EmptyState';
import { APP_DEFINITIONS } from '../../store/runningApps';

interface EnvBridge {
  listSystem: () => Promise<Array<{ name: string; value: string }>>;
  getManaged: () => Promise<{ global: Record<string, string>; apps: Record<string, Record<string, string>> }>;
  setManaged: (scope: string, name: string, value: string) => Promise<{ success: boolean; message: string }>;
  deleteManaged: (scope: string, name: string) => Promise<{ success: boolean; message: string }>;
}

const getBridge = (): EnvBridge | null => {
  const w = window as any;
  return (w.dex?.env ?? w.electron?.env ?? null) as EnvBridge | null;
};

const inputStyle: React.CSSProperties = {
  padding: '6px 9px', borderRadius: 6, border: '1px solid var(--color-border)',
  background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', outline: 'none',
  fontFamily: 'var(--font-mono)', fontSize: 12, minWidth: 0,
};

export default function EnvManager(): React.ReactElement {
  const bridge = useMemo(getBridge, []);
  const [scope, setScope] = useState<string>('system'); // 'system' | 'global' | appId
  const [system, setSystem] = useState<Array<{ name: string; value: string }>>([]);
  const [managed, setManaged] = useState<{ global: Record<string, string>; apps: Record<string, Record<string, string>> }>({ global: {}, apps: {} });
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const noteTimer = useRef<number | null>(null);

  const flash = useCallback((m: string) => {
    setNote(m);
    if (noteTimer.current) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(''), 4000);
  }, []);

  const loadManaged = useCallback(async () => {
    if (!bridge) return;
    try { setManaged(await bridge.getManaged()); } catch { /* ignore */ }
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    bridge.listSystem().then(setSystem).catch(() => setSystem([]));
    void loadManaged();
  }, [bridge, loadManaged]);

  const appScopes = useMemo(
    () => Object.entries(APP_DEFINITIONS).map(([id, def]) => ({ id, name: def.name })).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const isSystem = scope === 'system';

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let entries: Array<{ name: string; value: string }>;
    if (isSystem) entries = system;
    else if (scope === 'global') entries = Object.entries(managed.global).map(([name, value]) => ({ name, value }));
    else entries = Object.entries(managed.apps[scope] || {}).map(([name, value]) => ({ name, value }));
    return entries
      .filter(e => !q || e.name.toLowerCase().includes(q) || e.value.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [isSystem, scope, system, managed, query]);

  const save = useCallback(async (name: string, value: string) => {
    if (!bridge || isSystem) return;
    setBusy(true);
    try {
      const r = await bridge.setManaged(scope, name, value);
      flash(r?.success ? 'Saved' : (r?.message || 'Save failed'));
      await loadManaged();
    } finally { setBusy(false); }
  }, [bridge, isSystem, scope, flash, loadManaged]);

  const remove = useCallback(async (name: string) => {
    if (!bridge || isSystem) return;
    setBusy(true);
    try { await bridge.deleteManaged(scope, name); await loadManaged(); flash('Removed'); }
    finally { setBusy(false); }
  }, [bridge, isSystem, scope, flash, loadManaged]);

  const addVar = useCallback(() => {
    const n = newName.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) { flash('Invalid name. Letters/digits/underscore; cannot start with a digit.'); return; }
    void save(n, newValue).then(() => { setNewName(''); setNewValue(''); });
  }, [newName, newValue, save, flash]);

  if (!bridge) {
    return (
      <div className="p-6 h-full overflow-auto" style={glassPanel}>
        <EmptyState
          icon={<DexIcon name="code" size={48} />}
          title="Environment manager unavailable"
          description="This needs the packaged DEX app — the env bridge is not reachable in the web preview."
        />
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-auto" style={{ ...glassPanel, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <DexIcon name="code" size={22} />
          <div>
            <h1 className="text-2xl font-semibold" style={{ margin: 0 }}>Environment</h1>
            <div className="text-xs opacity-70">{rows.length} variable{rows.length === 1 ? '' : 's'} {isSystem ? '· read-only' : '· DEX-managed'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <select aria-label="Scope" value={scope} onChange={(e) => setScope(e.target.value)} style={{ ...glassButton, padding: '4px 8px', fontSize: 12 }}>
            <option value="system">System (read-only)</option>
            <option value="global">DEX Global</option>
            <optgroup label="Per-app">
              {appScopes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </optgroup>
          </select>
          <input aria-label="Search variables" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" style={{ ...inputStyle, minWidth: 160 }} />
        </div>
      </header>

      {note && <div role="status" aria-live="polite" className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{note}</div>}

      {!isSystem && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <input aria-label="New variable name" value={newName} onChange={(e) => setNewName(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter') addVar(); }} placeholder="NAME" style={{ ...inputStyle, width: 200 }} />
          <span style={{ opacity: 0.5 }}>=</span>
          <input aria-label="New variable value" value={newValue} onChange={(e) => setNewValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addVar(); }} placeholder="value" style={{ ...inputStyle, flex: 1 }} />
          <button style={glassButton} disabled={busy || !newName.trim()} onClick={addVar}>Add</button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<DexIcon name="code" size={48} />}
          title={isSystem ? 'No matching variables' : 'No variables in this scope yet'}
          description={isSystem ? 'Adjust your search to see system environment variables.' : 'Add a variable above. DEX injects these into processes it launches for this scope.'}
        />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4, overflow: 'auto' }}>
          {rows.map(row => (
            <li key={row.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' }}>
              <span style={{ width: 220, flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-accent)' }} className="truncate" title={row.name}>{row.name}</span>
              {isSystem ? (
                <span className="truncate" style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.85 }} title={row.value}>{row.value}</span>
              ) : (
                <input
                  aria-label={`Value for ${row.name}`}
                  defaultValue={row.value}
                  onBlur={(e) => { if (e.target.value !== row.value) void save(row.name, e.target.value); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  style={{ ...inputStyle, flex: 1 }}
                />
              )}
              <button
                style={{ ...glassButton, padding: '2px 8px', fontSize: 11 }}
                onClick={() => { navigator.clipboard?.writeText(row.value).then(() => flash('Copied'), () => {}); }}
                aria-label={`Copy value of ${row.name}`}
              >Copy</button>
              {!isSystem && (
                <button style={{ ...glassButton, padding: '2px 8px', fontSize: 11, color: 'var(--color-error)', borderColor: 'var(--color-error)' }} disabled={busy} onClick={() => remove(row.name)} aria-label={`Delete ${row.name}`}>Delete</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
