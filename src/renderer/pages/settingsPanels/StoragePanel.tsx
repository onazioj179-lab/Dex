// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Settings > Storage & Data — measured usage + honest cache cleanup.
//
// Replaces controls that only pretended to work (cache-size / auto-clean /
// compress / storage-limit sliders nothing read, and a "Clear Cache" button
// that removed a localStorage key nothing wrote, then reported success).
// Sizes come from the native `storage:getUsage`; "Clear caches" shows exactly
// what goes and what stays before doing anything. Your data is never touched.
//

import React, { useCallback, useEffect, useState } from 'react';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToastHelpers } from '../../components/Toast';

interface Category { id: string; label: string; bytes: number; disposable: boolean; note: string }
interface Usage { categories: Category[]; totals: { keep: number; disposable: number }; pendingCacheClear: boolean }

interface StoragePanelProps {
  styles: Record<string, React.CSSProperties>;
}

/** Renderer-side disposable cache: ProgressiveCache's persisted entries. */
const RENDERER_CACHE_PREFIX = 'dex-cache-';

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

function rendererCacheKeys(): string[] {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(RENDERER_CACHE_PREFIX));
  } catch {
    return [];
  }
}

function invoke<T>(channel: string): Promise<T | null> {
  const api = (window as unknown as { dex?: { invoke?: (c: string) => Promise<T> } }).dex;
  return api?.invoke ? api.invoke(channel) : Promise.resolve(null);
}

export default function StoragePanel({ styles }: StoragePanelProps) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const { confirm, ConfirmHost } = useConfirm();
  const toast = useToastHelpers();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setUsage(await invoke<Usage>('storage:getUsage'));
    } catch {
      setUsage(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const clearCaches = async () => {
    const disposable = usage?.categories.filter((c) => c.disposable) ?? [];
    const kept = usage?.categories.filter((c) => !c.disposable) ?? [];
    const ok = await confirm({
      title: 'Clear caches?',
      tone: 'destructive',
      confirmLabel: 'Clear caches',
      message: (
        <div>
          <div style={{ marginBottom: 8 }}>
            Removes {formatBytes(usage?.totals.disposable ?? 0)}:{' '}
            {disposable.map((c) => `${c.label} (${formatBytes(c.bytes)})`).join(', ')}.
            Web engine files are in use while DEX runs, so they are removed the next time DEX starts.
          </div>
          <div>
            Kept: {kept.map((c) => c.label.toLowerCase()).join(', ')}. Map tiles and images re-download when needed.
          </div>
        </div>
      ),
    });
    if (!ok) return;
    const keys = rendererCacheKeys();
    for (const k of keys) {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    }
    const res = await invoke<{ scheduled: boolean; webCacheBytes: number; logBytesFreed: number }>('storage:clearCaches');
    if (res?.scheduled) {
      toast.success(`Logs cleared. ${formatBytes(res.webCacheBytes)} of web engine cache will be removed when DEX next starts.`);
    } else if (res) {
      toast.error('Could not schedule the cache cleanup.');
    } else {
      toast.info(keys.length ? `Cleared ${keys.length} cached entries. Disk caches need the desktop app.` : 'Disk caches can only be cleared in the desktop app.');
    }
    void refresh();
  };

  const rowValue: React.CSSProperties = { ...styles.aboutValue, fontVariantNumeric: 'tabular-nums' };

  return (
    <>
      <h3 style={styles.sectionTitleFirst}>Storage used by DEX</h3>
      {loading && <div style={styles.settingDesc} role="status">Measuring…</div>}
      {!loading && !usage && (
        <div style={styles.settingDesc}>Storage details are available in the desktop app.</div>
      )}
      {usage && (
        <div style={styles.aboutDetails} role="table" aria-label="Storage used by DEX">
          {usage.categories.map((c) => (
            <div key={c.id} style={styles.aboutRow} role="row">
              <span style={styles.aboutLabel} role="rowheader">
                {c.label}
                <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  {c.disposable ? 'Can be cleared' : 'Kept'} · {c.note}
                </span>
              </span>
              <span style={rowValue} role="cell">{formatBytes(c.bytes)}</span>
            </div>
          ))}
          <div style={styles.aboutRow} role="row">
            <span style={{ ...styles.aboutLabel, fontWeight: 600 }} role="rowheader">Total</span>
            <span style={{ ...rowValue, fontWeight: 600 }} role="cell">
              {formatBytes(usage.totals.keep + usage.totals.disposable)}
            </span>
          </div>
        </div>
      )}

      <h3 style={styles.sectionTitle}>Caches</h3>
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Clear caches</span>
          <span style={styles.settingDesc}>
            {usage?.pendingCacheClear
              ? 'Cleanup is scheduled for the next time DEX starts.'
              : `Frees about ${formatBytes(usage?.totals.disposable ?? 0)}. Your notes, files, settings and backups are not affected.`}
          </span>
        </div>
        <button
          type="button"
          style={styles.secondaryBtn}
          onClick={clearCaches}
          disabled={!usage || usage.totals.disposable === 0 || usage.pendingCacheClear}
        >Clear caches…</button>
      </div>
      <ConfirmHost />
    </>
  );
}
