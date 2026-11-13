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

import { rubberBand, shouldDismiss, type SwipeSample } from '../utils/swipeDismiss';
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { isReduceMotion } from '../utils/MotionController';
import { playNotification } from './SpatialAudio';
import { selectVisible } from '../../shared/notifications/center';
import type { NotificationRecord, NotificationPriority } from '../../shared/notifications/group';
import { summarizeGroup, type DigestItem } from '../../shared/notifications/digest';
import { readHubTarget } from '../services/notify';
import { readDexSetting } from '../hooks/useDexSetting';
import { doNotDisturbOn } from '../utils/notificationsAllowed';

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
  /**
   * Persisted hub `action` envelope (JSON string or object) carrying the deep-link
   * `target`. Present on hub-backed Notification Center items; absent on transient
   * banners. When it decodes to a target, the Center item becomes activatable.
   */
  action?: string | Record<string, unknown> | null;
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
    // duration <= 0 means "persistent" (critical urgency / alarm / incoming-call
    // scenarios per the freedesktop+MS notification model): never auto-dismiss,
    // keep the progress bar full, and rely on manual dismissal.
    if (duration <= 0) { setProgress(1); return; }
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

  // Play sound on mount (Settings > Notifications > Sound)
  useEffect(() => {
    if (readDexSetting('soundEnabled', true) && !doNotDisturbOn()) playNotification(window.innerWidth - BANNER_WIDTH / 2);
  }, []);

  // Swipe to dismiss: distance OR a quick flick (utils/swipeDismiss), rubber
  // band when pulled left, and a follow-through slide off-screen on dismiss.
  const swipeStartRef = useRef<number | null>(null);
  const samplesRef = useRef<SwipeSample[]>([]);
  const [leaving, setLeaving] = useState(false);
  // Set once a gesture moves past a small threshold, so the synthetic click that
  // follows pointerup doesn't fire the banner's onClick (deep-link) after a swipe.
  const draggedRef = useRef(false);
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    swipeStartRef.current = e.clientX;
    samplesRef.current = [{ x: e.clientX, t: e.timeStamp }];
    draggedRef.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (swipeStartRef.current === null) return;
    const dx = e.clientX - swipeStartRef.current;
    if (Math.abs(dx) > 4) draggedRef.current = true;
    const samples = samplesRef.current;
    samples.push({ x: e.clientX, t: e.timeStamp });
    if (samples.length > 12) samples.shift();
    setSwipeX(rubberBand(dx)); // right dismisses; left only gives a little
  }, []);

  const handlePointerUp = useCallback(() => {
    if (swipeStartRef.current === null) return;
    swipeStartRef.current = null;
    const width = bannerRef.current?.offsetWidth || BANNER_WIDTH;
    if (shouldDismiss(swipeX, samplesRef.current, width)) {
      if (isReduceMotion()) { onDismiss(notification.id); return; }
      // Follow through: finish the throw, then remove.
      setLeaving(true);
      setSwipeX(width + 32);
      window.setTimeout(() => onDismiss(notification.id), 180);
    } else {
      setSwipeX(0);
    }
  }, [swipeX, notification.id, onDismiss]);

  const handlePointerCancel = useCallback(() => {
    swipeStartRef.current = null;
    setSwipeX(0);
  }, []);

  const handleClick = useCallback(() => {
    // Suppress the click that trails a swipe gesture; reset for the next one.
    if (draggedRef.current) { draggedRef.current = false; return; }
    onClick?.(notification);
  }, [onClick, notification]);

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
      className="dex-liquid-glass"
      aria-live={notification.icon === 'error' ? 'assertive' : 'polite'}
      aria-label={`${notification.icon || 'info'} notification: ${notification.title}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={handleClick}
      style={{
        // Apple-style frosted notification: background/blur/border + specular rim
        // come from .dex-liquid-glass (auto-solid in lite mode). Keep the floating
        // drop shadow inline (composed with the class's specular insets).
        width: `min(${BANNER_WIDTH}px, calc(100vw - 48px))`,
        minHeight: 64,
        borderRadius: 14,
        boxShadow: 'var(--pg-shadow-panel), inset 0 1px 0 rgba(255,255,255,0.18), inset 1px 0 0 rgba(255,255,255,0.06), inset -1px 0 0 rgba(255,255,255,0.06)',
        overflow: 'hidden',
        cursor: 'pointer',
        transform: `translateX(${swipeX}px)`,
        opacity: swipeX > 0 ? Math.max(0, 1 - swipeX / BANNER_WIDTH) : 1,
        transition: (swipeX === 0 || leaving) && !isReduceMotion()
          ? `transform ${leaving ? '0.18s' : '0.25s'} cubic-bezier(0.23,1,0.32,1), opacity ${leaving ? '0.18s' : '0.25s'} cubic-bezier(0.23,1,0.32,1)`
          : 'none',
        animation: isReduceMotion() ? 'none' : `bannerSlideIn 0.22s cubic-bezier(0.23,1,0.32,1)`,
        position: 'relative',
        touchAction: 'pan-y',
      }}
    >
      <div style={{ padding: 'var(--space-3) 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
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
            <div style={{ display: 'flex', gap: 6, marginTop: 'var(--space-2)' }}>
              {/* Undo button if available */}
              {notification.undoAction && (
                <button
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    notification.undoAction?.(); 
                    onDismiss(notification.id); 
                  }}
                  style={{
                    padding: '4px 10px', borderRadius: 4,
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
                    padding: '4px 10px', borderRadius: 4,
                    background: i === 0 && !notification.undoAction ? 'var(--color-accent-fill)' : 'var(--color-border-subtle)',
                    color: i === 0 && !notification.undoAction ? 'var(--color-accent-text, #fff)' : 'var(--color-text-secondary)',
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
          borderRadius: '10px 10px 0 0',
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
      // Wall-aligned: sit just below the 34px top-bar chrome and flush to the
      // right edge, clearing a top/right-edge dock via the reserve vars (0 when
      // the dock is elsewhere). Was top:12/right:12, which floated the stack OVER
      // the top bar -- reading as unanchored chrome rather than placed UI.
      top: 'calc(34px + var(--dex-reserved-top, 0px) + 10px)',
      right: 'calc(var(--dex-reserved-right, 0px) + 12px)',
      zIndex: 'var(--z-notification)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-2)',
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
          borderRadius: 6, opacity: 0.9,
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

// ---------------------------------------------------------------------------
// CENTER CARD — one notification row, shared by the timeline + grouped views.
// Surfaces what the transient banner showed but the center used to drop: the
// persisted deep-link (an "Open" affordance) and any in-session action closures.
// ---------------------------------------------------------------------------

const CenterCard: React.FC<{
  n: BannerNotification;
  /** Mark the row read (fires on row click). */
  onMarkAsRead?: (id: string) => void;
  /** Activate the persisted deep-link target (fires on the Open affordance). */
  onActivate?: (n: BannerNotification) => void;
  /** Show the source line (timeline view); the grouped view has a source header. */
  showSource?: boolean;
  /** Remove this notification. */
  onDismiss?: (id: string) => void;
}> = ({ n, onMarkAsRead, onActivate, showSource, onDismiss }) => {
  const [hovered, setHovered] = useState(false);
  const color = n.color ?? ICON_COLORS[n.icon ?? 'info'] ?? 'var(--color-accent)';
  const relativeTime = n.timestamp ? formatRelativeTime(n.timestamp) : '';
  const target = readHubTarget(n.action);
  const closures = n.actions ?? [];

  return (
    <div
      onClick={() => onMarkAsRead?.(n.id)}
      // Keyboard parity: reachable with Tab, Enter/Space marks it read.
      role="button"
      tabIndex={0}
      aria-label={`${n.title}${n.read ? '' : ' (unread)'} — mark as read`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMarkAsRead?.(n.id); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '10px var(--space-3)', borderRadius: 10, marginBottom: 6,
        background: n.read ? 'var(--color-bg-surface)' : 'var(--color-bg-hover)',
        border: `1px solid ${n.read ? 'var(--color-border-subtle)' : 'color-mix(in srgb, var(--color-accent) 19%, transparent)'}`,
        cursor: 'pointer',
        transition: isReduceMotion() ? 'none' : 'background 0.15s ease, border-color 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: n.read ? 6 : 8, height: n.read ? 6 : 8, borderRadius: '50%',
          background: n.read ? 'var(--color-text-tertiary)' : color,
          flexShrink: 0, marginTop: 5,
          opacity: n.read ? 0.5 : 1,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 12, fontWeight: n.read ? 500 : 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
              {n.title}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {relativeTime && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{relativeTime}</span>}
              {onDismiss && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDismiss(n.id); }}
                  onKeyDown={(e) => e.stopPropagation()}
                  aria-label={`Dismiss ${n.title}`}
                  title="Dismiss"
                  style={{
                    width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    border: 'none', borderRadius: 4, background: 'transparent', cursor: 'pointer',
                    color: 'var(--color-text-tertiary)', padding: 0,
                    opacity: hovered ? 1 : 0.55,
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              )}
            </span>
          </div>
          {showSource && n.source && (
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{n.source}</div>
          )}
          {n.body && (
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.4, marginTop: 3 }}>
              {n.body}
            </div>
          )}
          {/* Actions row: persisted deep-link ("Open") + any in-session closures. */}
          {(target || closures.length > 0) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {target && (
                <button
                  onClick={(e) => { e.stopPropagation(); onActivate?.(n); }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', borderRadius: 6, border: 'none',
                    background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
                    color: 'var(--color-accent)', fontSize: 11, fontWeight: 600,
                    cursor: 'pointer',
                    transition: isReduceMotion() ? 'none' : 'background 0.12s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-accent) 26%, transparent)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-accent) 16%, transparent)'; }}
                >
                  Open
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              )}
              {closures.map((a, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); a.onClick(); }}
                  style={{
                    padding: '4px 10px', borderRadius: 6, border: '1px solid var(--color-border-subtle)',
                    background: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)',
                    fontSize: 11, fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Hover hint that the row is read-on-click when unread. */}
        {hovered && !n.read && !target && (
          <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', flexShrink: 0, marginTop: 4 }}>
            Mark read
          </span>
        )}
      </div>
    </div>
  );
};

export const NotificationCenter: React.FC<{
  open: boolean;
  notifications: BannerNotification[];
  onClearAll: () => void;
  onClose: () => void;
  onMarkAsRead?: (id: string) => void;
  /** Activate a persisted deep-link target (navigate + close). */
  onActivate?: (n: BannerNotification) => void;
  /** Remove one notification. */
  onDismiss?: (id: string) => void;
}> = ({ open, notifications, onClearAll, onClose, onMarkAsRead, onActivate, onDismiss }) => {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    try { return localStorage.getItem('dex-notif-center-view') === 'grouped' ? 'grouped' : 'timeline'; } catch { return 'timeline'; }
  });
  const setViewMode = (m: ViewMode) => {
    setViewModeState(m);
    try { localStorage.setItem('dex-notif-center-view', m); } catch { /* ignore */ }
  };
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes; focus moves into the panel while it is open and back after.
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      try { prev?.focus?.({ preventScroll: true }); } catch { /* element gone */ }
    };
  }, [open, onClose]);
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
      {/* Panel slides in from right with smooth spring -- frosted glass */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Notification Center"
        tabIndex={-1}
        className="dex-liquid-glass"
        style={{
        outline: 'none',
        position: 'fixed', top: 40, right: 8, bottom: 8, // below the 34px top bar, aligned with Control Center
        width: 'min(360px, calc(100vw - 48px))', zIndex: 'var(--z-notification)',
        borderRadius: 14,
        boxShadow: 'var(--pg-shadow-popover-strong)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        animation: isReduceMotion() ? 'none' : 'notifCenterIn 0.22s cubic-bezier(0.23,1,0.32,1)',
      }}>
        <style>{`
          @keyframes notifBackdropIn {
            from { opacity: 0; }
            to { opacity: 1; }
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
          padding: '14px var(--space-4) var(--space-3)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 600, color: 'var(--color-accent-text, #fff)',
                background: 'var(--color-accent-fill)',
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
              borderRadius: 4, padding: 2,
            }}>
              <button
                onClick={() => setViewMode('timeline')}
                style={{
                  padding: '3px var(--space-2)', borderRadius: 4, border: 'none',
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
                  padding: '3px var(--space-2)', borderRadius: 4, border: 'none',
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
                  fontWeight: 500, padding: '2px 6px', borderRadius: 4,
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
                width: 22, height: 22, borderRadius: 4, border: 'none',
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
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2) var(--space-3)' }}>
          {notifications.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '48px var(--space-6)', gap: 'var(--space-2)',
              color: 'var(--color-text-tertiary)', textAlign: 'center',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4 }}>
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)' }}>No notifications</span>
              <span style={{ fontSize: 11 }}>You're all caught up</span>
            </div>
          ) : viewMode === 'grouped' ? (
            /* Grouped View — each source header carries an honest digest line. */
            groups.map(group => {
              const digestItems: DigestItem[] = group.notifications.map(n => ({
                priority: (n.priority ?? 'normal') as NotificationPriority,
                ts: n.timestamp ?? 0,
                read: n.read,
              }));
              const digest = summarizeGroup(digestItems);
              return (
                <div key={group.source} style={{ marginBottom: 'var(--space-3)' }}>
                  {/* Group header + digest */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '4px 0', marginBottom: 6,
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <span className="dex-label-caps" style={{ color: 'var(--color-text-secondary)' }}>
                        {group.source}
                      </span>
                      <div style={{
                        fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                      }}>
                        {digest.headline}
                      </div>
                    </div>
                    {group.unreadCount > 0 && (
                      <span style={{
                        fontSize: 9, fontWeight: 600, color: 'var(--color-accent)',
                        background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
                        padding: '1px 5px', borderRadius: 6, flexShrink: 0,
                      }}>
                        {group.unreadCount} new
                      </span>
                    )}
                  </div>
                  {/* Group notifications */}
                  {group.notifications.map(n => (
                    <CenterCard key={n.id} n={n} onMarkAsRead={onMarkAsRead} onActivate={onActivate} onDismiss={onDismiss} />
                  ))}
                </div>
              );
            })
          ) : (
            /* Timeline View */
            notifications.map(n => (
              <CenterCard key={n.id} n={n} onMarkAsRead={onMarkAsRead} onActivate={onActivate} onDismiss={onDismiss} showSource />
            ))
          )}
        </div>
      </div>
    </>
  );
};
