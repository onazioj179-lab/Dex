// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * HOME - Desktop Home Screen
 * Clean macOS Tahoe-style: Time, Search, Recents, Open Apps
 * Right-click context menu. 60s auto-refresh.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { sharedTick } from '../services/SharedTick';
import { APP_DEFINITIONS } from '../store/runningApps';
import { useLiveActivity, type LiveActivity, type ActivityType } from '../utils/liveActivity';
import { useWallpaperStore, WALLPAPER_PRESETS } from '../store/wallpaperStore';
import { glassPanel, glassOverlay } from '../styles/glassMenu';
import { SpotlightSearch } from '../shell/SpotlightSearch';
import { useRecentFiles } from '../store/useRecentFiles';
import { HomeWidgets } from '../components/HomeWidgets';
import { useWidgetStore } from '../store/widgetStore';
import DexIcon from '../components/DexIcon';
import { Z_CONTEXT_MENU, Z_MODAL } from '../utils/zIndexTokens';
import { useHomeAppsStore } from '../store/homeAppsStore';

// App icon images
import vinxIconPng from '../../../appicons/vinx.png';
import imosionIconPng from '../../../appicons/imosion.png';
import forgeIconPng from '../../../appicons/forge.png';
import nexusIconPng from '../../../appicons/nexus.png';

const APP_ICON_PNGS: Record<string, string> = {
  videoeditor: vinxIconPng,
  imosion: imosionIconPng,
  forge: forgeIconPng,
  nexus: nexusIconPng,
};



// ======================================================================
// ACTIVITY ICONS
// ======================================================================
const ACTIVITY_ICONS: Record<ActivityType, JSX.Element> = {
  download: <DexIcon name="download" size={14} />,
  encode: <DexIcon name="video" size={14} />,
  transfer: <DexIcon name="repeat" size={14} />,
  task: <DexIcon name="check-square" size={14} />,
  sync: <DexIcon name="refresh" size={14} />,
  build: <DexIcon name="zap" size={14} />,
};

// ======================================================================
// COMPONENT
// ======================================================================
export const Home: React.FC = () => {
  const [time, setTime] = useState(new Date());
  const { activities } = useLiveActivity();
  const wpMode = useWallpaperStore(s => s.mode);
  const wpValue = useWallpaperStore(s => s.value);
  const wpBlur = useWallpaperStore(s => s.blur);
  const wpOpacity = useWallpaperStore(s => s.opacity);
  const wpTint = useWallpaperStore(s => s.tint);

  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [searchSticky, setSearchSticky] = useState(false);
  const [userName, setUserName] = useState<string>('');

  // Fetch OS user name once on mount for personalised greeting
  useEffect(() => {
    (async () => {
      try {
        const info = await (window as any).electron?.invoke?.('system:getUserInfo');
        if (info?.username) {
          const name = info.displayName || info.username;
          // Capitalise first letter, trim to first word only (first name feel)
          setUserName(name.split(/[\s_]/)[0].replace(/^\w/, (c: string) => c.toUpperCase()));
        }
      } catch { /* silent — no name available */ }
    })();
  }, []);

  // Time-based greeting text
  const greetingText = useMemo(() => {
    const h = time.getHours();
    if (h >= 5 && h < 12) return 'Good Morning';
    if (h >= 12 && h < 17) return 'Good Afternoon';
    if (h >= 17 && h < 21) return 'Good Evening';
    return 'Good Night';
  }, [Math.floor(time.getTime() / 3600000)]);

  // Full greeting — include user name if available
  const greeting = userName ? `${greetingText}, ${userName}` : greetingText;

  // Key changes when greeting text changes (new period of day) → triggers CSS re-animation
  const greetingAnimKey = greetingText;

  // Clock tick — poll every second but only re-render on minute boundary
  // so the displayed HH:MM stays within 1s of wall-clock without wasted renders.
  useEffect(() => {
    let lastMinute = Math.floor(Date.now() / 60000);
    sharedTick.subscribe('home-clock', () => {
      const m = Math.floor(Date.now() / 60000);
      if (m !== lastMinute) {
        lastMinute = m;
        setTime(new Date());
      }
    }, 1000);
    return () => sharedTick.unsubscribe('home-clock');
  }, []);

  // Data state - backend hydration via centralized Zustand store
  const refreshData = useCallback(async () => {
    try {
      const result = await (window as any).electron?.invoke?.('files:recent', { limit: 8 });
      if (result?.success && Array.isArray(result.files) && result.files.length > 0) {
        const addRecent = useRecentFiles.getState().addRecent;
        // Deduplicate by normalised path before adding
        const seen = new Set<string>();
        result.files.forEach((f: any) => {
          const normPath = (f.path || '').replace(/\\/g, '/').toLowerCase();
          if (!normPath || seen.has(normPath)) return;
          seen.add(normPath);
          addRecent({ path: f.path || '', name: f.name || f.path?.split(/[/\\]/).pop() || 'Unknown', appId: 'files' });
        });
      }
    } catch { /* store already has localStorage persistence */ }
  }, []);

  useEffect(() => {
    refreshData();
    sharedTick.subscribe('home-refresh', refreshData, 60000);
    return () => sharedTick.unsubscribe('home-refresh');
  }, [refreshData]);

  // Sticky search on scroll
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      setSearchSticky(scrollRef.current.scrollTop > 120);
    }
  }, []);

  // Launch app helper
  const handleLaunchApp = useCallback((appId: string) => {
    const def = APP_DEFINITIONS[appId];
    if (!def) return;
    window.dispatchEvent(new CustomEvent('dex-spotlight-navigate', {
      detail: { appId },
    }));
  }, []);

  // Desktop right-click context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const handleDesktopContext = useCallback((e: React.MouseEvent) => {
    // Only trigger on empty desktop area, not on buttons/interactive elements
    const tag = (e.target as HTMLElement).tagName.toLowerCase();
    if (tag === 'button' || tag === 'input' || tag === 'a') return;
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);





  // Wallpaper background CSS
  const wallpaperBg: React.CSSProperties = useMemo(() => {
    if (wpMode === 'image') {
      let url = wpValue;
      if (url && !url.startsWith('data:') && !url.startsWith('http') && !url.startsWith('file://') && !url.startsWith('blob:')) {
        url = `file://${url.replace(/\\/g, '/')}`;
      }
      return { backgroundImage: `url("${url}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
    }
    if (wpMode === 'gradient') return { backgroundImage: wpValue };
    if (wpMode === 'live') return { background: 'transparent' };
    return { backgroundColor: wpValue };
  }, [wpMode, wpValue]);

  // Format time
  const timeStr = useMemo(() => {
    return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [Math.floor(time.getTime() / 60000)]); // only recompute on minute change

  const dateStr = useMemo(() => {
    return time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  }, [Math.floor(time.getTime() / 60000)]); // only recompute on minute change

  // ====================================================================
  // RENDER
  // ====================================================================
  return (
    <div
      role="region"
      aria-label="Home"
      aria-roledescription="Desktop home screen"
      onContextMenu={handleDesktopContext}
      onClick={() => ctxMenu && setCtxMenu(null)}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Wallpaper Layer -- Item 151: GPU-accelerated with will-change */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        ...wallpaperBg,
        filter: wpBlur > 0 ? `blur(${wpBlur}px)` : undefined,
        transform: wpBlur > 0 ? 'scale(1.05)' : undefined,
        transition: 'all 0.4s ease',
        willChange: 'transform, filter',
        contain: 'strict',
      }} />

      {/* Removed dark overlay per user request - full wallpaper visibility */}

      {/* Live Wallpaper Animation Layer */}
      {wpMode === 'live' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          animation: wpValue === 'live-ember-pulse'
            ? 'liveEmberPulse 8s ease infinite'
            : wpValue === 'live-aurora-shift'
            ? 'liveAuroraShift 12s ease infinite'
            : wpValue === 'live-midnight-waves'
            ? 'liveMidnightWaves 10s ease infinite'
            : undefined,
          willChange: 'background',
        }} />
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(6px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes greetingFadeIn { from { opacity: 0; transform: translateY(-6px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes liveEmberPulse {
          0% { background: radial-gradient(ellipse at 30% 60%, #3a0000 0%, #1a0000 40%, #000 100%); }
          33% { background: radial-gradient(ellipse at 70% 40%, #4a0505 0%, #220000 40%, #000 100%); }
          66% { background: radial-gradient(ellipse at 40% 70%, #2a0000 0%, #150000 40%, #050000 100%); }
          100% { background: radial-gradient(ellipse at 30% 60%, #3a0000 0%, #1a0000 40%, #000 100%); }
        }
        @keyframes liveAuroraShift {
          0% { background: linear-gradient(135deg, #0f0c29, #302b63, #24243e); }
          25% { background: linear-gradient(180deg, #0d1b2a, #1b2838, #302b63); }
          50% { background: linear-gradient(225deg, #24243e, #0f0c29, #1b2838); }
          75% { background: linear-gradient(270deg, #302b63, #24243e, #0d1b2a); }
          100% { background: linear-gradient(135deg, #0f0c29, #302b63, #24243e); }
        }
        @keyframes liveMidnightWaves {
          0% { background: linear-gradient(180deg, #0a1628, #0a3d62, #0d1117); }
          33% { background: linear-gradient(200deg, #0d1117, #0a1628, #1a5276); }
          66% { background: linear-gradient(160deg, #0a3d62, #0d1117, #0a1628); }
          100% { background: linear-gradient(180deg, #0a1628, #0a3d62, #0d1117); }
        }
      `}</style>

      {/* Sticky search bar (appears when scrolled past row 2) */}
      {searchSticky && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
          padding: '10px 24px',
          background: 'var(--pg-toolbar)',
          backdropFilter: 'blur(18px) saturate(170%)',
          WebkitBackdropFilter: 'blur(18px) saturate(170%)',
          borderBottom: '1px solid var(--pg-border)',
          display: 'flex', justifyContent: 'center',
          animation: 'fadeIn 0.15s ease-out',
        }}>
          <SpotlightSearch variant="home" onNavigate={handleLaunchApp} />
        </div>
      )}

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          position: 'relative', zIndex: 2,
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          scrollBehavior: 'smooth',
          scrollbarWidth: 'none',
          overscrollBehaviorY: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* ROW 1: Greeting + Time + Date */}
        <div style={{
          marginTop: 36,
          marginInline: 'auto',
          width: 'fit-content',
          padding: '14px 26px 12px',
          textAlign: 'center',
          background: 'rgba(8, 12, 20, 0.42)',
          border: '1px solid rgba(255, 255, 255, 0.16)',
          borderRadius: 18,
          backdropFilter: 'blur(10px) saturate(135%)',
          WebkitBackdropFilter: 'blur(10px) saturate(135%)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
          animation: 'fadeIn 0.2s ease-out',
        }}>
          <div
            key={greetingAnimKey}
            style={{
              fontSize: 14, fontWeight: 500,
              color: 'rgba(255,255,255,0.9)',
              letterSpacing: '0.02em',
              marginBottom: 4,
              textShadow: '0 1px 6px rgba(0,0,0,0.4)',
              animation: 'greetingFadeIn 0.6s cubic-bezier(0.23,1,0.32,1)',
            }}>
            {greeting}
          </div>
          <div style={{
            fontSize: 52, fontWeight: 500,
            color: '#ffffff',
            letterSpacing: 0, lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            textShadow: '0 2px 14px rgba(0,0,0,0.45)',
          }}
            role="timer"
            aria-label={`Current time: ${timeStr}`}
          >
            {timeStr}
          </div>
          <div style={{
            fontSize: 15, fontWeight: 500,
            color: 'rgba(255,255,255,0.85)',
            marginTop: 6, letterSpacing: 0,
            textShadow: '0 1px 8px rgba(0,0,0,0.4)',
          }}>
            {dateStr}
          </div>
        </div>

        {/* ROW 2: Spotlight Search */}
        <div style={{
          marginTop: 14,
          display: 'flex', justifyContent: 'center',
          padding: '0 24px',
          animation: 'fadeIn 0.25s ease-out 0.03s both',
        }}>
          <SpotlightSearch variant="home" onNavigate={handleLaunchApp} />
        </div>

        {/* Live Activity - inline row */}
        {activities.length > 0 && (
          <div style={{
            marginTop: 12,
            padding: '0 24px',
            animation: 'fadeIn 0.35s ease-out 0.3s both',
          }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)',
              marginBottom: 6, letterSpacing: '0.03em', textTransform: 'uppercase',
            }}>
              Activity
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {activities.slice(0, 3).map(act => (
                <ActivityCard key={act.id} activity={act} />
              ))}
            </div>
          </div>
        )}

        {/* Quick Access Apps */}
        <QuickAccessApps onLaunch={handleLaunchApp} />

        {/* Recents */}
        {(() => {
          const recents = useRecentFiles.getState().recentFiles.slice(0, 6);
          if (recents.length === 0) return null;
          return (
            <div style={{
              marginTop: 18,
              padding: '0 24px',
              animation: 'fadeIn 0.35s ease-out 0.1s both',
            }}>
              <div style={{
                fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)',
                marginBottom: 8, letterSpacing: '0.03em', textTransform: 'uppercase',
              }}>
                Recent Files
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {recents.map((f, i) => (
                  <button
                    key={f.path + i}
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('dex-spotlight-navigate', { detail: { appId: 'files' } }));
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px',
                      background: 'var(--color-bg-surface)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 8, cursor: 'pointer',
                      color: 'var(--color-text-primary)', fontSize: 12,
                      textAlign: 'left',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                      transition: 'background 0.12s, box-shadow 0.12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.2)'; }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', opacity: 0.5 }}><DexIcon name="file-text" size={14} /></span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {new Date(f.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Bottom spacing */}
        <div style={{ height: 80 }} />
      </div>

      {/* Widget layer -- draggable widgets on home screen */}
      <HomeWidgets />

      {/* Desktop Right-Click Context Menu -- Item 156: keyboard accessible */}
      {ctxMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: Z_CONTEXT_MENU - 1 }} onMouseDown={() => setCtxMenu(null)} />
          <div
            role="menu"
            aria-label="Desktop context menu"
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setCtxMenu(null); return; }
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const items = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
                const idx = items.indexOf(document.activeElement as HTMLButtonElement);
                const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
                items[next]?.focus();
              }
            }}
            style={{
              position: 'fixed', left: Math.min(ctxMenu.x, window.innerWidth - 220), top: Math.min(ctxMenu.y, window.innerHeight - 420),
              zIndex: Z_CONTEXT_MENU, minWidth: 200, padding: '5px 0',
              background: 'var(--color-bg-elevated)',
              borderRadius: 12, border: '1px solid var(--color-border-subtle)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.55), 0 0 0 0.5px rgba(255,255,255,0.04)',
              animation: 'fadeIn 0.12s ease-out',
            } as React.CSSProperties}
          >
            {[
              { label: 'Change Wallpaper', icon: <DexIcon name="palette" size={14} />, action: () => { setShowWallpaperPicker(true); setCtxMenu(null); } },
              null,
              { label: useWidgetStore.getState().editMode ? 'Done Editing Widgets' : 'Edit Widgets', icon: <DexIcon name="puzzle" size={14} />, action: () => { useWidgetStore.getState().toggleEditMode(); setCtxMenu(null); } },
              { label: 'Add Widget', icon: <DexIcon name="plus" size={14} />, action: () => { useWidgetStore.getState().setEditMode(true); setCtxMenu(null); } },
              null,
              { label: 'Open Files', icon: <DexIcon name="folder" size={14} />, action: () => { handleLaunchApp('files'); setCtxMenu(null); } },
              { label: 'Open Browser', icon: <DexIcon name="globe" size={14} />, action: () => { handleLaunchApp('browser'); setCtxMenu(null); } },
              { label: 'Open Notes', icon: <DexIcon name="edit" size={14} />, action: () => { handleLaunchApp('notes'); setCtxMenu(null); } },
              { label: 'Open Imosion', icon: <DexIcon name="music" size={14} />, action: () => { handleLaunchApp('imosion'); setCtxMenu(null); } },
              { label: 'Open VINX', icon: <DexIcon name="film" size={14} />, action: () => { handleLaunchApp('videoeditor'); setCtxMenu(null); } },
              { label: 'Open Calculator', icon: <DexIcon name="calculator" size={14} />, action: () => { handleLaunchApp('calculator'); setCtxMenu(null); } },
              null,
              { label: 'Settings', icon: <DexIcon name="settings" size={14} />, action: () => { handleLaunchApp('settings'); setCtxMenu(null); } },
              { label: 'Refresh', icon: <DexIcon name="refresh" size={14} />, action: () => { refreshData(); setCtxMenu(null); } },
            ].map((item, i) =>
              item === null ? (
                <div key={`sep-${i}`} style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 8px' }} />
              ) : (
                <button
                  key={item.label}
                  role="menuitem"
                  className="dex-hover-bg"
                  onClick={item.action}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 14px',
                    background: 'transparent', border: 'none',
                    color: 'var(--color-text-primary)', fontSize: 13,
                    textAlign: 'left', cursor: 'pointer',
                    borderRadius: 6,
                    transition: 'background 0.08s',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18 }}>{item.icon}</span>
                  {item.label}
                </button>
              )
            )}
          </div>
        </>
      )}

      {/* Wallpaper Picker Modal */}
      {showWallpaperPicker && <WallpaperPickerModal onClose={() => setShowWallpaperPicker(false)} />}
    </div>
  );
};

// ======================================================================
// WALLPAPER PICKER MODAL
// ======================================================================
const WallpaperPickerModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { presetId, setWallpaper, setCustomImage, blur, setBlur, opacity, setOpacity } = useWallpaperStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = () => {
    const input = fileRef.current;
    if (!input) return;
    input.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div style={{ ...glassOverlay, position: 'fixed', inset: 0, zIndex: Z_MODAL, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={onClose}>
      <div onMouseDown={e => e.stopPropagation()} style={{
        ...glassPanel,
        width: 'min(580px, calc(100vw - 32px))', maxHeight: 'min(80vh, calc(100vh - 32px))', overflow: 'hidden', padding: 0,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--color-bg-hover)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: 0 }}>Wallpaper</h2>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>Choose a desktop background</p>
            </div>
            <button onClick={onClose} aria-label="Close wallpaper picker" className="dex-hover-bg" style={{ background: 'var(--color-border-subtle)', border: 'none', borderRadius: 8, width: 28, height: 28, color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* Scrollable preset grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', scrollbarWidth: 'thin' }}>
          {(() => {
            const imagePresets = WALLPAPER_PRESETS.filter(p => p.mode === 'image');
            const staticPresets = WALLPAPER_PRESETS.filter(p => p.mode !== 'live' && p.mode !== 'image' && !p.id.startsWith('crimson') && !p.id.startsWith('blood') && !p.id.startsWith('obsidian') && !p.id.startsWith('scarlet') && !p.id.startsWith('inferno'));
            const redPresets = WALLPAPER_PRESETS.filter(p => ['crimson-dark', 'blood-moon', 'obsidian-ember', 'scarlet-edge', 'inferno'].includes(p.id));
            const livePresets = WALLPAPER_PRESETS.filter(p => p.mode === 'live');
            const renderGrid = (presets: typeof WALLPAPER_PRESETS) => (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 10, marginBottom: 20 }}>
                {presets.map(p => {
                  const isActive = presetId === p.id;
                  const bg = p.mode === 'solid' ? p.value : (p.thumbnail || p.value);
                  return (
                    <button
                      key={p.id}
                      onClick={() => setWallpaper(p)}
                      aria-label={`Select ${p.name} wallpaper`}
                      title={p.name}
                      className="dex-hover-lift"
                      style={{
                        width: '100%', aspectRatio: '16/10', borderRadius: 10,
                        background: bg,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        border: isActive ? '2.5px solid #0a84ff' : '2px solid var(--color-border-subtle)',
                        cursor: 'pointer', position: 'relative', overflow: 'hidden',
                        transition: 'border-color 0.2s, transform 0.15s',
                        transform: isActive ? 'scale(1.02)' : 'scale(1)',
                        boxShadow: isActive ? '0 0 0 2px rgba(10,132,255,0.3), 0 4px 12px rgba(0,0,0,0.3)' : '0 2px 6px rgba(0,0,0,0.2)',
                      }}
                    >
                      {isActive && (
                        <div style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, background: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                      )}
                      {p.mode === 'live' && (
                        <div style={{ position: 'absolute', top: 4, left: 4, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,59,48,0.7)', fontSize: 8, fontWeight: 700, color: '#fff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>LIVE</div>
                      )}
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 6px 5px', background: 'linear-gradient(transparent, rgba(0,0,0,0.6))', fontSize: 10, fontWeight: 600, color: 'var(--color-text-primary)', textAlign: 'center', letterSpacing: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
            return (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Images</div>
                {renderGrid(imagePresets)}
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Presets</div>
                {renderGrid(staticPresets)}
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,59,48,0.6)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Black & Red</div>
                {renderGrid(redPresets)}
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Live Wallpapers</div>
                {renderGrid(livePresets)}
              </>
            );
          })()}

          {/* Custom image upload */}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Custom</div>
          <button
            onClick={handleFileSelect}
            className="dex-hover-bg"
            style={{
              width: '100%', height: 52, borderRadius: 10,
              background: 'var(--color-border-subtle)',
              border: presetId === 'custom' ? '2px solid #0a84ff' : '2px solid var(--color-bg-hover)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 500,
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload Image
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
        </div>

        {/* Controls footer */}
        <div style={{ padding: '14px 24px 18px', borderTop: '1px solid var(--color-bg-hover)', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 5 }}>
                <span>Blur</span><span>{blur}px</span>
              </div>
              <input type="range" min="0" max="40" value={blur} onChange={e => setBlur(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 5 }}>
                <span>Tint Opacity</span><span>{Math.round(opacity * 100)}%</span>
              </div>
              <input type="range" min="0" max="100" value={Math.round(opacity * 100)} onChange={e => setOpacity(Number(e.target.value) / 100)} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ======================================================================
// QUICK ACCESS APPS - Customizable via right-click
// ======================================================================
const ALL_AVAILABLE_APPS = [
  { id: 'files', label: 'Files', icon: 'folder' },
  { id: 'browser', label: 'Browser', icon: 'globe' },
  { id: 'notes', label: 'Notes', icon: 'edit' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
  { id: 'tasks', label: 'Tasks', icon: 'check-square' },
  { id: 'dexcode', label: 'DexCode', icon: 'code' },
  { id: 'videoeditor', label: 'VINX', icon: 'film' },
  { id: 'kanban', label: 'Kanban', icon: 'columns' },
  { id: 'weather', label: 'Weather', icon: 'cloud' },
  { id: 'nexus', label: 'Nexus', icon: 'bar-chart' },
  { id: 'imosion', label: 'Imosion', icon: 'music' },
  { id: 'forge', label: 'Forge', icon: 'zap' },
  { id: 'calculator', label: 'Calculator', icon: 'calculator' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'gallery', label: 'Gallery', icon: 'image' },
  { id: 'prism', label: 'Prism', icon: 'image' },
  { id: 'flux', label: 'Flux', icon: 'layers' },
  { id: 'canvas', label: 'Canvas', icon: 'edit' },
  { id: 'timer', label: 'Timer', icon: 'clock' },
  { id: 'rewind', label: 'Rewind', icon: 'rewind' },
];

const QuickAccessApps: React.FC<{ onLaunch: (appId: string) => void }> = ({ onLaunch }) => {
  const { apps, addApp, removeApp } = useHomeAppsStore();
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; appId?: string } | null>(null);

  const handleContext = (e: React.MouseEvent, appId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, appId });
  };

  const appsToShow = apps.map(a => {
    const def = ALL_AVAILABLE_APPS.find(d => d.id === a.id) || { id: a.id, label: a.id, icon: 'box' };
    return def;
  });

  const availableToAdd = ALL_AVAILABLE_APPS.filter(a => !apps.some(p => p.id === a.id));

  return (
    <div style={{ marginTop: 18, padding: '0 24px', animation: 'fadeIn 0.3s ease-out 0.06s both' }}>
      <style>{`
        .home-app-btn {
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          width: 76px; min-width: 76px; height: 78px;
          padding: 8px 6px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          cursor: pointer;
          transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
          position: relative;
          overflow: hidden;
        }
        .home-app-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 0%, rgba(10,132,255,0.15), transparent 70%);
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .home-app-btn:hover {
          transform: translateY(-2px);
          background: rgba(255,255,255,0.08);
          border-color: rgba(10,132,255,0.3);
          box-shadow: 0 10px 24px rgba(0,0,0,0.24), 0 0 16px rgba(10,132,255,0.12);
        }
        .home-app-btn:hover::before { opacity: 1; }
        .home-app-btn:active { transform: translateY(0); }
        .home-app-btn img, .home-app-btn svg {
          transition: transform 0.2s ease;
        }
        .home-app-btn:hover img, .home-app-btn:hover svg {
          transform: scale(1.08);
        }
      `}</style>
      <div
        style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start' }}
        onContextMenu={(e) => handleContext(e)}
      >
        {appsToShow.map((app, i) => (
          <button
            key={app.id}
            className="home-app-btn"
            onClick={() => onLaunch(app.id)}
            onContextMenu={(e) => handleContext(e, app.id)}
            aria-label={`Open ${app.label}`}
            style={{ animationDelay: `${i * 0.04}s` }}
          >
            {APP_ICON_PNGS[app.id] ? (
              <img src={APP_ICON_PNGS[app.id]} alt="" style={{ width: 42, height: 42, borderRadius: 8 }} />
            ) : (
              <DexIcon name={app.icon} size={42} color="rgba(255,255,255,0.9)" />
            )}
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 500, textShadow: '0 1px 4px rgba(0,0,0,0.3)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.label}</span>
          </button>
        ))}
      </div>

      {/* Right-click context menu */}
      {ctxMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: Z_CONTEXT_MENU - 1 }} onClick={() => setCtxMenu(null)} />
          <div
            role="menu"
            style={{
              position: 'fixed',
              left: Math.min(ctxMenu.x, window.innerWidth - 200),
              top: Math.min(ctxMenu.y, window.innerHeight - 300),
              zIndex: Z_CONTEXT_MENU,
              minWidth: 180,
              padding: '6px 0',
              background: 'rgba(28, 28, 32, 0.95)',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 16px 48px rgba(0,0,0,0.5), inset 0 0.5px 0 rgba(255,255,255,0.08)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              animation: 'ctxFadeIn 0.15s cubic-bezier(0.23, 1, 0.32, 1)',
            }}
          >
            <style>{`@keyframes ctxFadeIn { from { opacity:0; transform:scale(0.92) translateY(-4px); } to { opacity:1; transform:scale(1) translateY(0); } }`}</style>
            {ctxMenu.appId && (
              <button
                onClick={() => { removeApp(ctxMenu.appId!); setCtxMenu(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 14px',
                  background: 'transparent', border: 'none', color: '#FF453A', fontSize: 13, cursor: 'pointer', textAlign: 'left',
                  borderRadius: 6, margin: '0 4px', transition: 'all 0.1s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,69,58,0.15)'; e.currentTarget.style.transform = 'translateX(2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'translateX(0)'; }}
              >
                <DexIcon name="x" size={14} /> Remove from Home
              </button>
            )}
            {availableToAdd.length > 0 && (
              <>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 8px' }} />
                <div style={{ padding: '6px 14px', fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: '0.03em' }}>Add App</div>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {availableToAdd.map(app => (
                    <button
                      key={app.id}
                      onClick={() => { addApp(app.id); setCtxMenu(null); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: 'calc(100% - 8px)', padding: '8px 14px',
                        background: 'transparent', border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', textAlign: 'left',
                        borderRadius: 6, margin: '0 4px', transition: 'all 0.1s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(10,132,255,0.15)'; e.currentTarget.style.transform = 'translateX(2px)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'translateX(0)'; }}
                    >
                      <DexIcon name={app.icon} size={16} /> {app.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ======================================================================
// ACTIVITY CARD
// ======================================================================
const ActivityCard: React.FC<{ activity: LiveActivity }> = ({ activity }) => {
  const done = activity.completedAt != null;
  const color = done ? 'var(--color-success)' : 'var(--color-accent)';

  return (
    <div className="dex-hover-card" style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 12,
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      opacity: done ? 0.6 : 1,
      cursor: 'default',
      transition: 'opacity 0.5s ease, transform 0.4s ease, background 0.15s ease, box-shadow 0.15s ease',
      animation: done ? 'activityDone 0.5s ease-out' : 'fadeIn 0.2s ease-out',
      transform: done ? 'scale(0.97)' : 'scale(1)',
    }}>
      <div style={{ color, display: 'flex', alignItems: 'center' }}>
        {ACTIVITY_ICONS[activity.type] || ACTIVITY_ICONS.sync}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#fff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activity.label}
        </div>
        {activity.progress >= 0 && !done && (
          <div style={{ height: 3, borderRadius: 2, background: 'var(--color-bg-hover)', marginTop: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, background: color, width: `${activity.progress}%`, transition: 'width 0.3s ease' }} />
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
        {done ? 'Done' : activity.progress >= 0 ? `${activity.progress}%` : ''}
      </div>
    </div>
  );
};

Home.displayName = 'Home';
export default memo(Home);
