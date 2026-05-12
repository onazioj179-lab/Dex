import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DexIcon from '../components/DexIcon';
import { APP_DEFINITIONS, useRunningApps } from '../store/runningApps';

interface SystemProcess {
  pid: number;
  name: string;
  cpu?: number;
  memory?: number;
}

interface SystemStatusInfo {
  cpu?: { usage: number; cores: number };
  memory?: { total: number; used: number; percent: number };
  battery?: { percent: number; charging: boolean };
}

const HISTORY_LENGTH = 120;

const formatAge = (timestamp: number): string => {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const toneFor = (percent: number): string => (percent > 80 ? '#FF453A' : percent > 55 ? '#FF9F0A' : '#30D158');

interface SparklineProps {
  history: number[];
  color: string;
  height?: number;
  max?: number;
  ariaLabel: string;
}

const Sparkline: React.FC<SparklineProps> = ({ history, color, height = 46, max = 100, ariaLabel }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const widthPx = Math.max(60, Math.floor(rect.width));
    const heightPx = Math.max(20, Math.floor(rect.height));
    if (canvas.width !== widthPx * dpr || canvas.height !== heightPx * dpr) {
      canvas.width = widthPx * dpr;
      canvas.height = heightPx * dpr;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, widthPx, heightPx);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let gridIndex = 1; gridIndex < 4; gridIndex++) {
      const y = (heightPx / 4) * gridIndex;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(widthPx, y);
      ctx.stroke();
    }

    if (history.length < 2) return;

    const samples = history.slice(-HISTORY_LENGTH);
    const stepX = widthPx / (HISTORY_LENGTH - 1);
    const startIndex = HISTORY_LENGTH - samples.length;
    const safeMax = max <= 0 ? 1 : max;

    const pointFor = (value: number, index: number): [number, number] => {
      const clamped = Math.max(0, Math.min(safeMax, value));
      const x = (startIndex + index) * stepX;
      const y = heightPx - (clamped / safeMax) * (heightPx - 4) - 2;
      return [x, y];
    };

    const gradient = ctx.createLinearGradient(0, 0, 0, heightPx);
    gradient.addColorStop(0, color + '55');
    gradient.addColorStop(1, color + '00');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    const [firstX, firstY] = pointFor(samples[0], 0);
    ctx.moveTo(firstX, heightPx);
    ctx.lineTo(firstX, firstY);
    for (let i = 1; i < samples.length; i++) {
      const [x, y] = pointFor(samples[i], i);
      ctx.lineTo(x, y);
    }
    const lastSampleX = (startIndex + samples.length - 1) * stepX;
    ctx.lineTo(lastSampleX, heightPx);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(firstX, firstY);
    for (let i = 1; i < samples.length; i++) {
      const [x, y] = pointFor(samples[i], i);
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    const [endX, endY] = pointFor(samples[samples.length - 1], samples.length - 1);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(endX, endY, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }, [history, color, max]);

  return <canvas ref={canvasRef} role="img" aria-label={ariaLabel} style={{ width: '100%', height, display: 'block' }} />;
};

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  history: number[];
  tone: string;
  max?: number;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, detail, history, tone, max = 100 }) => (
  <div style={styles.statCard}>
    <div style={styles.statLabel}>{label}</div>
    <div style={{ ...styles.statValue, color: tone }}>{value}</div>
    <div style={styles.statDetail}>{detail}</div>
    <div style={styles.sparkWrap}>
      <Sparkline history={history} color={tone} ariaLabel={`${label} history`} max={max} />
    </div>
  </div>
);

const TaskManager: React.FC = () => {
  const runningApps = useRunningApps(state => state.runningApps);
  const currentAppId = useRunningApps(state => state.currentAppId);
  const closeApp = useRunningApps(state => state.closeApp);
  const setCurrentApp = useRunningApps(state => state.setCurrentApp);
  const [processes, setProcesses] = useState<SystemProcess[]>([]);
  const [status, setStatus] = useState<SystemStatusInfo>({});
  const [filter, setFilter] = useState('');
  const [bridgeAvailable, setBridgeAvailable] = useState(true);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memoryHistory, setMemoryHistory] = useState<number[]>([]);
  const [processHistory, setProcessHistory] = useState<number[]>([]);
  const [appHistory, setAppHistory] = useState<number[]>([]);

  const pushSample = useCallback((setter: React.Dispatch<React.SetStateAction<number[]>>, value: number) => {
    setter(prev => {
      const next = prev.length >= HISTORY_LENGTH ? prev.slice(prev.length - HISTORY_LENGTH + 1) : prev.slice();
      next.push(Number.isFinite(value) ? value : 0);
      return next;
    });
  }, []);

  const refreshStatus = useCallback(async () => {
    const dexApi = (window as any).dex;
    if (!dexApi?.system?.getStatus) {
      setBridgeAvailable(false);
      return;
    }
    try {
      const systemStatus = await dexApi.system.getStatus().catch(() => null);
      if (systemStatus) {
        setStatus(systemStatus);
        pushSample(setCpuHistory, systemStatus?.cpu?.usage ?? 0);
        pushSample(setMemoryHistory, systemStatus?.memory?.percent ?? 0);
        setBridgeAvailable(true);
      }
    } catch {
      setBridgeAvailable(false);
    }
  }, [pushSample]);

  const refreshProcesses = useCallback(async () => {
    const dexApi = (window as any).dex;
    if (!dexApi?.system?.getProcesses) {
      setBridgeAvailable(false);
      return;
    }
    try {
      const processList = await dexApi.system.getProcesses().catch(() => []);
      const list = Array.isArray(processList) ? processList : [];
      setProcesses(list);
      pushSample(setProcessHistory, list.length);
      setBridgeAvailable(true);
    } catch {
      setBridgeAvailable(false);
    }
  }, [pushSample]);

  useEffect(() => {
    refreshStatus();
    refreshProcesses();
    const statusTimer = window.setInterval(refreshStatus, 1000);
    const processTimer = window.setInterval(refreshProcesses, 3000);
    return () => {
      window.clearInterval(statusTimer);
      window.clearInterval(processTimer);
    };
  }, [refreshStatus, refreshProcesses]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      pushSample(setAppHistory, runningApps.filter(app => app.id !== 'home').length);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pushSample, runningApps]);

  const visibleProcesses = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const sortedProcesses = [...processes].sort((first, second) => (second.cpu || 0) - (first.cpu || 0));
    if (!query) return sortedProcesses.slice(0, 80);
    return sortedProcesses
      .filter(process => process.name.toLowerCase().includes(query) || String(process.pid).includes(query))
      .slice(0, 80);
  }, [filter, processes]);

  const shellApps = runningApps.filter(app => app.id !== 'home');
  const cpuUsage = status.cpu?.usage ?? 0;
  const memoryPercent = status.memory?.percent ?? 0;
  const memoryDetail = status.memory
    ? `${(status.memory.used / 1024 ** 3).toFixed(1)} / ${(status.memory.total / 1024 ** 3).toFixed(1)} GB`
    : 'Waiting for system bridge';
  const cpuDetail = status.cpu
    ? `${status.cpu.cores || '?'} cores - ${cpuUsage > 80 ? 'High load' : cpuUsage > 55 ? 'Moderate' : 'Nominal'}`
    : 'Waiting for system bridge';
  const processCount = processes.length;
  const appsTone = shellApps.length > 12 ? '#FF9F0A' : '#0A84FF';

  const handleManualRefresh = () => {
    refreshStatus();
    refreshProcesses();
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.titleWrap}>
          <span style={styles.titleIcon}><DexIcon name="activity" size={18} color="#fff" strokeWidth={2.25} /></span>
          <div>
            <h2 style={styles.title}>Task Manager</h2>
            <div style={styles.subtitle}>Live performance, running apps, and process activity</div>
          </div>
        </div>
        <button style={styles.refreshButton} onClick={handleManualRefresh} aria-label="Refresh Task Manager">
          <DexIcon name="refresh" size={14} /> Refresh
        </button>
      </div>

      <div style={styles.statsGrid}>
        <MetricCard
          label="DEX Apps"
          value={String(shellApps.length)}
          detail={`${runningApps.length} sessions tracked`}
          history={appHistory}
          tone={appsTone}
          max={Math.max(8, ...appHistory, shellApps.length)}
        />
        <MetricCard
          label="CPU"
          value={`${cpuUsage}%`}
          detail={cpuDetail}
          history={cpuHistory}
          tone={toneFor(cpuUsage)}
        />
        <MetricCard
          label="Memory"
          value={`${memoryPercent}%`}
          detail={memoryDetail}
          history={memoryHistory}
          tone={toneFor(memoryPercent)}
        />
        <MetricCard
          label="Processes"
          value={bridgeAvailable ? String(processCount) : 'Local'}
          detail={bridgeAvailable ? `${visibleProcesses.length} shown - sampled every 3s` : 'DEX apps only'}
          history={processHistory}
          tone="#5E5CE6"
          max={Math.max(50, ...processHistory)}
        />
      </div>

      <div style={styles.contentGrid}>
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <span>Open Apps</span>
            <span style={styles.countPill}>{shellApps.length}</span>
          </div>
          <div style={styles.list}>
            {shellApps.length === 0 ? (
              <div style={styles.empty}>No apps are currently open.</div>
            ) : shellApps.map(app => {
              const definition = APP_DEFINITIONS[app.id];
              const active = currentAppId === app.id;
              return (
                <div key={app.id} style={{ ...styles.appRow, borderColor: active ? 'rgba(74,158,255,0.42)' : 'var(--color-border-subtle)' }}>
                  <div style={styles.appGlyph}><DexIcon name={definition?.icon || app.icon || app.id} size={18} color="#fff" strokeWidth={2.2} /></div>
                  <div style={styles.appMeta}>
                    <div style={styles.appName}>{definition?.name || app.name}</div>
                    <div style={styles.appDetail}>{active ? 'Focused' : 'Background'} - open {formatAge(app.launchedAt)}</div>
                  </div>
                  <button style={styles.ghostButton} onClick={() => setCurrentApp(app.id)} aria-label={`Focus ${definition?.name || app.name}`}>Focus</button>
                  <button style={styles.endButton} onClick={() => closeApp(app.id)} aria-label={`End ${definition?.name || app.name}`}>End</button>
                </div>
              );
            })}
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <span>System Processes</span>
            <input
              value={filter}
              onChange={event => setFilter(event.target.value)}
              placeholder="Filter"
              aria-label="Filter system processes"
              style={styles.filterInput}
            />
          </div>
          <div style={styles.processTableHead}>
            <span>Name</span>
            <span style={{ textAlign: 'right' }}>PID</span>
            <span style={{ textAlign: 'right' }}>CPU</span>
            <span style={{ textAlign: 'right' }}>Memory</span>
          </div>
          <div style={styles.processTable}>
            {!bridgeAvailable ? (
              <div style={styles.empty}>Native process bridge is unavailable in this build. DEX app management remains active.</div>
            ) : visibleProcesses.length === 0 ? (
              <div style={styles.empty}>No processes to show yet.</div>
            ) : visibleProcesses.map(process => {
              const cpuValue = process.cpu || 0;
              const cpuColor = cpuValue > 50 ? '#FF453A' : cpuValue > 20 ? '#FF9F0A' : 'var(--color-text-secondary)';
              return (
                <div key={`${process.pid}-${process.name}`} style={styles.processRow}>
                  <span style={styles.processName}>{process.name}</span>
                  <span style={styles.processPid}>{process.pid}</span>
                  <span style={{ ...styles.processMetric, color: cpuColor }}>{cpuValue.toFixed(1)}%</span>
                  <span style={styles.processMetric}>{Math.round(process.memory || 0)} MB</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 14,
    padding: 18, color: 'var(--color-text-primary)', background: 'var(--pg-surface)',
    backdropFilter: 'blur(28px) saturate(180%)', WebkitBackdropFilter: 'blur(28px) saturate(180%)',
    overflow: 'hidden',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  titleWrap: { display: 'flex', alignItems: 'center', gap: 10 },
  titleIcon: { width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--color-accent)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff', boxShadow: '0 8px 22px rgba(10,132,255,0.28)' },
  title: { margin: 0, fontSize: 18, fontWeight: 750, letterSpacing: 0 },
  subtitle: { fontSize: 12, color: 'var(--color-text-secondary)' },
  refreshButton: { display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 11px', borderRadius: 8, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-glass)', color: 'var(--color-text-primary)', cursor: 'pointer' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 },
  statCard: { padding: 12, borderRadius: 10, background: 'var(--color-bg-glass)', border: '1px solid var(--color-border-subtle)', boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 4 },
  statLabel: { fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  statValue: { fontSize: 24, fontWeight: 760, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 },
  statDetail: { fontSize: 11, color: 'var(--color-text-tertiary)' },
  sparkWrap: { marginTop: 6, height: 46 },
  contentGrid: { flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(300px, 0.9fr) minmax(340px, 1.1fr)', gap: 12 },
  panel: { minHeight: 0, display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden', background: 'var(--color-bg-glass)', border: '1px solid var(--color-border-subtle)' },
  panelHeader: { height: 42, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 12px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: 12, fontWeight: 700 },
  countPill: { padding: '2px 7px', borderRadius: 999, background: 'rgba(74,158,255,0.16)', color: 'var(--color-accent)', fontSize: 11 },
  list: { flex: 1, minHeight: 0, overflow: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 },
  appRow: { display: 'flex', alignItems: 'center', gap: 9, padding: 9, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border-subtle)' },
  appGlyph: { width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--color-accent)', color: '#fff', flexShrink: 0, boxShadow: '0 6px 18px rgba(10,132,255,0.24)' },
  appMeta: { flex: 1, minWidth: 0 },
  appName: { fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  appDetail: { marginTop: 2, fontSize: 11, color: 'var(--color-text-tertiary)' },
  ghostButton: { height: 28, padding: '0 9px', borderRadius: 7, border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' },
  endButton: { height: 28, padding: '0 9px', borderRadius: 7, border: '1px solid rgba(255,69,58,0.34)', background: 'rgba(255,69,58,0.10)', color: '#FF8A82', cursor: 'pointer' },
  filterInput: { width: 150, height: 28, borderRadius: 7, border: '1px solid var(--color-border-subtle)', background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-primary)', padding: '0 9px', outline: 'none' },
  processTableHead: { display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 70px 70px 80px', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  processTable: { flex: 1, minHeight: 0, overflow: 'auto' },
  processRow: { display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 70px 70px 80px', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', fontSize: 12 },
  processName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  processPid: { color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' },
  processMetric: { color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' },
  empty: { padding: 18, color: 'var(--color-text-tertiary)', fontSize: 12, lineHeight: 1.5 },
};

export default TaskManager;
