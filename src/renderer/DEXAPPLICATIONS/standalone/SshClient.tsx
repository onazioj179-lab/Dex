// =============================================================================
// DEX Platform - SSH (Tier 5 / 42)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
//
// Manage SSH connection profiles and keys without leaving DEX. Create/edit/
// delete profiles, generate or list keys (ssh-keygen), and copy a ready connect
// command. Backed by window.dex.ssh (main/controllers/SshController.ts).
//
// The backend profile record only stores the core connection fields, so the
// richer organisation layer -- per-host groups/folders, startup snippets, and
// the recent-sessions list -- is persisted client-side in localStorage and
// merged onto the backend profiles by id. Importing an ~/.ssh/config block
// creates real backend profiles through saveProfile.
// NOTE: a fully embedded interactive SSH session needs a PTY (node-pty) and is
// out of this slice -- the UI produces a copy-able connect command instead.
// Degrades to a clear empty state when the bridge is unavailable (web preview).
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { glassPanel, glassButton } from '../../styles/glassMenu';
import DexIcon from '../../components/DexIcon';
import EmptyState from '../../components/EmptyState';

interface SshProfile { id: string; name: string; host: string; user: string; port: number; keyPath?: string; lastConnected?: number; }
interface SshKey { path: string; type: string; fingerprint: string; comment: string; }

// Client-side sidecar stored per profile id (the backend record can't hold these).
interface SshMeta { group?: string; startupCommand?: string; }
interface RecentSession { id: string; name: string; target: string; at: number; }

interface SshBridge {
  check: () => Promise<{ ssh: boolean; keygen: boolean }>;
  listProfiles: () => Promise<SshProfile[]>;
  saveProfile: (p: Partial<SshProfile>) => Promise<{ success: boolean; message: string; profile?: SshProfile }>;
  deleteProfile: (id: string) => Promise<{ success: boolean; message: string }>;
  listKeys: () => Promise<SshKey[]>;
  generateKey: (opts: { type?: string; name?: string; comment?: string }) => Promise<{ success: boolean; message: string }>;
  connectCommand: (id: string) => Promise<{ command: string; message: string }>;
}

const getBridge = (): SshBridge | null => {
  const w = window as any;
  return (w.dex?.ssh ?? w.electron?.ssh ?? null) as SshBridge | null;
};

const META_KEY = 'dex.ssh.meta';      // Record<profileId, SshMeta>
const RECENT_KEY = 'dex.ssh.recent';  // RecentSession[]
const MAX_RECENT = 8;
const UNGROUPED = 'Ungrouped';

const toast = (type: 'success' | 'error' | 'info', message: string): void => {
  try { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } })); } catch { /* ignore */ }
};

const loadMeta = (): Record<string, SshMeta> => {
  try { return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; } catch { return {}; }
};
const saveMeta = (m: Record<string, SshMeta>): void => {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* ignore */ }
};
const loadRecent = (): RecentSession[] => {
  try { const r = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(r) ? r : []; } catch { return []; }
};
const saveRecent = (r: RecentSession[]): void => {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch { /* ignore */ }
};

// Build a ready-made ssh command locally (mirrors the backend connectCommand
// shape) so we can append a per-host startup snippet the backend doesn't know.
const buildCommand = (p: SshProfile, startup?: string): string => {
  const parts = ['ssh'];
  if (p.port && p.port !== 22) parts.push('-p', String(p.port));
  if (p.keyPath) parts.push('-i', p.keyPath);
  parts.push(`${p.user}@${p.host}`);
  const cmd = parts.join(' ');
  const snippet = startup?.trim();
  return snippet ? `${cmd} -t ${JSON.stringify(`${snippet}; exec $SHELL -l`)}` : cmd;
};

const copy = async (text: string, ok: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text);
    toast('success', ok);
  } catch {
    toast('error', 'Clipboard unavailable');
  }
};

// Parse an ~/.ssh/config-style block into draft profiles.
const parseSshConfig = (text: string): Array<Partial<SshProfile> & { name: string }> => {
  const out: Array<Partial<SshProfile> & { name: string }> = [];
  let cur: (Partial<SshProfile> & { name: string }) | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(\S+)\s+(.+)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'host') {
      // Skip wildcard-only host stanzas; take the first concrete alias.
      const alias = val.split(/\s+/).find(h => !/[*?]/.test(h));
      if (cur && cur.host) out.push(cur);
      cur = alias ? { name: alias, host: alias, user: '', port: 22 } : null;
    } else if (cur) {
      if (key === 'hostname') cur.host = val;
      else if (key === 'user') cur.user = val;
      else if (key === 'port') cur.port = parseInt(val, 10) || 22;
      else if (key === 'identityfile') cur.keyPath = val.replace(/^['"]|['"]$/g, '');
    }
  }
  if (cur && cur.host) out.push(cur);
  return out.filter(p => p.host);
};

const inputStyle: React.CSSProperties = {
  padding: '6px 9px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)',
  background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', outline: 'none', fontSize: 12, minWidth: 0,
};
const blank = { name: '', host: '', user: '', port: '22', keyPath: '', group: '', startupCommand: '' };

// glassButton carries no :disabled CSS; give disabled controls the standalone-app
// visual so they don't stay fully lit with a pointer cursor.
const disabledVisual = (off: boolean): React.CSSProperties =>
  off ? { opacity: 0.5, cursor: 'not-allowed' } : {};

export default function SshClient(): React.ReactElement {
  const bridge = useMemo(getBridge, []);
  const [tools, setTools] = useState<{ ssh: boolean; keygen: boolean } | null>(null);
  const [profiles, setProfiles] = useState<SshProfile[]>([]);
  const [keys, setKeys] = useState<SshKey[]>([]);
  const [meta, setMeta] = useState<Record<string, SshMeta>>(loadMeta);
  const [recent, setRecent] = useState<RecentSession[]>(loadRecent);
  const [form, setForm] = useState({ ...blank });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [keyName, setKeyName] = useState('dex_ed25519');
  const [keyType, setKeyType] = useState<'ed25519' | 'rsa'>('ed25519');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const noteTimer = useRef<number | null>(null);

  const flash = useCallback((m: string) => {
    setNote(m);
    if (noteTimer.current) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(''), 5000);
  }, []);

  const reload = useCallback(async () => {
    if (!bridge) return;
    try { setProfiles(await bridge.listProfiles()); } catch { /* ignore */ }
    try { setKeys(await bridge.listKeys()); } catch { /* ignore */ }
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    bridge.check().then(setTools).catch(() => setTools({ ssh: false, keygen: false }));
    void reload();
  }, [bridge, reload]);

  // Persist sidecar meta + recent sessions whenever they change.
  useEffect(() => { saveMeta(meta); }, [meta]);
  useEffect(() => { saveRecent(recent); }, [recent]);

  // Clear any pending flash timer on unmount so it can't setState after teardown.
  useEffect(() => () => { if (noteTimer.current) window.clearTimeout(noteTimer.current); }, []);

  const pushRecent = useCallback((p: SshProfile) => {
    setRecent(prev => {
      const entry: RecentSession = { id: p.id, name: p.name, target: `${p.user}@${p.host}:${p.port}`, at: Date.now() };
      return [entry, ...prev.filter(r => r.id !== p.id)].slice(0, MAX_RECENT);
    });
  }, []);

  const saveProfile = useCallback(async () => {
    if (!bridge) return;
    if (!form.host.trim() || !form.user.trim()) { flash('Host and user are required'); return; }
    setBusy(true);
    try {
      const r = await bridge.saveProfile({
        id: editingId ?? undefined,
        name: form.name.trim() || `${form.user}@${form.host}`,
        host: form.host.trim(), user: form.user.trim(),
        port: parseInt(form.port, 10) || 22,
        keyPath: form.keyPath.trim() || undefined,
      });
      // Persist the sidecar (group + startup) onto whatever id we ended up with.
      const id = r?.profile?.id ?? editingId;
      if (id) {
        setMeta(prev => {
          const next = { ...prev };
          const g = form.group.trim();
          const s = form.startupCommand.trim();
          if (g || s) next[id] = { group: g || undefined, startupCommand: s || undefined };
          else delete next[id];
          return next;
        });
      }
      if (r?.success) { flash('Profile saved'); toast('success', 'Profile saved'); }
      else { flash(r?.message || 'Save failed'); toast('error', r?.message || 'Save failed'); }
      setForm({ ...blank }); setEditingId(null);
      await reload();
    } finally { setBusy(false); }
  }, [bridge, form, editingId, flash, reload]);

  const edit = useCallback((p: SshProfile) => {
    setEditingId(p.id);
    const m = meta[p.id] || {};
    setForm({ name: p.name, host: p.host, user: p.user, port: String(p.port), keyPath: p.keyPath || '', group: m.group || '', startupCommand: m.startupCommand || '' });
  }, [meta]);

  const del = useCallback(async (id: string) => {
    if (!bridge) return;
    setBusy(true);
    try {
      await bridge.deleteProfile(id);
      setMeta(prev => { const next = { ...prev }; delete next[id]; return next; });
      setRecent(prev => prev.filter(r => r.id !== id));
      await reload();
      flash('Profile removed'); toast('info', 'Profile removed');
    } finally { setBusy(false); }
  }, [bridge, reload, flash]);

  // Copy connect command via the backend (records lastConnected) and log a recent.
  const connect = useCallback(async (p: SshProfile) => {
    if (!bridge) return;
    const startup = meta[p.id]?.startupCommand;
    try {
      const r = await bridge.connectCommand(p.id);
      // Prefer the backend command, but if we have a startup snippet append it locally.
      const command = startup ? buildCommand(p, startup) : (r?.command || buildCommand(p, startup));
      await copy(command, `Connect command copied: ${command}`);
      flash(`Connect command copied: ${command}`);
    } catch {
      const command = buildCommand(p, startup);
      await copy(command, `Connect command copied: ${command}`);
      flash(`Connect command copied: ${command}`);
    }
    pushRecent(p);
    await reload();
  }, [bridge, meta, pushRecent, reload, flash]);

  // Standalone "copy ssh command" (does not touch backend lastConnected).
  const copyCommand = useCallback((p: SshProfile) => {
    const command = buildCommand(p, meta[p.id]?.startupCommand);
    void copy(command, `Copied: ${command}`);
    flash(`Copied: ${command}`);
  }, [meta, flash]);

  const importHosts = useCallback(async () => {
    if (!bridge) return;
    const drafts = parseSshConfig(importText);
    if (drafts.length === 0) { flash('No Host entries found'); toast('error', 'No Host entries found'); return; }
    setBusy(true);
    let saved = 0;
    try {
      for (const d of drafts) {
        // ~/.ssh/config commonly omits User; fall back to the Host alias.
        const r = await bridge.saveProfile({
          name: d.name,
          host: d.host!,
          user: d.user || d.name,
          port: d.port || 22,
          keyPath: d.keyPath,
        });
        if (r?.success) saved += 1;
      }
      await reload();
      setImportText(''); setShowImport(false);
      flash(`Imported ${saved} host${saved === 1 ? '' : 's'}`);
      toast('success', `Imported ${saved} host${saved === 1 ? '' : 's'}`);
    } finally { setBusy(false); }
  }, [bridge, importText, reload, flash]);

  const genKey = useCallback(async () => {
    if (!bridge) return;
    setBusy(true);
    try {
      const r = await bridge.generateKey({ type: keyType, name: keyName.trim() });
      flash(r?.message || (r?.success ? 'Key generated' : 'Failed'));
      if (r?.success) toast('success', 'Key generated'); else toast('error', r?.message || 'Key generation failed');
      await reload();
    } finally { setBusy(false); }
  }, [bridge, keyType, keyName, flash, reload]);

  const toggleGroup = useCallback((g: string) => {
    setCollapsed(prev => ({ ...prev, [g]: !prev[g] }));
  }, []);

  // Filter + group profiles for display.
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = profiles.filter(p => {
      if (!q) return true;
      const g = (meta[p.id]?.group || '').toLowerCase();
      return p.name.toLowerCase().includes(q) || p.host.toLowerCase().includes(q)
        || p.user.toLowerCase().includes(q) || g.includes(q);
    });
    const map = new Map<string, SshProfile[]>();
    for (const p of filtered) {
      const g = meta[p.id]?.group?.trim() || UNGROUPED;
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(p);
    }
    // Stable, alphabetical groups with Ungrouped last.
    return [...map.entries()].sort((a, b) => {
      if (a[0] === UNGROUPED) return 1;
      if (b[0] === UNGROUPED) return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [profiles, meta, query]);

  const knownGroups = useMemo(() => {
    const s = new Set<string>();
    for (const id in meta) { const g = meta[id]?.group?.trim(); if (g) s.add(g); }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [meta]);

  if (!bridge) {
    return (
      <div className="p-6 h-full overflow-auto" style={glassPanel}>
        <EmptyState icon={<DexIcon name="terminal" size={48} />} title="SSH unavailable here"
          description="The SSH bridge needs the packaged DEX app with OpenSSH installed. It is not reachable in the web preview." />
      </div>
    );
  }

  const renderProfile = (p: SshProfile): React.ReactElement => {
    const m = meta[p.id];
    return (
      <li key={p.id} className="dex-liquid-glass" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="truncate" style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
          <div className="truncate text-xs" style={{ opacity: 0.7, fontFamily: 'var(--font-mono)' }}>
            {p.user}@{p.host}:{p.port}{p.keyPath ? ' · key' : ''}{m?.startupCommand ? ' · startup' : ''}
          </div>
        </div>
        <button style={{ ...glassButton, padding: '2px 10px', fontSize: 12, borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }} onClick={() => connect(p)}>Connect</button>
        <button style={{ ...glassButton, padding: '2px 8px', fontSize: 11 }} title="Copy ssh command" onClick={() => copyCommand(p)}>Copy cmd</button>
        <button style={{ ...glassButton, padding: '2px 8px', fontSize: 11 }} onClick={() => edit(p)}>Edit</button>
        <button style={{ ...glassButton, padding: '2px 8px', fontSize: 11, color: 'var(--color-error)', borderColor: 'var(--color-error)', ...disabledVisual(busy) }} disabled={busy} onClick={() => del(p.id)}>Delete</button>
      </li>
    );
  };

  return (
    <div className="p-6 h-full overflow-auto" style={{ ...glassPanel, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <DexIcon name="terminal" size={22} />
          <div>
            <h1 className="text-2xl font-semibold" style={{ margin: 0 }}>SSH</h1>
            <div className="text-xs opacity-70">
              {tools ? (tools.ssh ? 'OpenSSH detected' : 'ssh not found on PATH') : 'checking…'} · {profiles.length} profile{profiles.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>
        <button style={{ ...glassButton, padding: '6px 14px', fontSize: 12 }} onClick={() => setShowImport(s => !s)}>{showImport ? 'Close import' : 'Import config'}</button>
      </header>

      {note && <div role="status" aria-live="polite" className="text-sm break-words" style={{ color: 'var(--color-text-secondary)' }}>{note}</div>}

      {/* Import ~/.ssh/config block */}
      {showImport && (
        <section className="dex-liquid-glass-strong" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 'var(--radius-xl)' }}>
          <div className="text-xs opacity-70">Paste an ~/.ssh/config block. Host / HostName / User / Port / IdentityFile are parsed into profiles.</div>
          <textarea
            aria-label="SSH config to import"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={'Host myserver\n  HostName 192.0.2.10\n  User deploy\n  Port 2222\n  IdentityFile ~/.ssh/id_ed25519'}
            spellCheck={false}
            rows={6}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)', resize: 'vertical', whiteSpace: 'pre' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...glassButton, padding: '6px 16px', ...disabledVisual(busy || !importText.trim()) }} disabled={busy || !importText.trim()} onClick={importHosts}>Import hosts</button>
            <button style={glassButton} onClick={() => { setImportText(''); setShowImport(false); }}>Cancel</button>
          </div>
        </section>
      )}

      {/* Recent sessions */}
      {recent.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 6px' }}>
            <h2 className="text-sm font-semibold" style={{ margin: 0, opacity: 0.85 }}>Recent</h2>
            <button style={{ ...glassButton, padding: '1px 8px', fontSize: 11 }} onClick={() => setRecent([])}>Clear</button>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {recent.map(r => {
              const p = profiles.find(x => x.id === r.id);
              return (
                <li key={r.id}>
                  <button
                    style={{ ...glassButton, padding: '4px 10px', fontSize: 11, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0, ...disabledVisual(!p) }}
                    disabled={!p}
                    title={p ? `Copy connect command for ${r.target}` : 'Profile no longer exists'}
                    onClick={() => p && connect(p)}
                  >
                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                    <span style={{ opacity: 0.6, fontFamily: 'var(--font-mono)', fontSize: 10 }}>{r.target}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Profiles */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '0 0 6px', flexWrap: 'wrap' }}>
          <h2 className="text-sm font-semibold" style={{ margin: 0, opacity: 0.85 }}>Profiles</h2>
          <input
            aria-label="Search hosts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, host, user, group…"
            style={{ ...inputStyle, width: 240 }}
          />
        </div>
        {profiles.length === 0 ? (
          <div className="text-sm opacity-70" style={{ marginBottom: 8 }}>No saved profiles yet. Add one below.</div>
        ) : grouped.length === 0 ? (
          <div className="text-sm opacity-70" style={{ marginBottom: 8 }}>No hosts match “{query}”.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
            {grouped.map(([group, list]) => {
              const isCollapsed = !!collapsed[group];
              return (
                <div key={group}>
                  <button
                    onClick={() => toggleGroup(group)}
                    style={{ ...glassButton, width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', fontSize: 12, fontWeight: 600, justifyContent: 'flex-start' }}
                  >
                    <DexIcon name={isCollapsed ? 'chevron-right' : 'chevron-down'} size={14} />
                    <span>{group}</span>
                    <span style={{ opacity: 0.5, fontWeight: 400 }}>{list.length}</span>
                  </button>
                  {!isCollapsed && (
                    <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {list.map(renderProfile)}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Profile form */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'center' }}>
          <input aria-label="Profile name" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Name (optional)" style={inputStyle} />
          <input aria-label="Key path" value={form.keyPath} onChange={(e) => setForm(f => ({ ...f, keyPath: e.target.value }))} placeholder="Identity key path (optional)" style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} />
          <input aria-label="User" value={form.user} onChange={(e) => setForm(f => ({ ...f, user: e.target.value }))} placeholder="user" style={inputStyle} />
          <input aria-label="Host" value={form.host} onChange={(e) => setForm(f => ({ ...f, host: e.target.value }))} placeholder="host (example.com)" style={inputStyle} />
          <input aria-label="Port" value={form.port} onChange={(e) => setForm(f => ({ ...f, port: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="22" style={{ ...inputStyle, width: 100 }} />
          <input
            aria-label="Group"
            list="dex-ssh-groups"
            value={form.group}
            onChange={(e) => setForm(f => ({ ...f, group: e.target.value }))}
            placeholder="Group / folder (optional)"
            style={inputStyle}
          />
          <datalist id="dex-ssh-groups">
            {knownGroups.map(g => <option key={g} value={g} />)}
          </datalist>
          <input
            aria-label="Startup command"
            value={form.startupCommand}
            onChange={(e) => setForm(f => ({ ...f, startupCommand: e.target.value }))}
            placeholder="Startup command (optional, e.g. tmux attach)"
            style={{ ...inputStyle, gridColumn: '1 / -1', fontFamily: 'var(--font-mono)' }}
          />
          <div style={{ display: 'flex', gap: 8, gridColumn: '1 / -1' }}>
            <button style={{ ...glassButton, padding: '6px 16px', ...disabledVisual(busy || !form.host.trim() || !form.user.trim()) }} disabled={busy || !form.host.trim() || !form.user.trim()} onClick={saveProfile}>{editingId ? 'Update' : 'Add profile'}</button>
            {editingId && <button style={glassButton} onClick={() => { setForm({ ...blank }); setEditingId(null); }}>Cancel</button>}
          </div>
        </div>
      </section>

      {/* Keys */}
      <section>
        <h2 className="text-sm font-semibold" style={{ margin: '0 0 6px', opacity: 0.85 }}>Keys</h2>
        {keys.length === 0 ? (
          <div className="text-sm opacity-70" style={{ marginBottom: 8 }}>No public keys found in ~/.ssh or the DEX key store.</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: '0 0 10px', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {keys.map(k => (
              <li key={k.path} className="dex-liquid-glass" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 'var(--radius-lg)' }}>
                <span style={{ width: 70, flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'var(--color-accent)' }}>{k.type || '?'}</span>
                <span className="truncate" style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 11 }} title={k.path}>{k.fingerprint || k.path}</span>
                <span className="truncate text-xs" style={{ opacity: 0.6, maxWidth: 160 }} title={k.comment}>{k.comment}</span>
                <button style={{ ...glassButton, padding: '2px 8px', fontSize: 11 }} onClick={() => { void copy(k.path, 'Path copied'); }}>Copy path</button>
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select aria-label="Key type" value={keyType} onChange={(e) => setKeyType(e.target.value as 'ed25519' | 'rsa')} style={{ ...glassButton, padding: '4px 8px', fontSize: 12 }}>
            <option value="ed25519">ed25519</option>
            <option value="rsa">rsa (4096)</option>
          </select>
          <input aria-label="Key name" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="key name" style={{ ...inputStyle, width: 200, fontFamily: 'var(--font-mono)' }} />
          <button style={{ ...glassButton, ...disabledVisual(busy || !keyName.trim() || !(tools?.keygen)) }} disabled={busy || !keyName.trim() || !(tools?.keygen)} onClick={genKey}>Generate key</button>
        </div>
      </section>
    </div>
  );
}
