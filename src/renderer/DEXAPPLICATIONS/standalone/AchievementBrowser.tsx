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
import { SegmentedControl, DexFloatingSearch, DexCapsuleButton } from '../../components/controls';
import { ACHIEVEMENTS, CATEGORY_META, RARITY_META, type Achievement, type AchievementCategory, type UserStats } from '../../services/achievementsCatalog';

type Status = 'all' | 'earned' | 'progress' | 'locked';
const PAGE = 60;

export function achievementStatus(a: Achievement, unlocked: ReadonlySet<string>, stats: UserStats): Exclude<Status, 'all'> {
  if (unlocked.has(a.id)) return 'earned';
  const p = a.progress?.(stats);
  return p && p.target > 0 && p.current > 0 ? 'progress' : 'locked';
}

export const AchievementBrowser: React.FC<{ unlocked: ReadonlySet<string>; unlockedAt: Record<string, number>; stats: UserStats }> = ({ unlocked, unlockedAt, stats }) => {
  const [status, setStatus] = useState<Status>('all');
  const [category, setCategory] = useState<AchievementCategory | 'all'>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return ACHIEVEMENTS.map((a) => ({ a, st: achievementStatus(a, unlocked, stats) }))
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
  }, [status, category, q, unlocked, unlockedAt, stats]);

  const counts = useMemo(() => {
    const c = { all: ACHIEVEMENTS.length, earned: 0, progress: 0, locked: 0 };
    for (const a of ACHIEVEMENTS) c[achievementStatus(a, unlocked, stats)]++;
    return c;
  }, [unlocked, stats]);

  const cats = Object.keys(CATEGORY_META) as AchievementCategory[];

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
        <DexFloatingSearch value={q} onChange={(v) => { setQ(v); setLimit(PAGE); }} label="Search rewards" size="md" width={200} />
      </div>
      <div role="group" aria-label="Category" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {(['all', ...cats] as const).map((c) => (
          <DexCapsuleButton
            key={c}
            size="sm"
            active={category === c}
            onClick={() => { setCategory(c); setLimit(PAGE); }}
            style={{ border: '1px solid var(--color-border-subtle)' }}
          >
            {c === 'all' ? 'All categories' : CATEGORY_META[c].title}
          </DexCapsuleButton>
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
        <DexCapsuleButton size="md" onClick={() => setLimit((l) => l + PAGE)} style={{ marginTop: 8, border: '1px solid var(--color-border-subtle)' }}>
          Show {Math.min(PAGE, rows.length - limit)} more of {rows.length - limit}
        </DexCapsuleButton>
      )}
    </section>
  );
};

export default AchievementBrowser;
