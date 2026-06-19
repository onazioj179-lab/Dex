// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * PermissionCenter — the user-facing control surface for UKI capabilities
 * (DEX 5.6 "Permission Center"). The grant model already existed end-to-end in
 * uki/permissions.ts (grant / revoke / describeCapabilities with plain-language
 * labels + rationale) but had NO UI — this dialog wires it up so the user can
 * see exactly what UKI can access, why, and toggle each grant.
 *
 * Opened via the `dex-permission-center` event (Command Palette command).
 * Visibility: a deliberate solid dialog + light scrim — never a black overlay.
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import { describeCapabilities, grant, revoke, type CapabilityInfo } from '../uki/permissions';
import { useFocusTrap } from '../utils/useFocusTrap';

const PermissionCenter: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [caps, setCaps] = useState<CapabilityInfo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(visible);

  const refresh = useCallback(() => {
    void describeCapabilities().then(setCaps).catch(() => setCaps([]));
  }, []);

  useEffect(() => {
    const onOpen = () => { refresh(); setVisible(true); };
    window.addEventListener('dex-permission-center', onOpen);
    return () => window.removeEventListener('dex-permission-center', onOpen);
  }, [refresh]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setVisible(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  const toggle = useCallback(async (info: CapabilityInfo) => {
    if (info.status === 'hard-denied') return;
    setBusy(info.capability);
    try {
      if (info.status === 'granted') await revoke(info.capability);
      else await grant(info.capability);
    } catch { /* hard-denied / storage error — refresh reflects truth */ }
    setBusy(null);
    refresh();
  }, [refresh]);

  if (!visible) return null;

  const grantedCount = caps.filter(c => c.status === 'granted').length;
  const btn: React.CSSProperties = {
    padding: '5px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
    background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)',
    flexShrink: 0,
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--z-max)' as React.CSSProperties['zIndex'],
        background: 'var(--color-scrim, rgba(0,0,0,0.45))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.14s ease', padding: 'var(--space-6)',
      }}
      onClick={() => setVisible(false)}
    >
      <div
        ref={trapRef}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-bg-elevated, var(--color-bg-secondary))',
          border: '1px solid var(--color-border)', borderRadius: 10,
          padding: 22, width: 'min(560px, 96vw)', maxHeight: '82vh',
          display: 'flex', flexDirection: 'column', gap: 14,
          boxShadow: '0 12px 48px rgba(0,0,0,0.35)',
        }}
        role="dialog"
        aria-label="UKI Permissions"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
            UKI Permissions
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{grantedCount} of {caps.length} allowed</span>
        </div>

        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5, marginTop: -4 }}>
          UKI can only use a capability you allow here. Nothing is assumed. Allowed
          access lapses automatically when the session-grant expires.
        </div>

        <div style={{ overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {caps.map((c) => {
            const hard = c.status === 'hard-denied';
            const on = c.status === 'granted';
            const dot = on ? 'var(--color-success, #34c759)' : hard ? 'var(--color-error, #ff453a)' : 'var(--color-text-tertiary)';
            return (
              <div
                key={c.capability}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)',
                  padding: '10px var(--space-3)', borderRadius: 8,
                  background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', minWidth: 0, flex: 1 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0, marginTop: 5 }} aria-hidden />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{c.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1, lineHeight: 1.45 }}>{c.rationale}</div>
                    {on && c.expiresTs && (
                      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                        {c.scope === 'session' ? 'Session access' : 'Access'} · expires {new Date(c.expiresTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                </div>
                {hard ? (
                  <span style={{ ...btn, cursor: 'default', opacity: 0.6 }} aria-label={`${c.label} is blocked in this build`}>Blocked</span>
                ) : (
                  <button
                    style={{ ...btn, borderColor: on ? 'var(--color-border)' : 'var(--color-accent)', color: on ? 'var(--color-text-secondary)' : 'var(--color-accent)' }}
                    disabled={busy === c.capability}
                    onClick={() => toggle(c)}
                    aria-pressed={on}
                  >
                    {busy === c.capability ? '…' : on ? 'Revoke' : 'Allow'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
          Press <kbd style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)' }}>Esc</kbd> to close
        </div>
      </div>
    </div>
  );
};

PermissionCenter.displayName = 'PermissionCenter';
export default memo(PermissionCenter);
