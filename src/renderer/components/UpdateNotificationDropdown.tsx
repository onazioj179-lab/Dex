// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// UpdateNotificationDropdown
// Floating, top-right dropdown that surfaces update availability and the
// 30-day Pro downgrade window. Portaled to body so it escapes any parent
// transform/filter and stays visible from anywhere in the shell.
// v4.0.0 — no version bump.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Z_NOTIFICATION } from '../utils/zIndexTokens';

interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes: string;
  downloadSize: number;
  isSecurityUpdate: boolean;
}

interface DowngradeEligibility {
  eligible: boolean;
  daysRemaining: number;
  targetVersion: string | null;
  targetVersions?: string[];
  reason: string;
}

type Phase = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';

const COLOR_BG = 'var(--color-bg-elevated, rgba(28, 28, 30, 0.98))';
// Use design tokens so this component themes correctly (incl. light mode) instead
// of staying hardcoded-dark. COLOR_PRO stays a literal brand gold.
const COLOR_BORDER = 'var(--color-border)';
const COLOR_ACCENT = 'var(--color-accent)';
const COLOR_TEXT = 'var(--color-text-primary)';
const COLOR_MUTED = 'var(--color-text-tertiary)';
const COLOR_PRO = '#ffd60a';
const COLOR_DANGER = 'var(--color-error)';

export const UpdateNotificationDropdown: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [downgrade, setDowngrade] = useState<DowngradeEligibility | null>(null);
  const [busy, setBusy] = useState(false);

  const dex: any = (typeof window !== 'undefined' ? (window as any).dex : null) || null;

  const refreshDowngrade = useCallback(async () => {
    if (!dex?.updates?.canDowngrade) return;
    try {
      const result = await dex.updates.canDowngrade();
      setDowngrade(result);
    } catch {
      setDowngrade(null);
    }
  }, [dex]);

  // Listen for update events
  useEffect(() => {
    if (!dex?.on) return;
    const onAvailable = (i: UpdateInfo) => {
      setInfo(i);
      setPhase('available');
      setOpen(true);
    };
    const onProgress = (p: any) => {
      setPhase('downloading');
      setProgress(typeof p?.percent === 'number' ? p.percent : 0);
    };
    const onDownloaded = (i: UpdateInfo) => {
      setInfo(i);
      setPhase('downloaded');
      setProgress(100);
      setOpen(true);
    };
    const onError = (msg: any) => {
      setError(typeof msg === 'string' ? msg : msg?.message || 'Update error');
      setPhase('error');
    };
    try {
      dex.on('update:available', onAvailable);
      dex.on('update:progress', onProgress);
      dex.on('update:downloaded', onDownloaded);
      dex.on('update:error', onError);
    } catch {
      // ignore — older preload
    }
    return () => {
      try {
        dex.off?.('update:available', onAvailable);
        dex.off?.('update:progress', onProgress);
        dex.off?.('update:downloaded', onDownloaded);
        dex.off?.('update:error', onError);
      } catch {
        // ignore
      }
    };
  }, [dex]);

  // Initial fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!dex?.updates?.getInfo) return;
      try {
        const i = await dex.updates.getInfo();
        if (!cancelled && i?.updateAvailable && i?.latestVersion) {
          setInfo({
            version: i.latestVersion,
            releaseDate: '',
            releaseNotes: i.releaseNotes || '',
            downloadSize: 0,
            isSecurityUpdate: false,
          });
          setPhase('available');
        }
      } catch {
        // ignore
      }
      await refreshDowngrade();
    })();
    return () => { cancelled = true; };
  }, [dex, refreshDowngrade]);

  const hasUpdate = phase === 'available' || phase === 'downloading' || phase === 'downloaded';
  const showDowngradeBadge = !!downgrade && downgrade.eligible;
  const visible = hasUpdate || showDowngradeBadge;

  const handleUpdate = useCallback(async () => {
    if (!dex?.updates) return;
    setBusy(true);
    try {
      if (phase === 'downloaded') {
        await dex.updates.install();
      } else {
        await dex.updates.download();
      }
    } finally {
      setBusy(false);
    }
  }, [dex, phase]);

  const handleSkip = useCallback(async () => {
    if (!dex?.updates) return;
    setBusy(true);
    try {
      await dex.updates.skip(info?.version);
      setOpen(false);
      setPhase('idle');
    } finally {
      setBusy(false);
    }
  }, [dex, info]);

  const handleRemind = useCallback(async () => {
    if (!dex?.updates) return;
    setBusy(true);
    try {
      await dex.updates.remindLater(24);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }, [dex]);

  const handleDowngrade = useCallback(async (target?: string) => {
    if (!dex?.updates?.downgrade) return;
    setBusy(true);
    try {
      const result = await dex.updates.downgrade(target);
      if (!result.success) {
        setError(result.error || result.eligibility?.reason || 'Downgrade failed');
      } else {
        setOpen(false);
      }
      await refreshDowngrade();
    } finally {
      setBusy(false);
    }
  }, [dex, refreshDowngrade]);

  const bellLabel = useMemo(() => {
    if (hasUpdate) return `Update available${info?.version ? `: v${info.version}` : ''}`;
    if (showDowngradeBadge) return `Downgrade available (${downgrade?.daysRemaining} days remaining)`;
    return 'No updates';
  }, [hasUpdate, info, showDowngradeBadge, downgrade]);

  if (!visible) return null;

  const node = (
    <div
      style={{
        position: 'fixed',
        top: 44,
        right: 12,
        zIndex: Z_NOTIFICATION,
        fontFamily: 'var(--dex-font-ui)',
        color: COLOR_TEXT,
      }}
      data-dex-update-notification
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={bellLabel}
        title={bellLabel}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          border: `1px solid ${COLOR_BORDER}`,
          background: hasUpdate ? COLOR_ACCENT : COLOR_BG,
          color: COLOR_TEXT,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          padding: 0,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600 }}>{hasUpdate ? '\u2191' : '\u21BA'}</span>
        {showDowngradeBadge && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 14,
              height: 14,
              borderRadius: 7,
              background: COLOR_PRO,
              color: '#000',
              fontSize: 9,
              fontWeight: 700,
              padding: '0 3px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {downgrade?.daysRemaining}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Update options"
          style={{
            marginTop: 8,
            width: 'min(320px, calc(100vw - 48px))',
            background: COLOR_BG,
            border: `1px solid ${COLOR_BORDER}`,
            borderRadius: 10,
            boxShadow: 'var(--pg-shadow-popover)',
            padding: 16,
            backdropFilter: 'var(--blur-lg)',
          }}
        >
          {hasUpdate && info && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                {phase === 'downloaded' ? 'Update ready to install' : 'Update available'}
              </div>
              <div style={{ fontSize: 12, color: COLOR_MUTED, marginBottom: 10 }}>
                Version {info.version}
                {info.isSecurityUpdate ? ' \u00B7 Security update' : ''}
              </div>
              {info.releaseNotes && (
                <div
                  style={{
                    fontSize: 11,
                    color: COLOR_MUTED,
                    marginBottom: 12,
                    maxHeight: 80,
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.4,
                  }}
                >
                  {info.releaseNotes.slice(0, 400)}
                </div>
              )}
              {phase === 'downloading' && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ height: 4, background: 'var(--color-border-subtle, rgba(255,255,255,0.08))', borderRadius: 2, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.round(progress)}%`,
                        height: '100%',
                        background: COLOR_ACCENT,
                        transition: 'width 200ms ease',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: COLOR_MUTED, marginTop: 4 }}>
                    Downloading {Math.round(progress)}%
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleUpdate}
                  disabled={busy || phase === 'downloading'}
                  style={primaryBtn(busy || phase === 'downloading')}
                >
                  {phase === 'downloaded' ? 'Install & Restart' : 'Update Now'}
                </button>
                <button type="button" onClick={handleRemind} disabled={busy} style={ghostBtn(busy)}>
                  Remind Later
                </button>
                <button type="button" onClick={handleSkip} disabled={busy} style={ghostBtn(busy)}>
                  Skip
                </button>
              </div>
            </>
          )}

          {downgrade && (
            <div
              style={{
                marginTop: hasUpdate ? 14 : 0,
                paddingTop: hasUpdate ? 12 : 0,
                borderTop: hasUpdate ? `1px solid ${COLOR_BORDER}` : 'none',
              }}
            >
              <div
                className="dex-caps"
                style={{
                  fontSize: 11,
                  color: downgrade.eligible ? COLOR_PRO : COLOR_MUTED,
                  marginBottom: 6,
                }}
              >
                {downgrade.eligible ? `Pro Downgrade \u00B7 ${downgrade.daysRemaining}d left` : 'Downgrade'}
              </div>
              <div style={{ fontSize: 12, color: COLOR_TEXT, marginBottom: 8, lineHeight: 1.4 }}>
                {downgrade.reason}
              </div>
              {downgrade.eligible && (downgrade.targetVersions?.length || downgrade.targetVersion) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(downgrade.targetVersions && downgrade.targetVersions.length > 0
                    ? downgrade.targetVersions
                    : (downgrade.targetVersion ? [downgrade.targetVersion] : [])
                  ).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleDowngrade(v)}
                      disabled={busy}
                      style={{
                        ...ghostBtn(busy),
                        borderColor: COLOR_PRO,
                        color: COLOR_PRO,
                      }}
                    >
                      Downgrade to v{v}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{ marginTop: 10, fontSize: 11, color: COLOR_DANGER }}>{error}</div>
          )}
        </div>
      )}
    </div>
  );

  return createPortal(node, document.body);
};

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    flex: '1 1 auto',
    minWidth: 110,
    padding: '7px 12px',
    background: COLOR_ACCENT,
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}

function ghostBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '7px 12px',
    background: 'transparent',
    color: COLOR_TEXT,
    border: `1px solid ${COLOR_BORDER}`,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 500,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}

export default UpdateNotificationDropdown;
