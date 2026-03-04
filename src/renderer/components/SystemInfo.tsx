/**
 * DEX System Info Panel
 * Displays system information, resource usage, and app diagnostics
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */
import React, { useState, useEffect, useCallback, memo } from 'react';
import { getBundledAppVersion } from '../utils/appVersion';

// ============================================================================
// TYPES
// ============================================================================

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsed: number;
  memoryTotal: number;
  uptime: number;
  platform: string;
  arch: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  appVersion: string;
  windowCount: number;
  storageUsed: number;
}

interface DiagnosticEntry {
  label: string;
  status: 'ok' | 'warning' | 'error';
  detail: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function estimateStorageUsed(): number {
  let bytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) bytes += key.length + (localStorage.getItem(key)?.length || 0);
    }
  } catch {}
  return bytes * 2; // UTF-16
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getSystemMetrics(): SystemMetrics {
  const nav = navigator as any;
  const perf = performance as any;
  let memUsed = 0, memTotal = 0;
  if (perf.memory) { memUsed = perf.memory.usedJSHeapSize; memTotal = perf.memory.jsHeapSizeLimit; }
  return {
    cpuUsage: Math.random() * 30 + 5, // Simulated -- real usage requires main process IPC
    memoryUsed: memUsed,
    memoryTotal: memTotal,
    uptime: Math.floor(performance.now() / 1000),
    platform: nav.userAgentData?.platform || nav.platform || 'Unknown',
    arch: nav.userAgentData?.architecture || (nav.platform?.includes('64') ? 'x64' : 'x86'),
    electronVersion: window.process?.versions?.electron || 'N/A',
    chromeVersion: window.process?.versions?.chrome || nav.userAgent.match(/Chrome\/(\S+)/)?.[1] || 'N/A',
    nodeVersion: window.process?.versions?.node || 'N/A',
    appVersion: getBundledAppVersion(),
    windowCount: 1,
    storageUsed: estimateStorageUsed(),
  };
}

function runDiagnostics(): DiagnosticEntry[] {
  const checks: DiagnosticEntry[] = [];
  // Storage check
  const storageBytes = estimateStorageUsed();
  const storageLimit = 5 * 1024 * 1024;
  const storagePct = storageBytes / storageLimit;
  checks.push({
    label: 'Local Storage',
    status: storagePct > 0.8 ? 'warning' : 'ok',
    detail: `${formatBytes(storageBytes)} / ${formatBytes(storageLimit)} (${(storagePct * 100).toFixed(1)}%)`,
  });
  // Memory check
  const perf = performance as any;
  if (perf.memory) {
    const memPct = perf.memory.usedJSHeapSize / perf.memory.jsHeapSizeLimit;
    checks.push({
      label: 'JS Heap',
      status: memPct > 0.8 ? 'warning' : memPct > 0.95 ? 'error' : 'ok',
      detail: `${formatBytes(perf.memory.usedJSHeapSize)} / ${formatBytes(perf.memory.jsHeapSizeLimit)}`,
    });
  }
  // Online check
  checks.push({
    label: 'Network',
    status: navigator.onLine ? 'ok' : 'warning',
    detail: navigator.onLine ? 'Connected' : 'Offline',
  });
  // Service worker check
  checks.push({
    label: 'Service Worker',
    status: 'serviceWorker' in navigator ? 'ok' : 'warning',
    detail: 'serviceWorker' in navigator ? 'Available' : 'Not supported',
  });
  // Cookie check
  checks.push({
    label: 'Cookies',
    status: navigator.cookieEnabled ? 'ok' : 'warning',
    detail: navigator.cookieEnabled ? 'Enabled' : 'Disabled',
  });
  // Device pixel ratio
  checks.push({
    label: 'Display DPR',
    status: 'ok',
    detail: `${window.devicePixelRatio}x`,
  });
  // Screen resolution
  checks.push({
    label: 'Screen',
    status: 'ok',
    detail: `${window.screen.width} x ${window.screen.height}`,
  });
  // Window size
  checks.push({
    label: 'Window Size',
    status: 'ok',
    detail: `${window.innerWidth} x ${window.innerHeight}`,
  });
  return checks;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const SystemInfo: React.FC = memo(() => {
  const [metrics, setMetrics] = useState<SystemMetrics>(getSystemMetrics);
  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>(() => runDiagnostics());
  const [tab, setTab] = useState<'overview' | 'diagnostics'>('overview');

  const refresh = useCallback(() => {
    setMetrics(getSystemMetrics());
    setDiagnostics(runDiagnostics());
  }, []);

  useEffect(() => {
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  const memPct = metrics.memoryTotal > 0 ? (metrics.memoryUsed / metrics.memoryTotal * 100) : 0;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>System Info</h2>
        <button onClick={refresh} style={styles.refreshBtn} aria-label="Refresh system info">Refresh</button>
      </div>

      {/* Tab bar */}
      <div style={styles.tabBar}>
        {(['overview', 'diagnostics'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}>
            {t === 'overview' ? 'Overview' : 'Diagnostics'}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div style={styles.content}>
          {/* Resource gauges */}
          <div style={styles.gaugeRow}>
            <div style={styles.gaugeCard}>
              <div style={styles.gaugeLabel}>Memory</div>
              <div style={styles.gaugeBar}><div style={{ ...styles.gaugeFill, width: `${memPct}%`, background: memPct > 80 ? '#ef4444' : '#3b82f6' }} /></div>
              <div style={styles.gaugeValue}>{formatBytes(metrics.memoryUsed)}</div>
            </div>
            <div style={styles.gaugeCard}>
              <div style={styles.gaugeLabel}>Storage</div>
              <div style={styles.gaugeBar}><div style={{ ...styles.gaugeFill, width: `${Math.min(100, metrics.storageUsed / (5 * 1024 * 1024) * 100)}%`, background: '#10b981' }} /></div>
              <div style={styles.gaugeValue}>{formatBytes(metrics.storageUsed)}</div>
            </div>
          </div>

          {/* System details */}
          <div style={styles.infoGrid}>
            <InfoRow label="DEX Version" value={metrics.appVersion} />
            <InfoRow label="Platform" value={metrics.platform} />
            <InfoRow label="Architecture" value={metrics.arch} />
            <InfoRow label="Electron" value={metrics.electronVersion} />
            <InfoRow label="Chrome" value={metrics.chromeVersion} />
            <InfoRow label="Node.js" value={metrics.nodeVersion} />
            <InfoRow label="Session Uptime" value={formatUptime(metrics.uptime)} />
            <InfoRow label="Window Count" value={String(metrics.windowCount)} />
            <InfoRow label="Display DPR" value={`${window.devicePixelRatio}x`} />
            <InfoRow label="Viewport" value={`${window.innerWidth} x ${window.innerHeight}`} />
          </div>
        </div>
      ) : (
        <div style={styles.content}>
          {diagnostics.map((d, i) => (
            <div key={i} style={styles.diagRow}>
              <span style={{ ...styles.diagDot, background: d.status === 'ok' ? '#10b981' : d.status === 'warning' ? '#f59e0b' : '#ef4444' }} />
              <span style={styles.diagLabel}>{d.label}</span>
              <span style={styles.diagDetail}>{d.detail}</span>
            </div>
          ))}
          <button onClick={refresh} style={{ ...styles.refreshBtn, marginTop: 12 }}>Run All Checks</button>
        </div>
      )}
    </div>
  );
});

SystemInfo.displayName = 'SystemInfo';

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={styles.infoRow}>
    <span style={styles.infoLabel}>{label}</span>
    <span style={styles.infoValue}>{value}</span>
  </div>
);

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', padding: 16, overflow: 'auto', gap: 12 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  refreshBtn: { padding: '5px 12px', borderRadius: 6, border: '1px solid var(--color-border, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  tabBar: { display: 'flex', gap: 4 },
  tab: { padding: '5px 14px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  tabActive: { background: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
  content: { display: 'flex', flexDirection: 'column', gap: 10, flex: 1 },
  gaugeRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  gaugeCard: { padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-border, rgba(255,255,255,0.06))' },
  gaugeLabel: { fontSize: 11, fontWeight: 600, marginBottom: 6, color: 'var(--color-text-muted)' },
  gaugeBar: { height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  gaugeFill: { height: '100%', borderRadius: 3, transition: 'width 0.3s' },
  gaugeValue: { fontSize: 11, fontWeight: 700, marginTop: 4 },
  infoGrid: { display: 'flex', flexDirection: 'column', gap: 1 },
  infoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.01)' },
  infoLabel: { fontSize: 12, color: 'var(--color-text-muted)' },
  infoValue: { fontSize: 12, fontWeight: 600, fontFamily: 'monospace' },
  diagRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.01)' },
  diagDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  diagLabel: { fontSize: 12, fontWeight: 600, flex: 1 },
  diagDetail: { fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'monospace' },
};

export default SystemInfo;
