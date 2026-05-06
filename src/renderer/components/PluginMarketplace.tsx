// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * PluginMarketplace -- C2/C3
 * Browse, install, and publish DEX plugins (.dexplug-v1 envelopes).
 * Backed by main-process IPC: plugins:list / plugins:browseRegistry /
 * plugins:downloadAndInstall / plugins:package / plugins:publish.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { GlassSurface, GlassToolbar, SectionHeader, StatusDot } from './ui';

type Tab = 'installed' | 'discover' | 'publish';

interface InstalledRow {
  manifest: { id: string; name: string; version: string; description?: string; author?: string };
  enabled: boolean;
  state: string;
  installedAt: number;
}

interface RegistryEntry {
  format: string;
  manifest: { id: string; name: string; version: string; description?: string; author?: string };
  files: Record<string, string>;
  published: { author: string; version: string; sha256: string; downloadUrl?: string; downloads?: number; publishedAt: number };
}

const dex: any = (window as any).dex;

export const PluginMarketplace: React.FC = () => {
  const [tab, setTab] = useState<Tab>('installed');
  const [installed, setInstalled] = useState<InstalledRow[]>([]);
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');

  // ----- Installed -----------------------------------------------------------
  const refreshInstalled = useCallback(async () => {
    try {
      const list = await dex?.invoke?.('plugins:list');
      if (Array.isArray(list)) setInstalled(list);
    } catch (e: any) { setStatus(`List failed: ${e?.message ?? e}`); }
  }, []);

  // ----- Registry ------------------------------------------------------------
  const refreshRegistry = useCallback(async () => {
    try {
      const entries = await dex?.invoke?.('plugins:browseRegistry');
      setRegistry(Array.isArray(entries) ? entries : []);
    } catch (e: any) { setStatus(`Registry failed: ${e?.message ?? e}`); }
  }, []);

  useEffect(() => {
    refreshInstalled();
    refreshRegistry();
  }, [refreshInstalled, refreshRegistry]);

  const install = async (entry: RegistryEntry) => {
    if (!confirm(`Install ${entry.manifest.name}? Review plugin permissions and publisher trust before enabling. DEX may disable unsafe plugins.`)) return;
    setBusyId(entry.manifest.id);
    setStatus(`Installing ${entry.manifest.name}…`);
    try {
      await dex?.invoke?.('plugins:downloadAndInstall', entry);
      setStatus(`Installed ${entry.manifest.name} v${entry.manifest.version}`);
      await refreshInstalled();
    } catch (e: any) { setStatus(`Install failed: ${e?.message ?? e}`); }
    setBusyId(null);
  };

  const enableToggle = async (row: InstalledRow) => {
    setBusyId(row.manifest.id);
    try {
      await dex?.invoke?.(row.enabled ? 'plugins:disable' : 'plugins:enable', row.manifest.id);
      await refreshInstalled();
    } catch (e: any) { setStatus(`Toggle failed: ${e?.message ?? e}`); }
    setBusyId(null);
  };

  const uninstall = async (row: InstalledRow) => {
    if (!confirm(`Uninstall ${row.manifest.name}?`)) return;
    setBusyId(row.manifest.id);
    try {
      await dex?.invoke?.('plugins:uninstall', row.manifest.id);
      await refreshInstalled();
    } catch (e: any) { setStatus(`Uninstall failed: ${e?.message ?? e}`); }
    setBusyId(null);
  };

  // ----- Publish wizard ------------------------------------------------------
  const [publishDir, setPublishDir] = useState('');
  const publish = async () => {
    if (!publishDir.trim()) { setStatus('Provide a source directory path'); return; }
    setStatus('Packaging…');
    try {
      const pkg = await dex?.invoke?.('plugins:package', publishDir.trim());
      if (!pkg?.envelope) throw new Error('Package returned no envelope');
      setStatus(`Packaged ${pkg.envelope.manifest.name} v${pkg.envelope.manifest.version}; publishing locally…`);
      const res = await dex?.invoke?.('plugins:publish', pkg.envelope);
      if (res?.ok) {
        setStatus(`Published to ${res.registryUrl}`);
        await refreshRegistry();
      } else {
        setStatus(`Publish refused: ${res?.reason ?? 'unknown'}`);
      }
    } catch (e: any) { setStatus(`Publish failed: ${e?.message ?? e}`); }
  };

  return (
    <div style={{ padding: 0, fontSize: 13, color: 'var(--color-text-primary)', display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <GlassToolbar
        title="Plugin Marketplace"
        trailing={
          <div style={{ display: 'flex', gap: 4 }}>
            {(['installed', 'discover', 'publish'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={tabBtnStyle(tab === t)}
              >{t}</button>
            ))}
          </div>
        }
      />

      <div style={{ padding: '0 16px 16px', overflowY: 'auto' }}>
        <GlassSurface
          variant="card"
          style={{ padding: 12, marginBottom: 12, border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>
            Plugin Policy
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            Plugins can access files, network, credentials, automation, and user content only through declared permissions.
            DEX may review, block, quarantine, disable, delist, remove, or rate-limit plugins that create risk or violate policy.
          </div>
        </GlassSurface>

        {status && (
          <GlassSurface
            variant="card"
            style={{ padding: 10, marginBottom: 12, fontSize: 12, color: 'var(--color-text-secondary)' }}
          >
            {status}
          </GlassSurface>
        )}

        {tab === 'installed' && (
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
        )}

        {tab === 'discover' && (
          <div>
            <SectionHeader trailing={<button onClick={refreshRegistry} style={btnStyle('muted')}>Refresh</button>}>Discover</SectionHeader>
            {registry.length === 0 && <div style={emptyStyle}>Registry is empty. Publish a plugin to populate it.</div>}
            {registry.map(entry => (
              <GlassSurface key={`${entry.manifest.id}@${entry.published.version}`} variant="card" style={rowSurfaceStyle}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={titleLineStyle}>
                    <StatusDot tone="teal" title="Available" />
                    <span style={{ fontWeight: 600 }}>{entry.manifest.name}</span>
                    <span style={versionStyle}>v{entry.published.version}</span>
                  </div>
                  {entry.manifest.description && <div style={subtitleStyle}>{entry.manifest.description}</div>}
                  <div style={metaStyle}>by {entry.published.author} — sha256 {entry.published.sha256.slice(0, 12)}…</div>
                </div>
                <button disabled={busyId === entry.manifest.id} onClick={() => install(entry)} style={btnStyle('accent')}>
                  {busyId === entry.manifest.id ? 'Installing…' : 'Install'}
                </button>
              </GlassSurface>
            ))}
          </div>
        )}

        {tab === 'publish' && (
          <GlassSurface variant="card" style={{ padding: 14 }}>
            <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              Package a plugin source directory into a <code>.dexplug-v1</code> envelope and publish it to the local registry.
            </div>
            <input
              type="text"
              value={publishDir}
              onChange={e => setPublishDir(e.target.value)}
              placeholder="Absolute path to plugin source folder"
              style={inputStyle}
            />
            <button onClick={publish} style={btnStyle('accent')}>Package &amp; Publish</button>
          </GlassSurface>
        )}
      </div>
    </div>
  );
};

// --- Local style helpers ---------------------------------------------------

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid var(--pg-border)',
  background: active ? 'var(--pg-row-active)' : 'transparent',
  color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
  cursor: 'pointer',
  textTransform: 'capitalize',
  fontSize: 12,
  fontWeight: active ? 600 : 500,
  boxShadow: active ? 'inset 0 0 0 1px var(--pg-border-active)' : 'none',
});

const rowSurfaceStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: 12, marginBottom: 8,
};

const titleLineStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontSize: 13, color: 'var(--color-text-primary)',
};

const versionStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500,
};

const subtitleStyle: React.CSSProperties = {
  marginTop: 2, fontSize: 11.5, color: 'var(--color-text-secondary)',
};

const metaStyle: React.CSSProperties = {
  marginTop: 4, fontSize: 10.5, color: 'var(--color-text-tertiary)',
};

const emptyStyle: React.CSSProperties = {
  padding: '12px 4px', color: 'var(--color-text-tertiary)', fontSize: 12,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--pg-border-strong)',
  background: 'rgba(0,0,0,0.35)',
  color: 'var(--color-text-primary)',
  marginBottom: 10,
  outline: 'none',
  fontSize: 12.5,
};

const btnStyle = (variant: 'accent' | 'muted' | 'danger'): React.CSSProperties => {
  const base: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', border: '1px solid var(--pg-border-strong)',
    color: 'var(--color-text-primary)',
  };
  if (variant === 'accent') return { ...base, background: 'var(--color-accent)', color: '#fff', borderColor: 'transparent' };
  if (variant === 'danger') return { ...base, background: 'rgba(255,69,58,0.16)', color: '#ff8a82', borderColor: 'rgba(255,69,58,0.4)' };
  return { ...base, background: 'rgba(255,255,255,0.04)' };
};

export default PluginMarketplace;
