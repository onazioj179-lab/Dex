// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Plugins (Settings).
 * Lists installed plugins and installs one from a local folder (plugins:install
 * copies it into DEX's plugin directory after checking its manifest).
 * There is no plugin registry and no plugin runtime in this version: the old
 * Discover / Publish tabs called channels that do not exist, and enabling a
 * plugin only records its state. The page says both plainly.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { GlassSurface, GlassToolbar, SectionHeader, StatusDot } from './ui';


interface InstalledRow {
  manifest: { id: string; name: string; version: string; description?: string; author?: string };
  enabled: boolean;
  state: string;
  installedAt: number;
}

// A getter, not a captured value: this module is evaluated before the Tauri
// bridge (window.dex) is installed, so a module-level copy was undefined.
const bridge = (): any => (window as any).dex;

export const PluginMarketplace: React.FC = () => {
  const [installed, setInstalled] = useState<InstalledRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');

  // ----- Installed -----------------------------------------------------------
  const refreshInstalled = useCallback(async () => {
    try {
      const list = await bridge()?.invoke?.('plugins:list');
      if (Array.isArray(list)) setInstalled(list);
    } catch (e: any) { setStatus(`List failed: ${e?.message ?? e}`); }
  }, []);

  useEffect(() => { refreshInstalled(); }, [refreshInstalled]);

  const installFromFolder = async () => {
    const dex = bridge();
    if (!dex?.invoke) { setStatus('Installing plugins needs the DEX desktop app.'); return; }
    try {
      const pick = await dex.invoke('dialog:showOpenDialog', { properties: ['openDirectory'], title: 'Choose a plugin folder' });
      if (!pick || pick.canceled || !pick.filePaths?.length) return;
      setBusyId('__install');
      setStatus('Installing…');
      const res = await dex.invoke('plugins:install', pick.filePaths[0]);
      if (!res || res.error) throw new Error(res?.error || 'DEX did not answer.');
      setStatus(`Installed ${res.manifest?.name ?? 'plugin'} v${res.manifest?.version ?? '?'}.`);
      await refreshInstalled();
    } catch (e: any) { setStatus(`Install failed: ${e?.message ?? e}`); }
    setBusyId(null);
  };

  const enableToggle = async (row: InstalledRow) => {
    setBusyId(row.manifest.id);
    try {
      const res = await bridge()?.invoke?.(row.enabled ? 'plugins:disable' : 'plugins:enable', row.manifest.id);
      if (!res) throw new Error('that plugin is no longer installed.');
      await refreshInstalled();
    } catch (e: any) { setStatus(`Toggle failed: ${e?.message ?? e}`); }
    setBusyId(null);
  };

  const uninstall = async (row: InstalledRow) => {
    setBusyId(row.manifest.id);
    try {
      const ok = await bridge()?.invoke?.('plugins:uninstall', row.manifest.id);
      if (ok !== true) throw new Error('its files could not be removed.');
      setStatus(`Uninstalled ${row.manifest.name}.`);
      await refreshInstalled();
    } catch (e: any) { setStatus(`Uninstall failed: ${e?.message ?? e}`); }
    setBusyId(null);
  };

  return (
    <div style={{ padding: 0, fontSize: 13, color: 'var(--color-text-primary)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', height: '100%' }}>
      <GlassToolbar
        title="Plugins"
        trailing={
          <button disabled={busyId === '__install'} onClick={installFromFolder} style={btnStyle('accent')}>
            {busyId === '__install' ? 'Installing…' : 'Install from folder…'}
          </button>
        }
      />

      <div style={{ padding: '0 var(--space-4) var(--space-4)', overflowY: 'auto' }}>
        <GlassSurface
          variant="card"
          style={{ padding: 'var(--space-3)', marginBottom: 'var(--space-3)', border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))' }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>
            About plugins
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            A plugin is a folder with a <code>manifest.json</code>. DEX checks the manifest and copies the folder into its plugin directory.
            This version has no plugin store and does not run plugin code yet: enabling a plugin only records that you want it on.
          </div>
        </GlassSurface>

        {status && (
          <GlassSurface
            variant="card"
            style={{ padding: 10, marginBottom: 'var(--space-3)', fontSize: 12, color: 'var(--color-text-secondary)' }}
          >
            {status}
          </GlassSurface>
        )}

        <div>
            <SectionHeader>Installed</SectionHeader>
            {installed.length === 0 && <div style={emptyStyle}>No plugins installed.</div>}
            {installed.map(row => (
              <GlassSurface key={row.manifest.id} variant="card" style={rowSurfaceStyle}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={titleLineStyle}>
                    <StatusDot tone={row.enabled ? 'green' : 'muted'} title={row.enabled ? 'Enabled' : 'Disabled'} />
                    <span style={{ fontWeight: 600 }}>{row.manifest.name}</span>
                    <span style={versionStyle}>v{row.manifest.version}</span>
                  </div>
                  {row.manifest.description && <div style={subtitleStyle}>{row.manifest.description}</div>}
                  <div style={metaStyle}>state: {row.state}</div>
                </div>
                <button disabled={busyId === row.manifest.id} onClick={() => enableToggle(row)} style={btnStyle(row.enabled ? 'muted' : 'accent')}>
                  {row.enabled ? 'Disable' : 'Enable'}
                </button>
                <button disabled={busyId === row.manifest.id} onClick={() => uninstall(row)} style={btnStyle('danger')}>Uninstall</button>
              </GlassSurface>
            ))}
        </div>
      </div>
    </div>
  );
};

// --- Local style helpers ---------------------------------------------------

const rowSurfaceStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: 'var(--space-3)', marginBottom: 'var(--space-2)',
  minWidth: 0, flexWrap: 'wrap',
};

const titleLineStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
  fontSize: 13, color: 'var(--color-text-primary)',
  minWidth: 0,
};

const versionStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500,
};

const subtitleStyle: React.CSSProperties = {
  marginTop: 2, fontSize: 11.5, color: 'var(--color-text-secondary)',
  overflowWrap: 'anywhere',
};

const metaStyle: React.CSSProperties = {
  marginTop: 4, fontSize: 10.5, color: 'var(--color-text-tertiary)',
};

const emptyStyle: React.CSSProperties = {
  padding: 'var(--space-3) 4px', color: 'var(--color-text-tertiary)', fontSize: 12,
};

const btnStyle = (variant: 'accent' | 'muted' | 'danger'): React.CSSProperties => {
  const base: React.CSSProperties = {
    padding: '6px var(--space-3)', borderRadius: 4, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', border: '1px solid var(--pg-border-strong)',
    color: 'var(--color-text-primary)',
    whiteSpace: 'nowrap', flexShrink: 0,
  };
  if (variant === 'accent') return { ...base, background: 'var(--color-accent-fill)', color: '#fff', borderColor: 'transparent' };
  if (variant === 'danger') return { ...base, background: 'var(--color-error-muted, rgba(255,69,58,0.16))', color: 'var(--color-error, #ff8a82)', borderColor: 'var(--color-error, rgba(255,69,58,0.4))' };
  return { ...base, background: 'var(--color-bg-hover, rgba(255,255,255,0.04))' };
};

export default PluginMarketplace;
