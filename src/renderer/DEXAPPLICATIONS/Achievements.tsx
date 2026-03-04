/**
 * DEX Achievements / Trophies App
 * Professional trophy case with 500 achievements, glass panels,
 * category tabs, rarity glow, progress tracking. NO emojis.
 */

import React, { useState, useMemo, useCallback, useEffect, memo } from 'react';
import DexIcon from '../components/DexIcon';
import {
  ACHIEVEMENTS, CATEGORY_META, RARITY_META, DEFAULT_STATS,
  type Achievement, type AchievementCategory, type AchievementRarity,
} from '../services/achievementsCatalog';
import {
  loadEngagement, saveEngagement, getTotalPoints, getUserRank, getAchievementStats,
  type EngagementState,
} from '../services/engagement';

// ── Types ─────────────────────────────────────────────────────────────────
type TabFilter = 'all' | AchievementCategory;
type RarityFilter = 'all' | AchievementRarity;
type StatusFilter = 'all' | 'unlocked' | 'locked';

// ── Component ─────────────────────────────────────────────────────────────
const Achievements: React.FC = () => {
  const [engagement, setEngagement] = useState<EngagementState>(() => loadEngagement());
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Record that user viewed achievements (for achievement tracking)
  useEffect(() => {
    const updated = { ...engagement };
    const stats = { ...updated.stats };
    if (typeof stats.achievementsViewed === 'number') {
      stats.achievementsViewed++;
    } else {
      stats.achievementsViewed = 1;
    }
    updated.stats = stats;
    setEngagement(updated);
    saveEngagement(updated);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const unlocked = useMemo(() => new Set(engagement.unlockedAchievements), [engagement.unlockedAchievements]);
  const stats = useMemo(() => getAchievementStats(engagement.unlockedAchievements), [engagement.unlockedAchievements]);
  const rank = stats.rank;

  // Filtered achievements
  const filtered = useMemo(() => {
    let list = ACHIEVEMENTS;
    if (activeTab !== 'all') list = list.filter(a => a.category === activeTab);
    if (rarityFilter !== 'all') list = list.filter(a => a.rarity === rarityFilter);
    if (statusFilter === 'unlocked') list = list.filter(a => unlocked.has(a.id));
    if (statusFilter === 'locked') list = list.filter(a => !unlocked.has(a.id));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(a =>
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [activeTab, rarityFilter, statusFilter, searchQuery, unlocked]);

  const handleSelectAchievement = useCallback((a: Achievement) => {
    setSelectedAchievement(prev => prev?.id === a.id ? null : a);
  }, []);

  // ── Category tabs ─────────────────────────────────────────────────────
  const categories: { key: TabFilter; label: string; icon: string; count: number }[] = useMemo(() => {
    const all = { key: 'all' as TabFilter, label: 'All', icon: 'trophy', count: ACHIEVEMENTS.length };
    const cats = (Object.keys(CATEGORY_META) as AchievementCategory[]).map(k => ({
      key: k as TabFilter,
      label: CATEGORY_META[k].title,
      icon: CATEGORY_META[k].icon,
      count: ACHIEVEMENTS.filter(a => a.category === k).length,
    }));
    return [all, ...cats];
  }, []);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--color-bg-base, #0a0a0f)',
      color: 'var(--color-text-primary, #e5e5ea)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px 16px',
        background: 'linear-gradient(135deg, rgba(245,158,11,.12) 0%, rgba(234,88,12,.08) 100%)',
        borderBottom: '1px solid rgba(255,255,255,.06)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, #ff9f0a, #d97706)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(245,158,11,.3)',
            }}>
              <DexIcon name="trophy" size={26} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>Trophies</h1>
              <p style={{ fontSize: 12, margin: 0, opacity: 0.5 }}>
                {stats.totalUnlocked} / {stats.totalAchievements} unlocked ({stats.completionPercent}%)
              </p>
            </div>
          </div>

          {/* Rank Badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 16px', borderRadius: 12,
            background: 'rgba(255,255,255,.04)',
            border: '1px solid rgba(255,255,255,.06)',
          }}>
            <DexIcon name={rank.icon} size={22} color="#ff9f0a" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{rank.title}</div>
              <div style={{ fontSize: 11, opacity: 0.5 }}>{stats.points.toLocaleString()} pts</div>
            </div>
            {rank.pointsNeeded > 0 && (
              <div style={{ marginLeft: 8 }}>
                <div style={{
                  width: 60, height: 4, borderRadius: 2,
                  background: 'rgba(255,255,255,.1)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${Math.min(100, ((stats.points) / (stats.points + rank.pointsNeeded)) * 100)}%`,
                    height: '100%',
                    borderRadius: 2,
                    background: 'linear-gradient(90deg, #ff9f0a, #d97706)',
                  }} />
                </div>
                <div style={{ fontSize: 9, opacity: 0.4, marginTop: 2, textAlign: 'right' }}>
                  {rank.pointsNeeded} to {rank.next}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats Row */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['common', 'rare', 'epic', 'legendary'] as AchievementRarity[]).map(r => {
            const total = ACHIEVEMENTS.filter(a => a.rarity === r).length;
            const unl = ACHIEVEMENTS.filter(a => a.rarity === r && unlocked.has(a.id)).length;
            const meta = RARITY_META[r];
            return (
              <div key={r} style={{
                padding: '4px 10px', borderRadius: 8,
                background: `${meta.color}15`,
                border: `1px solid ${meta.color}30`,
                fontSize: 11, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <DexIcon name={meta.icon} size={12} color={meta.color} />
                <span style={{ color: meta.color }}>{unl}/{total}</span>
                <span style={{ opacity: 0.5, textTransform: 'capitalize' }}>{r}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls Row */}
      <div style={{
        padding: '10px 24px',
        display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid rgba(255,255,255,.04)',
        flexShrink: 0, flexWrap: 'wrap',
      }}>
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 8,
          background: 'rgba(255,255,255,.04)',
          border: '1px solid rgba(255,255,255,.06)',
          flex: '1 1 200px', maxWidth: 320,
        }}>
          <DexIcon name="search" size={14} color="rgba(255,255,255,.4)" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search achievements..."
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: 'inherit', fontSize: 13, width: '100%',
            }}
          />
        </div>

        {/* Status filter */}
        <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,.04)', borderRadius: 8, padding: 2 }}>
          {(['all', 'unlocked', 'locked'] as StatusFilter[]).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} aria-label={`Filter by ${s}`} style={{
              padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 500, textTransform: 'capitalize',
              background: statusFilter === s ? 'rgba(245,158,11,.2)' : 'transparent',
              color: statusFilter === s ? '#ff9f0a' : 'rgba(255,255,255,.5)',
              transition: 'all .15s',
            }}>{s}</button>
          ))}
        </div>

        {/* Rarity filter */}
        <select
          value={rarityFilter}
          onChange={e => setRarityFilter(e.target.value as RarityFilter)}
          style={{
            padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.06)',
            background: 'rgba(255,255,255,.04)', color: 'inherit', fontSize: 12,
            cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="all">All Rarities</option>
          <option value="common">Common</option>
          <option value="rare">Rare</option>
          <option value="epic">Epic</option>
          <option value="legendary">Legendary</option>
        </select>

        {/* View toggle */}
        <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
          <button onClick={() => setViewMode('grid')} aria-label="Grid view" style={{
            padding: 6, borderRadius: 6, border: 'none', cursor: 'pointer',
            background: viewMode === 'grid' ? 'rgba(245,158,11,.2)' : 'transparent',
          }}>
            <DexIcon name="grid" size={14} color={viewMode === 'grid' ? '#ff9f0a' : 'rgba(255,255,255,.4)'} />
          </button>
          <button onClick={() => setViewMode('list')} aria-label="List view" style={{
            padding: 6, borderRadius: 6, border: 'none', cursor: 'pointer',
            background: viewMode === 'list' ? 'rgba(245,158,11,.2)' : 'transparent',
          }}>
            <DexIcon name="menu" size={14} color={viewMode === 'list' ? '#ff9f0a' : 'rgba(255,255,255,.4)'} />
          </button>
        </div>
      </div>

      {/* Main Area: Category tabs + Achievement grid */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Category Sidebar */}
        <div style={{
          width: 180, flexShrink: 0, overflowY: 'auto',
          borderRight: '1px solid rgba(255,255,255,.04)',
          padding: '8px 6px',
        }}>
          {categories.map(cat => {
            const isActive = activeTab === cat.key;
            const catStats = cat.key === 'all' ? null : stats.byCategory[cat.key];
            return (
              <button key={cat.key} onClick={() => setActiveTab(cat.key)} aria-label={`${cat.label} category`} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '8px 10px', borderRadius: 8,
                border: 'none', cursor: 'pointer', textAlign: 'left',
                background: isActive ? 'rgba(245,158,11,.12)' : 'transparent',
                color: isActive ? '#ff9f0a' : 'rgba(255,255,255,.6)',
                fontSize: 12, fontWeight: isActive ? 600 : 400,
                transition: 'all .15s', marginBottom: 2,
              }}>
                <DexIcon name={cat.icon} size={14} color={isActive ? '#ff9f0a' : 'rgba(255,255,255,.35)'} />
                <span style={{ flex: 1 }}>{cat.label}</span>
                <span style={{ fontSize: 10, opacity: 0.5 }}>
                  {catStats ? `${catStats.unlocked}/${catStats.total}` : cat.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Achievement Grid/List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {filtered.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '100%', opacity: 0.4,
            }}>
              <DexIcon name="search" size={40} color="rgba(255,255,255,.2)" />
              <p style={{ marginTop: 12, fontSize: 14 }}>No achievements found</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 10,
            }}>
              {filtered.map(ach => (
                <AchievementCard
                  key={ach.id}
                  achievement={ach}
                  isUnlocked={unlocked.has(ach.id)}
                  isSelected={selectedAchievement?.id === ach.id}
                  onClick={() => handleSelectAchievement(ach)}
                />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtered.map(ach => (
                <AchievementRow
                  key={ach.id}
                  achievement={ach}
                  isUnlocked={unlocked.has(ach.id)}
                  isSelected={selectedAchievement?.id === ach.id}
                  onClick={() => handleSelectAchievement(ach)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedAchievement && (
          <DetailPanel
            achievement={selectedAchievement}
            isUnlocked={unlocked.has(selectedAchievement.id)}
            onClose={() => setSelectedAchievement(null)}
          />
        )}
      </div>
    </div>
  );
};

// ── Achievement Card ────────────────────────────────────────────────────
const AchievementCard: React.FC<{
  achievement: Achievement;
  isUnlocked: boolean;
  isSelected: boolean;
  onClick: () => void;
}> = React.memo(({ achievement, isUnlocked, isSelected, onClick }) => {
  const meta = RARITY_META[achievement.rarity];
  const isSecret = achievement.secret && !isUnlocked;

  return (
    <button onClick={onClick} aria-label={`${isSecret ? 'Secret achievement' : achievement.title}`} style={{
      padding: 14, borderRadius: 12, cursor: 'pointer',
      textAlign: 'left', position: 'relative', overflow: 'hidden',
      background: isSelected
        ? `${meta.color}20`
        : isUnlocked
          ? 'rgba(255,255,255,.04)'
          : 'rgba(255,255,255,.015)',
      border: isSelected ? `1px solid ${meta.color}40` : '1px solid rgba(255,255,255,.04)',
      opacity: isUnlocked ? 1 : 0.45,
      transition: 'all .2s',
      color: 'inherit',
    }}>
      {/* Rarity glow for unlocked */}
      {isUnlocked && (achievement.rarity === 'epic' || achievement.rarity === 'legendary') && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(circle at 30% 30%, ${meta.glow}, transparent 70%)`,
          pointerEvents: 'none',
        }} />
      )}

      <div style={{ position: 'relative' }}>
        {/* Icon */}
        <div style={{
          width: 36, height: 36, borderRadius: 10, marginBottom: 8,
          background: isUnlocked ? `${meta.color}20` : 'rgba(255,255,255,.04)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <DexIcon
            name={isSecret ? 'help-circle' : achievement.icon}
            size={20}
            color={isUnlocked ? meta.color : 'rgba(255,255,255,.25)'}
          />
        </div>

        {/* Title */}
        <div style={{
          fontSize: 12, fontWeight: 600, marginBottom: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {isSecret ? '???' : achievement.title}
        </div>

        {/* Description */}
        <div style={{
          fontSize: 10, opacity: 0.45, lineHeight: '1.3',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {isSecret ? 'Hidden achievement' : achievement.description}
        </div>

        {/* Points + Rarity */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          marginTop: 6, fontSize: 10,
        }}>
          <span style={{ color: meta.color, fontWeight: 600 }}>{achievement.points}pts</span>
          <span style={{
            padding: '1px 5px', borderRadius: 4,
            background: `${meta.color}15`, color: meta.color,
            fontSize: 9, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px',
          }}>{achievement.rarity}</span>
        </div>
      </div>
    </button>
  );
});

// ── Achievement List Row ────────────────────────────────────────────────
const AchievementRow: React.FC<{
  achievement: Achievement;
  isUnlocked: boolean;
  isSelected: boolean;
  onClick: () => void;
}> = React.memo(({ achievement, isUnlocked, isSelected, onClick }) => {
  const meta = RARITY_META[achievement.rarity];
  const isSecret = achievement.secret && !isUnlocked;

  return (
    <button onClick={onClick} aria-label={`${isSecret ? 'Secret achievement' : achievement.title}`} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
      background: isSelected ? `${meta.color}15` : 'transparent',
      border: isSelected ? `1px solid ${meta.color}30` : '1px solid transparent',
      opacity: isUnlocked ? 1 : 0.4,
      color: 'inherit', textAlign: 'left', width: '100%',
      transition: 'all .15s',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: isUnlocked ? `${meta.color}18` : 'rgba(255,255,255,.03)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <DexIcon
          name={isSecret ? 'help-circle' : achievement.icon}
          size={16}
          color={isUnlocked ? meta.color : 'rgba(255,255,255,.2)'}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {isSecret ? '???' : achievement.title}
        </div>
        <div style={{ fontSize: 10, opacity: 0.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {isSecret ? 'Hidden achievement' : achievement.description}
        </div>
      </div>
      <span style={{ color: meta.color, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
        {achievement.points}pts
      </span>
      <span style={{
        padding: '2px 6px', borderRadius: 4,
        background: `${meta.color}12`, color: meta.color,
        fontSize: 9, fontWeight: 600, textTransform: 'uppercase', flexShrink: 0,
      }}>{achievement.rarity}</span>
      {isUnlocked && (
        <DexIcon name="check-circle" size={14} color="#30d158" />
      )}
    </button>
  );
});

// ── Detail Panel ────────────────────────────────────────────────────────
const DetailPanel: React.FC<{
  achievement: Achievement;
  isUnlocked: boolean;
  onClose: () => void;
}> = ({ achievement, isUnlocked, onClose }) => {
  const meta = RARITY_META[achievement.rarity];
  const catMeta = CATEGORY_META[achievement.category];

  return (
    <div style={{
      width: 260, flexShrink: 0, overflowY: 'auto',
      borderLeft: '1px solid rgba(255,255,255,.04)',
      padding: 20, position: 'relative',
    }}>
      <button onClick={onClose} aria-label="Close detail panel" style={{
        position: 'absolute', top: 12, right: 12,
        background: 'rgba(255,255,255,.06)', border: 'none',
        borderRadius: 6, padding: 4, cursor: 'pointer',
      }}>
        <DexIcon name="x" size={14} color="rgba(255,255,255,.4)" />
      </button>

      {/* Icon large */}
      <div style={{
        width: 72, height: 72, borderRadius: 18, margin: '0 auto 16px',
        background: isUnlocked
          ? `linear-gradient(135deg, ${meta.color}30, ${meta.color}10)`
          : 'rgba(255,255,255,.03)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: isUnlocked ? `0 0 30px ${meta.glow}` : 'none',
        border: `1px solid ${isUnlocked ? `${meta.color}30` : 'rgba(255,255,255,.04)'}`,
      }}>
        <DexIcon
          name={achievement.icon}
          size={36}
          color={isUnlocked ? meta.color : 'rgba(255,255,255,.15)'}
        />
      </div>

      <h3 style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>
        {achievement.title}
      </h3>
      <p style={{ textAlign: 'center', fontSize: 12, opacity: 0.5, margin: '0 0 16px', lineHeight: '1.4' }}>
        {achievement.description}
      </p>

      {/* Meta */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <DetailRow label="Points" value={`${achievement.points}`} icon="star" />
        <DetailRow label="Rarity" value={achievement.rarity} icon={meta.icon} color={meta.color} />
        <DetailRow label="Category" value={catMeta.title} icon={catMeta.icon} color={catMeta.color} />
        <DetailRow label="Status" value={isUnlocked ? 'Unlocked' : 'Locked'} icon={isUnlocked ? 'check-circle' : 'lock'} color={isUnlocked ? '#30d158' : '#ff453a'} />
        {achievement.secret && (
          <DetailRow label="Type" value="Secret" icon="eye-off" color="#bf5af2" />
        )}
      </div>
    </div>
  );
};

// ── Detail Row Helper ────────────────────────────────────────────────────
const DetailRow: React.FC<{
  label: string; value: string; icon: string; color?: string;
}> = ({ label, value, icon, color }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 10px', borderRadius: 8,
    background: 'rgba(255,255,255,.02)',
  }}>
    <DexIcon name={icon} size={14} color={color || 'rgba(255,255,255,.4)'} />
    <span style={{ fontSize: 11, opacity: 0.5, flex: 1 }}>{label}</span>
    <span style={{
      fontSize: 11, fontWeight: 500, textTransform: 'capitalize',
      color: color || 'inherit',
    }}>{value}</span>
  </div>
);

Achievements.displayName = 'Achievements';
export default memo(Achievements);
