// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Achievements / Trophies App
 * A progress-first dashboard (NOT a long list of every award): a Spotlight hero,
 * a radial completion ring + stat tiles, per-category progress bars, an
 * "almost there" rail, recent unlocks, and daily challenges. True-black SOLID
 * surfaces (no glass / no translucency). All values are real. NO emojis.
 */

import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import DexIcon from '../../components/DexIcon';
import { toast } from '../../styles/components';
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

// DEX Blue Modern tokens, so Trophies follows light/dark and the window
// material like every other app (it used to be hard-coded near-black + gold).
// Monochrome by design (owner: minimal, no accent): icons, rings and bars use
// the text tones; surfaces carry the hierarchy.
const GOLD = 'var(--color-text-primary)';
const GOLD_DEEP = 'var(--color-text-primary)';
const MONO_FILL = 'var(--color-bg-elevated)';
const PANEL = 'var(--color-bg-surface)';
const PANEL_2 = 'var(--color-bg-elevated)';
const BORDER = 'var(--color-border-subtle)';
const TXT = 'var(--color-text-primary)';
const TXT_DIM = 'var(--color-text-secondary)';

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function relTime(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

const Achievements: React.FC = () => {
  const [engagement, setEngagement] = useState<EngagementState>(() => loadEngagement());
  const [challenges, setChallenges] = useState<DailyChallengeState>(() => loadChallenges());

  // Live-update: the achievement engine fires these when an unlock or challenge
  // lands (from any app), so an open Trophies dashboard reflects it instantly.
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
  const byId = useMemo(() => new Map(ACHIEVEMENTS.map(a => [a.id, a])), []);

  // Recently-unlocked rail (real timestamps), most recent first.
  const recentUnlocks = useMemo(() => {
    return Object.entries(unlockedAt)
      .sort((a, b) => b[1] - a[1])
      .map(([id, ts]) => ({ ach: byId.get(id), ts }))
      .filter((x): x is { ach: Achievement; ts: number } => Boolean(x.ach))
      .slice(0, 10);
  }, [unlockedAt, byId]);

  // Spotlight = most-recent unlock; else the locked trophy closest to completion.
  const spotlight = useMemo(() => {
    if (recentUnlocks[0]) return { ach: recentUnlocks[0].ach, isUnlocked: true, ts: recentUnlocks[0].ts };
    let best: Achievement | null = null;
    let bestPct = -1;
    for (const a of ACHIEVEMENTS) {
      if (unlocked.has(a.id) || a.secret) continue;
      const p = a.progress ? a.progress(engagement.stats) : null;
      const pct = p && p.target > 0 ? p.current / p.target : 0;
      if (pct > bestPct) { bestPct = pct; best = a; }
    }
    return best ? { ach: best, isUnlocked: false, ts: 0 } : null;
  }, [recentUnlocks, unlocked, engagement.stats]);

  // Per-category progress (the core "see progress" view, replacing the award list).
  const categoryProgress = useMemo(() => {
    return (Object.keys(CATEGORY_META) as AchievementCategory[]).map(k => {
      const meta = CATEGORY_META[k];
      const inCat = ACHIEVEMENTS.filter(a => a.category === k);
      const total = inCat.length;
      const got = inCat.reduce((n, a) => n + (unlocked.has(a.id) ? 1 : 0), 0);
      return { key: k, title: meta.title, icon: meta.icon, color: 'var(--color-text-secondary)', total, got, pct: total ? (got / total) * 100 : 0 };
    }).sort((a, b) => b.pct - a.pct);
  }, [unlocked]);

  // "Almost there" — locked trophies with real in-progress measures, nearest first.
  const almostThere = useMemo(() => {
    const arr: { ach: Achievement; cur: number; tgt: number; pct: number }[] = [];
    for (const a of ACHIEVEMENTS) {
      if (unlocked.has(a.id) || a.secret) continue;
      const p = a.progress ? a.progress(engagement.stats) : null;
      if (!p || p.target <= 0) continue;
      const pct = Math.min(100, (p.current / p.target) * 100);
      if (pct <= 0 || pct >= 100) continue;
      arr.push({ ach: a, cur: p.current, tgt: p.target, pct });
    }
    arr.sort((x, y) => y.pct - x.pct);
    return arr.slice(0, 4);
  }, [unlocked, engagement.stats]);

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

  const rankProgress = rank.pointsNeeded > 0 ? (stats.points / (stats.points + rank.pointsNeeded)) * 100 : 100;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'transparent', color: TXT, overflow: 'hidden' }}>
      <style>{`
        .tr-scroll::-webkit-scrollbar { width: 9px; height: 9px; }
        .tr-scroll::-webkit-scrollbar-thumb { background: var(--color-bg-active); border-radius: 6px; }
        .tr-card { transition: transform .15s ease, border-color .15s ease; }
        .tr-card:hover { transform: translateY(-2px); border-color: var(--color-border); }
      `}</style>

      <div className="tr-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 26px 30px' }}>

        {/* Greeting header */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20, position: 'sticky', top: -20, zIndex: 2, background: 'var(--color-bg-base)', padding: '20px 0 12px', margin: '-20px 0 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14, flexShrink: 0,
              background: MONO_FILL,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <DexIcon name="trophy" size={22} color="var(--color-text-primary)" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: TXT_DIM, fontWeight: 500 }}>{timeGreeting()}, champion</div>
              <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Your Trophies</h1>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {engagement.stats.currentStreak > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 10, background: PANEL, border: `1px solid ${BORDER}`, fontSize: 12, fontWeight: 600 }}>
                <DexIcon name="flame" size={15} color={GOLD} />
                {engagement.stats.currentStreak}d streak
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 13px', borderRadius: 10, background: PANEL, border: `1px solid ${BORDER}` }}>
              <DexIcon name={rank.icon} size={16} color={GOLD} />
              <span style={{ fontSize: 12, fontWeight: 700 }}>{rank.title}</span>
              <div style={{ width: 52, height: 4, borderRadius: 4, background: 'var(--color-bg-tertiary)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, rankProgress)}%`, height: '100%', background: GOLD }} />
              </div>
            </div>
            <button onClick={shareProgress} title="Copy progress summary" style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10,
              border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: MONO_FILL, color: 'var(--color-text-primary)',
            }}>
              <DexIcon name="share" size={14} color="var(--color-text-primary)" />
              Share
            </button>
          </div>
        </header>

        {/* Hero: Spotlight + Stats ring */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 16, marginBottom: 16 }}>
          <HeroSpotlight spotlight={spotlight} stats={engagement.stats} totalUnlocked={stats.totalUnlocked} />
          <StatsRing
            completion={stats.completionPercent}
            totalUnlocked={stats.totalUnlocked}
            totalAchievements={stats.totalAchievements}
            points={stats.points}
            streak={engagement.stats.currentStreak}
            level={getChallengeLevel(challenges.totalXP)}
          />
        </div>

        {/* Progress by category (the core view) */}
        <section style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 11px' }}>Progress by category</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 11 }}>
            {categoryProgress.map(c => {
              const done = c.total > 0 && c.got >= c.total;
              return (
                <div key={c.key} className="tr-card" style={{ padding: 15, borderRadius: 14, background: PANEL, border: `1px solid ${BORDER}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: MONO_FILL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <DexIcon name={c.icon} size={18} color="var(--color-text-secondary)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                      <div style={{ fontSize: 11, color: TXT_DIM, marginTop: 1 }}>{c.got} / {c.total} unlocked</div>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: done ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {Math.round(c.pct)}%
                    </div>
                  </div>
                  <div style={{ height: 7, borderRadius: 4, background: 'var(--color-bg-tertiary)', overflow: 'hidden' }}>
                    <div style={{ width: `${c.pct}%`, height: '100%', borderRadius: 4, background: done ? 'var(--color-text-primary)' : 'var(--color-text-primary)', transition: 'width .2s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Almost there — real in-progress trophies, nearest to unlock */}
        {almostThere.length > 0 && (
          <section style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 11px' }}>Almost there</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 11 }}>
              {almostThere.map(({ ach, cur, tgt, pct }) => {
                const meta = RARITY_META[ach.rarity];
                return (
                  <div key={ach.id} className="tr-card" title={ach.description} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, background: PANEL, border: `1px solid ${BORDER}` }}>
                    <div style={{ width: 40, height: 40, borderRadius: 14, flexShrink: 0, background: MONO_FILL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <DexIcon name={ach.icon} size={20} color="var(--color-text-secondary)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ach.title}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', flexShrink: 0 }}>{Math.round(pct)}%</span>
                      </div>
                      <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 5, borderRadius: 4, background: 'var(--color-bg-tertiary)', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: 'var(--color-text-primary)' }} />
                        </div>
                        <span style={{ fontSize: 10, color: TXT_DIM, flexShrink: 0 }}>{cur.toLocaleString()}/{tgt.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Recently unlocked rail */}
        {recentUnlocks.length > 0 && (
          <section style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 11px' }}>Recently unlocked</h2>
            <div className="tr-scroll" style={{ display: 'flex', gap: 11, overflowX: 'auto', paddingBottom: 4 }}>
              {recentUnlocks.map(({ ach, ts }) => {
                const meta = RARITY_META[ach.rarity];
                return (
                  <div key={ach.id} className="tr-card" title={ach.description} style={{ width: 176, flexShrink: 0, padding: 14, borderRadius: 14, background: PANEL_2, border: `1px solid ${BORDER}` }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, marginBottom: 9, background: MONO_FILL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <DexIcon name={ach.icon} size={20} color="var(--color-text-secondary)" />
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ach.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-secondary)' }}>{ach.points} pts</span>
                      <span style={{ fontSize: 10, color: TXT_DIM }}>{relTime(ts)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <DailyChallengesBar challenges={challenges} />
      </div>
    </div>
  );
};

// -- Hero spotlight card --------------------------------------------------
const HeroSpotlight: React.FC<{
  spotlight: { ach: Achievement; isUnlocked: boolean; ts: number } | null;
  stats: UserStats;
  totalUnlocked: number;
}> = memo(({ spotlight, stats, totalUnlocked }) => {
  if (!spotlight) {
    return (
      <div style={{ borderRadius: 18, padding: 24, minHeight: 188, background: PANEL, border: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Start your collection</div>
        <div style={{ fontSize: 12.5, color: TXT_DIM, lineHeight: 1.5 }}>
          Use DEX apps to unlock your first trophy. Your spotlight pick will appear here.
        </div>
      </div>
    );
  }
  const { ach, isUnlocked, ts } = spotlight;
  const meta = RARITY_META[ach.rarity];
  const prog = ach.progress ? ach.progress(stats) : null;
  const pct = prog && prog.target > 0 ? Math.min(100, (prog.current / prog.target) * 100) : (isUnlocked ? 100 : 0);

  return (
    <div style={{
      position: 'relative', borderRadius: 18, padding: 24, minHeight: 188, overflow: 'hidden',
      background: PANEL, border: `1px solid ${BORDER}`,
      borderLeft: `1px solid ${BORDER}`,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>
      {/* Faint oversized glyph */}
      <div style={{ position: 'absolute', right: -16, bottom: -28, opacity: 0.06, pointerEvents: 'none' }}>
        <DexIcon name={ach.icon} size={180} color="var(--color-text-secondary)" />
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-secondary)', background: MONO_FILL, padding: '4px 9px', borderRadius: 6 }}>Spotlight</span>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'capitalize', color: 'var(--color-text-secondary)', background: MONO_FILL, padding: '4px 9px', borderRadius: 6 }}>{ach.rarity}</span>
          <span style={{ fontSize: 11, color: TXT_DIM }}>{isUnlocked ? `Unlocked ${relTime(ts)}` : 'Next up'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, flexShrink: 0, background: MONO_FILL, border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DexIcon name={isUnlocked ? ach.icon : 'lock'} size={28} color="var(--color-text-secondary)" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{ach.title}</div>
            <div style={{ fontSize: 12.5, color: TXT_DIM, marginTop: 3, maxWidth: 380, lineHeight: 1.4 }}>{ach.description}</div>
          </div>
        </div>
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <DexIcon name="star" size={14} color={GOLD} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>{ach.points} pts</span>
        </div>
        {!isUnlocked && prog ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 4, background: 'var(--color-bg-tertiary)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: 'var(--color-text-primary)' }} />
            </div>
            <span style={{ fontSize: 11, color: TXT_DIM, flexShrink: 0 }}>{prog.current.toLocaleString()}/{prog.target.toLocaleString()}</span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 700 }}>
            <DexIcon name="check-circle" size={14} color="var(--color-text-primary)" />
            Earned · {totalUnlocked.toLocaleString()} total
          </div>
        )}
      </div>
    </div>
  );
});
HeroSpotlight.displayName = 'HeroSpotlight';

// -- Radial completion ring + stat tiles ----------------------------------
const StatsRing: React.FC<{
  completion: number; totalUnlocked: number; totalAchievements: number;
  points: number; streak: number; level: { level: number; title: string };
}> = memo(({ completion, totalUnlocked, totalAchievements, points, streak, level }) => {
  const pct = Math.max(0, Math.min(100, completion));
  const tiles = [
    { icon: 'star', label: 'Points', value: points.toLocaleString() },
    { icon: 'flame', label: 'Streak', value: `${streak}d` },
    { icon: 'award', label: 'Level', value: `${level.level}` },
  ];
  return (
    <div style={{ borderRadius: 18, padding: 20, minHeight: 188, background: PANEL, border: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>Your statistics</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ position: 'relative', width: 104, height: 104, flexShrink: 0 }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: `conic-gradient(${GOLD} ${pct}%, var(--color-bg-active) ${pct}%)` }} />
          <div style={{ position: 'absolute', inset: 11, borderRadius: '50%', background: PANEL, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{pct}%</div>
            <div style={{ fontSize: 9.5, color: TXT_DIM, marginTop: 2 }}>complete</div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>{totalUnlocked.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: TXT_DIM, marginTop: 3 }}>of {totalAchievements.toLocaleString()} trophies unlocked</div>
          <div style={{ marginTop: 9, fontSize: 11.5, fontWeight: 600, color: GOLD }}>{level.title}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9 }}>
        {tiles.map(t => (
          <div key={t.label} style={{ padding: '10px 8px', borderRadius: 14, textAlign: 'center', background: PANEL_2, border: `1px solid ${BORDER}` }}>
            <DexIcon name={t.icon} size={15} color={GOLD} />
            <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4 }}>{t.value}</div>
            <div style={{ fontSize: 9.5, color: TXT_DIM, marginTop: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
});
StatsRing.displayName = 'StatsRing';

// -- Daily Challenges bar -------------------------------------------------
const DailyChallengesBar: React.FC<{ challenges: DailyChallengeState }> = memo(({ challenges }) => {
  const level = getChallengeLevel(challenges.totalXP);
  const today = challenges.challenges;
  if (!today.length) return null;

  return (
    <div style={{ padding: '13px 16px', borderRadius: 18, border: `1px solid ${BORDER}`, background: PANEL, display: 'flex', alignItems: 'center', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 96 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: GOLD }}>Daily</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Lv {level.level} · {level.title}</div>
        <div style={{ fontSize: 10, color: TXT_DIM }}>
          {challenges.totalXP.toLocaleString()} XP{challenges.currentStreak > 0 ? ` · ${challenges.currentStreak}d streak` : ''}
        </div>
      </div>

      {challenges.history.length > 0 && (() => {
        const hist = challenges.history.slice(-14);
        const max = Math.max(1, ...hist.map(h => h.xpEarned));
        const best = challenges.history.reduce((m, h) => Math.max(m, h.xpEarned), 0);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 88 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 26 }} title="Daily XP earned (last 14 days)">
              {hist.map((h, i) => (
                <div key={i} title={`${h.date}: ${h.xpEarned} XP`} style={{ width: 5, height: `${Math.max(2, Math.round((h.xpEarned / max) * 26))}px`, borderRadius: 1, background: GOLD, opacity: h.xpEarned > 0 ? 0.85 : 0.25 }} />
              ))}
            </div>
            <div style={{ fontSize: 9, color: TXT_DIM, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Best {best} XP · {challenges.history.length}d</div>
          </div>
        );
      })()}

      <div className="tr-scroll" style={{ display: 'flex', gap: 9, flex: 1, overflowX: 'auto' }}>
        {today.map(ch => {
          const threshold = ch.condition?.threshold || 0;
          const pct = threshold > 0 ? Math.min(100, (ch.progress / threshold) * 100) : 0;
          return (
            <div key={ch.id} title={ch.description} style={{ flex: '1 1 0', minWidth: 150, padding: '8px 12px', borderRadius: 10, background: PANEL_2, border: `1px solid ${BORDER}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                  <DexIcon name={ch.completed ? 'check-circle' : ch.icon} size={13} color={ch.completed ? 'var(--color-text-primary)' : GOLD} />
                  <span style={{ fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.title}</span>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: GOLD, flexShrink: 0 }}>+{ch.xpReward}</span>
              </div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--color-bg-tertiary)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: ch.completed ? 'var(--color-text-primary)' : GOLD, transition: 'width .18s' }} />
                </div>
                <span style={{ fontSize: 9, color: TXT_DIM, flexShrink: 0 }}>{ch.progress}/{ch.condition.threshold}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
DailyChallengesBar.displayName = 'DailyChallengesBar';

Achievements.displayName = 'Achievements';
export default memo(Achievements);
