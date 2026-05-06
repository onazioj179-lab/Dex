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
import { persist } from 'zustand/middleware';
import { debouncedJsonStorage } from '../utils/debouncedStorage';
import { getMaxConcurrentApps, getStoredTier } from '../services/TierManager';
import { ContextBus } from '../services/ContextBus';

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
          // Check max concurrent app limit based on device tier
          const tier = getStoredTier() || 'mid';
          const maxApps = getMaxConcurrentApps(tier);
          if (runningApps.length >= maxApps) {
            // At limit — dispatch notification instead of launching
            window.dispatchEvent(new CustomEvent('dex-notification', {
              detail: {
                title: 'App Limit Reached',
                body: `Close an app first. Your device supports ${maxApps} apps at once.`,
                type: 'warning',
              },
            }));
            // Still focus home so user can manage apps
            set({ currentAppId: 'home' });
            return;
          }
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
(window as any).__dexRunningApps = useRunningApps;

// ---------------------------------------------------------------------------
// Selector-based subscriptions (item 146) — minimize re-renders
// ---------------------------------------------------------------------------
export const useCurrentAppId = () => useRunningApps(s => s.currentAppId);
export const useRunningAppsList = () => useRunningApps(s => s.runningApps);
export const useRunningAppCount = () => useRunningApps(s => s.runningApps.length);
export const useIsAppRunning = (appId: string) => useRunningApps(s => s.runningApps.some(a => a.id === appId));
export const useRunningAppActions = () => useRunningApps(s => ({
  launchApp: s.launchApp,
  closeApp: s.closeApp,
  closeAllApps: s.closeAllApps,
  setCurrentApp: s.setCurrentApp,
  minimizeApp: s.minimizeApp,
  restoreApp: s.restoreApp,
  bringToFront: s.bringToFront,
}));

/** Returns app IDs ordered by most-recently-used (excludes apps no longer running) */
export const useRecentlyUsedApps = () => useRunningApps(s => {
  const running = new Set(s.runningApps.map(a => a.id));
  return s.sessionHistory.filter(id => running.has(id));
});

// App definitions with colors and shortcuts for UI
export const APP_DEFINITIONS: Record<string, { name: string; color: string; icon: string; shortcut?: string; version?: string; buildDate?: string; description?: string; category?: 'creative' | 'system' | 'productivity' | 'utility' | 'media' }> = {
  // Core System Apps
  home: { name: 'Home', color: '#EBEBEB', icon: 'home', shortcut: 'Ctrl+1', category: 'system' },
  files: { name: 'Files', color: '#339AF0', icon: 'files', shortcut: 'Ctrl+3', category: 'system' },
  browser: { name: 'Browser', color: '#5E5CE6', icon: 'browser', shortcut: 'Ctrl+6', category: 'system' },
  transfers: { name: 'Share', color: '#32D74B', icon: 'share', shortcut: 'Alt+T', category: 'system' },
  settings: { name: 'Settings', color: 'var(--color-text-tertiary)', icon: 'settings', shortcut: 'Ctrl+2', category: 'system' },
  
  // Productivity Apps
  notes: { name: 'Notes', color: 'var(--color-warning)', icon: 'notes', shortcut: 'Ctrl+4', category: 'productivity' },
  tasks: { name: 'Tasks', color: 'var(--color-warning)', icon: 'tasks', shortcut: 'Ctrl+5', category: 'productivity' },
  workflows: { name: 'Workflows', color: '#BF5AF2', icon: 'workflows', category: 'productivity' },
  calendar: { name: 'Calendar', color: 'var(--color-error)', icon: 'calendar', shortcut: 'Ctrl+8', category: 'productivity' },
  
  // Media Apps
  gallery: { name: 'Gallery', color: '#FF375F', icon: 'gallery', shortcut: 'Ctrl+7', category: 'media' },
  audio: { name: 'Music', color: '#FC3D39', icon: 'audio', category: 'media' },
  
  // Utility Apps
  power: { name: 'Power', color: 'var(--color-error)', icon: 'power', shortcut: 'Alt+P', category: 'utility' },
  calculator: { name: 'Calculator', color: 'var(--color-text-tertiary)', icon: 'calculator', shortcut: 'Alt+C', category: 'utility' },
  passwordgenerator: { name: 'Password Gen', color: 'var(--color-success)', icon: 'lock', category: 'utility' },
  
  // DEX Creative Suite
  videoeditor: { name: 'VINX', color: '#BF5AF2', icon: 'videoeditor', shortcut: 'Alt+V', version: '1.0.0', buildDate: '2026-04-11', description: 'Professional video editing with multi-track timeline, effects, and color grading', category: 'creative' },
  imosion: { name: 'Imosion', color: '#FF6B35', icon: 'imosion', shortcut: 'Alt+I', version: '1.0.0', buildDate: '2026-04-11', description: 'Professional audio workstation with mixer routing, MIDI, and 32-bit float processing', category: 'creative' },
  prism: { name: 'PRISM', color: 'var(--color-success)', icon: 'prism', shortcut: 'Alt+R', version: '1.0.0', buildDate: '2026-04-11', description: 'Advanced image editing with layers, selections, filters, and non-destructive adjustments', category: 'creative' },
  flux: { name: 'FLUX', color: '#64D2FF', icon: 'flux', shortcut: 'Alt+F', version: '1.0.0', buildDate: '2026-04-11', description: 'Motion graphics and visual effects with keyframe animation and particle systems', category: 'creative' },
  forge: { name: 'FORGE', color: 'var(--color-warning)', icon: 'forge', shortcut: 'Alt+G', version: '1.0.0', buildDate: '2026-04-11', description: 'Batch media encoding and transcoding with GPU acceleration and format presets', category: 'creative' },
  axl: { name: 'AXL', color: 'var(--color-accent)', icon: 'axl', shortcut: 'Alt+X', version: '1.0.0', buildDate: '2026-04-11', description: 'Engineering design studio with parametric modeling, simulation, and technical drawing', category: 'creative' },

  // DEX Rewind
  rewind: { name: 'Rewind', color: 'var(--color-accent)', icon: 'rewind', shortcut: 'Alt+W', category: 'utility' },

  // Project Management
  kanban: { name: 'Kanban', color: '#5E5CE6', icon: 'kanban', shortcut: 'Ctrl+9', category: 'productivity' },

  // Achievements
  achievements: { name: 'Trophies', color: 'var(--color-warning)', icon: 'achievements', category: 'utility' },

  // System - Recycle Bin
  recyclebin: { name: 'Trash', color: 'var(--color-text-tertiary)', icon: 'recyclebin', category: 'system' },

  // New Standalone Apps
  weather: { name: 'Weather', color: '#64D2FF', icon: 'weather', category: 'utility' },
  worldclock: { name: 'World Clock', color: 'var(--color-warning)', icon: 'worldclock', category: 'utility' },
  noisegenerator: { name: 'Noise', color: 'var(--color-success)', icon: 'noisegenerator', category: 'media' },
  dexcode: { name: 'DexCode', color: 'var(--color-text-primary)', icon: 'dexcode', category: 'productivity' },
  nexus: { name: 'Nexus', color: 'var(--color-accent)', icon: 'nexus', category: 'productivity' },

  // Utility Apps (standalone)
  stopwatch: { name: 'Stopwatch', color: 'var(--color-warning)', icon: 'stopwatch', category: 'utility' },
  unitconverter: { name: 'Converter', color: '#5E5CE6', icon: 'unitconverter', category: 'utility' },
  pomodoro: { name: 'Pomodoro', color: 'var(--color-error)', icon: 'pomodoro', category: 'productivity' },
  qrcode: { name: 'QR Code', color: 'var(--color-success)', icon: 'qrcode', category: 'utility' },
  colorpicker: { name: 'Colors', color: '#BF5AF2', icon: 'colorpicker', category: 'creative' },
  learn: { name: 'Learn', color: '#5E5CE6', icon: 'learn', category: 'system' },
  collabhub: { name: 'Collab Hub', color: '#5E5CE6', icon: 'collabhub', shortcut: 'Alt+H', version: '1.0.0', buildDate: '2026-04-17', description: 'Real-time collaboration for creative projects with sharing, chat, and checkpoints', category: 'productivity' },
  canvas: { name: 'Canvas', color: '#FF9500', icon: 'canvas', shortcut: 'Alt+D', version: '1.0.0', buildDate: '2026-04-18', description: 'Clean drawing canvas for freeform sketching and drawing', category: 'creative' },
  timer: { name: 'Timer', color: '#30D158', icon: 'timer', shortcut: 'Alt+M', version: '1.0.0', buildDate: '2026-04-18', description: 'Simple countdown timer with presets', category: 'utility' },
};
