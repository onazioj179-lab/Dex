// =============================================================================
// DEX Platform - Environment Variables (Tier 5 / 44)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
//
// View the live system environment (read-only) and manage DEX-owned overlays
// (a global set + per-app sets, persisted under userData). Keyboard-first.
// Backed by window.dex.env (main/controllers/EnvController.ts); degrades to a
// clear empty state when the native bridge is unavailable (web preview).
//
// Also hosts local ".env profiles": named sets of KEY=VALUE pairs persisted to
// localStorage (no FS backend exists), with masking/reveal, single-value copy,
// .env import (paste) / export (download), profile diffing, validation
// (duplicate/empty/required keys) and .env.example generation.
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { glassPanel, glassButton } from '../../styles/glassMenu';
import { DexSearchInput } from '../../styles/components';
import DexIcon from '../../components/DexIcon';
import EmptyState from '../../components/EmptyState';
import { APP_DEFINITIONS } from '../../store/runningApps';
import { registerUkiAppContext, unregisterUkiAppContext } from '../../uki/appContextRegistry';
import { registerUkiAppAction, unregisterUkiAppAction } from '../../uki/appActionRegistry';

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

const toast = (type: 'success' | 'error' | 'info', message: string) => {
  try { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } })); } catch { /* ignore */ }
};

const inputStyle: React.CSSProperties = {
  padding: '6px 9px', borderRadius: 6, border: '1px solid var(--color-border)',
  background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', outline: 'none',
  fontFamily: 'var(--font-mono)', fontSize: 12, minWidth: 0,
};

// glassButton has no :disabled CSS; give disabled controls the standalone-app
// visual so they don't stay fully lit with a pointer cursor.
const disabledVisual = (off: boolean): React.CSSProperties =>
  off ? { opacity: 0.5, cursor: 'not-allowed' } : {};

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// ---------------------------------------------------------------------------
// Local ".env profiles" model + persistence (localStorage; no FS backend).
// An entry preserves any inline `# comment` that trailed the KEY=VALUE line so
// round-tripping import -> export stays lossless.
// ---------------------------------------------------------------------------

interface EnvEntry { key: string; value: string; comment?: string }
interface EnvProfile { id: string; name: string; entries: EnvEntry[] }

const PROFILES_KEY = 'dex.envManager.profiles.v1';
const ACTIVE_KEY = 'dex.envManager.activeProfile.v1';
const REQUIRED_KEY = 'dex.envManager.requiredKeys.v1';

const makeId = (): string => `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const loadProfiles = (): EnvProfile[] => {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p: any) => p && typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.entries))
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        entries: (p.entries as any[])
          .filter(e => e && typeof e.key === 'string')
          .map(e => ({ key: e.key, value: typeof e.value === 'string' ? e.value : '', comment: typeof e.comment === 'string' ? e.comment : undefined })),
      }));
  } catch { return []; }
};

const persistProfiles = (profiles: EnvProfile[]) => {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)); }
  catch { toast('error', 'Could not save profiles to local storage'); }
};

// Parse .env text into entries. Preserves trailing inline `# comment`.
// Full-line comments and blanks are dropped (keys are the unit of the model).
const parseEnv = (text: string): EnvEntry[] => {
  const out: EnvEntry[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    let key = line.slice(0, eq).trim();
    if (key.startsWith('export ')) key = key.slice(7).trim();
    if (!key) continue;
    let rest = line.slice(eq + 1);
    let comment: string | undefined;
    // A quoted value may legitimately contain '#'; only strip a comment that
    // sits outside quotes.
    const trimmed = rest.trimStart();
    if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
      const quote = trimmed[0];
      const end = trimmed.indexOf(quote, 1);
      if (end >= 0) {
        const after = trimmed.slice(end + 1);
        const hash = after.indexOf('#');
        if (hash >= 0) comment = after.slice(hash + 1).trim();
        rest = trimmed.slice(1, end);
      } else {
        rest = trimmed.slice(1);
      }
    } else {
      const hash = rest.indexOf('#');
      if (hash >= 0) { comment = rest.slice(hash + 1).trim(); rest = rest.slice(0, hash); }
      rest = rest.trim();
    }
    out.push({ key, value: rest, comment: comment || undefined });
  }
  return out;
};

const needsQuote = (v: string): boolean => /\s|#|"|'/.test(v);

const serializeEnv = (entries: EnvEntry[]): string =>
  entries.map(e => {
    const v = needsQuote(e.value) ? `"${e.value.replace(/"/g, '\\"')}"` : e.value;
    return `${e.key}=${v}${e.comment ? ` # ${e.comment}` : ''}`;
  }).join('\n') + (entries.length ? '\n' : '');

const downloadText = (filename: string, text: string) => {
  try {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
    toast('success', `Exported ${filename}`);
  } catch { toast('error', 'Download failed'); }
};

export default function EnvManager(): React.ReactElement {
  const bridge = useMemo(getBridge, []);
  const [scope, setScope] = useState<string>('system'); // 'system' | 'global' | appId | profile:<id>
  const [system, setSystem] = useState<Array<{ name: string; value: string }>>([]);
  const [managed, setManaged] = useState<{ global: Record<string, string>; apps: Record<string, Record<string, string>> }>({ global: {}, apps: {} });
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const noteTimer = useRef<number | null>(null);

  // Local profiles state.
  const [profiles, setProfiles] = useState<EnvProfile[]>(() => loadProfiles());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [requiredKeys, setRequiredKeys] = useState<string[]>(() => {
    try { const r = localStorage.getItem(REQUIRED_KEY); const a = r ? JSON.parse(r) : []; return Array.isArray(a) ? a.filter((x: any) => typeof x === 'string') : []; }
    catch { return []; }
  });
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [diffTarget, setDiffTarget] = useState('');
  const [requiredInput, setRequiredInput] = useState('');

  const isProfile = scope.startsWith('profile:');
  const activeProfileId = isProfile ? scope.slice('profile:'.length) : '';
  const activeProfile = useMemo(() => profiles.find(p => p.id === activeProfileId) || null, [profiles, activeProfileId]);

  const flash = useCallback((m: string) => {
    setNote(m);
    if (noteTimer.current) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(''), 4000);
  }, []);

  // Clear any pending flash timer on unmount so it can't setState after teardown.
  useEffect(() => () => { if (noteTimer.current) window.clearTimeout(noteTimer.current); }, []);

  const loadManaged = useCallback(async () => {
    if (!bridge) return;
    try { setManaged(await bridge.getManaged()); } catch { /* ignore */ }
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    bridge.listSystem().then(setSystem).catch(() => setSystem([]));
    void loadManaged();
  }, [bridge, loadManaged]);

  // Persist active scope (so a chosen profile survives reload) and restore it.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_KEY);
      if (saved && saved.startsWith('profile:') && loadProfiles().some(p => `profile:${p.id}` === saved)) setScope(saved);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { try { localStorage.setItem(ACTIVE_KEY, scope); } catch { /* ignore */ } }, [scope]);
  useEffect(() => { try { localStorage.setItem(REQUIRED_KEY, JSON.stringify(requiredKeys)); } catch { /* ignore */ } }, [requiredKeys]);

  // Reset transient per-scope UI when the scope changes.
  useEffect(() => { setRevealed(new Set()); setShowImport(false); setImportText(''); }, [scope]);

  const updateProfiles = useCallback((next: EnvProfile[]) => { setProfiles(next); persistProfiles(next); }, []);

  const appScopes = useMemo(
    () => Object.entries(APP_DEFINITIONS).map(([id, def]) => ({ id, name: def.name })).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const isSystem = scope === 'system';

  // Rows for the bridge-backed scopes (system/global/per-app). Profiles render
  // through their own list below.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let entries: Array<{ name: string; value: string }>;
    if (isProfile) entries = (activeProfile?.entries || []).map(e => ({ name: e.key, value: e.value }));
    else if (isSystem) entries = system;
    else if (scope === 'global') entries = Object.entries(managed.global).map(([name, value]) => ({ name, value }));
    else entries = Object.entries(managed.apps[scope] || {}).map(([name, value]) => ({ name, value }));
    return entries
      .filter(e => !q || e.name.toLowerCase().includes(q) || e.value.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [isProfile, activeProfile, isSystem, scope, system, managed, query]);

  // UKI app-context: expose the active scope / profile, its key count, and
  // whether values are currently masked. A ref keeps the resolver reading live
  // state so we register once at mount without re-registering on every edit.
  const ukiCtxRef = useRef({ scope, isProfile, isSystem, activeProfile, rows, revealed });
  ukiCtxRef.current = { scope, isProfile, isSystem, activeProfile, rows, revealed };
  useEffect(() => {
    registerUkiAppContext('env', () => {
      const s = ukiCtxRef.current;
      const scopeLabel = s.isProfile
        ? (s.activeProfile?.name || 'profile')
        : s.isSystem ? 'System' : s.scope === 'global' ? 'DEX Global' : s.scope;
      const masked = s.rows.some(r => !s.revealed.has(r.name));
      return {
        appId: 'env',
        focusedItemId: s.isProfile ? s.activeProfile?.id : s.scope,
        custom: {
          scope: scopeLabel,
          profile: s.isProfile ? (s.activeProfile?.name || '(none)') : '(not a profile)',
          keys: s.rows.length,
          masked: masked ? 'yes' : 'no',
          readOnly: s.isSystem ? 'yes' : 'no',
        },
      };
    });
    // Let UKI read the env var KEYS (names only, never values) in this scope.
    registerUkiAppAction('env', {
      id: 'env.listKeys',
      description: 'list the environment variable keys in the current scope (names only, never values).',
      args: [],
      example: '{}',
      mutates: false,
    }, () => {
      const s = ukiCtxRef.current;
      if (!s.rows.length) return 'No environment variables in this scope.';
      return s.rows.slice(0, 200).map((r) => r.name).join(', ');
    });
    return () => {
      unregisterUkiAppContext('env');
      unregisterUkiAppAction('env.listKeys');
    };
  }, []);

  // ---- bridge-backed mutations (unchanged behavior) -----------------------
  const save = useCallback(async (name: string, value: string) => {
    if (!bridge || isSystem || isProfile) return;
    setBusy(true);
    try {
      const r = await bridge.setManaged(scope, name, value);
      flash(r?.success ? 'Saved' : (r?.message || 'Save failed'));
      await loadManaged();
    } finally { setBusy(false); }
  }, [bridge, isSystem, isProfile, scope, flash, loadManaged]);

  const remove = useCallback(async (name: string) => {
    if (!bridge || isSystem || isProfile) return;
    setBusy(true);
    try { await bridge.deleteManaged(scope, name); await loadManaged(); flash('Removed'); }
    finally { setBusy(false); }
  }, [bridge, isSystem, isProfile, scope, flash, loadManaged]);

  // ---- profile-backed mutations -------------------------------------------
  const mutateActiveProfile = useCallback((fn: (entries: EnvEntry[]) => EnvEntry[]) => {
    if (!activeProfile) return;
    const next = profiles.map(p => p.id === activeProfile.id ? { ...p, entries: fn(p.entries) } : p);
    updateProfiles(next);
  }, [activeProfile, profiles, updateProfiles]);

  const setProfileValue = useCallback((key: string, value: string) => {
    mutateActiveProfile(entries => entries.map(e => e.key === key ? { ...e, value } : e));
  }, [mutateActiveProfile]);

  const removeProfileKey = useCallback((key: string) => {
    mutateActiveProfile(entries => entries.filter(e => e.key !== key));
    flash('Removed');
  }, [mutateActiveProfile, flash]);

  const addVar = useCallback(() => {
    const n = newName.trim();
    if (!NAME_RE.test(n)) { flash('Invalid name. Letters/digits/underscore; cannot start with a digit.'); return; }
    if (isProfile) {
      if (activeProfile?.entries.some(e => e.key === n)) { flash('Key already exists in this profile.'); return; }
      mutateActiveProfile(entries => [...entries, { key: n, value: newValue }]);
      setNewName(''); setNewValue('');
      return;
    }
    void save(n, newValue).then(() => { setNewName(''); setNewValue(''); });
  }, [newName, newValue, save, flash, isProfile, activeProfile, mutateActiveProfile]);

  // ---- profile management -------------------------------------------------
  const createProfile = useCallback(() => {
    let name = '';
    try { name = (window.prompt('Profile name', `Profile ${profiles.length + 1}`) || '').trim(); }
    catch { name = `Profile ${profiles.length + 1}`; }
    if (!name) return;
    const prof: EnvProfile = { id: makeId(), name, entries: [] };
    updateProfiles([...profiles, prof]);
    setScope(`profile:${prof.id}`);
    toast('success', `Created profile "${name}"`);
  }, [profiles, updateProfiles]);

  const renameProfile = useCallback(() => {
    if (!activeProfile) return;
    let name = '';
    try { name = (window.prompt('Rename profile', activeProfile.name) || '').trim(); }
    catch { name = ''; }
    if (!name) return;
    updateProfiles(profiles.map(p => p.id === activeProfile.id ? { ...p, name } : p));
  }, [activeProfile, profiles, updateProfiles]);

  const duplicateProfile = useCallback(() => {
    if (!activeProfile) return;
    const copy: EnvProfile = { id: makeId(), name: `${activeProfile.name} copy`, entries: activeProfile.entries.map(e => ({ ...e })) };
    updateProfiles([...profiles, copy]);
    setScope(`profile:${copy.id}`);
    toast('success', `Duplicated to "${copy.name}"`);
  }, [activeProfile, profiles, updateProfiles]);

  const deleteProfile = useCallback(() => {
    if (!activeProfile) return;
    try { if (!window.confirm(`Delete profile "${activeProfile.name}"? This cannot be undone.`)) return; } catch { /* proceed */ }
    const next = profiles.filter(p => p.id !== activeProfile.id);
    updateProfiles(next);
    setScope('system');
    toast('info', 'Profile deleted');
  }, [activeProfile, profiles, updateProfiles]);

  // ---- copy / reveal ------------------------------------------------------
  const copyValue = useCallback((value: string) => {
    try {
      navigator.clipboard?.writeText(value).then(
        () => { flash('Copied'); toast('success', 'Value copied'); },
        () => toast('error', 'Clipboard unavailable'),
      );
    } catch { toast('error', 'Clipboard unavailable'); }
  }, [flash]);

  const toggleReveal = useCallback((key: string) => {
    setRevealed(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }, []);

  // ---- import / export ----------------------------------------------------
  const applyImport = useCallback(() => {
    if (!activeProfile) return;
    const parsed = parseEnv(importText);
    if (!parsed.length) { toast('error', 'No KEY=VALUE lines found'); return; }
    // Merge: parsed keys overwrite, others are kept.
    const byKey = new Map(activeProfile.entries.map(e => [e.key, e] as const));
    for (const e of parsed) byKey.set(e.key, e);
    mutateActiveProfile(() => Array.from(byKey.values()));
    setShowImport(false); setImportText('');
    toast('success', `Imported ${parsed.length} key${parsed.length === 1 ? '' : 's'}`);
  }, [activeProfile, importText, mutateActiveProfile]);

  const exportEnv = useCallback(() => {
    if (!activeProfile) return;
    const text = serializeEnv([...activeProfile.entries].sort((a, b) => a.key.localeCompare(b.key)));
    downloadText(`${activeProfile.name.replace(/[^A-Za-z0-9._-]+/g, '_') || 'profile'}.env`, text);
  }, [activeProfile]);

  const exportExample = useCallback(() => {
    if (!activeProfile) return;
    const stripped = [...activeProfile.entries]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(e => ({ key: e.key, value: '', comment: e.comment }));
    downloadText('.env.example', serializeEnv(stripped));
  }, [activeProfile]);

  // ---- validation ---------------------------------------------------------
  const validation = useMemo(() => {
    if (!activeProfile) return null;
    const counts = new Map<string, number>();
    for (const e of activeProfile.entries) counts.set(e.key, (counts.get(e.key) || 0) + 1);
    const duplicates = [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    const empties = activeProfile.entries.filter(e => !e.value.trim()).map(e => e.key);
    const present = new Set(activeProfile.entries.map(e => e.key));
    const missingRequired = requiredKeys.filter(k => !present.has(k));
    const ok = !duplicates.length && !empties.length && !missingRequired.length;
    return { duplicates, empties, missingRequired, ok };
  }, [activeProfile, requiredKeys]);

  const addRequired = useCallback(() => {
    const n = requiredInput.trim();
    if (!NAME_RE.test(n)) { toast('error', 'Invalid key name'); return; }
    setRequiredKeys(prev => prev.includes(n) ? prev : [...prev, n]);
    setRequiredInput('');
  }, [requiredInput]);

  // ---- diff ---------------------------------------------------------------
  const diff = useMemo(() => {
    if (!activeProfile || !diffTarget) return null;
    const other = profiles.find(p => p.id === diffTarget);
    if (!other || other.id === activeProfile.id) return null;
    const a = new Map(activeProfile.entries.map(e => [e.key, e.value] as const));
    const b = new Map(other.entries.map(e => [e.key, e.value] as const));
    const added: string[] = [];   // in active, not in other
    const removed: string[] = []; // in other, not in active
    const changed: Array<{ key: string; from: string; to: string }> = [];
    for (const [k, v] of a) { if (!b.has(k)) added.push(k); else if (b.get(k) !== v) changed.push({ key: k, from: b.get(k) as string, to: v }); }
    for (const k of b.keys()) if (!a.has(k)) removed.push(k);
    return { other, added: added.sort(), removed: removed.sort(), changed: changed.sort((x, y) => x.key.localeCompare(y.key)) };
  }, [activeProfile, diffTarget, profiles]);

  const otherProfiles = useMemo(() => profiles.filter(p => p.id !== activeProfileId), [profiles, activeProfileId]);

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

  const editable = !isSystem; // global, per-app, and profile scopes are editable

  const sectionStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
    padding: 'var(--space-3)', borderRadius: 8, border: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface)',
  };

  return (
    <div className="p-6 h-full overflow-auto" style={{ ...glassPanel, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <DexIcon name="code" size={22} />
          <div>
            <h1 className="text-2xl font-semibold" style={{ margin: 0 }}>Environment</h1>
            <div className="text-xs opacity-70">{rows.length} variable{rows.length === 1 ? '' : 's'} {isSystem ? '· read-only' : isProfile ? '· local profile' : '· DEX-managed'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <select aria-label="Scope" value={scope} onChange={(e) => setScope(e.target.value)} style={{ ...glassButton, padding: '4px 8px', fontSize: 12 }}>
            <option value="system">System (read-only)</option>
            <option value="global">DEX Global</option>
            <optgroup label="Per-app">
              {appScopes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </optgroup>
            {profiles.length > 0 && (
              <optgroup label=".env profiles">
                {profiles.map(p => <option key={p.id} value={`profile:${p.id}`}>{p.name}</option>)}
              </optgroup>
            )}
          </select>
          <button style={{ ...glassButton, padding: '4px 8px', fontSize: 12 }} onClick={createProfile}>+ Profile</button>
          <DexSearchInput aria-label="Search variables" size="sm" value={query} onChange={(e) => setQuery(e.target.value)} onClear={() => setQuery('')} placeholder="Search" style={{ minWidth: 160 }} />
        </div>
      </header>

      {note && <div role="status" aria-live="polite" className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{note}</div>}

      {/* Profile toolbar + tools (local profiles only) */}
      {isProfile && activeProfile && (
        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13 }}>{activeProfile.name}</strong>
            <span style={{ flex: 1 }} />
            <button style={{ ...glassButton, padding: '2px 8px', fontSize: 11 }} onClick={renameProfile}>Rename</button>
            <button style={{ ...glassButton, padding: '2px 8px', fontSize: 11 }} onClick={duplicateProfile}>Duplicate</button>
            <button style={{ ...glassButton, padding: '2px 8px', fontSize: 11 }} onClick={() => setShowImport(s => !s)}>Import .env</button>
            <button style={{ ...glassButton, padding: '2px 8px', fontSize: 11 }} onClick={exportEnv}>Export .env</button>
            <button style={{ ...glassButton, padding: '2px 8px', fontSize: 11 }} onClick={exportExample}>Export .env.example</button>
            <button style={{ ...glassButton, padding: '2px 8px', fontSize: 11, color: 'var(--color-error)', borderColor: 'var(--color-error)' }} onClick={deleteProfile}>Delete profile</button>
          </div>

          {showImport && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <textarea
                aria-label="Paste .env text"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={'# Paste .env contents here\nAPI_KEY=abc123 # inline comments preserved\nDB_URL="postgres://localhost"'}
                rows={6}
                style={{ ...inputStyle, width: '100%', resize: 'vertical', lineHeight: 1.5 }}
              />
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button style={{ ...glassButton, padding: '4px 10px', fontSize: 12, ...disabledVisual(!importText.trim()) }} disabled={!importText.trim()} onClick={applyImport}>Apply import (merge)</button>
                <button style={{ ...glassButton, padding: '4px 10px', fontSize: 12 }} onClick={() => { setShowImport(false); setImportText(''); }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Validation summary */}
          {validation && (
            <div className="text-xs" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {validation.ok ? (
                <span style={{ color: 'var(--color-success, #4caf50)' }}>Validation: no issues.</span>
              ) : (
                <>
                  {validation.duplicates.length > 0 && <span style={{ color: 'var(--color-warning, #d9a200)' }}>Duplicate keys: {validation.duplicates.join(', ')}</span>}
                  {validation.empties.length > 0 && <span style={{ color: 'var(--color-warning, #d9a200)' }}>Empty values: {validation.empties.join(', ')}</span>}
                  {validation.missingRequired.length > 0 && <span style={{ color: 'var(--color-error)' }}>Missing required: {validation.missingRequired.join(', ')}</span>}
                </>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 4 }}>
                <span style={{ opacity: 0.7 }}>Required keys:</span>
                {requiredKeys.length === 0 && <span style={{ opacity: 0.5 }}>none</span>}
                {requiredKeys.map(k => (
                  <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 6px', borderRadius: 5, border: '1px solid var(--color-border-subtle)', fontFamily: 'var(--font-mono)' }}>
                    {k}
                    <button style={{ ...glassButton, padding: '0 4px', fontSize: 10 }} onClick={() => setRequiredKeys(prev => prev.filter(x => x !== k))} aria-label={`Remove required ${k}`}>×</button>
                  </span>
                ))}
                <input aria-label="Add required key" value={requiredInput} onChange={(e) => setRequiredInput(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter') addRequired(); }} placeholder="REQUIRED_KEY" style={{ ...inputStyle, width: 150, fontSize: 11, padding: '3px 6px' }} />
                <button style={{ ...glassButton, padding: '2px 8px', fontSize: 11, ...disabledVisual(!requiredInput.trim()) }} disabled={!requiredInput.trim()} onClick={addRequired}>Add required</button>
              </div>
            </div>
          )}

          {/* Diff */}
          {otherProfiles.length > 0 && (
            <div className="text-xs" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ opacity: 0.7 }}>Diff against:</span>
                <select aria-label="Diff target profile" value={diffTarget} onChange={(e) => setDiffTarget(e.target.value)} style={{ ...glassButton, padding: '2px 6px', fontSize: 11 }}>
                  <option value="">Select profile…</option>
                  {otherProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {diff && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontFamily: 'var(--font-mono)' }}>
                  {diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0 && (
                    <span style={{ opacity: 0.6 }}>Identical to {diff.other.name}.</span>
                  )}
                  {diff.added.map(k => <span key={`a-${k}`} style={{ color: 'var(--color-success, #4caf50)' }}>+ {k} (only here)</span>)}
                  {diff.removed.map(k => <span key={`r-${k}`} style={{ color: 'var(--color-error)' }}>- {k} (only in {diff.other.name})</span>)}
                  {diff.changed.map(c => <span key={`c-${c.key}`} style={{ color: 'var(--color-warning, #d9a200)' }}>~ {c.key}: changed</span>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {editable && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <input aria-label="New variable name" value={newName} onChange={(e) => setNewName(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter') addVar(); }} placeholder="NAME" style={{ ...inputStyle, width: 200 }} />
          <span style={{ opacity: 0.5 }}>=</span>
          <input aria-label="New variable value" value={newValue} onChange={(e) => setNewValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addVar(); }} placeholder="value" style={{ ...inputStyle, flex: 1 }} />
          <button style={{ ...glassButton, ...disabledVisual(busy || !newName.trim()) }} disabled={busy || !newName.trim()} onClick={addVar}>Add</button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<DexIcon name="code" size={48} />}
          title={isSystem ? 'No matching variables' : isProfile ? 'No keys in this profile yet' : 'No variables in this scope yet'}
          description={isSystem ? 'Adjust your search to see system environment variables.' : isProfile ? 'Add a key above, or import a .env file.' : 'Add a variable above. DEX injects these into processes it launches for this scope.'}
        />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4, overflow: 'auto' }}>
          {rows.map(row => {
            const isRevealed = revealed.has(row.name);
            return (
              <li key={row.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' }}>
                <span style={{ width: 220, flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-accent)' }} className="truncate" title={row.name}>{row.name}</span>
                {isSystem ? (
                  <span className="truncate" style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.85 }} title={isRevealed ? row.value : undefined}>
                    {isRevealed ? row.value : '•'.repeat(Math.min(Math.max(row.value.length, 4), 24))}
                  </span>
                ) : isProfile ? (
                  isRevealed ? (
                    <input
                      aria-label={`Value for ${row.name}`}
                      defaultValue={row.value}
                      key={`${row.name}-${row.value}`}
                      onBlur={(e) => { if (e.target.value !== row.value) setProfileValue(row.name, e.target.value); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  ) : (
                    <span className="truncate" style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.85, letterSpacing: 1 }} title="Hidden — click Reveal">
                      {'•'.repeat(Math.min(Math.max(row.value.length, 4), 24))}
                    </span>
                  )
                ) : (
                  <input
                    aria-label={`Value for ${row.name}`}
                    defaultValue={row.value}
                    type={isRevealed ? 'text' : 'password'}
                    onBlur={(e) => { if (e.target.value !== row.value) void save(row.name, e.target.value); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                )}
                <button
                  style={{ ...glassButton, padding: '2px 8px', fontSize: 11 }}
                  onClick={() => toggleReveal(row.name)}
                  aria-label={`${isRevealed ? 'Hide' : 'Reveal'} value of ${row.name}`}
                >{isRevealed ? 'Hide' : 'Reveal'}</button>
                <button
                  style={{ ...glassButton, padding: '2px 8px', fontSize: 11 }}
                  onClick={() => copyValue(row.value)}
                  aria-label={`Copy value of ${row.name}`}
                >Copy</button>
                {editable && (
                  <button
                    style={{ ...glassButton, padding: '2px 8px', fontSize: 11, color: 'var(--color-error)', borderColor: 'var(--color-error)', ...disabledVisual(busy) }}
                    disabled={busy}
                    onClick={() => { if (isProfile) removeProfileKey(row.name); else void remove(row.name); }}
                    aria-label={`Delete ${row.name}`}
                  >Delete</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
