/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEX Running Apps Store
 * Tracks all currently running applications for OS-like window management
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { create } from 'zustand';

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
  
  // Actions
  launchApp: (app: Omit<RunningApp, 'launchedAt' | 'lastActiveAt' | 'isMinimized'>) => void;
  closeApp: (appId: string) => void;
  setCurrentApp: (appId: string) => void;
  minimizeApp: (appId: string) => void;
  restoreApp: (appId: string) => void;
  isAppRunning: (appId: string) => boolean;
  getRunningApp: (appId: string) => RunningApp | undefined;
}

export const useRunningApps = create<RunningAppsState>((set, get) => ({
  runningApps: [],
  currentAppId: 'home',
  
  launchApp: (app) => {
    const { runningApps } = get();
    const existing = runningApps.find(a => a.id === app.id);
    
    if (existing) {
      // App already running, just focus it
      set({
        currentAppId: app.id,
        runningApps: runningApps.map(a => 
          a.id === app.id 
            ? { ...a, lastActiveAt: Date.now(), isMinimized: false }
            : a
        ),
      });
    } else {
      // Launch new app
      const newApp: RunningApp = {
        ...app,
        launchedAt: Date.now(),
        lastActiveAt: Date.now(),
        isMinimized: false,
      };
      set({
        currentAppId: app.id,
        runningApps: [...runningApps, newApp],
      });
    }
  },
  
  closeApp: (appId) => {
    const { runningApps, currentAppId } = get();
    const newRunning = runningApps.filter(a => a.id !== appId);
    
    // If closing current app, go to home or last app
    let newCurrentId = currentAppId;
    if (currentAppId === appId) {
      newCurrentId = newRunning.length > 0 
        ? newRunning[newRunning.length - 1].id 
        : 'home';
    }
    
    set({
      runningApps: newRunning,
      currentAppId: newCurrentId,
    });
  },
  
  setCurrentApp: (appId) => {
    const { runningApps } = get();
    set({
      currentAppId: appId,
      runningApps: runningApps.map(a => 
        a.id === appId 
          ? { ...a, lastActiveAt: Date.now(), isMinimized: false }
          : a
      ),
    });
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
    set({
      currentAppId: appId,
      runningApps: runningApps.map(a => 
        a.id === appId 
          ? { ...a, isMinimized: false, lastActiveAt: Date.now() }
          : a
      ),
    });
  },
  
  isAppRunning: (appId) => {
    return get().runningApps.some(a => a.id === appId);
  },
  
  getRunningApp: (appId) => {
    return get().runningApps.find(a => a.id === appId);
  },
}));

// App definitions with colors and shortcuts for UI
export const APP_DEFINITIONS: Record<string, { name: string; color: string; icon: string; shortcut?: string }> = {
  // Core System Apps
  home: { name: 'Home', color: '#ffffff', icon: 'home', shortcut: 'Ctrl+1' },
  dashboard: { name: 'Dashboard', color: '#3b82f6', icon: 'dashboard' },
  files: { name: 'Files', color: '#3b82f6', icon: 'files', shortcut: 'Ctrl+2' },
  browser: { name: 'Browser', color: '#6366f1', icon: 'browser', shortcut: 'Ctrl+3' },
  transfers: { name: 'Share', color: '#10b981', icon: 'share', shortcut: 'Ctrl+4' },
  settings: { name: 'Settings', color: '#6b7280', icon: 'settings', shortcut: 'Ctrl+0' },
  
  // Productivity Apps
  notes: { name: 'Notes', color: '#ffcc00', icon: 'notes', shortcut: 'Ctrl+N' },
  tasks: { name: 'Tasks', color: '#34c759', icon: 'tasks', shortcut: 'Ctrl+T' },
  workflows: { name: 'Workflows', color: '#ff9500', icon: 'workflows' },
  calendar: { name: 'Calendar', color: '#ff3b30', icon: 'calendar' },
  
  // Media Apps
  gallery: { name: 'Gallery', color: '#ff2d55', icon: 'gallery' },
  audio: { name: 'Music', color: '#ff3b30', icon: 'audio' },
  video: { name: 'Video', color: '#af52de', icon: 'video' },
  
  // Utility Apps
  power: { name: 'Power', color: '#30d158', icon: 'power' },
  calculator: { name: 'Calculator', color: '#8e8e93', icon: 'calculator' },
  passwordgenerator: { name: 'Password Gen', color: '#007aff', icon: 'lock' },
  
  // DEX Creative Suite
  videoeditor: { name: 'VINX', color: '#8b5cf6', icon: 'videoeditor', shortcut: 'Alt+V' },
  imosion: { name: 'Imosion', color: '#f97316', icon: 'imosion', shortcut: 'Alt+I' },
  prism: { name: 'PRISM', color: '#06b6d4', icon: 'prism', shortcut: 'Alt+R' },
  flux: { name: 'FLUX', color: '#3b82f6', icon: 'flux', shortcut: 'Alt+F' },
  forge: { name: 'FORGE', color: '#f59e0b', icon: 'forge', shortcut: 'Alt+G' },

  // DEX Rewind
  rewind: { name: 'Rewind', color: '#0078d4', icon: 'rewind', shortcut: 'Alt+W' },

  // Games Hub
  games: { name: 'Games', color: '#ff6b6b', icon: 'games', shortcut: 'Alt+J' },

  // Project Management
  kanban: { name: 'Kanban', color: '#6366f1', icon: 'kanban', shortcut: 'Alt+K' },

  // Achievements
  achievements: { name: 'Trophies', color: '#f59e0b', icon: 'achievements' },
};
