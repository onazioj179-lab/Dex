// =============================================================================
// DEX Platform — DEX Ledger shared UI
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import DexIcon from '../../components/DexIcon';
import { formatMoney, parseMoneyInput, minorToDecimalString, localeDecimalSeparator } from './money';
import { LEDGER_CHANGED, LedgerError, type Account, type CategoryGroup, type LedgerStatus } from './ledgerApi';

export type Section = 'overview' | 'budget' | 'transactions' | 'accounts' | 'reconcile' | 'reports' | 'categories' | 'data';

export interface EditorRequest {
  mode: 'new' | 'edit';
  id?: number;
  kind?: 'expense' | 'income' | 'transfer';
  accountId?: number;
}

export interface LedgerCtx {
  status: LedgerStatus;
  currency: string;
  digits: number;
  accounts: Account[];
  groups: CategoryGroup[];
  fmt: (minor: number, opts?: { sign?: boolean }) => string;
  section: Section;
  go: (s: Section, params?: { accountId?: number | null; categoryId?: number | null }) => void;
  accountFilter: number | null;
  categoryFilter: number | null;
  openEditor: (r: EditorRequest) => void;
  toast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  confirm: (o: { title: string; message?: React.ReactNode; confirmLabel?: string; tone?: 'neutral' | 'destructive' }) => Promise<boolean>;
  openImport: (accountId?: number) => void;
  today: string;
}

export const LedgerContext = createContext<LedgerCtx | null>(null);
export function useLedger(): LedgerCtx {
  const c = useContext(LedgerContext);
  if (!c) throw new Error('useLedger outside Ledger');
  return c;
}

/** Load async data and reload whenever the ledger changes (or deps change). */
export function useLedgerQuery<T>(load: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadRef.current()
      .then(d => { if (alive) { setData(d); setError(null); } })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  useEffect(() => {
    const on = () => setTick(t => t + 1);
    window.addEventListener(LEDGER_CHANGED, on);
    return () => window.removeEventListener(LEDGER_CHANGED, on);
  }, []);
  return { data, error, loading, reload: useCallback(() => setTick(t => t + 1), []) };
}

export function errText(e: unknown): string {
  if (e instanceof LedgerError) return e.message.replace(/^RECONCILED: /, '');
  return e instanceof Error ? e.message : String(e);
}

// ---------------------------------------------------------------- display

export const Money: React.FC<{ minor: number; sign?: boolean; tone?: 'auto' | 'plain' | 'available'; className?: string; strong?: boolean }> = ({ minor, sign, tone = 'plain', className, strong }) => {
  const { fmt } = useLedger();
  let cls = 'lg-num';
  if (tone === 'auto' && minor > 0) cls += ' lg-in';
  if (tone === 'available') cls += minor < 0 ? ' lg-neg-chip' : minor > 0 ? ' lg-pos-chip' : ' lg-zero-chip';
  if (strong) cls += ' lg-strong';
  return <span className={`${cls} ${className || ''}`}>{fmt(minor, { sign })}</span>;
};

/** Amount text field that only ever yields integer minor units. */
export const MoneyInput: React.FC<{
  value: number | null;
  onChange: (minor: number | null) => void;
  digits: number;
  ariaLabel: string;
  autoFocus?: boolean;
  allowNegative?: boolean;
  placeholder?: string;
  onEnter?: () => void;
  onEscape?: () => void;
  className?: string;
}> = ({ value, onChange, digits, ariaLabel, autoFocus, allowNegative = false, placeholder, onEnter, onEscape, className }) => {
  const dec = localeDecimalSeparator();
  const show = (v: number | null) => (v === null ? '' : minorToDecimalString(v, digits).replace('.', dec));
  const [text, setText] = useState(show(value));
  const [err, setErr] = useState<string | null>(null);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(show(value)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [value, digits]);
  const commit = (t: string) => {
    if (!t.trim()) { setErr(null); onChange(null); return; }
    const r = parseMoneyInput(t, digits, dec);
    if (!r.ok) { setErr(r.error); return; }
    if (!allowNegative && r.minor < 0) { setErr('Enter a positive amount'); return; }
    setErr(null);
    onChange(r.minor);
  };
  return (
    <span className="lg-money-input">
      <input
        className={`lg-input lg-num ${err ? 'lg-invalid' : ''} ${className || ''}`}
        inputMode="decimal"
        aria-label={ariaLabel}
        aria-invalid={!!err}
        title={err || undefined}
        autoFocus={autoFocus}
        placeholder={placeholder ?? show(0)}
        value={text}
        onFocus={e => { focused.current = true; e.currentTarget.select(); }}
        onBlur={() => { focused.current = false; commit(text); }}
        onChange={e => { setText(e.target.value); if (err) setErr(null); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { commit(text); onEnter?.(); }
          if (e.key === 'Escape') { setText(show(value)); setErr(null); onEscape?.(); }
        }}
      />
      {err && <span className="lg-field-error" role="alert">{err}</span>}
    </span>
  );
};

export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'default'; icon?: string; small?: boolean }> = ({ variant = 'default', icon, small, children, className, ...rest }) => (
  <button type="button" className={`lg-btn lg-btn-${variant} ${small ? 'lg-btn-sm' : ''} ${className || ''}`} {...rest}>
    {icon && <DexIcon name={icon} size={small ? 12 : 14} color="currentColor" />}
    {children !== undefined && children !== null && children !== false && <span>{children}</span>}
  </button>
);

export const IconBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; active?: boolean }> = ({ icon, label, active, className, ...rest }) => (
  <button type="button" aria-label={label} title={label} aria-pressed={active} className={`lg-icon-btn ${active ? 'lg-active' : ''} ${className || ''}`} {...rest}>
    <DexIcon name={icon} size={15} color="currentColor" />
  </button>
);

export const Empty: React.FC<{ icon?: string; title: string; children?: React.ReactNode }> = ({ icon = 'inbox', title, children }) => (
  <div className="lg-empty">
    <DexIcon name={icon} size={22} color="var(--color-text-tertiary)" />
    <div className="lg-empty-title">{title}</div>
    {children && <div className="lg-empty-body">{children}</div>}
  </div>
);

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; width?: number }> = ({ title, onClose, children, footer, width = 520 }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button');
    first?.focus();
    return () => { prev?.focus?.(); };
  }, []);
  return (
    <div className="lg-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={ref}
        className="lg-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width: `min(${width}px, calc(100% - 32px))` }}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
          if (e.key === 'Tab' && ref.current) {
            const f = Array.from(ref.current.querySelectorAll<HTMLElement>('input, select, textarea, button, [tabindex="0"]')).filter(el => !(el as HTMLButtonElement).disabled);
            if (!f.length) return;
            const i = f.indexOf(document.activeElement as HTMLElement);
            if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
            else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
          }
        }}
      >
        <div className="lg-modal-head">
          <span>{title}</span>
          <IconBtn icon="close" label="Close" onClick={onClose} />
        </div>
        <div className="lg-modal-body">{children}</div>
        {footer && <div className="lg-modal-foot">{footer}</div>}
      </div>
    </div>
  );
};

export const Field: React.FC<{ label: string; children: React.ReactNode; hint?: React.ReactNode; wide?: boolean }> = ({ label, children, hint, wide }) => (
  <label className={`lg-field ${wide ? 'lg-field-wide' : ''}`}>
    <span className="lg-field-label">{label}</span>
    {children}
    {hint && <span className="lg-field-hint">{hint}</span>}
  </label>
);

/** Category <select> grouped like the budget. */
export const CategorySelect: React.FC<{ value: number | null; onChange: (id: number | null) => void; groups: CategoryGroup[]; ariaLabel: string; allowNone?: boolean; noneLabel?: string; includeArchivedId?: number | null }> = ({ value, onChange, groups, ariaLabel, allowNone = true, noneLabel = 'Uncategorised', includeArchivedId }) => (
  <select className="lg-input" aria-label={ariaLabel} value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
    {allowNone && <option value="">{noneLabel}</option>}
    {groups.map(g => (
      <optgroup key={g.id} label={g.name}>
        {g.categories.filter(c => !c.archived || c.id === includeArchivedId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </optgroup>
    ))}
  </select>
);

export const AccountSelect: React.FC<{ value: number | null; onChange: (id: number) => void; accounts: Account[]; ariaLabel: string; exclude?: number | null; placeholder?: string }> = ({ value, onChange, accounts, ariaLabel, exclude, placeholder = 'Choose an account' }) => (
  <select className="lg-input" aria-label={ariaLabel} value={value ?? ''} onChange={e => e.target.value && onChange(Number(e.target.value))}>
    {value === null && <option value="">{placeholder}</option>}
    {accounts.filter(a => !a.archived && a.id !== exclude).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
  </select>
);

export const StatusDot: React.FC<{ status: 'uncleared' | 'cleared' | 'reconciled'; onToggle?: () => void }> = ({ status, onToggle }) => {
  const label = status === 'reconciled' ? 'Reconciled' : status === 'cleared' ? 'Cleared' : 'Uncleared';
  const content = (
    <span className={`lg-status lg-status-${status}`} aria-hidden="true">
      {status === 'reconciled' ? <DexIcon name="lock" size={10} color="currentColor" /> : status === 'cleared' ? 'C' : ''}
    </span>
  );
  if (!onToggle || status === 'reconciled') return <span title={label} aria-label={label} role="img">{content}</span>;
  return <button type="button" className="lg-status-btn" title={`${label} — click to toggle`} aria-label={`${label}. Toggle cleared`} onClick={e => { e.stopPropagation(); onToggle(); }}>{content}</button>;
};

// ----------------------------------------------------------------- styles

export const LEDGER_CSS = `
.dex-ledger { container-type: inline-size; container-name: ledger; --lg-row: 30px; --lg-side: 232px; font-size: 13px; }
.dex-ledger *:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; border-radius: 4px; }
.lg-layout { display: flex; flex: 1; min-height: 0; min-width: 0; }
.lg-side { width: var(--lg-side); flex-shrink: 0; border-right: 1px solid var(--color-border-subtle); background: var(--color-bg-inset); display: flex; flex-direction: column; min-height: 0; }
.lg-side.lg-collapsed { width: 48px; }
.lg-side-scroll { overflow-y: auto; flex: 1; padding: 8px 6px; scrollbar-width: thin; }
.lg-nav-row { display: flex; align-items: center; gap: 9px; width: 100%; height: 28px; padding: 0 8px; border: none; border-radius: 6px; background: transparent; color: var(--color-text-secondary); font: inherit; font-size: 13px; cursor: pointer; text-align: left; }
.lg-nav-row:hover { background: var(--color-bg-hover); color: var(--color-text-primary); }
.lg-nav-row.lg-active { background: var(--color-accent-light); color: var(--color-text-primary); }
.lg-nav-row.lg-active .lg-nav-icon { color: var(--color-accent); }
.lg-nav-icon { display: inline-flex; width: 16px; justify-content: center; color: var(--color-text-tertiary); flex-shrink: 0; }
.lg-nav-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lg-nav-meta { font-size: 12px; color: var(--color-text-tertiary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.lg-side-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 8px 4px; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--color-text-tertiary); }
.lg-side-group { margin-top: 2px; }
.lg-side-group-btn { display: flex; align-items: center; gap: 6px; width: 100%; height: 24px; padding: 0 8px; border: none; background: transparent; color: var(--color-text-tertiary); font: inherit; font-size: 12px; cursor: pointer; border-radius: 6px; }
.lg-side-group-btn:hover { color: var(--color-text-primary); }
.lg-side-group-btn .lg-nav-meta { margin-left: auto; }
.lg-side-foot { border-top: 1px solid var(--color-border-subtle); padding: 8px 6px; display: flex; flex-direction: column; gap: 4px; }
.lg-collapsed .lg-nav-label, .lg-collapsed .lg-nav-meta, .lg-collapsed .lg-side-head, .lg-collapsed .lg-side-accounts { display: none; }
.lg-collapsed .lg-nav-row { justify-content: center; padding: 0; }
.lg-main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.lg-toolbar { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--color-border-subtle); min-height: 48px; flex-wrap: wrap; }
.lg-toolbar h1 { font-size: 15px; font-weight: 600; margin: 0; letter-spacing: -.01em; color: var(--color-text-primary); }
.lg-toolbar .lg-sub { color: var(--color-text-tertiary); font-size: 12px; }
.lg-spacer { flex: 1; }
.lg-scroll { flex: 1; min-height: 0; overflow: auto; scrollbar-width: thin; }
.lg-pad { padding: 16px; }
.lg-inspector { width: 320px; flex-shrink: 0; border-left: 1px solid var(--color-border-subtle); background: var(--color-bg-inset); display: flex; flex-direction: column; min-height: 0; }
.lg-inspector-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--color-border-subtle); font-weight: 600; font-size: 13px; }
.lg-inspector-body { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.lg-btn { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 11px; border-radius: 6px; border: 1px solid var(--color-border); background: var(--color-bg-elevated); color: var(--color-text-primary); font: inherit; font-size: 12.5px; cursor: pointer; white-space: nowrap; }
.lg-btn:hover:not(:disabled) { background: var(--color-bg-hover); }
.lg-btn:disabled { opacity: .45; cursor: default; }
.lg-btn-sm { height: 24px; padding: 0 8px; font-size: 12px; }
.lg-btn-primary { background: var(--color-accent-fill); border-color: transparent; color: var(--color-accent-text, #fff); }
.lg-btn-primary:hover:not(:disabled) { background: var(--color-accent); }
.lg-btn-ghost { background: transparent; border-color: transparent; color: var(--color-text-secondary); }
.lg-btn-ghost:hover:not(:disabled) { color: var(--color-text-primary); }
.lg-btn-danger { background: transparent; border-color: var(--color-border); color: var(--color-error); }
.lg-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; border: none; background: transparent; color: var(--color-text-secondary); cursor: pointer; flex-shrink: 0; }
.lg-icon-btn:hover:not(:disabled) { background: var(--color-bg-hover); color: var(--color-text-primary); }
.lg-icon-btn.lg-active { color: var(--color-accent); background: var(--color-accent-soft); }
.lg-icon-btn:disabled { opacity: .4; cursor: default; }
.lg-input { height: 28px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--color-border); background: var(--color-bg-base); color: var(--color-text-primary); font: inherit; font-size: 13px; min-width: 0; width: 100%; box-sizing: border-box; }
textarea.lg-input { height: auto; padding: 6px 8px; resize: vertical; min-height: 56px; }
.lg-input:focus { border-color: var(--color-accent); outline: none; }
.lg-input.lg-invalid { border-color: var(--color-error); }
.lg-money-input { display: inline-flex; flex-direction: column; width: 100%; }
.lg-field-error { color: var(--color-error); font-size: 11.5px; margin-top: 3px; }
.lg-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.lg-field-label { font-size: 11.5px; color: var(--color-text-tertiary); font-weight: 500; }
.lg-field-hint { font-size: 11.5px; color: var(--color-text-tertiary); }
.lg-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.lg-num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.lg-in { color: var(--color-accent); }
.lg-strong { font-weight: 600; }
.lg-neg-chip, .lg-pos-chip, .lg-zero-chip { display: inline-block; padding: 1px 7px; border-radius: 9999px; font-weight: 500; }
.lg-neg-chip { background: rgba(255,69,58,.14); color: var(--color-error); }
.lg-pos-chip { background: var(--color-accent-soft); color: var(--color-text-primary); }
.lg-zero-chip { color: var(--color-text-tertiary); }
.lg-table { width: 100%; border-collapse: separate; border-spacing: 0; }
.lg-table th { position: sticky; top: 0; z-index: 1; background: var(--color-bg-base); text-align: left; font-weight: 500; font-size: 11.5px; color: var(--color-text-tertiary); padding: 0 10px; height: 30px; border-bottom: 1px solid var(--color-border-subtle); white-space: nowrap; user-select: none; }
.lg-table th.lg-r, .lg-table td.lg-r { text-align: right; }
.lg-table th button { all: unset; cursor: pointer; display: inline-flex; gap: 4px; align-items: center; }
.lg-table th button:hover { color: var(--color-text-primary); }
.lg-table td { padding: 0 10px; height: var(--lg-row); border-bottom: 1px solid var(--color-border-subtle); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px; }
.lg-table tbody tr { cursor: default; }
.lg-table tbody tr:hover td { background: color-mix(in srgb, var(--color-bg-hover) 55%, transparent); }
.lg-table tbody tr.lg-selected td { background: var(--color-accent-light); }
.lg-table tbody tr:focus-visible td { background: var(--color-accent-soft); }
.lg-muted { color: var(--color-text-tertiary); }
.lg-tag { display: inline-flex; align-items: center; gap: 4px; padding: 0 6px; height: 18px; border-radius: 4px; background: var(--color-bg-hover); color: var(--color-text-secondary); font-size: 11.5px; }
.lg-status { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; font-size: 9.5px; font-weight: 700; border: 1.5px solid var(--color-border); color: transparent; }
.lg-status-cleared { border-color: var(--color-accent); color: var(--color-accent); }
.lg-status-reconciled { border-color: transparent; background: var(--color-accent-fill); color: #fff; }
.lg-status-btn { all: unset; cursor: pointer; display: inline-flex; border-radius: 50%; }
.lg-status-btn:hover .lg-status { border-color: var(--color-accent); }
.lg-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); border: 1px solid var(--color-border-subtle); border-radius: 10px; overflow: hidden; }
.lg-summary > div { padding: 12px 14px; border-right: 1px solid var(--color-border-subtle); min-width: 0; }
.lg-summary > div:last-child { border-right: none; }
.lg-summary-label { font-size: 11.5px; color: var(--color-text-tertiary); margin-bottom: 4px; }
.lg-summary-value { font-size: 18px; font-weight: 600; letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
.lg-section-title { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); margin: 18px 0 8px; display: flex; align-items: center; gap: 8px; }
.lg-panel { border: 1px solid var(--color-border-subtle); border-radius: 10px; overflow: hidden; }
.lg-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 32px 16px; text-align: center; }
.lg-empty-title { font-weight: 600; color: var(--color-text-secondary); }
.lg-empty-body { color: var(--color-text-tertiary); max-width: 420px; line-height: 1.5; font-size: 12.5px; }
.lg-modal-backdrop { position: absolute; inset: 0; z-index: 50; background: rgba(0,0,0,.42); display: flex; align-items: center; justify-content: center; }
.lg-modal { background: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 14px; box-shadow: 0 16px 48px rgba(0,0,0,.45); max-height: calc(100% - 32px); display: flex; flex-direction: column; }
.lg-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px 8px; font-weight: 600; }
.lg-modal-body { padding: 4px 16px 14px; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
.lg-modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--color-border-subtle); }
.lg-segment { display: inline-flex; border: 1px solid var(--color-border); border-radius: 7px; overflow: hidden; }
.lg-segment button { border: none; background: transparent; color: var(--color-text-secondary); font: inherit; font-size: 12.5px; padding: 0 10px; height: 26px; cursor: pointer; }
.lg-segment button + button { border-left: 1px solid var(--color-border); }
.lg-segment button[aria-pressed="true"] { background: var(--color-accent-light); color: var(--color-text-primary); }
.lg-banner { display: flex; gap: 8px; align-items: flex-start; padding: 9px 12px; border-radius: 8px; background: var(--color-bg-hover); font-size: 12.5px; color: var(--color-text-secondary); line-height: 1.45; }
.lg-banner.lg-warn { background: rgba(255,159,10,.12); color: var(--color-text-primary); }
.lg-banner.lg-error { background: rgba(255,69,58,.12); color: var(--color-text-primary); }
.lg-bars { display: flex; flex-direction: column; gap: 6px; }
.lg-bar-row { display: grid; grid-template-columns: minmax(90px, 180px) 1fr auto; gap: 10px; align-items: center; font-size: 12.5px; }
.lg-bar-track { height: 8px; border-radius: 4px; background: var(--color-bg-hover); overflow: hidden; }
.lg-bar-fill { height: 100%; background: var(--color-accent); border-radius: 4px; }
.lg-bar-fill.lg-alt { background: var(--color-text-tertiary); }
.lg-budget-group td { background: var(--color-bg-inset); font-weight: 600; font-size: 12px; }
.lg-budget-cell { cursor: text; border-radius: 4px; padding: 2px 6px; }
.lg-budget-cell:hover { background: var(--color-bg-hover); }
.lg-hscroll { overflow-x: auto; }
.lg-kbd { font-size: 11px; color: var(--color-text-tertiary); border: 1px solid var(--color-border); border-radius: 4px; padding: 0 4px; }
@container ledger (max-width: 760px) {
  .lg-side:not(.lg-collapsed) { position: absolute; left: 0; top: 0; bottom: 0; z-index: 21; box-shadow: 8px 0 24px rgba(0,0,0,.35); }
  .lg-inspector { position: absolute; right: 0; top: 0; bottom: 0; z-index: 20; box-shadow: -8px 0 24px rgba(0,0,0,.35); width: min(340px, 92%); }
  .lg-hide-sm { display: none !important; }
  .lg-grid2 { grid-template-columns: 1fr; }
}
@container ledger (max-width: 520px) { .lg-hide-xs { display: none !important; } .lg-toolbar { padding: 8px 10px; } .lg-pad { padding: 10px; } }
@media print {
  .lg-side, .lg-toolbar .lg-btn, .lg-toolbar .lg-icon-btn, .lg-inspector, .dex-app-shell > header { display: none !important; }
  .lg-scroll { overflow: visible !important; }
  .dex-ledger { color: #000; }
}
`;
