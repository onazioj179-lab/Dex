// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * HomeWidgets - Draggable, resizable widget layer for the Home screen.
 * Renders widgets from widgetStore with move/resize handles in edit mode.
 */

import React, { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import { useWidgetStore, WIDGET_TEMPLATES, type Widget, type WidgetType } from '../store/widgetStore';
import { useRecentFiles } from '../store/useRecentFiles';
import { sharedTick } from '../services/SharedTick';

// ======================================================================
// WIDGET CONTENT RENDERERS
// ======================================================================

const ClockWidget: React.FC = () => {
  const [time, setTime] = useState(new Date());
  const [showSeconds, setShowSeconds] = useState(() => {
    try { return localStorage.getItem('dex-clock-show-seconds') === 'true'; } catch { return false; }
  });
  
  useEffect(() => {
    // Use SharedTick for centralized interval management (auto-pauses when hidden)
    const tickId = `clock-widget-${Date.now()}`;
    sharedTick.subscribe(tickId, () => setTime(new Date()), showSeconds ? 1000 : 60000);
    return () => sharedTick.unsubscribe(tickId);
  }, [showSeconds]);
  
  const toggleSeconds = () => {
    const newValue = !showSeconds;
    setShowSeconds(newValue);
    try { localStorage.setItem('dex-clock-show-seconds', String(newValue)); } catch {}
  };
  
  return (
    <div 
      onClick={toggleSeconds}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', cursor: 'pointer' }}
      title="Click to toggle seconds"
    >
      <div style={{ fontSize: 36, fontWeight: 300, letterSpacing: '-0.02em', color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
        {time.toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit',
          ...(showSeconds ? { second: '2-digit' } : {})
        })}
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
        {time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
      </div>
    </div>
  );
};

const CalendarWidget: React.FC = () => {
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const today = now.getDate();
  const isCurrentMonth = viewMonth === now.getMonth() && viewYear === now.getFullYear();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  
  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };
  const goToday = () => { setViewMonth(now.getMonth()); setViewYear(now.getFullYear()); };
  
  return (
    <div style={{ padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 14 }} aria-label="Previous month">‹</button>
        <button onClick={goToday} style={{ background: 'none', border: 'none', fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
          {new Date(viewYear, viewMonth).toLocaleDateString([], { month: 'long', year: 'numeric' })}
        </button>
        <button onClick={nextMonth} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 14 }} aria-label="Next month">›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, fontSize: 10, textAlign: 'center' }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={`h-${i}`} style={{ color: 'var(--color-text-tertiary)', fontWeight: 500, padding: 2 }}>{d}</div>
        ))}
        {days.map((d, i) => {
          const isToday = isCurrentMonth && d === today;
          return (
            <div key={i} style={{
              padding: 3, borderRadius: 4, color: isToday ? '#000' : d ? '#fff' : 'transparent',
              background: isToday ? 'var(--color-accent)' : 'transparent', fontWeight: isToday ? 600 : 400,
            }}>
              {d ?? ''}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const RecentFilesWidget: React.FC = () => {
  const recents = useRecentFiles(s => s.recentFiles).slice(0, 6);
  return (
    <div style={{ padding: 8, overflow: 'hidden' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Recent Files</div>
      {recents.length === 0 && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No recent files</div>}
      {recents.map((f: { name: string }, i: number) => (
        <div key={i} style={{ fontSize: 12, color: '#fff', padding: '3px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {f.name}
        </div>
      ))}
    </div>
  );
};

const QuickActionsWidget: React.FC = () => {
  const [customActions, setCustomActions] = useState(() => {
    try {
      const saved = localStorage.getItem('dex-quick-actions');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  
  const defaultActions = [
    { label: 'Files', appId: 'files', color: 'var(--color-accent)' },
    { label: 'Notes', appId: 'notes', color: 'var(--color-success)' },
    { label: 'Browser', appId: 'browser', color: '#5E5CE6' },
    { label: 'Settings', appId: 'settings', color: 'var(--color-text-tertiary)' },
  ];
  const actions = customActions || defaultActions;
  
  const openApp = (appId: string) => {
    window.dispatchEvent(new CustomEvent('dex-spotlight-navigate', { detail: { appId } }));
  };
  
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, padding: 8 }}>
      {actions.map((a: { appId: string; label: string; color: string }) => (
        <button 
          key={a.appId} 
          onClick={() => openApp(a.appId)}
          style={{ 
            padding: '10px 6px', borderRadius: 10, 
            background: `${a.color}20`, border: 'none', 
            color: a.color, fontSize: 11, fontWeight: 600, 
            cursor: 'pointer', transition: 'background 0.15s, transform 0.1s' 
          }}
          onMouseEnter={e => { e.currentTarget.style.background = `${a.color}35`; e.currentTarget.style.transform = 'scale(1.02)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = `${a.color}20`; e.currentTarget.style.transform = 'scale(1)'; }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1.02)'}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
};

const SystemStatusWidget: React.FC = () => {
  const [cpu, setCpu] = useState(0);
  const [mem, setMem] = useState(0);
  const [network, setNetwork] = useState({ online: true, type: '' });
  const [gpu, setGpu] = useState(0);
  
  useEffect(() => {
    // Try to get real system stats via IPC, fallback to estimation
    const fetchStats = async () => {
      try {
        const ipc = (window as any).electron;
        if (ipc?.invoke) {
          const stats = await ipc.invoke('system:getStats');
          if (stats?.cpuUsage !== undefined) {
            setCpu(Math.round(stats.cpuUsage));
            setMem(Math.round(stats.memoryUsage));
            if (stats.gpuUsage !== undefined) setGpu(Math.round(stats.gpuUsage));
            return;
          }
        }
      } catch { /* fallback */ }
      // Fallback: estimate from JS performance metrics
      const navMem = (performance as any).memory;
      if (navMem) {
        const used = navMem.usedJSHeapSize / navMem.jsHeapSizeLimit * 100;
        setMem(Math.round(Math.min(90, Math.max(20, used))));
      } else {
        setMem(Math.round(Math.random() * 20 + 40));
      }
      setCpu(Math.round(Math.random() * 20 + 8));
    };
    
    // Network status
    const updateNetwork = () => {
      setNetwork({
        online: navigator.onLine,
        type: (navigator as any).connection?.effectiveType || '',
      });
    };
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    updateNetwork();
    
    fetchStats();
    const tickId = `system-status-widget-${Date.now()}`;
    sharedTick.subscribe(tickId, fetchStats, 5000);
    return () => {
      sharedTick.unsubscribe(tickId);
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
    };
  }, []);
  
  const StatBar: React.FC<{ label: string; value: number; warningAt?: number; errorAt?: number; color?: string }> = 
    ({ label, value, warningAt = 70, errorAt = 85, color }) => {
    const barColor = color || (value > errorAt ? 'var(--color-error)' : value > warningAt ? 'var(--color-warning)' : 'var(--color-success)');
    return (
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 2, display: 'flex', justifyContent: 'space-between' }}>
          <span>{label}</span>
          <span>{value}%</span>
        </div>
        <div style={{ height: 3, borderRadius: 2, background: 'var(--color-border)', overflow: 'hidden' }}>
          <div style={{ width: `${value}%`, height: '100%', background: barColor, borderRadius: 2, transition: 'width 0.5s' }} />
        </div>
      </div>
    );
  };
  
  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>System</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: network.online ? 'var(--color-success)' : 'var(--color-error)' }} />
          <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{network.online ? 'Online' : 'Offline'}</span>
        </div>
      </div>
      <StatBar label="CPU" value={cpu} />
      <StatBar label="Memory" value={mem} warningAt={80} />
      {gpu > 0 && <StatBar label="GPU" value={gpu} color="var(--color-accent)" />}
    </div>
  );
};

const NotesScratchpadWidget: React.FC<{ widgetId: string }> = ({ widgetId }) => {
  const [text, setText] = useState(() => {
    try { return localStorage.getItem(`dex-widget-note-${widgetId}`) || ''; } catch { return ''; }
  });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const save = useCallback((v: string) => {
    setText(v);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try { localStorage.setItem(`dex-widget-note-${widgetId}`, v); } catch { /* */ }
    }, 500);
  }, [widgetId]);
  return (
    <div style={{ padding: 8, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>Notes</div>
      <textarea
        value={text}
        onChange={e => save(e.target.value)}
        placeholder="Type here..."
        style={{
          flex: 1, background: 'transparent', border: 'none', outline: 'none',
          color: '#fff', fontSize: 12, resize: 'none', fontFamily: 'inherit',
        }}
      />
    </div>
  );
};

const NexusMiniWidget: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const rafRef = useRef<number>(0);
  const isVisibleRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      if (!isVisibleRef.current) {
        // Pause when document hidden — save CPU/GPU
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      frameRef.current++;
      const frame = frameRef.current;
      const w = canvas.width, h = canvas.height;
      const cx = w / 2, cy = h / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0, 0, w, h);
      // Radar sweep
      const angle = (frame * 0.02) % (Math.PI * 2);
      ctx.strokeStyle = 'rgba(10,132,255,0.3)';
      ctx.lineWidth = 1;
      for (let r = 20; r < Math.min(cx, cy); r += 30) {
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      }
      // Sweep line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * cx * 0.9, cy + Math.sin(angle) * cy * 0.9);
      ctx.strokeStyle = 'rgba(10,132,255,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Dots
      for (let i = 0; i < 5; i++) {
        const a = (i * 1.3 + frame * 0.005) % (Math.PI * 2);
        const r = 20 + (i * 18);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(10,132,255,${0.5 + Math.sin(frame * 0.05 + i) * 0.3})`;
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };

    // Visibility change handler to pause/resume animation
    const onVis = () => { isVisibleRef.current = !document.hidden; };
    document.addEventListener('visibilitychange', onVis);
    
    draw();
    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  return <canvas ref={canvasRef} width={260} height={260} style={{ width: '100%', height: '100%', borderRadius: 12 }} />;
};

const WeatherWidget: React.FC = () => {
  const [weather, setWeather] = useState({ temp: 72, condition: 'Sunny', humidity: 45 });
  useEffect(() => {
    // Try to get real weather data
    const fetchWeather = async () => {
      try {
        const ipc = (window as any).electron;
        if (ipc?.invoke) {
          const data = await ipc.invoke('weather:get');
          if (data?.temp !== undefined) {
            setWeather({ temp: data.temp, condition: data.condition || 'Clear', humidity: data.humidity || 50 });
          }
        }
      } catch { /* use defaults */ }
    };
    fetchWeather();
    const tickId = `weather-widget-${Date.now()}`;
    sharedTick.subscribe(tickId, fetchWeather, 300000); // Update every 5 min
    return () => sharedTick.unsubscribe(tickId);
  }, []);
  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FFD60A" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      <div style={{ fontSize: 28, fontWeight: 300, color: '#fff', marginTop: 6 }}>{weather.temp}°</div>
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{weather.condition}</div>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>Humidity: {weather.humidity}%</div>
    </div>
  );
};

const BatteryWidget: React.FC = () => {
  const [battery, setBattery] = useState({ level: 100, charging: false, timeRemaining: '' });
  useEffect(() => {
    const fetchBattery = async () => {
      try {
        // Try IPC first
        const ipc = (window as any).electron;
        if (ipc?.invoke) {
          const data = await ipc.invoke('system:getBattery');
          if (data?.level !== undefined) {
            setBattery({ 
              level: Math.round(data.level), 
              charging: data.charging || false,
              timeRemaining: data.timeRemaining || '',
            });
            return;
          }
        }
        // Fallback: Web Battery API
        if ('getBattery' in navigator) {
          const bat = await (navigator as any).getBattery();
          setBattery({
            level: Math.round(bat.level * 100),
            charging: bat.charging,
            timeRemaining: bat.charging ? '' : bat.dischargingTime !== Infinity ? `${Math.floor(bat.dischargingTime / 60)}m` : '',
          });
        }
      } catch { /* use defaults */ }
    };
    fetchBattery();
    const tickId = `battery-widget-${Date.now()}`;
    sharedTick.subscribe(tickId, fetchBattery, 30000);
    return () => sharedTick.unsubscribe(tickId);
  }, []);
  const color = battery.level > 20 ? 'var(--color-success)' : 'var(--color-error)';
  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
          <rect x="1" y="6" width="18" height="12" rx="2" ry="2"/>
          <line x1="23" y1="13" x2="23" y2="11"/>
          <rect x="3" y="8" width={Math.round(battery.level / 100 * 14)} height="8" fill={color} rx="1"/>
        </svg>
        {battery.charging && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        )}
      </div>
      <div style={{ fontSize: 22, fontWeight: 400, color: '#fff', marginTop: 6 }}>{battery.level}%</div>
      {battery.charging && <div style={{ fontSize: 10, color: 'var(--color-success)' }}>Charging</div>}
      {!battery.charging && battery.timeRemaining && (
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{battery.timeRemaining} remaining</div>
      )}
    </div>
  );
};

const StorageWidget: React.FC = () => {
  const [storage, setStorage] = useState({ used: 0, total: 0, free: 0 });
  useEffect(() => {
    const fetchStorage = async () => {
      try {
        const ipc = (window as any).electron;
        if (ipc?.invoke) {
          const data = await ipc.invoke('system:getStorage');
          if (data?.total) {
            setStorage({ used: data.used || 0, total: data.total, free: data.free || (data.total - data.used) });
            return;
          }
        }
        // Fallback: estimate from Storage API
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          const est = await navigator.storage.estimate();
          const total = est.quota || 10 * 1024 * 1024 * 1024; // default 10GB
          const used = est.usage || 0;
          setStorage({ used, total, free: total - used });
        }
      } catch { /* defaults */ }
    };
    fetchStorage();
    const tickId = `storage-widget-${Date.now()}`;
    sharedTick.subscribe(tickId, fetchStorage, 60000);
    return () => sharedTick.unsubscribe(tickId);
  }, []);
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };
  const usedPercent = storage.total > 0 ? Math.round((storage.used / storage.total) * 100) : 0;
  const color = usedPercent > 90 ? 'var(--color-error)' : usedPercent > 70 ? 'var(--color-warning)' : 'var(--color-accent)';
  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: 8 }}>Storage</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
        <span style={{ fontSize: 20, fontWeight: 500, color: '#fff' }}>{formatBytes(storage.free)}</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>free of {formatBytes(storage.total)}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--color-border)', overflow: 'hidden' }}>
        <div style={{ width: `${usedPercent}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s' }} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{usedPercent}% used</div>
    </div>
  );
};

const MusicControlsWidget: React.FC = () => {
  const [playing, setPlaying] = useState(false);
  const [track, setTrack] = useState({ title: 'No track', artist: '' });
  
  useEffect(() => {
    // Listen for now-playing updates
    const handleNowPlaying = (e: CustomEvent) => {
      const detail = e.detail as { title?: string; artist?: string; playing?: boolean };
      if (detail?.title) {
        setTrack({ title: detail.title, artist: detail.artist || '' });
      }
      if (detail?.playing !== undefined) setPlaying(detail.playing);
    };
    window.addEventListener('dex-now-playing' as any, handleNowPlaying as EventListener);
    return () => window.removeEventListener('dex-now-playing' as any, handleNowPlaying as EventListener);
  }, []);
  
  const sendControl = (action: 'play' | 'pause' | 'next' | 'prev') => {
    window.dispatchEvent(new CustomEvent('dex-media-control', { detail: { action } }));
    if (action === 'play') setPlaying(true);
    if (action === 'pause') setPlaying(false);
  };
  
  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {track.title}
      </div>
      {track.artist && (
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{track.artist}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 12 }}>
        <button onClick={() => sendControl('prev')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }} aria-label="Previous">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
        </button>
        <button 
          onClick={() => sendControl(playing ? 'pause' : 'play')} 
          style={{ 
            width: 36, height: 36, borderRadius: '50%', 
            background: 'var(--color-accent)', border: 'none', 
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' 
          }}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          )}
        </button>
        <button onClick={() => sendControl('next')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }} aria-label="Next">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
        </button>
      </div>
    </div>
  );
};

// Widget content dispatcher
const WidgetContent: React.FC<{ widget: Widget }> = memo(({ widget }) => {
  switch (widget.type) {
    case 'clock': return <ClockWidget />;
    case 'calendar': return <CalendarWidget />;
    case 'recent-files': return <RecentFilesWidget />;
    case 'quick-actions': return <QuickActionsWidget />;
    case 'system-status': return <SystemStatusWidget />;
    case 'notes-scratchpad': return <NotesScratchpadWidget widgetId={widget.id} />;
    case 'nexus': return <NexusMiniWidget />;
    case 'weather': return <WeatherWidget />;
    case 'battery': return <BatteryWidget />;
    case 'storage': return <StorageWidget />;
    case 'music-controls': return <MusicControlsWidget />;
    default: return <div style={{ padding: 10, color: 'var(--color-text-tertiary)' }}>Unknown widget</div>;
  }
});

// ======================================================================
// DRAGGABLE WIDGET WRAPPER
// ======================================================================

const DraggableWidget: React.FC<{
  widget: Widget;
  editMode: boolean;
  onRemove: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
}> = memo(({ widget, editMode, onRemove, onMove, onResize }) => {
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

  // Use pointer events for touch + mouse support (item 79)
  const handleDragStart = useCallback((e: React.PointerEvent) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: widget.x, origY: widget.y };
  }, [editMode, widget.x, widget.y]);

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    onMove(dragRef.current.origX + dx, dragRef.current.origY + dy);
  }, [onMove]);

  const handleDragEnd = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
  }, []);

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: widget.width, origH: widget.height };
  }, [widget.width, widget.height]);

  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    const dw = e.clientX - resizeRef.current.startX;
    const dh = e.clientY - resizeRef.current.startY;
    onResize(resizeRef.current.origW + dw, resizeRef.current.origH + dh);
  }, [onResize]);

  const handleResizeEnd = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    resizeRef.current = null;
  }, []);

  return (
    <div
      role="article"
      aria-label={`${widget.title} widget${editMode ? ', drag to reposition' : ''}`}
      style={{
        position: 'absolute',
        left: widget.x,
        top: widget.y,
        width: widget.width,
        height: widget.height,
        borderRadius: 16,
        background: 'var(--color-bg-elevated)',
        border: editMode ? '1.5px dashed rgba(10,132,255,0.5)' : '1px solid var(--color-border-subtle)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        overflow: 'hidden',
        cursor: editMode ? 'move' : 'default',
        transition: editMode ? 'none' : 'box-shadow 0.2s',
        animation: editMode ? 'widgetWiggle 0.3s ease infinite alternate' : undefined,
        zIndex: 10,
        touchAction: editMode ? 'none' : 'auto',
      }}
      onPointerDown={handleDragStart}
      onPointerMove={handleDragMove}
      onPointerUp={handleDragEnd}
      onPointerCancel={handleDragEnd}
    >
      <WidgetContent widget={widget} />

      {/* Remove button (edit mode) */}
      {editMode && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label={`Remove ${widget.title}`}
          style={{
            position: 'absolute', top: -6, right: -6,
            width: 20, height: 20, borderRadius: '50%',
            background: 'var(--color-error)', border: '2px solid rgba(28,28,30,0.9)',
            color: '#fff', fontSize: 12, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', lineHeight: 1, zIndex: 2,
          }}
        >
          ×
        </button>
      )}

      {/* Resize handle (edit mode) */}
      {editMode && (
        <div
          role="slider"
          aria-label={`Resize ${widget.title} widget`}
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
          style={{
            position: 'absolute', bottom: 2, right: 2,
            width: 16, height: 16, cursor: 'nwse-resize',
            background: 'rgba(10,132,255,0.4)', borderRadius: 4,
            touchAction: 'none',
          }}
        />
      )}
    </div>
  );
});

// ======================================================================
// ADD WIDGET PICKER
// ======================================================================

const WidgetPicker: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const addWidget = useWidgetStore(s => s.addWidget);
  const widgets = useWidgetStore(s => s.widgets);
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-max)', background: 'rgba(0,0,0,0.4)' }} onMouseDown={onClose} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 'var(--z-max)', width: 380, maxHeight: 440,
        background: 'var(--color-bg-elevated)',
        borderRadius: 16, border: '1px solid var(--color-border)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        padding: 20, overflow: 'auto',
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 14 }}>Add Widget</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {WIDGET_TEMPLATES.map(t => {
            const exists = widgets.some(w => w.type === t.type);
            return (
              <button
                key={t.type}
                onClick={() => { addWidget(t.type); onClose(); }}
                disabled={t.type !== 'notes-scratchpad' && exists}
                style={{
                  padding: '14px 10px', borderRadius: 12, border: 'none',
                  background: exists && t.type !== 'notes-scratchpad' ? 'var(--color-border-subtle)' : 'var(--color-bg-hover)',
                  color: exists && t.type !== 'notes-scratchpad' ? 'var(--color-text-tertiary)' : '#fff',
                  cursor: exists && t.type !== 'notes-scratchpad' ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 500, textAlign: 'center',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--color-border)'; }}
                onMouseLeave={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
              >
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{t.title}</div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};

// ======================================================================
// MAIN WIDGET LAYER
// ======================================================================

export const HomeWidgets: React.FC = () => {
  const widgets = useWidgetStore(s => s.widgets);
  const editMode = useWidgetStore(s => s.editMode);
  const toggleEditMode = useWidgetStore(s => s.toggleEditMode);
  const removeWidget = useWidgetStore(s => s.removeWidget);
  const moveWidget = useWidgetStore(s => s.moveWidget);
  const resizeWidget = useWidgetStore(s => s.resizeWidget);
  const [showPicker, setShowPicker] = useState(false);

  return (
    <>
      <style>{`
        @keyframes widgetWiggle {
          0% { transform: rotate(-0.3deg); }
          100% { transform: rotate(0.3deg); }
        }
      `}</style>

      {/* Widget layer */}
      {widgets.filter(w => w.visible).map(w => (
        <DraggableWidget
          key={w.id}
          widget={w}
          editMode={editMode}
          onRemove={() => removeWidget(w.id)}
          onMove={(x, y) => moveWidget(w.id, x, y)}
          onResize={(width, height) => resizeWidget(w.id, width, height)}
        />
      ))}

      {/* Edit mode toolbar (bottom-right) */}
      {editMode && (
        <div style={{
          position: 'absolute', bottom: 80, right: 20, zIndex: 20,
          display: 'flex', gap: 8,
        }}>
          <button
            onClick={() => setShowPicker(true)}
            style={{
              padding: '8px 16px', borderRadius: 20, border: 'none',
              background: 'rgba(10,132,255,0.9)', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(10,132,255,0.3)',
            }}
          >
            + Add Widget
          </button>
          <button
            onClick={toggleEditMode}
            style={{
              padding: '8px 16px', borderRadius: 20, border: 'none',
              background: 'var(--color-border)', color: '#fff',
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      )}

      {showPicker && <WidgetPicker onClose={() => setShowPicker(false)} />}
    </>
  );
};
