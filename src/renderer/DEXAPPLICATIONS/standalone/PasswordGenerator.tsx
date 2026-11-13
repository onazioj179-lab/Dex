/**
 * DEX Platform - Password Generator+
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 *
 * Random passwords and passphrases from the platform CSPRNG (see passwordGen.ts).
 * Generated values are never logged, never sent anywhere, and never written to
 * disk by this app: recent values live in memory for this session only, and
 * "Save to Vault" hands one to the encrypted Vault.
 */
import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useAppTracking } from '../../services/usePatternLearning';
import { keyEventForApp, isTypingTarget } from '../../shell/input/appKeyScope';
import { useVaultStore } from '../../store/useVaultStore';
import {
  generatePassword, generatePassphrase, strengthFor,
  MIN_LENGTH, MIN_WORDS, MAX_WORDS,
  type PasswordOptions, type PassphraseOptions, type Generated,
} from './passwordGen';

// Shannon entropy in bits = length * log2(poolSize), with the pool inferred from
// the character classes present. Used for strings this app did not generate
// (the generator reports its own exact search space). Pure + unit-tested.
export function passwordEntropyBits(pwd: string): number {
  if (!pwd) return 0;
  let pool = 0;
  if (/[a-z]/.test(pwd)) pool += 26;
  if (/[A-Z]/.test(pwd)) pool += 26;
  if (/[0-9]/.test(pwd)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pwd)) pool += 32; // common symbol set
  return pool > 0 ? pwd.length * Math.log2(pool) : 0;
}

type Mode = 'password' | 'passphrase';

interface RecentEntry {
  id: number;
  value: string;
  strength: string;
  at: number;
}

const APP_ID = 'passwordgenerator';
const LEGACY_KEY = 'dex-pwd-history'; // pre-7.0.1 plaintext history
const PREFS_KEY = 'dex-pwgen-prefs'; // options only, never a generated value
const CLEAR_AFTER_MS = 30_000;
const MAX_SLIDER = 64;

interface Prefs { mode: Mode; password: PasswordOptions; passphrase: PassphraseOptions }

const DEFAULT_PREFS: Prefs = {
  mode: 'password',
  password: { length: 20, upper: true, lower: true, digits: true, symbols: true, excludeAmbiguous: false },
  passphrase: { words: 6, separator: '-', capitalize: false, includeNumber: false },
};

function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null') as Partial<Prefs> | null;
    if (!raw) return DEFAULT_PREFS;
    return {
      mode: raw.mode === 'passphrase' ? 'passphrase' : 'password',
      password: { ...DEFAULT_PREFS.password, ...raw.password },
      passphrase: { ...DEFAULT_PREFS.passphrase, ...raw.passphrase },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function loadLegacy(): Array<{ password?: string }> {
  try {
    const raw = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(e => e && typeof e.password === 'string' && e.password) : [];
  } catch {
    return [];
  }
}

type NativeClipboard = { writeText?: (t: string) => Promise<unknown>; readText?: () => Promise<unknown> };
function nativeClipboard(): NativeClipboard | undefined {
  return (window as unknown as { dex?: { clipboard?: NativeClipboard } }).dex?.clipboard;
}

async function writeClipboard(text: string): Promise<void> {
  const native = nativeClipboard();
  if (native?.writeText) {
    const res = (await native.writeText(text)) as { success?: boolean; error?: string } | undefined;
    if (res && res.success === false) throw new Error(res.error || 'Clipboard unavailable');
    return;
  }
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
  await navigator.clipboard.writeText(text);
}

/** Clear the clipboard only if it still holds what we put there. */
async function clearIfStill(text: string): Promise<void> {
  const native = nativeClipboard();
  if (native?.readText) {
    const current = await native.readText().catch(() => null);
    if (current === text) await native.writeText?.('');
    return;
  }
  // Web fallback: reading would prompt for permission, so clear unconditionally.
  await navigator.clipboard?.writeText('').catch(() => undefined);
}

function mask(v: string): string {
  return v.length <= 4 ? '•'.repeat(v.length) : `${v.slice(0, 2)}${'•'.repeat(Math.min(12, v.length - 4))}${v.slice(-2)}`;
}

const TIER_COLOR = ['var(--color-error)', 'var(--color-warning)', 'var(--color-accent)', 'var(--color-accent)'];

const PasswordGenerator: React.FC = () => {
  useAppTracking('password');

  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [result, setResult] = useState<Generated | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [legacy, setLegacy] = useState(loadLegacy);
  const vaultExists = useVaultStore(s => s.vaultExists);
  const addCredential = useVaultStore(s => s.addCredential);
  const [vaultForm, setVaultForm] = useState<{ pending: string[]; master: string; confirm: string; error: string | null } | null>(null);
  const hasNativeVault = !!(window as unknown as { dex?: { vault?: unknown } }).dex?.vault;
  const clearTimer = useRef<ReturnType<typeof setTimeout>>();
  const statusTimer = useRef<ReturnType<typeof setTimeout>>();
  const nextId = useRef(1);

  useEffect(() => () => {
    clearTimeout(clearTimer.current);
    clearTimeout(statusTimer.current);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
  }, [prefs]);

  // Learn whether a Vault exists / is unlocked (native app only).
  useEffect(() => {
    if (hasNativeVault) void useVaultStore.getState().initialize();
  }, [hasNativeVault]);

  const flash = useCallback((msg: string) => {
    setStatus(msg);
    clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(null), 2500);
  }, []);

  const generate = useCallback(() => {
    try {
      const next = prefs.mode === 'password' ? generatePassword(prefs.password) : generatePassphrase(prefs.passphrase);
      setResult(next);
      setError(null);
      window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'passwordsGenerated', amount: 1 } }));
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [prefs]);

  // Regenerate whenever an option changes.
  useEffect(() => { generate(); }, [generate]);

  const value = result?.value ?? '';
  const strength = strengthFor(result?.entropyBits ?? 0);

  const copy = useCallback(async (text = value) => {
    if (!text) return;
    try {
      await writeClipboard(text);
    } catch {
      flash('Could not copy to the clipboard.');
      return;
    }
    flash('Copied. The clipboard clears in 30 seconds.');
    clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => { void clearIfStill(text); }, CLEAR_AFTER_MS);
    setRecent(prev => (prev.some(r => r.value === text) ? prev : [
      { id: nextId.current++, value: text, strength: strengthFor(result?.entropyBits ?? passwordEntropyBits(text)).label, at: Date.now() },
      ...prev,
    ].slice(0, 10)));
  }, [value, result, flash]);

  const storeInVault = useCallback(async (text: string) => {
    const id = await addCredential({
      type: 'custom',
      title: `Generated ${new Date().toLocaleString()}`,
      password: text,
      category: 'personal',
      tags: ['generated'],
      favorite: false,
    });
    return !!id;
  }, [addCredential]);

  const legacyValues = useRef<string[]>([]);
  legacyValues.current = legacy.map(e => e.password ?? '');

  /** Save values to the Vault, or ask for the master password first. */
  const saveAll = useCallback(async (values: string[]) => {
    const list = values.filter(Boolean);
    if (list.length === 0) return;
    if (!useVaultStore.getState().isUnlocked) {
      setVaultForm({ pending: list, master: '', confirm: '', error: null });
      return;
    }
    let saved = 0;
    for (const v of list) if (await storeInVault(v)) saved++;
    if (list === legacyValues.current && saved === list.length) {
      try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
      setLegacy([]);
    }
    flash(saved === list.length ? (list.length === 1 ? 'Saved to the Vault.' : `Moved ${saved} passwords to the Vault.`) : `Saved ${saved} of ${list.length}. The rest could not be saved.`);
  }, [storeInVault, flash]);

  const submitVaultForm = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultForm) return;
    const store = useVaultStore.getState();
    if (!store.vaultExists) {
      if (vaultForm.master.length < 8) { setVaultForm({ ...vaultForm, error: 'Use at least 8 characters.' }); return; }
      if (vaultForm.master !== vaultForm.confirm) { setVaultForm({ ...vaultForm, error: 'The passwords do not match.' }); return; }
    }
    const ok = store.vaultExists ? await store.unlockVault(vaultForm.master) : await store.createVault(vaultForm.master);
    if (!ok) {
      // Unlock fails only on a wrong password; show that plainly rather than the
      // native error text ("decryption failed ...").
      const error = store.vaultExists ? 'Incorrect master password.' : 'Could not create the Vault.';
      setVaultForm({ ...vaultForm, master: '', confirm: '', error });
      return;
    }
    const pending = vaultForm.pending;
    setVaultForm(null);
    await saveAll(pending);
  }, [vaultForm, saveAll]);

  const deleteLegacy = useCallback(() => {
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
    setLegacy([]);
  }, []);

  // Keyboard: Enter or R regenerates, Ctrl+C (with nothing selected) copies.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!keyEventForApp(e, APP_ID)) return; // key meant for another app
      if (isTypingTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod && !e.altKey && (e.key === 'Enter' || e.key.toLowerCase() === 'r')) {
        if ((e.target as HTMLElement)?.tagName === 'BUTTON' && e.key === 'Enter') return; // let the button act
        e.preventDefault();
        generate();
      } else if (mod && e.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) {
        e.preventDefault();
        void copy();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [generate, copy]);

  const setPw = (patch: Partial<PasswordOptions>) => setPrefs(p => ({ ...p, password: { ...p.password, ...patch } }));
  const setPp = (patch: Partial<PassphraseOptions>) => setPrefs(p => ({ ...p, passphrase: { ...p.passphrase, ...patch } }));

  const pw = prefs.password;
  const pp = prefs.passphrase;

  return (
    <div style={S.container} role="region" aria-label="Password Generator">
      <style>{`
        .pwg-btn:hover:not(:disabled) { background: var(--color-bg-hover); }
        .pwg-primary:hover:not(:disabled) { filter: brightness(1.08); }
        .pwg-range { width: 100%; accent-color: var(--color-accent); }
      `}</style>

      <div style={S.header}>
        <h1 style={S.title}>Password Generator</h1>
        <div role="tablist" aria-label="Type" style={S.segmented}>
          {(['password', 'passphrase'] as Mode[]).map(m => (
            <button
              key={m}
              role="tab"
              aria-selected={prefs.mode === m}
              className="pwg-seg"
              style={{ ...S.seg, ...(prefs.mode === m ? S.segOn : {}) }}
              onClick={() => setPrefs(p => ({ ...p, mode: m }))}
            >
              {m === 'password' ? 'Password' : 'Passphrase'}
            </button>
          ))}
        </div>
      </div>

      <div style={S.main}>
        <section style={S.card}>
          <output aria-live="polite" aria-label="Generated value" style={S.value}>
            {error ? <span style={{ color: 'var(--color-error)', fontFamily: 'var(--dex-font-ui)' }}>{error}</span> : value}
          </output>

          <div style={S.strengthRow} role="meter" aria-label="Strength" aria-valuemin={0} aria-valuemax={4} aria-valuenow={error ? 0 : strength.tier} aria-valuetext={error ? 'None' : strength.label}>
            <div style={S.segments}>
              {[1, 2, 3, 4].map(t => (
                <div key={t} style={{ ...S.segment, background: !error && t <= strength.tier ? TIER_COLOR[strength.tier - 1] : 'var(--color-bg-hover)' }} />
              ))}
            </div>
            <span style={S.strengthLabel}>{error ? '' : strength.label}</span>
            <span style={S.bits} title="Size of the space this was chosen from">
              {error ? '' : `${Math.round(result?.entropyBits ?? 0)} bits`}
            </span>
          </div>

          <div style={S.actions}>
            <button className="pwg-btn pwg-primary" style={{ ...S.btn, ...S.primary }} onClick={generate} title="Enter or R">Generate</button>
            <button className="pwg-btn" style={S.btn} onClick={() => void copy()} disabled={!value} title="Ctrl+C">Copy</button>
            <button
              className="pwg-btn"
              style={S.btn}
              onClick={() => void saveAll([value])}
              disabled={!value || !hasNativeVault}
              title={hasNativeVault ? 'Save to the encrypted Vault' : 'Available in the installed app'}
            >
              Save to Vault
            </button>
          </div>
          {vaultForm && (
            <form onSubmit={submitVaultForm} style={S.vaultForm} aria-label={vaultExists ? 'Unlock the Vault' : 'Create a Vault'}>
              <div style={S.note}>
                {vaultExists ? 'Enter your Vault master password.' : 'Create a Vault. Choose a master password; it cannot be recovered if you forget it.'}
              </div>
              <input
                type="password"
                autoComplete="off"
                autoFocus
                placeholder="Master password"
                aria-label="Master password"
                value={vaultForm.master}
                onChange={e => setVaultForm({ ...vaultForm, master: e.target.value, error: null })}
                style={S.input}
              />
              {!vaultExists && (
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="Confirm master password"
                  aria-label="Confirm master password"
                  value={vaultForm.confirm}
                  onChange={e => setVaultForm({ ...vaultForm, confirm: e.target.value, error: null })}
                  style={S.input}
                />
              )}
              {vaultForm.error && <div role="alert" style={{ fontSize: 12, color: 'var(--color-error)' }}>{vaultForm.error}</div>}
              <div style={S.actions}>
                <button type="submit" className="pwg-btn pwg-primary" style={{ ...S.btn, ...S.primary }} disabled={!vaultForm.master}>
                  {vaultExists ? 'Unlock and Save' : 'Create and Save'}
                </button>
                <button type="button" className="pwg-btn" style={S.btn} onClick={() => setVaultForm(null)}>Cancel</button>
              </div>
            </form>
          )}
          <div style={S.status} aria-live="polite">{status ?? ''}</div>
        </section>

        {prefs.mode === 'password' ? (
          <section style={S.card} aria-label="Password options">
            <label style={S.rowLabel}>
              <span>Length</span>
              <input
                type="number"
                min={MIN_LENGTH}
                max={128}
                value={pw.length}
                onChange={e => setPw({ length: Math.max(MIN_LENGTH, Math.min(128, Number(e.target.value) || MIN_LENGTH)) })}
                style={S.number}
                aria-label="Length"
              />
            </label>
            <input className="pwg-range" type="range" min={MIN_LENGTH} max={MAX_SLIDER} value={Math.min(pw.length, MAX_SLIDER)} onChange={e => setPw({ length: Number(e.target.value) })} aria-label="Length slider" />
            <div style={S.checks}>
              <Check label="Uppercase (A-Z)" checked={pw.upper} onChange={v => setPw({ upper: v })} />
              <Check label="Lowercase (a-z)" checked={pw.lower} onChange={v => setPw({ lower: v })} />
              <Check label="Numbers (0-9)" checked={pw.digits} onChange={v => setPw({ digits: v })} />
              <Check label="Symbols (!@#$)" checked={pw.symbols} onChange={v => setPw({ symbols: v })} />
              <Check label="Avoid look-alikes (0 O o 1 l I)" checked={pw.excludeAmbiguous} onChange={v => setPw({ excludeAmbiguous: v })} />
            </div>
          </section>
        ) : (
          <section style={S.card} aria-label="Passphrase options">
            <label style={S.rowLabel}>
              <span>Words</span>
              <span style={S.count}>{pp.words}</span>
            </label>
            <input className="pwg-range" type="range" min={MIN_WORDS} max={MAX_WORDS} value={pp.words} onChange={e => setPp({ words: Number(e.target.value) })} aria-label="Number of words" />
            <label style={S.rowLabel}>
              <span>Separator</span>
              <select value={pp.separator} onChange={e => setPp({ separator: e.target.value })} style={S.select} aria-label="Separator">
                <option value="-">Hyphen (-)</option>
                <option value=" ">Space</option>
                <option value=".">Period (.)</option>
                <option value="_">Underscore (_)</option>
                <option value="">None</option>
              </select>
            </label>
            <div style={S.checks}>
              <Check label="Capitalize words" checked={pp.capitalize} onChange={v => setPp({ capitalize: v })} />
              <Check label="Include a number" checked={pp.includeNumber} onChange={v => setPp({ includeNumber: v })} />
            </div>
          </section>
        )}

        {legacy.length > 0 && (
          <section style={{ ...S.card, borderColor: 'var(--color-warning)' }} aria-label="Passwords saved by an earlier version">
            <div style={S.note}>
              {legacy.length} {legacy.length === 1 ? 'password' : 'passwords'} saved by an earlier version {legacy.length === 1 ? 'is' : 'are'} stored unencrypted on this computer.
            </div>
            <div style={S.actions}>
              <button className="pwg-btn" style={S.btn} onClick={() => void saveAll(legacyValues.current)} disabled={!hasNativeVault}>Move to Vault</button>
              <button className="pwg-btn" style={{ ...S.btn, color: 'var(--color-error)' }} onClick={deleteLegacy}>Delete</button>
            </div>
          </section>
        )}

        {recent.length > 0 && (
          <section style={S.card} aria-label="Copied this session">
            <div style={S.rowLabel}>
              <span>Copied this session</span>
              <button className="pwg-btn" style={S.link} onClick={() => setRecent([])}>Clear</button>
            </div>
            {recent.map(r => (
              <div key={r.id} style={S.recentRow}>
                <span style={S.recentValue}>{mask(r.value)}</span>
                <span style={S.recentMeta}>{r.strength}</span>
                <button className="pwg-btn" style={S.link} onClick={() => void copy(r.value)} aria-label="Copy again">Copy</button>
                <button className="pwg-btn" style={S.link} onClick={() => setRecent(prev => prev.filter(x => x.id !== r.id))} aria-label="Remove">Remove</button>
              </div>
            ))}
            <div style={S.hint}>Kept in memory only. Closing the app clears this list.</div>
          </section>
        )}
      </div>
    </div>
  );
};

const Check: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <label style={S.check}>
    <input className="pwg-check" type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ accentColor: 'var(--color-accent)', width: 16, height: 16, margin: 0 }} />
    <span>{label}</span>
  </label>
);

const S: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontFamily: 'var(--dex-font-ui)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 var(--space-4)', height: 'var(--app-header-height, 44px)', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 },
  title: { fontSize: 14, fontWeight: 600, margin: 0 },
  segmented: { display: 'flex', padding: 2, gap: 2, borderRadius: 10, background: 'var(--color-bg-hover)' },
  seg: { minHeight: 28, padding: '0 12px', border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  segOn: { background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)', boxShadow: 'var(--shadow-sm)' },
  main: { flex: 1, overflow: 'auto', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },
  card: { display: 'flex', flexDirection: 'column', gap: 10, padding: 'var(--space-4)', borderRadius: 10, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-subtle)' },
  value: { display: 'block', minHeight: 48, padding: '12px 14px', borderRadius: 6, background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', fontFamily: 'var(--font-mono)', fontSize: 15, lineHeight: 1.5, wordBreak: 'break-all', userSelect: 'all' },
  strengthRow: { display: 'flex', alignItems: 'center', gap: 10 },
  segments: { display: 'flex', gap: 4, flex: 1 },
  segment: { flex: 1, height: 4, borderRadius: 4 },
  strengthLabel: { fontSize: 12, fontWeight: 600, minWidth: 72, textAlign: 'right' },
  bits: { fontSize: 11, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums', minWidth: 52, textAlign: 'right' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btn: { flex: 1, minHeight: 32, minWidth: 96, padding: '0 12px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  primary: { background: 'var(--color-accent-fill)', color: 'var(--color-accent-text)', border: '1px solid transparent' },
  status: { minHeight: 16, fontSize: 11, color: 'var(--color-text-secondary)' },
  rowLabel: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' },
  number: { width: 64, minHeight: 28, padding: '0 8px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  count: { fontSize: 13, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' },
  select: { minHeight: 28, padding: '0 8px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontSize: 12, fontFamily: 'inherit' },
  checks: { display: 'flex', flexDirection: 'column', gap: 2 },
  check: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 32, fontSize: 13, cursor: 'pointer' },
  note: { fontSize: 12, color: 'var(--color-text-primary)' },
  recentRow: { display: 'flex', alignItems: 'center', gap: 8, minHeight: 32, borderTop: '1px solid var(--color-border-subtle)' },
  recentValue: { flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  recentMeta: { fontSize: 11, color: 'var(--color-text-tertiary)' },
  link: { minHeight: 28, padding: '0 8px', border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--color-accent)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  vaultForm: { display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10, borderTop: '1px solid var(--color-border-subtle)' },
  input: { minHeight: 32, padding: '0 10px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontSize: 13, fontFamily: 'inherit' },
  hint: { fontSize: 11, color: 'var(--color-text-tertiary)' },
};

PasswordGenerator.displayName = 'PasswordGenerator';
export default memo(PasswordGenerator);
