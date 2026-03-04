/**
 * DEX Usage Analytics Dashboard
 * Tracks app usage patterns and presents insights
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */
import React, { useState, useEffect, useMemo, memo } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface AppUsageEntry {
  appId: string;
  date: string; // YYYY-MM-DD
  launches: number;
  totalSeconds: number;
}

export interface AnalyticsState {
  entries: AppUsageEntry[];
  totalLaunches: number;
  totalSeconds: number;
  firstTracked: string;
  sessionStarts: number[];
}

// ============================================================================
// STORAGE
// ============================================================================

const STORAGE_KEY = 'dex-analytics';

export function loadAnalytics(): AnalyticsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { entries: [], totalLaunches: 0, totalSeconds: 0, firstTracked: new Date().toISOString().split('T')[0], sessionStarts: [] };
}

export function saveAnalytics(state: AnalyticsState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

export function trackAppLaunch(state: AnalyticsState, appId: string): AnalyticsState {
  const today = new Date().toISOString().split('T')[0];
  const entries = [...state.entries];
  let entry = entries.find(e => e.appId === appId && e.date === today);
  if (!entry) {
    entry = { appId, date: today, launches: 0, totalSeconds: 0 };
    entries.push(entry);
  }
  entry.launches += 1;
  return { ...state, entries, totalLaunches: state.totalLaunches + 1 };
}

export function trackAppTime(state: AnalyticsState, appId: string, seconds: number): AnalyticsState {
  const today = new Date().toISOString().split('T')[0];
  const entries = [...state.entries];
  let entry = entries.find(e => e.appId === appId && e.date === today);
  if (!entry) {
    entry = { appId, date: today, launches: 0, totalSeconds: 0 };
    entries.push(entry);
  }
  entry.totalSeconds += seconds;
  // Keep only 90 days of history
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const filtered = entries.filter(e => e.date >= cutoffStr);
  return { ...state, entries: filtered, totalSeconds: state.totalSeconds + seconds };
}

// ============================================================================
// APP NAME MAP
// ============================================================================

const APP_NAMES: Record<string, { name: string; color: string }> = {
  home: { name: 'Home', color: '#ffffff' },
  dashboard: { name: 'Dashboard', color: '#5e5ce6' },
  files: { name: 'Files', color: '#30d158' },
  browser: { name: 'Browser', color: '#64d2ff' },
  notes: { name: 'Notes', color: '#ffd60a' },
  tasks: { name: 'Tasks', color: '#34c759' },
  calendar: { name: 'Calendar', color: '#ff2d55' },
  workflows: { name: 'Workflows', color: '#bf5af2' },
  gallery: { name: 'Gallery', color: '#ff375f' },
  audio: { name: 'Music', color: '#ff6482' },
  video: { name: 'Video', color: '#5e5ce6' },
  settings: { name: 'Settings', color: '#8e8e93' },
  transfers: { name: 'Share', color: '#10b981' },
  power: { name: 'Power', color: '#ff453a' },
  calculator: { name: 'Calculator', color: '#8e8e93' },
  passwordgenerator: { name: 'Passwords', color: '#007aff' },
  videoeditor: { name: 'VINX', color: '#8b5cf6' },
  imosion: { name: 'Imosion', color: '#f97316' },
  prism: { name: 'PRISM', color: '#06b6d4' },
  flux: { name: 'FLUX', color: '#3b82f6' },
  forge: { name: 'FORGE', color: '#f59e0b' },
  rewind: { name: 'Rewind', color: '#0078d4' },
  games: { name: 'Games', color: '#ff6b6b' },
  kanban: { name: 'Kanban', color: '#6366f1' },
};

// ============================================================================
// ANALYTICS PANEL COMPONENT
// ============================================================================

export const AnalyticsPanel: React.FC<{ onClose?: () => void }> = memo(({ onClose }) => {
  const [data, setData] = useState<AnalyticsState>(loadAnalytics);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');

  const periodEntries = useMemo(() => {
    const now = new Date();
    let cutoff: Date;
    if (period === 'today') {
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'week') {
      cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 7);
    } else {
      cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 30);
    }
    const cutoffStr = cutoff.toISOString().split('T')[0];
    return data.entries.filter(e => e.date >= cutoffStr);
  }, [data, period]);

  // Aggregate by app
  const appStats = useMemo(() => {
    const map = new Map<string, { launches: number; seconds: number }>();
    periodEntries.forEach(e => {
      const existing = map.get(e.appId) || { launches: 0, seconds: 0 };
      existing.launches += e.launches;
      existing.seconds += e.totalSeconds;
      map.set(e.appId, existing);
    });
    return Array.from(map.entries())
      .map(([appId, stats]) => ({ appId, ...stats, name: APP_NAMES[appId]?.name || appId, color: APP_NAMES[appId]?.color || '#666' }))
      .sort((a, b) => b.seconds - a.seconds);
  }, [periodEntries]);

  // Daily activity (last 7 days)
  const dailyActivity = useMemo(() => {
    const days: { date: string; label: string; launches: number; seconds: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayEntries = data.entries.filter(e => e.date === dateStr);
      days.push({
        date: dateStr,
        label: d.toLocaleDateString([], { weekday: 'short' }),
        launches: dayEntries.reduce((s, e) => s + e.launches, 0),
        seconds: dayEntries.reduce((s, e) => s + e.totalSeconds, 0),
      });
    }
    return days;
  }, [data]);

  const totalLaunches = periodEntries.reduce((s, e) => s + e.launches, 0);
  const totalSeconds = periodEntries.reduce((s, e) => s + e.totalSeconds, 0);
  const uniqueApps = new Set(periodEntries.map(e => e.appId)).size;
  const maxSeconds = Math.max(...appStats.map(a => a.seconds), 1);
  const maxDailySeconds = Math.max(...dailyActivity.map(d => d.seconds), 1);

  const formatTime = (s: number) => {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.round(s / 60)}m`;
    return `${(s / 3600).toFixed(1)}h`;
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Usage Analytics</h2>
          <p style={styles.subtitle}>Track how you use DEX</p>
        </div>
        <div style={styles.periodTabs}>
          {(['today', 'week', 'month'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{ ...styles.periodTab, ...(period === p ? styles.periodTabActive : {}) }}
              aria-label={`Show ${p} data`} aria-pressed={period === p}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div style={styles.summaryRow}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryValue}>{totalLaunches}</div>
          <div style={styles.summaryLabel}>App Launches</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryValue}>{formatTime(totalSeconds)}</div>
          <div style={styles.summaryLabel}>Active Time</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryValue}>{uniqueApps}</div>
          <div style={styles.summaryLabel}>Apps Used</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryValue}>{data.entries.length > 0 ? Math.round(totalSeconds / Math.max(totalLaunches, 1) / 60) : 0}m</div>
          <div style={styles.summaryLabel}>Avg Session</div>
        </div>
      </div>

      {/* Daily activity chart */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Daily Activity (Last 7 Days)</h3>
        <div style={styles.chartRow}>
          {dailyActivity.map(day => (
            <div key={day.date} style={styles.chartCol}>
              <div style={styles.chartBarOuter}>
                <div style={{ ...styles.chartBarInner, height: `${(day.seconds / maxDailySeconds) * 100}%` }} />
              </div>
              <div style={styles.chartLabel}>{day.label}</div>
              <div style={styles.chartValue}>{formatTime(day.seconds)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top apps */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Most Used Apps</h3>
        {appStats.length === 0 ? (
          <div style={styles.emptyNote}>No usage data for this period yet. Start using DEX apps to see analytics!</div>
        ) : (
          appStats.slice(0, 10).map((app, i) => (
            <div key={app.appId} style={styles.appRow}>
              <span style={styles.appRank}>#{i + 1}</span>
              <div style={{ ...styles.appDot, background: app.color }} />
              <span style={styles.appName}>{app.name}</span>
              <div style={styles.appBarOuter}>
                <div style={{ ...styles.appBarInner, width: `${(app.seconds / maxSeconds) * 100}%`, background: app.color }} />
              </div>
              <span style={styles.appTime}>{formatTime(app.seconds)}</span>
              <span style={styles.appLaunches}>{app.launches}x</span>
            </div>
          ))
        )}
      </div>

      {/* Insights */}
      {appStats.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Insights</h3>
          <div style={styles.insightGrid}>
            <div style={styles.insightCard}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 }}>Top App</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{appStats[0]?.name || 'N/A'}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{formatTime(appStats[0]?.seconds || 0)} total</div>
            </div>
            <div style={styles.insightCard}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 }}>Most Active Day</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>
                {dailyActivity.reduce((max, d) => d.seconds > max.seconds ? d : max, dailyActivity[0])?.label || 'N/A'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                {formatTime(dailyActivity.reduce((max, d) => d.seconds > max.seconds ? d : max, dailyActivity[0])?.seconds || 0)}
              </div>
            </div>
            <div style={styles.insightCard}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 }}>App Discovery</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{uniqueApps}/24</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>apps explored</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

AnalyticsPanel.displayName = 'AnalyticsPanel';

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', padding: 20, overflow: 'auto', gap: 16 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.3px' },
  subtitle: { fontSize: 13, color: 'var(--color-text-muted)', margin: '2px 0 0' },
  periodTabs: { display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 2 },
  periodTab: { padding: '6px 14px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  periodTabActive: { background: 'rgba(255,255,255,0.08)', color: 'var(--color-text-primary, #fafafa)' },
  summaryRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 },
  summaryCard: { padding: '16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border, rgba(255,255,255,0.06))', textAlign: 'center' as const },
  summaryValue: { fontSize: 22, fontWeight: 800, color: '#3b82f6' },
  summaryLabel: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: 'var(--color-text-muted)', marginTop: 4 },
  section: { display: 'flex', flexDirection: 'column', gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: 700, margin: 0 },
  chartRow: { display: 'flex', gap: 8, alignItems: 'flex-end', height: 120, padding: '0 8px' },
  chartCol: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  chartBarOuter: { width: '100%', maxWidth: 40, height: 80, borderRadius: 6, background: 'rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden' },
  chartBarInner: { width: '100%', borderRadius: 6, background: '#3b82f6', minHeight: 2, transition: 'height 0.3s ease' },
  chartLabel: { fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)' },
  chartValue: { fontSize: 10, fontWeight: 700, color: 'var(--color-text-primary)' },
  appRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' },
  appRank: { fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', minWidth: 24 },
  appDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  appName: { fontSize: 13, fontWeight: 600, minWidth: 80 },
  appBarOuter: { flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.04)' },
  appBarInner: { height: '100%', borderRadius: 3, transition: 'width 0.3s ease', minWidth: 2 },
  appTime: { fontSize: 12, fontWeight: 700, minWidth: 40, textAlign: 'right' as const },
  appLaunches: { fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, minWidth: 30, textAlign: 'right' as const },
  emptyNote: { fontSize: 13, color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '20px 0', textAlign: 'center' as const },
  insightGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 },
  insightCard: { padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border, rgba(255,255,255,0.06))' },
};

export default AnalyticsPanel;
