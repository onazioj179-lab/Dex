// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Control Center
 * Right-side system-controls panel. Redesigned 2026-07 to match the OS-wide
 * consistency direction:
 *   - SOLID (no glass), sharp, monochrome; accent reserved for active/on states.
 *   - A compact QUICK-TOGGLE grid on top for the instant on/off controls.
 *   - COLLAPSIBLE sections below for the detailed controls; collapse state is
 *     persisted, so the panel folds down to exactly what the user cares about.
 *   - No more per-tile up/down reorder arrows (visual clutter); fold instead.
 *
 * Self-managing: toggles open in response to the window CustomEvent
 * `dex-toggle-control-center`. Every control drives a REAL backend (existing
 * Zustand stores, services, or browser APIs) — nothing is faked.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { isReduceMotion } from '../utils/MotionController';
import { useNetworkStore, NETWORK_MODE_LABELS, type NetworkMode } from '../store/networkStore';
import { useShellPreferences } from '../store/shellPreferencesStore';
import { InterfaceTransparencySlider } from './InterfaceTransparencySlider';
import { useNotificationCenterStore } from '../store/unifiedSystemsStore';
import { setSoundEnabled, isSoundEnabled, subscribeSoundEnabled } from '../shell/SpatialAudio';
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';
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
// Collapsible-section state -- persisted. Each section can fold to just its
// header, and the panel remembers what the user folded away.
// ---------------------------------------------------------------------------

const COLLAPSE_KEY = 'dex-control-center-collapsed-v2';
type SectionId = 'sound' | 'network' | 'display' | 'performance' | 'battery';

function loadCollapsed(): Set<SectionId> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is SectionId =>
      id === 'sound' || id === 'network' || id === 'display' || id === 'performance' || id === 'battery'));
  } catch {
    return new Set();
  }
}

function saveCollapsed(set: Set<SectionId>): void {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set]));
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
      // Chromium reports a desktop with no battery as permanently full and
      // charging with an infinite discharge time; treat that as "no battery".
      const noBattery = bat.charging && bat.level === 1 && bat.chargingTime === 0 && bat.dischargingTime === Infinity;
      setInfo({ supported: !noBattery, level: Math.round((bat.level ?? 1) * 100), charging: !!bat.charging });
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

// NB: longhands only (backgroundColor + borderWidth/Style/Color), never the
// `background`/`border` shorthands. QuickTile spreads this and then overrides
// backgroundColor/borderColor for its on-state; mixing a shorthand here with a
// longhand override makes React null out the un-mentioned longhands (the on-state
// accent silently fell back to the base surface). Longhands compose cleanly.
const surfaceStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-surface, rgba(255,255,255,0.04))',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'var(--color-border-subtle)',
  borderRadius: 'var(--radius-lg, 12px)',
  minWidth: 0,
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

// ---------------------------------------------------------------------------
// Quick toggle tile -- big tap target for instant on/off controls. Lights up
// with the accent fill when on, like a real control-center chip.
// ---------------------------------------------------------------------------

const QuickTile = ({
  on,
  label,
  state,
  icon,
  onClick,
}: {
  on: boolean;
  label: string;
  state: string;
  icon: React.ReactNode;
  onClick: () => void;
}) => (
  <button
    role="switch"
    aria-checked={on}
    aria-label={`${label}: ${state}`}
    onClick={onClick}
    style={{
      ...surfaceStyle,
      textAlign: 'left',
      padding: 'var(--space-3, 12px)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      cursor: 'pointer',
      backgroundColor: on ? ACCENT_SOFT : (surfaceStyle.backgroundColor as string),
      borderColor: on ? ACCENT : 'var(--color-border-subtle)',
      transition: 'background-color 0.14s ease, border-color 0.14s ease',
    }}
  >
    <span
      aria-hidden="true"
      style={{
        width: 30,
        height: 30,
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: on ? ACCENT : 'var(--color-bg-hover)',
        color: on ? 'var(--color-accent-text, #fff)' : 'var(--color-text-secondary)',
        transition: 'background 0.14s ease, color 0.14s ease',
      }}
    >
      {icon}
    </span>
    <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <span style={{ fontSize: 11, color: on ? ACCENT : 'var(--color-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{state}</span>
    </span>
  </button>
);

// ---------------------------------------------------------------------------
// Main component.
// ---------------------------------------------------------------------------

const PANEL_WIDTH = 360;

const ccFooterBtn: React.CSSProperties = {
  flex: 1, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--color-border-subtle)',
  background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)', fontSize: 12, cursor: 'pointer',
};
const ccBadge: React.CSSProperties = {
  minWidth: 16, height: 16, padding: '0 5px', borderRadius: 10, background: 'var(--color-accent)',
  color: '#fff', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

const ControlCenter: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<SectionId>>(() => loadCollapsed());
  const [brightness, setBrightnessState] = useState<number>(() => loadBrightness());
  const reduceMotion = isReduceMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Stores
  const networkMode = useNetworkStore((s) => s.mode);
  const setNetworkMode = useNetworkStore((s) => s.setMode);
  const refreshNetwork = useNetworkStore((s) => s.refresh);

  const nightShift = useShellPreferences((s) => s.nightShift);
  const setNightShift = useShellPreferences((s) => s.setNightShift);

  const dnd = useNotificationCenterStore((s) => s.doNotDisturb);
  const setDnd = useNotificationCenterStore((s) => s.setDoNotDisturb);

  // Performance tier (read; switchable via the manual-override setter).
  const [tier, setTier] = useState<DeviceTier | null>(() => getStoredTier());
  const [tierManual, setTierManual] = useState<boolean>(() => isManualOverride());

  const battery = useBattery(open);

  // Sound: DEX output volume (applied by the shell to every media element and
  // Web Audio graph) and UI sounds. The shell owns the value; we mirror it.
  const [volume, setVolume] = useState<number>(() => {
    try { const v = Number(localStorage.getItem('dex-system-volume') ?? '80'); return Number.isFinite(v) ? v : 80; } catch { return 80; }
  });
  useEffect(() => {
    const on = (e: Event) => { const f = Number((e as CustomEvent<number>).detail); if (Number.isFinite(f)) setVolume(Math.round(f * 100)); };
    window.addEventListener('dex-system-volume', on);
    return () => window.removeEventListener('dex-system-volume', on);
  }, []);
  const onVolume = useCallback((v: number) => {
    setVolume(v);
    window.dispatchEvent(new CustomEvent('dex-set-system-volume', { detail: v }));
  }, []);
  const uiSounds = useSyncExternalStore(subscribeSoundEnabled, isSoundEnabled);
  const unread = useNotificationCenterStore((s) => s.unreadCount);
  const launchApp = useRunningApps((s) => s.launchApp);
  const openSettings = useCallback(() => {
    const def = APP_DEFINITIONS.settings;
    if (def) launchApp({ id: 'settings', name: def.name, icon: def.icon, color: def.color });
    setOpen(false);
  }, [launchApp]);
  const openNotifications = useCallback(() => {
    window.dispatchEvent(new CustomEvent('dex-open-notification-center'));
    setOpen(false);
  }, []);

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

  const toggleSection = useCallback((id: SectionId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveCollapsed(next);
      return next;
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

  const q = query.trim().toLowerCase();
  const matches = useCallback((name: string) => !q || name.toLowerCase().includes(q), [q]);
  // While filtering, sections force-expand so the matched control is visible.
  const isOpen = useCallback((id: SectionId) => (q ? true : !collapsed.has(id)), [q, collapsed]);

  // Quick toggles (instant on/off). Searchable by their descriptive names.
  const quick = useMemo(() => ([
    {
      key: 'nightShift',
      name: 'Night Shift Warm Color Temperature Display',
      node: (
        <QuickTile
          key="nightShift"
          on={nightShift}
          label="Night Shift"
          state={nightShift ? 'On' : 'Off'}
          onClick={() => setNightShift(!nightShift)}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>}
        />
      ),
    },
    {
      key: 'dnd',
      name: 'Do Not Disturb Notifications Focus Silence',
      node: (
        <QuickTile
          key="dnd"
          on={dnd}
          label="Do Not Disturb"
          state={dnd ? 'Silenced' : 'Off'}
          onClick={() => void setDnd(!dnd)}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /><line x1="3" y1="3" x2="21" y2="21" /></svg>}
        />
      ),
    },
  ]), [nightShift, setNightShift, dnd, setDnd]);
  const visibleQuick = quick.filter((t) => matches(t.name));

  // Detailed sections (collapsible). Each carries a searchable name.
  const sections = useMemo(() => ([
    {
      id: 'network' as SectionId,
      name: 'Network Connection Mode Offline Local Full',
      node: (
        <CollapsibleSection
          key="network"
          label="Network"
          collapsed={!isOpen('network')}
          onToggle={() => toggleSection('network')}
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13a10 10 0 0 1 14 0" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><line x1="12" y1="20" x2="12" y2="20" /></svg>}
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
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{NETWORK_MODE_LABELS[networkMode]}</span>
        </CollapsibleSection>
      ),
    },
    {
      id: 'sound' as SectionId,
      name: 'Sound Volume Audio UI Sounds Spatial',
      node: (
        <CollapsibleSection
          key="sound"
          label="Sound"
          collapsed={!isOpen('sound')}
          onToggle={() => toggleSection('sound')}
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>}
        >
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Volume</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={volume}
              onChange={(e) => onVolume(parseInt(e.target.value, 10))}
              aria-label="DEX volume"
              style={{ flex: 1, accentColor: 'var(--color-accent)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{volume}%</span>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: 'var(--color-text-primary)', cursor: 'pointer' }}>
            Interface sounds
            <input
              type="checkbox"
              role="switch"
              checked={uiSounds}
              onChange={(e) => setSoundEnabled(e.target.checked)}
              aria-label="Interface sounds"
              style={{ accentColor: 'var(--color-accent)', width: 16, height: 16, cursor: 'pointer' }}
            />
          </label>
        </CollapsibleSection>
      ),
    },
    {
      id: 'display' as SectionId,
      name: 'Display Brightness Screen Dimmer Liquid Glass Material Transparency Appearance',
      node: (
        <CollapsibleSection
          key="display"
          label="Display"
          collapsed={!isOpen('display')}
          onToggle={() => toggleSection('display')}
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>}
        >
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Brightness</span>
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
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', minWidth: 36, textAlign: 'right' }}>{brightness}%</span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>Interface transparency</span>
          <InterfaceTransparencySlider compact />
        </CollapsibleSection>
      ),
    },
    {
      id: 'performance' as SectionId,
      name: 'Performance Tier Graphics Quality Power',
      node: (
        <CollapsibleSection
          key="performance"
          label="Performance"
          collapsed={!isOpen('performance')}
          onToggle={() => toggleSection('performance')}
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg>}
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
        </CollapsibleSection>
      ),
    },
    {
      id: 'battery' as SectionId,
      name: 'Battery Power Charge Level',
      node: (
        <CollapsibleSection
          key="battery"
          label="Battery"
          collapsed={!isOpen('battery')}
          onToggle={() => toggleSection('battery')}
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="6" width="18" height="12" rx="2" /><line x1="23" y1="13" x2="23" y2="11" /></svg>}
        >
          {battery.supported ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative', width: 36, height: 16, borderRadius: 4, border: '1px solid var(--color-text-tertiary)', display: 'flex', alignItems: 'center', padding: 1.5 }}>
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
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No battery detected on this device</span>
          )}
        </CollapsibleSection>
      ),
    },
  ]), [isOpen, toggleSection, networkMode, setNetworkMode, brightness, onBrightness, tier, tierManual, applyTier, battery, volume, onVolume, uiSounds]);
  const visibleSections = sections.filter((s) => matches(s.name));

  if (!open) return null;

  const transition = reduceMotion ? 'none' : 'transform 0.26s cubic-bezier(0.23,1,0.32,1), opacity 0.2s ease';
  const nothingMatches = q !== '' && visibleQuick.length === 0 && visibleSections.length === 0;

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
      {/* Sliding panel (solid; goes glass only if the user opts glass back on) */}
      <div
        ref={panelRef}
        className="dex-liquid-glass-strong"
        role="dialog"
        aria-label="Control Center"
        style={{
          position: 'fixed',
          top: 40,
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

        {/* Body: quick toggles grid + collapsible sections */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {nothingMatches ? (
            <div style={{ padding: '24px 8px', textAlign: 'center', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              No controls match &ldquo;{query}&rdquo;
            </div>
          ) : (
            <>
              {visibleQuick.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {visibleQuick.map((t) => t.node)}
                </div>
              )}
              {visibleSections.map((s) => s.node)}
            </>
          )}
        </div>

        {/* Footer: the two places the panel hands off to. */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--color-border-subtle)' }}>
          <button type="button" onClick={openNotifications} style={ccFooterBtn}>
            Notifications
            {unread > 0 && <span aria-label={`${unread} unread`} style={ccBadge}>{unread > 99 ? '99+' : unread}</span>}
          </button>
          <button type="button" onClick={openSettings} style={ccFooterBtn}>Settings…</button>
        </div>
      </div>
    </>
  );
};

export default ControlCenter;
