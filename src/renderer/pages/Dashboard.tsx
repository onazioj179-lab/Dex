import React, { useState, useEffect, useMemo, memo } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD - App Launcher with Widgets
// Clean macOS-style design with consistent spacing
// ═══════════════════════════════════════════════════════════════════════════

interface AppItem {
  id: string;
  name: string;
  page: string;
  color: string;
  icon: React.ReactNode;
}

interface DashboardProps {
  onNavigate?: (page: string) => void;
}

const APPS: AppItem[] = [
  {
    id: 'notes',
    name: 'Notes',
    page: 'notes',
    color: '#FFD60A',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 4h16v16H4z" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M8 8h8M8 12h8M8 16h4" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    id: 'gallery',
    name: 'Photos',
    page: 'gallery',
    color: '#FF375F',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <path d="M21 15l-5-5L5 21"/>
      </svg>
    )
  },
  {
    id: 'music',
    name: 'Music',
    page: 'audio',
    color: '#FF2D55',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
      </svg>
    )
  },
  {
    id: 'video',
    name: 'Video',
    page: 'video',
    color: '#5856D6',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="4" width="20" height="16" rx="2"/>
        <polygon points="10,8 16,12 10,16" fill="currentColor"/>
      </svg>
    )
  },
  {
    id: 'files',
    name: 'Files',
    page: 'files',
    color: '#007AFF',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
      </svg>
    )
  },
  {
    id: 'transfer',
    name: 'Transfer',
    page: 'transfers',
    color: '#32D74B',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="9"/>
        <path d="M12 8v8M8 12l4 4 4-4"/>
      </svg>
    )
  },
  {
    id: 'workflows',
    name: 'Workflows',
    page: 'workflows',
    color: '#FF9500',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="6" cy="6" r="3"/>
        <circle cx="18" cy="18" r="3"/>
        <path d="M6 9v6a3 3 0 003 3h6"/>
        <path d="M18 15V9a3 3 0 00-3-3H9"/>
      </svg>
    )
  },
  {
    id: 'calendar',
    name: 'Calendar',
    page: 'calendar',
    color: '#64D2FF',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <path d="M16 2v4M8 2v4M3 10h18"/>
        <path d="M8 14h2v2H8z" fill="currentColor"/>
      </svg>
    )
  },
  {
    id: 'power',
    name: 'Power',
    page: 'power',
    color: '#BF5AF2',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
    )
  },
  {
    id: 'settings',
    name: 'Settings',
    page: 'settings',
    color: '#8E8E93',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
      </svg>
    )
  },
  {
    id: 'browser',
    name: 'Browser',
    page: 'browser',
    color: '#0A84FF',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
      </svg>
    )
  },
  {
    id: 'tasks',
    name: 'Tasks',
    page: 'tasks',
    color: '#30D158',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
      </svg>
    )
  },
  {
    id: 'dashboard',
    name: 'Dashboard',
    page: 'dashboard',
    color: '#5E5CE6',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    )
  },
  {
    id: 'calculator',
    name: 'Calculator',
    page: 'calculator',
    color: '#636366',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 12h2M14 12h2M8 16h2M14 16h2"/>
      </svg>
    )
  },
  {
    id: 'passwordgenerator',
    name: 'Passwords',
    page: 'passwordgenerator',
    color: '#FF453A',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
      </svg>
    )
  },
  {
    id: 'rewind',
    name: 'Rewind',
    page: 'rewind',
    color: '#AC8E68',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    )
  },
  {
    id: 'games',
    name: 'Games',
    page: 'games',
    color: '#FF6723',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M6 12h4M8 10v4"/><circle cx="15" cy="11" r="1" fill="currentColor"/><circle cx="18" cy="13" r="1" fill="currentColor"/>
        <path d="M17.32 5H6.68a4 4 0 00-3.978 3.59C2.284 11.4 2 14 2 14s1 7 4 7c1.5 0 2.5-1.5 3.5-3h5c1 1.5 2 3 3.5 3 3 0 4-7 4-7s-.284-2.6-.702-5.41A4 4 0 0017.32 5z"/>
      </svg>
    )
  },
  {
    id: 'kanban',
    name: 'Kanban',
    page: 'kanban',
    color: '#0A84FF',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="6" height="18" rx="1"/><rect x="9" y="3" width="6" height="12" rx="1"/><rect x="16" y="3" width="6" height="15" rx="1"/>
      </svg>
    )
  },
  {
    id: 'achievements',
    name: 'Achievements',
    page: 'achievements',
    color: '#FFD60A',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="8" r="7"/><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12"/>
      </svg>
    )
  },
  {
    id: 'videoeditor',
    name: 'Video Editor',
    page: 'videoeditor',
    color: '#FF375F',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/><path d="M10 4v16"/>
      </svg>
    )
  },
  {
    id: 'imosion',
    name: 'Imosion',
    page: 'imosion',
    color: '#BF5AF2',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
      </svg>
    )
  },
  {
    id: 'prism',
    name: 'Prism',
    page: 'prism',
    color: '#FF9F0A',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polygon points="12 2 2 22 22 22"/><circle cx="12" cy="14" r="3"/>
      </svg>
    )
  },
  {
    id: 'flux',
    name: 'Flux',
    page: 'flux',
    color: '#5E5CE6',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
      </svg>
    )
  },
  {
    id: 'forge',
    name: 'Forge',
    page: 'forge',
    color: '#34C759',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    )
  },
];

const AppIcon: React.FC<{ app: AppItem; onClick: () => void }> = ({ app, onClick }) => {
  return (
    <button 
      onClick={onClick}
      aria-label={`Open ${app.name}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        cursor: 'pointer',
        width: '76px',
        padding: '8px 4px',
        background: 'transparent',
        border: 'none',
        borderRadius: 'var(--radius-lg)',
        transition: 'all 150ms ease',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{
        width: '52px',
        height: '52px',
        borderRadius: 'var(--radius-xl)',
        background: app.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ width: '26px', height: '26px', color: 'white', display: 'flex' }}>
          {app.icon}
        </div>
      </div>
      <span style={{
        fontSize: 'var(--text-sm)',
        textAlign: 'center',
        lineHeight: 1.2,
        maxWidth: '72px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }}>
        {app.name}
      </span>
    </button>
  );
};

const ClockWidget: React.FC = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{
      background: 'var(--color-bg-surface)',
      borderRadius: 'var(--radius-xl)',
      border: '1px solid var(--color-border-subtle)',
      boxShadow: 'var(--shadow-md)',
      padding: '16px 20px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: '140px'
    }}>
      <div style={{
        fontSize: '32px',
        fontWeight: '200',
        color: 'var(--color-text-primary)',
        fontFamily: 'var(--font-family)',
        letterSpacing: '-1px'
      }}>
        {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
      </div>
      <div style={{
        fontSize: 'var(--text-sm)',
        color: 'var(--color-text-tertiary)',
        marginTop: '4px'
      }}>
        {time.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
      </div>
    </div>
  );
};

const WeatherWidget: React.FC = () => {
  const [stats, setStats] = useState<{
    memUsed: string;
    memTotal: string;
    memPct: number;
    uptime: string;
    platform: string;
    cores: number;
  } | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        if (window.electron?.invoke) {
          // Try to get system info from main process
          const info = await window.electron.invoke('capability:system:info');
          if (info) {
            setStats({
              memUsed: `${(info.memUsed / (1024 * 1024 * 1024)).toFixed(1)} GB`,
              memTotal: `${(info.memTotal / (1024 * 1024 * 1024)).toFixed(1)} GB`,
              memPct: Math.round((info.memUsed / info.memTotal) * 100),
              uptime: formatUptime(info.uptime || 0),
              platform: info.platform || navigator.platform,
              cores: info.cores || navigator.hardwareConcurrency || 0,
            });
            return;
          }
        }
      } catch { /* IPC unavailable */ }
      // Fallback: use browser APIs
      const nav = navigator as any;
      const mem = (performance as any).memory;
      setStats({
        memUsed: mem ? `${(mem.usedJSHeapSize / (1024 * 1024)).toFixed(0)} MB` : '—',
        memTotal: mem ? `${(mem.jsHeapSizeLimit / (1024 * 1024)).toFixed(0)} MB` : '—',
        memPct: mem ? Math.round((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100) : 0,
        uptime: '—',
        platform: navigator.platform,
        cores: navigator.hardwareConcurrency || 0,
      });
    };
    fetchStats();
    const timer = setInterval(fetchStats, 10000);
    return () => clearInterval(timer);
  }, []);

  const formatUptime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    return `${h}h ${m}m`;
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(94,92,230,0.35) 0%, rgba(10,132,255,0.25) 100%)',
      backdropFilter: 'blur(12px)',
      borderRadius: 'var(--radius-xl)',
      border: '1px solid rgba(255,255,255,0.14)',
      boxShadow: '0 4px 20px rgba(94,92,230,0.2)',
      padding: '16px 20px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      minWidth: '160px',
      color: 'white',
      gap: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
        </svg>
        <span style={{ fontSize: '14px', fontWeight: '600' }}>System</span>
      </div>
      {stats ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
            <span style={{ opacity: 0.8 }}>Memory</span>
            <span style={{ fontWeight: 500 }}>{stats.memUsed} / {stats.memTotal}</span>
          </div>
          <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${stats.memPct}%`,
              borderRadius: '2px',
              background: stats.memPct > 80 ? '#ff453a' : stats.memPct > 60 ? '#ff9f0a' : '#30d158',
              transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', opacity: 0.75 }}>
            <span>{stats.cores} cores</span>
            <span>{stats.platform}</span>
          </div>
          {stats.uptime !== '—' && (
            <div style={{ fontSize: '11px', opacity: 0.65 }}>
              Uptime: {stats.uptime}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: '12px', opacity: 0.7 }}>Loading...</div>
      )}
    </div>
  );
};

const QuickNoteWidget: React.FC = () => {
  const [note, setNote] = useState(() => {
    try {
      return localStorage.getItem('dex-quick-note') || '';
    } catch { return ''; }
  });

  const saveNote = (text: string) => {
    setNote(text);
    try { localStorage.setItem('dex-quick-note', text); } catch {}
  };

  return (
    <div style={{
      background: 'var(--color-bg-surface)',
      borderRadius: 'var(--radius-xl)',
      border: '1px solid var(--color-border-subtle)',
      boxShadow: 'var(--shadow-md)',
      padding: '12px 14px',
      minWidth: '180px',
      maxWidth: '200px'
    }}>
      <div style={{
        fontSize: 'var(--text-xs)',
        color: 'var(--color-text-tertiary)',
        marginBottom: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 4h16v16H4z"/>
          <path d="M8 8h8M8 12h8M8 16h4"/>
        </svg>
        Quick Note
      </div>
      <textarea
        value={note}
        onChange={(e) => saveNote(e.target.value)}
        maxLength={500}
        placeholder="Type a note..."
        style={{
          width: '100%',
          height: '56px',
          background: 'transparent',
          border: 'none',
          color: 'var(--color-text-primary)',
          fontSize: 'var(--text-sm)',
          resize: 'none',
          outline: 'none',
          fontFamily: 'inherit',
          lineHeight: 1.4
        }}
      />
      <div style={{
        fontSize: 'var(--text-xs)',
        color: note.length >= 450 ? 'var(--color-error, #FF453A)' : 'var(--color-text-tertiary)',
        textAlign: 'right',
        marginTop: '4px',
        opacity: 0.7
      }}>
        {note.length} / 500
      </div>
    </div>
  );
};

const RECENT_APPS_KEY = 'dex-recent-apps';
const MAX_RECENT = 4;

const loadRecentAppIds = (): string[] => {
  try {
    const stored = localStorage.getItem(RECENT_APPS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* ignore */ }
  return [];
};

const saveRecentAppIds = (ids: string[]): void => {
  try {
    localStorage.setItem(RECENT_APPS_KEY, JSON.stringify(ids));
  } catch { /* ignore */ }
};

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [recentAppIds, setRecentAppIds] = useState<string[]>(loadRecentAppIds);

  const handleAppClick = (page: string) => {
    const app = APPS.find(a => a.page === page);
    if (app) {
      setRecentAppIds(prev => {
        const updated = [app.id, ...prev.filter(id => id !== app.id)].slice(0, MAX_RECENT);
        saveRecentAppIds(updated);
        return updated;
      });
    }
    if (onNavigate) {
      onNavigate(page);
    }
  };

  const recentApps: AppItem[] = useMemo(() => recentAppIds.length > 0
    ? recentAppIds.map(id => APPS.find(a => a.id === id)).filter((a): a is AppItem => !!a)
    : APPS.slice(0, MAX_RECENT), [recentAppIds]);

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--color-bg-base)',
      overflow: 'hidden'
    }}>
      {/* Widgets Row */}
      <div
        role="region"
        aria-label="Dashboard widgets"
        style={{
          padding: 'var(--space-4) var(--space-5)',
          display: 'flex',
          gap: 'var(--space-3)',
          flexWrap: 'wrap'
        }}
      >
        <ClockWidget />
        <WeatherWidget />
        <QuickNoteWidget />
      </div>

      {/* Apps Grid */}
      <div style={{
        flex: 1,
        padding: 'var(--space-2) var(--space-5) var(--space-5)',
        overflowY: 'auto'
      }}>
        <div style={{
          fontSize: 'var(--text-sm)',
          fontWeight: '600',
          color: 'var(--color-text-secondary)',
          marginBottom: 'var(--space-4)',
          letterSpacing: '0.3px',
          textTransform: 'uppercase'
        }}>
          Apps
        </div>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, 76px)',
          gap: 'var(--space-4)',
          justifyContent: 'start'
        }}>
          {APPS.map(app => (
            <AppIcon 
              key={app.id} 
              app={app} 
              onClick={() => handleAppClick(app.page)} 
            />
          ))}
        </div>
      </div>

      {/* Dock-style recent apps at bottom */}
      <div style={{
        padding: 'var(--space-3) var(--space-5) var(--space-4)',
        borderTop: '1px solid var(--color-border-subtle)'
      }}>
        <div style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
          marginBottom: 'var(--space-2)',
          textTransform: 'uppercase',
          letterSpacing: '0.3px'
        }}>
          Recent
        </div>
        <div style={{
          display: 'flex',
          gap: 'var(--space-3)'
        }}>
          {recentApps.map(app => (
            <button
              key={`recent-${app.id}`}
              onClick={() => handleAppClick(app.page)}
              aria-label={`Open recent: ${app.name}`}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-lg)',
                background: app.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                boxShadow: 'var(--shadow-sm)',
                border: 'none'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <div style={{ width: '20px', height: '20px', color: 'white', display: 'flex' }}>
                {app.icon}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

Dashboard.displayName = 'Dashboard';
const MemoizedDashboard = memo(Dashboard);
export { Dashboard };
export default MemoizedDashboard;

