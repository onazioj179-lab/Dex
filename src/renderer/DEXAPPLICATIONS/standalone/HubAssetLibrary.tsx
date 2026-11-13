// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Creative Hub › Asset library: assets saved from any creative app's
 * "Send To › Save to Library", ready to send into another app, download or
 * delete. Backed by services/creativeAssetStore.ts (IndexedDB, this device).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { listAssets, loadAsset, deleteAsset, LIBRARY_CHANGED, MAX_LIBRARY_BYTES, type LibraryEntry } from '../../services/creativeAssetStore';
import { getTargetApps, useCreativeSuite, type CreativeAppId } from '../../services/CreativeSuiteBridge';
import { APP_DEFINITIONS } from '../../store/runningApps';

const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const toast = (type: string, message: string) => window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } }));
const appName = (id: string) => APP_DEFINITIONS[id as keyof typeof APP_DEFINITIONS]?.name || id;

const btn: React.CSSProperties = {
  height: 28, padding: '0 10px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--color-border-control)',
  background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
};

export const HubAssetLibrary: React.FC<{ card: React.CSSProperties; h2: React.CSSProperties; term: string }> = ({ card, h2, term }) => {
  const [items, setItems] = useState<LibraryEntry[] | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const refresh = useCallback(() => { void listAssets().then(setItems); }, []);
  useEffect(() => {
    refresh();
    window.addEventListener(LIBRARY_CHANGED, refresh);
    return () => window.removeEventListener(LIBRARY_CHANGED, refresh);
  }, [refresh]);

  const sendTo = async (e: LibraryEntry, target: CreativeAppId) => {
    const asset = await loadAsset(e.id);
    if (!asset) { toast('error', `"${e.name}" could not be read from the library.`); return; }
    if (!useCreativeSuite.getState().sendToApp(asset, target)) {
      toast('error', `Could not send "${e.name}" to ${appName(target)} (too large to hand over, or just sent).`);
      return;
    }
    window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appId: target } }));
    toast('info', `Sent "${e.name}" to ${appName(target)}`);
  };

  const download = async (e: LibraryEntry) => {
    const asset = await loadAsset(e.id);
    if (!asset) { toast('error', `"${e.name}" could not be read from the library.`); return; }
    const isUrl = asset.data.startsWith('data:') || asset.data.startsWith('blob:');
    const href = isUrl ? asset.data : URL.createObjectURL(new Blob([asset.data], { type: asset.mimeType || 'text/plain' }));
    const a = document.createElement('a');
    a.href = href; a.download = e.name; a.click();
    if (!isUrl) setTimeout(() => URL.revokeObjectURL(href), 10_000);
  };

  const remove = async (e: LibraryEntry) => {
    setConfirmId(null);
    if (!(await deleteAsset(e.id))) toast('error', `"${e.name}" could not be deleted.`);
  };

  const shown = (items ?? []).filter(e => !term || e.name.toLowerCase().includes(term) || e.kind.includes(term) || appName(e.sourceApp).toLowerCase().includes(term));
  const used = (items ?? []).reduce((a, e) => a + e.bytes, 0);

  return (
    <section style={card} aria-labelledby="hub-assets">
      <h2 id="hub-assets" style={h2}>Asset library</h2>
      {items === null ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Loading…</div>
      ) : shown.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          {term ? 'Nothing matches.' : 'Nothing saved yet. In Prism, VINX, Imosion, Flux and the other creative apps, choose Send To › Save to Library to keep an asset here.'}
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {shown.map(e => {
            const targets = getTargetApps(e.kind).filter(t => t !== e.sourceApp);
            return (
              <li key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md, 10px)', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    {e.kind} · from {appName(e.sourceApp)} · {fmtBytes(e.bytes)} · {new Date(e.savedAt).toLocaleDateString()}
                  </div>
                </div>
                {targets.length > 0 && (
                  <select aria-label={`Send ${e.name} to an app`} value="" onChange={ev => { const t = ev.target.value as CreativeAppId; if (t) void sendTo(e, t); }}
                    style={{ ...btn, paddingRight: 6 }}>
                    <option value="">Send to…</option>
                    {targets.map(t => <option key={t} value={t}>{appName(t)}</option>)}
                  </select>
                )}
                <button style={btn} onClick={() => void download(e)} aria-label={`Download ${e.name}`}>Download</button>
                {confirmId === e.id ? (
                  <>
                    <button style={{ ...btn, color: 'var(--color-error)' }} onClick={() => void remove(e)} aria-label={`Confirm delete ${e.name}`}>Delete</button>
                    <button style={btn} onClick={() => setConfirmId(null)}>Keep</button>
                  </>
                ) : (
                  <button style={btn} onClick={() => setConfirmId(e.id)} aria-label={`Delete ${e.name}`}>Delete…</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {items && items.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {items.length} asset{items.length === 1 ? '' : 's'} · {fmtBytes(used)} of {fmtBytes(MAX_LIBRARY_BYTES)} · stored on this device
        </div>
      )}
    </section>
  );
};

export default HubAssetLibrary;
