// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Control Center
 * Premium right-side glass panel of system controls, inspired by
 * macOS / visionOS / iPadOS control centers but uniquely DEX:
 * monochrome glass, accent color reserved for active/on states only.
 *
 * Self-managing: toggles open in response to the window CustomEvent
 * `dex-toggle-control-center`. Every control here drives a REAL backend
 * (existing Zustand stores, services, or browser APIs) -- nothing is faked.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { isReduceMotion } from '../utils/MotionController';
import { useNetworkStore, NETWORK_MODE_LABELS, type NetworkMode } from '../store/networkStore';
import { useShellPreferences, type GlassMode } from '../store/shellPreferencesStore';
import { useNotificationCenterStore } from '../store/unifiedSystemsStore';
import {
  getStoredTier,
  setManualOverride,
  isManualOverride,
  getTierLabel,
  ALL_TIERS,
  type DeviceTier,
} from '../services/TierManager';

// ---------------------------------------------------------------------------
// Brightness dimmer -- a genuine full-screen renderer dimmer.
// A black overlay (pointer-events:none) painted above every surface; its
// opacity is driven by a saved brightness value (50-100%). 100% = no dim.
// This actually darkens the whole UI, so it is not a fake control.
// ---------------------------------------------------------------------------

const BRIGHTNESS_KEY = 'dex-control-center-brightness';
const BRIGHTNESS_OVERLAY_ID = 'dex-brightness-dimmer';
const MIN_BRIGHTNESS = 50;

function clampBrightness(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(MIN_BRIGHTNESS, Math.min(100, Math.round(value)));
}

function loadBrightness(): number {
  try {
    const raw = localStorage.getItem(BRIGHTNESS_KEY);
    if (raw == null) return 100;
    return clampBrightness(parseFloat(raw));
  } catch {
    return 100;
  }
}

/** Paint (or update) the dimmer overlay so the screen visibly darkens. */
function applyBrightness(value: number): void {
  if (typeof document === 'undefined') return;
  const pct = clampBrightness(value);
  // 100% brightness -> 0 dim opacity; 50% brightness -> 0.5 dim opacity.
  const dim = (100 - pct) / 100;
  let el = document.getElementById(BRIGHTNESS_OVERLAY_ID) as HTMLDivElement | null;
  if (dim <= 0) {
    if (el) el.style.opacity = '0';
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.id = BRIGHTNESS_OVERLAY_ID;
    el.setAttribute('aria-hidden', 'true');
    // Above every DEX surface (including this panel) so the dim is global.
    // pointer-events:none keeps it purely visual -- it never blocks clicks.
    el.style.cssText = [
      'position:fixed',
      'inset:0',
      'background:#000',
      'pointer-events:none',
      'z-index:2147483646',
      'transition:opacity 0.18s ease',
    ].join(';');
    document.body.appendChild(el);
  }
  el.style.opacity = String(dim);
}

function saveBrightness(value: number): void {
  const pct = clampBrightness(value);
  try {
    localStorage.setItem(BRIGHTNESS_KEY, String(pct));
  } catch {
    /* quota / sandbox -- the live overlay still applies */
  }
  applyBrightness(pct);
}

// Apply any saved brightness as soon as this module loads so a dimmed screen
// survives reloads even before the panel is opened.
applyBrightness(loadBrightness());

// ---------------------------------------------------------------------------
// Module ordering -- persisted, reorderable.
// ---------------------------------------------------------------------------

const ORDER_KEY = 'dex-control-center-order-v1';
type ModuleId = 'network' | 'appearance' | 'nightShift' | 'brightness' | 'dnd' | 'performance' | 'battery';

const DEFAULT_ORDER: ModuleId[] = [
  'network',
  'appearance',
  'nightShift',
  'brightness',
  'dnd',
  'performance',
  'battery',
];

function loadOrder(): ModuleId[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (!raw) return [...DEFAULT_ORDER];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_ORDER];
    const valid = parsed.filter((id): id is ModuleId => DEFAULT_ORDER.includes(id as ModuleId));
    // Append any modules added since the order was saved, preserving stored order.
    for (const id of DEFAULT_ORDER) if (!valid.includes(id)) valid.push(id);
    return valid;
  } catch {
    return [...DEFAULT_ORDER];
  }
}

function saveOrder(order: ModuleId[]): void {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Battery (read-only) -- Web Battery API, guarded for absence, mirrors the
// pattern in components/HomeWidgets.tsx BatteryWidget.
// ---------------------------------------------------------------------------

interface BatteryInfo {
  supported: boolean;
  level: number;
  charging: boolean;
}

function useBattery(active: boolean): BatteryInfo {
  const [info, setInfo] = useState<BatteryInfo>({ supported: true, level: 100, charging: false });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let batteryRef: any = null;
    let onChange: (() => void) | null = null;

    const read = (bat: any) => {
      if (cancelled) return;
      setInfo({ supported: true, level: Math.round((bat.level ?? 1) * 100), charging: !!bat.charging });
    };

    const nav = navigator as any;
    if (typeof nav.getBattery === 'function') {
      nav.getBattery().then((bat: any) => {
        if (cancelled) return;
        batteryRef = bat;
        onChange = () => read(bat);
        read(bat);
        bat.addEventListener?.('levelchange', onChange);
        bat.addEventListener?.('chargingchange', onChange);
      }).catch(() => {
        if (!cancelled) setInfo((p) => ({ ...p, supported: false }));
      });
    } else {
      setInfo((p) => ({ ...p, supported: false }));
    }

    return () => {
      cancelled = true;
      if (batteryRef && onChange) {
        batteryRef.removeEventListener?.('levelchange', onChange);
        batteryRef.removeEventListener?.('chargingchange', onChange);
      }
    };
  }, [active]);

  return info;
}

// ---------------------------------------------------------------------------
// Shared visual primitives (monochrome; accent only for active/on).
// ---------------------------------------------------------------------------

const ACCENT = 'var(--color-accent)';
const ACCENT_SOFT = 'var(--color-accent-light)';

const tileStyle: React.CSSProperties = {
  background: 'var(--color-bg-surface, rgba(255,255,255,0.04))',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-lg, 12px)',
  padding: 'var(--space-3, 12px)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minWidth: 0,
};

const tileLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
  color: 'var(--color-text-tertiary)',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const Segmented = <T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) => (
  <div
    role="radiogroup"
    aria-label={ariaLabel}
    style={{
      display: 'flex',
      gap: 2,
      padding: 2,
      borderRadius: 'var(--radius-md, 8px)',
      background: 'var(--color-bg-hover)',
      border: '1px solid var(--color-border-subtle)',
    }}
  >
    {options.map((opt) => {
      const on = opt.id === value;
      return (
        <button
          key={opt.id}
          role="radio"
          aria-checked={on}
          onClick={() => onChange(opt.id)}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '6px 4px',
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 'var(--radius-sm, 6px)',
            border: '1px solid ' + (on ? ACCENT : 'transparent'),
            background: on ? ACCENT_SOFT : 'transparent',
            color: on ? ACCENT : 'var(--color-text-secondary)',
            cursor: 'pointer',
            transition: 'background 0.12s ease, color 0.12s ease, border-color 0.12s ease',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

const Toggle = ({
  on,
  onClick,
  ariaLabel,
}: {
  on: boolean;
  onClick: () => void;
  ariaLabel: string;
}) => (
  <button
    role="switch"
    aria-checked={on}
    aria-label={ariaLabel}
    onClick={onClick}
    style={{
      width: 40,
      height: 24,
      flexShrink: 0,
      borderRadius: 999,
      border: '1px solid ' + (on ? ACCENT : 'var(--color-border)'),
      background: on ? ACCENT : 'var(--color-bg-hover)',
      position: 'relative',
      cursor: 'pointer',
      padding: 0,
      transition: 'background 0.15s ease, border-color 0.15s ease',
    }}
  >
    <span
      style={{
        position: 'absolute',
        top: 2,
        left: on ? 18 : 2,
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.15s cubic-bezier(0.23,1,0.32,1)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
      }}
    />
  </button>
);

const ReorderButtons = ({
  onUp,
  onDown,
  canUp,
  canDown,
}: {
  onUp: () => void;
  onDown: () => void;
  canUp: boolean;
  canDown: boolean;
}) => {
  const btn = (enabled: boolean): React.CSSProperties => ({
    width: 20,
    height: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: 4,
    cursor: enabled ? 'pointer' : 'default',
    opacity: enabled ? 0.55 : 0.18,
    color: 'var(--color-text-secondary)',
    padding: 0,
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 'auto', gap: 0 }}>
      <button style={btn(canUp)} disabled={!canUp} onClick={onUp} aria-label="Move module up" title="Move up">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
      </button>
      <button style={btn(canDown)} disabled={!canDown} onClick={onDown} aria-label="Move module down" title="Move down">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Module header row (label + optional reorder controls).
// ---------------------------------------------------------------------------

const ModuleShell = ({
  label,
  icon,
  reorder,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  reorder?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div style={tileStyle}>
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <span style={tileLabelStyle}>
        {icon}
        {label}
      </span>
      {reorder}
    </div>
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Main component.
// ---------------------------------------------------------------------------

const PANEL_WIDTH = 360;

const ControlCenter: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<ModuleId[]>(() => loadOrder());
  const [brightness, setBrightnessState] = useState<number>(() => loadBrightness());
  const reduceMotion = isReduceMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Stores
  const networkMode = useNetworkStore((s) => s.mode);
  const setNetworkMode = useNetworkStore((s) => s.setMode);
  const refreshNetwork = useNetworkStore((s) => s.refresh);

  const glassMode = useShellPreferences((s) => s.glassMode);
  const setGlassMode = useShellPreferences((s) => s.setGlassMode);
  const nightShift = useShellPreferences((s) => s.nightShift);
  const setNightShift = useShellPreferences((s) => s.setNightShift);

  const dnd = useNotificationCenterStore((s) => s.doNotDisturb);
  const setDnd = useNotificationCenterStore((s) => s.setDoNotDisturb);

  // Performance tier (read; switchable via the manual-override setter).
  const [tier, setTier] = useState<DeviceTier | null>(() => getStoredTier());
  const [tierManual, setTierManual] = useState<boolean>(() => isManualOverride());

  const battery = useBattery(open);

  // Listen for the global toggle event.
  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    window.addEventListener('dex-toggle-control-center', toggle);
    return () => window.removeEventListener('dex-toggle-control-center', toggle);
  }, []);

  // On open: pull fresh network state, focus the filter, and close on Escape.
  useEffect(() => {
    if (!open) return;
    void refreshNetwork();
    setTier(getStoredTier());
    setTierManual(isManualOverride());
    const id = window.setTimeout(() => searchRef.current?.focus(), reduceMotion ? 0 : 180);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, refreshNetwork, reduceMotion]);

  const move = useCallback((id: ModuleId, dir: -1 | 1) => {
    setOrder((prev) => {
      const idx = prev.indexOf(id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(next, 0, item);
      saveOrder(copy);
      return copy;
    });
  }, []);

  const onBrightness = useCallback((value: number) => {
    const pct = clampBrightness(value);
    setBrightnessState(pct);
    saveBrightness(pct);
  }, []);

  const applyTier = useCallback((next: DeviceTier) => {
    setManualOverride(next);
    setTier(next);
    setTierManual(true);
  }, []);

  // Module render registry. Each entry carries its searchable name + node.
  const modules = useMemo(() => {
    const reorderFor = (id: ModuleId) => {
      const visibleIndex = order.indexOf(id);
      return (
        <ReorderButtons
          onUp={() => move(id, -1)}
          onDown={() => move(id, 1)}
          canUp={visibleIndex > 0}
          canDown={visibleIndex >= 0 && visibleIndex < order.length - 1}
        />
      );
    };

    const registry: Record<ModuleId, { name: string; node: React.ReactNode }> = {
      network: {
        name: 'Network Connection Mode Offline',
        node: (
          <ModuleShell
            key="network"
            label="Network"
            reorder={reorderFor('network')}
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13a10 10 0 0 1 14 0" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><line x1="12" y1="20" x2="12" y2="20" /></svg>
            }
          >
            <Segmented<NetworkMode>
              ariaLabel="Network mode"
              value={networkMode}
              onChange={(m) => void setNetworkMode(m)}
              options={[
                { id: 'full', label: 'Full' },
                { id: 'local-only', label: 'Local' },
                { id: 'disabled', label: 'Off' },
              ]}
            />
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {NETWORK_MODE_LABELS[networkMode]}
            </span>
          </ModuleShell>
        ),
      },
      appearance: {
        name: 'Appearance Liquid Glass Material Transparency',
        node: (
          <ModuleShell
            key="appearance"
            label="Liquid Glass"
            reorder={reorderFor('appearance')}
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 9h18M9 21V9" /></svg>
            }
          >
            <Segmented<GlassMode>
              ariaLabel="Liquid glass mode"
              value={glassMode}
              onChange={(m) => setGlassMode(m)}
              options={[
                { id: 'off', label: 'Off' },
                { id: 'reduced', label: 'Low' },
                { id: 'normal', label: 'On' },
                { id: 'liquid', label: 'Liquid' },
              ]}
            />
          </ModuleShell>
        ),
      },
      nightShift: {
        name: 'Night Shift Warm Color Temperature',
        node: (
          <ModuleShell
            key="nightShift"
            label="Night Shift"
            reorder={reorderFor('nightShift')}
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            }
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {nightShift ? 'Warm filter on' : 'Off'}
              </span>
              <Toggle on={nightShift} onClick={() => setNightShift(!nightShift)} ariaLabel="Toggle Night Shift" />
            </div>
          </ModuleShell>
        ),
      },
      brightness: {
        name: 'Brightness Screen Dimmer Display',
        node: (
          <ModuleShell
            key="brightness"
            label="Brightness"
            reorder={reorderFor('brightness')}
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>
            }
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="range"
                min={MIN_BRIGHTNESS}
                max={100}
                step={1}
                value={brightness}
                onChange={(e) => onBrightness(parseInt(e.target.value, 10))}
                aria-label="Screen brightness"
                style={{ flex: 1, accentColor: 'var(--color-accent)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', minWidth: 36, textAlign: 'right' }}>
                {brightness}%
              </span>
            </div>
          </ModuleShell>
        ),
      },
      dnd: {
        name: 'Do Not Disturb Notifications Focus Silence',
        node: (
          <ModuleShell
            key="dnd"
            label="Do Not Disturb"
            reorder={reorderFor('dnd')}
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /><line x1="3" y1="3" x2="21" y2="21" /></svg>
            }
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {dnd ? 'Notifications silenced' : 'Notifications on'}
              </span>
              <Toggle on={dnd} onClick={() => void setDnd(!dnd)} ariaLabel="Toggle Do Not Disturb" />
            </div>
          </ModuleShell>
        ),
      },
      performance: {
        name: 'Performance Tier Graphics Quality Power',
        node: (
          <ModuleShell
            key="performance"
            label="Performance"
            reorder={reorderFor('performance')}
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            }
          >
            <Segmented<DeviceTier>
              ariaLabel="Performance tier"
              value={(tier ?? 'mid') as DeviceTier}
              onChange={(t) => applyTier(t)}
              options={ALL_TIERS.map((t) => ({ id: t, label: getTierLabel(t) }))}
            />
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {tier ? `Tier: ${getTierLabel(tier)}` : 'Auto-detecting'}
              {tierManual ? ' (manual)' : ' (auto)'}
            </span>
          </ModuleShell>
        ),
      },
      battery: {
        name: 'Battery Power Charge Level',
        node: (
          <ModuleShell
            key="battery"
            label="Battery"
            reorder={reorderFor('battery')}
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="6" width="18" height="12" rx="2" /><line x1="23" y1="13" x2="23" y2="11" /></svg>
            }
          >
            {battery.supported ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ position: 'relative', width: 36, height: 16, borderRadius: 3, border: '1px solid var(--color-text-tertiary)', display: 'flex', alignItems: 'center', padding: 1.5 }}>
                  <div style={{ height: '100%', width: `${battery.level}%`, borderRadius: 1.5, background: battery.level > 20 ? 'var(--color-success)' : 'var(--color-error)', transition: 'width 0.3s ease' }} />
                  <div style={{ position: 'absolute', right: -3, top: '50%', transform: 'translateY(-50%)', width: 2, height: 6, borderRadius: '0 1px 1px 0', background: 'var(--color-text-tertiary)' }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{battery.level}%</span>
                {battery.charging && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--color-success)' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                    Charging
                  </span>
                )}
              </div>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Battery status unavailable on this device</span>
            )}
          </ModuleShell>
        ),
      },
    };
    return registry;
  }, [order, move, networkMode, setNetworkMode, glassMode, setGlassMode, nightShift, setNightShift, brightness, onBrightness, dnd, setDnd, tier, tierManual, applyTier, battery]);

  const q = query.trim().toLowerCase();
  const visible = order.filter((id) => {
    if (!q) return true;
    return modules[id].name.toLowerCase().includes(q);
  });

  if (!open) return null;

  const transition = reduceMotion ? 'none' : 'transform 0.26s cubic-bezier(0.23,1,0.32,1), opacity 0.2s ease';

  return (
    <>
      {/* Click-away scrim */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'var(--z-overlay, 7000)',
          background: 'transparent',
        }}
      />
      {/* Sliding glass panel */}
      <div
        ref={panelRef}
        className="dex-liquid-glass-strong"
        role="dialog"
        aria-label="Control Center"
        style={{
          position: 'fixed',
          top: 30,
          right: 8,
          bottom: 8,
          width: PANEL_WIDTH,
          maxWidth: 'calc(100vw - 16px)',
          zIndex: 'calc(var(--z-overlay, 7000) + 1)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border-subtle)',
          boxShadow: 'var(--pg-shadow-modal, 0 24px 64px rgba(0,0,0,0.5))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transform: 'translateX(0)',
          transition,
          animation: reduceMotion ? 'none' : 'dexControlCenterIn 0.26s cubic-bezier(0.23,1,0.32,1)',
        }}
      >
        <style>{`@keyframes dexControlCenterIn { from { transform: translateX(${PANEL_WIDTH + 16}px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

        {/* Header + filter */}
        <div style={{ padding: '14px 14px 10px', display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.01em', color: 'var(--color-text-primary)' }}>Control Center</span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close Control Center"
              style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'var(--color-text-secondary)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter controls"
            aria-label="Filter controls"
            spellCheck={false}
            style={{
              width: '100%',
              padding: '7px 10px',
              fontSize: 12,
              borderRadius: 'var(--radius-md, 8px)',
              border: '1px solid var(--color-border-subtle)',
              background: 'var(--color-bg-hover)',
              color: 'var(--color-text-primary)',
              outline: 'none',
            }}
          />
        </div>

        {/* Modules */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.length === 0 ? (
            <div style={{ padding: '24px 8px', textAlign: 'center', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              No controls match &ldquo;{query}&rdquo;
            </div>
          ) : (
            visible.map((id) => <React.Fragment key={id}>{modules[id].node}</React.Fragment>)
          )}
        </div>
      </div>
    </>
  );
};

export default ControlCenter;
