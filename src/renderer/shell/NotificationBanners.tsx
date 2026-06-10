// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Notification Banners
 * Top-right sliding banners with frosted glass, auto-dismiss,
 * progress indicator, stacking, swipe-to-dismiss, grouping, and undo.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { isReduceMotion } from '../utils/MotionController';
import { playNotification } from './SpatialAudio';
import { selectVisible } from '../../shared/notifications/center';
import type { NotificationRecord, NotificationPriority } from '../../shared/notifications/group';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface BannerNotification {
  id: string;
  title: string;
  body?: string;
  /** Accent color override */
  color?: string;
  /** Icon type for left badge */
  icon?: 'info' | 'success' | 'warning' | 'error';
  /** Auto-dismiss duration in ms (default 4000) */
  duration?: number;
  /** Deep link target */
  deepLink?: string;
  /** Action buttons */
  actions?: { label: string; onClick: () => void }[];
  /** Timestamp */
  timestamp?: number;
  /** Source app or category for grouping */
  source?: string;
  /** Priority: 'low' | 'normal' | 'high' | 'urgent' */
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  /** Undo action (if provided, shows undo button) */
  undoAction?: () => void;
  /** Whether notification has been read */
  read?: boolean;
}

interface NotificationBannersProps {
  notifications: BannerNotification[];
  onDismiss: (id: string) => void;
  onClick?: (notification: BannerNotification) => void;
}

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 4000;
const BANNER_WIDTH = 320;
const MAX_HISTORY = 50;

/** Min interval (ms) between two banners with same title to be considered duplicates */
const DUPLICATE_COALESCE_MS = 5000;

// Priority sort order (higher = more important)
const PRIORITY_ORDER: Record<string, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

// ---------------------------------------------------------------------------
// RELATIVE TIME FORMATTER
// ---------------------------------------------------------------------------

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// GROUP NOTIFICATIONS BY SOURCE
// ---------------------------------------------------------------------------

interface NotificationGroup {
  source: string;
  notifications: BannerNotification[];
  latestTimestamp: number;
  unreadCount: number;
}

function groupNotificationsBySource(notifications: BannerNotification[]): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>();
  
  for (const n of notifications) {
    const source = n.source || 'System';
    if (!groups.has(source)) {
      groups.set(source, {
        source,
        notifications: [],
        latestTimestamp: 0,
        unreadCount: 0,
      });
    }
    const group = groups.get(source)!;
    group.notifications.push(n);
    if (n.timestamp && n.timestamp > group.latestTimestamp) {
      group.latestTimestamp = n.timestamp;
    }
    if (!n.read) group.unreadCount++;
  }

  // Sort groups by latest timestamp
  return Array.from(groups.values()).sort((a, b) => b.latestTimestamp - a.latestTimestamp);
}

// ---------------------------------------------------------------------------
// SINGLE BANNER
// ---------------------------------------------------------------------------

const Banner: React.FC<{
  notification: BannerNotification;
  index: number;
  onDismiss: (id: string) => void;
  onClick?: (notification: BannerNotification) => void;
}> = ({ notification, index, onDismiss, onClick }) => {
  const [hovered, setHovered] = useState(false);
  const [progress, setProgress] = useState(1);
  const [swipeX, setSwipeX] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(performance.now());
  const pausedAtRef = useRef<number | null>(null);
  const duration = notification.duration ?? DEFAULT_DURATION;
  const bannerRef = useRef<HTMLDivElement>(null);

  // Auto dismiss with progress (rAF -- auto-throttles when hidden, smoother
  // than a 250ms interval, no extra wake-ups when paused).
  useEffect(() => {
    startTimeRef.current = performance.now();
    const tick = () => {
      if (pausedAtRef.current !== null) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const elapsed = performance.now() - startTimeRef.current;
      const remaining = 1 - elapsed / duration;
      if (remaining <= 0) {
        onDismiss(notification.id);
        return;
      }
      setProgress(remaining);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [notification.id, duration, onDismiss]);

  // Pause on hover
  useEffect(() => {
    if (hovered) {
      pausedAtRef.current = performance.now();
    } else if (pausedAtRef.current !== null) {
      const pausedDuration = performance.now() - pausedAtRef.current;
      startTimeRef.current += pausedDuration;
      pausedAtRef.current = null;
    }
  }, [hovered]);

  // Play sound on mount
  useEffect(() => {
    playNotification(window.innerWidth - BANNER_WIDTH / 2);
  }, []);

  // Swipe to dismiss
  const swipeStartRef = useRef<number | null>(null);
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    swipeStartRef.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (swipeStartRef.current === null) return;
    const dx = e.clientX - swipeStartRef.current;
    if (dx > 0) setSwipeX(dx); // Only swipe right to dismiss
  }, []);

  const handlePointerUp = useCallback(() => {
    if (swipeX > BANNER_WIDTH * 0.5) {
      onDismiss(notification.id);
    } else {
      setSwipeX(0);
    }
    swipeStartRef.current = null;
  }, [swipeX, notification.id, onDismiss]);

  const iconColor = (() => {
    switch (notification.icon) {
      case 'success': return 'var(--color-success)';
      case 'warning': return 'var(--color-warning)';
      case 'error': return 'var(--color-error)';
      default: return 'var(--color-accent)';
    }
  })();

  const iconSvg = (() => {
    switch (notification.icon) {
      case 'success':
        return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>;
      case 'warning':
        return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
      case 'error':
        return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>;
      default:
        return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>;
    }
  })();

  return (
    <div
      ref={bannerRef}
      role="alert"
      aria-live={notification.icon === 'error' ? 'assertive' : 'polite'}
      aria-label={`${notification.icon || 'info'} notification: ${notification.title}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={() => onClick?.(notification)}
      style={{
        width: BANNER_WIDTH,
        minHeight: 64,
        borderRadius: 12,
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-subtle)',
        boxShadow: 'var(--pg-shadow-panel)',
        overflow: 'hidden',
        cursor: 'pointer',
        transform: `translateX(${swipeX}px)`,
        opacity: swipeX > 0 ? Math.max(0, 1 - swipeX / BANNER_WIDTH) : 1,
        transition: swipeX === 0 && !isReduceMotion() ? 'transform 0.25s cubic-bezier(0.23,1,0.32,1), opacity 0.25s cubic-bezier(0.23,1,0.32,1)' : 'none',
        animation: isReduceMotion() ? 'none' : `bannerSlideIn 0.35s cubic-bezier(0.23,1,0.32,1)`,
        position: 'relative',
        touchAction: 'pan-y',
      }}
    >
      <div style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: `color-mix(in srgb, ${iconColor} 8%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {iconSvg}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.01em', lineHeight: 1.3 }}>
            {notification.title}
          </div>
          {notification.body && (
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>
              {notification.body}
            </div>
          )}
          {/* Source tag */}
          {notification.source && (
            <div style={{ 
              fontSize: 10, color: 'var(--color-text-tertiary)', 
              marginTop: 4, opacity: 0.8,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span style={{ 
                width: 4, height: 4, borderRadius: '50%', 
                background: iconColor, opacity: 0.6 
              }} />
              {notification.source}
            </div>
          )}
          {/* Actions on hover (including undo) */}
          {hovered && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {/* Undo button if available */}
              {notification.undoAction && (
                <button
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    notification.undoAction?.(); 
                    onDismiss(notification.id); 
                  }}
                  style={{
                    padding: '4px 10px', borderRadius: 6,
                    background: 'var(--color-warning)',
                    color: '#000',
                    border: 'none', fontSize: 11, fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'opacity 0.1s ease',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M3 10h10a5 5 0 0 1 5 5v2"/>
                    <polyline points="3 10 8 5 3 10 8 15"/>
                  </svg>
                  Undo
                </button>
              )}
              {/* Custom actions */}
              {notification.actions && notification.actions.map((action, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); action.onClick(); onDismiss(notification.id); }}
                  style={{
                    padding: '4px 10px', borderRadius: 6,
                    background: i === 0 && !notification.undoAction ? 'var(--color-accent)' : 'var(--color-border-subtle)',
                    color: i === 0 && !notification.undoAction ? '#fff' : 'var(--color-text-secondary)',
                    border: 'none', fontSize: 11, fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'opacity 0.1s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Priority indicator for urgent notifications */}
      {notification.priority === 'urgent' && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, var(--color-error), var(--color-warning))',
          borderRadius: '12px 12px 0 0',
        }} />
      )}

      {/* Progress indicator */}
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0,
        width: `${progress * 100}%`,
        height: 2,
        background: iconColor,
        opacity: 0.4,
        borderRadius: '0 1px 0 0',
        transition: 'width 0.05s linear',
      }} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// BANNER STACK (with priority sorting)
// ---------------------------------------------------------------------------

export const NotificationBanners: React.FC<NotificationBannersProps> = ({
  notifications,
  onDismiss,
  onClick,
}) => {
  // Visible/overflow selection via the shared, tested Notification Center model
  // (shared/notifications/center.ts) — one source of truth for priority ordering
  // and the "+N more" overflow, replacing the inline sort/slice.
  const { visible, overflow } = useMemo(() => {
    const records: NotificationRecord[] = notifications.map((n) => ({
      id: n.id,
      title: n.title || '',
      body: n.body,
      source: n.source || 'system',
      priority: (n.priority || 'normal') as NotificationPriority,
      ts: n.timestamp || 0,
    }));
    const sel = selectVisible(records, MAX_VISIBLE);
    const byId = new Map(notifications.map((n) => [n.id, n]));
    return {
      visible: sel.visible.map((r) => byId.get(r.id)).filter(Boolean) as BannerNotification[],
      overflow: sel.overflow,
    };
  }, [notifications]);

  if (visible.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 12,
      right: 12,
      zIndex: 'var(--z-notification)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      pointerEvents: 'auto',
    }}>
      {visible.map((n, i) => (
        <Banner
          key={n.id}
          notification={n}
          index={i}
          onDismiss={onDismiss}
          onClick={onClick}
        />
      ))}
      {/* Show "+N more" indicator if there are hidden notifications */}
      {overflow > 0 && (
        <div style={{
          fontSize: 11, color: 'var(--color-text-tertiary)',
          textAlign: 'center', padding: '4px 0',
          background: 'var(--color-bg-elevated)',
          borderRadius: 8, opacity: 0.9,
        }}>
          +{overflow} more notification{overflow > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// HOOK: useBannerNotifications
// ---------------------------------------------------------------------------

let _nextId = 0;

export interface DndSettings {
  enabled: boolean;
  /** Quiet hours: "HH:MM" 24-hour format, or undefined to disable */
  quietStart?: string;
  quietEnd?: string;
  /** Minimum priority that gets through in DND mode ('urgent' = only urgent) */
  allowPriority?: 'urgent' | 'high';
}

function isInQuietHours(settings: DndSettings): boolean {
  if (!settings.quietStart || !settings.quietEnd) return false;
  const now = new Date();
  const [startH, startM] = settings.quietStart.split(':').map(Number);
  const [endH, endM] = settings.quietEnd.split(':').map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;
  if (startMins <= endMins) {
    return nowMins >= startMins && nowMins < endMins;
  }
  // Spans midnight
  return nowMins >= startMins || nowMins < endMins;
}

export function useBannerNotifications() {
  const [banners, setBanners] = useState<BannerNotification[]>([]);
  const [history, setHistory] = useState<BannerNotification[]>([]);
  const [dnd, setDnd] = useState<DndSettings>({ enabled: false });
  /** Map of title → last timestamp for duplicate coalescing */
  const recentTitlesRef = useRef<Map<string, number>>(new Map());

  const push = useCallback((notification: Omit<BannerNotification, 'id'> & { id?: string }) => {
    const priority = notification.priority || 'normal';
    const priorityLevel = PRIORITY_ORDER[priority] || 2;

    // DND / quiet-hours suppression (urgent always gets through)
    if (priority !== 'urgent') {
      const inDnd = dnd.enabled || isInQuietHours(dnd);
      if (inDnd) {
        const allowLevel = PRIORITY_ORDER[dnd.allowPriority || 'urgent'] || 4;
        if (priorityLevel < allowLevel) return; // suppressed
      }
    }

    const id = notification.id ?? `banner-${++_nextId}`;
    const now = Date.now();

    // Duplicate coalescing — suppress if same title seen within threshold
    const titleKey = notification.title.trim().toLowerCase();
    const lastSeen = recentTitlesRef.current.get(titleKey);
    if (lastSeen && now - lastSeen < DUPLICATE_COALESCE_MS && priority !== 'urgent') return;
    recentTitlesRef.current.set(titleKey, now);
    // Prune entries past the coalesce window so the map can't grow unbounded
    // across a long session (one key per distinct notification title otherwise).
    if (recentTitlesRef.current.size > 64) {
      for (const [key, ts] of recentTitlesRef.current) {
        if (now - ts >= DUPLICATE_COALESCE_MS) recentTitlesRef.current.delete(key);
      }
    }

    const item: BannerNotification = {
      ...notification,
      id,
      timestamp: notification.timestamp || now,
      read: false,
      priority,
    };
    setBanners(prev => [...prev, item]);
    setHistory(prev => [item, ...prev].slice(0, MAX_HISTORY));
  }, [dnd]);

  const dismiss = useCallback((id: string) => {
    setBanners(prev => prev.filter(n => n.id !== id));
  }, []);

  const clear = useCallback(() => {
    setBanners([]);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const markAsRead = useCallback((id: string) => {
    setHistory(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllAsRead = useCallback(() => {
    setHistory(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const getUnreadCount = useCallback(() => {
    return history.filter(n => !n.read).length;
  }, [history]);

  const getGroupedHistory = useCallback((): NotificationGroup[] => {
    return groupNotificationsBySource(history);
  }, [history]);

  /** Filter banners by minimum priority */
  const getFilteredBanners = useCallback((minPriority: 'low' | 'normal' | 'high' | 'urgent' = 'low') => {
    const minLevel = PRIORITY_ORDER[minPriority] || 1;
    return banners.filter(n => (PRIORITY_ORDER[n.priority || 'normal'] || 2) >= minLevel);
  }, [banners]);

  return {
    banners, push, dismiss, clear,
    history, clearHistory,
    markAsRead, markAllAsRead, getUnreadCount, getGroupedHistory,
    getFilteredBanners,
    dnd, setDnd,
  };
}

// ---------------------------------------------------------------------------
// NOTIFICATION CENTER PANEL (with grouping and timeline)
// ---------------------------------------------------------------------------

const ICON_COLORS: Record<string, string> = {
  info: 'var(--color-accent)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
};

type ViewMode = 'timeline' | 'grouped';

export const NotificationCenter: React.FC<{
  open: boolean;
  notifications: BannerNotification[];
  onClearAll: () => void;
  onClose: () => void;
  onMarkAsRead?: (id: string) => void;
}> = ({ open, notifications, onClearAll, onClose, onMarkAsRead }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const groups = useMemo(() => groupNotificationsBySource(notifications), [notifications]);
  const unreadCount = notifications.filter(n => !n.read).length;

  if (!open) return null;

  return (
    <>
      {/* Backdrop with smooth fade */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 'var(--z-notification)',
          /* Dim scrim only — no full-screen blur when the notification center opens. */
          background: 'rgba(0,0,0,0.3)',
          animation: isReduceMotion() ? 'none' : 'notifBackdropIn 0.2s cubic-bezier(0.23,1,0.32,1)',
        } as React.CSSProperties}
        onClick={onClose}
      />
      {/* Panel slides in from right with smooth spring */}
      <div style={{
        position: 'fixed', top: 30, right: 8, bottom: 8,
        width: 360, zIndex: 'var(--z-notification)',
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 16,
        boxShadow: 'var(--pg-shadow-popover-strong)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        backdropFilter: 'var(--blur-xl)',
        animation: isReduceMotion() ? 'none' : 'notifCenterIn 0.28s cubic-bezier(0.23,1,0.32,1)',
      }}>
        <style>{`
          @keyframes notifBackdropIn {
            from { opacity: 0; backdrop-filter: blur(0); }
            to { opacity: 1; backdrop-filter: var(--blur-md); }
          }
          @keyframes notifCenterIn {
            from { opacity: 0; transform: translateX(24px) scale(0.96); }
            to { opacity: 1; transform: translateX(0) scale(1); }
          }
          @keyframes bannerSlideIn {
            0% { opacity: 0; transform: translateX(40px) scale(0.95); }
            100% { opacity: 1; transform: translateX(0) scale(1); }
          }
        `}</style>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px 12px',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 600, color: '#fff',
                background: 'var(--color-accent)',
                padding: '2px 6px', borderRadius: 10,
              }}>
                {unreadCount}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* View mode toggle */}
            <div style={{
              display: 'flex', background: 'var(--color-bg-hover)',
              borderRadius: 6, padding: 2,
            }}>
              <button
                onClick={() => setViewMode('timeline')}
                style={{
                  padding: '3px 8px', borderRadius: 4, border: 'none',
                  background: viewMode === 'timeline' ? 'var(--color-bg-elevated)' : 'transparent',
                  color: viewMode === 'timeline' ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                  fontSize: 10, fontWeight: 500, cursor: 'pointer',
                }}
                title="Timeline view"
              >
                Timeline
              </button>
              <button
                onClick={() => setViewMode('grouped')}
                style={{
                  padding: '3px 8px', borderRadius: 4, border: 'none',
                  background: viewMode === 'grouped' ? 'var(--color-bg-elevated)' : 'transparent',
                  color: viewMode === 'grouped' ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                  fontSize: 10, fontWeight: 500, cursor: 'pointer',
                }}
                title="Grouped by app"
              >
                Grouped
              </button>
            </div>
            {notifications.length > 0 && (
              <button
                onClick={onClearAll}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, color: 'var(--color-text-tertiary)',
                  fontWeight: 500, padding: '2px 6px', borderRadius: 6,
                  transition: 'color 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
              >
                Clear All
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                width: 22, height: 22, borderRadius: 6, border: 'none',
                background: 'var(--color-bg-hover)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-text-tertiary)',
              }}
              aria-label="Close notification center"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {notifications.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '48px 24px', gap: 8,
              color: 'var(--color-text-tertiary)', textAlign: 'center',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4 }}>
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)' }}>No notifications</span>
              <span style={{ fontSize: 11 }}>You're all caught up</span>
            </div>
          ) : viewMode === 'grouped' ? (
            /* Grouped View */
            groups.map(group => (
              <div key={group.source} style={{ marginBottom: 12 }}>
                {/* Group header */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '4px 0', marginBottom: 6,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {group.source}
                  </span>
                  {group.unreadCount > 0 && (
                    <span style={{
                      fontSize: 9, fontWeight: 600, color: 'var(--color-accent)',
                      background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
                      padding: '1px 5px', borderRadius: 8,
                    }}>
                      {group.unreadCount} new
                    </span>
                  )}
                </div>
                {/* Group notifications */}
                {group.notifications.map(n => {
                  const color = n.color ?? ICON_COLORS[n.icon ?? 'info'] ?? 'var(--color-accent)';
                  const relativeTime = n.timestamp ? formatRelativeTime(n.timestamp) : '';
                  return (
                    <div 
                      key={n.id} 
                      onClick={() => onMarkAsRead?.(n.id)}
                      style={{
                        padding: '10px 12px', borderRadius: 10, marginBottom: 4,
                        background: n.read ? 'var(--color-bg-surface)' : 'var(--color-bg-hover)',
                        border: `1px solid ${n.read ? 'var(--color-border-subtle)' : 'color-mix(in srgb, var(--color-accent) 19%, transparent)'}`,
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        {!n.read && (
                          <div style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: 'var(--color-accent)', flexShrink: 0, marginTop: 5,
                          }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: n.read ? 500 : 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                              {n.title}
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{relativeTime}</span>
                          </div>
                          {n.body && (
                            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.4, marginTop: 2 }}>
                              {n.body}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          ) : (
            /* Timeline View */
            notifications.map(n => {
              const color = n.color ?? ICON_COLORS[n.icon ?? 'info'] ?? 'var(--color-accent)';
              const relativeTime = n.timestamp ? formatRelativeTime(n.timestamp) : '';
              return (
                <div key={n.id} style={{
                  padding: '10px 12px', borderRadius: 10, marginBottom: 6,
                  background: 'var(--color-bg-surface)',
                  border: '1px solid var(--color-border-subtle)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: color, flexShrink: 0, marginTop: 4,
                      boxShadow: `0 0 6px color-mix(in srgb, ${color} 38%, transparent)`,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                          {n.title}
                        </span>
                        {relativeTime && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{relativeTime}</span>}
                      </div>
                      {n.source && (
                        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                          {n.source}
                        </div>
                      )}
                      {n.body && (
                        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.4, marginTop: 3 }}>
                          {n.body}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
};
