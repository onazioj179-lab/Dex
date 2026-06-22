// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Achievements / Trophies App
 * Clean minimal card layout with progress bars. NO emojis.
 */

import React, { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import DexIcon from '../../components/DexIcon';
import { DexSearchInput, toast } from '../../styles/components';
import {
  ACHIEVEMENTS, CATEGORY_META, RARITY_META,
  type Achievement, type AchievementCategory, type UserStats,
} from '../../services/achievementsCatalog';
import {
  loadEngagement, saveEngagement, getAchievementStats,
  type EngagementState,
} from '../../services/engagement';
import {
  loadChallenges, getChallengeLevel, type DailyChallengeState,
} from '../../services/dailyChallenges';
import { ACHIEVEMENT_UNLOCKED_EVENT, CHALLENGE_UPDATED_EVENT } from '../../services/achievementEngine';

type TabFilter = 'all' | AchievementCategory;
type StatusFilter = 'all' | 'unlocked' | 'locked';

const Achievements: React.FC = () => {
  const [engagement, setEngagement] = useState<EngagementState>(() => loadEngagement());
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortRecent, setSortRecent] = useState(false);
  const [challenges, setChallenges] = useState<DailyChallengeState>(() => loadChallenges());

  // Live-update: the achievement engine fires these when an unlock or challenge
  // lands (from any app), so an open Trophies grid reflects it without a reopen.
  useEffect(() => {
    const reloadAch = () => setEngagement(loadEngagement());
    const reloadCh = () => setChallenges(loadChallenges());
    window.addEventListener(ACHIEVEMENT_UNLOCKED_EVENT, reloadAch);
    window.addEventListener(CHALLENGE_UPDATED_EVENT, reloadCh);
    return () => {
      window.removeEventListener(ACHIEVEMENT_UNLOCKED_EVENT, reloadAch);
      window.removeEventListener(CHALLENGE_UPDATED_EVENT, reloadCh);
    };
  }, []);

  // Incremental rendering: never mount all ~5000 cards at once -- that janked the
  // window open, tripped the blank-screen guard, and made the paint so heavy a
  // screenshot caught it mid-render. Start with a window and grow it as the user
  // scrolls; reset to the top window whenever the active filter changes.
  const cardsScrollRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(120);
  const handleCardsScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 500) setVisibleCount(c => c + 120);
  }, []);
  useEffect(() => {
    setVisibleCount(120);
    if (cardsScrollRef.current) cardsScrollRef.current.scrollTop = 0;
  }, [activeTab, statusFilter, searchQuery, sortRecent]);

  useEffect(() => {
    const updated = { ...engagement };
    const stats = { ...updated.stats };
    stats.achievementsViewed = (stats.achievementsViewed || 0) + 1;
    updated.stats = stats;
    setEngagement(updated);
    saveEngagement(updated);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const unlocked = useMemo(() => new Set(engagement.unlockedAchievements), [engagement.unlockedAchievements]);
  const stats = useMemo(() => getAchievementStats(engagement.unlockedAchievements), [engagement.unlockedAchievements]);
  const rank = stats.rank;

  const unlockedAt = engagement.unlockedAt || {};
  const filtered = useMemo(() => {
    let list = ACHIEVEMENTS;
    if (activeTab !== 'all') list = list.filter(a => a.category === activeTab);
    if (statusFilter === 'unlocked') list = list.filter(a => unlocked.has(a.id));
    if (statusFilter === 'locked') list = list.filter(a => !unlocked.has(a.id));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(a => a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
    }
    if (sortRecent) {
      // Most-recently-unlocked first; un-timestamped (locked) fall to the end.
      list = [...list].sort((a, b) => (unlockedAt[b.id] || 0) - (unlockedAt[a.id] || 0));
    }
    return list;
  }, [activeTab, statusFilter, searchQuery, unlocked, sortRecent, unlockedAt]);

  // Build a shareable plain-text progress summary and copy it to the clipboard.
  const shareProgress = useCallback(() => {
    const lines = [
      `DEX Trophies — ${stats.rank.title}`,
      `${stats.totalUnlocked} / ${stats.totalAchievements} unlocked (${stats.completionPercent}%)`,
      `${stats.points.toLocaleString()} points`,
      challenges.currentStreak > 0 ? `Daily streak: ${challenges.currentStreak}d` : '',
    ].filter(Boolean);
    const text = lines.join('\n');
    try {
      const p = navigator.clipboard?.writeText(text);
      if (p && typeof p.catch === 'function') {
        p.then(() => toast.success('Progress copied to clipboard'))
         .catch(() => toast.error('Could not copy progress'));
      } else {
        toast.success('Progress copied to clipboard');
      }
    } catch {
      toast.error('Could not copy progress');
    }
  }, [stats, challenges.currentStreak]);

  const categories = useMemo(() => {
    const all = { key: 'all' as TabFilter, label: 'All', count: ACHIEVEMENTS.length };
    const cats = (Object.keys(CATEGORY_META) as AchievementCategory[]).map(k => ({
      key: k as TabFilter,
      label: CATEGORY_META[k].title,
      count: ACHIEVEMENTS.filter(a => a.category === k).length,
    }));
    return [all, ...cats];
  }, []);

  // -- Render ------------------------------------------------------------
  const rankProgress = rank.pointsNeeded > 0 ? (stats.points / (stats.points + rank.pointsNeeded)) * 100 : 100;

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--color-bg-base, #0a0a0f)',
      color: 'var(--color-text-primary, #e5e5ea)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: 'var(--space-5) var(--space-6) 14px', flexShrink: 0,
        background: 'var(--color-bg-surface-solid, #1C1C1E)',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 8,
              background: 'linear-gradient(135deg, #ff9f0a, #d97706)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <DexIcon name="trophy" size={20} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', margin: 0 }}>Trophies</h1>
              <p style={{ fontSize: 11, margin: 0, opacity: 0.45 }}>
                {stats.totalUnlocked} / {stats.totalAchievements} unlocked
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <button onClick={shareProgress} title="Copy progress summary" style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 'var(--text-xs)', fontWeight: 600,
              background: 'var(--color-bg-hover, rgba(255,255,255,.04))',
              color: 'var(--color-text-secondary, rgba(255,255,255,.7))',
            }}>
              Share
            </button>
            {engagement.stats.currentStreak > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, opacity: 0.7 }}>
                <DexIcon name="flame" size={14} color="#ff9f0a" />
                <span>{engagement.stats.currentStreak}d streak</span>
              </div>
            )}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
              padding: '6px var(--space-3)', borderRadius: 8,
              background: 'var(--color-bg-hover, rgba(255,255,255,.04))',
            }}>
              <DexIcon name={rank.icon} size={16} color="#ff9f0a" />
              <span style={{ fontSize: 12, fontWeight: 600 }}>{rank.title}</span>
              <div style={{ width: 48, height: 3, borderRadius: 2, background: 'var(--color-border-subtle, rgba(255,255,255,.08))', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, rankProgress)}%`, height: '100%', borderRadius: 2, background: 'var(--color-warning)' }} />
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Category Tabs + Search */}
      <div style={{
        padding: '10px var(--space-6)', flexShrink: 0,
        borderBottom: '1px solid var(--color-border-subtle, rgba(255,255,255,.04))',
        display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
      }}>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
          {categories.map(cat => (
            <button key={cat.key} onClick={() => setActiveTab(cat.key)} aria-pressed={activeTab === cat.key} aria-label={`Filter: ${cat.label}`} style={{
              padding: '5px var(--space-3)', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
              background: activeTab === cat.key ? 'var(--color-warning-soft, rgba(245,158,11,.15))' : 'var(--color-bg-hover, rgba(255,255,255,.03))',
              color: activeTab === cat.key ? 'var(--color-warning)' : 'var(--color-text-tertiary, rgba(255,255,255,.5))',
              transition: 'all .15s',
            }}>
              {cat.label}
              <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.5 }}>{cat.count}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <div style={{ flex: 1, maxWidth: 280 }}>
            <DexSearchInput
              size="sm"
              fullWidth
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onClear={() => setSearchQuery('')}
              placeholder="Search..."
            />
          </div>
          <div style={{ display: 'flex', gap: 2, background: 'var(--color-bg-hover, rgba(255,255,255,.03))', borderRadius: 6, padding: 2 }}>
            {(['all', 'unlocked', 'locked'] as StatusFilter[]).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} aria-pressed={statusFilter === s} aria-label={`Show ${s}`} style={{
                padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 500, textTransform: 'capitalize',
                background: statusFilter === s ? 'var(--color-warning-soft, rgba(245,158,11,.15))' : 'transparent',
                color: statusFilter === s ? 'var(--color-warning)' : 'var(--color-text-tertiary, rgba(255,255,255,.45))',
              }}>{s}</button>
            ))}
          </div>
          <button onClick={() => setSortRecent(v => !v)} aria-pressed={sortRecent} aria-label="Sort by most recently unlocked" title="Sort by most recently unlocked" style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 11, fontWeight: 500,
            background: sortRecent ? 'var(--color-warning-soft, rgba(245,158,11,.15))' : 'var(--color-bg-hover, rgba(255,255,255,.03))',
            color: sortRecent ? 'var(--color-warning)' : 'var(--color-text-tertiary, rgba(255,255,255,.45))',
          }}>
            Recent
          </button>
        </div>
      </div>

      <DailyChallengesBar challenges={challenges} />

      {/* Achievement Cards */}
      <div ref={cardsScrollRef} onScroll={handleCardsScroll} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-4) var(--space-6)' }}>
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.35 }}>
            <DexIcon name="search" size={36} color="var(--color-text-tertiary, rgba(255,255,255,.2))" />
            <p style={{ marginTop: 10, fontSize: 13 }}>No achievements found</p>
          </div>
        ) : (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 'var(--space-2)',
            }}>
              {filtered.slice(0, visibleCount).map(ach => (
                <AchievementCard key={ach.id} achievement={ach} isUnlocked={unlocked.has(ach.id)} stats={engagement.stats} />
              ))}
            </div>
            {visibleCount < filtered.length && (
              <div style={{ textAlign: 'center', padding: '14px 0 4px', fontSize: 11, opacity: 0.4 }}>
                Showing {Math.min(visibleCount, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()} — scroll for more
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// -- Daily Challenges bar -------------------------------------------------
// Surfaces the (previously unwired) daily-challenge system inside Trophies, plus
// a compact local self-progress board (level / streak / XP) -- no new page.
const DailyChallengesBar: React.FC<{ challenges: DailyChallengeState }> = memo(({ challenges }) => {
  const level = getChallengeLevel(challenges.totalXP);
  const today = challenges.challenges;
  if (!today.length) return null;

  return (
    <div style={{
      flexShrink: 0, padding: '10px var(--space-6)',
      borderBottom: '1px solid var(--color-border-subtle)',
      display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
      background: 'var(--color-bg-surface, rgba(255,255,255,.012))',
    }}>
      {/* Local progress board */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 96 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-warning)' }} />
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', opacity: 0.7, color: 'var(--color-warning)' }}>
            Daily
          </span>
        </div>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Lv {level.level} · {level.title}</div>
        <div style={{ fontSize: 10, opacity: 0.5 }}>
          {challenges.totalXP.toLocaleString()} XP{challenges.currentStreak > 0 ? ` · ${challenges.currentStreak}d streak` : ''}
        </div>
      </div>

      {/* Local self-history: a sparkline of daily XP earned + your best day */}
      {challenges.history.length > 0 && (() => {
        const hist = challenges.history.slice(-14);
        const max = Math.max(1, ...hist.map(h => h.xpEarned));
        const best = challenges.history.reduce((m, h) => Math.max(m, h.xpEarned), 0);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 88 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 26 }} title="Daily XP earned (last 14 days)">
              {hist.map((h, i) => (
                <div key={i} title={`${h.date}: ${h.xpEarned} XP`} style={{
                  width: 5, height: `${Math.max(2, Math.round((h.xpEarned / max) * 26))}px`,
                  borderRadius: 1, background: 'var(--color-warning)', opacity: h.xpEarned > 0 ? 0.85 : 0.25,
                }} />
              ))}
            </div>
            <div style={{ fontSize: 9, opacity: 0.5, letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase' }}>
              Best {best} XP · {challenges.history.length}d
            </div>
          </div>
        );
      })()}

      {/* Today's challenges */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flex: 1, overflowX: 'auto' }}>
        {today.map(ch => {
          const threshold = ch.condition?.threshold || 0;
          const pct = threshold > 0 ? Math.min(100, (ch.progress / threshold) * 100) : 0;
          return (
            <div key={ch.id} title={ch.description} style={{
              flex: '1 1 0', minWidth: 150,
              padding: '7px var(--space-3)', borderRadius: 8,
              background: ch.completed ? 'var(--color-success-soft, rgba(48,209,88,.12))' : 'var(--color-bg-hover, rgba(255,255,255,.03))',
              border: '1px solid var(--color-border-subtle)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                  <DexIcon name={ch.completed ? 'check-circle' : ch.icon} size={13} color={ch.completed ? '#30d158' : 'var(--color-text-secondary)'} />
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.title}</span>
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-warning)', flexShrink: 0 }}>+{ch.xpReward}</span>
              </div>
              <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--color-border-subtle, rgba(255,255,255,.08))', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: ch.completed ? '#30d158' : 'var(--color-warning)', transition: 'width .18s' }} />
                </div>
                <span style={{ fontSize: 9, opacity: 0.45, flexShrink: 0 }}>{ch.progress}/{ch.condition.threshold}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
DailyChallengesBar.displayName = 'DailyChallengesBar';

// -- Achievement Card (minimal) -------------------------------------------
const AchievementCard: React.FC<{
  achievement: Achievement;
  isUnlocked: boolean;
  stats: UserStats;
}> = memo(({ achievement, isUnlocked, stats }) => {
  const meta = RARITY_META[achievement.rarity];
  const isSecret = achievement.secret && !isUnlocked;
  const prog = achievement.progress ? achievement.progress(stats) : null;
  const pct = prog && prog.target > 0
    ? Math.min(100, (prog.current / prog.target) * 100)
    : (isUnlocked ? 100 : 0);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px var(--space-3)', borderRadius: 8,
      background: isUnlocked ? 'var(--color-bg-hover, rgba(255,255,255,.04))' : 'var(--color-bg-surface, rgba(255,255,255,.015))',
      border: '1px solid var(--color-border-subtle, rgba(255,255,255,.04))',
      opacity: isUnlocked ? 1 : 0.55,
      transition: 'opacity .18s',
    }}>
      {/* Icon */}
      <div style={{
        width: 34, height: 34, borderRadius: 6, flexShrink: 0,
        background: isUnlocked ? `${meta.color}18` : 'var(--color-bg-hover, rgba(255,255,255,.04))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <DexIcon
          name={isSecret ? 'help-circle' : achievement.icon}
          size={18}
          color={isUnlocked ? meta.color : 'var(--color-text-tertiary, rgba(255,255,255,.2))'}
        />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
          <div style={{
            fontSize: 12, fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {isSecret ? '???' : achievement.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {isUnlocked && <DexIcon name="check-circle" size={12} color="#30d158" />}
            <span style={{ fontSize: 10, fontWeight: 600, color: meta.color }}>{achievement.points}pts</span>
          </div>
        </div>
        <div style={{
          fontSize: 10, opacity: 0.4, marginTop: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {isSecret ? 'Hidden achievement' : achievement.description}
        </div>
        {/* Progress bar */}
        {!isUnlocked && prog && (
          <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--color-border-subtle, rgba(255,255,255,.08))', overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%', borderRadius: 2,
                background: `linear-gradient(90deg, ${meta.color}80, ${meta.color})`,
                transition: 'width .18s',
              }} />
            </div>
            <span style={{ fontSize: 9, opacity: 0.4, flexShrink: 0 }}>
              {prog.current.toLocaleString()}/{prog.target.toLocaleString()}
            </span>
          </div>
        )}
        {isUnlocked && (
          <div style={{ marginTop: 5, height: 3, borderRadius: 2, background: `${meta.color}30` }}>
            <div style={{ width: '100%', height: '100%', borderRadius: 2, background: meta.color }} />
          </div>
        )}
      </div>
    </div>
  );
});

Achievements.displayName = 'Achievements';
export default memo(Achievements);
