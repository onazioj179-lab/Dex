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
import { platform } from '../utils';
import { useRunningApps, APP_DEFINITIONS, readLastSession, clearLastSession } from '../store/runningApps';
import { useRecentFiles } from '../store/useRecentFiles';

import { useAppTransition } from '../utils/motionHooks';
import { useDockPins, PERMANENT_PINS } from '../store/dockPinStore';
import { useUkiStore } from '../store/ukiStore';
import { liquidGlassDock, glassModal, adaptiveShadow } from '../styles/glassMenu';
import { computeDockGeometry, getDockReservedInsets } from '../../shared/shell/dockGeometry';
import { useShellPreferences } from '../store/shellPreferencesStore';
import { spotlightEngine } from '../shell/SpotlightEngine';
import type { SpotlightAction } from '../shell/SpotlightEngine';
import { SpotlightSearch } from '../shell/SpotlightSearch';
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
import { useNotificationCenterStore } from '../store/unifiedSystemsStore';
import { getDockReflectionStyle } from '../shell/WallpaperAccent';
import { initVisualEffects, destroyVisualEffects } from '../shell/VisualEffects';
import StageManager, { STAGE_STRIP_WIDTH } from '../shell/StageManager';
import AppSwitcher from '../shell/AppSwitcher';
import { loadEngagement, saveEngagement, incrementStat, checkAchievements, recordSessionStart, recordAppUsage, type Achievement, type EngagementState } from '../services/engagement';
import { notify } from '../services/notify';
// Permission store is consumed by QuickControls; keep the import side-effect-free.
import { QuickControls } from '../shell/QuickControls';
import { getAppPredictor, schedulePrewarm } from '../services/AppPredictor';
import { idleContinuity } from '../services/IdleContinuity';
import { clampWindowToWorkspace, clampWindowForDrag, fitWindowToWorkspace, getWorkspaceBounds, isSameWindowBounds, cascadeWindow } from '../../shared/shell/windowLayout';
import { scheduleWrite as scheduleWindowManifest, loadManifest as loadWindowManifest, type WindowSnapshot } from '../shell/WindowManifest';
import { savePreset as saveWorkspacePreset, getPreset as getWorkspacePreset } from '../shell/WorkspacePresets';
import { useCreativeSuite, type AssetKind, type CreativeAppId } from '../services/CreativeSuiteBridge';
import { CalmFocusEngine } from '../../shared/phase15/calmFocus';
import { WorkspaceSnapshotStore } from '../../shared/phase15/workspaceSnapshot';
import { computeTabDropIndex, moveTab, sameOrder, type TabCenter } from '../../shared/shell/tabReorder';
import { Z_DROPDOWN_BASE } from '../../shared/zIndex';

// Module-level singletons — one engine per renderer process lifetime.
const _calmEngine = new CalmFocusEngine();
const _wsStore = new WorkspaceSnapshotStore({ maxNamed: 20, maxAuto: 5 });

// Hydrate snapshot store from localStorage on first load.
try {
  const _raw = localStorage.getItem('dex-workspace-snapshots');
  if (_raw) {
    const _hydrated = WorkspaceSnapshotStore.deserialize(_raw);
    for (const s of _hydrated.listNamed()) _wsStore.saveNamed(s);
    for (const s of _hydrated.listAuto()) _wsStore.saveAuto(s);
  }
} catch { /* never block startup */ }

/** Persist workspace store to localStorage (call after mutations). */
function _persistWsStore(): void {
  try { localStorage.setItem('dex-workspace-snapshots', _wsStore.serialize()); } catch { /* ignore */ }
}

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
const Uki = lazyRetry(() => import('../DEXAPPLICATIONS/standalone/Uki'));
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
  | 'videoeditor' | 'imosion' | 'prism' | 'flux' | 'forge' | 'axl' | 'uki'
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

const DOCK_FILE_DROP_TARGETS: Partial<Record<AppId, CreativeAppId>> = {
  videoeditor: 'videoeditor',
  imosion: 'imosion',
  prism: 'prism',
  flux: 'flux',
  forge: 'forge',
  axl: 'axl',
  notes: 'notes',
  rewind: 'rewind',
};

function inferAssetKindFromPath(filePath: string): AssetKind {
  const lower = filePath.toLowerCase();
  if (/\.(wav|mp3|ogg|flac|aiff|m4a|aac|webm)$/.test(lower)) return 'audio';
  if (/\.(mp4|mov|mkv|avi|wmv|webm|m4v|gif)$/.test(lower)) return 'video';
  if (/\.(png|jpg|jpeg|webp|bmp|tiff|tif|svg|heic)$/.test(lower)) return 'image';
  if (/\.(obj|fbx|glb|gltf|stl|blend)$/.test(lower)) return 'model';
  if (/\.(md|txt|rtf|doc|docx|pdf)$/.test(lower)) return 'document';
  return 'clip';
}

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
  uki: Uki,
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

// All apps for Launchpad -- full DEX app surface organized by category.
// Keep aligned with APP_DEFINITIONS in src/renderer/store/runningApps.ts.
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
  { id: 'uki', label: 'uki', color: 'var(--color-accent)' },
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
  height: '100%', background: 'var(--color-bg-base)', gap: 'var(--space-4)',
  animation: 'fadeIn 0.25s var(--ease-out)',
};
const errorBoundaryIcon: React.CSSProperties = {
  width: 52, height: 52, borderRadius: 10,
  background: 'rgba(255,69,58,0.1)', border: '0.5px solid rgba(255,69,58,0.2)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const errorBoundaryTitle: React.CSSProperties = { fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' };
const errorBoundaryMsg: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-muted)', maxWidth: 320, textAlign: 'center', lineHeight: 1.5 };
const errorBoundaryBtn: React.CSSProperties = {
  padding: 'var(--space-2) 22px', background: 'var(--color-accent)', color: '#fff',
  border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500,
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
const loadingContentRow: React.CSSProperties = { flex: 1, display: 'flex', gap: 'var(--space-3)', alignItems: 'center', justifyContent: 'center' };
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignItems: 'center' }}>
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
  const sendAssetToApp = useCreativeSuite(s => s.sendToApp);

  // Dock pinning store
  const { pins: dockPins, pinApp, unpinApp, reorder: reorderDockPins, isPinned: isDockPinned, mode: dockMode, magnificationScale, iconSize: dockIconSize } = useDockPins();
  // Dock magnification (the gaussian hover swell/lift) is HARD-DISABLED per owner
  // direction: the dock must stay perfectly still — never grow, shift, or "move
  // out of place" under the cursor. Forced off here (not read from the store) so
  // every consumer below (mousemove handler, willChange) sees it off regardless
  // of any previously-saved setting.
  const dockMagnification = false;

  // Shell preferences (movable + compact taskbar) — read reactively so edge /
  // preset changes from Settings re-render the dock immediately.
  const dockEdgePref = useShellPreferences((s) => s.dockEdge);
  const dockPresetPref = useShellPreferences((s) => s.dockPreset);

  // Ctrl+K -> CommandPalette (App.tsx). Ctrl+Space -> UKI panel. No legacy unified search overlay.
  const [showAppMenu, setShowAppMenu] = useState(false);
  const showAppMenuRef = useRef(false);
  showAppMenuRef.current = showAppMenu;
  // Shared Spotlight search overlay (the dock Search button opens this). One
  // search surface, used everywhere -- real results, keyboard nav, categories.
  const [showSpotlight, setShowSpotlight] = useState(false);
  const [appMenuSearch, setAppMenuSearch] = useState('');
  const appMenuSearchRef = useRef<HTMLInputElement>(null);
  const [taskbarVisible, setTaskbarVisible] = useState(true);
  // Immersive focus: hide the top bar (the dock already auto-hides) so an open
  // app gets the full DEX frame with zero chrome — "clear the screen to
  // concentrate". Toggled with Ctrl+Shift+F, exited with Escape or the pill.
  // Only meaningful inside an app; navigating Home always shows chrome.
  const [immersive, setImmersive] = useState(false);
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

  // Dock-reserved inset CSS variables are published in an effect lower down,
  // after `anyWindowMaximized` is declared (it is one of the dependencies).

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
      // Auto-snapshot workspace before suspend for crash/resume recovery.
      try {
        const snap = _wsStore.capture('auto-suspend', [], null);
        _wsStore.saveAuto(snap);
        _persistWsStore();
      } catch { /* never block suspend */ }
      window.dispatchEvent(new CustomEvent('dex-system-suspend'));
      try {
        const cfg = (require('../store/useAuthStore') as any).useAuthStore?.getState?.()?.config;
        if (cfg?.lockOnSleep) {
          (require('../store/useAuthStore') as any).useAuthStore?.getState?.()?.lock?.();
        }
      } catch { /* ignore */ }
    };
    const onSystemLock = () => {
      // Auto-snapshot workspace before locking for post-unlock continuity.
      try {
        const snap = _wsStore.capture('auto-lock', [], null);
        _wsStore.saveAuto(snap);
        _persistWsStore();
      } catch { /* never block lock */ }
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

    // Check for crash recovery state — gate toast through calm engine so it
    // never interrupts deep-flow focus unnecessarily (warnings always pass through).
    (window as any).electron?.invoke?.('recovery:savedState').then((state: any) => {
      if (state?.timestamp) {
        const ago = Math.round((Date.now() - state.timestamp) / 60000);
        const decision = _calmEngine.decide('notification');
        if (decision.allow) {
          window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'warning', message: `Previous session recovered (${ago}m ago)` } }));
        }
        // Always persist recovery point in the workspace snapshot store.
        try {
          const snap = _wsStore.capture(`crash-recovery-${state.timestamp}`, [], null, state.timestamp);
          _wsStore.saveAuto(snap);
          _persistWsStore();
        } catch { /* never block */ }
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
  const dockTouchReorderRef = useRef<{ appId: AppId; startX: number; startY: number; dragging: boolean; fromIndex: number; toIndex: number; el: HTMLElement | null } | null>(null);
  // Launchpad context menu (right-click on apps in grid)
  const [launchpadCtx, setLaunchpadCtx] = useState<{ appId: string; label: string; x: number; y: number } | null>(null);

  // -- Shell interaction layers --------------------------------------------
  const [showOverview, setShowOverview] = useState(false);
  const [showNotifCenter, setShowNotifCenter] = useState(false);
  // Transient banner stack only (top-right). History/center is now hub-backed.
  const bannerNotifications = useBannerNotifications();

  // Single, persistent notification center backed by the unified hub
  // (notification-center:* channels -> dex.db). The in-memory banner history is
  // no longer the center's source of truth; this store survives reloads and is
  // grouped + priority-ordered via the shared policy.
  const hubNotifications = useNotificationCenterStore(s => s.notifications);
  const hubUnreadCount = useNotificationCenterStore(s => s.unreadCount);
  const hubLoadNotifications = useNotificationCenterStore(s => s.loadNotifications);
  const hubLoadUnreadCount = useNotificationCenterStore(s => s.loadUnreadCount);
  const hubMarkRead = useNotificationCenterStore(s => s.markRead);
  const hubClearAll = useNotificationCenterStore(s => s.clearAll);
  const hubGetOrdered = useNotificationCenterStore(s => s.getOrdered);

  // Refresh hub state whenever the center opens; keep the badge count warm.
  useEffect(() => { hubLoadUnreadCount(); }, [hubLoadUnreadCount]);
  useEffect(() => { if (showNotifCenter) hubLoadNotifications(); }, [showNotifCenter, hubLoadNotifications]);

  // Map persisted hub records to the BannerNotification shape the existing
  // (DEX Sharp) NotificationCenter renders. Priority-ordered via the store.
  const centerNotifications = useMemo(() => {
    void hubNotifications; // re-derive when the underlying list changes
    return hubGetOrdered().map((n) => ({
      id: String(n.id),
      title: n.title,
      body: n.body || undefined,
      icon: n.icon,
      priority: n.priority,
      source: n.source,
      timestamp: n.timestamp,
      read: n.read !== 0,
    }));
  }, [hubNotifications, hubGetOrdered]);

  // Wire the app-wide 'dex-notification' CustomEvent to the banner system.
  // Dispatchers across the app (shortcuts, workflows, app lifecycle in
  // runningApps) fire this event, but nothing listened — so those banners never
  // appeared. This connects them, mapping the event's {title,body,type,priority}
  // onto a banner (type -> icon).
  const notifyPush = bannerNotifications.push;
  useEffect(() => {
    const ICONS = ['info', 'success', 'warning', 'error'];
    const PRIOS = ['low', 'normal', 'high', 'urgent'];
    const onNotify = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (!d || !d.title) return;
      notifyPush({
        title: String(d.title),
        body: d.body != null ? String(d.body) : undefined,
        icon: ICONS.includes(d.icon) ? d.icon : (ICONS.includes(d.type) ? d.type : 'info'),
        priority: PRIOS.includes(d.priority) ? d.priority : 'normal',
        source: d.source != null ? String(d.source) : undefined,
        actions: Array.isArray(d.actions) ? d.actions : undefined,
      });
    };
    window.addEventListener('dex-notification', onNotify as EventListener);
    return () => window.removeEventListener('dex-notification', onNotify as EventListener);
  }, [notifyPush]);

  // Recovery Level 3: if the previous session ended uncleanly with apps open,
  // offer a one-click workspace restore (last-session journal in runningApps).
  const restoreOfferShownRef = useRef(false);
  useEffect(() => {
    if (restoreOfferShownRef.current) return;
    restoreOfferShownRef.current = true;
    try {
      const last = readLastSession();
      if (!last || last.apps.length === 0) return;
      if (Date.now() - last.timestamp > 24 * 60 * 60 * 1000) { clearLastSession(); return; }
      const apps = last.apps;
      const appsLabel = apps.length === 1 ? apps[0].name : `${apps.length} apps`;
      notifyPush({
        // Offer session restore on BOTH a clean restart (owner brief P2: "reopen
        // workspace, everything returns") and an unclean exit (crash recovery).
        // One-click + dismissible -- a clean restart never force-reopens apps on
        // its own, so there are still no surprise "ghost apps".
        title: last.clean ? 'Restore your last workspace?' : 'Restore your workspace?',
        body: last.clean
          ? `Pick up where you left off — ${appsLabel} were open.`
          : `Your last session ended unexpectedly with ${appsLabel} open.`,
        icon: last.clean ? 'info' : 'warning',
        priority: last.clean ? 'normal' : 'high',
        duration: 15000,
        source: 'recovery',
        actions: [{
          label: 'Restore',
          onClick: () => {
            const launch = useRunningApps.getState().launchApp;
            for (const a of apps) launch(a);
            // Also restore each window's last geometry/z/minimized from the
            // manifest (crash-recovery ONLY -- a clean restart still starts fresh,
            // by design). Bounds are clamped to the CURRENT work area in case the
            // viewport changed since the crash.
            try {
              const manifest = loadWindowManifest();
              if (manifest && manifest.windows.length) {
                const ws = getShellWorkspace(0);
                const mins: string[] = [];
                requestAnimationFrame(() => {
                  setDetachedApps(prev => {
                    const next = new Map(prev);
                    for (const w of manifest.windows) {
                      if (!apps.some(a => a.id === w.appId)) continue;
                      const c = clampWindowToWorkspace({ x: w.x, y: w.y, w: w.width, h: w.height }, ws);
                      next.set(w.appId, { ...c, z: w.z });
                      if (w.minimized) mins.push(w.appId);
                    }
                    return next;
                  });
                  if (mins.length) setMinimizedApps(prev => { const n = new Set(prev); mins.forEach(id => n.add(id)); return n; });
                });
              }
            } catch { /* restore is best-effort; the apps still launched */ }
          },
        }],
      });
      clearLastSession();
    } catch { /* never block boot */ }
  }, [notifyPush]);

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
  const [showMinimizedList, setShowMinimizedList] = useState(false);
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

  // Close minimized-list popover on outside click and Escape
  const minimizedListRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!showMinimizedList) return;
    const onPointer = (e: PointerEvent) => {
      if (!minimizedListRef.current) return;
      if (minimizedListRef.current.contains(e.target as Node)) return;
      setShowMinimizedList(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowMinimizedList(false);
        e.stopPropagation();
      }
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    // Focus the first menu item once the popover renders
    queueMicrotask(() => {
      const first = minimizedListRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]');
      first?.focus();
    });
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [showMinimizedList]);

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

  const getShellWorkspace = useCallback((padding = 0) => {
    // OS-grade work area. Detached windows are positioned RELATIVE to the content
    // surface (it is their containing block via `contain: layout`), and that
    // surface already sits below the chrome (title bar + tab bar) and above a
    // pinned dock -- its flexed height and reserved edge margin do exactly that.
    // So the work area is simply the content surface's own box, read via
    // clientWidth/clientHeight which -- unlike getBoundingClientRect -- are immune
    // to the app-transition transform that previously baked a stale offset into
    // stored window bounds. Only the Stage Manager strip needs an explicit reserve.
    const el = contentRef.current;
    const w = el ? el.clientWidth : window.innerWidth;
    const h = el ? el.clientHeight : window.innerHeight;
    return getWorkspaceBounds(
      { width: w, height: h },
      {
        topReserve: 0,
        dockReserve: 0,
        leftReserve: stageOffset,
        padding,
        minWidth: 320,
        minHeight: 260,
      },
    );
  }, [stageOffset, showAppTabBar, runningApps.length, dockMode, dockEdgePref, dockPresetPref]);

  // Maximizing means "fill the work area" -- below the chrome, above the pinned
  // dock -- not "cover the whole viewport". This is what stops a maximized
  // creative app (Prism/Flux/Forge/Imosion/Axl) from spilling its bottom toolbar
  // under the dock and off the screen edge.
  const getMaximizedWindowBounds = useCallback(() => {
    const ws = getShellWorkspace(0);
    return { x: ws.x, y: ws.y, w: ws.w, h: ws.h };
  }, [getShellWorkspace]);

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

  // -- Engagement / achievements: one central apply -> check -> REWARD path -
  // Every stat change (the dex-stat-bump bus, session start, app usage) runs
  // through applyEngagement. The previous handler dropped
  // checkAchievements().newUnlocks, so achievements unlocked silently with no
  // reward -- and the reward moment is the entire point. Newly satisfied
  // achievements now always surface on the unified notification path (banner +
  // Notification Center), with a one-tap "View" into the Trophies app.
  const rewardUnlocks = useCallback((unlocked: Achievement[]) => {
    if (!unlocked.length) return;
    const headline = unlocked.reduce((best, a) => (a.points > best.points ? a : best), unlocked[0]);
    const totalPts = unlocked.reduce((sum, a) => sum + a.points, 0);
    const single = unlocked.length === 1;
    const openTrophies = () => window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appId: 'achievements' } }));
    void notify({
      title: single ? `Achievement unlocked: ${headline.title}` : `${unlocked.length} achievements unlocked!`,
      body: single
        ? `${headline.description}  ·  +${headline.points} pts`
        : `Including "${headline.title}"  ·  +${totalPts} pts total`,
      icon: 'success',
      priority: 'normal',
      source: 'Achievements',
      action: { target: 'achievements', label: 'View' },
      actions: [{ label: 'View', onClick: openTrophies }],
    });
  }, []);

  const applyEngagement = useCallback((mutate: (s: EngagementState) => EngagementState) => {
    try {
      const { state, newUnlocks } = checkAchievements(mutate(loadEngagement()));
      saveEngagement(state);
      if (newUnlocks.length) rewardUnlocks(newUnlocks);
    } catch (err) { console.warn('[DEX] engagement apply error', err); }
  }, [rewardUnlocks]);

  // Global stat-bump bus -- sourced from every app's real user actions.
  useEffect(() => {
    const handler = (e: CustomEvent<{ key: string; amount?: number }>) => {
      applyEngagement(s => incrementStat(s, e.detail.key as Parameters<typeof incrementStat>[1], e.detail.amount ?? 1));
    };
    window.addEventListener('dex-stat-bump', handler as EventListener);
    return () => window.removeEventListener('dex-stat-bump', handler as EventListener);
  }, [applyEngagement]);

  // Session start: record ONCE per renderer session. recordSessionStart had no
  // caller, so streaks, session counts and time-of-day stats never advanced and
  // that whole achievement category was unreachable. This revives it.
  const sessionRecordedRef = useRef(false);
  useEffect(() => {
    if (sessionRecordedRef.current) return;
    sessionRecordedRef.current = true;
    applyEngagement(recordSessionStart);
  }, [applyEngagement]);

  // App usage: record centrally when a non-home app comes to the foreground, so
  // breadth ("used N apps") + per-app depth advance for EVERY app -- not just the
  // handful that self-recorded. The creative apps (videoeditor/prism/flux/axl)
  // still call recordAppUsage on their own mount today; skip them here to avoid
  // double counting until that per-app call is folded into this central path.
  useEffect(() => {
    if (!currentAppId || currentAppId === 'home') return;
    if (['videoeditor', 'prism', 'flux', 'axl'].includes(currentAppId)) return;
    applyEngagement(s => recordAppUsage(s, currentAppId));
  }, [currentAppId, applyEngagement]);

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

  // -- CalmFocusEngine: record input activity so the engine can decide whether
  //    to suppress non-essential interruptions (hover glows, tips, badges)
  //    during deep-work flow states. This single effect is the only place we
  //    feed the module-level engine from real DOM events. --------------------
  useEffect(() => {
    const onActivity = () => _calmEngine.recordActivity();
    document.addEventListener('mousedown', onActivity, { passive: true, capture: true });
    document.addEventListener('keydown', onActivity, { passive: true, capture: true });
    document.addEventListener('pointerdown', onActivity, { passive: true, capture: true });
    return () => {
      document.removeEventListener('mousedown', onActivity, true);
      document.removeEventListener('keydown', onActivity, true);
      document.removeEventListener('pointerdown', onActivity, true);
    };
  }, []);

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

  // True while a FULLSCREEN app is in front -- the creative apps that open
  // maximized (def.maximized). On the desktop and over windowed apps the dock is
  // pinned and reserves space; in a fullscreen app it hides so the app fills
  // everything (reveal it at the bottom edge / Show Dock handle). "Lock the dock
  // once the app opens, lift it up when needed."
  const inFullscreenApp = useMemo(
    () => currentAppId !== 'home' && !!APP_WINDOW_SIZES[currentAppId as string]?.maximized,
    [currentAppId],
  );

  // -- Publish dock-reserved insets as CSS variables so the inline app surface
  //    and floating windows size their bounds without ever clipping under the
  //    dock. Reserve only when the dock is pinned -- on the desktop / over
  //    windowed apps, never in a fullscreen app (it hides there). Keyed to
  //    dockMode + inFullscreenApp (stable), NOT taskbarVisible (which flickers
  //    with hover and collapsed the insets to 0 mid-session). --
  useEffect(() => {
    // New floating dock reserves NO layout space -- it floats above content and
    // is dragged out of the way as needed, so windows fill the whole work area.
    const dockPinned = false;
    const insets = getDockReservedInsets(dockEdgePref, dockPresetPref, dockPinned);
    const root = document.documentElement;
    root.style.setProperty('--dex-reserved-top', `${insets.top}px`);
    root.style.setProperty('--dex-reserved-right', `${insets.right}px`);
    root.style.setProperty('--dex-reserved-bottom', `${insets.bottom}px`);
    root.style.setProperty('--dex-reserved-left', `${insets.left}px`);
  }, [dockEdgePref, dockPresetPref, dockMode, inFullscreenApp]);

  // When the dock hides for a fullscreen app (or returns on the desktop), the
  // work area changes -- re-fit maximized creative windows to the CURRENT work
  // area so they fill the freed space instead of leaving the old reserved gap.
  useEffect(() => {
    const maxB = getMaximizedWindowBounds();
    setDetachedApps(prev => {
      let changed = false;
      const next = new Map(prev);
      next.forEach((bounds, appId) => {
        if (CREATIVE_APPS.has(appId) && !isSameWindowBounds(bounds, maxB, 1)) {
          next.set(appId, { ...maxB, z: bounds.z });
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inFullscreenApp]);

  // Helper: check if any dropdown/menu is currently open (used by dock auto-hide)
  const isAnyMenuOpen = useCallback((): boolean => {
    return !!document.querySelector('[role="menu"], [role="listbox"], .dropdown:not([hidden]), .context-menu:not([hidden]), [data-state="open"]');
  }, []);

  // Auto-hide dock: show on bottom hover, hide after leaving
  // When any window is maximized, dock hides immediately
  const showDock = useCallback(() => {
    // Always able to reveal -- the dock hides in fullscreen apps, so a deliberate
    // edge-dwell / Show Dock handle must be able to bring it back.
    if (dockHideTimerRef.current) { clearTimeout(dockHideTimerRef.current); dockHideTimerRef.current = null; }
    setTaskbarVisible(true);
  }, []);

  // -- New floating dock: always visible, drag-to-place anywhere --------------
  // Replaces the old edge-snap + auto-hide + hover-intent model. The dock is a
  // small pill that floats ABOVE everything (incl. maximized apps), reserves no
  // layout space, and can be grabbed by its blank area and dropped anywhere.
  // Position persists in localStorage; default (dockPos === null) is bottom-
  // centre. Ctrl+Shift+D re-summons it to the default spot.
  const [dockPos, setDockPos] = useState<{ x: number; y: number } | null>(() => {
    try { const r = localStorage.getItem('dex-dock-free-pos'); return r ? JSON.parse(r) : null; } catch { return null; }
  });
  const dockDragRef = useRef<{ pointerId: number; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const handleDockDragStart = useCallback((e: React.PointerEvent) => {
    // Buttons / inputs / open menus keep working -- only the blank pill drags.
    if ((e.target as HTMLElement).closest('button, input, a, [role="menu"], [role="listbox"]')) return;
    const wrap = dockRef.current?.parentElement as HTMLElement | null;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    try { handle.setPointerCapture(e.pointerId); } catch { /* capture unavailable */ }
    handle.style.cursor = 'grabbing';
    dockDragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
  }, []);
  const handleDockDragMove = useCallback((e: React.PointerEvent) => {
    const d = dockDragRef.current;
    if (!d) return;
    const pill = dockRef.current as HTMLElement | null;
    const pw = pill ? pill.offsetWidth : 200;
    const ph = pill ? pill.offsetHeight : 48;
    const nx = Math.max(4, Math.min(window.innerWidth - pw - 4, d.origX + (e.clientX - d.startX)));
    const ny = Math.max(4, Math.min(window.innerHeight - ph - 4, d.origY + (e.clientY - d.startY)));
    setDockPos({ x: nx, y: ny });
  }, []);
  const handleDockDragEnd = useCallback((e: React.PointerEvent) => {
    const d = dockDragRef.current;
    if (!d) return;
    dockDragRef.current = null;
    const handle = e.currentTarget as HTMLElement;
    try { handle.releasePointerCapture(d.pointerId); } catch { /* already released */ }
    handle.style.cursor = 'grab';
    setDockPos(p => { try { if (p) localStorage.setItem('dex-dock-free-pos', JSON.stringify(p)); } catch { /* quota */ } return p; });
  }, []);

  // Hover-intent gate for bottom trigger zone. Requires cursor to dwell ~280ms
  // with average velocity below 0.35 px/ms before revealing the dock. The longer,
  // stricter gate keeps the dock from popping up while the user is *working* near
  // the bottom of an app (a brief pause on a bottom-edge control/scrollbar no
  // longer triggers it) — only a deliberate move-to-edge-and-rest reveals it.
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
    }, 280);
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
    if (v > 0.35) {
      clearTimeout(dockIntentTimerRef.current);
      dockIntentTimerRef.current = setTimeout(() => {
        dockIntentTimerRef.current = null;
        showDock();
      }, 280);
    }
  }, [showDock]);
  const scheduleDockHide = useCallback(() => {
    // Pinned on the desktop / over windowed apps; allowed to hide in a fullscreen
    // app OR whenever an app is maximized (PiP reveal-on-hover, then re-hide).
    if (dockMode === 'always-visible' && !inFullscreenApp && !anyWindowMaximized) return;
    if (dockHideTimerRef.current) clearTimeout(dockHideTimerRef.current);
    // Delay before hiding allows user to return and see smooth transition
    dockHideTimerRef.current = setTimeout(() => {
      if (showAppMenuRef.current) return;
      // Anchored persistence: never hide while the user is actively dragging a
      // dock icon (touch reorder in progress) — the dock stays put while in use.
      if (dockTouchReorderRef.current?.dragging) return;
      // Don't hide if any menu/dropdown is open in any app
      if (isAnyMenuOpen()) return;
      // Don't hide if a menu just closed (200ms grace period)
      if (Date.now() - lastMenuCloseRef.current < 200) return;
      setTaskbarVisible(false);
    }, 450); // 450ms — gentle delay so a brief overshoot does not hide the dock
  }, [dockMode, inFullscreenApp, anyWindowMaximized, isAnyMenuOpen]);

  // Dock visibility policy: pinned (shown) on the Home desktop and over windowed
  // apps; the moment a FULLSCREEN app comes to the front it tucks away so the app
  // owns the whole screen (reveal at the bottom edge / Show Dock handle). Other
  // dock modes still hide on maximize.
  useEffect(() => {
    // PiP-style: the moment an app is maximized -- a fullscreen creative app OR
    // any floating window blown up to fill the screen -- the dock tucks away so
    // the app owns the whole screen. Reveal it by dwelling at the bottom edge /
    // the Show Dock handle. Maximize wins over the pinned "always-visible" mode;
    // otherwise the dock stays pinned on the desktop and over windowed apps.
    if (inFullscreenApp || anyWindowMaximized) {
      setTaskbarVisible(false);
    } else if (dockMode === 'always-visible') {
      setTaskbarVisible(true);
    }
  }, [dockMode, anyWindowMaximized, inFullscreenApp]);

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
    if (dockMode === 'always-visible' && !inFullscreenApp && !anyWindowMaximized) return;
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
  }, [taskbarVisible, dockMode, anyWindowMaximized, inFullscreenApp, scheduleDockHide]);

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
    let clockIntervalId: ReturnType<typeof setInterval> | undefined;
    const alignTimeoutId = setTimeout(() => {
      updateClock();
      clockIntervalId = setInterval(updateClock, 60_000);
    }, msToNextMinute);
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
      clearTimeout(alignTimeoutId);
      if (clockIntervalId) clearInterval(clockIntervalId);
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

  // Persist the live floating-window layout (geometry + z-order + minimized) to
  // the window manifest. The infra existed but scheduleWrite was NEVER called, so
  // the manifest stayed empty and crash-recovery / "restore previous session" had
  // no geometry to work from. Debounced inside scheduleWrite; App.tsx flushes it
  // synchronously on beforeunload.
  useEffect(() => {
    const snaps: WindowSnapshot[] = [];
    detachedApps.forEach((b, appId) => {
      snaps.push({
        appId,
        x: Math.round(b.x), y: Math.round(b.y),
        width: Math.round(b.w), height: Math.round(b.h),
        z: b.z,
        minimized: minimizedApps.has(appId),
        focused: focusedFloatingAppId === appId,
      });
    });
    // Don't persist an EMPTY layout: on a fresh boot detachedApps starts empty, and
    // an empty write would wipe the previous session's geometry BEFORE the restore
    // offer can read it. The journal gates what actually restores, so keeping the
    // last non-empty manifest is safe.
    if (snaps.length === 0) return;
    scheduleWindowManifest(snaps, stageManagerOn ? 'stage' : undefined);
  }, [detachedApps, minimizedApps, focusedFloatingAppId, stageManagerOn]);

  // -- Workspace presets ("workspace memory") --------------------------------
  // Save the current floating-window layout under a name, and restore a saved
  // one instantly. Reuses the manifest geometry snapshot and the same
  // launch+clamp restore path as crash recovery. Driven by CustomEvents so any
  // UI (menu / command palette / overview) can trigger it without prop-drilling.
  useEffect(() => {
    const onSave = (e: Event) => {
      const name = (e as CustomEvent).detail?.name as string | undefined;
      if (!name) return;
      const snaps: WindowSnapshot[] = [];
      detachedApps.forEach((b, appId) => {
        snaps.push({
          appId, x: Math.round(b.x), y: Math.round(b.y),
          width: Math.round(b.w), height: Math.round(b.h), z: b.z,
          minimized: minimizedApps.has(appId), focused: focusedFloatingAppId === appId,
        });
      });
      const preset = saveWorkspacePreset(name, snaps, stageManagerOn ? 'stage' : undefined);
      window.dispatchEvent(new CustomEvent('dex-workspace-presets-changed'));
      void notify({
        title: 'Workspace saved',
        body: `"${preset.name}" — ${snaps.length} window${snaps.length === 1 ? '' : 's'}`,
        source: 'workspace',
      });
    };
    const onRestore = (e: Event) => {
      const id = (e as CustomEvent).detail?.id as string | undefined;
      if (!id) return;
      const preset = getWorkspacePreset(id);
      if (!preset || !preset.windows.length) return;
      const launch = useRunningApps.getState().launchApp;
      for (const w of preset.windows) {
        const def = APP_DEFINITIONS[w.appId as AppId];
        if (def) launch({ id: w.appId, name: def.name, icon: def.icon || w.appId, color: def.color });
      }
      const ws = getShellWorkspace(0);
      const mins: string[] = [];
      requestAnimationFrame(() => {
        setDetachedApps(prev => {
          const next = new Map(prev);
          for (const w of preset.windows) {
            const c = clampWindowToWorkspace({ x: w.x, y: w.y, w: w.width, h: w.height }, ws);
            next.set(w.appId, { ...c, z: w.z });
            if (w.minimized) mins.push(w.appId);
          }
          return next;
        });
        if (mins.length) setMinimizedApps(prev => { const n = new Set(prev); mins.forEach(id => n.add(id)); return n; });
      });
      void notify({ title: 'Workspace restored', body: `"${preset.name}"`, source: 'workspace' });
    };
    // Apply a built-in starter workspace: open each app as a floating window via
    // the proven `dex-open-in-window` path (launch + detach), then let the
    // min-size-aware auto-arrange tile them — no saved geometry, so the layout
    // fits whatever display it lands on.
    const onApplyTemplate = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const apps = (detail.apps as string[] | undefined) || [];
      const wantUki = !!detail.uki;
      if (!apps.length && !wantUki) return;
      let opened = 0;
      for (const appId of apps) {
        if (!APP_DEFINITIONS[appId as AppId]) continue;
        window.dispatchEvent(new CustomEvent('dex-open-in-window', { detail: { appId } }));
        opened++;
      }
      // UKI is a global overlay assistant, not a tiled window — summon it (only
      // if not already open, so we never toggle it shut).
      if (wantUki) {
        try { if (!useUkiStore.getState().showPanel) useUkiStore.getState().togglePanel(); } catch { /* store not ready */ }
      }
      // Each open detaches on the next frame; give them a beat, then tile.
      setTimeout(() => window.dispatchEvent(new CustomEvent('dex-arrange-windows')), 200);
      void notify({ title: 'Workspace opened', body: `${opened} app${opened === 1 ? '' : 's'} arranged${wantUki ? ' · UKI' : ''}`, source: 'workspace' });
    };
    window.addEventListener('dex-workspace-save', onSave);
    window.addEventListener('dex-workspace-restore', onRestore);
    window.addEventListener('dex-workspace-apply-template', onApplyTemplate);
    return () => {
      window.removeEventListener('dex-workspace-save', onSave);
      window.removeEventListener('dex-workspace-restore', onRestore);
      window.removeEventListener('dex-workspace-apply-template', onApplyTemplate);
    };
  }, [detachedApps, minimizedApps, focusedFloatingAppId, stageManagerOn, getShellWorkspace]);

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
  type TilePosition = 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'top' | 'bottom' | 'maximize' | 'left-third' | 'center-third' | 'right-third';
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
      'left-third':   { x: LEFT + PAD, y: TOP + PAD, w: Math.floor((W - PAD * 4) / 3), h: usableH - PAD * 2 },
      'center-third': { x: LEFT + PAD * 2 + Math.floor((W - PAD * 4) / 3), y: TOP + PAD, w: Math.floor((W - PAD * 4) / 3), h: usableH - PAD * 2 },
      'right-third':  { x: LEFT + PAD * 3 + Math.floor((W - PAD * 4) / 3) * 2, y: TOP + PAD, w: Math.floor((W - PAD * 4) / 3), h: usableH - PAD * 2 },
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
        'left-third':   { x: LEFT + PAD, y: TOP + PAD, w: thirdW, h: usableH - PAD * 2 },
        'center-third': { x: LEFT + PAD * 2 + thirdW, y: TOP + PAD, w: thirdW, h: usableH - PAD * 2 },
        'right-third':  { x: LEFT + PAD * 3 + thirdW * 2, y: TOP + PAD, w: thirdW, h: usableH - PAD * 2 },
      };

      // Min-size-aware columns: never use more columns than the work area can
      // hold at a usable width (560px) — otherwise windows that refuse to shrink
      // below their min-width overlap. When the predefined layout needs more
      // columns than fit, fall back to a capped grid (down to a vertical stack).
      const MIN_TILE_W = 560;
      const maxCols = Math.max(1, Math.floor((W - PAD) / (MIN_TILE_W + PAD)));
      const wantCols = count === 1 ? 1 : count <= 5 ? 2 : 3;
      if (count >= 2 && maxCols < wantCols) {
        const cols = Math.min(maxCols, count);
        const rows = Math.ceil(count / cols);
        const cellW = Math.floor((W - PAD * (cols + 1)) / cols);
        const cellH = Math.floor((usableH - PAD * (rows + 1)) / rows);
        ids.slice(0, count).forEach((id, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const z = nextDetachZ();
          const b = next.get(id);
          if (b) next.set(id, {
            x: LEFT + PAD * (col + 1) + cellW * col,
            y: TOP + PAD * (row + 1) + cellH * row,
            w: cellW, h: cellH, z,
          });
        });
        return next;
      }

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

  // Dynamic multi-split layouts (DEX 5.5 maturity initiative): arrange the open
  // floating windows into full-height columns whose widths follow the given
  // ratios — 50/50 = [1,1], 70/30 = [0.7,0.3], 60/20/20 = [0.6,0.2,0.2]. Uses as
  // many columns as there are windows (capped to the ratio count); extra windows
  // are left untouched. The user is choosing the ratio, so we honor it (a column
  // is floored at 220px so a tiny screen never produces a zero-width pane).
  const applySplitRatio = useCallback((ratios: number[]) => {
    const ids = Array.from(detachedApps.keys());
    if (ids.length === 0 || ratios.length === 0) return;
    const workspace = getShellWorkspace(0);
    const PAD = 6;
    const n = Math.min(ids.length, ratios.length);
    const used = ratios.slice(0, n);
    const sum = used.reduce((a, b) => a + b, 0) || 1;
    const avail = workspace.w - PAD * (n + 1);
    // Respect each window's real min-width (browser = 720, etc.) so a narrow
    // ratio column never clips/overlaps. If the windows can't even sit side by
    // side at their mins, a column split is impossible — fall back to the
    // min-size-aware tiler and say so.
    const mins = ids.slice(0, n).map(id => (APP_WINDOW_MIN_SIZES[id]?.w ?? 360));
    if (mins.reduce((a, b) => a + b, 0) > avail) {
      autoTileAll();
      void notify({ title: 'Tiled instead', body: 'Not enough width for that split', source: 'workspace' });
      return;
    }
    // Ratio width per column, floored at its min; trim any overflow from the
    // columns that still have slack above their min (so totals fit exactly).
    const widths = used.map((r, i) => Math.max(mins[i], Math.floor(avail * (r / sum))));
    let overflow = widths.reduce((a, b) => a + b, 0) - avail;
    while (overflow > 0) {
      const slack = widths.map((w, i) => (w > mins[i] ? i : -1)).filter(i => i >= 0);
      if (!slack.length) break;
      const per = Math.ceil(overflow / slack.length);
      for (const i of slack) {
        const take = Math.min(per, widths[i] - mins[i], overflow);
        widths[i] -= take; overflow -= take;
        if (overflow <= 0) break;
      }
    }
    setDetachedApps(prev => {
      const next = new Map(prev);
      let x = workspace.x + PAD;
      for (let i = 0; i < n; i++) {
        const id = ids[i];
        const b = next.get(id);
        if (b) next.set(id, { x, y: workspace.y + PAD, w: widths[i], h: workspace.h - PAD * 2, z: nextDetachZ() });
        x += widths[i] + PAD;
      }
      return next;
    });
  }, [detachedApps, getShellWorkspace, autoTileAll]);

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

  // Surface the existing Auto-Tile-All (dock context menu) to any UI — the
  // Command Palette "Arrange Windows" command dispatches this event. Reuses the
  // proven predefined-layout tiler rather than a separate grid implementation.
  useEffect(() => {
    const onArrange = () => autoTileAll();
    const onSplit = (e: Event) => {
      const ratios = (e as CustomEvent).detail?.ratios as number[] | undefined;
      if (Array.isArray(ratios) && ratios.length) applySplitRatio(ratios);
    };
    window.addEventListener('dex-arrange-windows', onArrange);
    window.addEventListener('dex-split-layout', onSplit);
    return () => {
      window.removeEventListener('dex-arrange-windows', onArrange);
      window.removeEventListener('dex-split-layout', onSplit);
    };
  }, [autoTileAll, applySplitRatio]);

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
      // Escape leaves immersive focus first, before any app-level Escape handling.
      if (e.key === 'Escape' && immersive) { e.preventDefault(); setImmersive(false); return; }
      // Ctrl+\ -- toggle immersive focus (hide chrome) while inside an app.
      // (Ctrl+Shift+F is taken by the global search overlay; \ avoids that clash.)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === '\\') {
        e.preventDefault();
        if (currentAppId !== 'home') setImmersive(v => !v); else setImmersive(false);
        return;
      }
      // Ctrl+Shift+W -- close all apps
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'W') { e.preventDefault(); handleCloseAllApps(); return; }
      // Ctrl+Shift+D -- re-summon the floating dock to its default spot (handy if
      // it was dragged into a corner / off where you can see it).
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        try { localStorage.removeItem('dex-dock-free-pos'); } catch { /* noop */ }
        setDockPos(null);
        return;
      }
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

  // DEX command bus: any surface (terminal `dex <cmd>`, palette, UKI) can run an
  // ACTION command by dispatching a `dex-command` event; this routes it to the
  // SAME handlers the keyboard uses, so action behaviour lives in one place.
  // Ref-based (like keyHandlerRef) to read live state without re-registering.
  const dexCmdHandlerRef = useRef<(action: string) => void>(() => {});
  useEffect(() => {
    dexCmdHandlerRef.current = (action: string) => {
      const focusedApp = focusedFloatingAppId || (detachedApps.has(currentAppId) ? currentAppId : null);
      switch (action) {
        case 'uki': try { useUkiStore.getState().togglePanel(); } catch { /* store not ready */ } break;
        case 'closeApp': if (currentAppId !== 'home') { handleCloseApp(currentAppId); setCurrentApp('home'); } break;
        case 'maximize': if (focusedApp) tileWindow(focusedApp as AppId, 'maximize'); break;
        case 'tileLeft': if (focusedApp) tileWindow(focusedApp as AppId, 'left'); break;
        case 'tileRight': if (focusedApp) tileWindow(focusedApp as AppId, 'right'); break;
        case 'splitScreen': if (splitMode !== 'off') { exitSplit(); } else { setShowAppMenu(true); } break;
        case 'arrangeWindows': window.dispatchEvent(new CustomEvent('dex-arrange-windows')); break;
        case 'overview': setShowOverview(p => !p); break;
        case 'navBack': goBack(); break;
        case 'navForward': goForward(); break;
        default: break; // spotlight / commandPalette / compact / lock have their own triggers
      }
    };
  });
  useEffect(() => {
    const onDexCommand = (e: Event) => {
      const action = (e as CustomEvent<{ action?: string }>).detail?.action;
      if (typeof action === 'string') dexCmdHandlerRef.current(action);
    };
    window.addEventListener('dex-command', onDexCommand);
    return () => window.removeEventListener('dex-command', onDexCommand);
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
    // Compact / mini always-on-top mode — discoverable in Spotlight.
    actions.push({
      id: 'toggle-compact-mode',
      label: 'Compact Mode (Mini Window)',
      keywords: ['compact', 'mini', 'minimize', 'always on top', 'pip', 'pin', 'corner', 'small window', 'float'],
      icon: 'minimize-2',
      action: () => { void import('../shell/MiniShell').then(m => m.useCompactMode.getState().enter()); },
    });
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
              backdropFilter: useGlass ? 'var(--blur-xl) saturate(160%)' : undefined,
              WebkitBackdropFilter: useGlass ? 'var(--blur-xl) saturate(160%)' : undefined,
              border: isMaximized ? 'none' : '1px solid rgba(255,255,255,0.10)',
              ...adaptiveShadow(isMaximized ? 'none' : '0 20px 60px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.35), inset 0 0.5px 0 rgba(255,255,255,0.08)'),
              contain: 'layout style paint',
              willChange: 'auto',
              transition: 'box-shadow 0.2s ease',
            }}
            className="dex-app-opening"
            onPointerDown={() => { if (focusedFloatingAppId !== appId) bringToFront(appId); }}
          >
            {/* Floating title bar -- ALWAYS rendered, even when maximized, so the
                close / minimize / restore controls are never hidden, clipped, or
                stranded behind shell chrome. This is the window's permanent safe
                zone. Dragging the bar while maximized restores the window and
                continues the drag in one motion (see the pointer handler below);
                double-click toggles maximize / restore. */}
            <div
              style={{
                height: 36, display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                padding: '0 var(--space-3)', cursor: 'grab', userSelect: 'none',
                background: useGlass ? 'rgba(28,28,32,0.55)' : 'var(--color-bg-elevated, #1C1C20)',
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
                  <div style={{ width: 22, height: 22, borderRadius: 4, background: AppIconPngs[appId] ? 'transparent' : appColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                    {AppIconPngs[appId]
                      ? <AppIconImg appId={appId} size={22} />
                      : <span style={{ color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icons[appId] || <DexIcon name={APP_DEFINITIONS[appId]?.icon || appId} size={16} color="#fff" />}</span>}
                  </div>
                );
              })()}
              {/* Traffic light controls (left side, macOS style) */}
              {windowControls === 'traffic' && (
                <div className="traffic-light-group" style={{ display: 'flex', gap: 6, marginRight: 4, alignItems: 'center' }}>
                  <button onClick={() => handleCloseApp(appId)} aria-label={`Close ${getLabel(appId)}`} style={trafficBtn('#ff5f57')}>
                    <svg className="tl-glyph" width="6" height="6" viewBox="0 0 8 8" style={{ color: 'rgba(0,0,0,0.55)' }}><path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/></svg>
                  </button>
                  <button onClick={() => minimizeFloatingApp(appId)} aria-label={`Minimize ${getLabel(appId)}`} style={trafficBtn('#febc2e')}>
                    <svg className="tl-glyph" width="6" height="6" viewBox="0 0 8 8" style={{ color: 'rgba(0,0,0,0.55)' }}><path d="M1 4H7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/></svg>
                  </button>
                  <button onClick={() => tileWindow(appId, 'maximize')} aria-label={isMaximized ? `Restore ${getLabel(appId)}` : `Maximize ${getLabel(appId)}`} style={trafficBtn('#28c840')}>
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
                      background: 'transparent', border: 'none', borderRadius: 4,
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
                      title={isMaximized ? 'Restore' : 'Snap Layout'}
                      aria-label={isMaximized ? `Restore ${getLabel(appId)}` : `Maximize ${getLabel(appId)}`}
                      style={{
                        width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'transparent', border: 'none', borderRadius: 4,
                        color: 'var(--color-text-primary)', cursor: 'pointer', transition: 'background 0.15s ease, color 0.15s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-border)'; e.currentTarget.style.color = '#fff'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
                    >
                      {isMaximized ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="8" y="3" width="13" height="13" rx="2"/>
                          <path d="M16 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3"/>
                        </svg>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <rect x="4" y="4" width="16" height="16" rx="2"/>
                        </svg>
                      )}
                    </button>
                    {/* Snap layout grid popup */}
                    {snapLayoutApp === appId && (
                      <div style={{
                        position: 'absolute', top: 28, right: -16, zIndex: 'var(--z-overlay)' as unknown as number,
                        background: 'var(--color-bg-elevated)',
                        border: '1px solid var(--color-border)', borderRadius: 10,
                        padding: '10px 10px var(--space-2)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 5,
                        boxShadow: 'var(--pg-shadow-context), inset 0 0.5px 0 var(--color-border-subtle)',
                        width: 'min(240px, calc(100vw - 48px))',
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
                          { pos: 'left-third' as const, label: '1/3 L', svg: <><rect x="2" y="2" width="6" height="20" rx="1.5" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.5"/><rect x="9" y="2" width="6" height="20" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.15"/><rect x="16" y="2" width="6" height="20" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.15"/></> },
                          { pos: 'center-third' as const, label: '1/3 C', svg: <><rect x="9" y="2" width="6" height="20" rx="1.5" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.5"/><rect x="2" y="2" width="6" height="20" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.15"/><rect x="16" y="2" width="6" height="20" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.15"/></> },
                          { pos: 'right-third' as const, label: '1/3 R', svg: <><rect x="16" y="2" width="6" height="20" rx="1.5" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.5"/><rect x="2" y="2" width="6" height="20" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.15"/><rect x="9" y="2" width="6" height="20" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.15"/></> },
                        ] as const).map(({ pos, label, svg }) => (
                          <button key={pos} onClick={() => { tileWindow(appId, pos); setSnapLayoutApp(null); }}
                            title={label}
                            aria-label={`Snap window ${label}`}
                            style={{
                              width: 50, height: 38, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                              background: 'var(--color-border-subtle)', border: '1px solid var(--color-bg-hover)', borderRadius: 4,
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
                      background: 'transparent', border: 'none', borderRadius: 4,
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
                  style={{ position: 'absolute', right: 0, top: 30, bottom: 20, width: 6, cursor: 'ew-resize', zIndex: 2, background: 'transparent' }}
                  onPointerDown={(e) => {
                    e.stopPropagation(); e.preventDefault();
                    const startX = e.clientX;
                    const startW = detBounds.w;
                    const el = e.currentTarget.parentElement as HTMLElement;
                    if (el) el.setAttribute('data-dragging', 'true');
                    // Neighbor rebalance: a window flush to this one's right edge
                    // becomes the other half of a divider — its right stays fixed
                    // while its left follows ours (floored at its min-width).
                    const GAP = 6;
                    let neighborId: string | null = null;
                    let neighborStart: { x: number; y: number; w: number; h: number } | null = null;
                    detachedApps.forEach((nb, id) => {
                      if (id === appId || minimizedApps.has(id)) return;
                      const gap = nb.x - (detBounds.x + detBounds.w);
                      const vOverlap = Math.min(detBounds.y + detBounds.h, nb.y + nb.h) - Math.max(detBounds.y, nb.y);
                      if (gap >= -4 && gap <= 18 && vOverlap > 40) { neighborId = id; neighborStart = { x: nb.x, y: nb.y, w: nb.w, h: nb.h }; }
                    });
                    const neighborEl = neighborId ? (document.querySelector(`[data-floating-window="${neighborId}"]`) as HTMLElement | null) : null;
                    const neighborMinW = neighborId ? (APP_WINDOW_MIN_SIZES[neighborId]?.w ?? 360) : 360;
                    const computeW = (ev: PointerEvent, workspace: { x: number; w: number }) => {
                      const ns = neighborStart;
                      const maxW = ns
                        ? (ns.x + ns.w) - GAP - detBounds.x - neighborMinW
                        : workspace.x + workspace.w - detBounds.x;
                      return Math.min(Math.max(360, startW + ev.clientX - startX), maxW);
                    };
                    let rafId = 0;
                    const onMove = (ev: PointerEvent) => {
                      cancelAnimationFrame(rafId);
                      rafId = requestAnimationFrame(() => {
                        const nw = computeW(ev, getShellWorkspace(0));
                        if (el) el.style.width = nw + 'px';
                        const ns = neighborStart;
                        if (neighborEl && ns) {
                          const nbX = detBounds.x + nw + GAP;
                          neighborEl.style.left = nbX + 'px';
                          neighborEl.style.width = ((ns.x + ns.w) - nbX) + 'px';
                        }
                      });
                    };
                    const onUp = (ev: PointerEvent) => {
                      cancelAnimationFrame(rafId);
                      document.removeEventListener('pointermove', onMove);
                      document.removeEventListener('pointerup', onUp);
                      if (el) el.removeAttribute('data-dragging');
                      const workspace = getShellWorkspace(0);
                      const nw = computeW(ev, workspace);
                      setDetachedApps(prev => {
                        const b = prev.get(appId);
                        if (!b) return prev;
                        const next = new Map(prev);
                        const clamped = clampWindowToWorkspace({ x: b.x, y: b.y, w: nw, h: b.h }, workspace);
                        next.set(appId, { ...b, ...clamped });
                        const ns = neighborStart;
                        if (neighborId && ns) {
                          const nbX = b.x + nw + GAP;
                          const nbW = Math.max(neighborMinW, (ns.x + ns.w) - nbX);
                          const nbPrev = prev.get(neighborId);
                          if (nbPrev) next.set(neighborId, { ...nbPrev, ...clampWindowToWorkspace({ x: nbX, y: ns.y, w: nbW, h: ns.h }, workspace) });
                        }
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
                  style={{ position: 'absolute', bottom: 0, left: 20, right: 20, height: 6, cursor: 'ns-resize', zIndex: 2, background: 'transparent' }}
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
                  style={{ position: 'absolute', left: 0, top: 30, bottom: 20, width: 6, cursor: 'ew-resize', zIndex: 2, background: 'transparent' }}
                  onPointerDown={(e) => {
                    e.stopPropagation(); e.preventDefault();
                    const startX = e.clientX;
                    const startW = detBounds.w;
                    const startLeft = detBounds.x;
                    const el = e.currentTarget.parentElement as HTMLElement;
                    if (el) el.setAttribute('data-dragging', 'true');
                    // Neighbor rebalance: a window flush to our LEFT is the other
                    // half of a divider — its left stays fixed while its right
                    // follows our left edge (floored at its min-width).
                    const GAP = 6;
                    let neighborId: string | null = null;
                    let neighborStart: { x: number; y: number; w: number; h: number } | null = null;
                    detachedApps.forEach((nb, id) => {
                      if (id === appId || minimizedApps.has(id)) return;
                      const gap = detBounds.x - (nb.x + nb.w);
                      const vOverlap = Math.min(detBounds.y + detBounds.h, nb.y + nb.h) - Math.max(detBounds.y, nb.y);
                      if (gap >= -4 && gap <= 18 && vOverlap > 40) { neighborId = id; neighborStart = { x: nb.x, y: nb.y, w: nb.w, h: nb.h }; }
                    });
                    const neighborEl = neighborId ? (document.querySelector(`[data-floating-window="${neighborId}"]`) as HTMLElement | null) : null;
                    const neighborMinW = neighborId ? (APP_WINDOW_MIN_SIZES[neighborId]?.w ?? 360) : 360;
                    const computeLeft = (ev: PointerEvent, workspace: { x: number }) => {
                      const ns = neighborStart;
                      const deltaX = ev.clientX - startX;
                      const desiredW = Math.max(360, startW - deltaX);
                      const desiredLeft = startLeft + (startW - desiredW);
                      const minLeft = ns ? Math.max(workspace.x, ns.x + neighborMinW + GAP) : workspace.x;
                      return Math.max(minLeft, desiredLeft);
                    };
                    let rafId = 0;
                    const onMove = (ev: PointerEvent) => {
                      cancelAnimationFrame(rafId);
                      rafId = requestAnimationFrame(() => {
                        const workspace = getShellWorkspace(0);
                        const nl = computeLeft(ev, workspace);
                        const nw = startLeft + startW - nl;
                        if (el) { el.style.width = nw + 'px'; el.style.left = nl + 'px'; }
                        const ns = neighborStart;
                        if (neighborEl && ns) neighborEl.style.width = ((nl - GAP) - ns.x) + 'px';
                      });
                    };
                    const onUp = (ev: PointerEvent) => {
                      cancelAnimationFrame(rafId);
                      document.removeEventListener('pointermove', onMove);
                      document.removeEventListener('pointerup', onUp);
                      if (el) el.removeAttribute('data-dragging');
                      const workspace = getShellWorkspace(0);
                      const nl = computeLeft(ev, workspace);
                      const nw = startLeft + startW - nl;
                      setDetachedApps(prev => {
                        const b = prev.get(appId);
                        if (!b) return prev;
                        const next = new Map(prev);
                        const clamped = clampWindowToWorkspace({ x: nl, y: b.y, w: nw, h: b.h }, workspace);
                        next.set(appId, { ...b, ...clamped });
                        const ns = neighborStart;
                        if (neighborId && ns) {
                          const nbW = Math.max(neighborMinW, (nl - GAP) - ns.x);
                          const nbPrev = prev.get(neighborId);
                          if (nbPrev) next.set(neighborId, { ...nbPrev, ...clampWindowToWorkspace({ x: ns.x, y: ns.y, w: nbW, h: ns.h }, workspace) });
                        }
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
                  style={{ position: 'absolute', top: 0, left: 20, right: 20, height: 6, cursor: 'ns-resize', zIndex: 2, background: 'transparent' }}
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
                    cursor: 'nwse-resize', zIndex: 3, borderRadius: '0 0 10px 0',
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
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
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
        // Gentler magnification (owner direction): a broad, soft lift that GLIDES
        // with the cursor instead of a sharp pop bleeding left-to-center. A wider
        // sigma spreads the swell across neighbours; the short transition smooths
        // frame-to-frame motion. Safe to transition now because centres come from
        // layout offsets (offsetLeft), NOT transformed rects, so there is no
        // scale-feedback loop to cause jitter.
        const sigma = 60;
        const influence = 120;
        const centers: number[] = [];
        for (let i = 0; i < items.length; i++) {
          centers[i] = dockRect.left + items[i].offsetLeft + items[i].offsetWidth / 2;
        }
        // Then batch-write transforms
        for (let i = 0; i < items.length; i++) {
          const dist = Math.abs(mx - centers[i]);
          const scale = dist <= influence
            ? 1 + (magnificationScale - 1) * 0.22 * Math.exp(-(dist * dist) / (2 * sigma * sigma))
            : 1;
          const roundedScale = Math.round(scale * 1000) / 1000;
          if (items[i].dataset.dockScale === String(roundedScale)) continue;
          items[i].dataset.dockScale = String(roundedScale);
          items[i].style.transition = 'transform 0.18s cubic-bezier(0.22,1,0.36,1)';
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

  const handleDockFileDrop = useCallback((appId: AppId, e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;

    openDockApp(appId, e.currentTarget);
    const target = DOCK_FILE_DROP_TARGETS[appId];
    if (!target) {
      window.dispatchEvent(new CustomEvent('dex-toast', {
        detail: { type: 'info', message: `${APP_DEFINITIONS[appId]?.name || appId} does not support direct file drop routing yet.` },
      }));
      return;
    }

    let delivered = 0;
    for (const file of files.slice(0, 10)) {
      const path = (file as File & { path?: string }).path || file.name;
      const kind = inferAssetKindFromPath(path);
      const ok = sendAssetToApp({
        id: `dock-drop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind,
        name: file.name,
        sourceApp: 'files',
        data: path,
        mimeType: file.type || undefined,
        metadata: { via: 'dock-drop' },
        createdAt: Date.now(),
      }, target);
      if (ok) delivered++;
    }

    if (delivered > 0) {
      window.dispatchEvent(new CustomEvent('dex-toast', {
        detail: { type: 'success', message: `Sent ${delivered} file${delivered > 1 ? 's' : ''} to ${APP_DEFINITIONS[appId]?.name || appId}` },
      }));
    } else {
      window.dispatchEvent(new CustomEvent('dex-toast', {
        detail: { type: 'warning', message: `No compatible files were routed to ${APP_DEFINITIONS[appId]?.name || appId}` },
      }));
    }
  }, [openDockApp, sendAssetToApp]);

  // Shortcut hints for dock tooltips — platform-aware modifier key
  const _M = platform.isMac ? '⌘' : 'Ctrl';
  const _O = platform.isMac ? '⌥' : 'Alt';
  const dockShortcut: Record<string, string> = {
    home: `${_M}+1`, settings: `${_M}+2`, files: `${_M}+3`, notes: `${_M}+4`, tasks: `${_M}+5`,
    browser: `${_M}+6`, gallery: `${_M}+7`, calendar: `${_M}+8`, kanban: `${_M}+9`,
    videoeditor: `${_O}+V`, imosion: `${_O}+I`, prism: `${_O}+R`, flux: `${_O}+F`, forge: `${_O}+G`,
    power: `${_O}+P`, calculator: `${_O}+C`, transfers: `${_O}+T`,
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

        // Running-state indicator: a subtle dot beneath running apps, brighter
        // and accent-tinted for the active app (rendered below, absolute so it
        // adds no layout shift and scales with dock magnification).

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
        >

          <button
            type="button"
            onPointerDown={(e) => {
              // Non-primary mouse button (right/middle) -> let onContextMenu handle it.
              if (e.pointerType === 'mouse' && e.button !== 0) return;
              if (dockLongPressTimerRef.current) clearTimeout(dockLongPressTimerRef.current);
              // Long-press opens the context menu on touch only; mouse uses right-click.
              if (e.pointerType === 'touch') {
                dockLongPressTimerRef.current = setTimeout(() => {
                  setDockCtx({ appId: item.id, x: e.clientX, y: e.clientY });
                }, 420);
              }
              // Drag-to-reorder for BOTH mouse and touch. Launch is deferred to
              // pointer-up when no drag happened, so a plain click still opens the app.
              {
                const startIndex = items.findIndex((d) => d.id === item.id);
                dockTouchReorderRef.current = {
                  appId: item.id,
                  startX: e.clientX,
                  startY: e.clientY,
                  dragging: false,
                  fromIndex: startIndex,
                  toIndex: startIndex,
                  el: e.currentTarget as HTMLElement,
                };
              }
              e.currentTarget.setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
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

              const isHorizontalDock = dockEdgePref === 'bottom' || dockEdgePref === 'top';
              // Live feedback: the dragged icon follows the pointer along the dock
              // axis. The dock order is NOT mutated mid-drag -- doing that made the
              // icon "walk" to the end because indices recomputed against a layout
              // that kept shifting underneath the gesture. We only record the
              // intended slot and commit ONE reorder on drop.
              if (gesture.el) {
                gesture.el.style.transition = 'none';
                gesture.el.style.transform = isHorizontalDock ? `translateX(${dx}px)` : `translateY(${dy}px)`;
                gesture.el.style.zIndex = '5';
              }

              const buttons = Array.from(dockRef.current.querySelectorAll<HTMLButtonElement>('[data-dock-app-id]'));
              if (buttons.length < 2) return;
              const pointerAxis = isHorizontalDock ? e.clientX : e.clientY;
              let toIndex = gesture.fromIndex;
              let closest = Number.POSITIVE_INFINITY;
              buttons.forEach((btn, idx) => {
                // Skip the icon being dragged -- it is translated to follow the
                // pointer, so it would always measure as the nearest to itself.
                if (btn.getAttribute('data-dock-app-id') === gesture.appId) return;
                const rect = btn.getBoundingClientRect();
                const center = isHorizontalDock ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
                const dist = Math.abs(pointerAxis - center);
                if (dist < closest) {
                  closest = dist;
                  toIndex = idx;
                }
              });
              gesture.toIndex = toIndex;
            }}
            onPointerUp={(e) => {
              if (dockLongPressTimerRef.current) clearTimeout(dockLongPressTimerRef.current);
              dockLongPressTimerRef.current = null;
              const gesture = dockTouchReorderRef.current;
              if (gesture && gesture.appId === item.id) {
                if (gesture.el) {
                  gesture.el.style.transform = '';
                  gesture.el.style.zIndex = '';
                  gesture.el.style.transition = '';
                }
                if (gesture.dragging) {
                  // One stable commit: original slot -> drop slot.
                  if (gesture.toIndex !== gesture.fromIndex && gesture.fromIndex >= 0 && gesture.toIndex >= 0) {
                    reorderDockPins(gesture.fromIndex, gesture.toIndex);
                  }
                } else {
                  openDockApp(item.id, e.currentTarget);
                }
              }
              dockTouchReorderRef.current = null;
            }}
            onPointerCancel={() => {
              if (dockLongPressTimerRef.current) clearTimeout(dockLongPressTimerRef.current);
              dockLongPressTimerRef.current = null;
              const gesture = dockTouchReorderRef.current;
              if (gesture?.el) {
                gesture.el.style.transform = '';
                gesture.el.style.zIndex = '';
                gesture.el.style.transition = '';
              }
              dockTouchReorderRef.current = null;
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
            onDragOver={(e) => {
              if ((e.dataTransfer?.types || []).includes('Files')) e.preventDefault();
            }}
            onDrop={(e) => handleDockFileDrop(item.id, e)}
            onKeyDown={(e) => handleDockKeyDown(e, items)}
            data-dock-app-id={item.id}
            data-dock-icon={item.id}
            data-running-app={isRunning ? 'true' : undefined}
            aria-label={`Open ${item.label}${isRunning ? ' (running)' : ''}${isMinimized ? ' (minimized)' : ''}${shortcut ? ` - ${shortcut}` : ''}`}
            aria-current={isActive ? 'true' : undefined}
            style={{
              width: size, height: size,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              // No background highlight on the dock -- hard-coded transparent for
              // every state (active AND hover). The owner does not want the accent
              // square or a hover square. The icon glyph, the magnification lift,
              // and the running/active dot below are the only affordances.
              background: 'transparent',
              border: 'none', borderRadius: 12, cursor: 'pointer',
              position: 'relative', padding: 0,
              touchAction: 'manipulation',
              color: item.color,
              opacity: isMinimized ? 0.5 : 1,
              transition: 'color 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease',
            }}
          >
            {AppIconPngs[item.id] ? (
              <AppIconImg appId={item.id} size={size - 8} />
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.color }}>
                {Icons[item.id] || <DexIcon name={APP_DEFINITIONS[item.id]?.icon || item.id} size={18} color={item.color} />}
              </span>
            )}
          </button>
          {(isRunning || isActive) && (
            <span
              aria-hidden="true"
              data-dock-running-dot
              style={{
                position: 'absolute', bottom: -3, left: '50%',
                transform: 'translateX(-50%)',
                // Active: a crisp accent underline bar (paired with the icon's
                // accent-tint background = one unmistakable focused state).
                // Background-running: a small neutral dot. No glow -- the
                // indicator is exact, never a decorative wash.
                width: isActive ? 14 : 4, height: isActive ? 2.5 : 4,
                borderRadius: 9999,
                background: isActive ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                opacity: isMinimized ? 0.5 : 1,
                transition: 'width var(--motion-dock-hover), height var(--motion-dock-hover), background var(--motion-dock-hover), opacity var(--motion-dock-hover)',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      );
      } catch (err) {
        // Dock item render failed — show placeholder to maintain dock layout
        console.warn(`[Dock] Failed to render item ${item.id}:`, err);
        return (
          <div
            key={item.id}
            data-dock-item
            style={{
              width: dockIconSize,
              height: dockIconSize,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-bg-surface)',
              borderRadius: 10,
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
    <div key={key} style={{ width: 1, height: 20, background: 'var(--color-border)', margin: '0 6px', flexShrink: 0, alignSelf: 'center', borderRadius: 2 }} />
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

  // -- App Tab Bar (persistent running-app tabs) with ghost drag-to-place --
  // The dragged tab stays in the strip as a dimmed placeholder that settles into
  // the drop slot, while a floating "ghost" follows the cursor — so reordering
  // reads as picking a tab up and setting it down, not the live tab being torn
  // out of the row. Placement math lives in shared/shell/tabReorder (tested).
  const [tabOrder, setTabOrder] = useState<string[]>([]);
  const [draggingTab, setDraggingTab] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const draggingTabRef = useRef<string | null>(null);

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

  const dragRafRef = useRef<number>(0);

  const handleTabDragStart = useCallback((e: React.PointerEvent, appId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    try { target.setPointerCapture(e.pointerId); } catch { /* capture is best-effort */ }
    draggingTabRef.current = appId;
    setDraggingTab(appId);
    setGhostPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleTabDragMove = useCallback((e: React.PointerEvent) => {
    if (!draggingTabRef.current) return;
    const dragging = draggingTabRef.current;
    const pointerX = e.clientX;
    const pointerY = e.clientY;
    // The ghost follows the cursor immediately for a fluid feel.
    setGhostPos({ x: pointerX, y: pointerY });
    // Recompute the drop slot off the real, measured tab centres (variable tab
    // widths), throttled to one calc per frame.
    cancelAnimationFrame(dragRafRef.current);
    dragRafRef.current = requestAnimationFrame(() => {
      const centers: TabCenter[] = [];
      tabRefs.current.forEach((el, id) => {
        const r = el.getBoundingClientRect();
        centers.push({ id, center: r.left + r.width / 2 });
      });
      centers.sort((a, b) => a.center - b.center); // visual left-to-right order
      const target = computeTabDropIndex(centers, dragging, pointerX);
      setTabOrder(prev => {
        const next = moveTab(prev, dragging, target);
        return sameOrder(prev, next) ? prev : next;
      });
    });
  }, []);

  const handleTabDragEnd = useCallback((e: React.PointerEvent) => {
    if (!draggingTabRef.current) return;
    const target = e.currentTarget as HTMLElement;
    try { target.releasePointerCapture(e.pointerId); } catch { /* release is best-effort */ }
    draggingTabRef.current = null;
    setDraggingTab(null);
    setGhostPos(null);
    cancelAnimationFrame(dragRafRef.current);
    // Persist tab order (best-effort).
    setTabOrder(cur => { try { localStorage.setItem('dex-tab-order', JSON.stringify(cur)); } catch { /* best-effort */ } return cur; });
  }, []);

  // Load persisted tab order
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dex-tab-order');
      if (saved) setTabOrder(JSON.parse(saved));
    } catch { /* intentional: corrupt or unavailable storage falls back to default tab order */ }
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

    const ghostDef = draggingTab ? APP_DEFINITIONS[draggingTab as AppId] : null;

    return (
      <>
      <div
        ref={tabContainerRef}
        style={{
          height: 32, display: 'flex', alignItems: 'center',
          padding: '0 var(--space-2)', gap: 2,
          // Tier 2 of the top chrome: solid, matching the menu bar tone (#0E0E11)
          // so the two read as one continuous two-tier bar divided by a single
          // hairline, not two unrelated strips. (No blur in full-flat mode.)
          background: '#0E0E11',
          backdropFilter: 'var(--blur-xl) saturate(180%)',
          WebkitBackdropFilter: 'var(--blur-xl) saturate(180%)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.04)',
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
              ref={el => { if (el) tabRefs.current.set(app.id, el); else tabRefs.current.delete(app.id); }}
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
              onDoubleClick={() => { if (!draggingTab) tileWindow(app.id as AppId, 'maximize'); }}
              title="Double-click to maximize / restore"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 10px 0 var(--space-2)', height: 26, borderRadius: 4,
                background: isActive ? 'rgba(74,158,255,0.16)' : isDragging ? 'rgba(255,255,255,0.04)' : 'transparent',
                border: isDragging ? '1px dashed var(--color-border)' : isActive ? '1px solid var(--color-border-subtle)' : '1px solid transparent',
                cursor: isDragging ? 'grabbing' : 'grab', flexShrink: 0,
                transform: 'none',
                transition: isDragging ? 'none' : 'transform 0.18s cubic-bezier(0.4,0,0.2,1), background 0.12s ease, border-color 0.12s ease, opacity 0.12s ease',
                zIndex: 1,
                boxShadow: 'none',
                // The dragged tab becomes a dimmed drop-slot; the floating ghost carries the lift.
                opacity: isDragging ? 0.38 : 1,
                touchAction: 'none',
                userSelect: 'none',
                willChange: isDragging ? 'opacity' : 'auto',
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
                  width: 18, height: 18, borderRadius: 3,
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

      {/* Floating ghost: a lifted copy of the dragged tab that tracks the cursor. */}
      {draggingTab && ghostPos && (
        <div
          aria-hidden
          style={{
            position: 'fixed', left: ghostPos.x, top: ghostPos.y,
            transform: 'translate(10px, -50%) scale(1.06)',
            pointerEvents: 'none', zIndex: 9999,
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 10px 0 var(--space-2)', height: 26, borderRadius: 4,
            background: 'var(--color-bg-glass-strong, rgba(20,20,22,0.92))',
            backdropFilter: 'var(--blur-lg) saturate(180%)', WebkitBackdropFilter: 'var(--blur-lg) saturate(180%)',
            border: '1px solid var(--color-border-subtle)',
            boxShadow: '0 12px 28px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset',
            opacity: 0.97,
          }}
        >
          <span style={{ display: 'flex', color: ghostDef?.color || '#8E8E93', alignItems: 'center', flexShrink: 0 }}>
            {AppIconPngs[draggingTab as AppId]
              ? <AppIconImg appId={draggingTab as AppId} size={14} />
              : (Icons[draggingTab as AppId] || <DexIcon name={ghostDef?.icon || draggingTab} size={14} color={ghostDef?.color || '#8E8E93'} />)}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
            {ghostDef?.name || draggingTab}
          </span>
        </div>
      )}
      </>
    );
  };

  const renderTitleBar = () => (
    // data-tauri-drag-region: makes the bar draggable under Tauri (the Electron
    // -webkit-app-region below only works in Electron). Tauri starts a drag only
    // for mousedowns directly on this element, so the child buttons are unaffected.
    <div data-tauri-drag-region style={{
      height: 34, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: `0 ${12 + nativeOverlayWidth}px 0 12px`,
      // DEX Sharp: solid, placed chrome — matches the dock tone (#0E0E11) so the
      // top bar reads as crisp bespoke chrome, not a washed-out translucent slab.
      // (Blur was already a no-op platform-wide; dropping it removes dead cost.)
      background: '#0E0E11',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.06), 0 1px 8px rgba(0,0,0,0.28)',
      WebkitAppRegion: 'drag', flexShrink: 0,
      position: 'relative', zIndex: 100,
    } as React.CSSProperties}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {windowControls === 'traffic' && (
          <div
            className="traffic-light-group"
            style={{ display: 'flex', gap: 'var(--space-2)', marginRight: 'var(--space-2)', alignItems: 'center' }}
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
        <button style={{...navBtnStyle, color: currentApp === 'browser' ? 'var(--color-accent)' : undefined}} onClick={() => setCurrentApp('browser' as AppId)} data-tip={`Browser (${platform.isMac ? '⌘' : 'Ctrl'}+6)`} aria-label="Open Browser">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        </button>
      </div>
      <span style={{
        fontSize: 13, fontWeight: 500, color: 'var(--color-text-tertiary)',
        // Truly CENTERED in the bar -- was pinned at a hardcoded left:280, which
        // read as off-balance / not engineered. Centre via 50% + translateX,
        // clamped so it never collides with the left nav cluster or the right
        // status cluster (ellipsises instead).
        position: 'absolute', left: '50%', transform: 'translateX(-50%)',
        letterSpacing: '-0.01em',
        display: currentApp === 'home' ? 'none' : 'flex', alignItems: 'center', gap: 6,
        WebkitAppRegion: 'no-drag',
        cursor: 'pointer',
        maxWidth: 'min(46vw, 460px)',
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
              // Full-flat: no backdrop-filter (this was a straggler against the
              // platform-wide flat-glass rule). Flat tint + hairline only.
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 14, padding: '2px 10px 2px 6px',
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
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowMinimizedList(v => !v)}
                    aria-label={`${minimizedApps.size} minimized window${minimizedApps.size > 1 ? 's' : ''} — click to restore`}
                    title="Click to see minimized windows"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 3,
                      background: showMinimizedList ? 'rgba(255,255,255,0.12)' : 'none',
                      border: 'none', cursor: 'pointer', padding: '2px 5px', borderRadius: 6,
                      fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 2,
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.10)'; }}
                    onMouseLeave={e => { if (!showMinimizedList) (e.currentTarget as HTMLElement).style.background = 'none'; }}
                  >
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <rect x="1" y="4" width="10" height="7" rx="1.5" />
                      <path d="M4 4V2.5A1.5 1.5 0 0 1 5.5 1h1A1.5 1.5 0 0 1 8 2.5V4" />
                    </svg>
                    {minimizedApps.size} minimized
                  </button>
                  {showMinimizedList && (
                    <div
                      ref={minimizedListRef}
                      role="menu"
                      aria-label="Minimized windows"
                      onKeyDown={e => {
                        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
                        e.preventDefault();
                        const items = Array.from(minimizedListRef.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]') || []);
                        if (items.length === 0) return;
                        const active = document.activeElement as HTMLButtonElement | null;
                        const idx = active ? items.indexOf(active) : -1;
                        const next = e.key === 'ArrowDown'
                          ? items[(idx + 1) % items.length]
                          : items[(idx - 1 + items.length) % items.length];
                        next?.focus();
                      }}
                      style={{
                        position: 'absolute', bottom: 'calc(100% + 6px)', left: 0,
                        background: 'var(--pg-toolbar, rgba(28,28,32,0.92))',
                        border: '1px solid var(--pg-border, rgba(255,255,255,0.10))',
                        borderRadius: 8, padding: '4px 0',
                        boxShadow: 'var(--pg-shadow-overlay, 0 12px 32px rgba(0,0,0,0.45))',
                        backdropFilter: 'var(--blur-lg) saturate(180%)',
                        WebkitBackdropFilter: 'var(--blur-lg) saturate(180%)',
                        minWidth: 160, zIndex: Z_DROPDOWN_BASE + 500,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {Array.from(minimizedApps).map(id => {
                        const def = APP_DEFINITIONS[id];
                        const col = def?.color || '#8E8E93';
                        return (
                          <button
                            key={id}
                            role="menuitem"
                            onClick={() => { restoreFloatingApp(id); setCurrentApp(id as AppId); setShowMinimizedList(false); }}
                            title={`Restore ${def?.name || id}`}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                              width: '100%', padding: '6px var(--space-3)',
                              background: 'none', border: 'none', cursor: 'pointer',
                              fontSize: 12, color: 'var(--color-text-primary, #f5f5f7)',
                              textAlign: 'left', transition: 'background 0.1s',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                          >
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0, boxShadow: `0 0 4px ${col}60` }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{def?.name || id}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
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
        <div style={{ position: 'relative', width: 18, height: 9, borderRadius: 2, border: '1px solid var(--color-text-tertiary)', display: 'flex', alignItems: 'center', padding: '0.5px' }}>
          <div style={{ height: '100%', width: `${batteryLevel}%`, borderRadius: 1.5, background: batteryLevel > 20 ? 'var(--color-success)' : 'var(--color-error)', transition: 'width 0.3s ease' }} />
          <div style={{ position: 'absolute', right: -2.5, width: 1.5, height: 3.5, borderRadius: '0 0.5px 0.5px 0', background: 'var(--color-text-tertiary)' }} />
        </div>
        {batteryCharging && <svg width="7" height="7" viewBox="0 0 24 24" fill="var(--color-warning)" stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>}
        {/* WiFi indicator - compact dot */}
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: navigator.onLine ? 'var(--color-success)' : 'var(--color-error)', flexShrink: 0 }} />

        {/* Quick Controls -- network mode + permission pills with popovers */}
        <QuickControls onOpenSettings={() => setCurrentApp('settings' as AppId)} />

        {/* Notification Center bell -- opens the single hub-backed center */}
        <button
          onClick={() => setShowNotifCenter(v => !v)}
          title="Notification Center"
          aria-label="Open notification center"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 18, borderRadius: 4, position: 'relative',
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
          {hubUnreadCount > 0 && (
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
              width: 22, height: 18, borderRadius: 4,
              background: titlebarMenuOpen ? 'var(--color-border)' : 'transparent',
              border: 'none', cursor: 'pointer', padding: 0, transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => { if (!titlebarMenuOpen) (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)'; }}
            onMouseLeave={e => { if (!titlebarMenuOpen) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
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
                  background: 'var(--color-bg-glass)',
                  backdropFilter: 'var(--blur-xl) saturate(180%)',
                  WebkitBackdropFilter: 'var(--blur-xl) saturate(180%)',
                  borderRadius: 10, border: '1px solid rgba(255,255,255,0.10)',
                  boxShadow: 'var(--pg-shadow-modal), var(--pg-gloss-top)',
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
                    padding: 'var(--space-2) 14px', background: 'transparent', border: 'none',
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
                  padding: 'var(--space-2) 14px', fontSize: 13, color: 'var(--color-text-primary)',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={navigator.onLine ? 'var(--color-success)' : 'var(--color-error)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.55a11 11 0 0 1 14 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill={navigator.onLine ? 'var(--color-success)' : 'var(--color-error)'}/>
                  </svg>
                  {navigator.onLine ? 'Wi-Fi: Connected' : 'Wi-Fi: Offline'}
                </div>
                {/* Volume */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '6px 14px' }}>
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
                      boxShadow: 'var(--pg-shadow-chip)',
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
                      boxShadow: 'var(--pg-shadow-chip)',
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
                    padding: 'var(--space-2) 14px', background: 'transparent', border: 'none',
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
                  padding: 'var(--space-2) 14px', fontSize: 13, color: 'var(--color-text-primary)',
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

  // OS-grade dock space reservation: when the dock is pinned (always-visible)
  // and shown, the inline app surface reserves the dock's footprint on its edge
  // so app content (toolbars, status bars, panels) is never clipped under the
  // floating dock. Auto-hide keeps overlay behavior (the dock slides away on leave).
  const dockReservesSpace = dockMode === 'always-visible' && !inFullscreenApp;
  const dockReserveStyle: React.CSSProperties = {
    marginTop: dockReservesSpace && dockEdgePref === 'top' ? 'var(--dex-reserved-top)' : undefined,
    marginBottom: dockReservesSpace && dockEdgePref === 'bottom' ? 'var(--dex-reserved-bottom)' : undefined,
    marginLeft: dockReservesSpace && dockEdgePref === 'left' ? 'var(--dex-reserved-left)' : undefined,
    marginRight: dockReservesSpace && dockEdgePref === 'right' ? 'var(--dex-reserved-right)' : undefined,
    // No margin transition: animating the work-area margin made getShellWorkspace
    // read a MOVING TARGET for ~320ms, so a window opened/maximized right after a
    // dock pin or fullscreen toggle got sized to a transient box and could land
    // out of bounds. Instant resize keeps the work area always-settled.
  };

  return (
    <div role="application" aria-label="DEX Desktop" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'transparent', fontFamily: 'var(--font-family)', overflow: 'hidden', minWidth: 360 }}>
      <a href="#dex-main-content" className="dex-skip-nav">Skip to content</a>
      <div aria-live="polite" aria-atomic="true" className="dex-sr-only" id="dex-live-region" />

      {immersive && currentAppId !== 'home' ? (
        // Immersive focus: chrome hidden, only a quiet exit pill remains.
        <button
          onClick={() => setImmersive(false)}
          aria-label="Exit focus mode"
          title="Exit focus (Esc)"
          style={{
            position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)',
            zIndex: 9000, display: 'flex', alignItems: 'center', gap: 6,
            height: 24, padding: '0 var(--space-3)', borderRadius: 9999,
            background: 'rgba(14,14,17,0.92)', border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 500,
            cursor: 'pointer', opacity: 0.5, transition: 'opacity 0.2s ease',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.5'; }}
        >
          Focus mode · Esc to exit
        </button>
      ) : (
        <>
          {renderTitleBar()}
          {renderAppTabBar()}
        </>
      )}

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
            width: 6, height: 48, borderRadius: '0 3px 3px 0',
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
        <div ref={contentRef} role="main" aria-label="App content" style={{
          flex: 1, minWidth: 0, minHeight: 0, position: 'relative', overflow: 'hidden',
          background: 'transparent',
          borderRadius: 0,
          contain: 'layout style',
          ...dockReserveStyle,
        }}>
          {keepAliveElements}
        </div>
      ) : (
        <div ref={splitContainerRef} style={{
          flex: 1, minWidth: 0, minHeight: 0, display: 'flex',
          flexDirection: splitMode === 'horizontal' ? 'row' : 'column',
          overflow: 'hidden', position: 'relative',
          // Same containment as the non-split surface: make THIS box the containing
          // block for position:fixed floating windows so they anchor to the split
          // area and can't escape to the viewport / out of bounds.
          contain: 'layout style',
          ...dockReserveStyle,
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
        // Mirror tileWindow's work-area math (PAD=6, same formulas) so the drag
        // preview lands exactly where the window will snap. The window renders
        // INSIDE the content surface (its containing block), so translate the
        // work-area rect to screen coords by the surface's on-screen origin.
        const ws = getShellWorkspace(0);
        const origin = contentRef.current?.getBoundingClientRect();
        const originX = origin ? origin.left : 0;
        const originY = origin ? origin.top : 0;
        const W = ws.w, H = ws.h, LEFT = ws.x, TOP = ws.y, PAD = 6;
        const halfW = Math.floor((W - PAD * 3) / 2);
        const halfH = Math.floor((H - PAD * 3) / 2);
        const zones: Record<string, { x: number; y: number; w: number; h: number }> = {
          left:         { x: LEFT + PAD, y: TOP + PAD, w: halfW, h: H - PAD * 2 },
          right:        { x: LEFT + PAD * 2 + halfW, y: TOP + PAD, w: halfW, h: H - PAD * 2 },
          'top-left':   { x: LEFT + PAD, y: TOP + PAD, w: halfW, h: halfH },
          'top-right':  { x: LEFT + PAD * 2 + halfW, y: TOP + PAD, w: halfW, h: halfH },
          'bottom-left':  { x: LEFT + PAD, y: TOP + PAD * 2 + halfH, w: halfW, h: halfH },
          'bottom-right': { x: LEFT + PAD * 2 + halfW, y: TOP + PAD * 2 + halfH, w: halfW, h: halfH },
          maximize:     { x: LEFT, y: TOP, w: W, h: H },
        };
        const z = zones[snapPreviewZone];
        if (!z) return null;
        return (
          <div
            key="snap-preview"
            aria-hidden="true"
            style={{
              position: 'fixed', left: originX + z.x, top: originY + z.y, width: z.w, height: z.h,
              background: 'rgba(59,130,246,0.08)',
              border: '2.5px solid rgba(59,130,246,0.35)',
              borderRadius: 10,
              pointerEvents: 'none',
              zIndex: 4000,
              transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 0 20px rgba(59,130,246,0.1)',
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
            borderRadius: 8,
            border: '1px solid var(--color-border)',
            padding: '7px 14px',
            pointerEvents: 'auto',
            boxShadow: 'var(--pg-shadow-panel), var(--pg-gloss-top)',
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            animation: isReduceMotion() ? 'none' : 'dex-menu-pop 0.15s cubic-bezier(0.23,1,0.32,1)',
          } as React.CSSProperties}>
            <div style={{ width: 24, height: 24, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: previewApp.color, background: `${previewApp.color}18`, flexShrink: 0 }}>
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
                borderRadius: 6,
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
                borderRadius: 6,
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
                  borderRadius: 6,
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
      {/* No bottom shelf/scrim: it read as a dark band + contrast line between the
          app edge and the dock. The dock carries its own shadow for grounding, so
          the bottom stays clean -- app, a small clear gap, then the dock. */}
      <div
        style={(() => {
          // Always-visible floating dock. Default = bottom-centre; once dragged,
          // dockPos holds an explicit top/left. Floats above everything and
          // reserves no layout space, so it is reachable at any time.
          const base: React.CSSProperties = {
            position: 'fixed',
            zIndex: 'var(--z-dock)' as unknown as number,
            display: 'flex', justifyContent: 'center',
            opacity: 1,
            pointerEvents: 'auto',
          };
          if (dockPos) {
            return { ...base, left: dockPos.x, top: dockPos.y, transform: 'none' };
          }
          return { ...base, left: '50%', bottom: 12, transform: 'translateX(-50%)' };
        })()}
      >
        <div
          ref={dockRef}
          role="toolbar"
          aria-label="Application dock"
          data-dock-container=""
          data-dock-edge={dockEdgePref}
          data-dock-preset={dockPresetPref}
          onPointerDown={handleDockDragStart}
          onPointerMove={handleDockDragMove}
          onPointerUp={handleDockDragEnd}
          onPointerCancel={handleDockDragEnd}
          style={{
            ...liquidGlassDock,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center', gap: 4,
            padding: '6px 10px',
            // Deliberate rounded-rect, not a full pill -- reads as bespoke
            // DEX chrome rather than a generic OS dock.
            borderRadius: 15,
            overflow: 'visible',
            maxWidth: '96vw',
            position: 'relative',
            contain: 'layout style',
            isolation: 'isolate',
            // Grab the blank pill area to drag the whole dock anywhere.
            cursor: 'grab',
            touchAction: 'none',
          } as React.CSSProperties}
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
                width: 34, height: 34,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: showAppMenu ? 'var(--color-accent-soft)' : 'transparent',
                border: 'none', borderRadius: 12, cursor: 'pointer',
                transition: 'background 0.2s cubic-bezier(0.4,0,0.2,1)',
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
          {/* Search Button -- opens the spotlight / app menu focused on the search field */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <button
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                // Open the shared Spotlight overlay -- real search + results.
                setShowAppMenu(false);
                setShowSpotlight(true);
              }}
              aria-label="Search"
              title="Search (Spotlight)"
              style={{
                width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent',
                border: 'none', borderRadius: 10, cursor: 'pointer',
                transition: 'background 0.2s cubic-bezier(0.4,0,0.2,1)',
                padding: 0, touchAction: 'manipulation',
                outline: 'none',
                WebkitAppRegion: 'no-drag',
              } as React.CSSProperties}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7"/>
                <path d="M21 21l-4.3-4.3"/>
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
                    width: 32, height: 32,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isUkiActive ? 'var(--color-accent-soft)' : 'transparent',
                    border: 'none', borderRadius: 10, cursor: 'pointer',
                    transition: 'background 0.2s cubic-bezier(0.4,0,0.2,1)',
                    padding: 0, touchAction: 'manipulation',
                    outline: 'none',
                    WebkitAppRegion: 'no-drag',
                  } as React.CSSProperties}
                  onMouseEnter={e => { if (!isUkiActive) (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isUkiActive ? 'var(--color-accent-soft)' : 'transparent'; }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isUkiActive ? 'var(--color-accent)' : 'var(--color-text-secondary)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                </button>
                {isUkiActive && (
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--color-accent)' }} />
                )}
          </div>
          {/* App launcher icons are tucked into the App Menu (the grid already
              lists every app + has search). This keeps the dock tiny and floating
              -- just App Menu, Search, and UKI. Open any app from the grid or with
              its Ctrl+number shortcut. */}
          {void dockItems}
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
                    border: 'none', borderRadius: 6, cursor: 'pointer',
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

      {/* Old bottom hover-trigger / auto-hide reveal strip removed: the dock is
          now always visible and freely draggable, so there is nothing to reveal. */}

      {/* Shared Spotlight search overlay -- opened by the dock Search button.
          One search surface used everywhere (real results, categories, keyboard
          nav). Replaces the app menu's old built-in search. */}
      <SpotlightSearch
        variant="overlay"
        isOpen={showSpotlight}
        onClose={() => setShowSpotlight(false)}
        onNavigate={(appId) => { setShowSpotlight(false); setCurrentApp(appId as AppId); }}
      />

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
            style={(() => {
              // Anchor the menu to the dock wherever it has been dragged: centre
              // it on the dock and open above it; if the dock sits in the top half
              // of the screen, open below instead. Everything is clamped to the
              // viewport so the menu is always fully visible.
              const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
              const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
              const r = dockRef.current?.getBoundingClientRect();
              const cx = r ? r.left + r.width / 2 : vw / 2;
              const half = Math.min(560, vw * 0.9) / 2;
              const left = Math.max(half + 8, Math.min(vw - half - 8, cx));
              const openBelow = !!r && r.top < vh * 0.45;
              const vpos: React.CSSProperties = openBelow
                ? { top: (r ? r.bottom : 60) + 10 }
                : { bottom: vh - (r ? r.top : vh - 60) + 10 };
              return {
              position: 'fixed',
              left,
              ...vpos,
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
              borderRadius: 10,
              padding: 'var(--space-5) var(--space-5) var(--space-4)',
              boxShadow: 'var(--pg-shadow-modal), var(--pg-gloss-top)',
              animation: 'appMenuSlideUp 0.22s cubic-bezier(0.23,1,0.32,1)',
              } as React.CSSProperties;
            })()}
          >
            <style>{`
              @keyframes appMenuSlideUp { 
                from { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.97); }
                to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
              }
            `}</style>
            {/* Pure launcher grid -- search now lives on the dock (Spotlight),
                so the app menu is just a clean grid of every app. */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>All Apps</span>
              <button
                onClick={() => { setShowAppMenu(false); setShowSpotlight(true); }}
                aria-label="Search"
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '5px 10px', color: 'var(--color-text-secondary)', fontSize: 12, cursor: 'pointer' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                Search
              </button>
            </div>
            {(() => {
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
                <div style={{ gridColumn: '1 / -1', color: 'var(--color-text-tertiary)', fontSize: 13, textAlign: 'center', padding: 'var(--space-5) 0' }}>No apps found</div>
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
                      padding: '7px 4px', borderRadius: 10, width: '100%',
                      background: 'transparent',
                      border: 'none', cursor: 'pointer',
                      transition: 'transform 0.18s cubic-bezier(0.23,1,0.32,1)',
                    }}
                  >
                    <div style={{
                      color: app.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 42, height: 42,
                      borderRadius: 10,
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
            className="dex-surface-overlay"
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
              // Material (background/border/shadow) now comes from the unified
              // .dex-surface-overlay class — the canonical overlay surface for
              // context menus. Blur is perf-tier/thermal gated automatically.
              zIndex: 5006, minWidth: 180,
              borderRadius: 10, padding: 4,
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
                    padding: '7px 14px', fontSize: 13, fontWeight: 400, borderRadius: 6,
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
            borderRadius: 10, padding: 4,
            boxShadow: 'var(--pg-shadow-popover-strong), var(--pg-gloss-top)',
            animation: 'ctxMenuIn 0.18s cubic-bezier(0.23,1,0.32,1)',
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
                  {item.separator && <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '3px var(--space-2)' }} />}
                  <button
                    role="menuitem"
                    onClick={item.action}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '7px 14px', fontSize: 13, fontWeight: 400, borderRadius: 6,
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

      {/* Notification Center slide-in panel -- single hub-backed center
          (persistent, grouped, priority-ordered). */}
      <NotificationCenter
        open={showNotifCenter}
        notifications={centerNotifications}
        onClearAll={() => { void hubClearAll(); }}
        onMarkAsRead={(id) => { const n = Number(id); if (!Number.isNaN(n)) void hubMarkRead(n); }}
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
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', marginBottom: 'var(--space-6)' }}>DEX</div>
          <div style={{ width: 200, height: 3, borderRadius: 2, background: 'var(--color-border-subtle)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, #4a9eff, #a855f7)', width: `${splashProgress}%`, transition: 'width 0.3s ease' }} />
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
  cursor: 'pointer', borderRadius: 4, touchAction: 'manipulation',
  transition: 'color 0.25s cubic-bezier(0.4,0,0.2,1), background 0.15s ease',
};

const winBtnStyle: React.CSSProperties = {
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: 'none', color: 'var(--color-text-primary)', cursor: 'pointer',
  borderRadius: 4, transition: 'color 0.12s ease, background 0.15s ease',
};

export default AppManager;
