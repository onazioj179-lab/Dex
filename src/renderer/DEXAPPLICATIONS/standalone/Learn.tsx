// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Learn — Insights, Shortcuts & Activity Intelligence
 * Surfaces usage patterns, keyboard shortcuts, app tips, system info,
 * hourly/daily usage heatmaps, power/performance controls, and AI
 * suggestions from the local pattern-learning engine. All data is local-only.
 */

import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import DexIcon from '../../components/DexIcon';
import { useLearningStore } from '../../store/learningStore';
import { platform } from '../../utils';

// -- Helpers ---------------------------------------------------------------
const fmtMs = (ms: number): string => {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${i}:00`);

interface Suggestion {
  type: string;
  target: string;
  reason: string;
  confidence: number;
}
interface FrequentItem { id: string; count: number }

type Tab = 'overview' | 'shortcuts' | 'apps' | 'insights' | 'power';

// -- Power mode definitions -------------------------------------------------
interface PowerProfile {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  cpuLimit: number;
  gpuLimit: number;
  screenBrightness: number;
}

const POWER_PROFILES: PowerProfile[] = [
  { id: 'full', name: 'Full Power', icon: 'zap', color: '#FF453A', description: 'All systems running at maximum capacity', cpuLimit: 100, gpuLimit: 100, screenBrightness: 100 },
  { id: 'balanced', name: 'Balanced', icon: 'scale', color: '#5AC8FA', description: 'Optimal balance of performance and efficiency', cpuLimit: 100, gpuLimit: 100, screenBrightness: 100 },
  { id: 'conservative', name: 'Conservative', icon: 'battery', color: '#30D158', description: 'Reduced power use while keeping features active', cpuLimit: 80, gpuLimit: 80, screenBrightness: 80 },
  { id: 'minimal', name: 'Power Saver', icon: 'battery-low', color: '#FF9500', description: 'Maximize battery life with core features only', cpuLimit: 60, gpuLimit: 50, screenBrightness: 60 },
];

// -- Keyboard shortcuts reference ------------------------------------------
const _M = platform.isMac ? '⌘' : 'Ctrl';
const _O = platform.isMac ? '⌥' : 'Alt';

const SHORTCUT_SECTIONS = [
  {
    title: 'Navigation',
    items: [
      { keys: `${_M}+1–9`, desc: 'Switch to dock app 1–9' },
      { keys: 'F3', desc: 'Toggle app overview' },
      { keys: `${_M}+Tab`, desc: 'Switch between running apps' },
      { keys: `${_M}+W`, desc: 'Close current app' },
      { keys: `${_M}+Shift+W`, desc: 'Close all apps' },
      { keys: 'Escape', desc: 'Close menu / go back' },
    ],
  },
  {
    title: 'Creative Suite',
    items: [
      { keys: `${_O}+V`, desc: 'Open VINX (Video Editor)' },
      { keys: `${_O}+I`, desc: 'Open Imosion (Music)' },
      { keys: `${_O}+F`, desc: 'Open FLUX (Motion Graphics)' },
      { keys: `${_O}+R`, desc: 'Open PRISM (Photo Editor)' },
      { keys: `${_O}+G`, desc: 'Open FORGE (Encoder)' },
      { keys: `${_O}+X`, desc: 'Open AXL (Engineering)' },
    ],
  },
  {
    title: 'Window Management',
    items: [
      { keys: 'Double-click titlebar', desc: 'Maximize / restore window' },
      { keys: 'Drag to edge', desc: 'Snap window to half/quarter' },
      { keys: 'Hover maximize btn', desc: 'Show snap layout grid' },
    ],
  },
  {
    title: 'System',
    items: [
      { keys: `${_M}+K`, desc: 'Command palette / search' },
      { keys: `${_M}+,`, desc: 'Open Settings' },
      { keys: `${_O}+P`, desc: 'Power controls' },
    ],
  },
];

// -- App tips reference ----------------------------------------------------
const APP_TIPS_DATA = [
  { app: 'VINX', color: '#BF5AF2', tips: ['Drag media from Files into the timeline', 'Use J/K/L for shuttle playback', 'Right-click clips for split, trim, and effects', 'Export subtitles as SRT from the subtitle panel'] },
  { app: 'Imosion', color: '#FF6B35', tips: ['Record directly with the built-in mic input', 'Use the mixer to route and pan channels', 'Apply effects like reverb, EQ, and compression per track', 'Export stems individually for collaboration'] },
  { app: 'FLUX', color: '#64D2FF', tips: ['Add shape or text layers from the toolbar', 'Keyframe properties for smooth animation', 'Use the graph editor for easing curves', 'Enable 3D mode for depth and camera control'] },
  { app: 'PRISM', color: 'var(--color-success)', tips: ['Use layers panel for non-destructive editing', 'Hold Shift for proportional transforms', 'Apply adjustment layers for global color grading', 'Export at any resolution from the export dialog'] },
  { app: 'AXL', color: 'var(--color-accent)', tips: ['Create parts with the shape tools', 'Apply constraints to lock dimensions', 'Run stress simulation to validate your design', 'Export as STL for 3D printing or DXF for CAD'] },
  { app: 'FORGE', color: 'var(--color-warning)', tips: ['Drag files into the queue to start encoding', 'Choose presets or customize output settings', 'Queue multiple jobs for batch processing', 'Monitor progress with the built-in dashboard'] },
  { app: 'Notes', color: 'var(--color-warning)', tips: ['Organize with folders in the sidebar', 'Use Markdown formatting for rich text', 'Pin important notes to the top', 'Autocomplete suggests words as you type'] },
  { app: 'Files', color: '#339AF0', tips: ['Use breadcrumbs to navigate directories', 'Preview images and documents inline', 'Right-click for copy, move, and rename', 'Use the search bar to find files quickly'] },
];

// -- Styles (module-level, never re-created) --------------------------------
const ROOT: React.CSSProperties = {
  width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
  background: 'var(--color-bg-base, #0a0a0f)',
  color: 'var(--color-text-primary, #e5e5ea)',
  overflow: 'hidden',
};
const HEADER: React.CSSProperties = {
  padding: '20px 24px 14px', flexShrink: 0,
  background: 'var(--color-bg-surface-solid, #1C1C1E)',
  borderBottom: '1px solid var(--color-border-subtle)',
};
const CONTENT: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: '16px 24px 28px',
  display: 'flex', flexDirection: 'column', gap: 18,
};
const CARD: React.CSSProperties = {
  background: 'var(--color-bg-elevated, rgba(255,255,255,.04))',
  borderRadius: 10, padding: '16px 18px',
  border: '1px solid var(--color-border-subtle, rgba(255,255,255,.06))',
};
// Subtle row dividers shared across cards.
const ROW_DIVIDER = '1px solid var(--color-border-subtle, rgba(255,255,255,.04))';
const CARD_TITLE: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const,
  letterSpacing: '0.04em', opacity: 0.5, marginBottom: 12,
};
const STAT_ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '6px 0', fontSize: 13,
};
const BAR_BG: React.CSSProperties = {
  flex: 1, height: 4, borderRadius: 2, marginLeft: 12,
  background: 'var(--color-bg-inset, rgba(255,255,255,.06))', overflow: 'hidden',
};
const TAB_STYLE = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px', fontSize: 12, fontWeight: active ? 600 : 400,
  borderRadius: 6, cursor: 'pointer', border: 'none',
  background: active ? 'var(--color-bg-hover, rgba(255,255,255,.1))' : 'transparent',
  color: active ? 'var(--color-text-primary, #fff)' : 'var(--color-text-tertiary, rgba(255,255,255,.5))',
  transition: 'all .15s ease',
});

// ── Component ──────────────────────────────────────────────────────────────
const Learn: React.FC = () => {
  const { enabled, patterns, setEnabled, reset } = useLearningStore();
  const [tab, setTab] = useState<Tab>('overview');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [frequentItems, setFrequentItems] = useState<FrequentItem[]>([]);
  const [dayPatterns, setDayPatterns] = useState<Record<string, { app: string; count: number }[]>>({});
  const [hourlyPatterns, setHourlyPatterns] = useState<Record<string, { app: string; count: number }[]>>({});
  const [sessionStats, setSessionStats] = useState<{ average: number; total: number; count: number } | null>(null);
  
  // Power management state
  const [powerProfile, setPowerProfile] = useState<string>('balanced');
  const [batteryLevel, setBatteryLevel] = useState<number>(100);
  const [isCharging, setIsCharging] = useState<boolean>(true);
  const [cpuUsage, setCpuUsage] = useState<number>(0);
  const [memoryUsage, setMemoryUsage] = useState<number>(0);
  const [restrictedMode, setRestrictedMode] = useState<boolean>(false);
  
  // Real-time system monitoring
  const metricsInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch battery and power state
  useEffect(() => {
    const ipc = (window as any).electron;
    if (!ipc?.invoke) return;
    
    // Initial power state
    ipc.invoke('os:getBatteryInfo').then((info: any) => {
      if (info) {
        setBatteryLevel(info.level ?? 100);
        setIsCharging(info.charging ?? true);
      }
    }).catch(() => {});
    
    // Get current power profile
    ipc.invoke('battery:getProfile').then((profile: string) => {
      if (profile) setPowerProfile(profile);
    }).catch(() => {});
    
    // Get restriction status
    ipc.invoke('battery:getRestrictions').then((restrictions: any) => {
      setRestrictedMode(restrictions?.pauseNonEssentialTimers ?? false);
    }).catch(() => {});
    
    // Real-time metrics -- only poll while document is visible.
    const updateMetrics = () => {
      if (document.hidden) return;
      ipc.invoke('system:getCpuUsage').then((cpu: number) => setCpuUsage(cpu || 0)).catch(() => {});
      ipc.invoke('system:getMemoryUsage').then((mem: number) => setMemoryUsage(mem || 0)).catch(() => {});
    };
    updateMetrics();
    metricsInterval.current = setInterval(updateMetrics, 2000);
    
    return () => {
      if (metricsInterval.current) clearInterval(metricsInterval.current);
    };
  }, []);

  // Handle power profile change
  const changePowerProfile = useCallback((profileId: string) => {
    const ipc = (window as any).electron;
    setPowerProfile(profileId);
    ipc?.invoke?.('battery:setProfile', profileId).catch(() => {});
  }, []);
  
  // Toggle restriction mode
  const toggleRestrictions = useCallback(() => {
    const ipc = (window as any).electron;
    const newState = !restrictedMode;
    setRestrictedMode(newState);
    // Update config to enable/disable non-essential timer pausing
    ipc?.invoke?.('battery:setConfig', { 
      enabled: newState 
    }).catch(() => {});
  }, [restrictedMode]);

  // Fetch data from main process pattern engine
  useEffect(() => {
    const ipc = (window as any).electron;
    if (!ipc?.invoke) return;
    ipc.invoke('patterns:getSuggestions', {}).then((s: Suggestion[]) => setSuggestions(s || [])).catch((e: unknown) => console.warn('[Learn] getSuggestions:', e));
    ipc.invoke('patterns:getFrequent', null, 20).then((f: FrequentItem[]) => setFrequentItems(f || [])).catch((e: unknown) => console.warn('[Learn] getFrequent:', e));
    ipc.invoke('patterns:getDayPatterns').then((d: any) => setDayPatterns(d || {})).catch((e: unknown) => console.warn('[Learn] getDayPatterns:', e));
    ipc.invoke('patterns:getHourlyPatterns').then((h: any) => setHourlyPatterns(h || {})).catch((e: unknown) => console.warn('[Learn] getHourlyPatterns:', e));
    ipc.invoke('patterns:getSessionStats').then((s: any) => setSessionStats(s || null)).catch((e: unknown) => console.warn('[Learn] getSessionStats:', e));
  }, []);

  // Derived data from renderer learning store
  const rankedPages = useMemo(() => {
    return Object.entries(patterns.pageVisits)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12);
  }, [patterns.pageVisits]);

  const rankedActions = useMemo(() => {
    return Object.entries(patterns.actionFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12);
  }, [patterns.actionFrequency]);

  const totalTimeMs = useMemo(() => {
    return Object.values(patterns.pageTime).reduce((a, b) => a + b, 0);
  }, [patterns.pageTime]);

  const pageTimeEntries = useMemo(() => {
    return Object.entries(patterns.pageTime)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
  }, [patterns.pageTime]);

  const maxPageVisits = rankedPages.length ? rankedPages[0][1] : 1;
  const maxActionFreq = rankedActions.length ? rankedActions[0][1] : 1;
  const maxPageTime = pageTimeEntries.length ? pageTimeEntries[0][1] : 1;

  const handleReset = useCallback(() => {
    reset();
    const ipc = (window as any).electron;
    ipc?.invoke?.('patterns:cleanup').catch((e: unknown) => console.warn('[Learn] cleanup:', e));
  }, [reset]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={ROOT}>
      {/* Header */}
      <div style={HEADER}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 8,
              background: 'linear-gradient(135deg, #5e5ce6, #7d7aff)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <DexIcon name="brain" size={20} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Learn</h1>
              <p style={{ fontSize: 11, margin: 0, opacity: 0.45 }}>
                Shortcuts, tips & activity intelligence
              </p>
            </div>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 500, borderRadius: 6,
              border: 'none', cursor: 'pointer',
              background: enabled ? 'rgba(48,209,88,.15)' : 'rgba(255,69,58,.15)',
              color: enabled ? 'var(--color-success)' : 'var(--color-error)',
            }}
          >
            {enabled ? 'Tracking Active' : 'Tracking Paused'}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
          {(['overview', 'shortcuts', 'apps', 'insights', 'power'] as Tab[]).map(t => (
            <button key={t} style={TAB_STYLE(tab === t)} onClick={() => setTab(t)}>
              {t === 'power' ? 'Power' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={CONTENT}>
        {/* ── OVERVIEW TAB ──────────────────────────────────────────── */}
        {tab === 'overview' && (
          <>
            {/* Quick Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                { label: 'Pages Visited', value: Object.keys(patterns.pageVisits).length, color: '#5e5ce6' },
                { label: 'Actions Tracked', value: Object.values(patterns.actionFrequency).reduce((a, b) => a + b, 0), color: 'var(--color-success)' },
                { label: 'Total Active', value: fmtMs(totalTimeMs), color: 'var(--color-warning)' },
              ].map(s => (
                <div key={s.label} style={{ ...CARD, textAlign: 'center' as const, position: 'relative' as const, overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: s.color, opacity: 0.6 }} />
                  <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{s.value}</div>
                  <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Session Stats from main process */}
            {sessionStats && (
              <div style={CARD}>
                <div style={CARD_TITLE}>Session Stats</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: 13 }}>
                  <div><div style={{ opacity: 0.5, fontSize: 11 }}>Average Session</div><div style={{ fontWeight: 600 }}>{fmtMs(sessionStats.average)}</div></div>
                  <div><div style={{ opacity: 0.5, fontSize: 11 }}>Total Time</div><div style={{ fontWeight: 600 }}>{fmtMs(sessionStats.total)}</div></div>
                  <div><div style={{ opacity: 0.5, fontSize: 11 }}>Sessions</div><div style={{ fontWeight: 600 }}>{sessionStats.count}</div></div>
                </div>
              </div>
            )}

            {/* Top Pages */}
            {rankedPages.length > 0 && (
              <div style={CARD}>
                <div style={CARD_TITLE}>Most Visited Pages</div>
                {rankedPages.slice(0, 6).map(([page, count]) => (
                  <div key={page} style={STAT_ROW}>
                    <span style={{ opacity: 0.8 }}>{page}</span>
                    <div style={BAR_BG}>
                      <div style={{ width: `${(count / maxPageVisits) * 100}%`, height: '100%', borderRadius: 2, background: '#5e5ce6' }} />
                    </div>
                    <span style={{ minWidth: 28, textAlign: 'right' as const, opacity: 0.5, fontSize: 12 }}>{count}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Top Actions */}
            {rankedActions.length > 0 && (
              <div style={CARD}>
                <div style={CARD_TITLE}>Top Actions</div>
                {rankedActions.slice(0, 6).map(([action, count]) => (
                  <div key={action} style={STAT_ROW}>
                    <span style={{ opacity: 0.8, flex: '0 0 140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{action}</span>
                    <div style={BAR_BG}>
                      <div style={{ width: `${(count / maxActionFreq) * 100}%`, height: '100%', borderRadius: 2, background: '#64d2ff' }} />
                    </div>
                    <span style={{ minWidth: 28, textAlign: 'right' as const, opacity: 0.5, fontSize: 12 }}>{count}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Suggestions from pattern engine */}
            {suggestions.length > 0 && (
              <div style={CARD}>
                <div style={CARD_TITLE}>Suggestions</div>
                {suggestions.slice(0, 5).map((s, i) => (
                  <div key={i} style={{
                    padding: '8px 0', borderBottom: i < suggestions.length - 1 ? ROW_DIVIDER : 'none',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 5,
                      background: 'rgba(94,92,230,.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <DexIcon name="sparkles" size={14} color="#5e5ce6" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{s.target}</div>
                      <div style={{ fontSize: 11, opacity: 0.45 }}>{s.reason}</div>
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.4, padding: '2px 6px', background: 'var(--color-bg-hover, rgba(255,255,255,.04))', borderRadius: 3 }}>{s.type}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state when no data yet */}
            {rankedPages.length === 0 && rankedActions.length === 0 && (
              <div style={{ ...CARD, textAlign: 'center' as const, padding: '28px 20px' }}>
                <div style={{ opacity: 0.25, marginBottom: 8 }}>
                  <DexIcon name="activity" size={32} color="currentColor" />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Start exploring DEX</div>
                <div style={{ fontSize: 12, opacity: 0.45, maxWidth: 280, margin: '0 auto' }}>
                  Open apps, browse files, and create projects. Your activity data will appear here as you use DEX.
                </div>
              </div>
            )}
          </>
        )}

        {/* ── SHORTCUTS TAB ──────────────────────────────────────────── */}
        {tab === 'shortcuts' && (
          <>
            {SHORTCUT_SECTIONS.map(section => (
              <div key={section.title} style={CARD}>
                <div style={CARD_TITLE}>{section.title}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {section.items.map((item, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 0',
                      borderBottom: i < section.items.length - 1 ? ROW_DIVIDER : 'none',
                    }}>
                      <span style={{ fontSize: 13, opacity: 0.8 }}>{item.desc}</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {item.keys.split('+').length > 1 ? (
                          item.keys.split('+').map((key, ki) => (
                            <React.Fragment key={ki}>
                              {ki > 0 && <span style={{ fontSize: 10, opacity: 0.3, lineHeight: '22px' }}>+</span>}
                              <span style={{
                                padding: '2px 8px', fontSize: 11, fontWeight: 600,
                                background: 'var(--color-bg-hover, rgba(255,255,255,.08))', borderRadius: 4,
                                border: '1px solid var(--color-border-subtle, rgba(255,255,255,.06))',
                                fontFamily: 'var(--font-mono, monospace)',
                                minWidth: 24, textAlign: 'center' as const,
                              }}>{key.trim()}</span>
                            </React.Fragment>
                          ))
                        ) : (
                          <span style={{
                            padding: '2px 8px', fontSize: 11, fontWeight: 600,
                            background: 'var(--color-bg-hover, rgba(255,255,255,.08))', borderRadius: 4,
                            border: '1px solid var(--color-border-subtle, rgba(255,255,255,.06))',
                            fontFamily: 'var(--font-mono, monospace)',
                          }}>{item.keys}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── APPS TAB ──────────────────────────────────────────────── */}
        {tab === 'apps' && (
          <>
            {/* App tips cards */}
            {APP_TIPS_DATA.map(app => (
              <div key={app.app} style={CARD}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 4,
                    background: `${app.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: app.color }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: app.color }}>{app.app}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {app.tips.map((tip, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                      padding: '5px 0',
                      borderBottom: i < app.tips.length - 1 ? ROW_DIVIDER : 'none',
                    }}>
                      <span style={{ fontSize: 10, opacity: 0.3, marginTop: 2, flexShrink: 0 }}>•</span>
                      <span style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>{tip}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Frequent Items from main-process pattern engine */}
            {frequentItems.length > 0 && (
              <div style={CARD}>
                <div style={CARD_TITLE}>Most Used (All Time)</div>
                {frequentItems.map(f => {
                  const maxCount = frequentItems[0]?.count || 1;
                  return (
                    <div key={f.id} style={STAT_ROW}>
                      <span style={{ opacity: 0.8, flex: '0 0 120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{f.id}</span>
                      <div style={BAR_BG}>
                        <div style={{ width: `${(f.count / maxCount) * 100}%`, height: '100%', borderRadius: 2, background: 'var(--color-success)' }} />
                      </div>
                      <span style={{ minWidth: 28, textAlign: 'right' as const, opacity: 0.5, fontSize: 12 }}>{f.count}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Time Spent per Page */}
            {pageTimeEntries.length > 0 && (
              <div style={CARD}>
                <div style={CARD_TITLE}>Time Spent</div>
                {pageTimeEntries.map(([page, ms]) => (
                  <div key={page} style={STAT_ROW}>
                    <span style={{ opacity: 0.8, flex: '0 0 120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{page}</span>
                    <div style={BAR_BG}>
                      <div style={{ width: `${(ms / maxPageTime) * 100}%`, height: '100%', borderRadius: 2, background: 'var(--color-warning)' }} />
                    </div>
                    <span style={{ minWidth: 44, textAlign: 'right' as const, opacity: 0.5, fontSize: 12 }}>{fmtMs(ms)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── INSIGHTS TAB ──────────────────────────────────────────── */}
        {tab === 'insights' && (
          <>
            {/* Day-of-Week Heatmap */}
            {Object.keys(dayPatterns).length > 0 && (
              <div style={CARD}>
                <div style={CARD_TITLE}>Activity by Day</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {DAY_LABELS.map((day, idx) => {
                    const dayData = dayPatterns[String(idx)] || [];
                    const total = dayData.reduce((s, d) => s + d.count, 0);
                    const maxTotal = Math.max(1, ...DAY_LABELS.map((_, i) =>
                      (dayPatterns[String(i)] || []).reduce((s: number, d: { count: number }) => s + d.count, 0)
                    ));
                    return (
                      <div key={day} style={{ flex: 1, textAlign: 'center' as const }}>
                        <div style={{ height: 48, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                          <div style={{
                            width: '80%', borderRadius: 2,
                            background: total ? 'rgba(94,92,230,.6)' : 'var(--color-bg-hover, rgba(255,255,255,.04))',
                            height: `${Math.max(4, (total / maxTotal) * 100)}%`,
                          }} />
                        </div>
                        <div style={{ fontSize: 10, opacity: 0.4, marginTop: 4 }}>{day}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Hourly Activity Heatmap */}
            {Object.keys(hourlyPatterns).length > 0 && (
              <div style={CARD}>
                <div style={CARD_TITLE}>Hourly Activity</div>
                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 64 }}>
                  {HOUR_LABELS.map((_, idx) => {
                    const hourData = hourlyPatterns[String(idx)] || [];
                    const total = hourData.reduce((s, d) => s + d.count, 0);
                    const maxTotal = Math.max(1, ...HOUR_LABELS.map((__, i) =>
                      (hourlyPatterns[String(i)] || []).reduce((s: number, d: { count: number }) => s + d.count, 0)
                    ));
                    return (
                      <div key={idx} style={{
                        flex: 1, borderRadius: 2,
                        background: total ? 'rgba(100,210,255,.5)' : 'var(--color-bg-hover, rgba(255,255,255,.03))',
                        height: `${Math.max(4, (total / maxTotal) * 100)}%`,
                        transition: 'height .18s cubic-bezier(0.4,0,0.2,1)',
                      }} title={`${HOUR_LABELS[idx]}: ${total} actions`} />
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 10, opacity: 0.3 }}>0:00</span>
                  <span style={{ fontSize: 10, opacity: 0.3 }}>12:00</span>
                  <span style={{ fontSize: 10, opacity: 0.3 }}>23:00</span>
                </div>
              </div>
            )}

            {/* Recent Searches */}
            {patterns.searchPatterns.length > 0 && (
              <div style={CARD}>
                <div style={CARD_TITLE}>Recent Searches</div>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                  {patterns.searchPatterns.slice(0, 20).map((q, i) => (
                    <span key={i} style={{
                      padding: '4px 10px', fontSize: 12, borderRadius: 4,
                      background: 'var(--color-bg-hover, rgba(255,255,255,.05))', opacity: 0.7,
                    }}>{q}</span>
                  ))}
                </div>
              </div>
            )}

            {/* All Suggestions */}
            {suggestions.length > 0 && (
              <div style={CARD}>
                <div style={CARD_TITLE}>All Recommendations</div>
                {suggestions.map((s, i) => (
                  <div key={i} style={{
                    padding: '10px 0',
                    borderBottom: i < suggestions.length - 1 ? ROW_DIVIDER : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{s.target}</span>
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'rgba(94,92,230,.15)', color: '#7d7aff' }}>{s.type}</span>
                      <span style={{ fontSize: 10, opacity: 0.4, marginLeft: 'auto' }}>{Math.round(s.confidence * 100)}%</span>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.5 }}>{s.reason}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty insights state */}
            {suggestions.length === 0 && Object.keys(hourlyPatterns).length === 0 && Object.keys(dayPatterns).length === 0 && (
              <div style={{ ...CARD, textAlign: 'center' as const, padding: 32, opacity: 0.5 }}>
                <DexIcon name="brain" size={24} color="currentColor" />
                <p style={{ marginTop: 8, fontSize: 13 }}>
                  Keep using DEX to build insights. The pattern engine learns over time.
                </p>
              </div>
            )}

            {/* Data Management */}
            <div style={CARD}>
              <div style={CARD_TITLE}>Data Management</div>
              <p style={{ fontSize: 12, opacity: 0.45, marginBottom: 12 }}>
                All learning data is stored locally on this device. Nothing leaves your machine.
              </p>
              <button
                onClick={handleReset}
                style={{
                  padding: '8px 16px', fontSize: 12, fontWeight: 500, borderRadius: 6,
                  border: '1px solid var(--color-error-muted, rgba(255,69,58,.3))', background: 'var(--color-error-muted, rgba(255,69,58,.08))',
                  color: 'var(--color-error)', cursor: 'pointer',
                }}
              >
                Reset All Learning Data
              </button>
            </div>
          </>
        )}

        {/* ── POWER TAB ──────────────────────────────────────────────── */}
        {tab === 'power' && (
          <>
            {/* System Status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              <div style={{ ...CARD, textAlign: 'center' as const, position: 'relative' as const }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                  background: isCharging ? '#30D158' : batteryLevel > 20 ? '#5AC8FA' : '#FF453A',
                }} />
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{batteryLevel}%</div>
                <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>
                  {isCharging ? 'Charging' : 'Battery'}
                </div>
              </div>
              <div style={{ ...CARD, textAlign: 'center' as const, position: 'relative' as const }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                  background: cpuUsage > 80 ? '#FF453A' : cpuUsage > 50 ? '#FF9500' : '#30D158',
                }} />
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{cpuUsage}%</div>
                <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>CPU</div>
              </div>
              <div style={{ ...CARD, textAlign: 'center' as const, position: 'relative' as const }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                  background: memoryUsage > 80 ? '#FF453A' : memoryUsage > 60 ? '#FF9500' : '#30D158',
                }} />
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{memoryUsage}%</div>
                <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>Memory</div>
              </div>
              <div style={{ ...CARD, textAlign: 'center' as const, position: 'relative' as const }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                  background: restrictedMode ? '#FF9500' : '#30D158',
                }} />
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{restrictedMode ? 'ON' : 'OFF'}</div>
                <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>Restrictions</div>
              </div>
            </div>

            {/* Power Profiles */}
            <div style={CARD}>
              <div style={CARD_TITLE}>Power Profile</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {POWER_PROFILES.map(profile => (
                  <button
                    key={profile.id}
                    onClick={() => changePowerProfile(profile.id)}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 8,
                      border: powerProfile === profile.id ? `2px solid ${profile.color}` : '2px solid transparent',
                      background: powerProfile === profile.id ? `${profile.color}15` : 'var(--color-bg-hover, rgba(255,255,255,.03))',
                      cursor: 'pointer',
                      textAlign: 'left' as const,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <DexIcon name={profile.icon as any} size={18} color={profile.color} />
                      <span style={{ fontWeight: 600, fontSize: 13, color: powerProfile === profile.id ? profile.color : 'inherit' }}>
                        {profile.name}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.5, lineHeight: 1.4 }}>{profile.description}</div>
                    {powerProfile === profile.id && (
                      <div style={{ marginTop: 8, display: 'flex', gap: 8, fontSize: 10, opacity: 0.6 }}>
                        <span>CPU: {profile.cpuLimit}%</span>
                        <span>GPU: {profile.gpuLimit}%</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Restriction Controls */}
            <div style={CARD}>
              <div style={CARD_TITLE}>Operation Mode</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
                    {restrictedMode ? 'Restricted Mode' : 'Unrestricted Mode'}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.5 }}>
                    {restrictedMode 
                      ? 'Some operations are limited to save power and resources'
                      : 'All operations run at full capacity'}
                  </div>
                </div>
                <button
                  onClick={toggleRestrictions}
                  style={{
                    padding: '8px 16px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                    border: 'none', cursor: 'pointer',
                    background: restrictedMode ? 'rgba(255,69,58,.15)' : 'rgba(48,209,88,.15)',
                    color: restrictedMode ? '#FF453A' : '#30D158',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {restrictedMode ? 'Disable Restrictions' : 'Enable Restrictions'}
                </button>
              </div>
              
              {/* Quick actions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Clear Cache', icon: 'trash', action: 'cache:clear' },
                  { label: 'Optimize', icon: 'zap', action: 'system:optimize' },
                  { label: 'Refresh', icon: 'refresh-cw', action: 'system:refresh' },
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={() => (window as any).electron?.invoke?.(item.action)}
                    style={{
                      padding: '10px 12px', borderRadius: 6, border: 'none',
                      background: 'var(--color-bg-hover, rgba(255,255,255,.05))', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      fontSize: 11, color: 'inherit', transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-active, rgba(255,255,255,.1))')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,.05))')}
                  >
                    <DexIcon name={item.icon as any} size={14} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Performance Tips */}
            <div style={CARD}>
              <div style={CARD_TITLE}>Performance Tips</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { tip: 'Close unused apps to free up memory', condition: memoryUsage > 70 },
                  { tip: 'Switch to Power Saver mode for longer battery life', condition: !isCharging && batteryLevel < 50 },
                  { tip: 'Enable Performance mode for demanding creative work', condition: cpuUsage > 60 },
                  { tip: 'Your system is running optimally', condition: cpuUsage < 40 && memoryUsage < 50 },
                ].filter(t => t.condition).map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 6,
                    background: 'rgba(94,92,230,.1)',
                  }}>
                    <DexIcon name="info" size={14} color="#5E5CE6" />
                    <span style={{ fontSize: 12, opacity: 0.8 }}>{item.tip}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default memo(Learn);
