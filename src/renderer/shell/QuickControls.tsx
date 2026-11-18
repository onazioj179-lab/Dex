// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX Platform -- Quick Controls
// Always-visible interactive pills in the dock status row for the controls
// the user reaches for most: network mode, microphone, camera, location.
// Each opens a 220px popover with the current state, a toggle, and a link
// to the Settings page where finer-grained controls live.
// ===========================================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useOverlay } from '../services/overlayStack';
import { useNetworkStore, NETWORK_MODE_LABELS, NETWORK_MODE_DESCRIPTIONS, type NetworkMode } from '../store/networkStore';
import {
  usePermissionStore,
  PERMISSION_LABELS,
  PERMISSION_DESCRIPTIONS,
  type PermissionId,
} from '../store/permissionStore';

// ---------------------------------------------------------------------------
// Icons (inline SVG, 12x12 baseline so they sit nicely at 22px buttons)
// ---------------------------------------------------------------------------
const ICON_SIZE = 12;

const NetworkOnIcon = (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.55a11 11 0 0 1 14.08 0" />
    <path d="M1.42 9a16 16 0 0 1 21.16 0" />
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
    <line x1="12" y1="20" x2="12.01" y2="20" />
  </svg>
);

const NetworkLocalIcon = (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M7 10h10M7 14h10" />
  </svg>
);

const NetworkOffIcon = (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
    <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
    <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
    <line x1="12" y1="20" x2="12.01" y2="20" />
  </svg>
);

const MicIcon = (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const CameraIcon = (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const LocationIcon = (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const networkIconFor = (mode: NetworkMode) => {
  if (mode === 'disabled') return NetworkOffIcon;
  if (mode === 'local-only') return NetworkLocalIcon;
  return NetworkOnIcon;
};

// ---------------------------------------------------------------------------
// Pill button
// ---------------------------------------------------------------------------
interface PillProps {
  active: boolean;
  warning?: boolean;
  title: string;
  ariaLabel: string;
  ariaExpanded: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  onMouseEnter?: () => void;
}

const Pill = React.forwardRef<HTMLButtonElement, PillProps>(({ active, warning, title, ariaLabel, ariaExpanded, icon, onClick }, ref) => {
  const baseColor = warning
    ? 'var(--color-warning, #ffb020)'
    : active
      ? 'var(--color-text-primary)'
      : 'var(--color-text-tertiary)';
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      aria-expanded={ariaExpanded}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 18, borderRadius: 4, padding: 0,
        background: ariaExpanded ? 'var(--color-border)' : 'transparent',
        border: 'none', cursor: 'pointer',
        color: baseColor,
        boxShadow: ariaExpanded ? 'var(--pg-shadow-chip)' : 'none',
        transition: 'background 0.15s ease, color 0.15s ease',
        position: 'relative',
        flexShrink: 0,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)'; }}
      onMouseLeave={e => { if (!ariaExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {icon}
      {warning && (
        <span style={{
          position: 'absolute', top: 2, right: 2,
          width: 5, height: 5, borderRadius: '50%',
          background: 'var(--color-warning, #ffb020)',
        }} />
      )}
    </button>
  );
});
Pill.displayName = 'QuickControlsPill';

// ---------------------------------------------------------------------------
// Popover shell
// ---------------------------------------------------------------------------
interface PopoverProps {
  anchorRect: DOMRect | null;
  onClose: () => void;
  children: React.ReactNode;
}

const Popover: React.FC<PopoverProps> = ({ anchorRect, onClose, children }) => {
  const ref = useRef<HTMLDivElement>(null);

  // Escape and outside clicks through the shared overlay stack (top-only).
  useOverlay(!!anchorRect, onClose, { ref });

  if (!anchorRect) return null;

  const POPOVER_WIDTH = 220;
  const POPOVER_GUTTER = 8;
  const TITLEBAR_CLEARANCE = 46;
  const idealLeft = anchorRect.left + (anchorRect.width / 2) - (POPOVER_WIDTH / 2);
  const maxLeft = Math.max(POPOVER_GUTTER, window.innerWidth - POPOVER_WIDTH - POPOVER_GUTTER);
  const left = Math.min(Math.max(idealLeft, POPOVER_GUTTER), maxLeft);
  const top = Math.max(TITLEBAR_CLEARANCE, anchorRect.bottom + 10);

  return (
    <div
      ref={ref}
      role="dialog"
      style={{
        position: 'fixed',
        top,
        left,
        width: POPOVER_WIDTH,
        maxWidth: `calc(100vw - ${POPOVER_GUTTER * 2}px)`,
        maxHeight: `calc(100vh - ${top + POPOVER_GUTTER}px)`,
        overflow: 'auto',
        zIndex: 'var(--z-popover, 9000)' as React.CSSProperties['zIndex'],
        background: 'var(--color-bg-elevated, #111111)',
        border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
        borderRadius: 10,
        boxShadow: 'var(--pg-shadow-popover)',
        padding: 10,
        animation: 'qcPop 0.12s ease-out',
      }}
    >
      <style>{`@keyframes qcPop { from { opacity: 0; transform: translateY(-4px) scale(0.98); } to { opacity: 1; transform: none; } }`}</style>
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Network mode popover content
// ---------------------------------------------------------------------------
const NetworkPopover: React.FC<{ onSettings: () => void }> = ({ onSettings }) => {
  const mode = useNetworkStore(s => s.mode);
  const blocked = useNetworkStore(s => s.blockedAttempts);
  const setMode = useNetworkStore(s => s.setMode);

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-primary)', textTransform: 'none', letterSpacing: '0.01em', marginBottom: 'var(--space-2)' }}>
        Network Mode
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 'var(--space-2)' }}>
        {(['full', 'local-only', 'disabled'] as NetworkMode[]).map(m => {
          const selected = m === mode;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)',
                background: selected ? 'var(--color-accent-muted, rgba(74,158,255,0.10))' : 'transparent',
                border: `1px solid ${selected ? 'color-mix(in srgb, var(--color-accent, #4A9EFF) 30%, transparent)' : 'transparent'}`,
                borderRadius: 4, padding: '6px var(--space-2)', cursor: 'pointer', textAlign: 'left',
                color: 'var(--color-text-primary)',
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover, rgba(255,255,255,0.04))'; }}
              onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{
                marginTop: 2, width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: selected ? 'var(--color-accent-fill)' : 'transparent',
                border: `1px solid ${selected ? 'var(--color-accent, #4A9EFF)' : 'var(--color-border)'}`,
              }} />
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {NETWORK_MODE_LABELS[m]}
                </span>
                <span style={{ display: 'block', fontSize: 10, color: 'var(--color-text-tertiary)', lineHeight: 1.4, marginTop: 2 }}>
                  {NETWORK_MODE_DESCRIPTIONS[m]}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border-subtle)', paddingTop: 'var(--space-2)' }}>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
          {blocked} blocked
        </span>
        <button
          type="button"
          onClick={onSettings}
          style={{
            background: 'transparent', border: 'none',
            color: 'var(--color-accent, #4A9EFF)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0,
          }}
        >
          Open Settings
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Permission popover content (mic / camera / location)
// ---------------------------------------------------------------------------
/**
 * Turn a DEX privacy permission on or off. Turning the microphone on also asks
 * the OS (and reports a denial); shared by the top-bar popover and Control
 * Center so both behave the same.
 */
export function usePermissionToggle(id: PermissionId) {
  const enabled = usePermissionStore(s => s.permissions[id].enabled);
  const setPermission = usePermissionStore(s => s.setPermission);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const toggle = useCallback(async () => {
    setNotice(null);
    if (enabled) {
      setPermission(id, false);
      if (id === 'microphone' && (window as any).speechSynthesis) {
        try { (window as any).speechSynthesis.cancel(); } catch { /* noop */ }
      }
      return;
    }

    if (id !== 'microphone') {
      setPermission(id, true);
      return;
    }

    setBusy(true);
    try {
      const granted = await (window as any).dex?.voice?.requestMicrophonePermission?.();
      if (granted === false) {
        setNotice('System microphone permission was denied.');
        setPermission(id, false);
      } else {
        setPermission(id, true);
        setNotice('Microphone is ready for UKI voice.');
      }
    } catch {
      setPermission(id, true);
      setNotice('Microphone permission is enabled in DEX.');
    } finally {
      setBusy(false);
    }
  }, [enabled, id, setPermission]);

  return { enabled, busy, notice, toggle };
}

const PermissionPopover: React.FC<{ id: PermissionId; onSettings: () => void }> = ({ id, onSettings }) => {
  const grantedAt = usePermissionStore(s => s.permissions[id].grantedAt);
  const { enabled, busy, notice, toggle: togglePermission } = usePermissionToggle(id);

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-primary)', textTransform: 'none', letterSpacing: '0.01em', marginBottom: 6 }}>
        {PERMISSION_LABELS[id]}
      </div>
      <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '0 0 10px', lineHeight: 1.45 }}>
        {PERMISSION_DESCRIPTIONS[id]}
      </p>
      <button
        type="button"
        onClick={togglePermission}
        disabled={busy}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: 'var(--space-2) 10px',
          background: enabled ? 'var(--color-accent-light)' : 'var(--color-bg-hover, rgba(255,255,255,0.03))',
          border: `1px solid ${enabled ? 'color-mix(in srgb, var(--color-accent) 30%, transparent)' : 'var(--color-border)'}`,
          borderRadius: 4, cursor: busy ? 'wait' : 'pointer',
          color: 'var(--color-text-primary)',
          marginBottom: 'var(--space-2)',
          opacity: busy ? 0.6 : 1,
          transition: 'background 0.12s, border-color 0.12s, opacity 0.12s',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600 }}>
          {busy ? 'Checking...' : enabled ? 'Granted' : 'Not granted'}
        </span>
        <span style={{
          width: 28, height: 16, borderRadius: 10,
          background: enabled ? 'var(--color-accent)' : 'var(--color-border)',
          position: 'relative', transition: 'background 0.15s',
        }}>
          <span style={{
            position: 'absolute', top: 2, left: enabled ? 14 : 2,
            width: 12, height: 12, borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.15s',
            boxShadow: 'var(--pg-shadow-chip)',
          }} />
        </span>
      </button>
      {notice && (
        <div style={{ fontSize: 10, color: enabled ? 'var(--color-success)' : 'var(--color-warning)', lineHeight: 1.35, margin: '0 0 var(--space-2)' }}>
          {notice}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border-subtle)', paddingTop: 'var(--space-2)' }}>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
          {grantedAt ? `Granted ${new Date(grantedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Off by default'}
        </span>
        <button
          type="button"
          onClick={onSettings}
          style={{
            background: 'transparent', border: 'none',
            color: 'var(--color-accent, #4A9EFF)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0,
          }}
        >
          Open Settings
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------
export interface QuickControlsProps {
  /** Called when the user clicks "Open Settings" inside any popover. */
  onOpenSettings?: (section?: 'network' | 'permissions') => void;
}

type OpenKey = 'network' | PermissionId | null;

export const QuickControls: React.FC<QuickControlsProps> = ({ onOpenSettings }) => {
  const [open, setOpen] = useState<OpenKey>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const networkMode = useNetworkStore(s => s.mode);
  const networkRefresh = useNetworkStore(s => s.refresh);
  const micEnabled = usePermissionStore(s => s.permissions.microphone.enabled);
  const cameraEnabled = usePermissionStore(s => s.permissions.camera.enabled);
  const gpsEnabled = usePermissionStore(s => s.permissions.gps.enabled);

  useEffect(() => { networkRefresh(); }, [networkRefresh]);

  const syncAnchor = useCallback((key: Exclude<OpenKey, null>) => {
    const el = refs.current[key];
    if (!el) {
      setAnchor(null);
      return;
    }
    setAnchor(el.getBoundingClientRect());
  }, []);

  const togglePop = useCallback((key: Exclude<OpenKey, null>) => {
    if (open === key) { setOpen(null); setAnchor(null); return; }
    syncAnchor(key);
    setOpen(key);
  }, [open, syncAnchor]);

  useEffect(() => {
    if (!open) return;

    const updateAnchor = () => {
      syncAnchor(open);
    };

    updateAnchor();
    window.addEventListener('resize', updateAnchor);
    window.addEventListener('scroll', updateAnchor, true);
    return () => {
      window.removeEventListener('resize', updateAnchor);
      window.removeEventListener('scroll', updateAnchor, true);
    };
  }, [open, syncAnchor]);

  const close = useCallback(() => { setOpen(null); setAnchor(null); }, []);

  const goSettings = useCallback((section?: 'network' | 'permissions') => {
    onOpenSettings?.(section);
    close();
  }, [onOpenSettings, close]);

  const networkOff = networkMode !== 'full';
  // Status icons appear only when there is something to report: a restricted
  // network, or a privacy permission that is on (a live "in use" cue). The
  // default state needs no icon; Control Center holds every control. An icon
  // also stays while its own popover is open so the popover keeps its anchor.
  const show = (key: Exclude<OpenKey, null>, notable: boolean) => notable || open === key;
  if (!show('network', networkOff) && !show('microphone', micEnabled) && !show('camera', cameraEnabled) && !show('gps', gpsEnabled)) return null;

  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 0, flexShrink: 0 }}
      onMouseLeave={() => { /* stay open until click outside */ }}
    >
      {show('network', networkOff) && <Pill
        ref={el => { refs.current['network'] = el; }}
        active
        warning={networkOff}
        title={`Network: ${NETWORK_MODE_LABELS[networkMode]}`}
        ariaLabel={`Network mode: ${NETWORK_MODE_LABELS[networkMode]}. Click to change.`}
        ariaExpanded={open === 'network'}
        icon={networkIconFor(networkMode)}
        onClick={() => togglePop('network')}
      />}
      {show('microphone', micEnabled) && <Pill
        ref={el => { refs.current['microphone'] = el; }}
        active={micEnabled}
        warning={micEnabled}
        title={`Microphone: ${micEnabled ? 'On' : 'Off'}`}
        ariaLabel={`Microphone permission ${micEnabled ? 'on' : 'off'}. Click to change.`}
        ariaExpanded={open === 'microphone'}
        icon={MicIcon}
        onClick={() => togglePop('microphone')}
      />}
      {show('camera', cameraEnabled) && <Pill
        ref={el => { refs.current['camera'] = el; }}
        active={cameraEnabled}
        warning={cameraEnabled}
        title={`Camera: ${cameraEnabled ? 'On' : 'Off'}`}
        ariaLabel={`Camera permission ${cameraEnabled ? 'on' : 'off'}. Click to change.`}
        ariaExpanded={open === 'camera'}
        icon={CameraIcon}
        onClick={() => togglePop('camera')}
      />}
      {show('gps', gpsEnabled) && <Pill
        ref={el => { refs.current['gps'] = el; }}
        active={gpsEnabled}
        warning={gpsEnabled}
        title={`Location: ${gpsEnabled ? 'On' : 'Off'}`}
        ariaLabel={`Location permission ${gpsEnabled ? 'on' : 'off'}. Click to change.`}
        ariaExpanded={open === 'gps'}
        icon={LocationIcon}
        onClick={() => togglePop('gps')}
      />}
      {open === 'network' && (
        <Popover anchorRect={anchor} onClose={close}>
          <NetworkPopover onSettings={() => goSettings('network')} />
        </Popover>
      )}
      {open && open !== 'network' && (
        <Popover anchorRect={anchor} onClose={close}>
          <PermissionPopover id={open} onSettings={() => goSettings('permissions')} />
        </Popover>
      )}
    </span>
  );
};

export default QuickControls;
