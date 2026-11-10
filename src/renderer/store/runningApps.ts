/**
 * ===========================================================================
 * DEX -- Running Apps Store
 * ===========================================================================
 *
 * Tracks all currently running applications for OS-like window management.
 * Persists via Zustand middleware (VS Code-style Hot Exit).
 *
 * @author     Onazi Treasure OJ
 * @copyright  Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * @license    MIT License
 * ===========================================================================
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { persist } from 'zustand/middleware';
import { debouncedJsonStorage } from '../utils/debouncedStorage';
import { getMaxConcurrentApps, getStoredTier } from '../services/TierManager';
import { ContextBus } from '../services/ContextBus';
import { platform } from '../utils';
import { getBundledAppVersion } from '../utils/appVersion';

export interface RunningApp {
  id: string;
  name: string;
  icon: string;
  color: string;
  launchedAt: number;
  lastActiveAt: number;
  isMinimized: boolean;
}

interface RunningAppsState {
  runningApps: RunningApp[];
  currentAppId: string;
  /** Ordered list of app IDs, most-recently-used first (max 20) */
  sessionHistory: string[];
  
  // Actions
  launchApp: (app: Omit<RunningApp, 'launchedAt' | 'lastActiveAt' | 'isMinimized'>) => void;
  closeApp: (appId: string) => void;
  closeAllApps: () => void;
  setCurrentApp: (appId: string) => void;
  minimizeApp: (appId: string) => void;
  restoreApp: (appId: string) => void;
  /** Bring a running app to front (restore + focus), no-op if not running */
  bringToFront: (appId: string) => void;
  isAppRunning: (appId: string) => boolean;
  getRunningApp: (appId: string) => RunningApp | undefined;
}

/** Push an appId to the front of sessionHistory (deduplicated, max 20) */
const pushHistory = (history: string[], appId: string): string[] => {
  const deduped = history.filter(id => id !== appId);
  return [appId, ...deduped].slice(0, 20);
};

export const useRunningApps = create<RunningAppsState>()(
  persist(
    (set, get) => ({
      runningApps: [],
      currentAppId: 'home',
      sessionHistory: [],
  
      launchApp: (app) => {
        const { runningApps, currentAppId } = get();
        const existing = runningApps.find(a => a.id === app.id);
    
        if (existing) {
          // App already running, just focus it
          set(state => ({
            currentAppId: app.id,
            sessionHistory: pushHistory(state.sessionHistory, app.id),
            runningApps: state.runningApps.map(a => 
              a.id === app.id 
                ? { ...a, lastActiveAt: Date.now(), isMinimized: false }
                : a
            ),
          }));
          if (currentAppId !== app.id) ContextBus.emit('app:focused', { appId: app.id, ts: Date.now() });
        } else {
          // No hard app limit -- DEX scales to as many apps as the user opens.
          // Background apps stay alive (see shouldKeepAlive); the mounted
          // keep-alive set only trims NON-running apps, so running apps are never
          // evicted no matter how many are open. Add apps freely.
          // Launch new app
          const newApp: RunningApp = {
            ...app,
            launchedAt: Date.now(),
            lastActiveAt: Date.now(),
            isMinimized: false,
          };
          set(state => ({
            currentAppId: app.id,
            sessionHistory: pushHistory(state.sessionHistory, app.id),
            runningApps: [...state.runningApps, newApp],
          }));
          ContextBus.emit('app:opened', { appId: app.id, ts: Date.now() });
        }
        // Report to Xenon background optimizer (fire and forget, ignore errors)
        (window as any).dex?.invoke?.('xenon:reportActiveApp', app.id)?.catch?.(() => {});
      },
  
      closeApp: (appId) => {
        const { runningApps, currentAppId } = get();
        const newRunning = runningApps.filter(a => a.id !== appId);
    
        // If closing current app, go to most-recently-used sibling or home
         // Dispatch event — apps listening for 'dex-close-app-request' can call
         // e.preventDefault() to cancel (e.g. unsaved changes guard)
         const cancelEvent = new CustomEvent('dex-close-app-request', {
           detail: { appId },
           cancelable: true,
         });
         const cancelled = !window.dispatchEvent(cancelEvent);
         if (cancelled) return;

         let newCurrentId = currentAppId;
        if (currentAppId === appId) {
          const { sessionHistory } = get();
          const fallback = sessionHistory.find(id => id !== appId && newRunning.some(a => a.id === id));
          newCurrentId = fallback ?? (newRunning.length > 0 ? newRunning[newRunning.length - 1].id : 'home');
        }
    
        set({
          runningApps: newRunning,
          currentAppId: newCurrentId,
        });
        ContextBus.emit('app:closed', { appId, ts: Date.now() });
        if (newCurrentId !== currentAppId) {
          ContextBus.emit('app:focused', { appId: newCurrentId, ts: Date.now() });
        }
      },

      closeAllApps: () => {
        const { runningApps } = get();
        set({ runningApps: [], currentAppId: 'home' });
        for (const a of runningApps) {
          ContextBus.emit('app:closed', { appId: a.id, ts: Date.now() });
        }
      },
  
      setCurrentApp: (appId) => {
        const { runningApps, currentAppId } = get();
        set(state => ({
          currentAppId: appId,
          sessionHistory: pushHistory(state.sessionHistory, appId),
          runningApps: runningApps.map(a => 
            a.id === appId 
              ? { ...a, lastActiveAt: Date.now(), isMinimized: false }
              : a
          ),
        }));
        if (currentAppId !== appId) ContextBus.emit('app:focused', { appId, ts: Date.now() });
        // Report to Xenon background optimizer (fire and forget, ignore errors)
        (window as any).dex?.invoke?.('xenon:reportActiveApp', appId)?.catch?.(() => {});
      },
  
      minimizeApp: (appId) => {
        const { runningApps } = get();
        set({
          runningApps: runningApps.map(a => 
            a.id === appId ? { ...a, isMinimized: true } : a
          ),
          currentAppId: 'home',
        });
      },
  
      restoreApp: (appId) => {
        const { runningApps } = get();
        set(state => ({
          currentAppId: appId,
          sessionHistory: pushHistory(state.sessionHistory, appId),
          runningApps: runningApps.map(a => 
            a.id === appId 
              ? { ...a, isMinimized: false, lastActiveAt: Date.now() }
              : a
          ),
        }));
      },
  
      bringToFront: (appId) => {
        const { runningApps } = get();
        const app = runningApps.find(a => a.id === appId);
        if (!app) return;
        set(state => ({
          currentAppId: appId,
          sessionHistory: pushHistory(state.sessionHistory, appId),
          runningApps: runningApps.map(a =>
            a.id === appId ? { ...a, isMinimized: false, lastActiveAt: Date.now() } : a
          ),
        }));
      },
  
      isAppRunning: (appId) => {
        return get().runningApps.some(a => a.id === appId);
      },
  
      getRunningApp: (appId) => {
        return get().runningApps.find(a => a.id === appId);
      },
    }),
    {
      name: 'dex-running-apps',
      storage: debouncedJsonStorage,
      partialize: (state) => ({
        // Persist currentAppId and sessionHistory; runningApps resets on restart to avoid ghost apps
        currentAppId: state.currentAppId,
        sessionHistory: state.sessionHistory,
      }),
    }
  )
);

// Expose store globally for UKI system tool access
if (typeof window !== 'undefined') {
  window.__dexRunningApps = useRunningApps as unknown as Window['__dexRunningApps'];
}

// ---------------------------------------------------------------------------
// Recovery Level 3 — last-session journal.
// runningApps intentionally resets on restart (no ghost apps), so a separate
// lightweight journal records what was open. A clean shutdown marks the
// record clean; after a crash the record stays dirty and the shell offers a
// one-click workspace restore on next boot (see AppManager).
// ---------------------------------------------------------------------------

export interface LastSessionRecord {
  apps: Array<Pick<RunningApp, 'id' | 'name' | 'icon' | 'color'>>;
  currentAppId: string;
  timestamp: number;
  clean: boolean;
}

export const LAST_SESSION_KEY = 'dex-last-session';

export function readLastSession(): LastSessionRecord | null {
  try {
    const raw = localStorage.getItem(LAST_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastSessionRecord;
    if (!Array.isArray(parsed.apps)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLastSession(): void {
  try { localStorage.removeItem(LAST_SESSION_KEY); } catch { /* ignore */ }
}

if (typeof window !== 'undefined') {
  let journalTimer: ReturnType<typeof setTimeout> | null = null;

  const writeJournal = (clean: boolean) => {
    try {
      const s = useRunningApps.getState();
      const record: LastSessionRecord = {
        apps: s.runningApps.map(a => ({ id: a.id, name: a.name, icon: a.icon, color: a.color })),
        currentAppId: s.currentAppId,
        timestamp: Date.now(),
        clean,
      };
      localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(record));
    } catch { /* never interfere with the session itself */ }
  };

  useRunningApps.subscribe((state, prev) => {
    if (state.runningApps === prev.runningApps && state.currentAppId === prev.currentAppId) return;
    if (journalTimer) clearTimeout(journalTimer);
    journalTimer = setTimeout(() => writeJournal(false), 800);
  });

  const markClean = () => {
    if (journalTimer) clearTimeout(journalTimer);
    writeJournal(true);
  };
  window.addEventListener('pagehide', markClean);
  window.addEventListener('beforeunload', markClean);
}

// ---------------------------------------------------------------------------
// Selector-based subscriptions (item 146) — minimize re-renders
// ---------------------------------------------------------------------------
export const useCurrentAppId = () => useRunningApps(s => s.currentAppId);
export const useRunningAppsList = () => useRunningApps(s => s.runningApps);
export const useRunningAppCount = () => useRunningApps(s => s.runningApps.length);
export const useIsAppRunning = (appId: string) => useRunningApps(s => s.runningApps.some(a => a.id === appId));
// useShallow: the selector returns a fresh object/array each call, so without
// shallow equality every subscriber would re-render on ANY store change — the
// exact re-render storm these selector hooks exist to prevent.
export const useRunningAppActions = () => useRunningApps(useShallow(s => ({
  launchApp: s.launchApp,
  closeApp: s.closeApp,
  closeAllApps: s.closeAllApps,
  setCurrentApp: s.setCurrentApp,
  minimizeApp: s.minimizeApp,
  restoreApp: s.restoreApp,
  bringToFront: s.bringToFront,
})));

/** Returns app IDs ordered by most-recently-used (excludes apps no longer running) */
export const useRecentlyUsedApps = () => useRunningApps(useShallow(s => {
  const running = new Set(s.runningApps.map(a => a.id));
  return s.sessionHistory.filter(id => running.has(id));
}));

// App definitions with colors and shortcuts for UI
// Platform release stamped onto every built-in app so dock, Launchpad,
// Settings -> About, and UKI all report the build version (package.json).
const PLATFORM_VERSION = getBundledAppVersion();
const PLATFORM_BUILD_DATE = '2026-11-01';

const _M = platform.isMac ? '⌘' : 'Ctrl';
const _O = platform.isMac ? '⌥' : 'Alt';

export const APP_DEFINITIONS: Record<string, { name: string; color: string; icon: string; shortcut?: string; version?: string; buildDate?: string; description?: string; category?: 'creative' | 'system' | 'productivity' | 'utility' | 'media' }> = {
  // Core System Apps
  home: { name: 'Home', color: '#EBEBEB', icon: 'home', shortcut: `${_M}+1`, version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'system', description: 'The desktop: clock, search, recent items and open apps' },
  files: { name: 'Files', color: '#339AF0', icon: 'files', shortcut: `${_M}+3`, version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'system', description: 'Browse, open, tag and manage the files on this computer' },
  browser: { name: 'Browser', color: '#5E5CE6', icon: 'browser', shortcut: `${_M}+6`, version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'system', description: 'Web browser with tabs, bookmarks and history' },
  transfers: { name: 'Share', color: '#32D74B', icon: 'share', shortcut: `${_O}+T`, version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'system', description: 'Send files to another device, or share them with a link and QR code' },
  settings: { name: 'Settings', color: 'var(--color-text-tertiary)', icon: 'settings', shortcut: `${_M}+2`, version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'system', description: 'Appearance, privacy, permissions and system preferences for DEX' },
  taskmanager: { name: 'Task Manager', color: 'var(--color-accent)', icon: 'taskmanager', shortcut: `${_M}+Shift+Esc`, version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'system', description: 'Monitor open DEX apps, system load, and native processes' },
  liveactivity: { name: 'Live Activity', color: '#32D74B', icon: 'activity', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'system', description: 'A live, browsable feed of everything happening across DEX' },
  inbox: { name: 'Inbox', color: '#64d2ff', icon: 'bell', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'system', description: 'Unified feed of notifications and cross-app activity' },
  spaces: { name: 'Spaces', color: '#bf5af2', icon: 'layers', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'system', description: 'Snapshot and restore your open apps and project as named workspaces' },
  projectdash: { name: 'Project', color: 'var(--color-accent)', icon: 'dashboard', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'productivity', description: 'Per-project overview: tasks, notes, and recent activity' },
  backup: { name: 'Backup & Sync', color: '#30d158', icon: 'shield', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'system', description: 'Encrypted backup, restore, and folder sync of all your DEX data' },
  extensions: { name: 'Extensions', color: '#ff9f0a', icon: 'puzzle', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'system', description: 'Install, enable, and permission-gate local DEX extensions' },

  // Productivity Apps
  notes: { name: 'Notes', color: 'var(--color-warning)', icon: 'notes', shortcut: `${_M}+4`, version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'productivity', description: 'Write and organise notes with rich formatting' },
  tasks: { name: 'Tasks', color: 'var(--color-warning)', icon: 'tasks', shortcut: `${_M}+5`, version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'productivity', description: 'To-do lists with due dates and priorities' },
  workflows: { name: 'Workflows', color: '#BF5AF2', icon: 'workflows', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'productivity', description: 'Build automations by connecting steps on a canvas' },
  ledger: { name: 'Ledger', color: '#0A84FF', icon: 'ledger', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'productivity', description: 'Local-first budgeting: accounts, transactions, envelope budget, reconciliation and reports' },
  calendar: { name: 'Calendar', color: 'var(--color-error)', icon: 'calendar', shortcut: `${_M}+8`, version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'productivity', description: 'Events and schedules by day, week and month' },

  // Media Apps
  gallery: { name: 'Gallery', color: '#FF375F', icon: 'gallery', shortcut: `${_M}+7`, version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'media', description: 'View and organise pictures and videos' },
  audio: { name: 'Music', color: '#FC3D39', icon: 'audio', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'media', description: 'Play music from your library' },

  // Utility Apps
  power: { name: 'Power', color: 'var(--color-error)', icon: 'power', shortcut: `${_O}+P`, version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'utility', description: 'Battery, power mode and energy use' },
  calculator: { name: 'Calculator', color: 'var(--color-text-tertiary)', icon: 'calculator', shortcut: `${_O}+C`, version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'utility', description: 'Standard and scientific calculator' },
  passwordgenerator: { name: 'Password Generator', color: 'var(--color-accent)', icon: 'key', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'utility', description: 'Generate strong passwords and passphrases' },

  // DEX Creative Suite
  videoeditor: { name: 'VINX', color: '#BF5AF2', icon: 'videoeditor', shortcut: `${_O}+V`, version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, description: 'Professional video editing with multi-track timeline, effects, and color grading', category: 'creative' },
  imosion: { name: 'Imosion', color: '#FF6B35', icon: 'imosion', shortcut: `${_O}+I`, version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, description: 'Professional audio workstation with mixer routing, MIDI, and 32-bit float processing', category: 'creative' },
  prism: { name: 'PRISM', color: 'var(--color-success)', icon: 'prism', shortcut: `${_O}+R`, version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, description: 'Advanced image editing with layers, selections, filters, and non-destructive adjustments', category: 'creative' },
  flux: { name: 'FLUX', color: '#64D2FF', icon: 'flux', shortcut: `${_O}+F`, version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, description: 'Motion graphics and visual effects with keyframe animation and particle systems', category: 'creative' },
  forge: { name: 'FORGE', color: 'var(--color-warning)', icon: 'forge', shortcut: `${_O}+G`, version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, description: 'Batch media encoding and transcoding with GPU acceleration and format presets', category: 'creative' },
  axl: { name: 'AXL', color: 'var(--color-accent)', icon: 'axl', shortcut: `${_O}+X`, version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, description: 'Engineering design studio with parametric modeling, simulation, and technical drawing', category: 'creative' },

  // DEX Rewind
  rewind: { name: 'Rewind', color: 'var(--color-accent)', icon: 'rewind', shortcut: `${_O}+W`, version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'utility', description: 'A local log of your activity that you can search; nothing leaves this computer' },

  // Project Management
  kanban: { name: 'Kanban', color: '#5E5CE6', icon: 'kanban', shortcut: `${_M}+9`, version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'productivity', description: 'Plan work on boards with columns and cards' },

  // Achievements
  achievements: { name: 'Trophies', color: 'var(--color-warning)', icon: 'achievements', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'utility', description: 'Progress, unlocks and daily challenges' },

  // System - Recycle Bin
  recyclebin: { name: 'Trash', color: 'var(--color-text-tertiary)', icon: 'recyclebin', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'system', description: 'Restore or permanently remove deleted items' },

  // New Standalone Apps
  weather: { name: 'Weather', color: '#64D2FF', icon: 'weather', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'utility', description: 'Current conditions and forecast' },
  worldclock: { name: 'World Clock', color: 'var(--color-warning)', icon: 'worldclock', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'utility', description: 'The time in cities around the world' },
  noisegenerator: { name: 'Noise', color: 'var(--color-success)', icon: 'noisegenerator', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'media', description: 'Layered background noise with presets and a sleep timer' },
  dexcode: { name: 'DexCode', color: 'var(--color-text-primary)', icon: 'dexcode', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'productivity', description: 'Code editor with a built-in terminal and plain-English scripting' },
  git: { name: 'Git', color: '#F05133', icon: 'git-branch', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'productivity', description: 'Source control — status, stage, commit, branches, pull/push, and log for any repo' },
  env: { name: 'Environment', color: '#64D2FF', icon: 'code', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'productivity', description: 'View system environment variables and manage DEX-scoped overlays per app' },
  ssh: { name: 'SSH', color: '#30D158', icon: 'terminal', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'productivity', description: 'SSH connection profiles, key generation, and quick connect commands' },
  nexus: { name: 'Nexus', color: 'var(--color-accent)', icon: 'nexus', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'productivity', description: 'Live system load, running apps and UKI activity' },

  // Utility Apps (standalone)
  stopwatch: { name: 'Stopwatch', color: 'var(--color-warning)', icon: 'stopwatch', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'utility', description: 'Stopwatch with laps' },
  unitconverter: { name: 'Converter', color: '#5E5CE6', icon: 'unitconverter', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'utility', description: 'Convert between units of measurement' },
  pomodoro: { name: 'Pomodoro', color: 'var(--color-error)', icon: 'pomodoro', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'productivity', description: 'Focus timer with work and break intervals' },
  qrcode: { name: 'QR Code', color: 'var(--color-success)', icon: 'qrcode', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'utility', description: 'Create QR codes from text and links' },
  colorpicker: { name: 'Colors', color: '#BF5AF2', icon: 'colorpicker', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'creative', description: 'Pick colours, build palettes and copy colour codes' },
  learn: { name: 'Learn', color: '#5E5CE6', icon: 'learn', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'system', description: 'Shortcuts, tips and your usage patterns, kept on this computer' },
  collabhub: { name: 'Collab Hub', color: '#5E5CE6', icon: 'collabhub', shortcut: 'Alt+H', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, description: 'Real-time collaboration for creative projects with sharing, chat, and checkpoints', category: 'productivity' },
  canvas: { name: 'Canvas', color: '#FF9500', icon: 'canvas', shortcut: 'Alt+D', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, description: 'Whiteboard and drawing: sticky notes, shapes, frames, connectors, images and paint layers', category: 'creative' },
  creativehub: { name: 'Creative Hub', color: '#5E5CE6', icon: 'palette', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, description: 'Recent projects, creative apps, templates and storage in one place', category: 'creative' },
  timer: { name: 'Timer', color: '#30D158', icon: 'timer', shortcut: 'Alt+M', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, description: 'Simple countdown timer with presets', category: 'utility' },

  // New Standalone Apps (Wave 15) -- unique icon keys (NOT generic file-type icons)
  screenrecorder: { name: 'Screen Recorder', color: '#FF453A', icon: 'screenrecorder', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'media', description: 'Record desktop and windows to webm video' },
  presentation: { name: 'Presentation', color: '#FF9F0A', icon: 'presentation', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'productivity', description: 'Build and present slide decks with transitions' },
  pdfviewer: { name: 'PDF Viewer', color: '#5E5CE6', icon: 'pdfviewer', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'productivity', description: 'Read and annotate PDF documents' },
  pixelart: { name: 'Pixel Art', color: '#34C759', icon: 'pixelart', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'creative', description: 'NES-style pixel grid editor with frames' },
  maps: { name: 'DEX Maps', color: 'var(--color-app-maps)', icon: 'maps', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'utility', description: 'Interactive vector maps, place search, and navigation' },
  powerrename: { name: 'PowerRename', color: '#FF375F', icon: 'powerrename', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'utility', description: 'Batch file renaming with find/replace, regex, case transforms, and numbering' },

  // Storefront and Games surfaces (registry-backed so dock, Launchpad, UKI resolve metadata)
  store: { name: 'Store', color: '#0A84FF', icon: 'store', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'system', description: 'Discover and install DEX apps and plugins from the catalog' },
  games: { name: 'Games', color: '#30D158', icon: 'games', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'media', description: 'Built-in casual games hub' },

  // Health & Bio Engineering
  health: { name: 'Health Studio', color: '#32D74B', icon: 'activity', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'utility', description: 'Body composition, energy expenditure, cardio zones, and hydration targets' },
  bio: { name: 'Bio Engineering Studio', color: '#5E5CE6', icon: 'flux', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'utility', description: 'Sequence projects: FASTA import/export, six-frame ORFs, restriction digests, GC profiles, physical properties and unit-aware bench calculations' },
  terminal: { name: 'Terminal', color: '#8E8E93', icon: 'terminal', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'productivity', description: 'Shell sessions on a real pseudoterminal: tabs, split panes, search, copy/paste' },
  security: { name: 'Security Center', color: '#FF9F0A', icon: 'lock', version: PLATFORM_VERSION, buildDate: PLATFORM_BUILD_DATE, category: 'system', description: 'UKI action audit trail — full traceability of everything the assistant does' },
};
