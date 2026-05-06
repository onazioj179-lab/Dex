// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * NexusBiometrics -- D2
 * Lists biometric capabilities surfaced by the Nexus controller, lets the user
 * enroll / test / revoke records. Empty-states gracefully when no provider
 * is available on the current OS.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { GlassSurface, GlassToolbar, SectionHeader, StatusDot } from './ui';

interface Capability {
  kind: string;       // 'face' | 'fingerprint' | 'voice' | 'iris' | string
  available: boolean;
  provider: string;
  notes?: string;
}

interface EnrolledRecord {
  id: string;
  kind: string;
  label: string;
  enrolledAt: number;
  lastTestedAt?: number;
  lastResult?: 'pass' | 'fail';
}

interface ListResponse {
  capabilities: Capability[];
  records: EnrolledRecord[];
}

const dex: any = (window as any).dex;

export const NexusBiometrics: React.FC = () => {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [records, setRecords] = useState<EnrolledRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const refresh = useCallback(async () => {
    try {
      const r: ListResponse = await dex?.nexusBio?.list?.();
      setCapabilities(r?.capabilities ?? []);
      setRecords(r?.records ?? []);
    } catch (e: any) { setStatus(`List failed: ${e?.message ?? e}`); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const enroll = async (kind: string) => {
    const label = window.prompt(`Label for new ${kind} record:`, `${kind}-1`);
    if (!label) return;
    setBusy(kind);
    setStatus(`Enrolling ${kind}…`);
    try {
      await dex?.nexusBio?.enroll?.({ kind, label });
      setStatus(`Enrolled ${label}`);
      await refresh();
    } catch (e: any) { setStatus(`Enroll failed: ${e?.message ?? e}`); }
    setBusy(null);
  };

  const test = async (rec: EnrolledRecord) => {
    setBusy(rec.id);
    setStatus(`Testing ${rec.label}…`);
    try {
      const res = await dex?.nexusBio?.test?.(rec.id);
      setStatus(`Test result: ${res?.result ?? 'unknown'}`);
      await refresh();
    } catch (e: any) { setStatus(`Test failed: ${e?.message ?? e}`); }
    setBusy(null);
  };

  const revoke = async (rec: EnrolledRecord) => {
    if (!confirm(`Revoke ${rec.label}?`)) return;
    setBusy(rec.id);
    try {
      await dex?.nexusBio?.revoke?.(rec.id);
      await refresh();
    } catch (e: any) { setStatus(`Revoke failed: ${e?.message ?? e}`); }
    setBusy(null);
  };

  const allUnavailable = capabilities.length > 0 && capabilities.every(c => !c.available);

  return (
    <div style={{ padding: 0, fontSize: 13, color: 'var(--color-text-primary)', display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <GlassToolbar title="Nexus Biometrics" />

      <div style={{ padding: '0 16px 16px', overflowY: 'auto' }}>
        <p style={{ margin: '0 0 12px', color: 'var(--color-text-secondary)', fontSize: 12.5, lineHeight: 1.5 }}>
          Local biometric factors for unlocking the identity vault and confirming privileged actions.
          Templates never leave this device.
        </p>

        {status && (
          <GlassSurface variant="card" style={{ padding: 10, marginBottom: 12, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {status}
          </GlassSurface>
        )}

        <SectionHeader>Available factors</SectionHeader>
        {capabilities.length === 0 && <div style={emptyStyle}>Querying capabilities…</div>}
        {allUnavailable && <div style={emptyStyle}>No biometric providers detected on this device.</div>}
        {capabilities.map(cap => (
          <GlassSurface key={cap.kind} variant="card" style={rowSurfaceStyle}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={titleLineStyle}>
                <StatusDot tone={cap.available ? 'teal' : 'muted'} title={cap.available ? 'Available' : 'Unavailable'} />
                <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{cap.kind}</span>
              </div>
              <div style={metaStyle}>provider: {cap.provider}{cap.notes ? ` — ${cap.notes}` : ''}</div>
            </div>
            <span style={{
              fontSize: 10.5, padding: '2px 8px', borderRadius: 999,
              background: cap.available ? 'rgba(52,199,89,0.15)' : 'rgba(255,255,255,0.04)',
              color: cap.available ? '#5cd17a' : 'var(--color-text-tertiary)',
              border: cap.available ? '1px solid rgba(52,199,89,0.3)' : '1px solid var(--pg-border)',
            }}>{cap.available ? 'available' : 'unavailable'}</span>
            <button disabled={!cap.available || busy === cap.kind} onClick={() => enroll(cap.kind)} style={btnStyle(cap.available ? 'accent' : 'muted')}>Enroll</button>
          </GlassSurface>
        ))}

        <SectionHeader style={{ paddingTop: 18 }}>Enrolled records</SectionHeader>
        {records.length === 0 && <div style={emptyStyle}>No records enrolled yet.</div>}
        {records.map(rec => (
          <GlassSurface key={rec.id} variant="card" style={rowSurfaceStyle}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={titleLineStyle}>
                <StatusDot tone={rec.lastResult === 'fail' ? 'red' : 'blue'} title={rec.lastResult ?? 'Untested'} />
                <span style={{ fontWeight: 600 }}>{rec.label}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>({rec.kind})</span>
              </div>
              <div style={metaStyle}>
                enrolled {new Date(rec.enrolledAt).toLocaleString()}
                {rec.lastTestedAt ? ` — last test ${rec.lastResult ?? '?'} at ${new Date(rec.lastTestedAt).toLocaleString()}` : ''}
              </div>
            </div>
            <button disabled={busy === rec.id} onClick={() => test(rec)} style={btnStyle('accent')}>Test</button>
            <button disabled={busy === rec.id} onClick={() => revoke(rec)} style={btnStyle('danger')}>Revoke</button>
          </GlassSurface>
        ))}
      </div>
    </div>
  );
};

// --- Local style helpers ---------------------------------------------------

const rowSurfaceStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: 12, marginBottom: 8,
};

const titleLineStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontSize: 13, color: 'var(--color-text-primary)',
};

const metaStyle: React.CSSProperties = {
  marginTop: 4, fontSize: 11, color: 'var(--color-text-tertiary)',
};

const emptyStyle: React.CSSProperties = {
  padding: '12px 4px', color: 'var(--color-text-tertiary)', fontSize: 12,
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

export default NexusBiometrics;
