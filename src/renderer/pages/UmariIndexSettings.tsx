// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invokePlatformIpc } from '../services/platform/ipc';
import { isTauri } from '../services/platform/tauriCompat';

interface IndexStatus {
  success: true;
  indexed: number;
  ready: boolean;
  building: boolean;
  watching: boolean;
  warning?: string;
  folders: Array<{ path: string; includeContents: boolean }>;
}
interface IndexFailure { success: false; error: string }

export function UmariIndexSettings() {
  const [status, setStatus] = useState<IndexStatus>();
  const [busy, setBusy] = useState(false);
  const [contents, setContents] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++revision.current;
    const result = await invokePlatformIpc<IndexStatus | IndexFailure>('umari:index:status');
    if (request !== revision.current) return;
    if (result?.success) setStatus(result);
    else setError(result?.error || 'Native indexing is unavailable.');
  }, []);

  useEffect(() => {
    let active = true;
    let dispose: (() => void) | undefined;
    if (isTauri()) {
      void listen('dex-umari-index-changed', () => { void refresh(); }).then(unlisten => {
        if (active) {
          dispose = unlisten;
          void refresh();
        } else unlisten();
      }).catch(() => { if (active) void refresh(); });
    } else void refresh();
    return () => {
      active = false;
      revision.current++;
      dispose?.();
    };
  }, [refresh]);

  const change = async (operation: 'add' | 'remove' | 'rebuild' | 'cancel', value?: string | boolean) => {
    if (operation !== 'cancel') setBusy(true);
    setError('');
    try {
      const result = await invokePlatformIpc<{ success: true } | IndexFailure>(
        `umari:index:${operation}`, ...(value === undefined ? [] : [value])
      );
      if (!result?.success) setError(result?.error || 'The index operation could not be completed.');
      await refresh();
    } finally {
      if (operation !== 'cancel') setBusy(false);
    }
  };

  return (
    <section aria-label="Umari indexing" style={{ display: 'grid', gap: 12 }}>
      {status && <>
        {status.folders.length ? (
          <ul style={{ display: 'grid', gap: 6, padding: 0, margin: 0, listStyle: 'none' }}>
            {status.folders.map(folder => (
              <li key={folder.path} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--color-border-subtle)', paddingBlock: 6 }}>
                <span style={{ overflowWrap: 'anywhere' }}>
                  {folder.path}
                  <small style={{ display: 'block', color: 'var(--color-text-secondary)' }}>{folder.includeContents ? 'Names and supported text' : 'Names and metadata'}</small>
                </span>
                <button disabled={busy} onClick={() => void change('remove', folder.path)} aria-label={`Remove approval for ${folder.path}`}>Remove</button>
              </li>
            ))}
          </ul>
        ) : <p style={{ margin: 0 }}>Approve a folder to enable indexed search.</p>}
        <label><input type="checkbox" checked={contents} disabled={busy} onChange={event => setContents(event.target.checked)} /> Include supported text in the next folder</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button disabled={busy || status.building || status.folders.length >= 8} onClick={() => void change('add', contents)}>Approve folder</button>
          <button disabled={busy || status.building || status.folders.length === 0} onClick={() => void change('rebuild')}>{status.ready ? 'Rebuild index' : 'Build index'}</button>
          {status.building && <button onClick={() => void change('cancel')}>Cancel indexing</button>}
          <button onClick={() => void refresh()}>Refresh status</button>
        </div>
        <div role="status">
          {status.building ? 'Indexing approved folders…' : status.ready
            ? `${status.indexed.toLocaleString()} indexed files${status.watching ? ' · Watching for changes' : ''}`
            : status.folders.length > 0 ? 'Ready to build the index' : 'Indexing idle'}
        </div>
        {status.warning && <div role="status">{status.warning}</div>}
      </>}
      {error && <div role="alert">{error}</div>}
    </section>
  );
}
