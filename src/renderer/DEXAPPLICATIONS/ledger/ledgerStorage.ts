// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Ledger — persistence. The packaged app stores the ledger in SQLite
// (dex.db, `ledger:*` channels, one transaction per save). The browser preview
// has no native bridge, so it falls back to this browser's storage and says so.
// =============================================================================

import { emptyLedger, validateLedger, type LedgerDoc } from './ledgerModel';

type Bridge = { invoke: (channel: string, ...args: unknown[]) => Promise<any> };
// Looked up per call: window.dex is not ready at module load in the packaged app.
function bridge(): Bridge | null {
  const d = (globalThis as { dex?: Bridge }).dex;
  return d && typeof d.invoke === 'function' ? d : null;
}

const LOCAL_KEY = 'dex-ledger-preview-v1';
export type LedgerBackend = 'sqlite' | 'browser';

export function ledgerBackend(): LedgerBackend {
  return bridge() ? 'sqlite' : 'browser';
}

export async function loadLedger(): Promise<{ doc: LedgerDoc; backend: LedgerBackend; error?: string }> {
  const b = bridge();
  if (b) {
    try {
      const res = await b.invoke('ledger:load');
      if (res?.ok) return { doc: validateLedger(res.doc), backend: 'sqlite' };
      return { doc: emptyLedger(), backend: 'sqlite', error: res?.error ?? 'The ledger database is unavailable.' };
    } catch (e) {
      return { doc: emptyLedger(), backend: 'sqlite', error: (e as Error).message };
    }
  }
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return { doc: raw ? validateLedger(JSON.parse(raw)) : emptyLedger(), backend: 'browser' };
  } catch (e) {
    return { doc: emptyLedger(), backend: 'browser', error: `Saved data could not be read: ${(e as Error).message}` };
  }
}

export async function saveLedger(doc: LedgerDoc): Promise<{ ok: boolean; error?: string }> {
  const b = bridge();
  if (b) {
    try {
      const res = await b.invoke('ledger:save', doc);
      return res?.ok ? { ok: true } : { ok: false, error: res?.error ?? 'Save failed.' };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(doc));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
