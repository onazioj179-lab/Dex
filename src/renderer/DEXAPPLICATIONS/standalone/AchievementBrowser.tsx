// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Rewards › All rewards: browse the real catalog (services/achievementsCatalog)
// by status and category; a row expands into its details (what earns it, real
// progress, points, rarity, when it was earned). Secret rewards stay hidden
// until earned. Nothing here invents events: progress comes from the engine's stats.

import React, { useMemo, useState } from 'react';
import DexIcon from '../../components/DexIcon';
import { SegmentedControl, Pill } from '../../components/controls';
import { DexSearchInput } from '../../styles/components';
import { Button } from '../../ui/Button';
import { CATEGORY_META, RARITY_META, type Achievement, type AchievementCategory, type UserStats } from '../../services/achievementsCatalog';

const CHIP: React.CSSProperties = { fontSize: 12, padding: '0 12px', height: 30 };

type Status = 'all' | 'earned' | 'progress' | 'locked';
const PAGE = 60;

export function achievementStatus(a: Achievement, unlocked: ReadonlySet<string>, stats: UserStats): Exclude<Status, 'all'> {
  if (unlocked.has(a.id)) return 'earned';
  const p = a.progress?.(stats);
  return p && p.target > 0 && p.current > 0 ? 'progress' : 'locked';
}

/**
 * `achievements` is the set DEX can actually award plus anything already earned
 * (services/achievementTracking.visibleAchievements) -- not the raw catalog,
 * whose untracked trophies could never move.
 */
export const AchievementBrowser: React.FC<{
  achievements: readonly Achievement[];
  unlocked: ReadonlySet<string>;
  unlockedAt: Record<string, number>;
  stats: UserStats;
}> = ({ achievements, unlocked, unlockedAt, stats }) => {
  const [status, setStatus] = useState<Status>('all');
  const [category, setCategory] = useState<AchievementCategory | 'all'>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return achievements.map((a) => ({ a, st: achievementStatus(a, unlocked, stats) }))
      .filter(({ a, st }) => (status === 'all' || st === status)
        && (category === 'all' || a.category === category)
        && !(a.secret && st !== 'earned' && t) // secrets can't be found by searching their hidden text
        && (!t || (`${a.title} ${a.description}`).toLowerCase().includes(t)))
      .sort((x, y) => {
        const order = { earned: 0, progress: 1, locked: 2 } as const;
        if (x.st !== y.st) return order[x.st] - order[y.st];
        if (x.st === 'earned') return (unlockedAt[y.a.id] ?? 0) - (unlockedAt[x.a.id] ?? 0);
        return x.a.points - y.a.points;
      });
  }, [achievements, status, category, q, unlocked, unlockedAt, stats]);

  const counts = useMemo(() => {
    const c = { all: achievements.length, earned: 0, progress: 0, locked: 0 };
    for (const a of achievements) c[achievementStatus(a, unlocked, stats)]++;
    return c;
  }, [achievements, unlocked, stats]);

  // Only categories that hold at least one awardable trophy.
  const cats = useMemo(() => {
    const present = new Set(achievements.map(a => a.category));
    return (Object.keys(CATEGORY_META) as AchievementCategory[]).filter(c => present.has(c));
  }, [achievements]);

  return (
    <section style={{ marginBottom: 16 }} aria-label="All rewards">
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 11px' }}>All rewards</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <SegmentedControl
          aria-label="Show"
          size="md"
          options={[
            { value: 'all', label: `All ${counts.all}` },
            { value: 'earned', label: `Earned ${counts.earned}` },
            { value: 'progress', label: `In progress ${counts.progress}` },
            { value: 'locked', label: `Locked ${counts.locked}` },
          ]}
          value={status}
          onChange={(v) => { setStatus(v as Status); setLimit(PAGE); }}
        />
        <DexSearchInput
          aria-label="Search rewards"
          placeholder="Search rewards"
          value={q}
          onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }}
          onClear={() => { setQ(''); setLimit(PAGE); }}
          style={{ width: 220 }}
        />
      </div>
      <div role="group" aria-label="Category" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {(['all', ...cats] as const).map((c) => (
          <Pill
            key={c}
            size="md"
            active={category === c}
            onClick={() => { setCategory(c); setLimit(PAGE); }}
            style={category === c ? CHIP : { ...CHIP, background: 'var(--color-bg-surface)' }}
          >
            {c === 'all' ? 'All categories' : CATEGORY_META[c].title}
          </Pill>
        ))}
      </div>

      <div role="list" style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--color-border-subtle)' }}>
        {rows.slice(0, limit).map(({ a, st }) => {
          const hidden = a.secret && st !== 'earned';
          const p = a.progress?.(stats);
          const pct = st === 'earned' ? 100 : p && p.target > 0 ? Math.min(100, (p.current / p.target) * 100) : 0;
          const isOpen = open === a.id;
          return (
            <div role="listitem" key={a.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : a.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 4px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', textAlign: 'left' }}
              >
                <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-elevated)', opacity: st === 'earned' ? 1 : 0.55, flexShrink: 0 }}>
                  <DexIcon name={hidden ? 'lock' : a.icon} size={14} color="var(--color-text-secondary)" />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: st === 'earned' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {hidden ? 'Hidden reward' : a.title}
                  </span>
                  {st === 'progress' && p && (
                    <span aria-hidden="true" style={{ display: 'block', height: 3, borderRadius: 2, marginTop: 4, background: 'var(--color-bg-elevated)', overflow: 'hidden', maxWidth: 220 }}>
                      <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'var(--color-accent)' }} />
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {st === 'earned' ? 'Earned' : st === 'progress' && p ? `${p.current.toLocaleString()} / ${p.target.toLocaleString()}` : 'Locked'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{a.points} pts</span>
              </button>
              {isOpen && (
                <div style={{ padding: '0 4px 10px 40px', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  <div>{hidden ? 'This reward is a surprise. Its details appear when you earn it.' : a.description}</div>
                  <div style={{ marginTop: 4, color: 'var(--color-text-tertiary)' }}>
                    {[CATEGORY_META[a.category]?.title, RARITY_META[a.rarity]?.title,
                      st === 'earned' && unlockedAt[a.id] ? `earned ${new Date(unlockedAt[a.id]).toLocaleDateString()}` : null,
                      st === 'progress' && p ? `${Math.round(pct)}% there` : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <div style={{ padding: 14, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Nothing here yet.</div>}
      </div>
      {rows.length > limit && (
        <Button size="sm" variant="secondary" onClick={() => setLimit((l) => l + PAGE)} style={{ marginTop: 10 }}>
          Show {Math.min(PAGE, rows.length - limit)} more of {rows.length - limit}
        </Button>
      )}
    </section>
  );
};

export default AchievementBrowser;
