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
import {
  ACHIEVEMENTS, CATEGORY_META, RARITY_META,
  type Achievement, type AchievementCategory, type UserStats,
} from '../../services/achievementsCatalog';
import {
  loadEngagement, saveEngagement, getAchievementStats,
  type EngagementState,
} from '../../services/engagement';

type TabFilter = 'all' | AchievementCategory;
type StatusFilter = 'all' | 'unlocked' | 'locked';

const Achievements: React.FC = () => {
  const [engagement, setEngagement] = useState<EngagementState>(() => loadEngagement());
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

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
  }, [activeTab, statusFilter, searchQuery]);

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

  const filtered = useMemo(() => {
    let list = ACHIEVEMENTS;
    if (activeTab !== 'all') list = list.filter(a => a.category === activeTab);
    if (statusFilter === 'unlocked') list = list.filter(a => unlocked.has(a.id));
    if (statusFilter === 'locked') list = list.filter(a => !unlocked.has(a.id));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(a => a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
    }
    return list;
  }, [activeTab, statusFilter, searchQuery, unlocked]);

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
            <button key={cat.key} onClick={() => setActiveTab(cat.key)} style={{
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
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 10px', borderRadius: 6,
            background: 'var(--color-bg-hover, rgba(255,255,255,.04))',
            border: '1px solid var(--color-border-subtle, rgba(255,255,255,.06))',
            flex: 1, maxWidth: 280,
          }}>
            <DexIcon name="search" size={12} color="var(--color-text-tertiary, rgba(255,255,255,.35))" />
            <input
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search..."
              style={{ background: 'transparent', border: 'none', outline: 'none', color: 'inherit', fontSize: 12, width: '100%' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 2, background: 'var(--color-bg-hover, rgba(255,255,255,.03))', borderRadius: 6, padding: 2 }}>
            {(['all', 'unlocked', 'locked'] as StatusFilter[]).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{
                padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 500, textTransform: 'capitalize',
                background: statusFilter === s ? 'var(--color-warning-soft, rgba(245,158,11,.15))' : 'transparent',
                color: statusFilter === s ? 'var(--color-warning)' : 'var(--color-text-tertiary, rgba(255,255,255,.45))',
              }}>{s}</button>
            ))}
          </div>
        </div>
      </div>

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

// -- Achievement Card (minimal) -------------------------------------------
const AchievementCard: React.FC<{
  achievement: Achievement;
  isUnlocked: boolean;
  stats: UserStats;
}> = memo(({ achievement, isUnlocked, stats }) => {
  const meta = RARITY_META[achievement.rarity];
  const isSecret = achievement.secret && !isUnlocked;
  const prog = achievement.progress ? achievement.progress(stats) : null;
  const pct = prog ? Math.min(100, (prog.current / prog.target) * 100) : (isUnlocked ? 100 : 0);

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
