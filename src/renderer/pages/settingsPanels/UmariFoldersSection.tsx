// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Settings › UKI › Indexed folders (Umari).
 *
 * DEX indexes Documents, Desktop and Downloads. Any other folder (a code
 * workspace, a dataset) is indexed only after the user picks it here in the
 * native folder dialog; removing it drops its files from the index. Files that
 * look like keys or credentials are found by name only. Projects found in these
 * folders (package.json, Cargo.toml, …) are listed with the commands their
 * manifests declare, which is what UKI uses to "run the tests for my project".
 */

import React, { useCallback, useEffect, useState } from 'react';
import { umariFolders, umariAddFolder, umariRemoveFolder, umariProjects, type UmariFolder, type UmariProject } from '../../uki/umari';
import { useToastHelpers } from '../../components/Toast';

interface Props {
  styles: Record<string, React.CSSProperties>;
}

export function UmariFoldersSection({ styles }: Props): React.ReactElement {
  const [defaults, setDefaults] = useState<string[]>([]);
  const [folders, setFolders] = useState<UmariFolder[]>([]);
  const [projects, setProjects] = useState<UmariProject[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const toast = useToastHelpers();

  const refresh = useCallback(async () => {
    const f = await umariFolders();
    setAvailable(f !== null);
    if (f) { setDefaults(f.defaults); setFolders(f.folders); }
    setProjects(await umariProjects());
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const add = async () => {
    setBusy(true);
    try {
      const r = await umariAddFolder();
      if (r.ok) { toast.success(`Indexing ${r.folder?.name ?? 'the folder'} in the background`); await refresh(); }
      else if (!r.cancelled) toast.error(r.error || 'Could not add that folder');
    } finally { setBusy(false); }
  };

  const remove = async (path: string) => {
    const r = await umariRemoveFolder(path);
    if (r.ok) { toast.info('Folder removed; its files leave the index shortly'); await refresh(); }
    else toast.error(r.error || 'Could not remove that folder');
  };

  return (
    <div data-testid="umari-folders">
      <h3 style={styles.sectionTitle}>Indexed folders</h3>
      <p style={note}>
        Search and UKI use DEX's local index. It always covers {defaults.length ? defaults.map(base).join(', ') : 'Documents, Desktop and Downloads'}.
        Add other folders here, such as a code workspace. Files that look like keys or credentials are found by name only, never by content.
      </p>
      {!available ? (
        <p style={note}>Folder indexing runs in the DEX desktop app.</p>
      ) : (
        <>
          {folders.map((f) => (
            <div key={f.path} style={row}>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={name}>{f.name || base(f.path)}</span>
                <span style={pathText}>{f.path}{f.exists ? '' : ' · missing'}</span>
              </span>
              <button type="button" style={styles.secondaryBtn} onClick={() => remove(f.path)}>Remove</button>
            </div>
          ))}
          <button type="button" style={{ ...styles.secondaryBtn, marginTop: 6 }} onClick={add} disabled={busy} data-testid="umari-add-folder">
            {busy ? 'Choosing…' : 'Add folder…'}
          </button>
          {projects && projects.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={subhead}>Projects found ({projects.length})</div>
              {projects.slice(0, 12).map((p) => (
                <div key={p.root} style={row}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={name}>{p.name}</span>
                    <span style={pathText}>{p.kinds.join(' · ')} · {p.root}</span>
                  </span>
                  <span style={cmd}>{p.testCommand ?? 'no test script'}</span>
                </div>
              ))}
              {projects.length > 12 && <p style={note}>…and {projects.length - 12} more.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function base(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

const note: React.CSSProperties = { margin: '0 0 10px', fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-tertiary, rgba(255,255,255,0.55))' };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))' };
const name: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary, #fff)' };
const pathText: React.CSSProperties = { display: 'block', fontSize: 11.5, color: 'var(--color-text-tertiary, rgba(255,255,255,0.5))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const subhead: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary, rgba(255,255,255,0.75))', marginBottom: 4 };
const cmd: React.CSSProperties = { fontFamily: 'var(--font-mono, ui-monospace, Consolas, monospace)', fontSize: 11.5, color: 'var(--color-text-secondary, rgba(255,255,255,0.7))', whiteSpace: 'nowrap' };
