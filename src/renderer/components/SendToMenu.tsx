// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * SendToMenu — reusable "Send To" dropdown for DEX Creative Suite apps.
 * Appears in each app's toolbar, shows compatible target apps.
 */
import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
  type CreativeAppId,
  type AssetKind,
  getTargetApps,
  useCreativeSuite,
  createAssetId,
  useCreativeInbox,
  type SharedAsset,
} from '../services/CreativeSuiteBridge';

const APP_META: Record<CreativeAppId, { label: string; color: string; icon: JSX.Element }> = {
  imosion: {
    label: 'Imosion',
    color: 'var(--color-success)',
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#30d158" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>,
  },
  videoeditor: {
    label: 'VINX',
    color: 'var(--color-accent)',
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4A9EFF" strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="20" height="20" rx="2"/><polygon points="10 8 16 12 10 16 10 8"/></svg>,
  },
  flux: {
    label: 'Flux',
    color: '#bf5af2',
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#bf5af2" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>,
  },
  prism: {
    label: 'Prism',
    color: '#ec4899',
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
  },
  forge: {
    label: 'Forge',
    color: 'var(--color-warning)',
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff9f0a" strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  },
  axl: {
    label: 'AXL',
    color: 'var(--color-accent)',
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0A84FF" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M3 12h18"/><circle cx="12" cy="12" r="3"/></svg>,
  },
  notes: {
    label: 'Notes',
    color: 'var(--color-warning)',
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffd60a" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  },
  rewind: {
    label: 'Rewind',
    color: 'var(--color-error)',
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF453A" strokeWidth="2" strokeLinecap="round"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>,
  },
};

interface SendToMenuProps {
  sourceApp: CreativeAppId;
  assetKind: AssetKind;
  /** Provide the asset data when user clicks a target */
  getAsset: () => { name: string; data: string; mimeType?: string; metadata?: Record<string, unknown> };
  /** Optional: override button style */
  style?: React.CSSProperties;
}

const SendToMenu: React.FC<SendToMenuProps> = ({ sourceApp, assetKind, getAsset, style }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sendToApp = useCreativeSuite(s => s.sendToApp);

  const targets = getTargetApps(assetKind).filter(a => a !== sourceApp);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Listen for delivery ACK/error from receiver side
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      const { status, error } = detail as { requestId: string; status: string; error?: string };
      if (status === 'failed' && error) {
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: `Delivery failed: ${error}` } }));
      }
    };
    window.addEventListener('dex-creative-ack', handler);
    return () => window.removeEventListener('dex-creative-ack', handler);
  }, []);

  const handleSend = useCallback((target: CreativeAppId) => {
    const { name, data, mimeType, metadata } = getAsset();
    const asset: SharedAsset = {
      id: createAssetId(),
      kind: assetKind,
      name,
      sourceApp,
      data,
      mimeType,
      metadata,
      createdAt: Date.now(),
    };
    const success = sendToApp(asset, target);
    setOpen(false);
    const targetLabel = APP_META[target]?.label || target;
    if (success) {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message: `Sent "${name}" to ${targetLabel}` } }));
    } else {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: `Could not send to ${targetLabel}` } }));
    }
  }, [getAsset, assetKind, sourceApp, sendToApp]);

  if (targets.length === 0) return null;

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <style>{`.dex-send-to-btn:hover { background: var(--color-border-subtle) !important; }
.dex-send-to-item { background: transparent; transition: background 0.12s ease; }
.dex-send-to-item:hover { background: var(--color-border) !important; }`}</style>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Send to another app"
        title="Send To..."
        style={{
          background: open ? 'var(--color-border)' : 'transparent',
          border: '1px solid var(--color-border-subtle)',
          color: '#aaa',
          fontSize: '11px',
          padding: '4px 10px',
          borderRadius: '6px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          whiteSpace: 'nowrap',
          transition: 'background 0.15s, border-color 0.15s',
        }}
        className="dex-send-to-btn"
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M14 2L6 10M14 2l-4 12-2.5-5.5L2 4l12-2z"/>
        </svg>
        Send To
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '4px',
            minWidth: '180px',
            background: 'rgba(40,40,42,0.98)',
            border: '1px solid var(--color-border)',
            borderRadius: '10px',
            boxShadow: 'var(--pg-shadow-popover)',
            zIndex: 'var(--z-max)',
            padding: '4px',
            animation: 'dex-snap-in 0.15s ease-out',
          }}
        >
          <div style={{ padding: '6px 10px 4px', fontSize: '9px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>SEND TO APP</div>
          {targets.map(target => {
            const meta = APP_META[target];
            return (
              <div
                key={target}
                role="button"
                tabIndex={0}
                onClick={() => handleSend(target)}
                onKeyDown={e => { if (e.key === 'Enter') handleSend(target); }}
                style={{
                  padding: '7px 10px',
                  fontSize: '12px',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background 0.12s',
                }}
                className="dex-send-to-item"
              >
                {meta.icon}
                <span style={{ flex: 1 }}>{meta.label}</span>
                <span style={{ fontSize: '9px', color: meta.color, opacity: 0.7 }}>{assetKind}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default memo(SendToMenu);
export { useCreativeInbox };
export type { CreativeAppId, SharedAsset };
