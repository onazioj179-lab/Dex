/**
 * APP MANAGER -- macOS Tahoe Style
 * Floating dock with magnification, keep-alive multi-app engine,
 * Launchpad overlay, 25 apps wired, split-screen tiling, traffic light toggle in Settings.
 */

import React, { useState, useMemo, Suspense, lazy, useEffect, useCallback, useRef } from 'react';
import { UnifiedSearch } from './UnifiedSearch';
import { StatusBar, usePerformanceMetrics } from './StatusBar';
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';
import { useEngagementTracker, AchievementToastContainer } from './EngagementTracker';

// ── Lazy-load all 25 apps ─────────────────────────────────────────────────
const Home = lazy(() => import('../pages/Home'));
const Files = lazy(() => import('../pages/Files'));
const Browser = lazy(() => import('../pages/Browser'));
const Settings = lazy(() => import('../pages/Settings'));
const Transfers = lazy(() => import('../pages/Transfers'));
const Dashboard = lazy(() => import('../pages/Dashboard'));
const Notes = lazy(() => import('../pages/Notes'));
const Tasks = lazy(() => import('../pages/Tasks'));
const Power = lazy(() => import('../pages/Power'));
const Workflows = lazy(() => import('../pages/Workflows'));
const Gallery = lazy(() => import('../pages/Gallery'));
const AudioPage = lazy(() => import('../pages/Audio'));
const VideoPage = lazy(() => import('../pages/Video'));
const VideoEditor = lazy(() => import('../DEXAPPLICATIONS/VideoEditor'));
const Imosion = lazy(() => import('../DEXAPPLICATIONS/Imosion'));
const Prism = lazy(() => import('../DEXAPPLICATIONS/Prism'));
const Flux = lazy(() => import('../DEXAPPLICATIONS/Flux'));
const Forge = lazy(() => import('../DEXAPPLICATIONS/Forge'));
const Calculator = lazy(() => import('../DEXAPPLICATIONS/Calculator'));
const Calendar = lazy(() => import('../DEXAPPLICATIONS/Calendar'));
const PasswordGenerator = lazy(() => import('../DEXAPPLICATIONS/PasswordGenerator'));
const Rewind = lazy(() => import('../DEXAPPLICATIONS/Rewind'));
const GamesHub = lazy(() => import('../DEXAPPLICATIONS/Games'));
const KanbanApp = lazy(() => import('../DEXAPPLICATIONS/KanbanApp'));
const AchievementsApp = lazy(() => import('../DEXAPPLICATIONS/Achievements'));

// ── App ID type (all 25) ──────────────────────────────────────────────────
type AppId = 'home' | 'files' | 'browser' | 'settings' | 'transfers' | 'dashboard'
  | 'notes' | 'tasks' | 'power' | 'workflows' | 'gallery' | 'audio' | 'video'
  | 'videoeditor' | 'imosion' | 'prism' | 'flux' | 'forge'
  | 'calculator' | 'calendar' | 'passwordgenerator' | 'rewind' | 'games' | 'kanban' | 'achievements';

// Map AppId to lazy component
const APP_COMPONENTS: Record<AppId, React.LazyExoticComponent<any>> = {
  home: Home, files: Files, browser: Browser, settings: Settings, transfers: Transfers,
  dashboard: Dashboard, notes: Notes, tasks: Tasks, power: Power, workflows: Workflows,
  gallery: Gallery, audio: AudioPage, video: VideoPage,
  videoeditor: VideoEditor, imosion: Imosion, prism: Prism, flux: Flux, forge: Forge,
  calculator: Calculator, calendar: Calendar, passwordgenerator: PasswordGenerator,
  rewind: Rewind, games: GamesHub, kanban: KanbanApp, achievements: AchievementsApp,
};

// ── SVG Icons ─────────────────────────────────────────────────────────────
const Icons: Record<string, JSX.Element> = {
  home: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  files: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  notes: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  browser: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  videoeditor: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 9l5 3-5 3V9z"/></svg>,
  imosion: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
  prism: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  flux: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  forge: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  calculator: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/><line x1="8" y1="18" x2="8" y2="18.01"/><line x1="12" y1="18" x2="16" y2="18"/></svg>,
  calendar: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  settings: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  transfers: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
  dashboard: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>,
  tasks: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  power: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>,
  workflows: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>,
  gallery: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
  audio: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  video: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 9l5 3-5 3V9z"/></svg>,
  passwordgenerator: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  rewind: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 8 14"/><path d="M4.93 4.93l2.83 2.83"/><path d="M2 12h2"/></svg>,
  games: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="6" width="20" height="12" rx="4"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="10" r="1"/><circle cx="16" cy="14" r="1"/></svg>,
  kanban: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="15" rx="1"/></svg>,
  achievements: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7"/><path d="M4 22h16"/><path d="M10 22V8h4v14"/><path d="M8 9h8l-1 5H9L8 9z"/></svg>,
  launchpad: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  chevronLeft: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>,
  chevronRight: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>,
  minimize: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  maximize: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>,
  close: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
};

// ── Dock configuration ────────────────────────────────────────────────────
interface DockItem { id: AppId; label: string; color: string }

const DOCK_LEFT: DockItem[] = [
  { id: 'home', label: 'Home', color: '#ffffff' },
  { id: 'settings', label: 'Settings', color: '#8e8e93' },
];
const DOCK_CREATIVE: DockItem[] = [
  { id: 'videoeditor', label: 'VINX', color: '#bf5af2' },
  { id: 'imosion', label: 'Imosion', color: '#ff9f0a' },
  { id: 'prism', label: 'PRISM', color: '#64d2ff' },
  { id: 'flux', label: 'FLUX', color: '#30d158' },
  { id: 'forge', label: 'FORGE', color: '#ff9f0a' },
];
const DOCK_RIGHT: DockItem[] = [
  { id: 'notes', label: 'Notes', color: '#ffd60a' },
  { id: 'browser', label: 'Browser', color: '#64d2ff' },
  { id: 'files', label: 'Files', color: '#30d158' },
  { id: 'calculator', label: 'Calculator', color: '#8e8e93' },
  { id: 'calendar', label: 'Calendar', color: '#ff2d55' },
];

// All apps for Launchpad — ALL 25 apps organized by category
const LAUNCHPAD_APPS: { id: AppId; label: string; color: string }[] = [
  // System
  { id: 'home', label: 'Home', color: '#ffffff' },
  { id: 'settings', label: 'Settings', color: '#8e8e93' },
  { id: 'dashboard', label: 'Dashboard', color: '#5e5ce6' },
  { id: 'power', label: 'Power', color: '#ff453a' },
  // Productivity
  { id: 'files', label: 'Files', color: '#30d158' },
  { id: 'browser', label: 'Browser', color: '#64d2ff' },
  { id: 'notes', label: 'Notes', color: '#ffd60a' },
  { id: 'tasks', label: 'Tasks', color: '#ff9f0a' },
  { id: 'calendar', label: 'Calendar', color: '#ff2d55' },
  { id: 'workflows', label: 'Workflows', color: '#bf5af2' },
  // Creative Suite
  { id: 'videoeditor', label: 'VINX', color: '#bf5af2' },
  { id: 'imosion', label: 'Imosion', color: '#ff9f0a' },
  { id: 'prism', label: 'PRISM', color: '#64d2ff' },
  { id: 'flux', label: 'FLUX', color: '#30d158' },
  { id: 'forge', label: 'FORGE', color: '#ff9f0a' },
  // Media
  { id: 'gallery', label: 'Gallery', color: '#ff375f' },
  { id: 'audio', label: 'Audio', color: '#ff6482' },
  { id: 'video', label: 'Video', color: '#5e5ce6' },
  // Tools
  { id: 'calculator', label: 'Calculator', color: '#8e8e93' },
  { id: 'passwordgenerator', label: 'Passwords', color: '#30d158' },
  { id: 'transfers', label: 'Share', color: '#10b981' },
  { id: 'rewind', label: 'Rewind', color: '#0078d4' },
  // Entertainment
  { id: 'games', label: 'Games', color: '#ff375f' },
  // Project Management
  { id: 'kanban', label: 'Kanban', color: '#6366f1' },
  // Achievements
  { id: 'achievements', label: 'Trophies', color: '#f59e0b' },
];

// ── Per-app ErrorBoundary ─────────────────────────────────────────────────
class AppErrorBoundary extends React.Component<
  { appId: string; children: React.ReactNode },
  { hasError: boolean; error?: Error; crashes: number }
> {
  constructor(props: { appId: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, crashes: 0 };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, _info: React.ErrorInfo) {
    console.error(`[${this.props.appId}] Crash:`, error.message);
    this.setState(prev => ({ crashes: prev.crashes + 1 }));
  }
  render() {
    if (this.state.hasError) {
      const canRetry = this.state.crashes < 3;
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', background: 'var(--color-bg-base)', gap: 16,
          animation: 'fadeIn 0.25s var(--ease-out)',
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'rgba(255,69,58,0.1)',
            border: '0.5px solid rgba(255,69,58,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff453a" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>App encountered an error</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', maxWidth: 320, textAlign: 'center', lineHeight: 1.5 }}>{this.state.error?.message}</div>
          {canRetry && (
            <button
              onClick={() => this.setState({ hasError: false, error: undefined })}
              style={{
                padding: '8px 22px', background: 'var(--color-accent)', color: '#fff',
                border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 500,
                cursor: 'pointer', marginTop: 4, letterSpacing: '-0.01em',
                transition: 'opacity 0.15s ease, transform 0.12s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
              onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.96)'; }}
              onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            >Restart App</button>
          )}
          {!canRetry && (
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', opacity: 0.6 }}>Too many crashes — please restart DEX</div>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

const Loading = () => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
    background: 'var(--color-bg-base)',
  }}>
    <div style={{
      width: 24, height: 24, borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.08)',
      borderTopColor: 'var(--color-accent)',
      animation: 'spin 0.8s linear infinite',
    }} />
  </div>
);

// ── Settings persistence ──────────────────────────────────────────────────
const getWindowControlStyle = (): 'system' | 'traffic' => {
  try { return (localStorage.getItem('dex-window-controls') as 'system' | 'traffic') || 'system'; } catch { return 'system'; }
};

// ══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════
export const AppManager: React.FC<{ renderApp?: (appId: string) => React.ReactNode; onAppLaunch?: (appId: string) => void }> = () => {
  const {
    runningApps, currentAppId, launchApp, closeApp: closeRunningApp, setCurrentApp: setCurrentRunningApp,
  } = useRunningApps();

  // Silent engagement tracker — watches everything, awards achievements
  const { toastQueue, dismissToast } = useEngagementTracker(currentAppId);

  const [showUnifiedSearch, setShowUnifiedSearch] = useState(false);
  const [showAppMenu, setShowAppMenu] = useState(false);
  const [taskbarVisible, setTaskbarVisible] = useState(false);
  const [dockAutoHide, setDockAutoHide] = useState(true);
  const [navHistory, setNavHistory] = useState<AppId[]>(['home']);
  const [navIndex, setNavIndex] = useState(0);
  const [windowControls, setWindowControls] = useState<'system' | 'traffic'>(getWindowControlStyle);
  const dockRef = useRef<HTMLDivElement>(null);
  const dockHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Split-screen tiling ────────────────────────────────────────────────
  const [splitMode, setSplitMode] = useState<'off' | 'horizontal' | 'vertical'>('off');
  const [splitApp, setSplitApp] = useState<AppId | null>(null);
  const [splitRatio, setSplitRatio] = useState(50);
  const splitDragging = useRef(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  // ── Status row: clock + battery ────────────────────────────────────────
  const [batteryLevel, setBatteryLevel] = useState(100);
  const [batteryCharging, setBatteryCharging] = useState(false);
  const [clockStr, setClockStr] = useState('');
  const perfMetrics = usePerformanceMetrics();

  // Auto-hide dock: show on bottom hover, hide after 2s idle
  const showDock = useCallback(() => {
    if (dockHideTimerRef.current) { clearTimeout(dockHideTimerRef.current); dockHideTimerRef.current = null; }
    setTaskbarVisible(true);
  }, []);
  const scheduleDockHide = useCallback(() => {
    if (!dockAutoHide) return;
    if (dockHideTimerRef.current) clearTimeout(dockHideTimerRef.current);
    dockHideTimerRef.current = setTimeout(() => setTaskbarVisible(false), 2000);
  }, [dockAutoHide]);

  // Cleanup dock timer on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (dockHideTimerRef.current) { clearTimeout(dockHideTimerRef.current); dockHideTimerRef.current = null; }
    };
  }, []);

  // Clock + Battery for status row
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const d = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const t = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      setClockStr(`${d}  ${t}`);
    };
    updateClock();
    const clockTimer = setInterval(updateClock, 30000);
    let battCleanup: (() => void) | undefined;
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((batt: any) => {
        setBatteryLevel(Math.round(batt.level * 100));
        setBatteryCharging(batt.charging);
        const onLevel = () => setBatteryLevel(Math.round(batt.level * 100));
        const onCharge = () => setBatteryCharging(batt.charging);
        batt.addEventListener('levelchange', onLevel);
        batt.addEventListener('chargingchange', onCharge);
        battCleanup = () => {
          batt.removeEventListener('levelchange', onLevel);
          batt.removeEventListener('chargingchange', onCharge);
        };
      }).catch(() => {});
    }
    return () => { clearInterval(clockTimer); battCleanup?.(); };
  }, []);

  // Keep-alive: track which apps have been mounted
  const mountedAppsRef = useRef<Set<AppId>>(new Set(['home']));
  const [, forceUpdate] = useState(0);
  const currentApp = currentAppId as AppId;

  // When an app is launched, mark it as mounted (max 12 kept alive for memory safety)
  useEffect(() => {
    if (currentApp && !mountedAppsRef.current.has(currentApp)) {
      // Evict oldest non-current apps if limit reached
      const MAX_KEEP_ALIVE = 12;
      if (mountedAppsRef.current.size >= MAX_KEEP_ALIVE) {
        const mounted = Array.from(mountedAppsRef.current);
        const evictable = mounted.filter(id => id !== 'home' && id !== currentApp && !runningApps.some(a => a.id === id));
        if (evictable.length > 0) {
          mountedAppsRef.current.delete(evictable[0] as AppId);
        }
      }
      mountedAppsRef.current.add(currentApp);
      forceUpdate(n => n + 1);
    }
  }, [currentApp, runningApps]);

  const handleCloseApp = useCallback((appId: string) => {
    mountedAppsRef.current.delete(appId as AppId);
    closeRunningApp(appId);
    forceUpdate(n => n + 1);
  }, [closeRunningApp]);

  // Listen for window control style changes from Settings
  useEffect(() => {
    const handler = () => setWindowControls(getWindowControlStyle());
    window.addEventListener('dex-window-controls-changed', handler);
    return () => window.removeEventListener('dex-window-controls-changed', handler);
  }, []);

  // Navigation
  const setCurrentApp = useCallback((appId: AppId) => {
    const def = APP_DEFINITIONS[appId];
    if (def) {
      launchApp({ id: appId, name: def.name, icon: def.icon || appId, color: def.color });
    } else {
      setCurrentRunningApp(appId);
    }
    setNavHistory(prev => {
      const h = prev.slice(0, navIndex + 1);
      if (h[h.length - 1] !== appId) h.push(appId);
      return h.slice(-50);
    });
    setNavIndex(prev => Math.min(prev + 1, 49));
  }, [launchApp, setCurrentRunningApp, navIndex]);

  const goBack = useCallback(() => {
    if (navIndex > 0) {
      const idx = navIndex - 1;
      const appId = navHistory[idx] as AppId;
      setNavIndex(idx);
      const def = APP_DEFINITIONS[appId];
      if (def) launchApp({ id: appId, name: def.name, icon: def.icon || appId, color: def.color });
      else setCurrentRunningApp(appId);
    }
  }, [navIndex, navHistory, launchApp, setCurrentRunningApp]);

  const goForward = useCallback(() => {
    if (navIndex < navHistory.length - 1) {
      const idx = navIndex + 1;
      const appId = navHistory[idx] as AppId;
      setNavIndex(idx);
      const def = APP_DEFINITIONS[appId];
      if (def) launchApp({ id: appId, name: def.name, icon: def.icon || appId, color: def.color });
      else setCurrentRunningApp(appId);
    }
  }, [navIndex, navHistory, launchApp, setCurrentRunningApp]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showAppMenu) { e.preventDefault(); setShowAppMenu(false); return; }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Q') {
        e.preventDefault();
        runningApps.forEach(a => { if (a.id !== 'home') handleCloseApp(a.id); });
        setCurrentApp('home');
        return;
      }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goBack(); return; }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setShowUnifiedSearch(p => !p); return; }
      if (e.key === 'F11') { e.preventDefault(); setDockAutoHide(p => { const v = !p; if (!v) setTaskbarVisible(true); return v; }); return; }

      if ((e.ctrlKey || e.metaKey) && e.key === '\\') { e.preventDefault(); setDockAutoHide(p => { const v = !p; if (!v) setTaskbarVisible(true); return v; }); return; }
      // Ctrl+W — close current app (go home)
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') { e.preventDefault(); if (currentAppId !== 'home') { handleCloseApp(currentAppId); setCurrentApp('home'); } return; }
      // Ctrl+Tab / Ctrl+Shift+Tab — cycle through running apps
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault();
        if (runningApps.length > 1) {
          const idx = runningApps.findIndex(a => a.id === currentAppId);
          const next = e.shiftKey ? (idx - 1 + runningApps.length) % runningApps.length : (idx + 1) % runningApps.length;
          setCurrentApp(runningApps[next].id as AppId);
        }
        return;
      }
      const ctrlMap: Record<string, AppId> = { '1': 'home', '2': 'settings', '3': 'files', '4': 'notes', '5': 'tasks', '6': 'browser', '7': 'dashboard', '8': 'calendar', '9': 'kanban' };
      if ((e.ctrlKey || e.metaKey) && ctrlMap[e.key]) { e.preventDefault(); setCurrentApp(ctrlMap[e.key]); return; }
      const altMap: Record<string, AppId> = { 'v': 'videoeditor', 'i': 'imosion', 'r': 'prism', 'f': 'flux', 'g': 'forge', 'p': 'power', 'c': 'calculator', 't': 'transfers' };
      if (e.altKey && !e.ctrlKey && altMap[e.key.toLowerCase()]) { e.preventDefault(); setCurrentApp(altMap[e.key.toLowerCase()]); return; }
      // Split-screen shortcuts
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') { e.preventDefault(); if (splitMode !== 'off') { exitSplit(); } else { setShowAppMenu(true); } return; }
      if (e.key === 'Escape' && splitMode !== 'off') { exitSplit(); return; }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goBack, goForward, runningApps, handleCloseApp, setCurrentApp, showAppMenu, currentAppId, splitMode]);

  // Window controls
  const handleMinimize = () => { window.electron?.invoke?.('window:minimize').catch(() => {}); };
  const handleMaximize = () => { window.electron?.invoke?.('window:maximize').catch(() => {}); };
  const handleClose = () => { window.electron?.invoke?.('window:hide').catch(() => {}); };

  const getLabel = (id: string) => {
    const def = APP_DEFINITIONS[id];
    return def?.name || LAUNCHPAD_APPS.find(a => a.id === id)?.label || id;
  };

  // ── Split-screen helpers ────────────────────────────────────────────────
  const handleSplitResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    splitDragging.current = true;
    const container = splitContainerRef.current;
    if (!container) return;
    const isH = splitMode === 'horizontal';
    const onMove = (ev: PointerEvent) => {
      if (!splitDragging.current || !container) return;
      const rect = container.getBoundingClientRect();
      const pos = isH ? ev.clientX - rect.left : ev.clientY - rect.top;
      const total = isH ? rect.width : rect.height;
      const pct = Math.min(80, Math.max(20, (pos / total) * 100));
      setSplitRatio(pct);
    };
    const onUp = () => { splitDragging.current = false; document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [splitMode]);

  const enterSplit = useCallback((appId: AppId) => {
    if (appId === currentApp) return;
    setSplitApp(appId);
    setSplitMode('horizontal');
    setSplitRatio(50);
    // Ensure the split app is mounted
    if (!mountedAppsRef.current.has(appId)) {
      mountedAppsRef.current.add(appId);
      forceUpdate(n => n + 1);
    }
  }, [currentApp]);

  const exitSplit = useCallback(() => {
    setSplitMode('off');
    setSplitApp(null);
  }, []);

  // ── Keep-alive renderer ─────────────────────────────────────────────────
  const renderKeepAlive = () => {
    const mounted = Array.from(mountedAppsRef.current);
    return mounted.map(appId => {
      const Comp = APP_COMPONENTS[appId];
      if (!Comp) return null;
      const isCurrent = appId === currentApp;
      const isSplit = splitMode !== 'off' && appId === splitApp;
      const isVisible = isCurrent || isSplit;
      return (
        <div
          key={appId}
          aria-hidden={!isVisible}
          style={{
            position: 'absolute',
            inset: 0,
            display: isVisible ? 'flex' : 'none',
            flexDirection: 'column',
            animation: isVisible ? 'appEnter 0.18s var(--ease-out)' : 'none',
            willChange: isVisible ? 'opacity, transform' : 'auto',
          }}
        >
          <AppErrorBoundary appId={appId}>
            <Suspense fallback={<Loading />}>
              <Comp />
            </Suspense>
          </AppErrorBoundary>
        </div>
      );
    });
  };

  // ── Dock rendering ──────────────────────────────────────────────────────
  const renderDockItems = (items: DockItem[], startIndex: number) =>
    items.map((item, i) => {
      const isActive = currentApp === item.id;
      const isRunning = runningApps.some(a => a.id === item.id);

      return (
        <div key={item.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <button
            onClick={() => setCurrentApp(item.id)}
            onDoubleClick={(e) => { e.stopPropagation(); if (item.id !== currentApp) enterSplit(item.id); }}
            onContextMenu={(e) => { e.preventDefault(); if (item.id !== currentApp) enterSplit(item.id); }}
            title={`${item.label} (right-click to split)`}
            aria-label={`Open ${item.label}`}
            style={{
              width: 50, height: 50,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isActive ? `${item.color}15` : 'transparent',
              border: 'none', borderRadius: 14, cursor: 'pointer',
              transition: 'background 0.15s var(--ease-default), transform 0.12s var(--ease-spring)',
              position: 'relative', padding: 0,
              touchAction: 'manipulation',
            }}
            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = isActive ? `${item.color}15` : 'transparent'; }}
            onPointerDown={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.88)'; }}
            onPointerUp={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
            onPointerLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
          >
            <span style={{ color: isActive ? item.color : 'rgba(255,255,255,0.6)', transition: 'color 0.15s var(--ease-default), transform 0.15s var(--ease-spring)', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'scale(1.26)' }}>
              {Icons[item.id] || Icons.home}
            </span>
          </button>
          <div style={{
            width: isActive ? 4 : isRunning ? 3 : 0,
            height: isActive ? 4 : isRunning ? 3 : 0,
            borderRadius: '50%',
            background: isActive ? item.color : 'rgba(255,255,255,0.4)',
            transition: 'all 0.2s var(--ease-spring)',
            opacity: (isRunning || isActive) ? 1 : 0,
          }} />
        </div>
      );
    });

  const dockSeparator = (key: string) => (
    <div key={key} style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.08)', margin: '0 3px', flexShrink: 0, alignSelf: 'center', borderRadius: 1 }} />
  );

  // ── App Menu helpers ────────────────────────────────────────────────────
  const APP_MENU_CATEGORIES = useMemo(() => {
    const cats: { label: string; apps: typeof LAUNCHPAD_APPS }[] = [];
    const catMap: Record<string, typeof LAUNCHPAD_APPS> = {};
    const catOrder = ['System', 'Productivity', 'Creative Suite', 'Media', 'Tools', 'Entertainment', 'Project Management'];
    const appToCat: Record<string, string> = {};
    const sysApps = ['home','settings','dashboard','power'];
    const prodApps = ['files','browser','notes','tasks','calendar','workflows'];
    const creativeApps = ['videoeditor','imosion','prism','flux','forge'];
    const mediaApps = ['gallery','audio','video'];
    const toolApps = ['calculator','passwordgenerator','transfers','rewind'];
    const entApps = ['games'];
    const pmApps = ['kanban'];
    sysApps.forEach(a => { appToCat[a] = 'System'; });
    prodApps.forEach(a => { appToCat[a] = 'Productivity'; });
    creativeApps.forEach(a => { appToCat[a] = 'Creative Suite'; });
    mediaApps.forEach(a => { appToCat[a] = 'Media'; });
    toolApps.forEach(a => { appToCat[a] = 'Tools'; });
    entApps.forEach(a => { appToCat[a] = 'Entertainment'; });
    pmApps.forEach(a => { appToCat[a] = 'Project Management'; });
    LAUNCHPAD_APPS.forEach(app => {
      const cat = appToCat[app.id] || 'Other';
      if (!catMap[cat]) catMap[cat] = [];
      catMap[cat].push(app);
    });
    catOrder.forEach(c => { if (catMap[c]?.length) cats.push({ label: c, apps: catMap[c] }); });
    return cats;
  }, []);

  const hasRunningNonHome = runningApps.some(a => a.id !== 'home');

  const handleCloseAllApps = useCallback(() => {
    runningApps.forEach(a => { if (a.id !== 'home') handleCloseApp(a.id); });
    setCurrentApp('home');
  }, [runningApps, handleCloseApp, setCurrentApp]);

  // ── Title bar ───────────────────────────────────────────────────────────
  const renderTitleBar = () => (
    <div style={{
      height: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 12px',
      background: 'transparent',
      borderBottom: '0.5px solid var(--color-border-subtle)',
      WebkitAppRegion: 'drag', flexShrink: 0,
      position: 'relative', zIndex: 100,
    } as React.CSSProperties}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {windowControls === 'traffic' && (
          <div style={{ display: 'flex', gap: 8, marginRight: 8, alignItems: 'center' }}>
            <button onClick={handleClose} title="Close" style={trafficBtn('#ff5f57')} />
            <button onClick={handleMinimize} title="Minimize" style={trafficBtn('#febc2e')} />
            <button onClick={handleMaximize} title="Maximize" style={trafficBtn('#28c840')} />
          </div>
        )}
        <button style={navBtnStyle} onClick={goBack} disabled={navIndex <= 0} title="Back (Alt+Left)">
          <span style={{ opacity: navIndex > 0 ? 1 : 0.3 }}>{Icons.chevronLeft}</span>
        </button>
        <button style={navBtnStyle} onClick={goForward} disabled={navIndex >= navHistory.length - 1} title="Forward (Alt+Right)">
          <span style={{ opacity: navIndex < navHistory.length - 1 ? 1 : 0.3 }}>{Icons.chevronRight}</span>
        </button>
      </div>
      <span style={{
        fontSize: 12, fontWeight: 500, color: 'var(--color-text-tertiary)',
        position: 'absolute', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none',
        letterSpacing: '-0.01em',
      }}>
        {getLabel(currentApp)}
      </span>
      <div style={{ display: 'flex', gap: 0, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {windowControls === 'system' && (
          <>
            <button style={winBtnStyle} onClick={handleMinimize} title="Minimize">{Icons.minimize}</button>
            <button style={winBtnStyle} onClick={handleMaximize} title="Maximize">{Icons.maximize}</button>
            <button style={winBtnStyle} onClick={handleClose} title="Close">{Icons.close}</button>
          </>
        )}
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════
  return (
    <div role="application" aria-label="DEX Desktop" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--color-bg-base)', fontFamily: 'var(--font-family)', overflow: 'hidden', minWidth: 360 }}>
      <UnifiedSearch isOpen={showUnifiedSearch} onClose={() => setShowUnifiedSearch(false)} onNavigate={(p) => setCurrentApp(p as AppId)} />

      {renderTitleBar()}

      {/* Status Row — Date / Time / Battery */}
      <div style={{
        height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 16px', gap: 16,
        background: 'rgba(255,255,255,0.015)',
        borderBottom: '0.5px solid var(--color-border-subtle)',
        flexShrink: 0, position: 'relative', zIndex: 99,
      }}>
        <div style={{ position: 'absolute', left: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="rgba(255,255,255,0.4)"/></svg>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '-0.01em' }}>
          {clockStr}
        </span>
        <div style={{ position: 'absolute', right: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ position: 'relative', width: 22, height: 11, borderRadius: 3, border: '1px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', padding: 1 }}>
            <div style={{ height: '100%', width: `${batteryLevel}%`, borderRadius: 1.5, background: batteryLevel > 20 ? '#30d158' : '#ff453a', transition: 'width 0.3s ease, background 0.3s ease' }} />
            <div style={{ position: 'absolute', right: -4, width: 2, height: 5, borderRadius: '0 1px 1px 0', background: 'rgba(255,255,255,0.3)' }} />
          </div>
          {batteryCharging && <svg width="8" height="8" viewBox="0 0 24 24" fill="#ffd60a" stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>}
          <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>{batteryLevel}%</span>
        </div>
      </div>

      {/* Content area — supports split-screen tiling */}
      {splitMode === 'off' ? (
        <div role="main" aria-label="App content" style={{
          flex: 1, position: 'relative', overflow: 'hidden',
          margin: 0, borderRadius: 0,
        }}>
          {renderKeepAlive()}
        </div>
      ) : (
        <div ref={splitContainerRef} style={{
          flex: 1, display: 'flex',
          flexDirection: splitMode === 'horizontal' ? 'row' : 'column',
          overflow: 'hidden', position: 'relative',
        }}>
          {/* Primary pane */}
          <div style={{
            [splitMode === 'horizontal' ? 'width' : 'height']: `${splitRatio}%`,
            position: 'relative', overflow: 'hidden', flexShrink: 0,
          }}>
            {(() => {
              const Comp = APP_COMPONENTS[currentApp];
              return Comp ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', background: 'rgba(255,255,255,0.03)', borderBottom: '0.5px solid var(--color-border-subtle)', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' }}>{getLabel(currentApp)}</span>
                    <button onClick={exitSplit} title="Exit split" aria-label="Exit split view" style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 2, fontSize: 11, fontWeight: 600 }}>Exit Split</button>
                  </div>
                  <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                    <AppErrorBoundary appId={currentApp}><Suspense fallback={<Loading />}><Comp /></Suspense></AppErrorBoundary>
                  </div>
                </div>
              ) : null;
            })()}
          </div>
          {/* Resizer handle */}
          <div
            onPointerDown={handleSplitResize}
            style={{
              [splitMode === 'horizontal' ? 'width' : 'height']: 6,
              [splitMode === 'horizontal' ? 'cursor' : 'cursor']: splitMode === 'horizontal' ? 'col-resize' : 'row-resize',
              background: splitDragging.current ? 'var(--color-accent)' : 'rgba(255,255,255,0.06)',
              transition: 'background 0.15s ease',
              flexShrink: 0, zIndex: 10, position: 'relative',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-accent)'; }}
            onMouseLeave={e => { if (!splitDragging.current) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
          />
          {/* Secondary pane */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {(() => {
              const sApp = splitApp;
              if (!sApp) return null;
              const Comp = APP_COMPONENTS[sApp];
              return Comp ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', background: 'rgba(255,255,255,0.03)', borderBottom: '0.5px solid var(--color-border-subtle)', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' }}>{getLabel(sApp)}</span>
                    <button onClick={() => { setSplitApp(null); setSplitMode('off'); }} title="Close pane" aria-label="Close split pane" style={{ background: 'none', border: 'none', color: 'rgba(255,69,58,0.8)', cursor: 'pointer', padding: 2, fontSize: 11, fontWeight: 600 }}>Close</button>
                  </div>
                  <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                    <AppErrorBoundary appId={sApp}><Suspense fallback={<Loading />}><Comp /></Suspense></AppErrorBoundary>
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        </div>
      )}

      {/* Floating Dock — position fixed so it floats freely, no black bar */}
      <div
        onMouseEnter={showDock}
        onMouseLeave={scheduleDockHide}
        onTouchStart={showDock}
        style={{
          position: 'fixed', bottom: 8, left: 0, right: 0, zIndex: 9998,
          display: 'flex', justifyContent: 'center',
          transform: taskbarVisible ? 'translateY(0)' : 'translateY(calc(100% + 20px))',
          opacity: taskbarVisible ? 1 : 0,
          transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease',
          pointerEvents: taskbarVisible ? 'auto' : 'none',
        }}
      >
        <div
          ref={dockRef}
          role="toolbar"
          aria-label="Application dock"
          className="vibrancy-dock"
          style={{
            display: 'flex', alignItems: 'center', gap: 3,
            padding: '5px 10px', borderRadius: 16,
            boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.2), inset 0 0.5px 0 rgba(255,255,255,0.08)',
            overflowX: 'auto', overflowY: 'hidden', maxWidth: '96vw',
          }}
        >
          {/* App Menu Button */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <button
              onClick={() => setShowAppMenu(p => !p)}
              title="App Menu"
              aria-label="Open App Menu"
              style={{
                width: 50, height: 50,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: showAppMenu ? 'rgba(10,132,255,0.15)' : 'transparent',
                border: 'none', borderRadius: 14, cursor: 'pointer',
                transition: 'background 0.15s var(--ease-default), transform 0.12s var(--ease-spring)',
                padding: 0, touchAction: 'manipulation',
              }}
              onMouseEnter={e => { if (!showAppMenu) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
              onMouseLeave={e => { if (!showAppMenu) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              onPointerDown={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.88)'; }}
              onPointerUp={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
              onPointerLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={showAppMenu ? '#0a84ff' : 'rgba(255,255,255,0.6)'} strokeWidth="1.5" style={{ transition: 'stroke 0.15s' }}>
                <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
                <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
              </svg>
            </button>
          </div>
          {dockSeparator('sep-menu')}
          {renderDockItems(DOCK_LEFT, 0)}
          {dockSeparator('sep1')}
          {renderDockItems(DOCK_CREATIVE, DOCK_LEFT.length)}
          {dockSeparator('sep2')}
          {renderDockItems(DOCK_RIGHT, DOCK_LEFT.length + DOCK_CREATIVE.length)}
          {/* Close All Button — only when apps are running */}
          {hasRunningNonHome && (
            <>
              {dockSeparator('sep-close')}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <button
                  onClick={handleCloseAllApps}
                  title="Close All Apps"
                  aria-label="Close all running apps"
                  style={{
                    width: 32, height: 32,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'transparent',
                    border: 'none', borderRadius: 9, cursor: 'pointer',
                    transition: 'background 0.15s var(--ease-default), transform 0.12s var(--ease-spring)',
                    padding: 0, touchAction: 'manipulation',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,69,58,0.15)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  onPointerDown={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.88)'; }}
                  onPointerUp={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                  onPointerLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff453a" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom hover trigger zone — always present, invisible */}
      <div
        onMouseEnter={showDock}
        onTouchStart={showDock}
        onPointerEnter={showDock}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, height: 18,
          zIndex: 9999, cursor: 'default', background: 'transparent',
          pointerEvents: dockAutoHide ? 'auto' : 'none',
        }}
      />

      {/* App Menu Overlay */}
      {showAppMenu && (
        <>
          <div
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
              zIndex: 9990, animation: 'fadeIn 0.15s ease-out',
            } as React.CSSProperties}
            onClick={() => setShowAppMenu(false)}
          />
          <div
            style={{
              position: 'fixed', bottom: 72, left: '50%', transform: 'translateX(-50%)',
              zIndex: 9991, width: 'min(560px, 92vw)', maxHeight: 'calc(100vh - 140px)',
              overflow: 'auto',
              background: '#1c1c1e',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              borderRadius: 20,
              border: '1px solid rgba(255,255,255,0.18)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
              padding: '24px 28px',
              animation: 'scaleIn 0.18s var(--ease-spring)',
            } as React.CSSProperties}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 20, letterSpacing: '-0.02em' }}>All Apps</div>
            {APP_MENU_CATEGORIES.map(cat => (
              <div key={cat.label} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{cat.label}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8 }}>
                  {cat.apps.map(app => {
                    const icon = Icons[app.id] || Icons.home;
                    const isActive = currentApp === app.id;
                    const isRunning = runningApps.some(a => a.id === app.id);
                    return (
                      <button
                        key={app.id}
                        onClick={() => { setCurrentApp(app.id as AppId); setShowAppMenu(false); }}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                          padding: '10px 4px', borderRadius: 12,
                          background: isActive ? `${app.color}15` : 'transparent',
                          border: 'none', cursor: 'pointer',
                          transition: 'all 0.15s var(--ease-default)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = isActive ? `${app.color}20` : 'rgba(255,255,255,0.06)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = isActive ? `${app.color}15` : 'transparent'; }}
                      >
                        <div style={{ color: app.color, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 14, background: `${app.color}12`, transform: 'scale(1.15)' }}>
                          {icon}
                        </div>
                        <span style={{ fontSize: 11, color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-muted)', fontWeight: isActive ? 600 : 400, textAlign: 'center', lineHeight: 1.2 }}>{app.label}</span>
                        {isRunning && (
                          <div style={{ width: 4, height: 4, borderRadius: '50%', background: app.color, marginTop: -2 }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* System Status Bar — FPS, memory, network at page bottom */}
      <StatusBar
        showClock={false}
        showPerformance={true}
        showNetwork={true}
        leftContent={
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
            {splitMode !== 'off' ? `Split · ${splitRatio}%` : `${runningApps.length} app${runningApps.length !== 1 ? 's' : ''} running`}
          </span>
        }
        style={{ flexShrink: 0, zIndex: 99 }}
      />

      {/* Achievement unlock toasts — visible globally */}
      <AchievementToastContainer queue={toastQueue} onDismiss={dismissToast} />


    </div>
  );
};

// ── Traffic light button ──────────────────────────────────────────────────
const trafficBtn = (color: string): React.CSSProperties => ({
  width: 14, height: 14, borderRadius: '50%', background: color,
  border: 'none', cursor: 'pointer', padding: 4, opacity: 0.85,
  transition: 'opacity 0.12s ease', touchAction: 'manipulation',
});

const navBtnStyle: React.CSSProperties = {
  width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: 'none', color: 'var(--color-text-muted)',
  cursor: 'pointer', borderRadius: 8, touchAction: 'manipulation',
  transition: 'background 0.12s ease',
};

const winBtnStyle: React.CSSProperties = {
  width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer',
  borderRadius: 6, transition: 'background 0.12s ease',
};

export default AppManager;
