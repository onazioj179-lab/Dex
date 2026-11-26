// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Extensions Manager — the local extension host UI.
 *
 * Real lifecycle over services/pluginHost: list installed extensions, toggle
 * enable/disable, see the permission summary, remove user extensions, and
 * install from a pasted manifest or a .json file. There is no remote
 * marketplace — this manages LOCAL extensions only.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ensureInit,
  list,
  enable,
  disable,
  remove,
  subscribe,
  installFromManifest,
  permissionsFor,
  grantPermission,
  type ExtensionRecord,
} from '../../services/pluginHost';
import {
  usePermissionStore,
  PERMISSION_LABELS,
  type PermissionId,
} from '../../store/permissionStore';
import { APP_TITLE, APP_SUBTITLE } from '../../styles/appHeader';
import DexIcon from '../../components/DexIcon';
import { DexSwitch } from '../../components/controls/Switch';

function toast(type: 'info' | 'success' | 'warning' | 'error', message: string): void {
  try {
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } }));
  } catch {
    /* noop */
  }
}

const ExtensionsManager: React.FC = () => {
  const [records, setRecords] = useState<ExtensionRecord[]>([]);
  const [showInstall, setShowInstall] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [manifestText, setManifestText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Subscribe to the permission store so the "granted" badges stay live.
  const permissions = usePermissionStore((s) => s.permissions);

  const refresh = useCallback(() => {
    setRecords(list());
  }, []);

  useEffect(() => {
    ensureInit();
    refresh();
    const unsub = subscribe(refresh);
    return unsub;
  }, [refresh]);

  const handleToggle = useCallback(
    (rec: ExtensionRecord) => {
      if (rec.enabled) {
        disable(rec.manifest.id);
        toast('info', `${rec.manifest.name} disabled`);
      } else {
        // Enabling requires the underlying DEX permissions to be granted for
        // any capability that maps to one — surface that to the user.
        const needed = permissionsFor(rec.manifest.id);
        const missing = needed.filter((p) => !permissions[p]?.enabled);
        enable(rec.manifest.id);
        if (missing.length > 0) {
          toast(
            'warning',
            `${rec.manifest.name} enabled — grant ${missing
              .map((p) => PERMISSION_LABELS[p])
              .join(', ')} for full access`,
          );
        } else {
          toast('success', `${rec.manifest.name} enabled`);
        }
      }
    },
    [permissions],
  );

  const handleGrant = useCallback((rec: ExtensionRecord) => {
    const granted = grantPermission(rec.manifest.id);
    if (granted.length > 0) {
      toast('success', `Granted ${granted.map((p) => PERMISSION_LABELS[p]).join(', ')}`);
    } else {
      toast('info', 'This extension needs no system permissions');
    }
  }, []);

  const handleRemove = useCallback((rec: ExtensionRecord) => {
    if (rec.builtin) {
      toast('warning', 'Built-in extensions cannot be removed (disable instead)');
      return;
    }
    if (remove(rec.manifest.id)) {
      toast('info', `${rec.manifest.name} removed`);
    }
  }, []);

  const doInstall = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        toast('error', 'Paste a manifest first');
        return;
      }
      const res = installFromManifest(trimmed);
      if (!res.ok) {
        toast('error', `Invalid manifest: ${(res.problems || []).join('; ')}`);
        return;
      }
      toast('success', `Installed ${res.record?.manifest.name} (disabled)`);
      setManifestText('');
      setShowInstall(false);
    },
    [],
  );

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => doInstall(String(reader.result || ''));
      reader.onerror = () => toast('error', 'Could not read file');
      reader.readAsText(file);
      e.target.value = '';
    },
    [doInstall],
  );

  const enabledCount = useMemo(() => records.filter((r) => r.enabled).length, [records]);

  return (
    <div style={styles.container} role="region" aria-label="Extensions Manager">
      <style>{`
        .ext-btn:hover { filter: brightness(1.15); }
        .ext-btn:active { transform: scale(0.98); }
        .ext-card:hover { border-color: var(--color-border) !important; }
        .ext-remove:hover { background: var(--color-error-muted, rgba(255,69,58,0.12)) !important; color: var(--color-error, #ff453a) !important; }
      `}</style>

      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Extensions</h1>
          <span style={styles.subtitle}>
            {records.length} installed · {enabledCount} enabled · local host
          </span>
        </div>
        <button
          className="ext-btn"
          style={{ ...styles.primaryBtn }}
          onClick={() => setShowInstall((v) => !v)}
          aria-label="Install extension"
        >
          {showInstall ? 'Close' : 'Install'}
        </button>
      </div>

      {showInstall && (
        <div className="dex-liquid-glass-strong" style={styles.installPanel}>
          <span className="dex-label-caps" style={styles.sectionTitle}>
            Install from manifest
          </span>
          <textarea
            value={manifestText}
            onChange={(e) => setManifestText(e.target.value)}
            placeholder={'{\n  "id": "com.example.tool",\n  "name": "My Tool",\n  "version": "1.0.0",\n  "author": "Me",\n  "dexVersion": "6.0.0",\n  "entryPoint": "index.js",\n  "capabilities": ["clipboard"]\n}'}
            spellCheck={false}
            style={styles.textarea}
            aria-label="Manifest JSON"
          />
          <div style={styles.installActions}>
            <button
              className="ext-btn"
              style={styles.primaryBtn}
              onClick={() => doInstall(manifestText)}
            >
              Install from JSON
            </button>
            <button
              className="ext-btn"
              style={styles.secondaryBtn}
              onClick={() => fileInputRef.current?.click()}
            >
              Pick .json file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={handleFile}
            />
          </div>
        </div>
      )}

      <div style={styles.list}>
        {records.length === 0 && (
          <div style={styles.empty}>No extensions installed.</div>
        )}
        {records.length > 0 && (
          // One grouped list (Settings style): name, one plain line, a switch.
          // Technical details (id, version, capabilities) sit behind Details.
          <div className="ext-group" role="list" aria-label="Extensions">
            {records.map((rec) => {
              const perms = permissionsFor(rec.manifest.id);
              const missing = perms.filter((p: PermissionId) => !permissions[p]?.enabled);
              const open = expanded === rec.manifest.id;
              return (
                <div key={rec.manifest.id} role="listitem" className="ext-row">
                  <div className="ext-row-main">
                    <span className="ext-row-icon" aria-hidden="true"><DexIcon name="puzzle" size={16} color="currentColor" /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="ext-row-name">{rec.manifest.name}{rec.builtin && <span className="ext-row-tag">Built-in</span>}</div>
                      {rec.manifest.description && <div className="ext-row-desc">{rec.manifest.description}</div>}
                      {rec.enabled && missing.length > 0 && (
                        <button type="button" className="ext-link" onClick={() => handleGrant(rec)}>
                          Needs {missing.map((p) => PERMISSION_LABELS[p]).join(', ')}: Allow
                        </button>
                      )}
                    </div>
                    <button type="button" className="ext-link ext-details" aria-expanded={open}
                      onClick={() => setExpanded(open ? null : rec.manifest.id)}>{open ? 'Hide' : 'Details'}</button>
                    <DexSwitch checked={rec.enabled} label={`${rec.manifest.name} enabled`} onChange={() => handleToggle(rec)} />
                  </div>
                  {open && (
                    <div className="ext-row-more">
                      <div>{rec.manifest.id} · v{rec.manifest.version} · {rec.manifest.author}</div>
                      <div>Can use: {rec.manifest.capabilities.length ? rec.manifest.capabilities.join(', ') : 'nothing'}</div>
                      {perms.length > 0 && <div>System permissions: {perms.map((p) => `${PERMISSION_LABELS[p]} ${permissions[p]?.enabled ? '(allowed)' : '(not allowed)'}`).join(', ')}</div>}
                      {!rec.builtin && (
                        <button type="button" className="ext-link ext-remove" onClick={() => handleRemove(rec)}>Remove extension</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <style>{EXT_LIST_CSS}</style>
    </div>
  );
};

const EXT_LIST_CSS = `
:where(.ext-group) { border: 1px solid var(--color-border-subtle); border-radius: 14px; background: var(--color-bg-surface); overflow: hidden; }
:where(.ext-row) + :where(.ext-row) { border-top: 1px solid var(--color-border-subtle); }
:where(.ext-row-main) { display: flex; align-items: center; gap: 12px; padding: 12px 14px; }
:where(.ext-row-icon) { width: 30px; height: 30px; border-radius: 6px; display: grid; place-items: center; flex-shrink: 0;
  background: color-mix(in srgb, var(--color-accent) 14%, transparent); color: var(--color-accent); }
:where(.ext-row-name) { font-size: 13px; font-weight: 600; color: var(--color-text-primary); display: flex; align-items: center; gap: 6px; }
:where(.ext-row-tag) { font-size: 11px; font-weight: 500; color: var(--color-text-tertiary); }
:where(.ext-row-desc) { font-size: 12px; color: var(--color-text-secondary); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
:where(.ext-link) { padding: 0; border: 0; background: none; color: var(--color-accent); font-size: 12px; cursor: pointer; }
:where(.ext-row-main) :where(.ext-link):not(.ext-details) { margin-top: 3px; }
:where(.ext-details) { color: var(--color-text-secondary); flex-shrink: 0; }
:where(.ext-row-more) { padding: 0 14px 12px 56px; display: grid; gap: 4px; font-size: 12px; color: var(--color-text-tertiary); overflow-wrap: anywhere; }
:where(.ext-row-more) :where(.ext-remove) { color: var(--color-error); justify-self: start; margin-top: 2px; }
`;

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--color-bg-base)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--dex-font-ui)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-2) var(--space-4)',
    minHeight: 'var(--app-header-height)', boxSizing: 'border-box', flexShrink: 0,
    borderBottom: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface-solid, #1C1C1E)',
  },
  title: APP_TITLE,
  subtitle: APP_SUBTITLE,
  primaryBtn: {
    padding: '8px 14px',
    background: 'var(--color-accent-fill)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-sm)',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  secondaryBtn: {
    padding: '7px 12px',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  removeBtn: {
    padding: '7px 12px',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text-secondary)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  installPanel: {
    margin: 'var(--space-3) var(--space-4) 0',
    padding: 'var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },
  sectionTitle: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.01em',
    color: 'var(--color-text-tertiary)',
    textTransform: 'none',
  },
  textarea: {
    width: '100%',
    minHeight: '160px',
    resize: 'vertical',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-3)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    lineHeight: 1.5,
    boxSizing: 'border-box',
  },
  installActions: { display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' },
  list: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },
  empty: {
    textAlign: 'center',
    color: 'var(--color-text-tertiary)',
    fontSize: '13px',
    padding: 'var(--space-6)',
  },
  card: {
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    transition: 'border-color 0.15s ease',
  },
  cardTop: { display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' },
  cardName: {
    fontSize: '13px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  builtinTag: {
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    padding: '2px 6px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-bg-surface)',
    color: 'var(--color-text-tertiary)',
    border: '1px solid var(--color-border-subtle)',
  },
  cardMeta: {
    fontSize: '11px',
    color: 'var(--color-text-tertiary)',
    fontFamily: 'var(--font-mono)',
    marginTop: '2px',
    wordBreak: 'break-all',
  },
  cardDesc: { fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.5 },
  toggle: {
    padding: '6px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border-subtle)',
    fontSize: '11px',
    fontWeight: 700,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },
  capRow: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  capChip: {
    fontSize: '10px',
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-bg-surface)',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border-subtle)',
    fontFamily: 'var(--font-mono)',
  },
  capChipMuted: {
    fontSize: '10px',
    padding: '3px 8px',
    color: 'var(--color-text-tertiary)',
    fontStyle: 'italic',
  },
  permRow: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' },
  permLabel: { fontSize: '10px', color: 'var(--color-text-tertiary)' },
  permChip: {
    fontSize: '10px',
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border-subtle)',
  },
  cardActions: { display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' },
};

export default ExtensionsManager;
