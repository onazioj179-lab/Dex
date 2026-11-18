// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * `await dexConfirm({...})` — the in-app confirmation for code that is not a
 * React component with its own `useConfirm()` host (event handlers in large
 * apps, services). Same ConfirmDialog look as everywhere else in DEX, instead
 * of the WebView's plain system box. One request shows at a time; the rest
 * wait in order. Without a mounted host (tests, a standalone page) it falls
 * back to the browser's confirm(), and to "no" when even that is unavailable.
 */

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ConfirmDialog, type ConfirmTone } from './ConfirmDialog';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Z_DROPDOWN_BASE } from '../../shared/zIndex';

export interface DexConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

export interface DexPromptOptions {
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** Allow submitting an empty value (default: no). */
  allowEmpty?: boolean;
}

type Pending =
  | { kind: 'confirm'; opts: DexConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; opts: DexPromptOptions; resolve: (value: string | null) => void };
const queue: Pending[] = [];
const listeners = new Set<() => void>();
let hosts = 0;
const emit = () => { for (const l of listeners) { try { l(); } catch { /* never block */ } } };
const current = () => queue[0] ?? null;
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function dexConfirm(opts: DexConfirmOptions): Promise<boolean> {
  if (hosts === 0) {
    try { return Promise.resolve(!!window.confirm(opts.message ? `${opts.title}\n\n${opts.message}` : opts.title)); } catch { return Promise.resolve(false); }
  }
  return new Promise((resolve) => { queue.push({ kind: 'confirm', opts, resolve }); emit(); });
}

/** `await dexPrompt({...})` — text input in DEX's dialog; null when cancelled. */
export function dexPrompt(opts: DexPromptOptions): Promise<string | null> {
  if (hosts === 0) {
    try { return Promise.resolve(window.prompt(opts.label ? `${opts.title}\n${opts.label}` : opts.title, opts.defaultValue ?? '')); } catch { return Promise.resolve(null); }
  }
  return new Promise((resolve) => { queue.push({ kind: 'prompt', opts, resolve }); emit(); });
}

function answer(value: boolean | string | null): void {
  const p = queue.shift();
  if (p?.kind === 'confirm') p.resolve(value === true);
  else if (p?.kind === 'prompt') p.resolve(typeof value === 'string' ? value : null);
  emit();
}

function PromptDialog({ opts }: { opts: DexPromptOptions }): React.ReactElement {
  const [value, setValue] = useState(opts.defaultValue ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); }); }, []);
  const ok = opts.allowEmpty || value.trim().length > 0;
  const submit = () => { if (ok) answer(value); };
  return (
    <Modal open onClose={() => answer(null)} size="sm" title={opts.title} zIndexOverride={Z_DROPDOWN_BASE} testIdPrefix="dex-prompt"
      footer={<>
        <Button variant="ghost" size="md" onClick={() => answer(null)}>Cancel</Button>
        <Button variant="primary" size="md" disabled={!ok} onClick={submit} data-testid="dex-prompt-ok">{opts.confirmLabel ?? 'OK'}</Button>
      </>}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
        {opts.label}
        <input
          ref={inputRef}
          value={value}
          placeholder={opts.placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          data-testid="dex-prompt-input"
          style={{ height: 32, padding: '0 10px', borderRadius: 10, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-inset)', color: 'var(--color-text-primary)', fontSize: 13 }}
        />
      </label>
    </Modal>
  );
}

export function DexConfirmHost(): React.ReactElement | null {
  useEffect(() => {
    hosts += 1;
    return () => {
      hosts = Math.max(0, hosts - 1);
      if (hosts === 0) while (queue.length) answer(null);
      emit();
    };
  }, []);
  const p = useSyncExternalStore(subscribe, current, current);
  if (!p) return null;
  if (p.kind === 'prompt') return <PromptDialog key={queue.length + p.opts.title} opts={p.opts} />;
  return (
    <ConfirmDialog
      open
      title={p.opts.title}
      message={p.opts.message}
      confirmLabel={p.opts.confirmLabel ?? 'OK'}
      cancelLabel={p.opts.cancelLabel ?? 'Cancel'}
      tone={p.opts.tone ?? 'neutral'}
      onConfirm={() => answer(true)}
      onCancel={() => answer(false)}
      testIdPrefix="dex-confirm"
    />
  );
}

/** Test hook. */
export function __pendingConfirms(): number { return queue.length; }
