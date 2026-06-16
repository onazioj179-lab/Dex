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
import { HomeWidgets, HomeDashboard } from '../components/HomeWidgets';
import { useWidgetStore } from '../store/widgetStore';
import DexIcon from '../components/DexIcon';
import { Z_CONTEXT_MENU, Z_MODAL } from '../utils/zIndexTokens';
import { useHomeAppsStore } from '../store/homeAppsStore';
import { useHomePinnedFilesStore, type HomePinnedFile } from '../store/homePinnedFilesStore';
import { useHomePinnedAppsStore, type HomePinnedApp } from '../store/homePinnedAppsStore';

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

function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || path || 'Pinned file';
}

const PinnedFileShortcut: React.FC<{ file: HomePinnedFile }> = memo(({ file }) => {
  const movePinnedFile = useHomePinnedFilesStore(s => s.movePinnedFile);
  const unpinFile = useHomePinnedFilesStore(s => s.unpinFile);
  const addRecent = useRecentFiles(s => s.addRecent);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

  const openFile = useCallback(async () => {
    try {
      addRecent({ path: file.path, name: file.name, appId: 'files' });
      const result = await ((window as any).dex?.shell?.openPath?.(file.path)
        ?? (window as any).electron?.invoke?.('shell:openPath', file.path));
      if (result && typeof result === 'string') {
        console.warn('[Home] Failed to open pinned file:', result);
      }
    } catch (error) {
      console.warn('[Home] Failed to open pinned file:', error);
    }
  }, [addRecent, file.name, file.path]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: file.x, origY: file.y, moved: false };
  }, [file.x, file.y]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
    movePinnedFile(file.id, dragRef.current.origX + dx, dragRef.current.origY + dy);
  }, [file.id, movePinnedFile]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const wasClick = !dragRef.current?.moved;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* pointer already released */ }
    dragRef.current = null;
    if (wasClick && e.detail >= 2) void openFile();
  }, [openFile]);

  return (
    <button
      type="button"
      aria-label={`Pinned file ${file.name}`}
      title={`${file.name}\n${file.path}\nDouble-click to open. Drag to move.`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); void openFile(); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); unpinFile(file.id); }}
      style={{
        position: 'absolute',
        left: file.x,
        top: file.y,
        width: 88,
        minHeight: 86,
        zIndex: 9,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: 'var(--space-2) 6px',
        border: '1px solid transparent',
        borderRadius: 10,
        background: 'transparent',
        color: '#fff',
        cursor: 'grab',
        textAlign: 'center',
        userSelect: 'none',
        touchAction: 'none',
        transition: 'background 0.16s ease, border-color 0.16s ease, transform 0.12s ease, box-shadow 0.16s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.28)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = ''; }}
      onPointerDownCapture={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.96)'; }}
      onPointerUpCapture={e => { (e.currentTarget as HTMLElement).style.transform = ''; }}
    >
      <span style={{
        width: 42,
        height: 42,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-accent)',
        background: 'rgba(10,132,255,0.14)',
      }}>
        <DexIcon name="file-text" size={22} color="currentColor" />
      </span>
      <span style={{
        width: '100%',
        fontSize: 11,
        lineHeight: 1.2,
        color: 'rgba(255,255,255,0.92)',
        textShadow: '0 1px 3px rgba(0,0,0,0.65)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
      }}>{file.name}</span>
    </button>
  );
});

PinnedFileShortcut.displayName = 'PinnedFileShortcut';

// ======================================================================
// PINNED APP SHORTCUT (mac-style desktop app icon, draggable anywhere)
// ======================================================================
const PinnedAppShortcut: React.FC<{ pin: HomePinnedApp }> = memo(({ pin }) => {
  const movePinnedApp = useHomePinnedAppsStore(s => s.movePinnedApp);
  const unpinApp = useHomePinnedAppsStore(s => s.unpinApp);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const def = APP_DEFINITIONS[pin.appId];

  const launchApp = useCallback(() => {
    if (!def) return;
    window.dispatchEvent(new CustomEvent('dex-spotlight-navigate', { detail: { appId: pin.appId } }));
  }, [def, pin.appId]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pin.x, origY: pin.y, moved: false };
  }, [pin.x, pin.y]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
    movePinnedApp(pin.id, dragRef.current.origX + dx, dragRef.current.origY + dy);
  }, [pin.id, movePinnedApp]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const wasClick = !dragRef.current?.moved;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* released */ }
    dragRef.current = null;
    if (wasClick && e.detail >= 2) launchApp();
  }, [launchApp]);

  if (!def) return null;
  const png = APP_ICON_PNGS[pin.appId];

  return (
    <button
      type="button"
      aria-label={`Pinned app ${def.name}`}
      title={`${def.name}\nDouble-click to open. Drag to move. Right-click to unpin.`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); launchApp(); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); unpinApp(pin.id); }}
      style={{
        position: 'absolute',
        left: pin.x,
        top: pin.y,
        width: 88,
        minHeight: 86,
        zIndex: 9,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: 'var(--space-2) 6px',
        border: '1px solid transparent',
        borderRadius: 10,
        background: 'transparent',
        color: '#fff',
        cursor: 'grab',
        textAlign: 'center',
        userSelect: 'none',
        touchAction: 'none',
        transition: 'background 0.16s ease, border-color 0.16s ease, transform 0.12s ease, box-shadow 0.16s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.28)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = ''; }}
      onPointerDownCapture={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.96)'; }}
      onPointerUpCapture={e => { (e.currentTarget as HTMLElement).style.transform = ''; }}
    >
      <span style={{
        width: 46,
        height: 46,
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        background: png ? 'transparent' : `linear-gradient(135deg, ${def.color}, ${def.color}cc)`,
        boxShadow: png ? 'none' : '0 4px 12px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.18)',
        overflow: 'hidden',
      }}>
        {png
          ? <img src={png} alt="" draggable={false} style={{ width: 46, height: 46, borderRadius: 10, objectFit: 'cover' }} />
          : <DexIcon name={def.icon as any} size={24} color="currentColor" />}
      </span>
      <span style={{
        width: '100%',
        fontSize: 11,
        lineHeight: 1.2,
        color: 'rgba(255,255,255,0.92)',
        textShadow: '0 1px 3px rgba(0,0,0,0.65)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
      }}>{def.name}</span>
    </button>
  );
});
PinnedAppShortcut.displayName = 'PinnedAppShortcut';

// ======================================================================
// PIN APP PICKER (overlay)
// ======================================================================
const PinAppPicker: React.FC<{ position: { x: number; y: number } | null; onClose: () => void }> = ({ position, onClose }) => {
  const pinApp = useHomePinnedAppsStore(s => s.pinApp);
  const isAppPinned = useHomePinnedAppsStore(s => s.isAppPinned);
  const [query, setQuery] = useState('');
  const apps = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.entries(APP_DEFINITIONS)
      .filter(([id]) => id !== 'home')
      .filter(([id, def]) => !q || def.name.toLowerCase().includes(q) || id.toLowerCase().includes(q))
      .sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [query]);

  const handlePin = useCallback((appId: string) => {
    if (isAppPinned(appId)) { onClose(); return; }
    pinApp(appId, position ?? undefined);
    onClose();
  }, [pinApp, isAppPinned, position, onClose]);

  return (
    <div style={{ ...glassOverlay, position: 'fixed', inset: 0, zIndex: Z_MODAL, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={onClose}>
      <div onMouseDown={e => e.stopPropagation()} style={{
        ...glassPanel,
        width: 'min(520px, calc(100vw - 32px))', maxHeight: 'min(72vh, calc(100vh - 32px))',
        overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '18px 22px var(--space-3)', borderBottom: '1px solid var(--color-bg-hover)' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: '#fff' }}>Pin App to Home</h2>
          <p style={{ margin: '3px 0 10px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>Choose an app to drop on your desktop. Drag to move, right-click to unpin.</p>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search apps"
            aria-label="Filter apps"
            style={{
              width: '100%', padding: 'var(--space-2) var(--space-3)', borderRadius: 8,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--color-border-subtle)',
              color: 'var(--color-text-primary)', fontSize: 13, outline: 'none',
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))', gap: 'var(--space-2)' }}>
            {apps.map(([id, def]) => {
              const pinned = isAppPinned(id);
              const png = APP_ICON_PNGS[id];
              return (
                <button
                  key={id}
                  onClick={() => handlePin(id)}
                  disabled={pinned}
                  className="dex-hover-bg"
                  aria-label={pinned ? `${def.name} already pinned` : `Pin ${def.name}`}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    padding: '10px 6px', borderRadius: 8,
                    background: 'transparent',
                    border: '1px solid transparent',
                    color: 'var(--color-text-primary)', fontSize: 11,
                    cursor: pinned ? 'default' : 'pointer',
                    opacity: pinned ? 0.4 : 1,
                  }}
                >
                  <span style={{
                    width: 40, height: 40, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: png ? 'transparent' : `linear-gradient(135deg, ${def.color}, ${def.color}cc)`,
                    boxShadow: png ? 'none' : '0 3px 10px rgba(0,0,0,0.28)',
                    color: '#fff', overflow: 'hidden',
                  }}>
                    {png
                      ? <img src={png} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
                      : <DexIcon name={def.icon as any} size={22} color="currentColor" />}
                  </span>
                  <span style={{ width: '100%', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def.name}</span>
                  {pinned && <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>Pinned</span>}
                </button>
              );
            })}
            {apps.length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-tertiary)', fontSize: 12 }}>No apps match.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ======================================================================
// COMPONENT
// ======================================================================
export const Home: React.FC = () => {
  const { activities } = useLiveActivity();
  const recentFiles = useRecentFiles(s => s.recentFiles);
  const wpMode = useWallpaperStore(s => s.mode);
  const wpValue = useWallpaperStore(s => s.value);
  const wpBlur = useWallpaperStore(s => s.blur);
  const wpOpacity = useWallpaperStore(s => s.opacity);
  const wpTint = useWallpaperStore(s => s.tint);
  const pinnedFiles = useHomePinnedFilesStore(s => s.pinnedFiles);
  const pinFile = useHomePinnedFilesStore(s => s.pinFile);
  const pinnedApps = useHomePinnedAppsStore(s => s.pinnedApps);

  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false);
  const [appPickerPosition, setAppPickerPosition] = useState<{ x: number; y: number } | null>(null);
  const [showAppPicker, setShowAppPicker] = useState(false);
  const desktopRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [searchSticky, setSearchSticky] = useState(false);
  const [repaintNonce, setRepaintNonce] = useState(0);
  // When the embedded Spotlight has results open, fade the widget layer out so
  // the clock/widgets never paint over (and obscure) the results dropdown.
  const [searchActive, setSearchActive] = useState(false);
  useEffect(() => {
    const onSearchActive = (e: Event) => setSearchActive(!!(e as CustomEvent).detail?.active);
    window.addEventListener('dex-home-search-active', onSearchActive as EventListener);
    return () => window.removeEventListener('dex-home-search-active', onSearchActive as EventListener);
  }, []);
  const recents = useMemo(() => recentFiles.slice(0, 6), [recentFiles]);

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

  useEffect(() => {
    const forceHomeRepaint = () => {
      setRepaintNonce(n => (n + 1) % 1000);
      requestAnimationFrame(() => {
        const el = desktopRef.current;
        if (!el) return;
        el.style.willChange = 'transform, opacity';
        el.style.transform = 'translateZ(0)';
        void el.offsetHeight;
        requestAnimationFrame(() => {
          if (desktopRef.current) desktopRef.current.style.willChange = 'auto';
        });
      });
    };
    window.addEventListener('focus', forceHomeRepaint);
    window.addEventListener('dex:idle-pause', forceHomeRepaint as EventListener);
    window.addEventListener('dex:idle-resume', forceHomeRepaint as EventListener);
    document.addEventListener('visibilitychange', forceHomeRepaint);
    return () => {
      window.removeEventListener('focus', forceHomeRepaint);
      window.removeEventListener('dex:idle-pause', forceHomeRepaint as EventListener);
      window.removeEventListener('dex:idle-resume', forceHomeRepaint as EventListener);
      document.removeEventListener('visibilitychange', forceHomeRepaint);
    };
  }, []);

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

  const pinFileFromDialog = useCallback(async (position?: { x: number; y: number }) => {
    try {
      const result = await ((window as any).electron?.invoke?.('files:openDialog', {
        properties: ['openFile'],
      }) ?? (window as any).dex?.invoke?.('dialog:showOpenDialog', { properties: ['openFile'] }));
      const filePath = result?.filePaths?.[0];
      if (!filePath) return;
      const rect = desktopRef.current?.getBoundingClientRect();
      const x = Math.max(12, (position?.x ?? 72) - (rect?.left ?? 0) - 44);
      const y = Math.max(68, (position?.y ?? 180) - (rect?.top ?? 0) - 24);
      pinFile({ path: filePath, name: fileNameFromPath(filePath) }, { x, y });
      useRecentFiles.getState().addRecent({ path: filePath, name: fileNameFromPath(filePath), appId: 'files' });
    } catch (error) {
      console.warn('[Home] Failed to pin file:', error);
    } finally {
      setCtxMenu(null);
    }
  }, [pinFile]);

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

  // ====================================================================
  // RENDER
  // ====================================================================
  return (
    <div
      ref={desktopRef}
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
        transform: repaintNonce % 2 === 0 ? 'translateZ(0)' : 'translate3d(0,0,0)',
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
        contain: 'layout style paint',
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
          padding: '10px var(--space-6)',
          background: 'rgba(12, 12, 14, 0.34)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
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
          // min-height: 0 is REQUIRED: as a flex child this is the scroll
          // viewport, and without it the default min-height:auto lets it grow
          // to its content height instead of constraining to the column and
          // scrolling -- the tall dashboard then overflows and the root's
          // overflow:hidden clips the lower widgets off at short heights.
          flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
          scrollBehavior: 'smooth',
          scrollbarWidth: 'none',
          overscrollBehaviorY: 'contain',
          WebkitOverflowScrolling: 'touch',
          // Thin edge-softening only: a small fade at the very top and bottom of
          // the scroll viewport so content doesn't hard-clip into a line. The long
          // 96px bottom "feather" was reduced to 18px -- it used to melt the last
          // widgets away over the dock, which (now that the area scrolls) just hid
          // readable content. Keep the edge clean; content stays legible to the end.
          maskImage: 'linear-gradient(to bottom, transparent 0, #000 16px, #000 calc(100% - 18px), transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 16px, #000 calc(100% - 18px), transparent 100%)',
        }}
      >
        {/* ROW 1: Spotlight Search. position+zIndex lift the whole search section
            (and its absolutely-positioned results dropdown) into the positive-z
            layer so the dropdown floats cleanly OVER the widget grid below
            instead of being painted under it (static siblings paint in DOM
            order, so without this the results bled behind the cards). */}
        <div style={{
          marginTop: 36,
          display: 'flex', justifyContent: 'center',
          padding: '0 var(--space-6)',
          position: 'relative', zIndex: 50,
          animation: 'fadeIn 0.25s ease-out 0.03s both',
        }}>
          <SpotlightSearch variant="home" onNavigate={handleLaunchApp} />
        </div>

        {/* Live Activity - inline row */}
        {activities.length > 0 && (
          <div style={{
            marginTop: 'var(--space-3)',
            padding: '0 var(--space-6)',
            animation: 'fadeIn 0.35s ease-out 0.3s both',
          }}>
            <div className="dex-label-caps" style={{ marginBottom: 6 }}>
              Activity
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {activities.slice(0, 3).map(act => (
                <ActivityCard key={act.id} activity={act} />
              ))}
            </div>
          </div>
        )}

        {/* Quick Access Apps removed -- launch apps from dock or apps menu (Ctrl+Space). */}

        {/* DEX 5.5 Home dashboard -- the seven-widget brief set (recent
            projects/notes, current tasks, active workflows, rewind summary,
            AI suggestions, pinned apps). Compact, flat, real data. */}
        <div style={{
          marginTop: 18,
          padding: '0 var(--space-6)',
          animation: 'fadeIn 0.35s ease-out 0.08s both',
        }}>
          <HomeDashboard />
        </div>

        {/* Recents */}
        {recents.length > 0 && (
          <div style={{
            marginTop: 18,
            padding: '0 var(--space-6)',
            animation: 'fadeIn 0.35s ease-out 0.1s both',
          }}>
            <div className="dex-label-caps" style={{ marginBottom: 'var(--space-2)' }}>
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
                    padding: '10px 14px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: 12, cursor: 'pointer',
                    color: 'var(--color-text-primary)', fontSize: 12,
                    textAlign: 'left',
                    boxShadow: 'var(--pg-shadow-panel), var(--pg-gloss-top)',
                    transition: 'background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.boxShadow = '0 12px 34px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.10)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)'; }}
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
        )}

        {/* Bottom spacing */}
        <div style={{ height: 80 }} />
      </div>

      {/* Widget layer -- draggable widgets on home screen.
          Faded + click-through while the Spotlight search has results open so
          the clock/widgets never obscure the results dropdown. */}
      <div style={{
        opacity: searchActive ? 0 : 1,
        pointerEvents: searchActive ? 'none' : 'auto',
        transition: 'opacity 0.15s ease',
      }}>
        <HomeWidgets />
      </div>

      {/* User-pinned file shortcuts -- draggable anywhere on the Home desktop */}
      {pinnedFiles.map(file => (
        <PinnedFileShortcut key={file.id} file={file} />
      ))}

      {/* User-pinned app shortcuts -- mac-style draggable app icons */}
      {pinnedApps.map(pin => (
        <PinnedAppShortcut key={pin.id} pin={pin} />
      ))}

      {/* Pin App picker modal */}
      {showAppPicker && (
        <PinAppPicker
          position={appPickerPosition ? {
            x: Math.max(12, appPickerPosition.x - (desktopRef.current?.getBoundingClientRect().left ?? 0) - 44),
            y: Math.max(68, appPickerPosition.y - (desktopRef.current?.getBoundingClientRect().top ?? 0) - 24),
          } : null}
          onClose={() => { setShowAppPicker(false); setAppPickerPosition(null); }}
        />
      )}

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
              borderRadius: 10, border: '1px solid var(--color-border-subtle)',
              boxShadow: 'var(--pg-shadow-context), 0 0 0 0.5px rgba(255,255,255,0.04)',
              animation: 'fadeIn 0.12s ease-out',
            } as React.CSSProperties}
          >
            {[
              { label: 'Change Wallpaper', icon: <DexIcon name="palette" size={14} />, action: () => { setShowWallpaperPicker(true); setCtxMenu(null); } },
              { label: 'Pin File Here...', icon: <DexIcon name="file-plus" size={14} />, action: () => { void pinFileFromDialog(ctxMenu); } },
              { label: 'Pin App Here...', icon: <DexIcon name="plus" size={14} />, action: () => { setAppPickerPosition(ctxMenu); setShowAppPicker(true); setCtxMenu(null); } },
              null,
              { label: 'Add Widget', icon: <DexIcon name="plus" size={14} />, action: () => { useWidgetStore.getState().setPickerOpen(true); setCtxMenu(null); } },
              null,
              { label: 'Settings', icon: <DexIcon name="settings" size={14} />, action: () => { handleLaunchApp('settings'); setCtxMenu(null); } },
              { label: 'Refresh', icon: <DexIcon name="refresh" size={14} />, action: () => { refreshData(); setCtxMenu(null); } },
            ].map((item, i) =>
              item === null ? (
                <div key={`sep-${i}`} style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px var(--space-2)' }} />
              ) : (
                <button
                  key={item.label}
                  role="menuitem"
                  className="dex-hover-bg"
                  onClick={item.action}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.10)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  onPointerDown={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.16)'; }}
                  onPointerUp={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.10)'; }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: 'calc(100% - 8px)', margin: '0 4px', padding: '7px var(--space-3)',
                    background: 'transparent', border: 'none',
                    color: 'var(--color-text-primary)', fontSize: 13,
                    textAlign: 'left', cursor: 'pointer',
                    borderRadius: 6,
                    transition: 'background 0.12s ease',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, color: 'var(--color-text-secondary)' }}>{item.icon}</span>
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
        <div style={{ padding: 'var(--space-5) var(--space-6) var(--space-4)', borderBottom: '1px solid var(--color-bg-hover)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: 0 }}>Wallpaper</h2>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>Choose a desktop background</p>
            </div>
            <button onClick={onClose} aria-label="Close wallpaper picker" className="dex-hover-bg" style={{ background: 'var(--color-border-subtle)', border: 'none', borderRadius: 6, width: 28, height: 28, color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* Scrollable preset grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4) var(--space-6)', scrollbarWidth: 'thin' }}>
          {(() => {
            const imagePresets = WALLPAPER_PRESETS.filter(p => p.mode === 'image');
            const staticPresets = WALLPAPER_PRESETS.filter(p => p.mode !== 'live' && p.mode !== 'image' && !p.id.startsWith('crimson') && !p.id.startsWith('blood') && !p.id.startsWith('obsidian') && !p.id.startsWith('scarlet') && !p.id.startsWith('inferno'));
            const redPresets = WALLPAPER_PRESETS.filter(p => ['crimson-dark', 'blood-moon', 'obsidian-ember', 'scarlet-edge', 'inferno'].includes(p.id));
            const livePresets = WALLPAPER_PRESETS.filter(p => p.mode === 'live');
            const renderGrid = (presets: typeof WALLPAPER_PRESETS) => (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 10, marginBottom: 'var(--space-5)' }}>
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
                        width: '100%', aspectRatio: '16/10', borderRadius: 8,
                        background: bg,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        border: isActive ? '2.5px solid var(--color-accent, #0a84ff)' : '2px solid var(--color-border-subtle)',
                        cursor: 'pointer', position: 'relative', overflow: 'hidden',
                        transition: 'border-color 0.2s, transform 0.15s',
                        transform: isActive ? 'scale(1.02)' : 'scale(1)',
                        boxShadow: isActive ? '0 0 0 2px rgba(10,132,255,0.3), 0 4px 12px rgba(0,0,0,0.3)' : '0 2px 6px rgba(0,0,0,0.2)',
                      }}
                    >
                      {isActive && (
                        <div style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 8, background: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--pg-shadow-chip)' }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                      )}
                      {p.mode === 'live' && (
                        <div style={{ position: 'absolute', top: 4, left: 4, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,59,48,0.7)', fontSize: 8, fontWeight: 700, color: '#fff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>LIVE</div>
                      )}
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 'var(--space-3) 6px 5px', background: 'linear-gradient(transparent, rgba(0,0,0,0.6))', fontSize: 10, fontWeight: 600, color: 'var(--color-text-primary)', textAlign: 'center', letterSpacing: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
            return (
              <>
                <div className="dex-label-caps" style={{ marginBottom: 10 }}>Images</div>
                {renderGrid(imagePresets)}
                <div className="dex-label-caps" style={{ marginBottom: 10 }}>Presets</div>
                {renderGrid(staticPresets)}
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,59,48,0.6)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Black & Red</div>
                {renderGrid(redPresets)}
                <div className="dex-label-caps" style={{ marginBottom: 10 }}>Live Wallpapers</div>
                {renderGrid(livePresets)}
              </>
            );
          })()}

          {/* Custom image upload */}
          <div className="dex-label-caps" style={{ marginBottom: 10 }}>Custom</div>
          <button
            onClick={handleFileSelect}
            className="dex-hover-bg"
            style={{
              width: '100%', height: 52, borderRadius: 8,
              background: 'var(--color-border-subtle)',
              border: presetId === 'custom' ? '2px solid var(--color-accent, #0a84ff)' : '2px solid var(--color-bg-hover)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
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
        <div style={{ padding: '14px var(--space-6) 18px', borderTop: '1px solid var(--color-bg-hover)', flexShrink: 0 }}>
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
    <div style={{ marginTop: 18, padding: '0 var(--space-6)', animation: 'fadeIn 0.3s ease-out 0.06s both' }}>
      <style>{`
        .home-app-btn {
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          width: 76px; min-width: 76px; height: 80px;
          padding: 10px 6px 8px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 14px;
          cursor: pointer;
          box-shadow: 0 8px 22px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.10);
          transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
          position: relative;
          overflow: hidden;
        }
        .home-app-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 0%, rgba(255,255,255,0.14), transparent 70%);
          opacity: 0;
          transition: opacity 0.2s ease;
          pointer-events: none;
        }
        .home-app-btn:hover {
          transform: translateY(-2px);
          background: rgba(255,255,255,0.11);
          border-color: rgba(255,255,255,0.18);
          box-shadow: 0 14px 34px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.14);
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
              <img src={APP_ICON_PNGS[app.id]} alt="" style={{ width: 42, height: 42, borderRadius: 6 }} />
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
              background: 'var(--color-bg-elevated)',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: 'var(--pg-shadow-popover), var(--pg-gloss-top)',
              animation: 'ctxFadeIn 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <style>{`@keyframes ctxFadeIn { from { opacity:0; transform:scale(0.92) translateY(-4px); } to { opacity:1; transform:scale(1) translateY(0); } }`}</style>
            {ctxMenu.appId && (
              <button
                onClick={() => { removeApp(ctxMenu.appId!); setCtxMenu(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%', padding: 'var(--space-2) 14px',
                  background: 'transparent', border: 'none', color: 'var(--color-error, #FF453A)', fontSize: 13, cursor: 'pointer', textAlign: 'left',
                  borderRadius: 4, margin: '0 4px', transition: 'all 0.1s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,69,58,0.15)'; e.currentTarget.style.transform = 'translateX(2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'translateX(0)'; }}
              >
                <DexIcon name="x" size={14} /> Remove from Home
              </button>
            )}
            {availableToAdd.length > 0 && (
              <>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px var(--space-2)' }} />
                <div style={{ padding: '6px 14px', fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: '0.03em' }}>Add App</div>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {availableToAdd.map(app => (
                    <button
                      key={app.id}
                      onClick={() => { addApp(app.id); setCtxMenu(null); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: 'calc(100% - 8px)', padding: 'var(--space-2) 14px',
                        background: 'transparent', border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', textAlign: 'left',
                        borderRadius: 4, margin: '0 4px', transition: 'all 0.1s ease',
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
      display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
      padding: '10px 14px', borderRadius: 12,
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.10)',
      boxShadow: 'var(--pg-shadow-popover), var(--pg-gloss-top)',
      opacity: done ? 0.6 : 1,
      cursor: 'default',
      transition: 'opacity 0.18s ease, transform 0.18s ease, background 0.15s ease, box-shadow 0.15s ease',
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
