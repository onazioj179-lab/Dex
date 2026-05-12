/**
 * ===========================================================================
 * DEX -- App Manager (macOS Tahoe Style)
 * ===========================================================================
 *
 * Floating dock with magnification, keep-alive multi-app engine,
 * Launchpad overlay, 25 apps wired, split-screen tiling, traffic lights.
 *
 * @author     Onazi Treasure OJ
 * @copyright  Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * @license    MIT License
 * ===========================================================================
 */

import React, { useState, useMemo, Suspense, lazy, useEffect, useCallback, useRef } from 'react';
// UnifiedSearch retired -- Ctrl+K is owned by CommandPalette (mounted in App.tsx).
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';
import { useRecentFiles } from '../store/useRecentFiles';

import { useAppTransition } from '../utils/motionHooks';
import { useDockPins, PERMANENT_PINS } from '../store/dockPinStore';
import { useUkiStore } from '../store/ukiStore';
import { liquidGlassDock, glassModal, adaptiveShadow } from '../styles/glassMenu';
import { computeDockGeometry } from '../../shared/shell/dockGeometry';
import { useShellPreferences } from '../store/shellPreferencesStore';
import { spotlightEngine } from '../shell/SpotlightEngine';
import type { SpotlightAction } from '../shell/SpotlightEngine';
// SpotlightSearch overlay retired (Ctrl+Space now opens UKI panel; Ctrl+K opens CommandPalette).
// The Home page still uses SpotlightSearch's `home` variant; that import lives in pages/Home.tsx.
import { SpringAnimator, SPRING_PRESETS, isReduceMotion } from '../utils/MotionController';
import { setSoundEnabled, isSoundEnabled } from '../shell/SpatialAudio';
import DexIcon from './DexIcon';
import UkiOverlay from './UkiOverlay';
import { DEX_GLOBAL_SHORTCUTS, DEX_WORKFLOWS } from '../uki';
import { AppErrorBoundary as CanonicalErrorBoundary } from '../services/ErrorBoundary';
import { getStoredTier, shouldKeepAlive, getMaxConcurrentApps, type DeviceTier } from '../services/TierManager';

// Shell interaction layers
import { gestureEngine } from '../shell/GestureEngine';
import type { GestureEvent } from '../shell/GestureEngine';
import { gestureRecognizer, initializeTouchSystem } from '../utils/TouchInputSystem';
import { AppOverview } from '../shell/AppOverview';
import { NotificationBanners, NotificationCenter, useBannerNotifications } from '../shell/NotificationBanners';
import { getDockReflectionStyle } from '../shell/WallpaperAccent';
import { initVisualEffects, destroyVisualEffects } from '../shell/VisualEffects';
import StageManager, { STAGE_STRIP_WIDTH } from '../shell/StageManager';
import AppSwitcher from '../shell/AppSwitcher';
import { loadEngagement, saveEngagement, incrementStat, checkAchievements } from '../services/engagement';
// Permission store is consumed by QuickControls; keep the import side-effect-free.
import { QuickControls } from '../shell/QuickControls';
import { getAppPredictor, schedulePrewarm } from '../services/AppPredictor';
import { idleContinuity } from '../services/IdleContinuity';
import { clampWindowToWorkspace, clampWindowForDrag, fitWindowToWorkspace, getWorkspaceBounds, isSameWindowBounds, cascadeWindow } from '../../shared/shell/windowLayout';

// Retry wrapper for lazy imports — survives stale chunks after rebuild
function lazyRetry<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  maxRetries = 3,
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    const retryKey = `dex-chunk-retry-${Date.now()}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const mod = await importFn();
        // Clear any reload flags on success
        sessionStorage.removeItem('dex-chunk-reload');
        return mod;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Exponential backoff: 100ms, 200ms, 400ms
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
        }
      }
    }

    // All retries failed — check if we've already reloaded once
    const reloaded = sessionStorage.getItem('dex-chunk-reload');
    if (!reloaded) {
      // Emit error event before reload so user sees feedback
      window.dispatchEvent(new CustomEvent('dex-chunk-error', {
        detail: { error: lastError?.message, retrying: true }
      }));
      sessionStorage.setItem('dex-chunk-reload', '1');
      // Try one final import after a short delay (cache may have been stale)
      try {
        await new Promise(r => setTimeout(r, 500));
        return await importFn();
      } catch {
        // Final attempt failed — reload page as last resort
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
    }

    // Already reloaded once and still failing — surface the error
    sessionStorage.removeItem('dex-chunk-reload');
    throw lastError || new Error('Failed to load module after multiple retries');
  });
}

// -- Lazy-load all 22 apps -------------------------------------------------
const Home = lazyRetry(() => import('../pages/Home'));
const Files = lazyRetry(() => import('../pages/Files'));
const Browser = lazyRetry(() => import('../pages/Browser'));
const Settings = lazyRetry(() => import('../pages/Settings'));
const TaskManager = lazyRetry(() => import('../pages/TaskManager'));
const Transfers = lazyRetry(() => import('../pages/Transfers'));
const Notes = lazyRetry(() => import('../DEXAPPLICATIONS/notes/DexNotes'));
const Tasks = lazyRetry(() => import('../pages/Tasks'));
const Power = lazyRetry(() => import('../pages/Power'));
const Workflows = lazyRetry(() => import('../pages/Workflows'));
const Gallery = lazyRetry(() => import('../pages/Gallery'));
const AudioPage = lazyRetry(() => import('../pages/Audio'));
const Store = lazyRetry(() => import('../pages/Store'));
const Games = lazyRetry(() => import('../pages/Games'));

const VideoEditor = lazyRetry(() => import('../DEXAPPLICATIONS/vinx/Vinx'));
const Imosion = lazyRetry(() => import('../DEXAPPLICATIONS/imosion/Imosion'));
const Prism = lazyRetry(() => import('../DEXAPPLICATIONS/prism/Prism'));
const Flux = lazyRetry(() => import('../DEXAPPLICATIONS/flux/Flux'));
const Forge = lazyRetry(() => import('../DEXAPPLICATIONS/forge/Forge'));
const Calculator = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/Calculator'));
const Calendar = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/Calendar'));
const PasswordGenerator = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/PasswordGenerator'));
const Rewind = lazyRetry(() => import('../DEXAPPLICATIONS/rewind/Rewind'));

const KanbanApp = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/KanbanApp'));
const AchievementsApp = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/Achievements'));
const RecycleBin = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/RecycleBin'));
const Axl = lazyRetry(() => import('../DEXAPPLICATIONS/axl/Axl'));
const Stopwatch = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/Stopwatch'));
const UnitConverter = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/UnitConverter'));
const PomodoroTimer = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/PomodoroTimer'));
const QRCodeGenerator = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/QRCodeGenerator'));
const ColorPickerApp = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/ColorPicker'));
const Weather = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/Weather'));
const WorldClock = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/WorldClock'));
const NoiseGenerator = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/NoiseGenerator'));
const DexCode = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/DexCode'));
const Nexus = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/Nexus'));
const Learn = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/Learn'));
const CollabHub = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/CollabHub'));
const Canvas = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/Canvas'));
const Timer = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/Timer'));
const ScreenRecorder = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/ScreenRecorder'));
const PresentationBuilder = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/PresentationBuilder'));
const PDFViewer = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/PDFViewer'));
const PixelArt = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/PixelArt'));

// -- App ID type (all 22) --------------------------------------------------
type AppId = 'home' | 'files' | 'browser' | 'settings' | 'taskmanager' | 'transfers'
  | 'notes' | 'tasks' | 'power' | 'workflows' | 'gallery' | 'audio' | 'store' | 'games'
  | 'videoeditor' | 'imosion' | 'prism' | 'flux' | 'forge' | 'axl'
  | 'calculator' | 'calendar' | 'passwordgenerator' | 'rewind' | 'kanban' | 'achievements' | 'recyclebin'
  | 'stopwatch' | 'unitconverter' | 'pomodoro' | 'qrcode' | 'colorpicker'
  | 'weather' | 'worldclock' | 'noisegenerator' | 'dexcode' | 'nexus' | 'learn' | 'collabhub' | 'canvas' | 'timer'
  | 'screenrecorder' | 'presentation' | 'pdfviewer' | 'pixelart';

// Default floating window sizes per app. New launches open in the full inner
// workspace; these sizes are used when users explicitly restore/detach.
const APP_WINDOW_SIZES: Record<string, { w: number; h: number; maximized?: boolean }> = {
  browser: { w: 900, h: 600 },
  files: { w: 800, h: 550 },
  gallery: { w: 800, h: 550 },
  settings: { w: 920, h: 620 },
  taskmanager: { w: 880, h: 600 },
  notes: { w: 700, h: 500 },
  videoeditor: { w: 900, h: 600, maximized: true },
  imosion: { w: 850, h: 580, maximized: true },
  prism: { w: 850, h: 580, maximized: true },
  flux: { w: 850, h: 580, maximized: true },
  forge: { w: 850, h: 580, maximized: true },
  audio: { w: 800, h: 550 },
  rewind: { w: 720, h: 500 },
  tasks: { w: 680, h: 480 },
  workflows: { w: 720, h: 500 },
  store: { w: 900, h: 640 },
  games: { w: 900, h: 640 },
  calendar: { w: 680, h: 480 },
  kanban: { w: 720, h: 500 },
  calculator: { w: 340, h: 480 },
  passwordgenerator: { w: 440, h: 480 },
  achievements: { w: 600, h: 460 },
  recyclebin: { w: 600, h: 460 },
  transfers: { w: 600, h: 460 },
  power: { w: 500, h: 440 },
  axl: { w: 1000, h: 650, maximized: true },
  stopwatch: { w: 340, h: 480 },
  unitconverter: { w: 400, h: 520 },
  pomodoro: { w: 360, h: 520 },
  qrcode: { w: 400, h: 560 },
  colorpicker: { w: 360, h: 520 },
  weather: { w: 400, h: 600 },
  worldclock: { w: 500, h: 520 },
  noisegenerator: { w: 420, h: 580 },
  dexcode: { w: 900, h: 620 },
  nexus: { w: 900, h: 650 },
  learn: { w: 600, h: 520 },
  collabhub: { w: 900, h: 650 },
  canvas: { w: 800, h: 600, maximized: true },
  timer: { w: 360, h: 520 },
  screenrecorder: { w: 720, h: 540 },
  presentation: { w: 1100, h: 700, maximized: true },
  pdfviewer: { w: 900, h: 650, maximized: true },
  pixelart: { w: 900, h: 640, maximized: true },
};

const APP_WINDOW_MIN_SIZES: Record<string, { w: number; h: number }> = {
  browser: { w: 720, h: 460 },
  files: { w: 700, h: 460 },
  gallery: { w: 700, h: 460 },
  settings: { w: 820, h: 560 },
  taskmanager: { w: 760, h: 520 },
  notes: { w: 560, h: 420 },
  workflows: { w: 640, h: 440 },
  store: { w: 760, h: 520 },
  games: { w: 760, h: 520 },
  dexcode: { w: 760, h: 500 },
  collabhub: { w: 760, h: 520 },
};

const getUsableFloatingBounds = (
  appId: string,
  bounds: { x: number; y: number; w: number; h: number },
  workspace: { x: number; y: number; w: number; h: number },
) => {
  const min = APP_WINDOW_MIN_SIZES[appId] ?? { w: 360, h: 280 };
  return clampWindowToWorkspace(
    {
      ...bounds,
      w: Math.min(workspace.w, Math.max(bounds.w, min.w)),
      h: Math.min(workspace.h, Math.max(bounds.h, min.h)),
    },
    workspace,
  );
};

// Creative/pro apps that open maximized by default
const CREATIVE_APPS: ReadonlySet<string> = new Set(['videoeditor', 'imosion', 'prism', 'flux', 'forge', 'axl']);

// Platform detection for title bar overlay handling
const IS_WINDOWS = navigator.platform.includes('Win');

// Heavy creative apps render their own canvas / GPU surfaces and should
// never pay the backdrop-filter cost of the global glass system. Their
// floating windows stay opaque so timelines, viewports, and editors render
// at full performance.
const HEAVY_APP_IDS: ReadonlySet<AppId> = new Set<AppId>([
  'videoeditor', 'imosion', 'prism', 'flux', 'forge', 'axl', 'nexus', 'dexcode',
  'canvas', 'pixelart', 'screenrecorder',
]);

// Map AppId to lazy component
const APP_COMPONENTS: Record<AppId, React.LazyExoticComponent<any>> = {
  home: Home, files: Files, browser: Browser, settings: Settings, taskmanager: TaskManager, transfers: Transfers,
  notes: Notes, tasks: Tasks, power: Power, workflows: Workflows,
  gallery: Gallery, audio: AudioPage, store: Store, games: Games,
  videoeditor: VideoEditor, imosion: Imosion, prism: Prism, flux: Flux, forge: Forge,
  calculator: Calculator, calendar: Calendar, passwordgenerator: PasswordGenerator,
  rewind: Rewind, kanban: KanbanApp, achievements: AchievementsApp,
  recyclebin: RecycleBin,
  axl: Axl,
  stopwatch: Stopwatch, unitconverter: UnitConverter, pomodoro: PomodoroTimer,
  qrcode: QRCodeGenerator, colorpicker: ColorPickerApp,
  weather: Weather, worldclock: WorldClock, noisegenerator: NoiseGenerator, dexcode: DexCode,
  nexus: Nexus, learn: Learn, collabhub: CollabHub,
  canvas: Canvas, timer: Timer,
  screenrecorder: ScreenRecorder, presentation: PresentationBuilder, pdfviewer: PDFViewer, pixelart: PixelArt,
};

// -- App PNG Icons (branded creative app icons) ---------------------------
import vinxIconPng from '../../../appicons/vinx.png';
import imosionIconPng from '../../../appicons/imosion.png';
import forgeIconPng from '../../../appicons/forge.png';
import nexusIconPng from '../../../appicons/nexus.png';

const AppIconPngs: Record<string, string> = {
  videoeditor: vinxIconPng,
  imosion: imosionIconPng,
  forge: forgeIconPng,
  nexus: nexusIconPng,
};

const AppIconImg: React.FC<{ appId: string; size?: number }> = ({ appId, size = 24 }) => {
  const src = AppIconPngs[appId];
  if (!src) return null;
  return <img src={src} alt="" style={{ width: size, height: size, borderRadius: size > 20 ? 10 : 5, objectFit: 'cover' }} />;
};

// -- SVG Icons -------------------------------------------------------------
const dockIconStyle: React.CSSProperties = {};
const sw = 2.5;
const Icons: Record<string, JSX.Element> = {
  home: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  files: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  notes: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  browser: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  videoeditor: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 9l5 3-5 3V9z"/></svg>,
  imosion: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
  prism: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><polygon points="12 2 3 21 21 21"/><line x1="6" y1="15" x2="18" y2="15"/><line x1="18" y1="15" x2="22" y2="12"/><line x1="18" y1="15" x2="22" y2="18"/></svg>,
  flux: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  forge: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  calculator: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/><line x1="8" y1="18" x2="8" y2="18.01"/><line x1="12" y1="18" x2="16" y2="18"/></svg>,
  calendar: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  settings: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  transfers: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
  tasks: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  power: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>,
  workflows: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>,
  store: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><path d="M3 9l1-5h16l1 5"/><path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/></svg>,
  games: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><rect x="2" y="6" width="20" height="12" rx="4"/><line x1="7" y1="12" x2="11" y2="12"/><line x1="9" y1="10" x2="9" y2="14"/><circle cx="16" cy="11" r="1"/><circle cx="18" cy="13" r="1"/></svg>,
  gallery: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><rect x="2" y="2" width="9" height="9" rx="1.5"/><rect x="13" y="2" width="9" height="9" rx="1.5"/><rect x="2" y="13" width="9" height="9" rx="1.5"/><rect x="13" y="13" width="9" height="9" rx="1.5"/></svg>,
  audio: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  passwordgenerator: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  rewind: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 8 14"/><path d="M4.93 4.93l2.83 2.83"/><path d="M2 12h2"/></svg>,

  kanban: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="15" rx="1"/></svg>,
  achievements: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7"/><path d="M4 22h16"/><path d="M10 22V8h4v14"/><path d="M8 9h8l-1 5H9L8 9z"/></svg>,
  recyclebin: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  axl: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M3 12h18"/><circle cx="12" cy="12" r="3"/><line x1="5" y1="5" x2="8" y2="8"/><line x1="16" y1="5" x2="19" y2="2"/></svg>,
  stopwatch: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M10 2h4"/><path d="M12 2v2"/><path d="M20 5l-1.5 1.5"/></svg>,
  unitconverter: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>,
  pomodoro: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/><path d="M10 1h4"/></svg>,
  qrcode: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/><rect x="2" y="14" width="8" height="8" rx="1"/><rect x="14" y="14" width="4" height="4"/><rect x="20" y="20" width="2" height="2"/><rect x="14" y="20" width="2" height="2"/><rect x="20" y="14" width="2" height="2"/></svg>,
  taskmanager: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/><path d="M4 20h16"/></svg>,
  colorpicker: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>,
  nexus: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(30 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-30 12 12)"/><circle cx="12" cy="12" r="2"/></svg>,
  learn: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  collabhub: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>,
  canvas: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 13l2 2 4-4"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>,
  timer: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><circle cx="12" cy="13" r="8"/><path d="M12 9v4"/><path d="M10 2h4"/><path d="M12 2v2"/></svg>,
  weather: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><path d="M17 18a5 5 0 0 0 0-10h-.8A8 8 0 1 0 4 15.3"/><path d="M8 18h9"/></svg>,
  worldclock: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="M12 2v3"/><path d="M12 19v3"/></svg>,
  noisegenerator: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><path d="M2 12h2l3-9 3 18 3-12 3 6 2-3h4"/></svg>,
  dexcode: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/><line x1="14" y1="4" x2="10" y2="20"/></svg>,
  launchpad: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={dockIconStyle}><circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19" cy="19" r="2"/></svg>,
  chevronLeft: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  chevronRight: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  minimize: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  maximize: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>,
  close: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
};

// -- Dock configuration ----------------------------------------------------
// Helper: convert hex color to r,g,b string for rgba()
const hexToRgb = (hex: string): string => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

interface DockItem { id: AppId; label: string; color: string }

// All apps for Launchpad -- ALL 22 apps organized by category
const LAUNCHPAD_APPS: { id: AppId; label: string; color: string }[] = [
  // System
  { id: 'settings', label: 'Settings', color: 'var(--color-text-tertiary)' },
  { id: 'taskmanager', label: 'Task Manager', color: 'var(--color-accent)' },
  { id: 'power', label: 'Power', color: 'var(--color-error)' },
  { id: 'recyclebin', label: 'Trash', color: 'var(--color-text-tertiary)' },
  // Productivity
  { id: 'files', label: 'Files', color: '#339AF0' },
  { id: 'browser', label: 'Browser', color: '#5E5CE6' },
  { id: 'notes', label: 'Notes', color: 'var(--color-warning)' },
  { id: 'tasks', label: 'Tasks', color: 'var(--color-warning)' },
  { id: 'calendar', label: 'Calendar', color: 'var(--color-error)' },
  { id: 'workflows', label: 'Workflows', color: '#BF5AF2' },
  { id: 'store', label: 'Store', color: '#0A84FF' },
  { id: 'games', label: 'Games', color: '#30D158' },
  // Creative Suite
  { id: 'videoeditor', label: 'VINX', color: '#BF5AF2' },
  { id: 'imosion', label: 'Imosion', color: 'var(--color-success)' },
  { id: 'prism', label: 'PRISM', color: 'var(--color-success)' },
  { id: 'flux', label: 'FLUX', color: '#64D2FF' },
  { id: 'forge', label: 'FORGE', color: 'var(--color-warning)' },
  // Media
  { id: 'gallery', label: 'Gallery', color: '#FF375F' },
  { id: 'audio', label: 'Audio', color: '#FC3D39' },
  // Tools
  { id: 'calculator', label: 'Calculator', color: 'var(--color-text-tertiary)' },
  { id: 'passwordgenerator', label: 'Passwords', color: 'var(--color-success)' },
  { id: 'transfers', label: 'Share', color: '#32D74B' },
  { id: 'rewind', label: 'Rewind', color: 'var(--color-accent)' },
  { id: 'stopwatch', label: 'Stopwatch', color: 'var(--color-warning)' },
  { id: 'unitconverter', label: 'Converter', color: '#64D2FF' },
  { id: 'pomodoro', label: 'Pomodoro', color: 'var(--color-error)' },
  { id: 'qrcode', label: 'QR Code', color: 'var(--color-text-primary)' },
  { id: 'colorpicker', label: 'Colors', color: '#BF5AF2' },
  // Project Management
  { id: 'kanban', label: 'Kanban', color: '#5E5CE6' },
  // Achievements
  { id: 'achievements', label: 'Trophies', color: '#FF9500' },
  // Engineering
  { id: 'axl', label: 'AXL', color: 'var(--color-accent)' },
  // New Apps
  { id: 'weather', label: 'Weather', color: '#64D2FF' },
  { id: 'worldclock', label: 'World Clock', color: '#AC8E68' },
  { id: 'noisegenerator', label: 'Noise', color: 'var(--color-success)' },
  { id: 'dexcode', label: 'DexCode', color: 'var(--color-success)' },
  // Visualization
  { id: 'nexus', label: 'Nexus', color: 'var(--color-accent)' },
  // Intelligence
  { id: 'learn', label: 'Learn', color: '#5E5CE6' },
  // Collaboration
  { id: 'collabhub', label: 'Collab Hub', color: '#5E5CE6' },
  // Canvas & Timer
  { id: 'canvas', label: 'Canvas', color: '#FF9500' },
  { id: 'timer', label: 'Timer', color: '#30D158' },
  // New apps
  { id: 'screenrecorder', label: 'Screen Rec', color: '#FF453A' },
  { id: 'presentation', label: 'Presentation', color: '#FF9F0A' },
  { id: 'pdfviewer', label: 'PDF Viewer', color: '#5E5CE6' },
  { id: 'pixelart', label: 'Pixel Art', color: '#34C759' },
];

// -- App menu categories (module-level, computed once) --------------------
const MODULE_APP_MENU_CATEGORIES: { label: string; apps: typeof LAUNCHPAD_APPS }[] = (() => {
  const cats: { label: string; apps: typeof LAUNCHPAD_APPS }[] = [];
  const catMap: Record<string, typeof LAUNCHPAD_APPS> = {};
  const catOrder = ['System', 'Productivity', 'Creative Suite', 'Media', 'Tools', 'Entertainment', 'Project Management', 'Rewards'];
  const appToCat: Record<string, string> = {
    settings: 'System', power: 'System', recyclebin: 'System',
    files: 'Productivity', browser: 'Productivity', notes: 'Productivity', tasks: 'Productivity', calendar: 'Productivity', workflows: 'Productivity', dexcode: 'Productivity', collabhub: 'Productivity', store: 'System', games: 'Entertainment',
    videoeditor: 'Creative Suite', imosion: 'Creative Suite', prism: 'Creative Suite', flux: 'Creative Suite', forge: 'Creative Suite',
    gallery: 'Media', audio: 'Media', noisegenerator: 'Media',
    calculator: 'Tools', passwordgenerator: 'Tools', transfers: 'Tools', rewind: 'Tools',
    stopwatch: 'Tools', unitconverter: 'Tools', pomodoro: 'Tools', qrcode: 'Tools', colorpicker: 'Tools',
    weather: 'Tools', worldclock: 'Tools',
    canvas: 'Tools', timer: 'Tools',
    nexus: 'Tools',
    learn: 'Tools',
    screenrecorder: 'Media', presentation: 'Productivity', pdfviewer: 'Productivity', pixelart: 'Creative Suite',
    kanban: 'Project Management',
    axl: 'Entertainment',
    achievements: 'Rewards',
  };
  LAUNCHPAD_APPS.forEach(app => {
    const cat = appToCat[app.id] || 'Other';
    if (!catMap[cat]) catMap[cat] = [];
    catMap[cat].push(app);
  });
  catOrder.forEach(c => { if (catMap[c]?.length) cats.push({ label: c, apps: catMap[c] }); });
  return cats;
})();

// -- Extracted styles (module constants — never re-created) ----------------
const errorBoundaryContainer: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  height: '100%', background: 'var(--color-bg-base)', gap: 16,
  animation: 'fadeIn 0.25s var(--ease-out)',
};
const errorBoundaryIcon: React.CSSProperties = {
  width: 52, height: 52, borderRadius: 14,
  background: 'rgba(255,69,58,0.1)', border: '0.5px solid rgba(255,69,58,0.2)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const errorBoundaryTitle: React.CSSProperties = { fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' };
const errorBoundaryMsg: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-muted)', maxWidth: 320, textAlign: 'center', lineHeight: 1.5 };
const errorBoundaryBtn: React.CSSProperties = {
  padding: '8px 22px', background: 'var(--color-accent)', color: '#fff',
  border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 500,
  cursor: 'pointer', marginTop: 4, letterSpacing: '-0.01em',
  transition: 'opacity 0.15s ease, transform 0.12s ease',
};
const errorBoundaryFatal: React.CSSProperties = { fontSize: 11, color: 'var(--color-text-muted)', opacity: 0.6 };

const loadingContainer: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  padding: '18px',
  gap: '18px',
  position: 'relative',
  overflow: 'hidden',
  background: 'linear-gradient(180deg, rgba(12,12,14,0.98) 0%, rgba(18,18,22,0.98) 100%)',
};
const loadingToolbar: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
  alignItems: 'center',
  zIndex: 1,
};
const loadingSkel = (w: number, delay = '0s'): React.CSSProperties => ({
  width: w,
  height: 28,
  borderRadius: 999,
  background: 'var(--color-bg-hover)',
  animation: 'pulse 1.5s ease-in-out infinite',
  animationDelay: delay,
});
const loadingContentRow: React.CSSProperties = { flex: 1, display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'center' };
const loadingContentSkel = (w: number | string, delay: string): React.CSSProperties => ({
  width: w,
  borderRadius: 999,
  background: 'var(--color-border-subtle)',
  animation: 'pulse 1.5s ease-in-out infinite',
  animationDelay: delay,
});

const getLoadingMilestones = (appId?: string): string[] => {
  const category = appId ? APP_DEFINITIONS[appId]?.category : undefined;
  switch (category) {
    case 'creative':
      return ['Preparing workspace', 'Loading tools', 'Mounting canvas'];
    case 'media':
      return ['Indexing assets', 'Restoring timeline', 'Warming playback'];
    case 'productivity':
      return ['Restoring data', 'Hydrating panels', 'Syncing state'];
    case 'system':
      return ['Connecting services', 'Loading controls', 'Drawing interface'];
    default:
      return ['Starting module', 'Restoring state', 'Finishing layout'];
  }
};

// -- Per-app ErrorBoundary (delegates to canonical services/ErrorBoundary) --
const AppErrorBoundary: React.FC<{ appId: string; children: React.ReactNode }> = ({ appId, children }) => {
  const def = APP_DEFINITIONS[appId];
  return (
    <CanonicalErrorBoundary
      instanceId={appId}
      appId={appId}
      appName={def?.name || appId}
      appColor={def?.color || '#8E8E93'}
    >
      {children}
    </CanonicalErrorBoundary>
  );
};

const Loading: React.FC<{ appId?: string }> = ({ appId }) => {
  const milestones = getLoadingMilestones(appId);
  const [step, setStep] = React.useState(0);
  const appDef = appId ? APP_DEFINITIONS[appId] : undefined;
  React.useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 200);
    const t2 = setTimeout(() => setStep(2), 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <div 
      style={loadingContainer}
      role="status"
      aria-busy="true"
      aria-label={`Loading ${appDef?.name || 'application'}`}
      data-app-loading={appId || 'true'}
    >
      <div style={loadingToolbar} aria-hidden="true">
        <div style={loadingSkel(80)} />
        <div style={loadingSkel(60, '0.1s')} />
        <div style={loadingSkel(50, '0.2s')} />
        <div style={{ flex: 1 }} />
        <div style={loadingSkel(28, '0.3s')} />
      </div>
      <div style={loadingContentRow}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <div style={{ ...loadingContentSkel(180, '0.1s'), height: 10 }} aria-hidden="true" />
          <div style={{ ...loadingContentSkel(120, '0.2s'), height: 10 }} aria-hidden="true" />
          <div 
            style={{ fontSize: 11, color: 'var(--color-text-muted)', opacity: 0.5, marginTop: 6 }}
            aria-live="polite"
          >
            {milestones[step] || milestones[milestones.length - 1]}
          </div>
        </div>
      </div>
    </div>
  );
};

// -- Settings persistence --------------------------------------------------
const getWindowControlStyle = (): 'system' | 'traffic' => {
  const isWin = navigator.platform.includes('Win');
  // On Windows, always use system controls — traffic lights are macOS only
  if (isWin) {
    try { localStorage.removeItem('dex-window-controls'); } catch { /* ignore */ }
    return 'system';
  }
  try {
    const saved = localStorage.getItem('dex-window-controls');
    if (saved === 'system' || saved === 'traffic') return saved;
    return 'traffic';
  } catch {
    return 'traffic';
  }
};

// ==========================================================================
// MAIN COMPONENT
// ==========================================================================
export const AppManager: React.FC = () => {
  // Mount guard for async operations
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const {
    runningApps, currentAppId, launchApp, closeApp: closeRunningApp, setCurrentApp: setCurrentRunningApp,
  } = useRunningApps();

  // Dock pinning store
  const { pins: dockPins, pinApp, unpinApp, reorder: reorderDockPins, isPinned: isDockPinned, mode: dockMode, magnification: dockMagnification, magnificationScale, iconSize: dockIconSize } = useDockPins();

  // Shell preferences (movable + compact taskbar) — read reactively so edge /
  // preset changes from Settings re-render the dock immediately.
  const dockEdgePref = useShellPreferences((s) => s.dockEdge);
  const dockPresetPref = useShellPreferences((s) => s.dockPreset);

  // Ctrl+K -> CommandPalette (App.tsx). Ctrl+Space -> UKI panel. No legacy unified search overlay.
  const [showAppMenu, setShowAppMenu] = useState(false);
  const showAppMenuRef = useRef(false);
  showAppMenuRef.current = showAppMenu;
  const [appMenuSearch, setAppMenuSearch] = useState('');
  const appMenuSearchRef = useRef<HTMLInputElement>(null);
  const [taskbarVisible, setTaskbarVisible] = useState(true);
  const [navHistory, setNavHistory] = useState<AppId[]>(['home']);
  const [navIndex, setNavIndex] = useState(0);
  const navHistoryRef = useRef<AppId[]>(['home']);
  const navIndexRef = useRef(0);
  // Keep refs in sync for stable closures
  navHistoryRef.current = navHistory;
  navIndexRef.current = navIndex;
  const [windowControls, setWindowControls] = useState<'system' | 'traffic'>(getWindowControlStyle);
  const nativeOverlayWidth = 0; // Custom buttons rendered; no native overlay padding needed
  const [systemVolume, setSystemVolume] = useState(() => { try { return Number(localStorage.getItem('dex-system-volume') ?? '80'); } catch { return 80; } });
  const [spatialAudioOn, setSpatialAudioOn] = useState(() => isSoundEnabled());

  // -- Suspend/Resume & Crash Recovery toasts --
  useEffect(() => {
    const ipcRenderer = (window as any).electron?.ipcRenderer;
    if (!ipcRenderer) return;

    const onResume = () => {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message: 'System resumed — restoring session' } }));
      // Force repaint to fix blank/black screen after sleep
      requestAnimationFrame(() => {
        document.body.style.opacity = '0.999';
        requestAnimationFrame(() => { document.body.style.opacity = '1'; });
      });
    };
    const onLock = () => {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message: 'Session locked' } }));
    };
    // System suspend/OS-lock events: do not force a Dex lock overlay. Only lock when
    // the user has explicitly enabled `lockOnSleep`. Always flush autosave + park work.
    const onSystemSuspend = () => {
      window.dispatchEvent(new CustomEvent('dex-system-suspend'));
      try {
        const cfg = (require('../store/useAuthStore') as any).useAuthStore?.getState?.()?.config;
        if (cfg?.lockOnSleep) {
          (require('../store/useAuthStore') as any).useAuthStore?.getState?.()?.lock?.();
        }
      } catch { /* ignore */ }
    };
    const onSystemLock = () => {
      window.dispatchEvent(new CustomEvent('dex-system-lock'));
      try {
        const cfg = (require('../store/useAuthStore') as any).useAuthStore?.getState?.()?.config;
        if (cfg?.lockOnSleep) {
          (require('../store/useAuthStore') as any).useAuthStore?.getState?.()?.lock?.();
        }
      } catch { /* ignore */ }
    };
    ipcRenderer.on?.('dex:resume', onResume);
    ipcRenderer.on?.('dex:lock-screen', onLock);
    ipcRenderer.on?.('dex:system-suspend', onSystemSuspend);
    ipcRenderer.on?.('dex:system-lock', onSystemLock);

    // Repaint on idle/sleep return is handled by ScreenGuardSystem (single source
    // of truth). AppManager no longer flickers body opacity on visibility change
    // — that caused the wallpaper to flash when returning from idle.

    // Check for crash recovery state
    (window as any).electron?.invoke?.('recovery:savedState').then((state: any) => {
      if (state?.timestamp) {
        const ago = Math.round((Date.now() - state.timestamp) / 60000);
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'warning', message: `Previous session recovered (${ago}m ago)` } }));
      }
    }).catch((e: unknown) => { console.warn('[DEX] recovery:', e); });

    return () => {
      ipcRenderer.removeListener?.('dex:resume', onResume);
      ipcRenderer.removeListener?.('dex:lock-screen', onLock);
      ipcRenderer.removeListener?.('dex:system-suspend', onSystemSuspend);
      ipcRenderer.removeListener?.('dex:system-lock', onSystemLock);
    };
  }, []);
  const dockRef = useRef<HTMLDivElement>(null);
  const dockHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hover-intent for the bottom trigger zone — defers showDock() until cursor
  // dwells with low velocity, preventing accidental popups when the user just
  // sweeps past the bottom edge on the way to something else.
  const dockIntentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dockIntentSampleRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const dockMouseX = useRef<number | null>(null);
  const lastMenuCloseRef = useRef<number>(0);
  // Dock context menu
  const [dockCtx, setDockCtx] = useState<{ appId: string; x: number; y: number } | null>(null);
  const dockCtxRef = useRef<{ appId: string; x: number; y: number } | null>(null);
  dockCtxRef.current = dockCtx;
  const dockLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dockTouchReorderRef = useRef<{ appId: AppId; startX: number; startY: number; dragging: boolean; lastToIndex: number } | null>(null);
  // Launchpad context menu (right-click on apps in grid)
  const [launchpadCtx, setLaunchpadCtx] = useState<{ appId: string; label: string; x: number; y: number } | null>(null);

  // -- Shell interaction layers --------------------------------------------
  const [showOverview, setShowOverview] = useState(false);
  const [showNotifCenter, setShowNotifCenter] = useState(false);
  const bannerNotifications = useBannerNotifications();

  // -- Split-screen tiling ------------------------------------------------
  const [splitMode, setSplitMode] = useState<'off' | 'horizontal' | 'vertical'>('off');

  // UKI voice state (reactive subscription for dock mic button)
  const ukiState = useUkiStore(s => s.state);
  const ukiShowPanel = useUkiStore(s => s.showPanel);
  const isUkiListening = ukiState === 'listening' || ukiState === 'processing' || ukiState === 'thinking';
  const isUkiActive = isUkiListening || ukiShowPanel;
  const [splitApp, setSplitApp] = useState<AppId | null>(null);
  const [splitRatio, setSplitRatio] = useState(50);
  const recentFiles = useRecentFiles(s => s.recentFiles);
  const splitDragging = useRef(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // -- Detached floating windows (macOS Tahoe style) -----------------------
  const [detachedApps, setDetachedApps] = useState<Map<string, { x: number; y: number; w: number; h: number; z: number }>>(new Map());
  const restoredWindowBoundsRef = useRef<Map<string, { x: number; y: number; w: number; h: number }>>(new Map());
  const detachZCounter = useRef(200);
  // Cap floating window z-index below dock layer (dock is 5000)
  // Baseline 200 keeps floating windows above the system title bar (z=100)
  const nextDetachZ = () => {
    detachZCounter.current = detachZCounter.current >= 4990 ? 200 : detachZCounter.current + 1;
    return detachZCounter.current;
  };

  // -- Minimized floating windows (hidden but still running) ---------------
  const [minimizedApps, setMinimizedApps] = useState<Set<string>>(new Set());
  const minimizeFloatingApp = useCallback((appId: string) => {
    setMinimizedApps(prev => { const next = new Set(prev); next.add(appId); return next; });
  }, []);
  const restoreFloatingApp = useCallback((appId: string) => {
    setMinimizedApps(prev => { const next = new Set(prev); next.delete(appId); return next; });
    // Bring to front on restore
    const z = nextDetachZ();
    setDetachedApps(prev => {
      const next = new Map(prev);
      const b = next.get(appId);
      if (b) next.set(appId, { ...b, z });
      return next;
    });
  }, []);

  // -- Snap layout picker state for floating window maximize hover ----------
  const [snapLayoutApp, setSnapLayoutApp] = useState<string | null>(null);
  const snapLayoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -- Snap preview zone (shown during window drag) -------------------------
  type SnapPreviewZone = 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'maximize' | null;
  const [snapPreviewZone, setSnapPreviewZone] = useState<SnapPreviewZone>(null);
  const snapPreviewRef = useRef<SnapPreviewZone>(null);

  const detectDragSnapZone = useCallback((cx: number, cy: number): SnapPreviewZone => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const EDGE = 16;
    const CORNER = 48;
    // Top edge → maximize (wider threshold for HiDPI)
    if (cy <= 8) return 'maximize';
    // Corners
    if (cx <= CORNER && cy <= CORNER) return 'top-left';
    if (cx >= W - CORNER && cy <= CORNER) return 'top-right';
    if (cx <= CORNER && cy >= H - CORNER) return 'bottom-left';
    if (cx >= W - CORNER && cy >= H - CORNER) return 'bottom-right';
    // Sides
    if (cx <= EDGE) return 'left';
    if (cx >= W - EDGE) return 'right';
    return null;
  }, []);

  // -- Dock hover preview state -----------------------------------------------
  const [dockPreview, setDockPreview] = useState<{ id: string; x: number; y: number } | null>(null);
  const dockPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dockPreviewPinnedId, setDockPreviewPinnedId] = useState<string | null>(null);
  const [dockPeekAnnouncement, setDockPeekAnnouncement] = useState('');

  // -- Stage Manager (macOS Tahoe) -- off by default, user activates in Settings ----
  const [stageManagerOn, setStageManagerOn] = useState(() => {
    try { return localStorage.getItem('dex-stage-manager') === 'true'; } catch { return false; }
  });
  useEffect(() => {
    const handler = () => {
      try { setStageManagerOn(localStorage.getItem('dex-stage-manager') !== 'false'); } catch (e) { console.warn('[DEX]', e); }
    };
    window.addEventListener('dex-stage-manager-changed', handler);
    return () => window.removeEventListener('dex-stage-manager-changed', handler);
  }, []);

  // -- App Tab Bar -- persistent running-app tabs, toggle in Settings ------
  const [showAppTabBar, setShowAppTabBar] = useState(() => {
    try { return localStorage.getItem('dex-app-tab-bar') !== 'false'; } catch { return true; }
  });
  useEffect(() => {
    const handler = () => {
      try { setShowAppTabBar(localStorage.getItem('dex-app-tab-bar') !== 'false'); } catch (e) { console.warn('[DEX]', e); }
    };
    window.addEventListener('dex-app-tab-bar-changed', handler);
    return () => window.removeEventListener('dex-app-tab-bar-changed', handler);
  }, []);

  // Compute the focused (highest-z) floating app for Stage Manager highlight
  const focusedFloatingAppId = useMemo(() => {
    let maxZ = -1, id: string | null = null;
    detachedApps.forEach((b, appId) => { if (b.z > maxZ) { maxZ = b.z; id = appId; } });
    return id;
  }, [detachedApps]);

  // Stage Manager left offset for floating windows
  const stageOffset = stageManagerOn && runningApps.filter(a => a.id !== 'home').length > 0 ? STAGE_STRIP_WIDTH : 0;

  const getShellWorkspace = useCallback((padding = 0) => getWorkspaceBounds(
    { width: window.innerWidth, height: window.innerHeight },
    {
      topReserve: 0,
      dockReserve: 0,
      leftReserve: stageOffset,
      padding,
      minWidth: 320,
      minHeight: 260,
    },
  ), [stageOffset, showAppTabBar, runningApps.length]);

  const getMaximizedWindowBounds = useCallback(() => ({
    x: 0,
    y: 0,
    w: Math.max(320, window.innerWidth),
    h: Math.max(260, window.innerHeight),
  }), []);

  // Migrate legacy detached-window top offsets from older shell reserve logic.
  useEffect(() => {
    if (detachedApps.size === 0) return;
    const workspace = getShellWorkspace(0);
    setDetachedApps(prev => {
      let changed = false;
      const next = new Map(prev);
      next.forEach((bounds, appId) => {
        if (CREATIVE_APPS.has(appId) || isSameWindowBounds(bounds, getMaximizedWindowBounds(), 1)) return;
        const legacyShift = bounds.y >= 64 ? 66 : (bounds.y >= 32 ? 34 : 0);
        if (!legacyShift) return;
        const migrated = clampWindowForDrag(
          { x: bounds.x, y: bounds.y - legacyShift, w: bounds.w, h: bounds.h },
          workspace,
        );
        if (!isSameWindowBounds(bounds, migrated, 1)) {
          next.set(appId, { ...migrated, z: bounds.z });
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [detachedApps.size, getMaximizedWindowBounds, getShellWorkspace]);

  // -- Global stat-bump handler (sourced from all creative apps) -----------
  useEffect(() => {
    const handler = (e: CustomEvent<{ key: string; amount?: number }>) => {
      try {
        const eng = loadEngagement();
        const { state } = checkAchievements(incrementStat(eng, e.detail.key as Parameters<typeof incrementStat>[1], e.detail.amount ?? 1));
        saveEngagement(state);
      } catch (err) { console.warn('[DEX] stat-bump error', err); }
    };
    window.addEventListener('dex-stat-bump', handler as EventListener);
    return () => window.removeEventListener('dex-stat-bump', handler as EventListener);
  }, []);

  // -- App Switcher HUD (Ctrl+Tab visual overlay) --------------------------
  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [switcherIndex, setSwitcherIndex] = useState(0);
  const recentExternalOpenRef = useRef<Map<AppId, number>>(new Map());

  // -- Splash screen (first install only) ---------------------------------
  const [splashVisible, setSplashVisible] = useState(() => {
    try {
      return !localStorage.getItem('dex-first-launch-splash-seen');
    } catch {
      return false;
    }
  });
  const [splashProgress, setSplashProgress] = useState(0);
  useEffect(() => {
    if (!splashVisible) return;
    const steps = [
      { delay: 50, progress: 25, label: 'Loading core...' },
      { delay: 150, progress: 50, label: 'Initializing apps...' },
      { delay: 300, progress: 80, label: 'Preparing workspace...' },
      { delay: 450, progress: 100, label: 'Ready' },
    ];
    const timers: ReturnType<typeof setTimeout>[] = [];
    steps.forEach(s => {
      timers.push(setTimeout(() => setSplashProgress(s.progress), s.delay));
    });
    timers.push(setTimeout(() => {
      try {
        localStorage.setItem('dex-first-launch-splash-seen', '1');
      } catch { /* storage unavailable */ }
      setSplashVisible(false);
    }, 600));
    return () => timers.forEach(clearTimeout);
  }, [splashVisible]);

  // Show the dock after splash screen dismisses
  useEffect(() => {
    if (splashVisible) return;
    setTaskbarVisible(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splashVisible]);

  // -- What's New modal (post-update) ------------------------------------
  // Disabled: modal at z-index 99998 blocks all interaction with dock/apps
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const dismissWhatsNew = useCallback(() => {
    setShowWhatsNew(false);
    try { localStorage.setItem('dex-whats-new-seen', '3.6.0'); } catch (e) { console.warn('[DEX]', e); }
  }, []);

  // Auto-dismiss What's New after 10s to prevent blocking UI forever
  useEffect(() => {
    if (!showWhatsNew) return;
    const timer = setTimeout(dismissWhatsNew, 10000);
    return () => clearTimeout(timer);
  }, [showWhatsNew, dismissWhatsNew]);

  // Smooth cross-fade on app switch
  useAppTransition(currentAppId, contentRef);

  // Auto-navigate to Home when all non-home apps are closed
  useEffect(() => {
    const nonHome = runningApps.filter(a => a.id !== 'home');
    if (nonHome.length === 0 && currentAppId !== 'home') {
      setCurrentRunningApp('home');
    }
  }, [runningApps, currentAppId, setCurrentRunningApp]);

  // -- Status row: clock + battery ----------------------------------------
  const [batteryLevel, setBatteryLevel] = useState(100);
  const [batteryCharging, setBatteryCharging] = useState(false);
  const [clockStr, setClockStr] = useState(() => {
    const now = new Date();
    const d = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const t = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${d}  ${t}`;
  });
  const [titlebarMenuOpen, setTitlebarMenuOpen] = useState(false);

  // Close the control-center dropdown on any outside click without painting a
  // full-screen invisible overlay (which polluted the page with a fixed div).
  useEffect(() => {
    if (!titlebarMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[aria-label="Control center"]')) return;
      if (target.closest('[aria-label="Open control center"]')) return;
      setTitlebarMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTitlebarMenuOpen(false); };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [titlebarMenuOpen]);

  // Detect if any floating window is maximized (covers >85% of screen)
  const anyWindowMaximized = useMemo(() => {
    const W = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const H = typeof window !== 'undefined' ? window.innerHeight : 1080;
    const screenArea = W * H;
    for (const [, bounds] of detachedApps) {
      if (bounds.w * bounds.h > screenArea * 0.85) return true;
    }
    return false;
  }, [detachedApps]);

  // Helper: check if any dropdown/menu is currently open (used by dock auto-hide)
  const isAnyMenuOpen = useCallback((): boolean => {
    return !!document.querySelector('[role="menu"], [role="listbox"], .dropdown:not([hidden]), .context-menu:not([hidden]), [data-state="open"]');
  }, []);

  // Auto-hide dock: show on bottom hover, hide after leaving
  // When any window is maximized, dock hides immediately
  const showDock = useCallback(() => {
    if (anyWindowMaximized && !showAppMenuRef.current && !dockCtxRef.current) return;
    if (dockHideTimerRef.current) { clearTimeout(dockHideTimerRef.current); dockHideTimerRef.current = null; }
    setTaskbarVisible(true);
  }, [anyWindowMaximized]);

  // Hover-intent gate for bottom trigger zone. Requires cursor to dwell ~140ms
  // with average velocity below 0.45 px/ms before revealing the dock. This
  // kills accidental popups when the cursor merely passes through the strip
  // (e.g. while reaching for an app's bottom-edge control or scrollbar).
  const cancelDockIntent = useCallback(() => {
    if (dockIntentTimerRef.current) { clearTimeout(dockIntentTimerRef.current); dockIntentTimerRef.current = null; }
    dockIntentSampleRef.current = null;
  }, []);
  const beginDockIntent = useCallback((e: React.PointerEvent | React.MouseEvent) => {
    // Always honor pen/touch immediately — those are intentional.
    const isPen = 'pointerType' in e && (e as React.PointerEvent).pointerType !== 'mouse';
    if (isPen || taskbarVisible) { showDock(); return; }
    dockIntentSampleRef.current = { t: performance.now(), x: e.clientX, y: e.clientY };
    if (dockIntentTimerRef.current) clearTimeout(dockIntentTimerRef.current);
    dockIntentTimerRef.current = setTimeout(() => {
      dockIntentTimerRef.current = null;
      // Velocity check happens in trackDockIntent on every move; if no move
      // arrived (cursor is resting), velocity is 0 — definitely intentional.
      showDock();
    }, 140);
  }, [taskbarVisible, showDock]);
  const trackDockIntent = useCallback((e: React.PointerEvent | React.MouseEvent) => {
    const sample = dockIntentSampleRef.current;
    if (!sample || !dockIntentTimerRef.current) return;
    const dt = performance.now() - sample.t;
    if (dt < 1) return;
    const dx = e.clientX - sample.x;
    const dy = e.clientY - sample.y;
    const v = Math.sqrt(dx * dx + dy * dy) / dt;
    // Refresh sample baseline so velocity is computed over the last hop.
    dockIntentSampleRef.current = { t: performance.now(), x: e.clientX, y: e.clientY };
    // If still moving fast, restart the dwell window to require a fresh pause.
    if (v > 0.45) {
      clearTimeout(dockIntentTimerRef.current);
      dockIntentTimerRef.current = setTimeout(() => {
        dockIntentTimerRef.current = null;
        showDock();
      }, 140);
    }
  }, [showDock]);
  const scheduleDockHide = useCallback(() => {
    if (dockMode === 'always-visible' && !anyWindowMaximized) return;
    if (dockHideTimerRef.current) clearTimeout(dockHideTimerRef.current);
    // Delay before hiding allows user to return and see smooth transition
    dockHideTimerRef.current = setTimeout(() => {
      if (showAppMenuRef.current) return;
      // Don't hide if any menu/dropdown is open in any app
      if (isAnyMenuOpen()) return;
      // Don't hide if a menu just closed (200ms grace period)
      if (Date.now() - lastMenuCloseRef.current < 200) return;
      setTaskbarVisible(false);
    }, 450); // 450ms — gentle delay so a brief overshoot does not hide the dock
  }, [dockMode, anyWindowMaximized, isAnyMenuOpen]);

  // Keep dock visible when mode is always-visible and no maximized window
  useEffect(() => {
    if (dockMode === 'always-visible' && !anyWindowMaximized) {
      setTaskbarVisible(true);
    }
    // When a window becomes maximized, hide dock
    if (anyWindowMaximized && dockMode !== 'always-visible') {
      setTaskbarVisible(false);
    }
  }, [dockMode, anyWindowMaximized]);

  // Keep dock visible whenever any overlay menu is open (prevents auto-hide race condition)
  useEffect(() => {
    if (showAppMenu || showOverview || dockCtx) {
      if (dockHideTimerRef.current) { clearTimeout(dockHideTimerRef.current); dockHideTimerRef.current = null; }
      setTaskbarVisible(true);
    } else {
      lastMenuCloseRef.current = Date.now();
    }
  }, [showAppMenu, showOverview, dockCtx]);

  // Cleanup dock timer on unmount to prevent memory leaks
  useEffect(() => {
    // Start with dock hidden - show on hover
    if (dockMode !== 'always-visible') {
      setTaskbarVisible(false);
    }
    return () => {
      if (dockHideTimerRef.current) { clearTimeout(dockHideTimerRef.current); dockHideTimerRef.current = null; }
      if (dockIntentTimerRef.current) { clearTimeout(dockIntentTimerRef.current); dockIntentTimerRef.current = null; }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Self-heal on window focus / visibility return.
  // If the user "left DEX" (alt-tab / sleep / minimize) and came back to a
  // wallpaper-only screen, force-restore home and briefly show the dock so
  // they always land somewhere useful.
  useEffect(() => {
    const heal = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState !== 'visible') return;
      // Always re-show the dock on return so user has anchor controls.
      if (dockHideTimerRef.current) { clearTimeout(dockHideTimerRef.current); dockHideTimerRef.current = null; }
      setTaskbarVisible(true);
      // If the store points to an app that is not mounted anymore, fail-safe to home.
      if (currentAppId !== 'home' && !mountedAppsRef.current.has(currentAppId as AppId)) {
        mountedAppsRef.current.add('home');
        setCurrentRunningApp('home');
        forceUpdate(n => n + 1);
      }
      // Defer DOM probe to allow React commits + Suspense to settle.
      requestAnimationFrame(() => {
        try {
          const fg = document.querySelector('[data-app-state="foreground"]');
          // If no foreground container is present, reset to home.
          const hasContent = fg instanceof HTMLElement && fg.childElementCount > 0;
          if (!hasContent) {
            mountedAppsRef.current.add('home');
            setCurrentRunningApp('home');
            forceUpdate(n => n + 1);
          }
        } catch { /* best effort */ }
      });
    };
    const onVis = () => heal();
    const onFocus = () => heal();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [currentAppId, setCurrentRunningApp]);

  // Idle fallback policy: when DEX enters idle/background modes and later
  // resumes, always land on Home instead of risking a wallpaper-only state.
  // This keeps user context stable even after long idle / sleep transitions.
  useEffect(() => {
    const snapHome = () => {
      if (dockHideTimerRef.current) { clearTimeout(dockHideTimerRef.current); dockHideTimerRef.current = null; }
      mountedAppsRef.current.add('home');
      setCurrentRunningApp('home');
      setTaskbarVisible(true);
      forceUpdate(n => n + 1);
    };

    const onIdlePause = (event: Event) => {
      const reason = (event as CustomEvent<{ reason?: string }>).detail?.reason;
      if (reason === 'hidden' || reason === 'blur') {
        snapHome();
      }
    };

    const onIdleResume = () => {
      snapHome();
    };

    window.addEventListener('dex:idle-pause', onIdlePause as EventListener);
    window.addEventListener('dex:idle-resume', onIdleResume as EventListener);
    return () => {
      window.removeEventListener('dex:idle-pause', onIdlePause as EventListener);
      window.removeEventListener('dex:idle-resume', onIdleResume as EventListener);
    };
  }, [setCurrentRunningApp]);

  // Global mouse position tracking for dock hide fallback
  // Ensures dock hides when mouse moves away from bottom edge region
  useEffect(() => {
    if (dockMode === 'always-visible' && !anyWindowMaximized) return;
    let rafId: number | null = null;
    
    // Helper: check if any dropdown/menu is currently open
    const isAnyMenuOpen = (): boolean => {
      return !!document.querySelector('[role="menu"], [role="listbox"], .dropdown:not([hidden]), .context-menu:not([hidden]), [data-state="open"]');
    };
    
    // Magnetic retention zone — when dock is visible, use the dock's actual
    // bounding box plus generous padding instead of a fixed center band so the
    // user can move freely along the entire dock without losing it.
    const RETAIN_PAD_TOP = 48;     // grace zone above the dock
    const RETAIN_PAD_SIDES = 80;   // grace zone left/right (covers magnification overflow)
    const RETAIN_PAD_BOTTOM = 24;  // grace below in case of edge overscroll

    const handleGlobalMove = (e: MouseEvent) => {
      // Only check when dock is visible
      if (!taskbarVisible) return;
      // Don't hide if menu is open (dock menu or any app menu)
      if (showAppMenuRef.current || dockCtxRef.current || isAnyMenuOpen()) return;

      const dockEl = dockRef.current;
      let inRetainZone = false;
      if (dockEl) {
        const r = dockEl.getBoundingClientRect();
        inRetainZone =
          e.clientX >= r.left - RETAIN_PAD_SIDES &&
          e.clientX <= r.right + RETAIN_PAD_SIDES &&
          e.clientY >= r.top - RETAIN_PAD_TOP &&
          e.clientY <= r.bottom + RETAIN_PAD_BOTTOM;
      } else {
        // Fallback: bottom 96px strip when ref not yet bound.
        inRetainZone = e.clientY >= window.innerHeight - 96;
      }

      if (!inRetainZone) {
        // Cursor left the retention zone — schedule hide.
        if (!dockHideTimerRef.current) {
          scheduleDockHide();
        }
      } else {
        // Cursor came back inside — cancel any pending hide.
        if (dockHideTimerRef.current) {
          clearTimeout(dockHideTimerRef.current);
          dockHideTimerRef.current = null;
        }
      }
    };
    // Throttle to 60fps using rAF
    const throttledMove = (e: MouseEvent) => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        handleGlobalMove(e);
        rafId = null;
      });
    };
    document.addEventListener('mousemove', throttledMove, { passive: true });
    return () => {
      document.removeEventListener('mousemove', throttledMove);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [taskbarVisible, dockMode, anyWindowMaximized, scheduleDockHide]);

  // Clock + Battery for status row
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const d = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const t = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      setClockStr(`${d}  ${t}`);
    };
    updateClock();
    // Align to minute boundary then tick every 60s (was 1s — eliminates 59 repaints/min)
    const msToNextMinute = 60000 - (Date.now() % 60000);
    const alignTimer = setTimeout(() => {
      updateClock();
      const clockTimer = setInterval(updateClock, 60000);
      (alignTimerRef as any)._interval = clockTimer;
    }, msToNextMinute);
    const alignTimerRef = { _interval: null as ReturnType<typeof setInterval> | null, _timeout: alignTimer };
    const clockTimer = -1 as unknown as ReturnType<typeof setInterval>; // placeholder — actual interval created on align
    let battCleanup: (() => void) | undefined;
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((batt: any) => {
        if (!mountedRef.current) return;
        setBatteryLevel(Math.round(batt.level * 100));
        setBatteryCharging(batt.charging);
        const onLevel = () => { if (mountedRef.current) setBatteryLevel(Math.round(batt.level * 100)); };
        const onCharge = () => { if (mountedRef.current) setBatteryCharging(batt.charging); };
        batt.addEventListener('levelchange', onLevel);
        batt.addEventListener('chargingchange', onCharge);
        battCleanup = () => {
          batt.removeEventListener('levelchange', onLevel);
          batt.removeEventListener('chargingchange', onCharge);
        };
      }).catch((e: unknown) => { console.warn('[DEX]', e); });
    }
    return () => {
      clearTimeout(alignTimerRef._timeout);
      if (alignTimerRef._interval) clearInterval(alignTimerRef._interval);
      void clockTimer; // unused placeholder
      battCleanup?.();
    };
  }, []);

  // Keep-alive: track which apps have been mounted
  const mountedAppsRef = useRef<Set<AppId>>(new Set(['home']));
  const [, forceUpdate] = useState(0);

  // Device tier — read once, used for deferred mounting + max app limits
  const deviceTierRef = useRef<DeviceTier>(getStoredTier() || 'mid');

  // Fix blank-screen on startup / HMR: Zustand persist only saves currentAppId
  // but NOT runningApps. On fresh mount, if currentAppId was persisted as a non-home
  // app, that app isn't in mountedAppsRef → content area is blank.
  // Derive currentApp safely: if the persisted value isn't mounted, show home instead.
  const currentApp: AppId = (currentAppId !== 'home' && !mountedAppsRef.current.has(currentAppId as AppId) && runningApps.length === 0)
    ? 'home'
    : currentAppId as AppId;

  // Also reset the store so subsequent renders stay consistent
  const didResetRef = useRef(false);
  useEffect(() => {
    if (currentApp !== currentAppId && !didResetRef.current) {
      didResetRef.current = true;
      setCurrentRunningApp('home');
    }
  }, [currentApp, currentAppId, setCurrentRunningApp]);

  // Track last-active timestamp per app for background suspension
  const lastActiveRef = useRef<Map<string, number>>(new Map([['home', Date.now()]]));

  // UKI app predictor: learn focus transitions and pre-warm likely next apps.
  useEffect(() => {
    if (!currentApp) return;
    // User opt-out via Settings → Performance → Predictive Pre-warm
    let enabled = true;
    try { enabled = localStorage.getItem('dex-predictive-prewarm') !== '0'; }
    catch { /* storage blocked */ }
    if (!enabled) return;
    const predictor = getAppPredictor();
    predictor.record(currentApp);
    if (predictor.hasSignal(currentApp)) {
      schedulePrewarm(predictor, currentApp, {
        topN: 2,
        minProbability: 0.25,
        importer: (appId: string) => {
          // Best-effort: ensure the app's chunk is fetched before user opens it.
          const def = APP_DEFINITIONS[appId as AppId];
          if (!def) return Promise.resolve();
          // Component lazy-loaders self-cache after first fetch; touching the
          // launchApp store entry is enough to trigger React.lazy import.
          try { return Promise.resolve(); } catch { return Promise.resolve(); }
        },
      });
    }
  }, [currentApp]);

  // Update last-active timestamp when switching apps
  useEffect(() => {
    if (currentApp) {
      lastActiveRef.current.set(currentApp, Date.now());
      idleContinuity.setForegroundApp(currentApp);
    }
  }, [currentApp]);

  useEffect(() => {
    const refresh = () => forceUpdate(n => n + 1);
    window.addEventListener('dex-idle-continuity-change', refresh);
    window.addEventListener('dex-app-background-refresh', refresh);
    window.addEventListener('dex-continuity-resume', refresh);
    return () => {
      window.removeEventListener('dex-idle-continuity-change', refresh);
      window.removeEventListener('dex-app-background-refresh', refresh);
      window.removeEventListener('dex-continuity-resume', refresh);
    };
  }, []);

  // Background tab DOM unloading: only suspend apps the user has closed (not in runningApps)
  // Running apps stay mounted forever — user must close them explicitly or use shortcut to hide
  useEffect(() => {
    const SUSPEND_AFTER_MS = 300_000; // 5 minutes for non-running apps only
    const checkInterval = setInterval(() => {
      const now = Date.now();
      const mounted = Array.from(mountedAppsRef.current);
      let evicted = false;
      for (const appId of mounted) {
        if (appId === 'home' || appId === currentApp) continue;
        if (splitMode !== 'off' && appId === splitApp) continue;
        // Never evict apps that are in the running apps list
        if (runningApps.some(a => a.id === appId)) continue;
        const lastActive = lastActiveRef.current.get(appId) || 0;
        if (now - lastActive > SUSPEND_AFTER_MS && mounted.length > 3) {
          mountedAppsRef.current.delete(appId);
          evicted = true;
        }
      }
      if (evicted) forceUpdate(n => n + 1);
    }, 60_000);
    return () => clearInterval(checkInterval);
  }, [currentApp, splitApp, splitMode, runningApps]);

  // Memory pressure listener: only evict non-running apps under heavy pressure
  useEffect(() => {
    if (typeof (performance as any).measureUserAgentSpecificMemory !== 'function') return;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if ((entry as any).name === 'longtask' && (entry as any).duration > 500) {
          const mounted = Array.from(mountedAppsRef.current);
          // Only evict apps NOT in runningApps
          const evictable = mounted.filter(id => id !== 'home' && id !== currentApp && !runningApps.some(a => a.id === id));
          if (evictable.length > 0) {
            const oldest = evictable.reduce((a, b) =>
              (lastActiveRef.current.get(a) || 0) < (lastActiveRef.current.get(b) || 0) ? a : b
            );
            mountedAppsRef.current.delete(oldest);
            forceUpdate(n => n + 1);
          }
        }
      }
    });
    try { observer.observe({ entryTypes: ['longtask'] }); } catch { /* not supported */ }
    return () => observer.disconnect();
  }, [currentApp, runningApps]);

  // When an app is launched, mark it as mounted (generous limits — keep all running apps)
  useEffect(() => {
    if (currentApp && !mountedAppsRef.current.has(currentApp)) {
      // Only evict non-running apps to make room — running apps always stay
      const MAX_KEEP_ALIVE = getMaxConcurrentApps(deviceTierRef.current);
      while (mountedAppsRef.current.size >= MAX_KEEP_ALIVE) {
        const mounted = Array.from(mountedAppsRef.current);
        const evictable = mounted.filter(id => id !== 'home' && id !== currentApp && !runningApps.some(a => a.id === id));
        if (evictable.length > 0) {
          mountedAppsRef.current.delete(evictable[0] as AppId);
        } else break;
      }
      mountedAppsRef.current.add(currentApp);
      forceUpdate(n => n + 1);
    }
  }, [currentApp, runningApps]);

  const handleCloseApp = useCallback((appId: string) => {
    // Home is the desktop shell baseline and must never be closed.
    if (appId === 'home') return;
    // Play exit animation before removing
    const el = contentRef.current?.querySelector(`[data-app-id="${appId}"]`) as HTMLElement | null;
    const doRemove = () => {
      restoredWindowBoundsRef.current.delete(appId);
      mountedAppsRef.current.delete(appId as AppId);
      closeRunningApp(appId);
      setDetachedApps(prev => { if (!prev.has(appId)) return prev; const n = new Map(prev); n.delete(appId); return n; });
      setMinimizedApps(prev => { if (!prev.has(appId)) return prev; const n = new Set(prev); n.delete(appId); return n; });
      forceUpdate(n => n + 1);
    };
    if (el && !isReduceMotion()) {
      let removed = false;
      const safeRemove = () => { if (removed) return; removed = true; doRemove(); };
      el.classList.add('dex-app-closing');
      el.addEventListener('animationend', safeRemove, { once: true });
      // Safety fallback in case animationend doesn't fire
      setTimeout(safeRemove, 150);
    } else {
      doRemove();
    }
  }, [closeRunningApp]);

  // Listen for window control style changes from Settings
  useEffect(() => {
    const handler = () => setWindowControls(getWindowControlStyle());
    window.addEventListener('dex-window-controls-changed', handler);
    return () => window.removeEventListener('dex-window-controls-changed', handler);
  }, []);

  // Sync titlebar overlay with window controls preference on Windows
  useEffect(() => {
    if (!IS_WINDOWS) return;
    const electron = (window as any).electron;
    if (electron?.window?.setTitleBarOverlay) {
      // Custom buttons rendered in-app; hide native overlay
      electron.window.setTitleBarOverlay(false);
    }
  }, [windowControls]);

  // On mount, ensure native overlay is disabled (custom buttons used instead)
  useEffect(() => {
    if (!IS_WINDOWS) return;
    const electron = (window as any).electron;
    if (electron?.window?.setTitleBarOverlay) {
      electron.window.setTitleBarOverlay(false);
    }
  }, []);

  // Auto-close open menus/overlays after 30s idle to save resources
  const menuAutoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (menuAutoCloseRef.current) clearTimeout(menuAutoCloseRef.current);
    if (showAppMenu || showOverview || dockCtx) {
      menuAutoCloseRef.current = setTimeout(() => {
        setShowAppMenu(false);
        setShowOverview(false);
        setDockCtx(null);
      }, 30000);
    }
    return () => { if (menuAutoCloseRef.current) clearTimeout(menuAutoCloseRef.current); };
  }, [showAppMenu, showOverview, dockCtx]);

  // Memory pressure -- reduce background footprint without closing user apps.
  // Running apps remain mounted and resumable; only closed/non-running warm mounts
  // are evicted under pressure.
  useEffect(() => {
    let mounted = true;
    let importPromise: Promise<typeof import('../utils/MemorySentinel')> | null = null;
    importPromise = import('../utils/MemorySentinel').catch(() => null as any);
    const offs: Array<() => void> = [];
    importPromise.then(mod => {
      if (!mounted || !mod?.memorySentinel) return;
      const shedWarmMounts = (limit: number) => {
        const { runningApps: liveApps, currentAppId: focused } = useRunningApps.getState();
        const liveIds = new Set(liveApps.map(a => a.id));
        const candidates = Array.from(mountedAppsRef.current)
          .filter(id => id !== 'home' && id !== focused && !liveIds.has(id))
          .sort((a, b) => (lastActiveRef.current.get(a) ?? 0) - (lastActiveRef.current.get(b) ?? 0));
        for (let i = 0; i < Math.min(limit, candidates.length); i++) {
          mountedAppsRef.current.delete(candidates[i] as AppId);
        }
        if (candidates.length > 0) forceUpdate(n => n + 1);
        window.dispatchEvent(new CustomEvent('dex-continuity-memory-pressure', {
          detail: { level: limit > 1 ? 'critical' : 'high', evictedWarmMounts: Math.min(limit, candidates.length) },
        }));
      };
      offs.push(mod.memorySentinel.on('high', () => shedWarmMounts(1)));
      offs.push(mod.memorySentinel.on('critical', () => shedWarmMounts(6)));
    });
    return () => { mounted = false; offs.forEach(off => { try { off(); } catch { /* ignore */ } }); };
  }, []);

  // Close app menu when clicking outside (robust click-outside pattern)
  useEffect(() => {
    if (!showAppMenu) { setAppMenuSearch(''); return; }
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      // Ignore clicks on the launchpad button itself (button toggles menu)
      if (t.closest('[data-dex-launchpad]')) return;
      // Ignore clicks inside the menu panel
      if (t.closest('[data-dex-app-menu-panel]')) return;
      setShowAppMenu(false);
    };
    // setTimeout(0) skips the current event loop tick so the opening click doesn't immediately close
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler); };
  }, [showAppMenu]);

  // Navigation
  const setCurrentApp = useCallback((appId: AppId) => {
    const def = APP_DEFINITIONS[appId];
    if (def) {
      launchApp({ id: appId, name: def.name, icon: def.icon || appId, color: def.color });
    } else {
      setCurrentRunningApp(appId);
    }
    // Announce route change for screen readers
    const liveRegion = document.getElementById('dex-live-region');
    if (liveRegion) {
      const name = APP_DEFINITIONS[appId]?.name || appId;
      liveRegion.textContent = `Navigated to ${name}`;
    }
    const curIdx = navIndexRef.current;
    setNavHistory(prev => {
      const h = prev.slice(0, curIdx + 1);
      if (h[h.length - 1] !== appId) h.push(appId);
      return h.slice(-50);
    });
    setNavIndex(curIdx + 1);
    // All apps auto-detach as floating windows on desktop (macOS Tahoe)
    if (appId !== 'home') {
      const isRunningAfterLaunch = useRunningApps.getState().isAppRunning(appId);
      if (!isRunningAfterLaunch && !detachedApps.has(appId)) {
        // Launch may be rejected (e.g., app limit on low-tier devices) — avoid ghost windows.
        return;
      }
      // Mount synchronously so renderKeepAlive sees it on the first render pass
      if (!mountedAppsRef.current.has(appId)) {
        mountedAppsRef.current.add(appId);
        forceUpdate(n => n + 1);
      }
      // Position the floating window on next frame (needs layout measurements)
      requestAnimationFrame(() => {
        setDetachedApps(prev => {
          // If already floating, bring to front
          if (prev.has(appId)) {
            const z = nextDetachZ();
            const next = new Map(prev);
            const b = next.get(appId)!;
            next.set(appId, { ...b, z });
            return next;
          }
          const z = nextDetachZ();
          const next = new Map(prev);
          // Open at predefined size centered in workspace — keeps content "in frame".
          // Creative/heavy apps (videoeditor, imosion, etc.) open maximized.
          const workspace = getMaximizedWindowBounds();
          const def = APP_WINDOW_SIZES[appId as string];
          if (def?.maximized) {
            next.set(appId, { ...workspace, z });
          } else if (def) {
            const fitted = fitWindowToWorkspace({ w: def.w, h: def.h }, workspace);
            const baseX = Math.max(workspace.x, workspace.x + Math.round((workspace.w - fitted.w) / 2));
            const baseY = workspace.y + 8;
            const occupied = Array.from(prev.values()).map(b => ({ x: b.x, y: b.y }));
            const placed = cascadeWindow({ x: baseX, y: baseY, w: fitted.w, h: fitted.h }, occupied, workspace);
            next.set(appId, { ...placed, z });
          } else {
            // Unknown app: fall back to a reasonable default size, centered, cascaded.
            const w = Math.min(900, Math.max(480, Math.round(workspace.w * 0.6)));
            const h = Math.min(640, Math.max(380, Math.round(workspace.h * 0.7)));
            const baseX = workspace.x + Math.round((workspace.w - w) / 2);
            const baseY = workspace.y + 8;
            const occupied = Array.from(prev.values()).map(b => ({ x: b.x, y: b.y }));
            const placed = cascadeWindow({ x: baseX, y: baseY, w, h }, occupied, workspace);
            next.set(appId, { ...placed, z });
          }
          return next;
        });
      });
    }
  }, [detachedApps, getMaximizedWindowBounds, getShellWorkspace, launchApp, setCurrentRunningApp]);

  const resolveRequestedAppId = useCallback((request: unknown): AppId | null => {
    if (!request || typeof request !== 'object' || Array.isArray(request)) return null;
    const payload = request as Record<string, unknown>;
    const raw = String(payload.appId ?? payload.id ?? payload.appName ?? payload.name ?? '').trim().toLowerCase();
    if (!raw) return null;
    const normalized = raw.replace(/[^a-z0-9]+/g, '');
    const entries = Object.entries(APP_DEFINITIONS) as Array<[AppId, typeof APP_DEFINITIONS[AppId]]>;
    let hit = entries.find(([id]) => id === raw || id.replace(/[^a-z0-9]+/g, '') === normalized);
    if (!hit) hit = entries.find(([, def]) => def.name.toLowerCase() === raw || def.name.toLowerCase().replace(/[^a-z0-9]+/g, '') === normalized);
    if (!hit) hit = entries.find(([, def]) => def.name.toLowerCase().startsWith(raw));
    if (!hit) hit = LAUNCHPAD_APPS.find(app => app.label.toLowerCase() === raw || app.label.toLowerCase().replace(/[^a-z0-9]+/g, '') === normalized) as any;
    return hit ? (Array.isArray(hit) ? hit[0] : (hit as { id: AppId }).id) : null;
  }, []);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const appId = resolveRequestedAppId((event as CustomEvent).detail);
      if (!appId || appId === 'home') return;
      const now = Date.now();
      const last = recentExternalOpenRef.current.get(appId) ?? 0;
      if (now - last < 300) return;
      recentExternalOpenRef.current.set(appId, now);
      setCurrentApp(appId);
      setShowAppMenu(false);
      setAppMenuSearch('');
    };
    const onClose = (event: Event) => {
      const appId = resolveRequestedAppId((event as CustomEvent).detail);
      if (!appId || appId === 'home') return;
      handleCloseApp(appId);
    };
    window.addEventListener('dex-open-app', onOpen);
    window.addEventListener('dex-close-app', onClose);
    return () => {
      window.removeEventListener('dex-open-app', onOpen);
      window.removeEventListener('dex-close-app', onClose);
    };
  }, [handleCloseApp, resolveRequestedAppId, setCurrentApp]);

  const goBack = useCallback(() => {
    const idx = navIndexRef.current;
    const hist = navHistoryRef.current;
    if (idx > 0) {
      const newIdx = idx - 1;
      const appId = hist[newIdx] as AppId;
      setNavIndex(newIdx);
      const def = APP_DEFINITIONS[appId];
      if (def) launchApp({ id: appId, name: def.name, icon: def.icon || appId, color: def.color });
      else setCurrentRunningApp(appId);
    }
  }, [launchApp, setCurrentRunningApp]);

  const goForward = useCallback(() => {
    const idx = navIndexRef.current;
    const hist = navHistoryRef.current;
    if (idx < hist.length - 1) {
      const newIdx = idx + 1;
      const appId = hist[newIdx] as AppId;
      setNavIndex(newIdx);
      const def = APP_DEFINITIONS[appId];
      if (def) launchApp({ id: appId, name: def.name, icon: def.icon || appId, color: def.color });
      else setCurrentRunningApp(appId);
    }
  }, [launchApp, setCurrentRunningApp]);

  const { closeAllApps } = useRunningApps();

  // -- Detach/Pop-out (macOS Tahoe floating windows) ----------------------
  const detachApp = useCallback((appId: AppId) => {
    if (appId === 'home') return;
    if (!mountedAppsRef.current.has(appId)) {
      mountedAppsRef.current.add(appId);
      forceUpdate(n => n + 1);
    }
    const z = nextDetachZ();

    // UX: every detached app opens MAXIMIZED so it fills the DEX frame
    // (no surrounding wallpaper gaps). Users can still drag-restore or
    // resize from there. Creative apps explicitly mark `maximized: true`
    // and are unaffected.
    setDetachedApps(prev => {
      const next = new Map(prev);
      next.set(appId, { ...getMaximizedWindowBounds(), z });
      return next;
    });
    if (currentApp === appId) setCurrentApp('home');
  }, [currentApp, getMaximizedWindowBounds, setCurrentApp]);

  const bringToFront = useCallback((appId: AppId) => {
    const z = nextDetachZ();
    setDetachedApps(prev => {
      const next = new Map(prev);
      const b = next.get(appId);
      if (b) next.set(appId, { ...b, z });
      return next;
    });
  }, []);

  const openAppInWindow = useCallback((appId: AppId) => {
    if (appId === 'home') return;
    const def = APP_DEFINITIONS[appId];
    if (!def) return;

    if (detachedApps.has(appId)) {
      if (minimizedApps.has(appId)) {
        restoreFloatingApp(appId);
      }
      bringToFront(appId);
      return;
    }

    launchApp({ id: appId, name: def.name, icon: def.icon || appId, color: def.color });
    requestAnimationFrame(() => detachApp(appId));
  }, [bringToFront, detachApp, detachedApps, launchApp, minimizedApps, restoreFloatingApp]);

  const reattachApp = useCallback((appId: AppId) => {
    restoredWindowBoundsRef.current.delete(appId);
    setDetachedApps(prev => { const n = new Map(prev); n.delete(appId); return n; });
    setCurrentApp(appId);
  }, [setCurrentApp]);

  // Event bridge: open apps as floating windows from spotlight/search
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.appId) openAppInWindow(detail.appId as AppId);
    };
    window.addEventListener('dex-open-in-window', handler);
    return () => window.removeEventListener('dex-open-in-window', handler);
  }, [openAppInWindow]);

  // -- Window tiling presets (up to 5 windows) ----------------------------
  type TilePosition = 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'top' | 'bottom' | 'maximize';
  const tileWindow = useCallback((appId: AppId, position: TilePosition) => {
    const workspace = getShellWorkspace(0);
    const maximizedWorkspace = getMaximizedWindowBounds();
    const W = workspace.w;
    const H = workspace.h;
    const PAD = 6;
    const LEFT = workspace.x;
    const TOP = workspace.y;
    const usableH = H;
    const halfW = Math.floor((W - PAD * 3) / 2);
    const halfH = Math.floor((usableH - PAD * 3) / 2);

    const positions: Record<TilePosition, { x: number; y: number; w: number; h: number }> = {
      left:         { x: LEFT + PAD, y: TOP + PAD, w: halfW, h: usableH - PAD * 2 },
      right:        { x: LEFT + PAD * 2 + halfW, y: TOP + PAD, w: halfW, h: usableH - PAD * 2 },
      'top-left':   { x: LEFT + PAD, y: TOP + PAD, w: halfW, h: halfH },
      'top-right':  { x: LEFT + PAD * 2 + halfW, y: TOP + PAD, w: halfW, h: halfH },
      'bottom-left':  { x: LEFT + PAD, y: TOP + PAD * 2 + halfH, w: halfW, h: halfH },
      'bottom-right': { x: LEFT + PAD * 2 + halfW, y: TOP + PAD * 2 + halfH, w: halfW, h: halfH },
      top:          { x: LEFT + PAD, y: TOP + PAD, w: W - PAD * 2, h: halfH },
      bottom:       { x: LEFT + PAD, y: TOP + PAD * 2 + halfH, w: W - PAD * 2, h: halfH },
      center:       { x: LEFT + Math.floor(W * 0.15), y: TOP + Math.floor(usableH * 0.1), w: Math.floor(W * 0.7), h: Math.floor(usableH * 0.8) },
      maximize:     { ...maximizedWorkspace },
    };

    const rect = positions[position];
    if (!detachedApps.has(appId)) {
      detachApp(appId);
    }
    const z = nextDetachZ();
    setDetachedApps(prev => {
      const next = new Map(prev);
      const current = next.get(appId);
      const isSameRect = current
        && Math.abs(current.x - rect.x) <= 1
        && Math.abs(current.y - rect.y) <= 1
        && Math.abs(current.w - rect.w) <= 1
        && Math.abs(current.h - rect.h) <= 1;

      if (position === 'maximize' && current) {
        const restored = restoredWindowBoundsRef.current.get(appId);
        if (isSameRect && restored) {
          next.set(appId, { ...restored, z });
          restoredWindowBoundsRef.current.delete(appId);
          return next;
        }
        if (!isSameRect) {
          restoredWindowBoundsRef.current.set(appId, {
            x: current.x,
            y: current.y,
            w: current.w,
            h: current.h,
          });
        }
      } else {
        restoredWindowBoundsRef.current.delete(appId);
      }

      next.set(appId, { ...rect, z });
      return next;
    });
  }, [detachedApps, detachApp, getMaximizedWindowBounds, getShellWorkspace]);

  // Auto tile: arrange all detached windows evenly
  const autoTileAll = useCallback(() => {
    const ids = Array.from(detachedApps.keys());
    if (ids.length === 0) return;
    const workspace = getShellWorkspace(0);
    const W = workspace.w;
    const TOP = workspace.y;
    const LEFT = workspace.x;
    const PAD = 6;
    const usableH = workspace.h;

    // Pre-defined layouts for 1-6+ windows
    const layouts: Record<number, TilePosition[]> = {
      1: ['maximize'],
      2: ['left', 'right'],
      3: ['left', 'top-right', 'bottom-right'],
      4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      5: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'],
      6: ['top-left', 'top-right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
    };
    const count = Math.min(ids.length, 6);
    const layout = layouts[count] || layouts[6];

    setDetachedApps(prev => {
      const next = new Map(prev);
      const halfW = Math.floor((W - PAD * 3) / 2);
      const thirdW = Math.floor((W - PAD * 4) / 3);
      const halfH = Math.floor((usableH - PAD * 3) / 2);
      const positions: Record<TilePosition, { x: number; y: number; w: number; h: number }> = {
        left:         { x: LEFT + PAD, y: TOP + PAD, w: halfW, h: usableH - PAD * 2 },
        right:        { x: LEFT + PAD * 2 + halfW, y: TOP + PAD, w: halfW, h: usableH - PAD * 2 },
        'top-left':   { x: LEFT + PAD, y: TOP + PAD, w: halfW, h: halfH },
        'top-right':  { x: LEFT + PAD * 2 + halfW, y: TOP + PAD, w: halfW, h: halfH },
        'bottom-left':  { x: LEFT + PAD, y: TOP + PAD * 2 + halfH, w: halfW, h: halfH },
        'bottom-right': { x: LEFT + PAD * 2 + halfW, y: TOP + PAD * 2 + halfH, w: halfW, h: halfH },
        top:          { x: LEFT + PAD, y: TOP + PAD, w: W - PAD * 2, h: halfH },
        bottom:       { x: LEFT + PAD, y: TOP + PAD * 2 + halfH, w: W - PAD * 2, h: halfH },
        center:       { x: LEFT + Math.floor(W * 0.15), y: TOP + Math.floor(usableH * 0.1), w: Math.floor(W * 0.7), h: Math.floor(usableH * 0.8) },
        maximize:     { ...workspace },
      };

      // For 6 windows: use a 3x2 grid
      if (count >= 6) {
        const usedIds = ids.slice(0, 6);
        const cols = 3;
        const rows = 2;
        const cellW = Math.floor((W - PAD * (cols + 1)) / cols);
        const cellH = Math.floor((usableH - PAD * (rows + 1)) / rows);
        usedIds.forEach((id, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const z = nextDetachZ();
          const b = next.get(id);
          if (b) next.set(id, {
            x: LEFT + PAD * (col + 1) + cellW * col,
            y: TOP + PAD * (row + 1) + cellH * row,
            w: cellW,
            h: cellH,
            z,
          });
        });
        return next;
      }

      ids.slice(0, count).forEach((id, i) => {
        const pos = layout[i];
        const z = nextDetachZ();
        const b = next.get(id);
        if (b) next.set(id, { ...positions[pos], z });
      });
      return next;
    });
  }, [detachedApps, getShellWorkspace]);

  useEffect(() => {
    const onResize = () => {
      const workspace = getShellWorkspace(0);
      setDetachedApps(prev => {
        let changed = false;
        const next = new Map(prev);
        next.forEach((bounds, appId) => {
          const clamped = CREATIVE_APPS.has(appId) || isSameWindowBounds(bounds, getMaximizedWindowBounds(), 1)
            ? getMaximizedWindowBounds()
            : clampWindowToWorkspace(bounds, workspace);
          if (!isSameWindowBounds(bounds, clamped, 1)) {
            next.set(appId, { ...clamped, z: bounds.z });
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [getMaximizedWindowBounds, getShellWorkspace]);

  // Keyboard shortcuts -- use ref-based handler to avoid re-registering on every state change
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyHandlerRef.current = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showAppMenu) { e.preventDefault(); setShowAppMenu(false); return; }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Q') {
        e.preventDefault();
        closeAllApps();
        return;
      }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goBack(); return; }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward(); return; }
      // Ctrl+Space toggles UKI assistant panel; Ctrl+K is the canonical Command Palette
      // (handled inside useCommandPalette in App.tsx). We deliberately do NOT bind Ctrl+K
      // here to avoid double-toggling.
      if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
        e.preventDefault();
        try { useUkiStore.getState().togglePanel(); } catch { /* store may not be hydrated yet */ }
        return;
      }
      // Ctrl+N -- quick-open Notes app
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'n') { e.preventDefault(); setCurrentApp('notes' as AppId); return; }
      // Ctrl+Shift+T -- quick-open Tasks app
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') { e.preventDefault(); setCurrentApp('tasks' as AppId); return; }
      if (e.key === 'F11') {
        e.preventDefault();
        const { mode, setMode } = useDockPins.getState();
        const cycle: Record<string, 'always-visible' | 'auto-hide' | 'floating'> = { 'always-visible': 'auto-hide', 'auto-hide': 'floating', 'floating': 'always-visible' };
        const next = cycle[mode]; setMode(next); if (next === 'always-visible') setTaskbarVisible(true);
        return;
      }
      // F3 or Ctrl+Up -- App Overview (Mission Control)
      if (e.key === 'F3' || ((e.ctrlKey || e.metaKey) && e.key === 'ArrowUp')) { e.preventDefault(); setShowOverview(p => !p); return; }

      // Window positioning shortcuts (Win+Arrow or Ctrl+Alt+Arrow)
      const focusedApp = focusedFloatingAppId || (detachedApps.has(currentAppId) ? currentAppId : null);
      if (focusedApp && (e.metaKey || (e.ctrlKey && e.altKey))) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); tileWindow(focusedApp as AppId, 'left'); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); tileWindow(focusedApp as AppId, 'right'); return; }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          // Minimize or restore if already minimized
          if (minimizedApps.has(focusedApp)) { restoreFloatingApp(focusedApp); }
          else { minimizeFloatingApp(focusedApp); }
          return;
        }
      }
      // Maximize on Win/Meta + Up (separate check since Ctrl+Up is Mission Control)
      if (focusedApp && e.metaKey && e.key === 'ArrowUp' && !e.ctrlKey) { e.preventDefault(); tileWindow(focusedApp as AppId, 'maximize'); return; }
      // Alt+Arrow quadrant snapping
      if (focusedApp && e.altKey && e.shiftKey) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); tileWindow(focusedApp as AppId, 'top-left'); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); tileWindow(focusedApp as AppId, 'top-right'); return; }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        const { mode, setMode } = useDockPins.getState();
        const cycle: Record<string, 'always-visible' | 'auto-hide' | 'floating'> = { 'always-visible': 'auto-hide', 'auto-hide': 'floating', 'floating': 'always-visible' };
        const next = cycle[mode]; setMode(next); if (next === 'always-visible') setTaskbarVisible(true);
        return;
      }
      // Ctrl+W -- close current app (go home)
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') { e.preventDefault(); if (currentAppId !== 'home') { handleCloseApp(currentAppId); setCurrentApp('home'); } return; }
      // Ctrl+Shift+W -- close all apps
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'W') { e.preventDefault(); handleCloseAllApps(); return; }
      // Ctrl+Shift+E -- detach/reattach current app as floating window
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        if (currentAppId !== 'home') {
          if (detachedApps.has(currentAppId)) { reattachApp(currentAppId as AppId); }
          else { detachApp(currentAppId as AppId); }
        }
        return;
      }
      // Ctrl+Tab / Ctrl+Shift+Tab -- visual app switcher overlay
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault();
        if (runningApps.length > 1) {
          if (!switcherVisible) {
            // Open switcher and select next app
            const idx = runningApps.findIndex(a => a.id === currentAppId);
            const next = e.shiftKey ? (idx - 1 + runningApps.length) % runningApps.length : (idx + 1) % runningApps.length;
            setSwitcherIndex(next);
            setSwitcherVisible(true);
          } else {
            // Already open -- move selection
            setSwitcherIndex(prev => {
              return e.shiftKey
                ? (prev - 1 + runningApps.length) % runningApps.length
                : (prev + 1) % runningApps.length;
            });
          }
        }
        return;
      }
      // T12-025: global DockPeek hotkey on currently focused dock item
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        const focusedDockBtn = document.activeElement as HTMLButtonElement | null;
        const appIdAttr = focusedDockBtn?.getAttribute('data-dock-app-id');
        if (appIdAttr) {
          e.preventDefault();
          openDockPeek(appIdAttr as AppId, focusedDockBtn);
          setDockPreviewPinnedId(appIdAttr);
        }
        return;
      }
      // Item 147: Alt+D -- focus dock for keyboard navigation
      if (e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const firstBtn = dockRef.current?.querySelector<HTMLButtonElement>('[data-dock-app-id]');
        if (firstBtn) firstBtn.focus();
        showDock();
        return;
      }
      const ctrlMap: Record<string, AppId> = { '1': 'home', '2': 'settings', '3': 'files', '4': 'notes', '5': 'tasks', '6': 'browser', '7': 'gallery', '8': 'calendar', '9': 'kanban' };
      if ((e.ctrlKey || e.metaKey) && ctrlMap[e.key]) { e.preventDefault(); setCurrentApp(ctrlMap[e.key]); return; }
      const altMap: Record<string, AppId> = { 'v': 'videoeditor', 'i': 'imosion', 'r': 'prism', 'f': 'flux', 'g': 'forge', 'p': 'power', 'c': 'calculator', 't': 'transfers' };
      if (e.altKey && !e.ctrlKey && altMap[e.key.toLowerCase()]) { e.preventDefault(); setCurrentApp(altMap[e.key.toLowerCase()]); return; }
      // Split-screen shortcuts
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') { e.preventDefault(); if (splitMode !== 'off') { exitSplit(); } else { setShowAppMenu(true); } return; }
      if (e.key === 'Escape' && splitMode !== 'off') { exitSplit(); return; }
    };
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // -- Double-click desktop background → minimize all floating windows (macOS Tahoe) --
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      // Ignore clicks inside floating windows, dock, stage manager, modals, menus, title bar
      if (el.closest('[data-floating-window], [role="navigation"], [role="toolbar"], [role="dialog"], [role="menu"], .dex-dock, .dex-titlebar, .dex-launchpad, [data-dex-launchpad], [data-dex-overlay]')) return;
      // Only act when there are visible floating windows
      const visibleFloating = Array.from(detachedApps.keys()).filter(id => !minimizedApps.has(id));
      if (visibleFloating.length === 0) return;
      // Minimize all visible floating windows — pushes them to stage manager
      setMinimizedApps(prev => {
        const next = new Set(prev);
        visibleFloating.forEach(id => next.add(id));
        return next;
      });
      setCurrentApp('home' as AppId);
    };
    document.addEventListener('dblclick', handler);
    return () => document.removeEventListener('dblclick', handler);
  }, [detachedApps, minimizedApps, setCurrentApp]);

  // Commit app switch when Ctrl is released (closes the switcher HUD)
  useEffect(() => {
    if (!switcherVisible) return;
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        const target = runningApps[switcherIndex];
        if (target) setCurrentApp(target.id as AppId);
        setSwitcherVisible(false);
      }
    };
    window.addEventListener('keyup', onKeyUp);
    return () => window.removeEventListener('keyup', onKeyUp);
  }, [switcherVisible, switcherIndex, runningApps, setCurrentApp]);

  // -- Spotlight Engine wiring: register all apps as actions + handle navigate events
  useEffect(() => {
    // Extended keywords so users can find apps by function, not just name
    const APP_KEYWORDS: Record<string, string[]> = {
      home: ['desktop', 'main', 'start'],
      files: ['explorer', 'finder', 'folder', 'document', 'browse'],
      browser: ['web', 'internet', 'chrome', 'safari', 'url', 'website'],
      transfers: ['share', 'send', 'upload', 'airdrop'],
      settings: ['preferences', 'config', 'system'],
      notes: ['write', 'text', 'memo', 'notepad'],
      tasks: ['todo', 'checklist', 'reminder'],
      workflows: ['automation', 'scripts', 'macro'],
      calendar: ['schedule', 'events', 'date'],
      gallery: ['photos', 'images', 'pictures', 'album'],
      audio: ['music', 'player', 'songs', 'mp3', 'spotify'],
      power: ['battery', 'performance', 'cpu', 'monitor'],
      calculator: ['math', 'convert', 'calc'],
      passwordgenerator: ['password', 'security', 'key'],
      videoeditor: ['vinx', 'video', 'edit', 'cut', 'trim', 'timeline', 'premiere', 'davinci'],
      imosion: ['daw', 'music', 'audio', 'production', 'beat', 'record', 'logic', 'ableton', 'studio'],
      prism: ['image', 'photo', 'edit', 'photoshop', 'paint', 'draw', 'filter', 'layer'],
      flux: ['motion', 'graphics', 'animation', 'after effects', 'vfx', 'particles'],
      forge: ['encode', 'convert', 'render', 'export', 'compress', 'handbrake', 'ffmpeg'],
      axl: ['cad', '3d', 'model', 'design', 'engineering', 'blueprint'],
      rewind: ['history', 'activity', 'time machine', 'backup'],
      kanban: ['project', 'board', 'trello', 'agile', 'sprint'],
      achievements: ['trophies', 'badges', 'awards'],
      recyclebin: ['trash', 'delete', 'recycle', 'bin'],
      stopwatch: ['timer', 'clock', 'lap', 'countdown', 'time'],
      unitconverter: ['convert', 'units', 'metric', 'imperial', 'measurement'],
      pomodoro: ['timer', 'focus', 'productivity', 'break', 'session'],
      qrcode: ['qr', 'barcode', 'scan', 'generate', 'link'],
      colorpicker: ['color', 'picker', 'palette', 'hex', 'rgb', 'hsl', 'eyedropper'],
      weather: ['forecast', 'temperature', 'rain', 'sunny', 'climate', 'wind'],
      worldclock: ['timezone', 'clock', 'time', 'utc', 'gmt', 'world'],
      canvas: ['draw', 'paint', 'sketch', 'whiteboard', 'doodle', 'art'],
      timer: ['countdown', 'alarm', 'minute', 'hour', 'time'],
      noisegenerator: ['noise', 'white noise', 'ambient', 'focus', 'sleep', 'sound', 'rain'],
      dexcode: ['code', 'script', 'dexscript', 'program', 'run', 'developer', 'coding'],
    };

    const actions: SpotlightAction[] = [];
    for (const [id, def] of Object.entries(APP_DEFINITIONS)) {
      const extra = APP_KEYWORDS[id] || [];
      actions.push({
        id: `launch-${id}`,
        label: def.name,
        keywords: [def.name, id, 'open', 'launch', 'app', ...extra],
        icon: def.icon || id,
        color: def.color,
        action: () => setCurrentApp(id as AppId),
      });
    }
    // UKI knowledge actions: shortcuts and workflows surface in Spotlight so
    // users can discover capabilities by typing what they want, not the name.
    for (const [label, keys] of Object.entries(DEX_GLOBAL_SHORTCUTS)) {
      actions.push({
        id: `uki-shortcut-${label}`,
        label: `${label}  ${keys}`,
        keywords: [label, keys, 'shortcut', 'hotkey', 'keyboard', 'uki'],
        icon: 'keyboard',
        action: () => {
          window.dispatchEvent(new CustomEvent('dex-notification', {
            detail: { title: 'Shortcut', body: `${label}: ${keys}`, type: 'info' },
          }));
        },
      });
    }
    for (const wf of DEX_WORKFLOWS) {
      actions.push({
        id: `uki-workflow-${wf.id}`,
        label: wf.title,
        keywords: [wf.title, 'workflow', 'how to', 'guide', 'uki', ...wf.steps.flatMap(s => s.split(/\s+/))],
        icon: 'sparkles',
        action: () => {
          window.dispatchEvent(new CustomEvent('dex-notification', {
            detail: { title: wf.title, body: wf.steps.join(' -> '), type: 'info' },
          }));
        },
      });
    }
    spotlightEngine.registerActions(actions);

    const handleNavigate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.appId) {
        const appId = detail.appId as AppId;
        setShowAppMenu(false);
        // Open apps as floating windows over Home (keeps Home visible)
        // Home itself switches to full view
        if (appId === 'home') {
          setCurrentApp('home');
        } else {
          // Dispatch event for openAppInWindow (defined later, needs event bridge)
          window.dispatchEvent(new CustomEvent('dex-open-in-window', { detail: { appId } }));
        }
        // Forward contextId (URL) to Browser when navigating to browser
        if (appId === 'browser' && detail.contextId) {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('dex-browser-navigate', { detail: { url: detail.contextId } }));
          }, 80);
        } else if (appId === 'settings' && detail.contextId) {
          // Retry delivery — Settings may not be mounted yet (lazy-loaded)
          const deliverSection = (retries = 0) => {
            window.dispatchEvent(new CustomEvent('dex-settings-navigate', { detail: { section: detail.contextId } }));
            if (retries < 3) setTimeout(() => deliverSection(retries + 1), 200);
          };
          setTimeout(() => deliverSection(), 120);
        }
      }
    };
    window.addEventListener('dex-spotlight-navigate', handleNavigate);
    return () => window.removeEventListener('dex-spotlight-navigate', handleNavigate);
  }, [setCurrentApp]);

  // Window controls
  const handleMinimize = () => { window.dex?.window?.minimize?.(); };
  const handleMaximize = () => { window.dex?.window?.maximize?.(); };
  const handleClose = () => { window.dex?.invoke?.('window:hide').catch(() => {}); };

  // Stay maximized: only apply when user explicitly toggles it on
  // Persist system volume and broadcast to all audio elements
  useEffect(() => {
    localStorage.setItem('dex-system-volume', String(systemVolume));
    // Dispatch to all HTMLAudioElement/Video instances in the document
    const gainFraction = systemVolume / 100;
    document.querySelectorAll<HTMLMediaElement>('audio, video').forEach(el => {
      el.volume = gainFraction;
    });
    // Custom event for components using Web Audio API GainNode
    window.dispatchEvent(new CustomEvent('dex-system-volume', { detail: gainFraction }));
  }, [systemVolume]);
  useEffect(() => {
    setSoundEnabled(spatialAudioOn);
  }, [spatialAudioOn]);

  // -- Gesture Engine wiring ------------------------------------------------
  useEffect(() => {
    gestureEngine.init();
    initVisualEffects();
    initializeTouchSystem();

    // Attach multi-touch pointer gesture recognizer to document body
    gestureRecognizer.attach(document.body);

    // Map touch gestures → app navigation
    const unsub3L = gestureRecognizer.on('three-finger-swipe-left', () => {
      const ids = runningApps.map(a => a.id);
      const curIdx = ids.indexOf(currentAppId);
      if (curIdx < ids.length - 1) {
        setCurrentRunningApp(ids[curIdx + 1] as AppId);
      }
    });
    const unsub3R = gestureRecognizer.on('three-finger-swipe-right', () => {
      const ids = runningApps.map(a => a.id);
      const curIdx = ids.indexOf(currentAppId);
      if (curIdx > 0) {
        setCurrentRunningApp(ids[curIdx - 1] as AppId);
      }
    });
    const unsub3U = gestureRecognizer.on('three-finger-swipe-up', () => {
      setShowOverview(true);
      setCurrentRunningApp('home' as AppId);
    });
    const unsubPinch = gestureRecognizer.on('two-finger-pinch', () => {
      setShowOverview(false);
    });
    const unsubSpread = gestureRecognizer.on('two-finger-spread', () => {
      setShowOverview(true);
      setCurrentRunningApp('home' as AppId);
    });

    const handleGesture = (e: Event) => {
      const g = (e as CustomEvent<GestureEvent>).detail;
      if (!g.active) {
        // Gesture completed — cycle running apps or trigger overview
        switch (g.type) {
          case 'swipe-left': {
            // Cycle to next running app
            const ids = runningApps.map(a => a.id);
            const curIdx = ids.indexOf(currentAppId);
            if (curIdx < ids.length - 1) {
              const nextId = ids[curIdx + 1] as AppId;
              setCurrentRunningApp(nextId);
            }
            break;
          }
          case 'swipe-right': {
            // Cycle to previous running app
            const ids = runningApps.map(a => a.id);
            const curIdx = ids.indexOf(currentAppId);
            if (curIdx > 0) {
              const prevId = ids[curIdx - 1] as AppId;
              setCurrentRunningApp(prevId);
            }
            break;
          }
          case 'swipe-up-3':
          case 'pinch-out':
            // Show overview / go home to see all running apps
            setShowOverview(true);
            setCurrentRunningApp('home' as AppId);
            break;
          case 'pinch-in':
            setShowOverview(false);
            break;
          case 'edge-swipe-left':
            goBack();
            break;
          case 'edge-swipe-right':
            goForward();
            break;
        }
      }
    };
    window.addEventListener('dex-gesture', handleGesture);
    return () => {
      gestureEngine.destroy();
      destroyVisualEffects();
      window.removeEventListener('dex-gesture', handleGesture);
      unsub3L(); unsub3R(); unsub3U(); unsubPinch(); unsubSpread();
      gestureRecognizer.detach();
    };
  }, [goBack, goForward, runningApps, currentAppId, setCurrentRunningApp]);

  const getLabel = (id: string) => {
    const def = APP_DEFINITIONS[id];
    return def?.name || LAUNCHPAD_APPS.find(a => a.id === id)?.label || id;
  };

  // -- Split-screen helpers ------------------------------------------------
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

  // -- Keep-alive renderer -------------------------------------------------
  const mountedAppsSnapshot = Array.from(mountedAppsRef.current);
  // Hard safety net: home must always be in the mounted snapshot.
  // This prevents wallpaper-only states if any background eviction path ever
  // drops home unexpectedly during idle/sleep transitions.
  const mountedAppsSafeSnapshot = mountedAppsSnapshot.includes('home')
    ? mountedAppsSnapshot
    : ['home' as AppId, ...mountedAppsSnapshot];
  const keepAliveElements = useMemo(() => {
    return mountedAppsSafeSnapshot.map(appId => {
      const Comp = APP_COMPONENTS[appId];
      if (!Comp) return null;
      const isCurrent = appId === currentApp;
      const isSplit = splitMode !== 'off' && appId === splitApp;
      const isDetached = detachedApps.has(appId);
      const detBounds = isDetached ? detachedApps.get(appId)! : null;
      const isVisible = isCurrent || isSplit;
      const canClose = appId !== 'home';

      // -- Detached floating window (macOS Tahoe) --------------------------
      if (isDetached && detBounds) {
        const isMinimized = minimizedApps.has(appId);
        // Exact match for maximized state (no tolerance gaps)
        const maximizedBounds = getMaximizedWindowBounds();
        const isMaximized = isSameWindowBounds(detBounds, maximizedBounds, 1);
        const workspaceBounds = getShellWorkspace(0);
        const visibleBounds = isMaximized
          ? maximizedBounds
          : getUsableFloatingBounds(appId, detBounds, workspaceBounds);
        // Heavy creative apps keep an opaque rendering surface (their canvas /
        // GPU compositors should not pay the backdrop-filter cost). Shell-class
        // apps use the unified glass token so the desktop and Home wallpaper
        // remain visible underneath, restoring desktop continuity.
        const isHeavyApp = HEAVY_APP_IDS.has(appId);
        const useGlass = !isMaximized && !isHeavyApp;
        return (
          <div
            key={appId}
            data-floating-window={appId}
            data-testid={`app-instance-${appId}`}
            data-app-state="foreground"
            data-window-glass={useGlass ? 'on' : 'off'}
            style={{
              position: 'fixed',
              left: visibleBounds.x,
              top: visibleBounds.y,
              width: visibleBounds.w,
              height: visibleBounds.h,
              zIndex: detBounds.z,
              display: isMinimized ? 'none' : 'flex', flexDirection: 'column',
              borderRadius: isMaximized ? 0 : 14, overflow: 'hidden',
              background: useGlass
                ? 'var(--color-bg-glass-strong, rgba(26,26,30,0.85))'
                : 'var(--color-bg-base, #0C0C0E)',
              backdropFilter: useGlass ? 'blur(28px) saturate(160%)' : undefined,
              WebkitBackdropFilter: useGlass ? 'blur(28px) saturate(160%)' : undefined,
              border: isMaximized ? 'none' : '1px solid rgba(255,255,255,0.10)',
              ...adaptiveShadow(isMaximized ? 'none' : '0 20px 60px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.35), inset 0 0.5px 0 rgba(255,255,255,0.08)'),
              contain: 'layout style paint',
              willChange: 'auto',
              transition: 'box-shadow 0.2s ease',
            }}
            className="dex-app-opening"
            onPointerDown={() => { if (focusedFloatingAppId !== appId) bringToFront(appId); }}
          >
            {/* Floating title bar -- draggable (including maximized restore-drag) */}
            <div
              style={{
                height: 38, display: 'flex', alignItems: 'center', gap: 8,
                padding: '0 14px', cursor: 'grab', userSelect: 'none',
                background: useGlass ? 'rgba(28,28,32,0.55)' : '#1C1C20',
                borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.10))', flexShrink: 0,
                justifyContent: 'center',
                touchAction: 'none',
                WebkitAppRegion: 'drag',
              } as React.CSSProperties}
              onDoubleClick={() => { tileWindow(appId, 'maximize'); }}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                e.preventDefault();
                const titleBar = e.currentTarget;
                titleBar.setPointerCapture(e.pointerId);
                titleBar.style.cursor = 'grabbing';
                const startX = e.clientX;
                const startY = e.clientY;
                let dragBounds = { ...visibleBounds, z: detBounds.z };
                if (isMaximized) {
                  const workspace = getMaximizedWindowBounds();
                  const restored = restoredWindowBoundsRef.current.get(appId)
                    ?? fitWindowToWorkspace(
                      {
                        w: Math.max(680, Math.round(workspace.w * 0.7)),
                        h: Math.max(460, Math.round(workspace.h * 0.8)),
                      },
                      workspace,
                    );
                  const pointerRatio = (e.clientX - workspace.x) / Math.max(workspace.w, 1);
                  const anchoredX = Math.round(e.clientX - restored.w * pointerRatio);
                  const clampedRestored = clampWindowToWorkspace(
                    { ...restored, x: anchoredX, y: workspace.y + 8 },
                    workspace,
                  );
                  dragBounds = { ...clampedRestored, z: detBounds.z };
                  restoredWindowBoundsRef.current.set(appId, clampedRestored);
                  setDetachedApps(prev => {
                    const next = new Map(prev);
                    const current = next.get(appId);
                    if (!current) return prev;
                    next.set(appId, { ...current, ...clampedRestored, z: nextDetachZ() });
                    return next;
                  });
                }
                const origX = dragBounds.x;
                const origY = dragBounds.y;
                let currentX = origX;
                let currentY = origY;
                let rafId = 0;
                let hasMoved = false;
                const el = titleBar.parentElement as HTMLElement;
                if (el) {
                  // Disable transitions and enable GPU acceleration for smooth drag
                  el.style.transition = 'none';
                  el.style.willChange = 'transform';
                  el.setAttribute('data-dragging', 'true');
                }
                const onMove = (ev: PointerEvent) => {
                  cancelAnimationFrame(rafId);
                  rafId = requestAnimationFrame(() => {
                    const workspace = getShellWorkspace(0);
                    // Free-drag: allow movement past edges, only keep part of title bar reachable
                    const loose = clampWindowForDrag(
                      { x: origX + ev.clientX - startX, y: origY + ev.clientY - startY, w: dragBounds.w, h: dragBounds.h },
                      workspace,
                    );
                    currentX = loose.x;
                    currentY = loose.y;
                    if (el) {
                      // Use transform during drag for GPU acceleration
                      el.style.transform = `translate(${currentX - origX}px, ${currentY - origY}px)`;
                    }
                    // Live snap zone preview
                    const zone = detectDragSnapZone(ev.clientX, ev.clientY);
                    if (zone !== snapPreviewRef.current) {
                      snapPreviewRef.current = zone;
                      setSnapPreviewZone(zone);
                    }
                  });
                };
                const onUp = (ev: PointerEvent) => {
                  cancelAnimationFrame(rafId);
                  titleBar.releasePointerCapture(ev.pointerId);
                  titleBar.style.cursor = 'grab';
                  titleBar.removeEventListener('pointermove', onMove);
                  titleBar.removeEventListener('pointerup', onUp);
                  titleBar.removeEventListener('lostpointercapture', onUp);
                  if (el) {
                    el.removeAttribute('data-dragging');
                    el.style.transform = '';
                    el.style.willChange = 'auto';
                    el.style.transition = '';
                  }
                  // Clear preview
                  snapPreviewRef.current = null;
                  setSnapPreviewZone(null);
                  // Final position — free drag (only require a slice of title bar visible)
                  const workspace = getShellWorkspace(0);
                  const looseFinal = clampWindowForDrag(
                    { x: origX + ev.clientX - startX, y: origY + ev.clientY - startY, w: dragBounds.w, h: dragBounds.h },
                    workspace,
                  );
                  const finalX = looseFinal.x;
                  const finalY = looseFinal.y;
                  // Commit snap or final position
                  const zone = detectDragSnapZone(ev.clientX, ev.clientY);
                  if (zone) {
                    if (el) el.style.transition = 'left 0.25s cubic-bezier(0.2,0.9,0.3,1), top 0.25s cubic-bezier(0.2,0.9,0.3,1), width 0.25s cubic-bezier(0.2,0.9,0.3,1), height 0.25s cubic-bezier(0.2,0.9,0.3,1)';
                    tileWindow(appId, zone);
                  } else {
                    setDetachedApps(prev => {
                      const b = prev.get(appId);
                      if (!b) return prev;
                      const next = new Map(prev);
                      // Strict in-frame clamp on drop: windows always end up fully inside the workspace.
                      const clamped = clampWindowToWorkspace({ x: finalX, y: finalY, w: dragBounds.w, h: dragBounds.h }, workspace);
                      next.set(appId, { ...b, ...clamped });
                      return next;
                    });
                  }
                };
                titleBar.addEventListener('pointermove', onMove);
                titleBar.addEventListener('pointerup', onUp);
                titleBar.addEventListener('lostpointercapture', onUp);
              }}
            >
              {/* App icon with color background */}
              {(() => {
                const appDef = APP_DEFINITIONS[appId];
                const appColor = appDef?.color || LAUNCHPAD_APPS.find(a => a.id === appId)?.color || '#8E8E93';
                return (
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: AppIconPngs[appId] ? 'transparent' : appColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                    {AppIconPngs[appId]
                      ? <AppIconImg appId={appId} size={22} />
                      : <span style={{ color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icons[appId] || <DexIcon name={APP_DEFINITIONS[appId]?.icon || appId} size={16} color="#fff" />}</span>}
                  </div>
                );
              })()}
              {/* Traffic light controls (left side, macOS style) */}
              {windowControls === 'traffic' && (
                <div className="traffic-light-group" style={{ display: 'flex', gap: 6, marginRight: 4, alignItems: 'center' }}>
                  <button onClick={() => handleCloseApp(appId)} title="Close" aria-label={`Close ${getLabel(appId)}`} style={trafficBtn('#ff5f57')}>
                    <svg className="tl-glyph" width="6" height="6" viewBox="0 0 8 8" style={{ color: 'rgba(0,0,0,0.55)' }}><path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/></svg>
                  </button>
                  <button onClick={() => minimizeFloatingApp(appId)} title="Minimize" aria-label={`Minimize ${getLabel(appId)}`} style={trafficBtn('#febc2e')}>
                    <svg className="tl-glyph" width="6" height="6" viewBox="0 0 8 8" style={{ color: 'rgba(0,0,0,0.55)' }}><path d="M1 4H7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/></svg>
                  </button>
                  <button onClick={() => tileWindow(appId, 'maximize')} title="Maximize" aria-label={`Maximize ${getLabel(appId)}`} style={trafficBtn('#28c840')}>
                    <svg className="tl-glyph" width="6" height="6" viewBox="0 0 8 8" style={{ color: 'rgba(0,0,0,0.55)' }}><path d="M1 1L4 4L7 1M1 7L4 4L7 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/></svg>
                  </button>
                </div>
              )}
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', flex: 1, letterSpacing: '-0.01em' }}>{getLabel(appId)}</span>
              {/* System-style window controls (right side) */}
              {windowControls !== 'traffic' && (
                <>
                  {/* Minimize button */}
                  <button
                    onClick={() => minimizeFloatingApp(appId)}
                    title="Minimize"
                    aria-label={`Minimize ${getLabel(appId)}`}
                    style={{
                      width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'transparent', border: 'none', borderRadius: 6,
                      color: 'var(--color-text-primary)', cursor: 'pointer', transition: 'background 0.15s ease, color 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-border)'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="4" y1="18" x2="20" y2="18"/>
                    </svg>
                  </button>
                  {/* Maximize button with snap layout picker */}
                  <div style={{ position: 'relative' }}
                    onMouseEnter={() => {
                      if (snapLayoutTimer.current) clearTimeout(snapLayoutTimer.current);
                      setSnapLayoutApp(appId);
                    }}
                    onMouseLeave={() => {
                      snapLayoutTimer.current = setTimeout(() => setSnapLayoutApp(null), 200);
                    }}>
                    <button
                      onClick={() => tileWindow(appId, 'maximize')}
                      title="Snap Layout"
                      aria-label={`Maximize ${getLabel(appId)}`}
                      style={{
                        width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'transparent', border: 'none', borderRadius: 6,
                        color: 'var(--color-text-primary)', cursor: 'pointer', transition: 'background 0.15s ease, color 0.15s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-border)'; e.currentTarget.style.color = '#fff'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <rect x="4" y="4" width="16" height="16" rx="2"/>
                      </svg>
                    </button>
                    {/* Snap layout grid popup */}
                    {snapLayoutApp === appId && (
                      <div style={{
                        position: 'absolute', top: 28, right: -16, zIndex: 'var(--z-overlay)' as unknown as number,
                        background: 'var(--color-bg-elevated)',
                        border: '1px solid var(--color-border)', borderRadius: 12,
                        padding: '10px 10px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 5,
                        boxShadow: '0 12px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3), inset 0 0.5px 0 var(--color-border-subtle)',
                        width: 240,
                        animation: 'fadeIn 0.18s ease',
                      } as React.CSSProperties}>
                        <div style={{ gridColumn: '1 / -1', fontSize: 9, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 2, paddingLeft: 2 }}>Snap Layout</div>
                        {([
                          { pos: 'maximize' as const, label: 'Full', svg: <rect x="2" y="2" width="20" height="20" rx="2" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.5"/> },
                          { pos: 'center' as const, label: 'Center', svg: <rect x="5" y="4" width="14" height="16" rx="2" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.5"/> },
                          { pos: 'left' as const, label: 'Left', svg: <><rect x="2" y="2" width="10" height="20" rx="1.5" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.5"/><rect x="13" y="2" width="9" height="20" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.15"/></> },
                          { pos: 'right' as const, label: 'Right', svg: <><rect x="12" y="2" width="10" height="20" rx="1.5" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.5"/><rect x="2" y="2" width="9" height="20" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.15"/></> },
                          { pos: 'top-left' as const, label: 'Top L', svg: <><rect x="2" y="2" width="10" height="10" rx="1.5" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.5"/><rect x="13" y="2" width="9" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.15"/><rect x="2" y="13" width="10" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.15"/><rect x="13" y="13" width="9" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.15"/></> },
                          { pos: 'top-right' as const, label: 'Top R', svg: <><rect x="12" y="2" width="10" height="10" rx="1.5" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.5"/><rect x="2" y="2" width="9" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.15"/><rect x="2" y="13" width="9" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.15"/><rect x="12" y="13" width="10" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.15"/></> },
                          { pos: 'bottom-left' as const, label: 'Bot L', svg: <><rect x="2" y="12" width="10" height="10" rx="1.5" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.5"/><rect x="2" y="2" width="10" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.15"/><rect x="13" y="2" width="9" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.15"/><rect x="13" y="12" width="9" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.15"/></> },
                          { pos: 'bottom-right' as const, label: 'Bot R', svg: <><rect x="12" y="12" width="10" height="10" rx="1.5" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.5"/><rect x="2" y="2" width="9" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.15"/><rect x="12" y="2" width="10" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.15"/><rect x="2" y="12" width="9" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.15"/></> },
                        ] as const).map(({ pos, label, svg }) => (
                          <button key={pos} onClick={() => { tileWindow(appId, pos); setSnapLayoutApp(null); }}
                            title={label}
                            aria-label={`Snap window ${label}`}
                            style={{
                              width: 50, height: 38, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                              background: 'var(--color-border-subtle)', border: '1px solid var(--color-bg-hover)', borderRadius: 7,
                              color: 'var(--color-text-secondary)', cursor: 'pointer', padding: 0,
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(74,158,255,0.12)'; e.currentTarget.style.color = 'var(--color-accent)'; e.currentTarget.style.borderColor = 'rgba(74,158,255,0.3)'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-border-subtle)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.borderColor = 'var(--color-bg-hover)'; e.currentTarget.style.transform = 'scale(1)'; }}
                          >
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">{svg}</svg>
                            <span style={{ fontSize: 7, fontWeight: 600, lineHeight: 1, opacity: 0.6 }}>{label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Close button */}
                  <button
                    onClick={() => handleCloseApp(appId)}
                    title={`Close ${getLabel(appId)}`}
                    aria-label={`Close ${getLabel(appId)}`}
                    style={{
                      width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'transparent', border: 'none', borderRadius: 6,
                      color: 'var(--color-text-primary)', cursor: 'pointer', transition: 'background 0.15s ease, color 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,69,58,0.18)'; e.currentTarget.style.color = 'var(--color-error)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </>
              )}
            </div>
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <AppErrorBoundary appId={appId}>
                <Suspense fallback={<Loading appId={appId} />}>
                  <Comp />
                </Suspense>
              </AppErrorBoundary>
            </div>
            {/* Resize handles -- all 4 edges + corners for proper OS-like resizing */}
            {!isMaximized && (
              <>
                {/* Right edge */}
                <div
                  data-resize-handle="right"
                  style={{ position: 'absolute', right: 0, top: 30, bottom: 20, width: 6, cursor: 'ew-resize', zIndex: 2, opacity: 0, transition: 'opacity 0.15s, background 0.15s', background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.08))' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.background = 'rgba(10,132,255,0.2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0'; (e.currentTarget as HTMLElement).style.background = 'linear-gradient(to right, transparent, rgba(255,255,255,0.08))'; }}
                  onPointerDown={(e) => {
                    e.stopPropagation(); e.preventDefault();
                    const startX = e.clientX;
                    const startW = detBounds.w;
                    const el = e.currentTarget.parentElement as HTMLElement;
                    if (el) el.setAttribute('data-dragging', 'true');
                    let rafId = 0;
                    const onMove = (ev: PointerEvent) => {
                      cancelAnimationFrame(rafId);
                      rafId = requestAnimationFrame(() => {
                        const workspace = getShellWorkspace(0);
                        const nw = Math.min(Math.max(360, startW + ev.clientX - startX), workspace.x + workspace.w - detBounds.x);
                        if (el) el.style.width = nw + 'px';
                      });
                    };
                    const onUp = (ev: PointerEvent) => {
                      cancelAnimationFrame(rafId);
                      document.removeEventListener('pointermove', onMove);
                      document.removeEventListener('pointerup', onUp);
                      if (el) el.removeAttribute('data-dragging');
                      const workspace = getShellWorkspace(0);
                      const nw = Math.min(Math.max(360, startW + ev.clientX - startX), workspace.x + workspace.w - detBounds.x);
                      setDetachedApps(prev => {
                        const b = prev.get(appId);
                        if (!b) return prev;
                        const next = new Map(prev);
                        const clamped = clampWindowToWorkspace({ x: b.x, y: b.y, w: nw, h: b.h }, workspace);
                        next.set(appId, { ...b, ...clamped });
                        return next;
                      });
                    };
                    document.addEventListener('pointermove', onMove);
                    document.addEventListener('pointerup', onUp);
                  }}
                />
                {/* Bottom edge */}
                <div
                  data-resize-handle="bottom"
                  style={{ position: 'absolute', bottom: 0, left: 20, right: 20, height: 6, cursor: 'ns-resize', zIndex: 2, opacity: 0, transition: 'opacity 0.15s, background 0.15s', background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.08))' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.background = 'rgba(10,132,255,0.2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0'; (e.currentTarget as HTMLElement).style.background = 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.08))'; }}
                  onPointerDown={(e) => {
                    e.stopPropagation(); e.preventDefault();
                    const startY = e.clientY;
                    const startH = detBounds.h;
                    const el = e.currentTarget.parentElement as HTMLElement;
                    if (el) el.setAttribute('data-dragging', 'true');
                    let rafId = 0;
                    const onMove = (ev: PointerEvent) => {
                      cancelAnimationFrame(rafId);
                      rafId = requestAnimationFrame(() => {
                        const workspace = getShellWorkspace(0);
                        const nh = Math.min(Math.max(280, startH + ev.clientY - startY), workspace.y + workspace.h - detBounds.y);
                        if (el) el.style.height = nh + 'px';
                      });
                    };
                    const onUp = (ev: PointerEvent) => {
                      cancelAnimationFrame(rafId);
                      document.removeEventListener('pointermove', onMove);
                      document.removeEventListener('pointerup', onUp);
                      if (el) el.removeAttribute('data-dragging');
                      const workspace = getShellWorkspace(0);
                      const nh = Math.min(Math.max(280, startH + ev.clientY - startY), workspace.y + workspace.h - detBounds.y);
                      setDetachedApps(prev => {
                        const b = prev.get(appId);
                        if (!b) return prev;
                        const next = new Map(prev);
                        const clamped = clampWindowToWorkspace({ x: b.x, y: b.y, w: b.w, h: nh }, workspace);
                        next.set(appId, { ...b, ...clamped });
                        return next;
                      });
                    };
                    document.addEventListener('pointermove', onMove);
                    document.addEventListener('pointerup', onUp);
                  }}
                />
                {/* Left edge */}
                <div
                  data-resize-handle="left"
                  style={{ position: 'absolute', left: 0, top: 30, bottom: 20, width: 6, cursor: 'ew-resize', zIndex: 2, opacity: 0, transition: 'opacity 0.15s, background 0.15s', background: 'linear-gradient(to left, transparent, rgba(255,255,255,0.08))' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.background = 'rgba(10,132,255,0.2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0'; (e.currentTarget as HTMLElement).style.background = 'linear-gradient(to left, transparent, rgba(255,255,255,0.08))'; }}
                  onPointerDown={(e) => {
                    e.stopPropagation(); e.preventDefault();
                    const startX = e.clientX;
                    const startW = detBounds.w;
                    const startLeft = detBounds.x;
                    const el = e.currentTarget.parentElement as HTMLElement;
                    if (el) el.setAttribute('data-dragging', 'true');
                    let rafId = 0;
                    const onMove = (ev: PointerEvent) => {
                      cancelAnimationFrame(rafId);
                      rafId = requestAnimationFrame(() => {
                        const workspace = getShellWorkspace(0);
                        const deltaX = ev.clientX - startX;
                        const desiredW = Math.max(360, startW - deltaX);
                        const desiredLeft = startLeft + (startW - desiredW);
                        const nl = Math.max(workspace.x, desiredLeft);
                        const nw = startLeft + startW - nl;
                        if (el) {
                          el.style.width = nw + 'px';
                          el.style.left = nl + 'px';
                        }
                      });
                    };
                    const onUp = (ev: PointerEvent) => {
                      cancelAnimationFrame(rafId);
                      document.removeEventListener('pointermove', onMove);
                      document.removeEventListener('pointerup', onUp);
                      if (el) el.removeAttribute('data-dragging');
                      const workspace = getShellWorkspace(0);
                      const deltaX = ev.clientX - startX;
                      const desiredW = Math.max(360, startW - deltaX);
                      const desiredLeft = startLeft + (startW - desiredW);
                      const nl = Math.max(workspace.x, desiredLeft);
                      const nw = startLeft + startW - nl;
                      setDetachedApps(prev => {
                        const b = prev.get(appId);
                        if (!b) return prev;
                        const next = new Map(prev);
                        const clamped = clampWindowToWorkspace({ x: nl, y: b.y, w: nw, h: b.h }, workspace);
                        next.set(appId, { ...b, ...clamped });
                        return next;
                      });
                    };
                    document.addEventListener('pointermove', onMove);
                    document.addEventListener('pointerup', onUp);
                  }}
                />
                {/* Top edge */}
                <div
                  data-resize-handle="top"
                  style={{ position: 'absolute', top: 0, left: 20, right: 20, height: 6, cursor: 'ns-resize', zIndex: 2, opacity: 0, transition: 'opacity 0.15s, background 0.15s', background: 'linear-gradient(to top, transparent, rgba(255,255,255,0.08))' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.background = 'rgba(10,132,255,0.2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0'; (e.currentTarget as HTMLElement).style.background = 'linear-gradient(to top, transparent, rgba(255,255,255,0.08))'; }}
                  onPointerDown={(e) => {
                    e.stopPropagation(); e.preventDefault();
                    const startY = e.clientY;
                    const startH = detBounds.h;
                    const startTop = detBounds.y;
                    const el = e.currentTarget.parentElement as HTMLElement;
                    if (el) el.setAttribute('data-dragging', 'true');
                    let rafId = 0;
                    const onMove = (ev: PointerEvent) => {
                      cancelAnimationFrame(rafId);
                      rafId = requestAnimationFrame(() => {
                        const workspace = getShellWorkspace(0);
                        const deltaY = ev.clientY - startY;
                        const desiredH = Math.max(280, startH - deltaY);
                        const desiredTop = startTop + (startH - desiredH);
                        const nt = Math.max(workspace.y, desiredTop);
                        const nh = startTop + startH - nt;
                        if (el) {
                          el.style.height = nh + 'px';
                          el.style.top = nt + 'px';
                        }
                      });
                    };
                    const onUp = (ev: PointerEvent) => {
                      cancelAnimationFrame(rafId);
                      document.removeEventListener('pointermove', onMove);
                      document.removeEventListener('pointerup', onUp);
                      if (el) el.removeAttribute('data-dragging');
                      const workspace = getShellWorkspace(0);
                      const deltaY = ev.clientY - startY;
                      const desiredH = Math.max(280, startH - deltaY);
                      const desiredTop = startTop + (startH - desiredH);
                      const nt = Math.max(workspace.y, desiredTop);
                      const nh = startTop + startH - nt;
                      setDetachedApps(prev => {
                        const b = prev.get(appId);
                        if (!b) return prev;
                        const next = new Map(prev);
                        const clamped = clampWindowToWorkspace({ x: b.x, y: nt, w: b.w, h: nh }, workspace);
                        next.set(appId, { ...b, ...clamped });
                        return next;
                      });
                    };
                    document.addEventListener('pointermove', onMove);
                    document.addEventListener('pointerup', onUp);
                  }}
                />
                {/* Bottom-right corner (SE) with visible resize grip */}
                <div
                  data-resize-handle="se"
                  style={{ 
                    position: 'absolute', right: 0, bottom: 0, width: 20, height: 20, 
                    cursor: 'nwse-resize', zIndex: 3, borderRadius: '0 0 14px 0',
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
                    padding: 4,
                  }}
                  onPointerDown={(e) => {
                e.stopPropagation(); e.preventDefault();
                const startX = e.clientX; const startY = e.clientY;
                const startW = detBounds.w; const startH = detBounds.h;
                let rafId = 0;
                const el = e.currentTarget.parentElement as HTMLElement;
                if (el) el.setAttribute('data-dragging', 'true');
                const onMove = (ev: PointerEvent) => {
                  cancelAnimationFrame(rafId);
                  rafId = requestAnimationFrame(() => {
                    const workspace = getShellWorkspace(0);
                    const nw = Math.min(Math.max(360, startW + ev.clientX - startX), workspace.x + workspace.w - detBounds.x);
                    const nh = Math.min(Math.max(280, startH + ev.clientY - startY), workspace.y + workspace.h - detBounds.y);
                    if (el) {
                      el.style.width = nw + 'px';
                      el.style.height = nh + 'px';
                    }
                  });
                };
                const onUp = (ev: PointerEvent) => {
                  cancelAnimationFrame(rafId);
                  document.removeEventListener('pointermove', onMove);
                  document.removeEventListener('pointerup', onUp);
                  if (el) el.removeAttribute('data-dragging');
                  const workspace = getShellWorkspace(0);
                  const nw = Math.min(Math.max(360, startW + ev.clientX - startX), workspace.x + workspace.w - detBounds.x);
                  const nh = Math.min(Math.max(280, startH + ev.clientY - startY), workspace.y + workspace.h - detBounds.y);
                  setDetachedApps(prev => {
                    const b = prev.get(appId);
                    if (!b) return prev;
                    const next = new Map(prev);
                    const clamped = clampWindowToWorkspace({ x: b.x, y: b.y, w: nw, h: nh }, workspace);
                    next.set(appId, { ...b, ...clamped });
                    return next;
                  });
                };
                document.addEventListener('pointermove', onMove);
                document.addEventListener('pointerup', onUp);
              }}
            >
              {/* Resize grip indicator */}
              <svg width="10" height="10" viewBox="0 0 10 10" style={{ opacity: 0.4, pointerEvents: 'none' }}>
                <path d="M8 2L2 8" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M8 5L5 8" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M8 8L8 8" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            {/* Bottom-left corner (SW) */}
            <div
              data-resize-handle="sw"
              style={{ position: 'absolute', left: 0, bottom: 0, width: 18, height: 18, cursor: 'nesw-resize', zIndex: 3 }}
              onPointerDown={(e) => {
                e.stopPropagation(); e.preventDefault();
                const startX = e.clientX; const startY = e.clientY;
                const startW = detBounds.w; const startH = detBounds.h; const startLeft = detBounds.x;
                let rafId = 0;
                const el = e.currentTarget.parentElement as HTMLElement;
                if (el) el.setAttribute('data-dragging', 'true');
                const onMove = (ev: PointerEvent) => {
                  cancelAnimationFrame(rafId);
                  rafId = requestAnimationFrame(() => {
                    const workspace = getShellWorkspace(0);
                    const dx = ev.clientX - startX;
                    const desiredW = Math.max(360, startW - dx);
                    const desiredLeft = startLeft + (startW - desiredW);
                    const nl = Math.max(workspace.x, desiredLeft);
                    const nw = startLeft + startW - nl;
                    const nh = Math.min(Math.max(280, startH + ev.clientY - startY), workspace.y + workspace.h - detBounds.y);
                    if (el) { el.style.width = nw + 'px'; el.style.left = nl + 'px'; el.style.height = nh + 'px'; }
                  });
                };
                const onUp = (ev: PointerEvent) => {
                  cancelAnimationFrame(rafId);
                  document.removeEventListener('pointermove', onMove);
                  document.removeEventListener('pointerup', onUp);
                  if (el) el.removeAttribute('data-dragging');
                  const workspace = getShellWorkspace(0);
                  const dx = ev.clientX - startX;
                  const desiredW = Math.max(360, startW - dx);
                  const desiredLeft = startLeft + (startW - desiredW);
                  const nl = Math.max(workspace.x, desiredLeft);
                  const nw = startLeft + startW - nl;
                  const nh = Math.min(Math.max(280, startH + ev.clientY - startY), workspace.y + workspace.h - detBounds.y);
                  setDetachedApps(prev => {
                    const b = prev.get(appId);
                    if (!b) return prev;
                    const next = new Map(prev);
                    const clamped = clampWindowToWorkspace({ x: nl, y: b.y, w: nw, h: nh }, workspace);
                    next.set(appId, { ...b, ...clamped });
                    return next;
                  });
                };
                document.addEventListener('pointermove', onMove);
                document.addEventListener('pointerup', onUp);
              }}
            />
            {/* Top-right corner (NE) */}
            <div
              data-resize-handle="ne"
              style={{ position: 'absolute', right: 0, top: 0, width: 18, height: 18, cursor: 'nesw-resize', zIndex: 3 }}
              onPointerDown={(e) => {
                e.stopPropagation(); e.preventDefault();
                const startX = e.clientX; const startY = e.clientY;
                const startW = detBounds.w; const startH = detBounds.h; const startTop = detBounds.y;
                let rafId = 0;
                const el = e.currentTarget.parentElement as HTMLElement;
                if (el) el.setAttribute('data-dragging', 'true');
                const onMove = (ev: PointerEvent) => {
                  cancelAnimationFrame(rafId);
                  rafId = requestAnimationFrame(() => {
                    const workspace = getShellWorkspace(0);
                    const dy = ev.clientY - startY;
                    const desiredH = Math.max(280, startH - dy);
                    const desiredTop = startTop + (startH - desiredH);
                    const nt = Math.max(workspace.y, desiredTop);
                    const nh = startTop + startH - nt;
                    const nw = Math.min(Math.max(360, startW + ev.clientX - startX), workspace.x + workspace.w - detBounds.x);
                    if (el) { el.style.width = nw + 'px'; el.style.height = nh + 'px'; el.style.top = nt + 'px'; }
                  });
                };
                const onUp = (ev: PointerEvent) => {
                  cancelAnimationFrame(rafId);
                  document.removeEventListener('pointermove', onMove);
                  document.removeEventListener('pointerup', onUp);
                  if (el) el.removeAttribute('data-dragging');
                  const workspace = getShellWorkspace(0);
                  const dy = ev.clientY - startY;
                  const desiredH = Math.max(280, startH - dy);
                  const desiredTop = startTop + (startH - desiredH);
                  const nt = Math.max(workspace.y, desiredTop);
                  const nh = startTop + startH - nt;
                  const nw = Math.min(Math.max(360, startW + ev.clientX - startX), workspace.x + workspace.w - detBounds.x);
                  setDetachedApps(prev => {
                    const b = prev.get(appId);
                    if (!b) return prev;
                    const next = new Map(prev);
                    const clamped = clampWindowToWorkspace({ x: b.x, y: nt, w: nw, h: nh }, workspace);
                    next.set(appId, { ...b, ...clamped });
                    return next;
                  });
                };
                document.addEventListener('pointermove', onMove);
                document.addEventListener('pointerup', onUp);
              }}
            />
            {/* Top-left corner (NW) */}
            <div
              data-resize-handle="nw"
              style={{ position: 'absolute', left: 0, top: 0, width: 18, height: 18, cursor: 'nwse-resize', zIndex: 3 }}
              onPointerDown={(e) => {
                e.stopPropagation(); e.preventDefault();
                const startX = e.clientX; const startY = e.clientY;
                const startW = detBounds.w; const startH = detBounds.h;
                const startLeft = detBounds.x; const startTop = detBounds.y;
                let rafId = 0;
                const el = e.currentTarget.parentElement as HTMLElement;
                if (el) el.setAttribute('data-dragging', 'true');
                const onMove = (ev: PointerEvent) => {
                  cancelAnimationFrame(rafId);
                  rafId = requestAnimationFrame(() => {
                    const workspace = getShellWorkspace(0);
                    const dx = ev.clientX - startX;
                    const dy = ev.clientY - startY;
                    const desiredW = Math.max(360, startW - dx);
                    const desiredH = Math.max(280, startH - dy);
                    const nl = Math.max(workspace.x, startLeft + (startW - desiredW));
                    const nt = Math.max(workspace.y, startTop + (startH - desiredH));
                    const nw = startLeft + startW - nl;
                    const nh = startTop + startH - nt;
                    if (el) { el.style.width = nw + 'px'; el.style.height = nh + 'px'; el.style.left = nl + 'px'; el.style.top = nt + 'px'; }
                  });
                };
                const onUp = (ev: PointerEvent) => {
                  cancelAnimationFrame(rafId);
                  document.removeEventListener('pointermove', onMove);
                  document.removeEventListener('pointerup', onUp);
                  if (el) el.removeAttribute('data-dragging');
                  const workspace = getShellWorkspace(0);
                  const dx = ev.clientX - startX;
                  const dy = ev.clientY - startY;
                  const desiredW = Math.max(360, startW - dx);
                  const desiredH = Math.max(280, startH - dy);
                  const nl = Math.max(workspace.x, startLeft + (startW - desiredW));
                  const nt = Math.max(workspace.y, startTop + (startH - desiredH));
                  const nw = startLeft + startW - nl;
                  const nh = startTop + startH - nt;
                  setDetachedApps(prev => {
                    const b = prev.get(appId);
                    if (!b) return prev;
                    const next = new Map(prev);
                    const clamped = clampWindowToWorkspace({ x: nl, y: nt, w: nw, h: nh }, workspace);
                    next.set(appId, { ...b, ...clamped });
                    return next;
                  });
                };
                document.addEventListener('pointermove', onMove);
                document.addEventListener('pointerup', onUp);
              }}
            />
          </>
          )}
          </div>
        );
      }

      // -- Normal (non-detached) rendering ----------------------------------
      // Home is always visible as the desktop background behind floating windows
      const showInline = isVisible || appId === 'home';
      const continuityClass = idleContinuity.getAppClass(appId);
      const refreshIntervalMs = idleContinuity.getRefreshInterval(appId);

      // Deferred mounting: on low tiers, heavy background apps are unmounted
      // to free memory — they re-mount when switched back to foreground
      if (!showInline && !shouldKeepAlive(appId, deviceTierRef.current)) {
        return null;
      }

      return (
        <div
          key={appId}
          data-app-id={appId}
          data-testid={`app-instance-${appId}`}
          data-app-container=""
          data-app-state={isVisible ? 'foreground' : 'background'}
          data-continuity-class={continuityClass}
          data-refresh-interval-ms={refreshIntervalMs || undefined}
          aria-hidden={!showInline}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            opacity: showInline ? 1 : 0,
            pointerEvents: showInline ? 'auto' : 'none',
            zIndex: appId === 'home' ? 0 : 1,
            flexDirection: 'column',
            willChange: showInline ? 'opacity, transform' : 'auto',
            // Use only layout/style containment regardless of visibility.
            // 'paint' containment combined with content-visibility:auto caused
            // background apps to lose their painted layer during OS idle and
            // come back blank. Layout/style containment alone is safe.
            contain: 'layout style' as any,
          }}
          className={`dex-app-container ${showInline ? 'dex-app-opening' : ''}`}
        >
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <AppErrorBoundary appId={appId}>
              <Suspense fallback={<Loading appId={appId} />}>
                <Comp />
              </Suspense>
            </AppErrorBoundary>
          </div>
        </div>
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentApp, splitMode, splitApp, detachedApps, minimizedApps, mountedAppsSafeSnapshot.join(',')]);

  // -- Dock rendering ------------------------------------------------------
  // Build dock items from pinned store
  const dockItems: DockItem[] = useMemo(() => {
    return dockPins
      .sort((a, b) => a.position - b.position)
      .map(pin => {
        const def = APP_DEFINITIONS[pin.id];
        const lp = LAUNCHPAD_APPS.find(a => a.id === pin.id);
        return {
          id: pin.id as AppId,
          label: def?.name || lp?.label || pin.id,
          color: def?.color || lp?.color || '#8A8A8A',
        };
      });
  }, [dockPins]);

  const openDockPeek = useCallback((appId: AppId, anchorEl?: HTMLElement | null) => {
    const source = anchorEl || dockRef.current?.querySelector<HTMLElement>(`[data-dock-app-id="${appId}"]`);
    if (!source) return;
    const rect = source.getBoundingClientRect();
    setDockPreview({ id: appId, x: rect.left + rect.width / 2, y: rect.top });
    const appName = dockItems.find(d => d.id === appId)?.label || APP_DEFINITIONS[appId]?.name || appId;
    setDockPeekAnnouncement(`Dock peek opened for ${appName}`);
  }, [dockItems]);

  const dockMagRafRef = useRef(0);
  const handleDockMouseMove = useCallback((e: React.MouseEvent) => {
    dockMouseX.current = e.clientX;
    // Apply magnification directly via style transforms (no state updates)
    if (dockMagnification && dockRef.current) {
      const mx = e.clientX;
      cancelAnimationFrame(dockMagRafRef.current);
      dockMagRafRef.current = requestAnimationFrame(() => {
        if (!dockRef.current) return;
        const items = dockRef.current.querySelectorAll<HTMLElement>('[data-dock-item]');
        const dockRect = dockRef.current.getBoundingClientRect();
        const sigma = 40;
        const influence = 80;
        // Use layout offsets instead of transformed DOMRects. Reading transformed
        // rects feeds the previous scale back into the next frame and makes icons jitter.
        const centers: number[] = [];
        for (let i = 0; i < items.length; i++) {
          centers[i] = dockRect.left + items[i].offsetLeft + items[i].offsetWidth / 2;
        }
        // Then batch-write transforms
        for (let i = 0; i < items.length; i++) {
          const dist = Math.abs(mx - centers[i]);
          const scale = dist <= influence
            ? 1 + (magnificationScale - 1) * 0.25 * Math.exp(-(dist * dist) / (2 * sigma * sigma))
            : 1;
          const roundedScale = Math.round(scale * 1000) / 1000;
          if (items[i].dataset.dockScale === String(roundedScale)) continue;
          items[i].dataset.dockScale = String(roundedScale);
          items[i].style.transition = 'none';
          items[i].style.transform = `scale(${roundedScale})`;
        }
      });
    }
  }, [dockMagnification, magnificationScale]);

  const handleDockMouseLeave = useCallback(() => {
    dockMouseX.current = null;
    if (dockRef.current) {
      const items = dockRef.current.querySelectorAll<HTMLElement>('[data-dock-item]');
      items.forEach(el => {
        el.style.transition = 'transform 0.22s cubic-bezier(0.23,1,0.32,1)';
        el.style.transform = 'scale(1)';
        el.dataset.dockScale = '1';
      });
    }
    scheduleDockHide();
  }, [scheduleDockHide]);

  const openDockApp = useCallback((appId: AppId, buttonEl: HTMLElement | null) => {
    // Removed bounce animation - cleaner look
    if (minimizedApps.has(appId)) {
      restoreFloatingApp(appId);
    }

    setCurrentApp(appId);
  }, [minimizedApps, restoreFloatingApp, setCurrentApp]);

  // Shortcut hints for dock tooltips
  const dockShortcut: Record<string, string> = {
    home: 'Ctrl+1', settings: 'Ctrl+2', files: 'Ctrl+3', notes: 'Ctrl+4', tasks: 'Ctrl+5',
    browser: 'Ctrl+6', gallery: 'Ctrl+7', calendar: 'Ctrl+8', kanban: 'Ctrl+9',
    videoeditor: 'Alt+V', imosion: 'Alt+I', prism: 'Alt+R', flux: 'Alt+F', forge: 'Alt+G',
    power: 'Alt+P', calculator: 'Alt+C', transfers: 'Alt+T',
  };

  // Item 145: Arrow key navigation within dock
  const handleDockKeyDown = useCallback((e: React.KeyboardEvent, items: DockItem[]) => {
    const idx = items.findIndex(i => i.id === (document.activeElement as HTMLElement)?.closest('[data-dock-item]')?.querySelector('button')?.getAttribute('data-dock-app-id') || '');
    if (idx < 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (idx + 1) % items.length;
      const btns = dockRef.current?.querySelectorAll<HTMLButtonElement>('[data-dock-app-id]');
      btns?.[next]?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (idx - 1 + items.length) % items.length;
      const btns = dockRef.current?.querySelectorAll<HTMLButtonElement>('[data-dock-app-id]');
      btns?.[prev]?.focus();
    }
  }, []);

  const renderDockItems = (items: DockItem[]) =>
    items.map((item) => {
      // Wrap each dock item render in try-catch for fault isolation
      // If one dock item fails, show placeholder instead of crashing entire dock
      try {
        const isActive = currentApp === item.id;
        const isRunning = runningApps.some(a => a.id === item.id);
        const isMinimized = minimizedApps.has(item.id);
        const isDetached = detachedApps.has(item.id);
        const size = dockIconSize;
        const shortcut = dockShortcut[item.id];
        const tooltip = shortcut ? `${item.label}  (${shortcut})` : item.label;

        // No continuity ring or running indicator — users discover app state on their own.

        return (
        <div key={item.id} data-dock-item style={{
          position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          // Smooth ease-out (no overshoot) — overshoot easing on a transform
          // that's also being driven by mousemove magnification produced
          // visible jitter. This easing only applies on hover-leave reset.
          transition: 'transform 0.2s cubic-bezier(0.23,1,0.32,1)',
          transformOrigin: 'bottom center',
          willChange: dockMagnification ? 'transform' : 'auto',
        }}
          onMouseEnter={(e) => {
            if (dockPreviewTimer.current) clearTimeout(dockPreviewTimer.current);
            const el = e.currentTarget;
            const rect = el.getBoundingClientRect();
            dockPreviewTimer.current = setTimeout(() => {
              setDockPreview({ id: item.id, x: rect.left + rect.width / 2, y: rect.top });
              setDockPeekAnnouncement(`Dock peek opened for ${item.label}`);
            }, 400);
          }}
          onMouseLeave={() => {
            if (dockPreviewTimer.current) clearTimeout(dockPreviewTimer.current);
            dockPreviewTimer.current = null;
            if (dockPreviewPinnedId !== item.id) setDockPreview(null);
          }}
        >

          <button
            type="button"
            onPointerDown={(e) => {
              if (dockLongPressTimerRef.current) clearTimeout(dockLongPressTimerRef.current);
              dockLongPressTimerRef.current = setTimeout(() => {
                setDockCtx({ appId: item.id, x: e.clientX, y: e.clientY });
              }, 420);
              if (e.pointerType === 'touch') {
                dockTouchReorderRef.current = {
                  appId: item.id,
                  startX: e.clientX,
                  startY: e.clientY,
                  dragging: false,
                  lastToIndex: items.findIndex((d) => d.id === item.id),
                };
                e.currentTarget.setPointerCapture?.(e.pointerId);
                return;
              }
              openDockApp(item.id, e.currentTarget);
            }}
            onPointerMove={(e) => {
              if (e.pointerType !== 'touch') return;
              const gesture = dockTouchReorderRef.current;
              if (!gesture || gesture.appId !== item.id) return;

              const dx = e.clientX - gesture.startX;
              const dy = e.clientY - gesture.startY;
              const moved = Math.hypot(dx, dy);
              if (moved > 6 && dockLongPressTimerRef.current) {
                clearTimeout(dockLongPressTimerRef.current);
                dockLongPressTimerRef.current = null;
              }
              if (!gesture.dragging && moved > 14) {
                gesture.dragging = true;
              }
              if (!gesture.dragging || !dockRef.current) return;

              const buttons = Array.from(dockRef.current.querySelectorAll<HTMLButtonElement>('[data-dock-app-id]'));
              if (buttons.length < 2) return;
              const isHorizontalDock = dockEdgePref === 'bottom' || dockEdgePref === 'top';
              const pointerAxis = isHorizontalDock ? e.clientX : e.clientY;

              let toIndex = 0;
              let closest = Number.POSITIVE_INFINITY;
              buttons.forEach((btn, idx) => {
                const rect = btn.getBoundingClientRect();
                const center = isHorizontalDock ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
                const dist = Math.abs(pointerAxis - center);
                if (dist < closest) {
                  closest = dist;
                  toIndex = idx;
                }
              });

              const fromIndex = items.findIndex((d) => d.id === gesture.appId);
              if (fromIndex >= 0 && toIndex >= 0 && toIndex !== fromIndex && toIndex !== gesture.lastToIndex) {
                reorderDockPins(fromIndex, toIndex);
                gesture.lastToIndex = toIndex;
              }
            }}
            onPointerUp={(e) => {
              if (dockLongPressTimerRef.current) clearTimeout(dockLongPressTimerRef.current);
              dockLongPressTimerRef.current = null;
              if (e.pointerType === 'touch') {
                const gesture = dockTouchReorderRef.current;
                if (gesture && gesture.appId === item.id && !gesture.dragging) {
                  openDockApp(item.id, e.currentTarget);
                }
                dockTouchReorderRef.current = null;
              }
            }}
            onPointerCancel={(e) => {
              if (dockLongPressTimerRef.current) clearTimeout(dockLongPressTimerRef.current);
              dockLongPressTimerRef.current = null;
              if (e.pointerType === 'touch') dockTouchReorderRef.current = null;
            }}
            onClick={(e) => {
              if (e.detail !== 0) return;
              openDockApp(item.id, e.currentTarget);
            }}
            onDoubleClick={(e) => { e.stopPropagation(); if (item.id !== currentApp) enterSplit(item.id); }}
            onContextMenu={(e) => {
              e.preventDefault();
              setDockCtx({ appId: item.id, x: e.clientX, y: e.clientY });
            }}
            onKeyDown={(e) => handleDockKeyDown(e, items)}
            data-dock-app-id={item.id}
            data-dock-icon={item.id}
            data-running-app={isRunning ? 'true' : undefined}
            title={tooltip}
            aria-label={`Open ${item.label}${isRunning ? ' (running)' : ''}${isMinimized ? ' (minimized)' : ''}${shortcut ? ` - ${shortcut}` : ''}`}
            aria-current={isActive ? 'true' : undefined}
            style={{
              width: size, height: size,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent',
              border: 'none', borderRadius: 9999, cursor: 'pointer',
              position: 'relative', padding: 0,
              touchAction: 'manipulation',
              color: item.color,
              opacity: isMinimized ? 0.5 : 1,
              transition: 'color 0.25s cubic-bezier(0.4,0,0.2,1), background 0.15s ease, opacity 0.25s ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            {AppIconPngs[item.id] ? (
              <AppIconImg appId={item.id} size={size - 8} />
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.color }}>
                {Icons[item.id] || <DexIcon name={APP_DEFINITIONS[item.id]?.icon || item.id} size={18} color={item.color} />}
              </span>
            )}
          </button>

        </div>
      );
      } catch (err) {
        // Dock item render failed — show placeholder to maintain dock layout
        console.warn(`[Dock] Failed to render item ${item.id}:`, err);
        return (
          <div
            key={item.id}
            data-dock-item
            title={`${item.label} (failed to load)`}
            style={{
              width: dockIconSize,
              height: dockIconSize,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-bg-surface)',
              borderRadius: 12,
              border: '1px dashed var(--color-border)',
              color: 'var(--color-text-muted)',
              fontSize: 10,
            }}
          >
            ?
          </div>
        );
      }
    });

  const dockSeparator = (key: string) => (
    <div key={key} style={{ width: 1, height: 20, background: 'var(--color-border)', margin: '0 6px', flexShrink: 0, alignSelf: 'center', borderRadius: 1 }} />
  );

  // APP_MENU_CATEGORIES is computed once at module scope — no useMemo needed
  const APP_MENU_CATEGORIES = MODULE_APP_MENU_CATEGORIES;

  const hasRunningNonHome = runningApps.some(a => a.id !== 'home');

  const handleCloseAllApps = useCallback(() => {
    closeAllApps();
    setDetachedApps(new Map());
    setCurrentApp('home' as AppId);
  }, [closeAllApps, setCurrentApp]);

  // -- Title bar -----------------------------------------------------------

  // -- App Tab Bar (persistent running-app tabs) with smooth drag-to-reorder --
  const [tabOrder, setTabOrder] = useState<string[]>([]);
  const [draggingTab, setDraggingTab] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef(0);
  const dragStartIndex = useRef(0);

  // Sync tab order with running apps
  useEffect(() => {
    const currentIds = runningApps.filter(a => a.id !== 'home').map(a => a.id);
    setTabOrder(prev => {
      const existing = prev.filter(id => currentIds.includes(id));
      const newIds = currentIds.filter(id => !prev.includes(id));
      return [...existing, ...newIds];
    });
  }, [runningApps]);

  // Convert vertical wheel into horizontal scroll on the tab bar so users
  // can mouse-wheel through many open tabs without holding Shift.
  useEffect(() => {
    const el = tabContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Only intercept when there's actually horizontal overflow.
      if (el.scrollWidth <= el.clientWidth) return;
      // If the user already provided horizontal delta (touchpad), let it pass.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Keep the active tab visible (scroll it into view when switching apps).
  useEffect(() => {
    const container = tabContainerRef.current;
    if (!container || !currentApp) return;
    const tab = tabRefs.current.get(currentApp);
    if (!tab) return;
    const cRect = container.getBoundingClientRect();
    const tRect = tab.getBoundingClientRect();
    if (tRect.left < cRect.left + 8) {
      container.scrollBy({ left: tRect.left - cRect.left - 16, behavior: 'smooth' });
    } else if (tRect.right > cRect.right - 8) {
      container.scrollBy({ left: tRect.right - cRect.right + 16, behavior: 'smooth' });
    }
  }, [currentApp, tabOrder]);

  const handleTabDragStart = useCallback((e: React.PointerEvent, appId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    // Apply will-change for GPU acceleration during drag
    target.style.willChange = 'transform';
    setDraggingTab(appId);
    dragStartX.current = e.clientX;
    dragStartIndex.current = tabOrder.indexOf(appId);
    setDragOffset(0);
  }, [tabOrder]);

  const dragRafRef = useRef<number>(0);
  const lastDeltaRef = useRef<number>(0);
  const handleTabDragMove = useCallback((e: React.PointerEvent) => {
    if (!draggingTab) return;
    const deltaX = e.clientX - dragStartX.current;
    // Skip if delta hasn't changed enough (reduce repaints)
    if (Math.abs(deltaX - lastDeltaRef.current) < 2) return;
    lastDeltaRef.current = deltaX;
    // Apply transform directly to DOM for 60fps performance
    const target = e.currentTarget as HTMLElement;
    target.style.transform = `translateX(${deltaX}px) scale(1.02)`;
    // Throttle reorder calculation with RAF
    cancelAnimationFrame(dragRafRef.current);
    dragRafRef.current = requestAnimationFrame(() => {
      setDragOffset(deltaX);
      // Calculate new position based on drag distance
      const tabWidth = 110;
      const indexDelta = Math.round(deltaX / tabWidth);
      const newIndex = Math.max(0, Math.min(tabOrder.length - 1, dragStartIndex.current + indexDelta));
      
      if (newIndex !== tabOrder.indexOf(draggingTab)) {
        setTabOrder(prev => {
          const arr = [...prev];
          const oldIdx = arr.indexOf(draggingTab);
          arr.splice(oldIdx, 1);
          arr.splice(newIndex, 0, draggingTab);
          return arr;
        });
        dragStartX.current = e.clientX;
        dragStartIndex.current = newIndex;
        lastDeltaRef.current = 0;
        target.style.transform = 'translateX(0) scale(1.02)';
      }
    });
  }, [draggingTab, tabOrder]);

  const handleTabDragEnd = useCallback((e: React.PointerEvent) => {
    if (draggingTab) {
      const target = e.currentTarget as HTMLElement;
      target.releasePointerCapture(e.pointerId);
      // Clean up GPU hints and reset transform
      target.style.willChange = 'auto';
      target.style.transform = 'translateX(0) scale(1)';
      setDraggingTab(null);
      setDragOffset(0);
      lastDeltaRef.current = 0;
      cancelAnimationFrame(dragRafRef.current);
      // Persist tab order
      try { localStorage.setItem('dex-tab-order', JSON.stringify(tabOrder)); } catch {}
    }
  }, [draggingTab, tabOrder]);

  // Load persisted tab order
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dex-tab-order');
      if (saved) setTabOrder(JSON.parse(saved));
    } catch {}
  }, []);

  const renderAppTabBar = () => {
    const tabs = runningApps.filter(a => a.id !== 'home');
    if (!showAppTabBar || tabs.length === 0) return null;
    
    // Sort tabs by custom order
    const sortedTabs = [...tabs].sort((a, b) => {
      const aIdx = tabOrder.indexOf(a.id);
      const bIdx = tabOrder.indexOf(b.id);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });

    return (
      <div
        ref={tabContainerRef}
        style={{
          height: 32, display: 'flex', alignItems: 'center',
          padding: '0 8px', gap: 2,
          background: 'var(--color-bg-glass, rgba(22,22,24,0.72))',
          backdropFilter: 'blur(18px) saturate(170%)',
          WebkitBackdropFilter: 'blur(18px) saturate(170%)',
          borderBottom: '1px solid var(--color-border-subtle)',
          flexShrink: 0, overflowX: 'auto', overflowY: 'hidden',
          scrollbarWidth: 'none',
        }}
      >
        {sortedTabs.map(app => {
          const def = APP_DEFINITIONS[app.id];
          const isActive = currentApp === app.id;
          const isDragging = draggingTab === app.id;
          const color = def?.color || '#8E8E93';
          const icon = Icons[app.id];
          return (
            <div
              key={app.id}
              ref={el => { if (el) tabRefs.current.set(app.id, el); }}
              role="tab"
              aria-selected={isActive}
              aria-label={def?.name || app.id}
              onPointerDown={e => handleTabDragStart(e, app.id)}
              onPointerMove={handleTabDragMove}
              onPointerUp={handleTabDragEnd}
              onPointerCancel={handleTabDragEnd}
              onClick={() => {
                if (!draggingTab) {
                  if (minimizedApps.has(app.id)) restoreFloatingApp(app.id);
                  bringToFront(app.id as AppId);
                  setCurrentApp(app.id as AppId);
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 10px 0 8px', height: 26, borderRadius: 6,
                background: isActive ? 'rgba(74,158,255,0.16)' : isDragging ? 'var(--color-bg-glass-strong)' : 'transparent',
                border: isActive ? '1px solid var(--color-border-subtle)' : isDragging ? '1px solid var(--color-border-subtle)' : '1px solid transparent',
                cursor: isDragging ? 'grabbing' : 'grab', flexShrink: 0,
                transform: isDragging ? `translateX(${dragOffset}px) scale(1.04)` : 'translateX(0) scale(1)',
                transition: isDragging ? 'none' : 'transform 0.15s cubic-bezier(0.4,0,0.2,1), background 0.12s ease, border-color 0.12s ease',
                zIndex: isDragging ? 100 : 1,
                boxShadow: isDragging ? '0 6px 18px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.04) inset' : 'none',
                opacity: isDragging ? 0.97 : 1,
                touchAction: 'none',
                userSelect: 'none',
                willChange: isDragging ? 'transform' : 'auto',
              }}
              onMouseEnter={e => { if (!isActive && !draggingTab) (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)'; }}
              onMouseLeave={e => { if (!isActive && !draggingTab) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ display: 'flex', color, alignItems: 'center', justifyContent: 'center', flexShrink: 0, pointerEvents: 'none' }}>
                {AppIconPngs[app.id]
                  ? <AppIconImg appId={app.id} size={14} />
                  : (icon || <DexIcon name={APP_DEFINITIONS[app.id]?.icon || app.id} size={14} color={color} />)}
              </span>
              <span style={{
                fontSize: 11, fontWeight: isActive ? 600 : 500,
                color: isActive ? '#fff' : 'var(--color-text-secondary)',
                maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                letterSpacing: '-0.01em', pointerEvents: 'none',
              }}>
                {def?.name || app.id}
              </span>
              <button
                aria-label={`Close ${def?.name || app.id}`}
                onClick={e => { e.stopPropagation(); e.preventDefault(); handleCloseApp(app.id); }}
                onPointerDown={e => e.stopPropagation()}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 18, height: 18, borderRadius: 4,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--color-text-tertiary)', padding: 0, marginLeft: 4, flexShrink: 0,
                  transition: 'color 0.08s ease, background 0.08s ease, transform 0.08s ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-error)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,69,58,0.12)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-tertiary)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                onMouseDown={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.9)'; }}
                onMouseUp={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const renderTitleBar = () => (
    <div style={{
      height: 34, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: `0 ${12 + nativeOverlayWidth}px 0 12px`,
      background: 'rgba(14,14,17,0.46)',
      backdropFilter: 'blur(30px) saturate(180%)',
      WebkitBackdropFilter: 'blur(30px) saturate(180%)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.08), 0 1px 10px rgba(0,0,0,0.22)',
      WebkitAppRegion: 'drag', flexShrink: 0,
      position: 'relative', zIndex: 100,
    } as React.CSSProperties}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {windowControls === 'traffic' && (
          <div
            className="traffic-light-group"
            style={{ display: 'flex', gap: 8, marginRight: 8, alignItems: 'center' }}
          >
            <button onClick={handleClose} data-tip="Close" aria-label="Close window" style={trafficBtn('#ff5f57')}>
              <svg className="tl-glyph" width="8" height="8" viewBox="0 0 8 8" style={{ color: 'rgba(0,0,0,0.55)' }}><path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/></svg>
            </button>
            <button onClick={handleMinimize} data-tip="Minimize" aria-label="Minimize window" style={trafficBtn('#febc2e')}>
              <svg className="tl-glyph" width="8" height="8" viewBox="0 0 8 8" style={{ color: 'rgba(0,0,0,0.55)' }}><path d="M1 4H7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/></svg>
            </button>
            <button onClick={handleMaximize} data-tip="Maximize" aria-label="Maximize window" style={trafficBtn('#28c840')}>
              <svg className="tl-glyph" width="8" height="8" viewBox="0 0 8 8" style={{ color: 'rgba(0,0,0,0.55)' }}><path d="M1 1L4 4L7 1M1 7L4 4L7 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/></svg>
            </button>
          </div>
        )}
        <button style={{...navBtnStyle, opacity: navIndex > 0 ? 1 : 0.4, cursor: navIndex > 0 ? 'pointer' : 'not-allowed'}} onClick={goBack} disabled={navIndex <= 0} data-tip="Back" aria-label="Navigate back" aria-disabled={navIndex <= 0}>
          {Icons.chevronLeft}
        </button>
        <button style={{...navBtnStyle, opacity: navIndex < navHistoryRef.current.length - 1 ? 1 : 0.4, cursor: navIndex < navHistoryRef.current.length - 1 ? 'pointer' : 'not-allowed'}} onClick={goForward} disabled={navIndex >= navHistoryRef.current.length - 1} data-tip="Forward" aria-label="Navigate forward" aria-disabled={navIndex >= navHistoryRef.current.length - 1}>
          {Icons.chevronRight}
        </button>
        <button style={navBtnStyle} onClick={() => setCurrentApp('home' as AppId)} onContextMenu={(e) => { e.preventDefault(); setTitlebarMenuOpen(true); }} data-tip="Home" aria-label="Go to Home">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12L12 3l9 9"/><path d="M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9"/></svg>
        </button>
        <button style={{...navBtnStyle, color: currentApp === 'browser' ? 'var(--color-accent)' : undefined}} onClick={() => setCurrentApp('browser' as AppId)} data-tip="Browser (Ctrl+6)" aria-label="Open Browser">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        </button>
      </div>
      <span style={{
        fontSize: 13, fontWeight: 500, color: 'var(--color-text-tertiary)',
        position: 'absolute', left: 280,
        letterSpacing: '-0.01em',
        display: currentApp === 'home' ? 'none' : 'flex', alignItems: 'center', gap: 6,
        WebkitAppRegion: 'no-drag',
        cursor: 'pointer',
        maxWidth: 'calc(50% - 320px)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        pointerEvents: 'auto',
      } as React.CSSProperties}>
        {/* Live Activities Strip -- shows running app status */}
        {(() => {
          const activeCreative = runningApps.filter(a => CREATIVE_APPS.has(a.id));
          const hasMinimized = minimizedApps.size > 0;
          if (activeCreative.length === 0 && !hasMinimized) {
            return <span style={{ pointerEvents: 'none' }}>{getLabel(currentApp)}</span>;
          }
          return (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(255,255,255,0.07)',
              backdropFilter: 'blur(20px) saturate(160%)',
              WebkitBackdropFilter: 'blur(20px) saturate(160%)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 20, padding: '2px 10px 2px 6px',
              height: 24, overflow: 'hidden',
            }}>
              {activeCreative.length > 0 ? activeCreative.slice(0, 3).map(a => {
                const def = APP_DEFINITIONS[a.id];
                const col = def?.color || '#8E8E93';
                return (
                  <button key={a.id} onClick={() => { if (minimizedApps.has(a.id)) restoreFloatingApp(a.id); setCurrentApp(a.id as AppId); }}
                    title={def?.name || a.id}
                    aria-label={`Switch to ${def?.name || a.id}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'inherit' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: col, flexShrink: 0, boxShadow: `0 0 4px ${col}60` }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-secondary)', maxWidth: 52, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def?.name || a.id}</span>
                  </button>
                );
              }) : null}
              {hasMinimized && (
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 2 }}>
                  {minimizedApps.size} minimized
                </span>
              )}
              {activeCreative.length === 0 && <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{getLabel(currentApp)}</span>}
            </div>
          );
        })()}
      </span>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Date + time live in the draggable Clock widget on Home (user-placed).
            Keeping the topbar minimal -- only system status indicators here. */}
        {/* Battery - always visible */}
        <div style={{ position: 'relative', width: 18, height: 9, borderRadius: 2.5, border: '1px solid var(--color-text-tertiary)', display: 'flex', alignItems: 'center', padding: '0.5px' }}>
          <div style={{ height: '100%', width: `${batteryLevel}%`, borderRadius: 1.5, background: batteryLevel > 20 ? 'var(--color-success)' : 'var(--color-error)', transition: 'width 0.3s ease' }} />
          <div style={{ position: 'absolute', right: -2.5, width: 1.5, height: 3.5, borderRadius: '0 0.5px 0.5px 0', background: 'var(--color-text-tertiary)' }} />
        </div>
        {batteryCharging && <svg width="7" height="7" viewBox="0 0 24 24" fill="var(--color-warning)" stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>}
        {/* WiFi indicator - compact dot */}
        <span title={navigator.onLine ? 'Online' : 'Offline'} style={{ width: 6, height: 6, borderRadius: '50%', background: navigator.onLine ? 'var(--color-success)' : 'var(--color-error)', flexShrink: 0 }} />

        {/* Quick Controls -- network mode + permission pills with popovers */}
        <QuickControls onOpenSettings={() => setCurrentApp('settings' as AppId)} />

        {/* Notification Center bell */}
        <button
          onClick={() => setShowNotifCenter(v => !v)}
          title="Notification Center"
          aria-label="Open notification center"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 18, borderRadius: 5, position: 'relative',
            background: showNotifCenter ? 'var(--color-border)' : 'transparent',
            border: 'none', cursor: 'pointer', padding: 0,
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)'; }}
          onMouseLeave={e => { if (!showNotifCenter) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {bannerNotifications.history.length > 0 && (
            <span style={{
              position: 'absolute', top: 0, right: 0,
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--color-accent)',
              border: '1px solid var(--color-bg-base)',
            }} />
          )}
        </button>
        {/* Menu dropdown trigger */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setTitlebarMenuOpen(v => !v)}
            onContextMenu={(e) => { e.preventDefault(); setTitlebarMenuOpen(true); }}
            title="Controls"
            aria-label="Open control center"
            aria-expanded={titlebarMenuOpen}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 18, borderRadius: 5,
              background: titlebarMenuOpen ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.10)',
              cursor: 'pointer', padding: 0, transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => { if (!titlebarMenuOpen) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.14)'; }}
            onMouseLeave={e => { if (!titlebarMenuOpen) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
            </svg>
          </button>
          {/* Dropdown panel */}
          {titlebarMenuOpen && (
            <>
              <style>{`@keyframes titlebarDropIn { from { opacity: 0; transform: translateY(-4px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
              <div
                role="menu"
                aria-label="Control center"
                style={{
                  position: 'absolute', top: 24, right: 0, zIndex: 'var(--z-max)',
                  minWidth: 220, padding: '6px 0',
                  background: 'rgba(24,24,28,0.70)',
                  backdropFilter: 'blur(42px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(42px) saturate(180%)',
                  borderRadius: 14, border: '1px solid rgba(255,255,255,0.10)',
                  boxShadow: '0 18px 58px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.08)',
                  animation: 'titlebarDropIn 0.18s cubic-bezier(0.23,1,0.32,1)',
                  transformOrigin: 'top right',
                }}
              >
                {/* User Profile */}
                <button
                  role="menuitem"
                  onClick={() => { setCurrentApp('settings' as AppId); setTitlebarMenuOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '8px 14px', background: 'transparent', border: 'none',
                    color: 'var(--color-text-primary)', fontSize: 13, cursor: 'pointer',
                    textAlign: 'left', borderRadius: 0, transition: 'background 0.08s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>
                  </svg>
                  Settings &amp; Profile
                </button>
                {/* Network Status */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 14px', fontSize: 13, color: 'var(--color-text-primary)',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={navigator.onLine ? 'var(--color-success)' : 'var(--color-error)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.55a11 11 0 0 1 14 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill={navigator.onLine ? 'var(--color-success)' : 'var(--color-error)'}/>
                  </svg>
                  {navigator.onLine ? 'Wi-Fi: Connected' : 'Wi-Fi: Offline'}
                </div>
                {/* Volume */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>{systemVolume > 0 && <path d="M15.54 8.46a5 5 0 010 7.07"/>}{systemVolume > 40 && <path d="M19.07 4.93a10 10 0 010 14.14"/>}
                  </svg>
                  <input
                    type="range" min={0} max={100} value={systemVolume}
                    onChange={e => setSystemVolume(Number(e.target.value))}
                    aria-label="System volume"
                    style={{ flex: 1, height: 3, accentColor: '#fff', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', minWidth: 22, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as any }}>{systemVolume}</span>
                </div>
                <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 0' }} />
                {/* Spatial Audio toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={spatialAudioOn ? 'var(--color-success)' : 'var(--color-text-secondary)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 10s3-4 10-4 10 4 10 4"/><path d="M2 14s3 4 10 4 10-4 10-4"/><circle cx="12" cy="12" r="2"/></svg>
                    <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>Spatial Audio</span>
                  </div>
                  <button
                    onClick={() => setSpatialAudioOn(p => !p)}
                    aria-label={spatialAudioOn ? 'Disable spatial audio' : 'Enable spatial audio'}
                    style={{
                      width: 32, height: 18, borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: spatialAudioOn ? 'var(--color-success)' : 'var(--color-border)',
                      position: 'relative', transition: 'background 0.2s ease', padding: 0,
                    }}
                  >
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 2, left: 2,
                      transform: spatialAudioOn ? 'translateX(14px)' : 'translateX(0)',
                      transition: 'transform 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }} />
                  </button>
                </div>
                {/* Reduce Motion toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px' }}>
                  <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>Reduce Motion</span>
                  <button
                    onClick={() => {
                      const cur = isReduceMotion();
                      try { localStorage.setItem('dex-reduce-motion', String(!cur)); } catch (e) { console.warn('[DEX]', e); }
                      window.location.reload();
                    }}
                    aria-label="Toggle reduce motion"
                    style={{
                      width: 32, height: 18, borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: isReduceMotion() ? 'var(--color-success)' : 'var(--color-border)',
                      position: 'relative', transition: 'background 0.2s ease', padding: 0,
                    }}
                  >
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 2, left: 2,
                      transform: isReduceMotion() ? 'translateX(14px)' : 'translateX(0)',
                      transition: 'transform 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }} />
                  </button>
                </div>
                <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 0' }} />
                {/* Window Controls Toggle — only show on macOS where both styles make sense */}
                {!IS_WINDOWS && (
                <button
                  role="menuitem"
                  onClick={() => {
                    const next = windowControls === 'traffic' ? 'system' : 'traffic';
                    setWindowControls(next);
                    try { localStorage.setItem('dex-window-controls', next); } catch (e) { console.warn('[DEX]', e); }
                    window.dispatchEvent(new Event('dex-window-controls-changed'));
                    setTitlebarMenuOpen(false);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '8px 14px', background: 'transparent', border: 'none',
                    color: 'var(--color-text-primary)', fontSize: 13, cursor: 'pointer',
                    textAlign: 'left', borderRadius: 0, transition: 'background 0.08s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {windowControls === 'traffic' ? (
                    <span style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ff5f57' }} />
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#febc2e' }} />
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#28c840' }} />
                    </span>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round"><rect x="4" y="6" width="16" height="12" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/></svg>
                  )}
                  {windowControls === 'traffic' ? 'Switch to System Controls' : 'Switch to Traffic Lights'}
                </button>
                )}
                {/* Battery detail */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 14px', fontSize: 13, color: 'var(--color-text-primary)',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={batteryLevel > 20 ? 'var(--color-success)' : 'var(--color-error)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="18" height="10" rx="2"/><line x1="22" y1="11" x2="22" y2="13"/>
                  </svg>
                  Battery: {batteryLevel}%{batteryCharging ? ' (Charging)' : ''}
                </div>
              </div>
            </>
          )}
        </div>
        {windowControls === 'system' && (
          <div style={{ display: 'flex', alignItems: 'center', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <div style={{ width: 1, height: 12, background: 'var(--color-border-subtle)', margin: '0 2px' }} />
            <button style={winBtnStyle} onClick={handleMinimize} data-tip="Minimize" aria-label="Minimize window">{Icons.minimize}</button>
            <button style={winBtnStyle} onClick={handleMaximize} data-tip="Maximize" aria-label="Maximize window">{Icons.maximize}</button>
            <button style={winBtnStyle} onClick={handleClose} data-tip="Close" aria-label="Close window"
              onMouseEnter={e => { e.currentTarget.style.background = '#e81123'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
            >{Icons.close}</button>
          </div>
        )}
      </div>
    </div>
  );

  // ======================================================================
  // RENDER
  // ======================================================================

  return (
    <div role="application" aria-label="DEX Desktop" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'transparent', fontFamily: 'var(--font-family)', overflow: 'hidden', minWidth: 360 }}>
      <a href="#dex-main-content" className="dex-skip-nav">Skip to content</a>
      <div aria-live="polite" aria-atomic="true" className="dex-sr-only" id="dex-live-region" />

      {renderTitleBar()}
      {renderAppTabBar()}

      {/* Stage Manager -- macOS Tahoe left strip */}
      {stageManagerOn && (
        <StageManager
          apps={runningApps.filter(a => a.id !== 'home')}
          focusedAppId={focusedFloatingAppId || currentAppId}
          anyMaximized={anyWindowMaximized}
          onSelect={(id) => {
            // Restore from minimized if needed, bring to front
            if (minimizedApps.has(id)) restoreFloatingApp(id);
            bringToFront(id as AppId);
            setCurrentApp(id as AppId);
            // Track achievement
            window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'stageManagerSplits', amount: 1 } }));
          }}
          onClose={(id) => handleCloseApp(id)}
          icons={Icons}
        />
      )}

      {/* Left edge touch/pen affordance for Stage Manager toggle */}
      {!stageManagerOn && runningApps.filter(a => a.id !== 'home').length > 0 && (
        <div
          onClick={() => {
            setStageManagerOn(true);
            localStorage.setItem('dex-stage-manager', 'true');
            window.dispatchEvent(new CustomEvent('dex-stage-manager-changed'));
          }}
          onTouchStart={() => {
            setStageManagerOn(true);
            localStorage.setItem('dex-stage-manager', 'true');
            window.dispatchEvent(new CustomEvent('dex-stage-manager-changed'));
          }}
          aria-label="Show Stage Manager"
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              setStageManagerOn(true);
              localStorage.setItem('dex-stage-manager', 'true');
              window.dispatchEvent(new CustomEvent('dex-stage-manager-changed'));
            }
          }}
          style={{
            position: 'fixed', left: 0, top: '50%', transform: 'translateY(-50%)',
            width: 6, height: 48, borderRadius: '0 4px 4px 0',
            background: 'var(--color-text-tertiary)',
            opacity: 0.3, cursor: 'pointer', zIndex: 5001,
            transition: 'opacity 0.2s ease, width 0.2s ease',
            pointerEvents: 'auto',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.65'; e.currentTarget.style.width = '10px'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.3'; e.currentTarget.style.width = '6px'; }}
        />
      )}

      {/* Content area -- supports split-screen tiling */}
      {splitMode === 'off' ? (
        <div ref={contentRef} id="dex-main-content" role="main" aria-label="App content" style={{
          flex: 1, position: 'relative', overflow: 'hidden',
          background: 'transparent',
          margin: 0, borderRadius: 0,
          contain: 'layout style',
        }}>
          {keepAliveElements}
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
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-bg-base)' }}>
                  <div style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', background: 'var(--color-border-subtle)', borderBottom: '0.5px solid var(--color-border-subtle)', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' }}>{getLabel(currentApp)}</span>
                    <button onClick={exitSplit} data-tip="Exit Split" aria-label="Exit split view" style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 2, fontSize: 11, fontWeight: 600 }}>Exit Split</button>
                  </div>
                  <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--color-bg-base)' }}>
                    <AppErrorBoundary appId={currentApp}><Suspense fallback={<Loading appId={currentApp} />}><Comp /></Suspense></AppErrorBoundary>
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
              background: splitDragging.current ? 'var(--color-accent)' : 'var(--color-bg-hover)',
              transition: 'background 0.25s cubic-bezier(0.4,0,0.2,1)',
              flexShrink: 0, zIndex: 10, position: 'relative',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-accent)'; }}
            onMouseLeave={e => { if (!splitDragging.current) (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)'; }}
          />
          {/* Secondary pane */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {(() => {
              const sApp = splitApp;
              if (!sApp) return null;
              const Comp = APP_COMPONENTS[sApp];
              return Comp ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', background: 'var(--color-border-subtle)', borderBottom: '0.5px solid var(--color-border-subtle)', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' }}>{getLabel(sApp)}</span>
                    <button onClick={() => { setSplitApp(null); setSplitMode('off'); }} data-tip="Close" aria-label="Close split pane" style={{ background: 'none', border: 'none', color: 'rgba(255,69,58,0.8)', cursor: 'pointer', padding: 2, fontSize: 11, fontWeight: 600 }}>Close</button>
                  </div>
                  <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                    <AppErrorBoundary appId={sApp}><Suspense fallback={<Loading appId={sApp} />}><Comp /></Suspense></AppErrorBoundary>
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        </div>
      )}

      {/* Snap Zone Preview Indicator (visible during window drag) */}
      {snapPreviewZone && (() => {
        const W = window.innerWidth;
        const H = window.innerHeight;
        const PAD = 8;
        const TOP = 36;
        const halfW = (W - PAD * 3) / 2;
        const halfH = (H - TOP - PAD * 3) / 2;
        const zones: Record<string, { x: number; y: number; w: number; h: number }> = {
          left:         { x: PAD, y: TOP + PAD, w: halfW, h: H - TOP - PAD * 2 },
          right:        { x: PAD * 2 + halfW, y: TOP + PAD, w: halfW, h: H - TOP - PAD * 2 },
          'top-left':   { x: PAD, y: TOP + PAD, w: halfW, h: halfH },
          'top-right':  { x: PAD * 2 + halfW, y: TOP + PAD, w: halfW, h: halfH },
          'bottom-left':  { x: PAD, y: TOP + PAD * 2 + halfH, w: halfW, h: halfH },
          'bottom-right': { x: PAD * 2 + halfW, y: TOP + PAD * 2 + halfH, w: halfW, h: halfH },
          maximize:     { x: PAD, y: TOP + PAD, w: W - PAD * 2, h: H - TOP - PAD * 2 },
        };
        const z = zones[snapPreviewZone];
        if (!z) return null;
        return (
          <div
            key="snap-preview"
            aria-hidden="true"
            style={{
              position: 'fixed', left: z.x, top: z.y, width: z.w, height: z.h,
              background: 'rgba(59,130,246,0.08)',
              border: '2.5px solid rgba(59,130,246,0.35)',
              borderRadius: 14,
              pointerEvents: 'none',
              zIndex: 4000,
              transition: 'all 0.2s cubic-bezier(0.2,0.9,0.3,1)',
              boxShadow: '0 0 20px rgba(59,130,246,0.1)',
              animation: 'dex-snap-zone-pulse 1.5s ease-in-out infinite',
            }}
          />
        );
      })()}

      {/* System Status Bar -- hidden by default for fullscreen experience */}

      {/* UKI Voice Assistant Transcript Overlay */}
      <UkiOverlay />

      {/* Floating Dock -- position fixed so it floats freely, no black bar */}
      {/* Dock hover preview -- simple name tooltip */}
      {dockPreview && (() => {
        const previewApp = [...dockItems].find(d => d.id === dockPreview.id);
        if (!previewApp) return null;
        const isAppRunning = runningApps.some(a => a.id === previewApp.id);
        const isAppActive = currentApp === previewApp.id;
        const isAppMinimized = minimizedApps.has(previewApp.id);
        const isPeekPinned = dockPreviewPinnedId === previewApp.id;
        const recentForApp = recentFiles.find((f) => f.appId === previewApp.id);
        const shortcut = dockShortcut[previewApp.id];
        return (
          <div style={{
            position: 'fixed',
            left: dockPreview.x,
            top: dockPreview.y - 8,
            transform: 'translate(-50%, -100%)',
            zIndex: 5002,
            background: 'var(--color-bg-elevated)',
            borderRadius: 10,
            border: '1px solid var(--color-border)',
            padding: '7px 14px',
            pointerEvents: 'auto',
            boxShadow: '0 8px 28px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', gap: 8,
            animation: isReduceMotion() ? 'none' : 'dex-menu-pop 0.15s cubic-bezier(0.23,1,0.32,1)',
          } as React.CSSProperties}>
            <div style={{ width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: previewApp.color, background: `${previewApp.color}18`, flexShrink: 0 }}>
              {AppIconPngs[previewApp.id]
                ? <AppIconImg appId={previewApp.id} size={20} />
                : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icons[previewApp.id] || <DexIcon name={APP_DEFINITIONS[previewApp.id]?.icon || previewApp.id} size={18} color={previewApp.color} />}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>{previewApp.label}</span>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                {isAppActive ? 'Active' : isAppMinimized ? 'Minimized' : isAppRunning ? 'Running' : ''}
                {shortcut ? `${isAppRunning || isAppActive || isAppMinimized ? ' · ' : ''}${shortcut}` : ''}
              </span>
            </div>
            <button
              type="button"
              aria-label={isPeekPinned ? `Unpin Dock peek for ${previewApp.label}` : `Pin Dock peek for ${previewApp.label}`}
              onClick={() => {
                if (isPeekPinned) {
                  setDockPreviewPinnedId(null);
                  setDockPreview(null);
                } else {
                  setDockPreviewPinnedId(previewApp.id);
                }
              }}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                background: isPeekPinned ? 'var(--color-accent)' : 'var(--color-bg-surface)',
                color: isPeekPinned ? '#fff' : 'var(--color-text-primary)',
                fontSize: 10,
                padding: '3px 7px',
                cursor: 'pointer',
              }}
            >
              {isPeekPinned ? 'Pinned' : 'Pin'}
            </button>
            <button
              type="button"
              aria-label={`Open ${previewApp.label} from Dock peek`}
              onClick={() => {
                openDockApp(previewApp.id as AppId, null);
                setDockPreviewPinnedId(null);
                setDockPreview(null);
              }}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                background: 'var(--color-bg-surface)',
                color: 'var(--color-text-primary)',
                fontSize: 10,
                padding: '3px 7px',
                cursor: 'pointer',
              }}
            >
              Open
            </button>
            {recentForApp && (
              <button
                type="button"
                aria-label={`Open recent file ${recentForApp.name} for ${previewApp.label}`}
                onClick={async () => {
                  try {
                    await window.electron?.invoke?.('shell:openPath', recentForApp.path);
                    window.dispatchEvent(new CustomEvent('dex-toast', {
                      detail: { type: 'success', message: `Opened recent: ${recentForApp.name}` },
                    }));
                  } catch {
                    window.dispatchEvent(new CustomEvent('dex-toast', {
                      detail: { type: 'error', message: `Could not open recent file: ${recentForApp.name}` },
                    }));
                  }
                }}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  background: 'var(--color-bg-surface)',
                  color: 'var(--color-text-primary)',
                  fontSize: 10,
                  padding: '3px 7px',
                  cursor: 'pointer',
                  maxWidth: 140,
                }}
              >
                Open Recent
              </button>
            )}
          </div>
        );
      })()}
      <div aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>
        {dockPeekAnnouncement}
      </div>
      <div
        onMouseEnter={showDock}
        onMouseMove={handleDockMouseMove}
        onMouseLeave={handleDockMouseLeave}
        onTouchStart={showDock}
        style={(() => {
          const geom = computeDockGeometry({ edge: dockEdgePref, preset: dockPresetPref, visible: taskbarVisible });
          return {
            ...geom.positionStyle,
            zIndex: 'var(--z-dock)' as unknown as number,
            transform: taskbarVisible ? geom.visibleTransform : geom.hiddenTransform,
            display: 'flex', justifyContent: 'center',
            opacity: taskbarVisible ? 1 : 0,
            transition: 'opacity 0.2s cubic-bezier(0.23,1,0.32,1), transform 0.2s cubic-bezier(0.23,1,0.32,1)',
            pointerEvents: taskbarVisible ? 'auto' : 'none',
          } as React.CSSProperties;
        })()}
      >
        <div
          ref={dockRef}
          role="toolbar"
          aria-label="Application dock"
          data-dock-container=""
          data-dock-edge={dockEdgePref}
          data-dock-preset={dockPresetPref}
          style={(() => {
            const geom = computeDockGeometry({ edge: dockEdgePref, preset: dockPresetPref, visible: taskbarVisible });
            return {
              ...liquidGlassDock,
              display: 'flex',
              flexDirection: geom.flexDirection,
              alignItems: 'center', gap: 8,
              padding: `${geom.paddingY + 4}px ${geom.paddingX + 8}px`,
              borderRadius: 9999,
              overflow: 'visible',
              maxWidth: geom.flexDirection === 'row' ? '96vw' : undefined,
              maxHeight: geom.flexDirection === 'column' ? '96vh' : undefined,
              position: 'relative',
              contain: 'layout style',
              isolation: 'isolate',
            } as React.CSSProperties;
          })()}
        >
          {/* Wallpaper color reflection on dock */}
          <div style={getDockReflectionStyle()} />
          {/* App Menu Button */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <button
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setShowAppMenu(p => !p);
              }}
              aria-label="Open App Menu"
              data-dex-launchpad
              style={{
                width: 40, height: 40,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: showAppMenu ? 'var(--color-border-subtle)' : 'transparent',
                border: 'none', borderRadius: 10, cursor: 'pointer',
                transition: 'background 0.25s ease',
                padding: 0, touchAction: 'manipulation',
                outline: 'none',
                WebkitAppRegion: 'no-drag',
              } as React.CSSProperties}
            >
              {/* Modern app launcher icon — 4 rounded squares */}
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ transition: 'opacity 0.25s ease', pointerEvents: 'none' }}>
                <rect x="1" y="1" width="7" height="7" rx="2" fill={showAppMenu ? 'var(--color-accent)' : 'var(--color-text-secondary)'} style={{ transition: 'fill 0.25s ease' }} />
                <rect x="10" y="1" width="7" height="7" rx="2" fill={showAppMenu ? 'var(--color-accent)' : 'var(--color-text-secondary)'} style={{ transition: 'fill 0.25s ease' }} />
                <rect x="1" y="10" width="7" height="7" rx="2" fill={showAppMenu ? 'var(--color-accent)' : 'var(--color-text-secondary)'} style={{ transition: 'fill 0.25s ease' }} />
                <rect x="10" y="10" width="7" height="7" rx="2" fill={showAppMenu ? 'var(--color-accent)' : 'var(--color-text-secondary)'} style={{ transition: 'fill 0.25s ease' }} />
              </svg>
            </button>
          </div>
          {dockSeparator('sep-menu')}
          {/* UKI Mic Button */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <button
                  onClick={() => {
                    const dex = (window as any).dex;
                    if (dex?.uki?.toggle) {
                      dex.uki.toggle();
                    }
                    // Also toggle panel visibility for text input
                    useUkiStore.getState().togglePanel();
                  }}
                  aria-label={isUkiActive ? 'Close UKI' : 'Open UKI'}
                  title="UKI Voice Assistant"
                  style={{
                    width: 36, height: 36,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isUkiActive ? 'rgba(10,132,255,0.20)' : 'transparent',
                    border: 'none', borderRadius: 10, cursor: 'pointer',
                    transition: 'all 0.25s ease',
                    padding: 0, touchAction: 'manipulation',
                    outline: 'none',
                    WebkitAppRegion: 'no-drag',
                    animation: isUkiActive ? 'ukiPulse 1.5s ease-in-out infinite' : 'none',
                  } as React.CSSProperties}
                  onMouseEnter={e => { if (!isUkiActive) (e.currentTarget as HTMLElement).style.background = 'var(--color-border-subtle)'; }}
                  onMouseLeave={e => { if (!isUkiActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isUkiActive ? 'var(--color-accent)' : 'var(--color-text-secondary)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                </button>
                {isUkiActive && (
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--color-accent)', boxShadow: '0 0 6px #0A84FF' }} />
                )}
          </div>
          {dockSeparator('sep-uki')}
          {renderDockItems(dockItems)}
          {/* Close All Button -- Item 148: improved with tooltip */}
          {hasRunningNonHome && (
            <>
              {dockSeparator('sep-close')}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <button
                  onClick={handleCloseAllApps}
                  title="Close all apps"
                  aria-label={`Close all ${runningApps.filter(a => a.id !== 'home').length} running apps`}
                  style={{
                    width: 28, height: 28,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'transparent',
                    border: 'none', borderRadius: 8, cursor: 'pointer',
                    transition: 'transform 0.25s cubic-bezier(0.23,1,0.32,1)',
                    padding: 0, touchAction: 'manipulation',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.15)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  onPointerDown={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.92)'; }}
                  onPointerUp={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                  onPointerLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom hover trigger zone -- center-only with hover-intent (velocity + dwell) to prevent accidental popups */}
      <div
        onMouseEnter={(e) => beginDockIntent(e)}
        onMouseMove={(e) => trackDockIntent(e)}
        onMouseLeave={() => { cancelDockIntent(); scheduleDockHide(); }}
        onTouchStart={showDock}
        onPointerEnter={(e) => beginDockIntent(e)}
        onPointerMove={(e) => trackDockIntent(e)}
        onPointerLeave={() => { cancelDockIntent(); scheduleDockHide(); }}
        style={{
          position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
          width: 320,
          height: 32,
          zIndex: 5001, cursor: 'default', background: 'transparent',
          pointerEvents: anyWindowMaximized ? 'none' : 'auto',
        }}
      >
        {/* Visible touch/pen affordance pill — larger grab handle centered for touch users */}
        {!taskbarVisible && (
          <div
            onClick={showDock}
            onTouchStart={showDock}
            aria-label="Show Dock"
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') showDock(); }}
            style={{
              position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
              width: 44, height: 4, borderRadius: 2,
              background: 'rgba(255,255,255,0.15)',
              boxShadow: 'none',
              cursor: 'pointer',
              transition: 'opacity 0.25s cubic-bezier(0.23,1,0.32,1), width 0.25s cubic-bezier(0.23,1,0.32,1), transform 0.25s cubic-bezier(0.23,1,0.32,1)',
              pointerEvents: 'auto',
            }}
            onMouseEnter={e => { e.currentTarget.style.width = '64px'; e.currentTarget.style.transform = 'translateX(-50%) scaleY(1.15)'; }}
            onMouseLeave={e => { e.currentTarget.style.width = '44px'; e.currentTarget.style.transform = 'translateX(-50%)'; }}
          />
        )}
      </div>

      {/* App Menu Overlay -- bottom popup from dock */}
      {showAppMenu && (
        <>
          <div
            data-dex-overlay
            onClick={() => { setShowAppMenu(false); setAppMenuSearch(''); }}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.18)',
              zIndex: 9000,
              pointerEvents: 'auto',
            } as React.CSSProperties}
          />
          <div
            data-dex-overlay
            data-dex-app-menu-panel
            role="dialog"
            aria-label="App menu"
            style={{
              position: 'fixed',
              left: '50%', bottom: 72,
              transform: 'translateX(-50%)',
              zIndex: 9700,
              width: 'min(560px, 90vw)',
              maxHeight: 'calc(100vh - 120px)',
              overflowY: 'auto',
              overflowX: 'hidden',
              scrollBehavior: 'smooth',
              scrollbarWidth: 'none',
              WebkitOverflowScrolling: 'touch',
              overscrollBehaviorY: 'contain',
              background: 'var(--color-bg-elevated, #1c1c1e)',
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: 22,
              padding: '20px 20px 16px',
              boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
              animation: 'appMenuSlideUp 0.22s cubic-bezier(0.23,1,0.32,1)',
            } as React.CSSProperties}
          >
            <style>{`
              @keyframes appMenuSlideUp { 
                from { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.97); }
                to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
              }
            `}</style>
            {/* Search bar — pill style matching Home search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 46, padding: '0 18px', borderRadius: 28, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)', marginBottom: 12 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.4, flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input
                ref={appMenuSearchRef}
                value={appMenuSearch}
                onChange={e => setAppMenuSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    if (appMenuSearch) setAppMenuSearch('');
                    else setShowAppMenu(false);
                    e.stopPropagation();
                  }
                }}
                placeholder="Search apps and settings..."
                aria-label="Search apps and settings"
                style={{
                  flex: 1, height: '100%',
                  background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--color-text-primary)',
                  fontSize: 14, fontWeight: 400,
                  fontFamily: 'var(--font-family)',
                  letterSpacing: '-0.01em',
                }}
              />
            </div>
            {(() => {
              const searchResults = appMenuSearch.trim()
                ? spotlightEngine.search(appMenuSearch).filter(result => ['top', 'apps', 'settings', 'actions'].includes(result.category)).slice(0, 20)
                : null;
              if (searchResults) {
                return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} aria-label="Search results">
              {searchResults.length === 0 && (
                <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No apps or settings found</div>
              )}
              {searchResults.map(result => {
                const resultIcon = result.icon ? (Icons as Record<string, JSX.Element>)[result.icon] : null;
                const categoryLabel = result.category === 'settings' ? 'Setting' : result.category === 'actions' ? 'Action' : 'App';
                const appDef = APP_DEFINITIONS[result.id as AppId];
                const iconName = result.icon || appDef?.icon || result.id || 'settings';
                return (
                  <button
                    key={result.id}
                    onClick={() => { result.action(); setShowAppMenu(false); setAppMenuSearch(''); }}
                    className="dex-hover-lift"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      width: '100%', padding: '10px 12px', borderRadius: 14,
                      background: 'var(--color-border-subtle)', border: '1px solid var(--color-bg-hover)',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: 38, height: 38, borderRadius: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: result.color || '#8E8E93',
                      background: `${result.color || '#8E8E93'}18`,
                      flexShrink: 0,
                    }}>
                      {resultIcon || <DexIcon name={iconName} size={16} color={result.color || '#8E8E93'} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{result.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{result.subtitle || categoryLabel}</div>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{categoryLabel}</div>
                  </button>
                );
              })}
            </div>
                );
              }
              const filtered = Array.from(new Map(LAUNCHPAD_APPS.map(app => [app.id, app])).values());
              return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: 4, justifyItems: 'center' }}
              aria-label="All applications"
              data-launchpad-grid=""
              onKeyDown={(e) => {
                // Item 150: Grid arrow key navigation in app menu
                const btns = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button'));
                const idx = btns.indexOf(document.activeElement as HTMLButtonElement);
                if (idx < 0) return;
                const cols = 5;
                let next = idx;
                if (e.key === 'ArrowRight') next = (idx + 1) % btns.length;
                else if (e.key === 'ArrowLeft') next = (idx - 1 + btns.length) % btns.length;
                else if (e.key === 'ArrowDown') next = Math.min(idx + cols, btns.length - 1);
                else if (e.key === 'ArrowUp') next = Math.max(idx - cols, 0);
                else if (e.key === 'Home') next = 0;
                else if (e.key === 'End') next = btns.length - 1;
                else return;
                e.preventDefault();
                btns[next]?.focus();
              }}
            >
              {filtered.length === 0 && (
                <div style={{ gridColumn: '1 / -1', color: 'var(--color-text-tertiary)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No apps found</div>
              )}
              {filtered.map(app => {
                const icon = Icons[app.id] || <DexIcon name={APP_DEFINITIONS[app.id]?.icon || app.id} size={24} color={app.color} />;
                const isActive = currentApp === app.id;
                const isRunning = runningApps.some(a => a.id === app.id);
                return (
                  <button
                    key={app.id}
                    data-launchpad-app-id={app.id}
                    onClick={() => { setCurrentApp(app.id as AppId); setShowAppMenu(false); }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setLaunchpadCtx({ appId: app.id, label: app.label, x: e.clientX, y: e.clientY });
                    }}
                    className="dex-hover-lift"
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '7px 4px', borderRadius: 12, width: '100%',
                      background: 'transparent',
                      border: 'none', cursor: 'pointer',
                      transition: 'transform 0.3s cubic-bezier(0.23,1,0.32,1)',
                    }}
                  >
                    <div style={{
                      color: app.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 42, height: 42,
                      borderRadius: 12,
                      // No glass tile behind the icon — the icon stands on its own.
                      background: 'transparent',
                      border: 'none',
                      boxShadow: isActive ? `0 0 0 1.5px ${app.color}66` : 'none',
                      transition: 'box-shadow 0.25s cubic-bezier(0.23,1,0.32,1), transform 0.25s ease',
                      overflow: 'hidden',
                    }}>
                      {AppIconPngs[app.id] ? <AppIconImg appId={app.id} size={38} /> : icon}
                    </div>
                    <span style={{ fontSize: 10, color: isActive ? '#fff' : 'var(--color-text-secondary)', fontWeight: isActive ? 600 : 400, textAlign: 'center', lineHeight: 1.2, letterSpacing: '-0.01em' }}>{app.label}</span>
                    {isRunning && (
                      <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--color-text-secondary)', marginTop: -3 }} />
                    )}
                  </button>
                );
              })}
            </div>
              );
            })()}
          </div>
        </>
      )}

      {/* Launchpad App Context Menu (Add/Remove from Dock) */}
      {launchpadCtx && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 5005 }} onMouseDown={() => setLaunchpadCtx(null)} />
          <div
            role="menu"
            aria-label={`${launchpadCtx.label} options`}
            onKeyDown={e => {
              if (e.key === 'Escape') setLaunchpadCtx(null);
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const items = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
                const idx = items.indexOf(document.activeElement as HTMLButtonElement);
                const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
                items[next]?.focus();
              }
            }}
            style={{
              position: 'fixed', left: Math.min(launchpadCtx.x, window.innerWidth - 200), top: Math.min(launchpadCtx.y, window.innerHeight - 200),
              zIndex: 5006, minWidth: 180,
              background: 'rgba(30,30,34,0.98)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12, padding: 4,
              boxShadow: '0 12px 40px rgba(0,0,0,0.55), 0 0 0 0.5px rgba(255,255,255,0.04)',
              animation: 'fadeIn 0.12s ease-out',
            } as React.CSSProperties}
          >
            {(() => {
              const { appId, label } = launchpadCtx;
              const pinned = isDockPinned(appId);
              const isPermanent = PERMANENT_PINS.includes(appId);
              const items: { label: string; action: () => void; danger?: boolean }[] = [];
              items.push({ label: `Open ${label}`, action: () => { setCurrentApp(appId as AppId); setShowAppMenu(false); setLaunchpadCtx(null); } });
              if (pinned && !isPermanent) {
                items.push({ label: 'Remove from Dock', action: () => { unpinApp(appId); setLaunchpadCtx(null); } });
              } else if (!pinned) {
                items.push({ label: 'Add to Dock', action: () => { pinApp(appId); setLaunchpadCtx(null); } });
              }
              if (appId !== 'home') {
                items.push({ label: 'Open in Window', action: () => { openAppInWindow(appId as AppId); setShowAppMenu(false); setLaunchpadCtx(null); } });
              }
              return items.map((item, i) => (
                <button
                  key={i}
                  role="menuitem"
                  onClick={item.action}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '7px 14px', fontSize: 13, fontWeight: 400, borderRadius: 8,
                    background: 'transparent', border: 'none',
                    color: item.danger ? 'var(--color-error)' : 'var(--color-text-primary)',
                    cursor: 'pointer', transition: 'background 0.08s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-border-subtle)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {item.label}
                </button>
              ));
            })()}
          </div>
        </>
      )}

      {/* Dock Context Menu (pin/unpin/split) */}
      {dockCtx && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 5005 }} onMouseDown={() => setDockCtx(null)} tabIndex={-1} onKeyDown={e => { if (e.key === 'Escape') setDockCtx(null); }} />
          <style>{`@keyframes ctxMenuIn { from { opacity: 0; transform: translateY(-100%) scale(0.92); } to { opacity: 1; transform: translateY(-100%) scale(1); } }`}</style>
          <div role="menu" aria-label={`${getLabel(dockCtx.appId)} options`} onKeyDown={e => {
            if (e.key === 'Escape') setDockCtx(null);
            // Item 149: Arrow key navigation in context menu
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const items = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
              const idx = items.indexOf(document.activeElement as HTMLButtonElement);
              const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
              items[next]?.focus();
            }
          }} style={{
            position: 'fixed', left: dockCtx.x, top: dockCtx.y - 8,
            transform: 'translateY(-100%)',
            zIndex: 5006, minWidth: 170,
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 12, padding: 4,
            boxShadow: '0 12px 48px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
            animation: 'ctxMenuIn 0.3s cubic-bezier(0.23,1,0.32,1)',
            transformOrigin: 'bottom left',
          }}>
            {(() => {
              const appId = dockCtx.appId;
              const label = getLabel(appId);
              const pinned = isDockPinned(appId);
              const isPermanent = PERMANENT_PINS.includes(appId);
              const dockIndex = dockItems.findIndex((d) => d.id === appId);
              const items: { label: string; action: () => void; danger?: boolean; separator?: boolean }[] = [];
              if (appId !== 'home') {
                items.push({ label: detachedApps.has(appId) ? 'Focus Window' : 'Open in Window', action: () => { openAppInWindow(appId as AppId); setDockCtx(null); } });
              }
              if (appId !== currentApp) {
                items.push({ label: `Split with ${label}`, action: () => { enterSplit(appId as AppId); setDockCtx(null); } });
              }
              if (appId !== 'home' && runningApps.some(a => a.id === appId)) {
                if (detachedApps.has(appId)) {
                  items.push({ label: 'Reattach Window', action: () => { reattachApp(appId as AppId); setDockCtx(null); } });
                  // Tiling options for detached windows
                  items.push({ label: 'Tile Left', action: () => { tileWindow(appId as AppId, 'left'); setDockCtx(null); } });
                  items.push({ label: 'Tile Right', action: () => { tileWindow(appId as AppId, 'right'); setDockCtx(null); } });
                  items.push({ label: 'Maximize', action: () => { tileWindow(appId as AppId, 'maximize'); setDockCtx(null); } });
                } else {
                  items.push({ label: 'Detach Window', action: () => { detachApp(appId as AppId); setDockCtx(null); } });
                  items.push({ label: 'Tile Left', action: () => { tileWindow(appId as AppId, 'left'); setDockCtx(null); } });
                  items.push({ label: 'Tile Right', action: () => { tileWindow(appId as AppId, 'right'); setDockCtx(null); } });
                }
              }
              if (detachedApps.size >= 2) {
                items.push({ label: 'Auto-Tile All Windows', action: () => { autoTileAll(); setDockCtx(null); }, separator: true });
              }
              if (dockIndex > 0) {
                items.push({
                  label: 'Move Left in Dock',
                  action: () => { reorderDockPins(dockIndex, dockIndex - 1); setDockCtx(null); },
                });
              }
              if (dockIndex >= 0 && dockIndex < dockItems.length - 1) {
                items.push({
                  label: 'Move Right in Dock',
                  action: () => { reorderDockPins(dockIndex, dockIndex + 1); setDockCtx(null); },
                });
              }
              if (pinned && !isPermanent) {
                items.push({ label: 'Unpin from Dock', action: () => { unpinApp(appId); setDockCtx(null); } });
              } else if (!pinned) {
                items.push({ label: 'Pin to Dock', action: () => { pinApp(appId); setDockCtx(null); } });
              }
              if (runningApps.some(a => a.id === appId) && appId !== 'home') {
                items.push({ label: `Close ${label}`, action: () => { handleCloseApp(appId); setDockCtx(null); }, danger: true });
              }
              if (runningApps.length > 0) {
                items.push({ label: 'Close All Apps', action: () => { closeAllApps(); setDockCtx(null); }, danger: true });
              }
              // Dock visibility toggle
              const isAlwaysVisible = dockMode === 'always-visible';
              items.push({
                label: isAlwaysVisible ? 'Auto-Hide Dock' : 'Keep Dock Visible',
                action: () => {
                  const { setMode } = useDockPins.getState();
                  if (isAlwaysVisible) {
                    setMode('auto-hide');
                  } else {
                    setMode('always-visible');
                    setTaskbarVisible(true);
                  }
                  setDockCtx(null);
                },
                separator: true,
              });
              return items.map((item, i) => (
                <React.Fragment key={i}>
                  {item.separator && <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '3px 8px' }} />}
                  <button
                    role="menuitem"
                    onClick={item.action}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '7px 14px', fontSize: 13, fontWeight: 400, borderRadius: 8,
                      color: item.danger ? 'var(--color-error)' : 'var(--color-text-primary)',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      transition: 'background 0.25s cubic-bezier(0.23,1,0.32,1)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {item.label}
                  </button>
                </React.Fragment>
              ));
            })()}
          </div>
        </>
      )}



      {/* Achievement unlock toasts -- visible globally */}


      {/* App Switcher HUD -- Ctrl+Tab visual overlay */}
      <AppSwitcher visible={switcherVisible} apps={runningApps} selectedIndex={switcherIndex} />

      {/* App Overview (Mission Control) -- triggered by gesture or keyboard */}
      <AppOverview
        visible={showOverview}
        apps={runningApps.map(a => ({
          id: a.id,
          name: a.name,
          element: contentRef.current?.querySelector(`[data-app-id="${a.id}"]`) as HTMLElement | null,
        }))}
        activeAppId={currentApp}
        onSelectApp={(id) => { setCurrentApp(id as AppId); setShowOverview(false); }}
        onCloseApp={(id) => { if (id !== 'home') handleCloseApp(id); }}
        onDismiss={() => setShowOverview(false)}
      />

      {/* Notification Banners -- stacked top-right */}
      <NotificationBanners
        notifications={bannerNotifications.banners}
        onDismiss={bannerNotifications.dismiss}
      />

      {/* Notification Center slide-in panel */}
      <NotificationCenter
        open={showNotifCenter}
        notifications={bannerNotifications.history}
        onClearAll={bannerNotifications.clearHistory}
        onClose={() => setShowNotifCenter(false)}
      />

      {/* Splash Screen */}
      {splashVisible && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 'var(--z-max)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(165deg, #0a0a0c 0%, #111114 50%, #0a0a0c 100%)',
          animation: splashProgress >= 100 ? 'fadeOut 0.3s ease forwards' : undefined,
        }}>
          <style>{`@keyframes fadeOut { to { opacity: 0; } } @keyframes splashPulse { 0%,100% { opacity: 0.8; } 50% { opacity: 1; } }`}</style>
          <div style={{ marginBottom: 28, animation: 'splashPulse 1.5s ease-in-out infinite' }}>
            <svg width="72" height="72" viewBox="0 0 24 24" fill="none">
              <defs><linearGradient id="sg" x1="0" y1="0" x2="24" y2="24"><stop offset="0%" stopColor="#4a9eff"/><stop offset="100%" stopColor="#a855f7"/></linearGradient></defs>
              <rect x="2" y="2" width="20" height="20" rx="5" stroke="url(#sg)" strokeWidth="1.5" fill="none"/>
              <path d="M8 7l4 5-4 5M13 17h4" stroke="url(#sg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', marginBottom: 24 }}>DEX</div>
          <div style={{ width: 200, height: 3, borderRadius: 2, background: 'var(--color-border-subtle)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, #4a9eff, #a855f7)', width: `${splashProgress}%`, transition: 'width 0.3s ease' }} />
          </div>
        </div>
      )}

      {/* What's New Modal */}
      {showWhatsNew && !splashVisible && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-max)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)' } as React.CSSProperties} onMouseDown={dismissWhatsNew} />
          <div style={{
            ...glassModal,
            position: 'relative', width: 420, maxHeight: '80vh', overflowY: 'auto',
            padding: '28px 24px 20px',
            animation: 'appMenuSlideUp 0.15s cubic-bezier(0.23,1,0.32,1)',
          } as React.CSSProperties}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 4 }}>What's New in DEX 3.0</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 16 }}>Fresh design, new features, smoother experience</div>
            {[
              { icon: 'palette', title: 'New Glass Design', desc: 'Sleek glass-style sidebars and menus that look beautiful on any wallpaper.' },
              { icon: 'zap', title: 'Workflow Automations', desc: 'Create custom shortcuts to automate repetitive tasks with 60+ actions.' },
              { icon: 'image', title: 'Gallery Upgrades', desc: 'Fullscreen slideshow, batch select and export, and faster photo browsing.' },
              { icon: 'music', title: 'Better Music Player', desc: 'Browse by artist, album, or genre. Visualizer, equalizer, and queue management.' },
              { icon: 'folder', title: 'Smart File Manager', desc: 'Color-coded tags, drag-and-drop, Quick Look preview, and saved searches.' },
              { icon: 'calendar', title: 'Tasks & Calendar', desc: 'Due dates, recurring tasks, subtasks, and a calendar view to stay organized.' },
              { icon: 'monitor', title: 'System Monitor', desc: 'See CPU, memory, battery, and running processes in the Power dashboard.' },
              { icon: 'settings', title: 'Faster Performance', desc: 'Optimized for smooth performance on all computers, from low-end to high-end.' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderTop: i > 0 ? '1px solid var(--color-bg-hover)' : 'none' }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}><DexIcon name={item.icon} size={18} /></span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 2 }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{item.desc}</div>
                </div>
              </div>
            ))}
            <button
              onClick={dismissWhatsNew}
              style={{
                width: '100%', marginTop: 16, padding: '10px 0',
                background: 'var(--color-accent, #4a9eff)', color: '#fff',
                border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'opacity 0.2s',
              }}
            >
              Get Started
            </button>
          </div>
        </div>
      )}


    </div>
  );
};

// -- Traffic light button --------------------------------------------------
const trafficBtn = (color: string): React.CSSProperties => ({
  width: 14, height: 14, borderRadius: '50%', background: color,
  border: 'none', cursor: 'pointer', padding: 0, opacity: 0.85,
  transition: 'opacity 0.12s ease', touchAction: 'manipulation',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
});

const navBtnStyle: React.CSSProperties = {
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--color-text-primary)',
  cursor: 'pointer', borderRadius: 6, touchAction: 'manipulation',
  transition: 'color 0.25s cubic-bezier(0.4,0,0.2,1), background 0.15s ease',
};

const winBtnStyle: React.CSSProperties = {
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: 'none', color: 'var(--color-text-primary)', cursor: 'pointer',
  borderRadius: 6, transition: 'color 0.12s ease, background 0.15s ease',
};

export default AppManager;
