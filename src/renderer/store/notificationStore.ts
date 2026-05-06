// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * Enhanced Notification System (Items 34-40)
 * Rich notifications with grouping, priority, and actions
 */

import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';
export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'progress';

export interface NotificationAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  primary?: boolean;
  destructive?: boolean;
  onClick: () => void;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  icon?: React.ReactNode;
  priority: NotificationPriority;
  timestamp: number;
  read: boolean;
  dismissed: boolean;
  persistent?: boolean;
  groupId?: string;
  appId?: string;
  appIcon?: React.ReactNode;
  actions?: NotificationAction[];
  progress?: number; // 0-100 for progress type
  autoHideMs?: number;
  sound?: boolean;
  vibrate?: boolean;
  badge?: number;
}

export interface NotificationGroup {
  id: string;
  title: string;
  appId?: string;
  count: number;
  notifications: Notification[];
  collapsed: boolean;
}

export interface NotificationPreferences {
  enabled: boolean;
  sound: boolean;
  vibrate: boolean;
  doNotDisturb: boolean;
  doNotDisturbSchedule?: {
    enabled: boolean;
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
  };
  priorityFilter: NotificationPriority[];
  blockedApps: string[];
  groupByApp: boolean;
  maxVisible: number;
  autoHideMs: number;
}

// ============================================================================
// Default Preferences
// ============================================================================

const defaultPreferences: NotificationPreferences = {
  enabled: true,
  sound: true,
  vibrate: false,
  doNotDisturb: false,
  priorityFilter: ['low', 'normal', 'high', 'urgent'],
  blockedApps: [],
  groupByApp: true,
  maxVisible: 5,
  autoHideMs: 5000,
};

// ============================================================================
// Notification Store
// ============================================================================

interface NotificationState {
  notifications: Notification[];
  preferences: NotificationPreferences;
  
  // Actions
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read' | 'dismissed'>) => string;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  dismissNotification: (id: string) => void;
  dismissAll: () => void;
  clearAll: () => void;
  updateProgress: (id: string, progress: number) => void;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => void;
  
  // Getters
  getUnreadCount: () => number;
  getGroupedNotifications: () => NotificationGroup[];
  getActiveNotifications: () => Notification[];
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  preferences: defaultPreferences,

  addNotification: (notification) => {
    const { preferences, notifications } = get();
    
    // Check if notifications are enabled
    if (!preferences.enabled) return '';
    
    // Check Do Not Disturb
    if (preferences.doNotDisturb && notification.priority !== 'urgent') return '';
    
    // Check DND schedule
    if (preferences.doNotDisturbSchedule?.enabled) {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const { startHour, startMinute, endHour, endMinute } = preferences.doNotDisturbSchedule;
      
      const nowMinutes = hour * 60 + minute;
      const startMinutes = startHour * 60 + startMinute;
      const endMinutes = endHour * 60 + endMinute;
      
      const inDND = startMinutes <= endMinutes
        ? nowMinutes >= startMinutes && nowMinutes <= endMinutes
        : nowMinutes >= startMinutes || nowMinutes <= endMinutes;
      
      if (inDND && notification.priority !== 'urgent') return '';
    }
    
    // Check blocked apps
    if (notification.appId && preferences.blockedApps.includes(notification.appId)) return '';
    
    // Check priority filter
    if (!preferences.priorityFilter.includes(notification.priority)) return '';
    
    const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    const newNotification: Notification = {
      ...notification,
      id,
      timestamp: Date.now(),
      read: false,
      dismissed: false,
      autoHideMs: notification.autoHideMs ?? preferences.autoHideMs,
      sound: notification.sound ?? preferences.sound,
      vibrate: notification.vibrate ?? preferences.vibrate,
    };
    
    set(state => ({
      notifications: [newNotification, ...state.notifications].slice(0, 100), // Keep max 100
    }));
    
    // Play sound if enabled
    if (newNotification.sound && notification.priority !== 'low') {
      playNotificationSound(notification.priority);
    }
    
    // Auto-hide for non-persistent notifications
    if (!notification.persistent && newNotification.autoHideMs) {
      setTimeout(() => {
        get().dismissNotification(id);
      }, newNotification.autoHideMs);
    }
    
    return id;
  },

  removeNotification: (id) => {
    set(state => ({
      notifications: state.notifications.filter(n => n.id !== id),
    }));
  },

  markAsRead: (id) => {
    set(state => ({
      notifications: state.notifications.map(n =>
        n.id === id ? { ...n, read: true } : n
      ),
    }));
  },

  markAllAsRead: () => {
    set(state => ({
      notifications: state.notifications.map(n => ({ ...n, read: true })),
    }));
  },

  dismissNotification: (id) => {
    set(state => ({
      notifications: state.notifications.map(n =>
        n.id === id ? { ...n, dismissed: true } : n
      ),
    }));
  },

  dismissAll: () => {
    set(state => ({
      notifications: state.notifications.map(n => ({ ...n, dismissed: true })),
    }));
  },

  clearAll: () => {
    set({ notifications: [] });
  },

  updateProgress: (id, progress) => {
    set(state => ({
      notifications: state.notifications.map(n =>
        n.id === id ? { ...n, progress: Math.min(100, Math.max(0, progress)) } : n
      ),
    }));
  },

  updatePreferences: (prefs) => {
    set(state => ({
      preferences: { ...state.preferences, ...prefs },
    }));
    
    // Persist to localStorage
    try {
      const current = get().preferences;
      localStorage.setItem('dex-notification-prefs', JSON.stringify(current));
    } catch (e) {
      console.warn('[Notifications] Failed to persist preferences:', e);
    }
  },

  getUnreadCount: () => {
    return get().notifications.filter(n => !n.read && !n.dismissed).length;
  },

  getGroupedNotifications: () => {
    const { notifications, preferences } = get();
    const active = notifications.filter(n => !n.dismissed);
    
    if (!preferences.groupByApp) {
      return [{
        id: 'all',
        title: 'All Notifications',
        count: active.length,
        notifications: active,
        collapsed: false,
      }];
    }
    
    const groups = new Map<string, Notification[]>();
    
    for (const notif of active) {
      const key = notif.groupId || notif.appId || 'other';
      const group = groups.get(key) || [];
      group.push(notif);
      groups.set(key, group);
    }
    
    return Array.from(groups.entries()).map(([id, notifs]) => ({
      id,
      title: notifs[0].appId || 'Other',
      appId: notifs[0].appId,
      count: notifs.length,
      notifications: notifs,
      collapsed: notifs.length > 3,
    }));
  },

  getActiveNotifications: () => {
    const { notifications, preferences } = get();
    return notifications
      .filter(n => !n.dismissed)
      .slice(0, preferences.maxVisible);
  },
}));

// ============================================================================
// Sound Effects
// ============================================================================

const notificationSounds: Record<NotificationPriority, string> = {
  low: '/sounds/notif-low.mp3',
  normal: '/sounds/notif-normal.mp3',
  high: '/sounds/notif-high.mp3',
  urgent: '/sounds/notif-urgent.mp3',
};

function playNotificationSound(priority: NotificationPriority): void {
  try {
    // Check if we have Web Audio API
    if (typeof AudioContext === 'undefined' && typeof (window as any).webkitAudioContext === 'undefined') {
      return;
    }
    
    // Generate a simple beep using Web Audio API instead of loading files
    const AudioCtx = AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioCtx();
    
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    // Different frequencies for different priorities
    const freqs: Record<NotificationPriority, number> = {
      low: 440,
      normal: 523,
      high: 659,
      urgent: 880,
    };
    
    oscillator.frequency.value = freqs[priority];
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
    
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.2);
    
    // Cleanup
    setTimeout(() => {
      audioCtx.close().catch(() => {});
    }, 500);
  } catch (e) {
    // Silently fail - audio is non-essential
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

export function createInfoNotification(title: string, message?: string, options?: Partial<Notification>): Omit<Notification, 'id' | 'timestamp' | 'read' | 'dismissed'> {
  return {
    type: 'info',
    title,
    message,
    priority: 'normal',
    ...options,
  };
}

export function createSuccessNotification(title: string, message?: string, options?: Partial<Notification>): Omit<Notification, 'id' | 'timestamp' | 'read' | 'dismissed'> {
  return {
    type: 'success',
    title,
    message,
    priority: 'normal',
    ...options,
  };
}

export function createWarningNotification(title: string, message?: string, options?: Partial<Notification>): Omit<Notification, 'id' | 'timestamp' | 'read' | 'dismissed'> {
  return {
    type: 'warning',
    title,
    message,
    priority: 'high',
    ...options,
  };
}

export function createErrorNotification(title: string, message?: string, options?: Partial<Notification>): Omit<Notification, 'id' | 'timestamp' | 'read' | 'dismissed'> {
  return {
    type: 'error',
    title,
    message,
    priority: 'high',
    persistent: true,
    ...options,
  };
}

export function createProgressNotification(title: string, progress: number, options?: Partial<Notification>): Omit<Notification, 'id' | 'timestamp' | 'read' | 'dismissed'> {
  return {
    type: 'progress',
    title,
    priority: 'low',
    progress,
    persistent: true,
    ...options,
  };
}

// ============================================================================
// Notification Badge Manager
// ============================================================================

export function updateAppBadge(count: number): void {
  try {
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        (navigator as any).setAppBadge(count);
      } else {
        (navigator as any).clearAppBadge();
      }
    }
  } catch (e) {
    // Badge API not supported
  }
}

// ============================================================================
// Time Formatting
// ============================================================================

export function formatNotificationTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  
  return new Date(timestamp).toLocaleDateString();
}

// ============================================================================
// Initialize from localStorage
// ============================================================================

export function initNotificationPreferences(): void {
  try {
    const stored = localStorage.getItem('dex-notification-prefs');
    if (stored) {
      const prefs = JSON.parse(stored);
      useNotificationStore.getState().updatePreferences(prefs);
    }
  } catch (e) {
    console.warn('[Notifications] Failed to load preferences:', e);
  }
}
