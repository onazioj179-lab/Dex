// =============================================================================
// DEX Platform - SSH (Tier 5 / 42)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
//
// Manage SSH connection profiles and keys without leaving DEX. Create/edit/
// delete profiles, generate or list keys (ssh-keygen), and copy a ready connect
// command. Backed by window.dex.ssh (main/controllers/SshController.ts).
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

const inputStyle: React.CSSProperties = {
  padding: '6px 9px', borderRadius: 6, border: '1px solid var(--color-border)',
  background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', outline: 'none', fontSize: 12, minWidth: 0,
};
const blank = { name: '', host: '', user: '', port: '22', keyPath: '' };

// glassButton carries no :disabled CSS; give disabled controls the standalone-app
// visual so they don't stay fully lit with a pointer cursor.
const disabledVisual = (off: boolean): React.CSSProperties =>
  off ? { opacity: 0.5, cursor: 'not-allowed' } : {};

export default function SshClient(): React.ReactElement {
  const bridge = useMemo(getBridge, []);
  const [tools, setTools] = useState<{ ssh: boolean; keygen: boolean } | null>(null);
  const [profiles, setProfiles] = useState<SshProfile[]>([]);
  const [keys, setKeys] = useState<SshKey[]>([]);
  const [form, setForm] = useState({ ...blank });
  const [editingId, setEditingId] = useState<string | null>(null);
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
      flash(r?.success ? 'Profile saved' : (r?.message || 'Save failed'));
      setForm({ ...blank }); setEditingId(null);
      await reload();
    } finally { setBusy(false); }
  }, [bridge, form, editingId, flash, reload]);

  const edit = useCallback((p: SshProfile) => {
    setEditingId(p.id);
    setForm({ name: p.name, host: p.host, user: p.user, port: String(p.port), keyPath: p.keyPath || '' });
  }, []);

  const del = useCallback(async (id: string) => {
    if (!bridge) return;
    setBusy(true);
    try { await bridge.deleteProfile(id); await reload(); flash('Profile removed'); }
    finally { setBusy(false); }
  }, [bridge, reload, flash]);

  const connect = useCallback(async (id: string) => {
    if (!bridge) return;
    const r = await bridge.connectCommand(id);
    if (r?.command) {
      navigator.clipboard?.writeText(r.command).then(() => flash(`Connect command copied: ${r.command}`), () => flash(r.command));
      await reload();
    } else flash(r?.message || 'No command');
  }, [bridge, reload, flash]);

  const genKey = useCallback(async () => {
    if (!bridge) return;
    setBusy(true);
    try {
      const r = await bridge.generateKey({ type: keyType, name: keyName.trim() });
      flash(r?.message || (r?.success ? 'Key generated' : 'Failed'));
      await reload();
    } finally { setBusy(false); }
  }, [bridge, keyType, keyName, flash, reload]);

  if (!bridge) {
    return (
      <div className="p-6 h-full overflow-auto" style={glassPanel}>
        <EmptyState icon={<DexIcon name="terminal" size={48} />} title="SSH unavailable here"
          description="The SSH bridge needs the packaged DEX app with OpenSSH installed. It is not reachable in the web preview." />
      </div>
    );
  }

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
      </header>

      {note && <div role="status" aria-live="polite" className="text-sm break-words" style={{ color: 'var(--color-text-secondary)' }}>{note}</div>}

      {/* Profiles */}
      <section>
        <h2 className="text-sm font-semibold" style={{ margin: '0 0 6px', opacity: 0.85 }}>Profiles</h2>
        {profiles.length === 0 ? (
          <div className="text-sm opacity-70" style={{ marginBottom: 8 }}>No saved profiles yet. Add one below.</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: '0 0 10px', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {profiles.map(p => (
              <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="truncate" style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div className="truncate text-xs" style={{ opacity: 0.7, fontFamily: 'var(--font-mono)' }}>{p.user}@{p.host}:{p.port}{p.keyPath ? ' · key' : ''}</div>
                </div>
                <button style={{ ...glassButton, padding: '2px 10px', fontSize: 12, borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }} onClick={() => connect(p.id)}>Connect</button>
                <button style={{ ...glassButton, padding: '2px 8px', fontSize: 11 }} onClick={() => edit(p)}>Edit</button>
                <button style={{ ...glassButton, padding: '2px 8px', fontSize: 11, color: 'var(--color-error)', borderColor: 'var(--color-error)', ...disabledVisual(busy) }} disabled={busy} onClick={() => del(p.id)}>Delete</button>
              </li>
            ))}
          </ul>
        )}

        {/* Profile form */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'center' }}>
          <input aria-label="Profile name" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Name (optional)" style={inputStyle} />
          <input aria-label="Key path" value={form.keyPath} onChange={(e) => setForm(f => ({ ...f, keyPath: e.target.value }))} placeholder="Identity key path (optional)" style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} />
          <input aria-label="User" value={form.user} onChange={(e) => setForm(f => ({ ...f, user: e.target.value }))} placeholder="user" style={inputStyle} />
          <input aria-label="Host" value={form.host} onChange={(e) => setForm(f => ({ ...f, host: e.target.value }))} placeholder="host (example.com)" style={inputStyle} />
          <input aria-label="Port" value={form.port} onChange={(e) => setForm(f => ({ ...f, port: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="22" style={{ ...inputStyle, width: 100 }} />
          <div style={{ display: 'flex', gap: 8 }}>
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
              <li key={k.path} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' }}>
                <span style={{ width: 70, flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'var(--color-accent)' }}>{k.type || '?'}</span>
                <span className="truncate" style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 11 }} title={k.path}>{k.fingerprint || k.path}</span>
                <span className="truncate text-xs" style={{ opacity: 0.6, maxWidth: 160 }} title={k.comment}>{k.comment}</span>
                <button style={{ ...glassButton, padding: '2px 8px', fontSize: 11 }} onClick={() => { navigator.clipboard?.writeText(k.path).then(() => flash('Path copied'), () => {}); }}>Copy path</button>
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
