// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// The Vault's own screens. Before this, passwords saved from the generator
// could not be seen, copied, renamed or deleted, and 2FA entries (native TOTP
// was already there) had no screen at all. Secrets stay in the native Vault;
// copies are kept out of clipboard history and wiped after 30 seconds.
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useVaultStore, type VaultCredential, type AuthenticatorEntry } from '../../store/useVaultStore';

const hasNativeVault = (): boolean => !!(window as unknown as { dex?: { vault?: unknown } }).dex?.vault;

// ---------------------------------------------------------------------------
// Unlock / create
// ---------------------------------------------------------------------------

export const VaultGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isUnlocked = useVaultStore(s => s.isUnlocked);
  const vaultExists = useVaultStore(s => s.vaultExists);
  const [master, setMaster] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (hasNativeVault()) void useVaultStore.getState().initialize(); }, []);

  if (!hasNativeVault()) {
    return <div style={S.empty}>The Vault is stored by the installed DEX app. It is not available in this preview.</div>;
  }
  if (isUnlocked) return <>{children}</>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultExists) {
      if (master.length < 8) { setError('Use at least 8 characters.'); return; }
      if (master !== confirm) { setError('The passwords do not match.'); return; }
    }
    setBusy(true);
    const store = useVaultStore.getState();
    const ok = vaultExists ? await store.unlockVault(master) : await store.createVault(master);
    setBusy(false);
    setMaster(''); setConfirm('');
    if (!ok) setError(vaultExists ? 'Incorrect master password.' : 'Could not create the Vault.');
  };

  return (
    <form onSubmit={submit} style={{ ...S.card, maxWidth: 420 }} aria-label={vaultExists ? 'Unlock the Vault' : 'Create a Vault'}>
      <div style={S.cardTitle}>{vaultExists ? 'The Vault is locked' : 'No Vault yet'}</div>
      <div style={S.note}>
        {vaultExists ? 'Enter your master password.' : 'Choose a master password. It cannot be recovered if you forget it.'}
      </div>
      <input type="password" autoComplete="off" autoFocus placeholder="Master password" aria-label="Master password"
        value={master} onChange={e => { setMaster(e.target.value); setError(null); }} style={S.input} />
      {!vaultExists && (
        <input type="password" autoComplete="off" placeholder="Confirm master password" aria-label="Confirm master password"
          value={confirm} onChange={e => { setConfirm(e.target.value); setError(null); }} style={S.input} />
      )}
      {error && <div role="alert" style={S.error}>{error}</div>}
      <button type="submit" className="pwg-btn pwg-primary" style={{ ...S.btn, ...S.primary }} disabled={!master || busy}>
        {vaultExists ? 'Unlock' : 'Create Vault'}
      </button>
    </form>
  );
};

// ---------------------------------------------------------------------------
// Saved logins
// ---------------------------------------------------------------------------

function label(c: VaultCredential): string {
  return c.title || c.url || c.username || 'Untitled';
}

export const VaultList: React.FC<{ flash: (msg: string) => void }> = ({ flash }) => {
  const credentials = useVaultStore(s => s.credentials);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string; username: string; url: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = [...credentials].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    return q ? items.filter(c => [c.title, c.username, c.url, c.email, ...(c.tags ?? [])].some(v => v?.toLowerCase().includes(q))) : items;
  }, [credentials, query]);

  const copy = useCallback(async (text: string | undefined, what: string) => {
    if (!text) return;
    await useVaultStore.getState().copyToClipboard(text, true);
    flash(`${what} copied. The clipboard clears in 30 seconds.`);
  }, [flash]);

  const save = async () => {
    if (!editing) return;
    const ok = await useVaultStore.getState().updateCredential(editing.id, {
      title: editing.title.trim(), username: editing.username.trim() || undefined, url: editing.url.trim() || undefined, updatedAt: Date.now(),
    });
    if (ok) { await useVaultStore.getState().loadCredentials(); setEditing(null); flash('Saved.'); }
    else flash('Could not save the change.');
  };

  const remove = async (id: string) => {
    const ok = await useVaultStore.getState().deleteCredential(id);
    setConfirmDelete(null);
    flash(ok ? 'Deleted from the Vault.' : 'Could not delete it.');
  };

  return (
    <section style={S.card} aria-label="Saved passwords">
      <div style={S.toolbar}>
        <input type="search" placeholder="Search the Vault" aria-label="Search the Vault" value={query}
          onChange={e => setQuery(e.target.value)} style={{ ...S.input, flex: 1 }} />
        <button className="pwg-btn" style={S.btnSmall} onClick={() => void useVaultStore.getState().lockVault()}>Lock</button>
      </div>
      {list.length === 0 && (
        <div style={S.empty}>{credentials.length ? 'Nothing matches.' : 'No saved passwords. Use Save to Vault in Generate.'}</div>
      )}
      {list.map(c => (
        <div key={c.id} style={S.row}>
          {editing?.id === c.id ? (
            <div style={S.editGrid}>
              <input aria-label="Name" placeholder="Name" value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} style={S.input} autoFocus />
              <input aria-label="Username" placeholder="Username or email" value={editing.username} onChange={e => setEditing({ ...editing, username: e.target.value })} style={S.input} />
              <input aria-label="Website" placeholder="Website" value={editing.url} onChange={e => setEditing({ ...editing, url: e.target.value })} style={S.input} />
              <div style={S.toolbar}>
                <button className="pwg-btn pwg-primary" style={{ ...S.btnSmall, ...S.primary }} onClick={() => void save()} disabled={!editing.title.trim()}>Save</button>
                <button className="pwg-btn" style={S.btnSmall} onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div style={S.rowMain}>
                <div style={S.rowTitle}>{label(c)}</div>
                <div style={S.rowSub}>{[c.username || c.email, c.url].filter(Boolean).join(' · ') || 'No username'}</div>
                <div style={S.secret} aria-label="Password">{shown === c.id ? c.password : '•'.repeat(Math.min(16, c.password?.length ?? 8))}</div>
              </div>
              {confirmDelete === c.id ? (
                <div style={S.actions}>
                  <span style={S.rowSub}>Delete?</span>
                  <button className="pwg-btn" style={{ ...S.link, color: 'var(--color-error)' }} onClick={() => void remove(c.id)}>Delete</button>
                  <button className="pwg-btn" style={S.link} onClick={() => setConfirmDelete(null)}>Keep</button>
                </div>
              ) : (
                <div style={S.actions}>
                  <button className="pwg-btn" style={S.link} onClick={() => void copy(c.password, 'Password')} aria-label={`Copy password for ${label(c)}`}>Copy</button>
                  {(c.username || c.email) && <button className="pwg-btn" style={S.link} onClick={() => void copy(c.username || c.email, 'Username')} aria-label={`Copy username for ${label(c)}`}>User</button>}
                  <button className="pwg-btn" style={S.link} onClick={() => setShown(shown === c.id ? null : c.id)} aria-label={shown === c.id ? 'Hide password' : 'Show password'}>{shown === c.id ? 'Hide' : 'Show'}</button>
                  <button className="pwg-btn" style={S.link} onClick={() => setEditing({ id: c.id, title: c.title ?? '', username: c.username ?? '', url: c.url ?? '' })}>Edit</button>
                  <button className="pwg-btn" style={S.link} onClick={() => setConfirmDelete(c.id)} aria-label={`Delete ${label(c)}`}>Delete</button>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </section>
  );
};

// ---------------------------------------------------------------------------
// 2FA codes
// ---------------------------------------------------------------------------

/** "Issuer:account" or "account" from an otpauth label. */
export function splitOtpLabel(lbl: string | undefined, issuer?: string): { service: string; account: string } {
  const raw = decodeURIComponent(lbl ?? '');
  const i = raw.indexOf(':');
  const service = (issuer || (i >= 0 ? raw.slice(0, i) : '') || raw).trim();
  const account = (i >= 0 ? raw.slice(i + 1) : (issuer ? raw : '')).trim();
  return { service: service || 'Account', account };
}

/** Base32 secret as typed: spaces removed, upper case; null if not base32. */
export function cleanSecret(s: string): string | null {
  const v = s.replace(/[\s-]/g, '').toUpperCase().replace(/=+$/, '');
  return /^[A-Z2-7]{16,}$/.test(v) ? v : null;
}

export const AuthenticatorList: React.FC<{ flash: (msg: string) => void }> = ({ flash }) => {
  const authenticators = useVaultStore(s => s.authenticators);
  const [codes, setCodes] = useState<Record<string, { code: string; remainingSeconds: number }>>({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ uri: '', service: '', account: '', secret: '' });
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // One refresh per second while visible; native computes each code.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const store = useVaultStore.getState();
      const next: Record<string, { code: string; remainingSeconds: number }> = {};
      for (const a of store.authenticators) {
        const r = await store.generateTOTP(a.id);
        if (r) next[a.id] = r;
      }
      if (!cancelled) setCodes(next);
    };
    void tick();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void tick(); }, 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, [authenticators]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const store = useVaultStore.getState();
    let entry: Partial<AuthenticatorEntry> | null = null;
    if (form.uri.trim()) {
      const parsed = await store.parseOTPUri(form.uri.trim()) as { label?: string; secret?: string; issuer?: string; digits?: number; period?: number } | null;
      if (!parsed?.secret) { setError('That is not an otpauth:// link.'); return; }
      const { service, account } = splitOtpLabel(parsed.label, parsed.issuer);
      entry = { service, account, issuer: parsed.issuer, secret: parsed.secret, digits: parsed.digits === 8 ? 8 : 6, period: parsed.period || 30 };
    } else {
      const secret = cleanSecret(form.secret);
      if (!form.service.trim()) { setError('Name the account.'); return; }
      if (!secret) { setError('The setup key should be letters A-Z and digits 2-7.'); return; }
      entry = { service: form.service.trim(), account: form.account.trim(), secret, digits: 6, period: 30 };
    }
    const id = await store.addAuthenticator({ ...entry, algorithm: 'SHA1', category: 'personal', createdAt: Date.now() });
    if (!id) { setError('Could not save it.'); return; }
    setForm({ uri: '', service: '', account: '', secret: '' });
    setAdding(false); setError(null);
    flash('Added.');
  };

  const copy = async (code: string) => {
    await useVaultStore.getState().copyToClipboard(code, true);
    flash('Code copied. The clipboard clears in 30 seconds.');
  };

  return (
    <section style={S.card} aria-label="2FA codes">
      <div style={S.toolbar}>
        <div style={{ ...S.cardTitle, flex: 1 }}>Two-factor codes</div>
        <button className="pwg-btn" style={S.btnSmall} onClick={() => { setAdding(v => !v); setError(null); }}>{adding ? 'Cancel' : 'Add'}</button>
        <button className="pwg-btn" style={S.btnSmall} onClick={() => void useVaultStore.getState().lockVault()}>Lock</button>
      </div>
      {adding && (
        <form onSubmit={add} style={S.editGrid} aria-label="Add a 2FA account">
          <div style={S.note}>Paste the setup link (otpauth://), or type the setup key the site shows.</div>
          <input aria-label="Setup link" placeholder="otpauth://totp/…" value={form.uri} onChange={e => setForm({ ...form, uri: e.target.value })} style={S.input} autoFocus />
          {!form.uri.trim() && (
            <>
              <input aria-label="Service" placeholder="Service (e.g. GitHub)" value={form.service} onChange={e => setForm({ ...form, service: e.target.value })} style={S.input} />
              <input aria-label="Account" placeholder="Account (optional)" value={form.account} onChange={e => setForm({ ...form, account: e.target.value })} style={S.input} />
              <input aria-label="Setup key" placeholder="Setup key" autoComplete="off" value={form.secret} onChange={e => setForm({ ...form, secret: e.target.value })} style={{ ...S.input, fontFamily: 'var(--font-mono)' }} />
            </>
          )}
          {error && <div role="alert" style={S.error}>{error}</div>}
          <button type="submit" className="pwg-btn pwg-primary" style={{ ...S.btnSmall, ...S.primary }}>Add account</button>
        </form>
      )}
      {authenticators.length === 0 && !adding && <div style={S.empty}>No 2FA accounts. Add one with the setup link or key a site gives you.</div>}
      {authenticators.map(a => {
        const c = codes[a.id];
        const period = a.period || 30;
        return (
          <div key={a.id} style={S.row}>
            <div style={S.rowMain}>
              <div style={S.rowTitle}>{a.service}</div>
              {a.account && <div style={S.rowSub}>{a.account}</div>}
            </div>
            <button className="pwg-btn" style={S.code} onClick={() => c && void copy(c.code)} disabled={!c} aria-label={`Copy code for ${a.service}`}>
              {c ? `${c.code.slice(0, Math.ceil(c.code.length / 2))} ${c.code.slice(Math.ceil(c.code.length / 2))}` : '--- ---'}
            </button>
            <div style={S.timer} role="timer" aria-label={c ? `${c.remainingSeconds} seconds left` : 'No code'}>
              <div style={{ ...S.timerFill, width: `${c ? (c.remainingSeconds / period) * 100 : 0}%`, background: c && c.remainingSeconds <= 5 ? 'var(--color-warning)' : 'var(--color-text-tertiary)' }} />
            </div>
            {confirmDelete === a.id ? (
              <div style={S.actions}>
                <button className="pwg-btn" style={{ ...S.link, color: 'var(--color-error)' }} onClick={() => { void useVaultStore.getState().deleteAuthenticator(a.id); setConfirmDelete(null); }}>Delete</button>
                <button className="pwg-btn" style={S.link} onClick={() => setConfirmDelete(null)}>Keep</button>
              </div>
            ) : (
              <button className="pwg-btn" style={S.link} onClick={() => setConfirmDelete(a.id)} aria-label={`Delete ${a.service}`}>Delete</button>
            )}
          </div>
        );
      })}
    </section>
  );
};

const S: Record<string, React.CSSProperties> = {
  card: { display: 'flex', flexDirection: 'column', gap: 10, padding: 'var(--space-4)', borderRadius: 10, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-subtle)' },
  cardTitle: { fontSize: 13, fontWeight: 600 },
  note: { fontSize: 12, color: 'var(--color-text-secondary)' },
  error: { fontSize: 12, color: 'var(--color-error)' },
  empty: { padding: 'var(--space-4) 0', fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center' },
  toolbar: { display: 'flex', alignItems: 'center', gap: 8 },
  input: { minHeight: 32, padding: '0 10px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' },
  btn: { minHeight: 32, padding: '0 12px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  btnSmall: { minHeight: 28, padding: '0 10px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  primary: { background: 'var(--color-accent-fill)', color: 'var(--color-accent-text)', border: '1px solid transparent' },
  row: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, paddingTop: 8, borderTop: '1px solid var(--color-border-subtle)' },
  rowMain: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  rowTitle: { fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowSub: { fontSize: 11, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  secret: { fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  actions: { display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 },
  link: { minHeight: 28, padding: '0 8px', border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--color-accent)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  editGrid: { flex: 1, display: 'flex', flexDirection: 'column', gap: 8 },
  code: { minHeight: 32, padding: '0 10px', border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, letterSpacing: 1, fontVariantNumeric: 'tabular-nums', cursor: 'pointer' },
  timer: { width: 36, height: 3, borderRadius: 2, background: 'var(--color-bg-hover)', overflow: 'hidden', flexShrink: 0 },
  timerFill: { height: '100%', transition: 'width 1s linear' },
};
