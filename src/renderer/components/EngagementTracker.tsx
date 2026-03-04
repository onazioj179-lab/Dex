/**
 * DEX Silent Engagement Tracker + Trophy Toast
 *
 * - useEngagementTracker(): hook that silently tracks sessions, app usage,
 *   checks achievements on every change, and queues trophy toasts.
 * - AchievementToast: slide-in notification when a trophy unlocks.
 *
 * Drop into AppManager — zero config, fully automatic.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import DexIcon from './DexIcon';
import {
  loadEngagement, saveEngagement,
  recordSessionStart, recordAppUsage, incrementStat,
  checkAchievements, getTotalPoints,
  type Achievement, type EngagementState,
} from '../services/engagement';
import { RARITY_META } from '../services/achievementsCatalog';

// ── Silent Tracker Hook ───────────────────────────────────────────────────

interface TrackerResult {
  /** Newly unlocked achievements waiting to be shown */
  toastQueue: Achievement[];
  /** Dismiss the front toast */
  dismissToast: () => void;
  /** Manually bump a stat (call from any app) */
  bump: (key: string, amount?: number) => void;
}

/**
 * Silently watches everything and awards achievements.
 * Call once in AppManager — it auto-tracks session start, app switching,
 * search usage, and periodic achievement checks.
 */
export function useEngagementTracker(currentAppId: string): TrackerResult {
  const stateRef = useRef<EngagementState>(loadEngagement());
  const [toastQueue, setToastQueue] = useState<Achievement[]>([]);
  const sessionRecorded = useRef(false);
  const prevAppRef = useRef<string>(currentAppId);
  const checkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Persist helper
  const persist = useCallback((s: EngagementState) => {
    stateRef.current = s;
    saveEngagement(s);
  }, []);

  // Run achievement check and queue any new unlocks
  const runCheck = useCallback(() => {
    const pts = getTotalPoints(stateRef.current.unlockedAchievements);
    const { state: updated, newUnlocks } = checkAchievements(stateRef.current, pts);
    if (newUnlocks.length > 0) {
      persist(updated);
      setToastQueue(prev => [...prev, ...newUnlocks]);
    }
  }, [persist]);

  // 1) Record session start (once)
  useEffect(() => {
    if (!sessionRecorded.current) {
      sessionRecorded.current = true;
      const updated = recordSessionStart(stateRef.current);
      persist(updated);
      // Immediate check for session-based achievements
      setTimeout(runCheck, 500);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 2) Track every app switch
  useEffect(() => {
    if (currentAppId && currentAppId !== prevAppRef.current) {
      prevAppRef.current = currentAppId;
      const updated = recordAppUsage(stateRef.current, currentAppId);
      persist(updated);
      // Check after short delay to batch
      setTimeout(runCheck, 300);
    }
  }, [currentAppId, persist, runCheck]);

  // 3) Periodic background check (every 30s for time-based achievements)
  useEffect(() => {
    checkTimerRef.current = setInterval(() => {
      // Update totalMinutes
      const s = { ...stateRef.current };
      const stats = { ...s.stats };
      stats.totalMinutes = (stats.totalMinutes || 0) + 0.5; // +30s
      s.stats = stats;
      persist(s);
      runCheck();
    }, 30000);

    return () => {
      if (checkTimerRef.current) clearInterval(checkTimerRef.current);
    };
  }, [persist, runCheck]);

  // 4) Listen for custom stat bumps from other apps
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.key) {
        const updated = incrementStat(stateRef.current, detail.key, detail.amount || 1);
        persist(updated);
        setTimeout(runCheck, 200);
      }
    };
    window.addEventListener('dex-stat-bump', handler);
    return () => window.removeEventListener('dex-stat-bump', handler);
  }, [persist, runCheck]);

  // 5) Track searches
  useEffect(() => {
    const handler = () => {
      const updated = incrementStat(stateRef.current, 'searchesPerformed' as any, 1);
      persist(updated);
    };
    window.addEventListener('dex-search-performed', handler);
    return () => window.removeEventListener('dex-search-performed', handler);
  }, [persist]);

  const dismissToast = useCallback(() => {
    setToastQueue(prev => prev.slice(1));
  }, []);

  const bump = useCallback((key: string, amount = 1) => {
    const updated = incrementStat(stateRef.current, key as any, amount);
    persist(updated);
    setTimeout(runCheck, 200);
  }, [persist, runCheck]);

  return { toastQueue, dismissToast, bump };
}

// ── Trophy Toast Component ────────────────────────────────────────────────

export const AchievementToast: React.FC<{
  achievement: Achievement;
  onDismiss: () => void;
}> = ({ achievement, onDismiss }) => {
  const [phase, setPhase] = useState<'enter' | 'visible' | 'exit'>('enter');
  const meta = RARITY_META[achievement.rarity];

  useEffect(() => {
    // Enter animation
    const enterTimer = setTimeout(() => setPhase('visible'), 50);
    // Auto-dismiss after 4s
    const durationTimer = setTimeout(() => setPhase('exit'), 4000);
    // Remove after exit animation
    const removeTimer = setTimeout(onDismiss, 4400);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(durationTimer);
      clearTimeout(removeTimer);
    };
  }, [onDismiss]);

  const isVisible = phase === 'visible';

  return (
    <div
      onClick={() => { setPhase('exit'); setTimeout(onDismiss, 400); }}
      style={{
        position: 'fixed',
        top: 52,
        right: 20,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 18px 12px 14px',
        borderRadius: 16,
        background: 'rgba(20, 20, 25, 0.92)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        border: `1px solid ${meta.color}35`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${meta.glow || 'transparent'}`,
        cursor: 'pointer',
        transform: isVisible ? 'translateX(0) scale(1)' : phase === 'enter' ? 'translateX(80px) scale(0.9)' : 'translateX(80px) scale(0.9)',
        opacity: isVisible ? 1 : 0,
        transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease',
        maxWidth: 340,
        pointerEvents: 'auto',
      }}
    >
      {/* Icon */}
      <div style={{
        width: 42,
        height: 42,
        borderRadius: 12,
        background: `linear-gradient(135deg, ${meta.color}30, ${meta.color}10)`,
        border: `1px solid ${meta.color}25`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: `0 0 16px ${meta.glow || 'transparent'}`,
      }}>
        <DexIcon name={achievement.icon} size={22} color={meta.color} />
      </div>

      {/* Text */}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: meta.color,
          marginBottom: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}>
          <DexIcon name="trophy" size={10} color={meta.color} />
          Achievement Unlocked
        </div>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#e5e5ea',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          letterSpacing: '-0.01em',
        }}>
          {achievement.title}
        </div>
        <div style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.45)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginTop: 1,
        }}>
          {achievement.description}
        </div>
      </div>

      {/* Points badge */}
      <div style={{
        padding: '4px 8px',
        borderRadius: 8,
        background: `${meta.color}15`,
        border: `1px solid ${meta.color}20`,
        fontSize: 11,
        fontWeight: 700,
        color: meta.color,
        flexShrink: 0,
        letterSpacing: '-0.01em',
      }}>
        +{achievement.points}
      </div>
    </div>
  );
};

/**
 * Renders the current toast queue — place this in AppManager's render.
 * Only shows the top toast; auto-advances when dismissed.
 */
export const AchievementToastContainer: React.FC<{
  queue: Achievement[];
  onDismiss: () => void;
}> = ({ queue, onDismiss }) => {
  if (queue.length === 0) return null;
  return <AchievementToast achievement={queue[0]} onDismiss={onDismiss} />;
};
