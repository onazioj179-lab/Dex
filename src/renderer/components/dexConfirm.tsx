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

import React, { useEffect, useSyncExternalStore } from 'react';
import { ConfirmDialog, type ConfirmTone } from './ConfirmDialog';

export interface DexConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

type Pending = { opts: DexConfirmOptions; resolve: (ok: boolean) => void };
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
  return new Promise((resolve) => { queue.push({ opts, resolve }); emit(); });
}

function answer(ok: boolean): void {
  const p = queue.shift();
  if (p) p.resolve(ok);
  emit();
}

export function DexConfirmHost(): React.ReactElement | null {
  useEffect(() => {
    hosts += 1;
    return () => {
      hosts = Math.max(0, hosts - 1);
      if (hosts === 0) while (queue.length) queue.shift()!.resolve(false);
      emit();
    };
  }, []);
  const p = useSyncExternalStore(subscribe, current, current);
  if (!p) return null;
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
