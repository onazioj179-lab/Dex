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
        <div style={styles.installPanel}>
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
        {records.map((rec) => {
          const perms = permissionsFor(rec.manifest.id);
          const missing = perms.filter((p: PermissionId) => !permissions[p]?.enabled);
          return (
            <div key={rec.manifest.id} className="ext-card" style={styles.card}>
              <div style={styles.cardTop}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.cardName}>
                    {rec.manifest.name}
                    {rec.builtin && <span style={styles.builtinTag}>BUILT-IN</span>}
                  </div>
                  <div style={styles.cardMeta}>
                    {rec.manifest.id} · v{rec.manifest.version} · {rec.manifest.author}
                  </div>
                </div>
                <button
                  className="ext-btn"
                  style={{
                    ...styles.toggle,
                    background: rec.enabled
                      ? 'var(--color-success, #30d158)'
                      : 'var(--color-bg-surface)',
                    color: rec.enabled ? '#000' : 'var(--color-text-secondary)',
                  }}
                  onClick={() => handleToggle(rec)}
                  aria-pressed={rec.enabled}
                  aria-label={rec.enabled ? 'Disable' : 'Enable'}
                >
                  {rec.enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              {rec.manifest.description && (
                <div style={styles.cardDesc}>{rec.manifest.description}</div>
              )}

              <div style={styles.capRow}>
                {rec.manifest.capabilities.length === 0 && (
                  <span style={styles.capChipMuted}>no capabilities</span>
                )}
                {rec.manifest.capabilities.map((cap) => (
                  <span key={cap} style={styles.capChip}>
                    {cap}
                  </span>
                ))}
              </div>

              {perms.length > 0 && (
                <div style={styles.permRow}>
                  <span style={styles.permLabel}>System permissions:</span>
                  {perms.map((p) => (
                    <span
                      key={p}
                      style={{
                        ...styles.permChip,
                        background: permissions[p]?.enabled
                          ? 'var(--color-success-muted, rgba(48,209,88,0.16))'
                          : 'var(--color-bg-surface)',
                        color: permissions[p]?.enabled
                          ? 'var(--color-success, #30d158)'
                          : 'var(--color-text-tertiary)',
                      }}
                    >
                      {PERMISSION_LABELS[p]} {permissions[p]?.enabled ? '✓' : '✕'}
                    </span>
                  ))}
                </div>
              )}

              <div style={styles.cardActions}>
                {missing.length > 0 && (
                  <button
                    className="ext-btn"
                    style={styles.secondaryBtn}
                    onClick={() => handleGrant(rec)}
                  >
                    Grant permissions
                  </button>
                )}
                {!rec.builtin && (
                  <button
                    className="ext-btn ext-remove"
                    style={styles.removeBtn}
                    onClick={() => handleRemove(rec)}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

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
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface-solid, #1C1C1E)',
  },
  title: { fontSize: '15px', fontWeight: 600, margin: 0, letterSpacing: '-0.2px' },
  subtitle: { fontSize: '11px', color: 'var(--color-text-tertiary)' },
  primaryBtn: {
    padding: '8px 14px',
    background: 'var(--color-accent, #0a84ff)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '6px',
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
    borderRadius: '6px',
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
    borderRadius: '6px',
    color: 'var(--color-text-secondary)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  installPanel: {
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-secondary)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },
  sectionTitle: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    color: 'var(--color-text-tertiary)',
    textTransform: 'uppercase',
  },
  textarea: {
    width: '100%',
    minHeight: '160px',
    resize: 'vertical',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '6px',
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
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '8px',
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
    borderRadius: '4px',
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
    borderRadius: '6px',
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
    borderRadius: '4px',
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
    borderRadius: '4px',
    border: '1px solid var(--color-border-subtle)',
  },
  cardActions: { display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' },
};

export default ExtensionsManager;
