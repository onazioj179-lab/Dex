// =============================================================================
// DEX Platform — Phase 3 renderer: Store
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * The DEX Store — a registry-backed catalogue of every built-in DEX app.
 *
 * All metadata is read live from APP_DEFINITIONS (src/renderer/store/runningApps.ts);
 * there is no backend channel. Every DEX app is built-in, so the store treats
 * them all as "installed" and surfaces discovery instead of acquisition:
 *
 *   - search + category filtering + sort (name / category)
 *   - Featured + Recently added rails
 *   - a per-app detail view (name, description, category, icon, metadata, perms)
 *   - local ratings/favorites (localStorage) with a "My favorites" filter
 *   - one-click open via the `dex-open-app` CustomEvent
 *
 * Favorites and ratings persist to localStorage; everything else derives from
 * the registry on each render.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DexIcon from '../components/DexIcon';
import { DexSearchInput } from '../styles/components';
import { APP_DEFINITIONS } from '../store/runningApps';
import { useInstalledAppsStore, canRemoveApp, appTier, type AppTier } from '../store/installedAppsStore';
import { APP_TITLE, APP_SUBTITLE } from '../styles/appHeader';

const TIER_LABEL: Record<AppTier, string> = { core: 'Core', recommended: 'Recommended', optional: 'Optional' };
const TIER_HINT: Record<AppTier, string> = {
  core: 'Part of the DEX shell; always installed',
  recommended: 'Included on new setups',
  optional: 'Add it when you need it; not included on new setups',
};

// ---------------------------------------------------------------------------
// Types + registry projection
// ---------------------------------------------------------------------------

type AppCategory = 'creative' | 'system' | 'productivity' | 'utility' | 'media';

interface StoreApp {
  id: string;
  name: string;
  color: string;
  icon: string;
  category: AppCategory;
  description: string;
  shortcut?: string;
  version?: string;
  buildDate?: string;
  /** ms epoch derived from buildDate; 0 when unknown */
  buildTime: number;
}

const CATEGORY_LABELS: Record<AppCategory, string> = {
  creative: 'Creative',
  productivity: 'Productivity',
  media: 'Media',
  utility: 'Utility',
  system: 'System',
};

const CATEGORY_ORDER: AppCategory[] = ['creative', 'productivity', 'media', 'utility', 'system'];

/** Apps that should never appear as installable store entries (shell surfaces). */
const HIDDEN_APP_IDS = new Set(['home', 'store', 'power', 'recyclebin']);

/** A short, human-readable capability line when the registry omits a description. */
function fallbackDescription(name: string, category: AppCategory): string {
  return `${name} — a built-in DEX ${CATEGORY_LABELS[category].toLowerCase()} app.`;
}

/**
 * Heuristic permission/metadata surface. The registry does not store a formal
 * permissions list, so we derive a plausible, honest set from the category and
 * known traits of each app. This is presentational metadata only — it grants
 * nothing.
 */
function derivePermissions(app: StoreApp): string[] {
  const perms = new Set<string>();
  const cat = app.category;
  if (cat === 'creative' || cat === 'media') {
    perms.add('Files & media');
  }
  if (cat === 'productivity' || cat === 'creative') {
    perms.add('Local storage');
  }
  if (cat === 'system' || cat === 'utility') {
    perms.add('System info');
  }
  // App-specific signals from the id.
  const id = app.id;
  if (/audio|imosion|noise|music|screenrecorder/.test(id)) perms.add('Microphone / audio');
  if (/screenrecorder|gallery|prism|pixelart|canvas/.test(id)) perms.add('Screen & camera');
  if (/browser|maps|weather|ssh|git|collabhub|transfers/.test(id)) perms.add('Network');
  if (/calendar|tasks|notes|kanban|workflows/.test(id)) perms.add('Notifications');
  if (perms.size === 0) perms.add('Local storage');
  return [...perms];
}

function buildCatalog(): StoreApp[] {
  const out: StoreApp[] = [];
  for (const [id, def] of Object.entries(APP_DEFINITIONS)) {
    if (HIDDEN_APP_IDS.has(id)) continue;
    const category = (def.category ?? 'utility') as AppCategory;
    const buildTime = def.buildDate ? Date.parse(def.buildDate) : NaN;
    out.push({
      id,
      name: def.name,
      color: def.color,
      icon: def.icon,
      category,
      description: def.description?.trim() || fallbackDescription(def.name, category),
      shortcut: def.shortcut,
      version: def.version,
      buildDate: def.buildDate,
      buildTime: Number.isFinite(buildTime) ? buildTime : 0,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Local persistence (favorites + ratings)
// ---------------------------------------------------------------------------

const FAVORITES_KEY = 'dex-store-favorites';
const RATINGS_KEY = 'dex-store-ratings';

function loadStringSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((x): x is string => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function loadRatings(): Record<string, number> {
  try {
    const raw = localStorage.getItem(RATINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 1 && n <= 5) out[k] = Math.round(n);
    }
    return out;
  } catch {
    return {};
  }
}

function persist(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable / full — favorites are best-effort */
  }
}

function toast(message: string, kind: 'info' | 'success' | 'error' = 'info'): void {
  try {
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { message, type: kind } }));
  } catch {
    /* ignore */
  }
}

function openApp(appId: string): void {
  try {
    window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appId } }));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Sort + filter
// ---------------------------------------------------------------------------

type SortMode = 'name' | 'category';
type CategoryFilter = 'all' | AppCategory;

function sortApps(apps: StoreApp[], mode: SortMode): StoreApp[] {
  const copy = [...apps];
  if (mode === 'name') {
    copy.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    copy.sort((a, b) => {
      const ci = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
      return ci !== 0 ? ci : a.name.localeCompare(b.name);
    });
  }
  return copy;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Store(): React.ReactElement {
  const catalog = useMemo(() => buildCatalog(), []);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [sort, setSort] = useState<SortMode>('category');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [favorites, setFavorites] = useState<Set<string>>(() => loadStringSet(FAVORITES_KEY));
  const [ratings, setRatings] = useState<Record<string, number>>(() => loadRatings());

  // App lifecycle: removed apps disappear from the launcher/home/palette/search
  // and show a "Get" (reinstall) action here instead of "Open".
  const removedAppIds = useInstalledAppsStore(s => s.removedAppIds);
  const removeApp = useInstalledAppsStore(s => s.removeApp);
  const reinstallApp = useInstalledAppsStore(s => s.reinstallApp);
  const resetApps = useInstalledAppsStore(s => s.resetApps);
  const removedSet = useMemo(() => new Set(removedAppIds), [removedAppIds]);
  const isRemoved = useCallback((id: string) => removedSet.has(id), [removedSet]);

  // Persist on change.
  useEffect(() => { persist(FAVORITES_KEY, [...favorites]); }, [favorites]);
  useEffect(() => { persist(RATINGS_KEY, ratings); }, [ratings]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        toast(`Removed ${APP_DEFINITIONS[id]?.name ?? id} from favorites`);
      } else {
        next.add(id);
        toast(`Added ${APP_DEFINITIONS[id]?.name ?? id} to favorites`, 'success');
      }
      return next;
    });
  }, []);

  const rateApp = useCallback((id: string, stars: number) => {
    setRatings(prev => {
      const next = { ...prev };
      if (prev[id] === stars) {
        delete next[id]; // click the same star to clear
      } else {
        next[id] = stars;
      }
      return next;
    });
  }, []);

  const launch = useCallback((id: string) => {
    openApp(id);
    toast(`Opening ${APP_DEFINITIONS[id]?.name ?? id}`, 'success');
  }, []);

  const handleRemove = useCallback((id: string) => {
    removeApp(id);
    toast(`Removed ${APP_DEFINITIONS[id]?.name ?? id}`, 'success');
  }, [removeApp]);

  const handleReinstall = useCallback((id: string) => {
    reinstallApp(id);
    toast(`Reinstalled ${APP_DEFINITIONS[id]?.name ?? id}`, 'success');
  }, [reinstallApp]);

  const handleResetApps = useCallback(() => {
    resetApps();
    toast('All apps restored to defaults', 'success');
  }, [resetApps]);

  // Featured: a stable, curated subset (flagship apps) that exist in the catalog.
  const featured = useMemo(() => {
    const flagship = ['videoeditor', 'imosion', 'prism', 'flux', 'axl', 'nexus', 'dexcode', 'maps'];
    const byId = new Map(catalog.map(a => [a.id, a]));
    return flagship.map(id => byId.get(id)).filter((a): a is StoreApp => !!a);
  }, [catalog]);

  // Recently added: newest build dates first.
  const recentlyAdded = useMemo(() => {
    return [...catalog]
      .filter(a => a.buildTime > 0)
      .sort((a, b) => b.buildTime - a.buildTime || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [catalog]);

  // Main filtered + sorted grid.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = catalog.filter(app => {
      if (category !== 'all' && app.category !== category) return false;
      if (favoritesOnly && !favorites.has(app.id)) return false;
      if (q) {
        const hay = `${app.name} ${app.description} ${CATEGORY_LABELS[app.category]}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list = sortApps(list, sort);
    return list;
  }, [catalog, query, category, favoritesOnly, favorites, sort]);

  const selected = useMemo(
    () => (selectedId ? catalog.find(a => a.id === selectedId) ?? null : null),
    [selectedId, catalog],
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: catalog.length };
    for (const c of CATEGORY_ORDER) counts[c] = 0;
    for (const a of catalog) counts[a.category] = (counts[a.category] ?? 0) + 1;
    return counts;
  }, [catalog]);

  const isSearching = query.trim().length > 0 || category !== 'all' || favoritesOnly;

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const renderStars = (id: string, size = 14, interactive = true) => {
    const value = ratings[id] ?? 0;
    return (
      <div style={styles.stars} role={interactive ? 'radiogroup' : undefined} aria-label={`Rating for ${APP_DEFINITIONS[id]?.name ?? id}`}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            disabled={!interactive}
            onClick={e => { e.stopPropagation(); rateApp(id, n); }}
            title={interactive ? `Rate ${n} star${n === 1 ? '' : 's'}` : `${value} of 5`}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            style={{
              ...styles.starBtn,
              cursor: interactive ? 'pointer' : 'default',
              color: n <= value ? 'var(--color-warning)' : 'var(--color-text-tertiary)',
            }}
          >
            <DexIcon name={n <= value ? 'star' : 'star-outline'} size={size} />
          </button>
        ))}
      </div>
    );
  };

  const AppCard = ({ app, compact = false }: { app: StoreApp; compact?: boolean }) => {
    const isFav = favorites.has(app.id);
    return (
      // Card is a role="button" div, NOT a <button>: it contains the favorite
      // <button>, and a button-inside-a-button is invalid HTML (React warns and
      // the inner button's clicks misbehave). The div keeps full keyboard access.
      <div
        role="button"
        tabIndex={0}
        onClick={() => setSelectedId(app.id)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(app.id); } }}
        style={{ ...styles.card, ...(compact ? styles.cardCompact : null) }}
        title={`${app.name} — view details`}
      >
        <div style={styles.cardTop}>
          <div style={{ ...styles.appIcon, background: tintBg(app.color), color: app.color, borderColor: tintBorder(app.color) }} aria-hidden>
            <DexIcon name={app.icon} size={compact ? 20 : 24} />
          </div>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); toggleFavorite(app.id); }}
            style={{ ...styles.favBtn, color: isFav ? 'var(--color-error)' : 'var(--color-text-tertiary)' }}
            title={isFav ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={isFav}
            aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
          >
            <DexIcon name="heart" size={15} />
          </button>
        </div>
        <div style={styles.cardName}>{app.name}</div>
        {!compact && <div style={styles.cardDesc}>{app.description}</div>}
        <div style={styles.cardFoot}>
          <span style={styles.catChip}>{CATEGORY_LABELS[app.category]}</span>
          {ratings[app.id] ? (
            // Surface the user's own rating on the card -- it was stored but only
            // ever visible inside the detail view before.
            <span style={{ display: 'inline-flex', alignItems: 'center' }} title={`You rated this ${ratings[app.id]} of 5`}>
              {renderStars(app.id, 11, false)}
            </span>
          ) : isRemoved(app.id) ? (
            <span style={{ ...styles.installedBadge, color: 'var(--color-text-tertiary)' }}>
              <DexIcon name="download" size={12} /> Removed
            </span>
          ) : (
            <span style={styles.installedBadge}>
              <DexIcon name="check-circle" size={12} /> Installed
            </span>
          )}
        </div>
      </div>
    );
  };

  const Rail = ({ title, icon, apps }: { title: string; icon: string; apps: StoreApp[] }) => {
    if (apps.length === 0) return null;
    return (
      <section style={styles.rail}>
        <div style={styles.railHead}>
          <DexIcon name={icon} size={15} />
          <h2 style={styles.railTitle}>{title}</h2>
        </div>
        <div style={styles.railScroll}>
          {apps.map(app => (
            <div key={app.id} style={styles.railItem}>
              <AppCard app={app} compact />
            </div>
          ))}
        </div>
      </section>
    );
  };

  // -------------------------------------------------------------------------
  // Detail view
  // -------------------------------------------------------------------------

  if (selected) {
    const isFav = favorites.has(selected.id);
    const perms = derivePermissions(selected);
    return (
      <div style={styles.container}>
        <header style={styles.header}>
          <div style={styles.titleBlock}>
            <button type="button" onClick={() => setSelectedId(null)} style={styles.backBtn} title="Back to store">
              <DexIcon name="arrow-left" size={16} />
              <span>Store</span>
            </button>
          </div>
        </header>

        <div style={styles.detailScroll}>
          <div style={styles.detailHero}>
            <div style={{ ...styles.detailIcon, background: tintBg(selected.color), color: selected.color, borderColor: tintBorder(selected.color) }} aria-hidden>
              <DexIcon name={selected.icon} size={44} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h1 style={styles.detailName}>{selected.name}</h1>
              <div style={styles.detailMetaRow}>
                <span style={styles.catChip}>{CATEGORY_LABELS[selected.category]}</span>
                <span style={styles.metaDim} title={TIER_HINT[appTier(selected.id)]}>{TIER_LABEL[appTier(selected.id)]}</span>
                {isRemoved(selected.id) ? (
                  <span style={{ ...styles.installedBadge, color: 'var(--color-text-tertiary)' }}><DexIcon name="download" size={12} /> Removed</span>
                ) : (
                  <span style={styles.installedBadge}><DexIcon name="check-circle" size={12} /> Installed</span>
                )}
                {selected.version && <span style={styles.metaDim}>v{selected.version}</span>}
              </div>
              <div style={styles.detailActions}>
                {isRemoved(selected.id) ? (
                  // Removed → the only primary action is to reinstall ("Get").
                  <button type="button" style={styles.primaryBtn} onClick={() => handleReinstall(selected.id)}>
                    <DexIcon name="download" size={15} /> Get
                  </button>
                ) : (
                  <button type="button" style={styles.primaryBtn} onClick={() => launch(selected.id)}>
                    <DexIcon name="external-link" size={15} /> Open
                  </button>
                )}
                <button
                  type="button"
                  style={{ ...styles.secondaryBtn, color: isFav ? 'var(--color-error)' : 'var(--color-text-primary)' }}
                  onClick={() => toggleFavorite(selected.id)}
                  aria-pressed={isFav}
                >
                  <DexIcon name="heart" size={15} />
                  {isFav ? 'Favorited' : 'Favorite'}
                </button>
                {/* Remove is only offered for non-protected, currently-installed apps. */}
                {!isRemoved(selected.id) && canRemoveApp(selected.id) && (
                  <button
                    type="button"
                    style={{ ...styles.secondaryBtn, color: 'var(--color-error)' }}
                    onClick={() => handleRemove(selected.id)}
                    title={`Remove ${selected.name} — reinstall any time from the Store`}
                  >
                    <DexIcon name="trash" size={15} /> Remove
                  </button>
                )}
              </div>
              {canRemoveApp(selected.id) && (
                <div style={{ ...styles.metaDim, marginTop: 8 }}>
                  Removing hides {selected.name} everywhere in DEX. Its data is kept, so reinstalling brings everything back.
                  App code ships inside DEX, so removing doesn't free disk space.
                </div>
              )}
            </div>
          </div>

          <section style={styles.detailSection}>
            <h3 style={styles.sectionTitle}>About</h3>
            <p style={styles.detailDesc}>{selected.description}</p>
          </section>

          <section style={styles.detailSection}>
            <h3 style={styles.sectionTitle}>Your rating</h3>
            {renderStars(selected.id, 22, true)}
            <div style={styles.metaDim}>
              {ratings[selected.id]
                ? `You rated this ${ratings[selected.id]} of 5 — tap the same star to clear.`
                : 'Tap a star to rate this app (stored locally).'}
            </div>
          </section>

          <section style={styles.detailSection}>
            <h3 style={styles.sectionTitle}>Permissions</h3>
            <div style={styles.permGrid}>
              {perms.map(p => (
                <span key={p} style={styles.permChip}>
                  <DexIcon name="security-shield" size={13} /> {p}
                </span>
              ))}
            </div>
          </section>

          <section style={styles.detailSection}>
            <h3 style={styles.sectionTitle}>Information</h3>
            <dl style={styles.infoGrid}>
              <InfoRow label="Category" value={CATEGORY_LABELS[selected.category]} />
              {selected.version && <InfoRow label="Version" value={selected.version} />}
              {selected.buildDate && <InfoRow label="Updated" value={selected.buildDate} />}
              {selected.shortcut && <InfoRow label="Shortcut" value={selected.shortcut} />}
              <InfoRow label="App ID" value={selected.id} />
              <InfoRow label="Source" value="Built-in (DEX)" />
            </dl>
          </section>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Home view
  // -------------------------------------------------------------------------

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.titleBlock}>
          <div style={styles.storeIcon} aria-hidden><DexIcon name="store" size={18} /></div>
          <div style={{ minWidth: 0 }}>
            <h1 style={styles.title}>DEX Store</h1>
            <div style={styles.subtitle}>
              {catalog.length} apps · all built-in
              {removedAppIds.length > 0 && ` · ${removedAppIds.length} removed`}
            </div>
          </div>
          {/* Reset restores every removed app to the default set (mandate:
              "reset... default setting, that's when you can get the app back"). */}
          {removedAppIds.length > 0 && (
            <button
              type="button"
              style={styles.resetAppsBtn}
              onClick={handleResetApps}
              title="Reinstall every removed app"
            >
              <DexIcon name="refresh" size={13} /> Reset apps
            </button>
          )}
        </div>

        <div style={styles.controls}>
          <div style={styles.searchWrap}>
            <DexSearchInput
              fullWidth
              aria-label="Search the DEX Store"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onClear={() => setQuery('')}
              placeholder="Search apps"
              style={{ maxWidth: 340 }}
            />
          </div>
          <label style={styles.filterPill}>
            <input
              type="checkbox"
              checked={favoritesOnly}
              onChange={e => setFavoritesOnly(e.target.checked)}
              style={{ accentColor: 'var(--color-accent)' }}
            />
            <DexIcon name="heart" size={14} />
            <span>Favorites</span>
          </label>
          <label style={styles.sortPill} title="Sort apps">
            <DexIcon name="sliders" size={14} />
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortMode)}
              style={styles.sortSelect}
              aria-label="Sort apps"
            >
              <option value="category">Category</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>
      </header>

      {/* Category filter strip */}
      <div style={styles.catStrip}>
        <CategoryButton id="all" label="All" count={categoryCounts.all} active={category === 'all'} onClick={() => setCategory('all')} />
        {CATEGORY_ORDER.map(c => (
          <CategoryButton
            key={c}
            id={c}
            label={CATEGORY_LABELS[c]}
            count={categoryCounts[c] ?? 0}
            active={category === c}
            onClick={() => setCategory(c)}
          />
        ))}
      </div>

      <div style={styles.scroll}>
        {/* Discovery rails only show on the unfiltered landing surface. */}
        {!isSearching && (
          <>
            <Rail title="Featured" icon="star" apps={featured} />
            <Rail title="Recently added" icon="stopwatch" apps={recentlyAdded} />
          </>
        )}

        <section style={styles.gridSection}>
          <div style={styles.gridHead}>
            <h2 style={styles.railTitle}>
              {favoritesOnly ? 'My favorites' : category === 'all' ? 'All apps' : CATEGORY_LABELS[category as AppCategory]}
            </h2>
            <span style={styles.metaDim}>{filtered.length} app{filtered.length === 1 ? '' : 's'}</span>
          </div>

          {filtered.length === 0 ? (
            <div style={styles.empty}>
              <DexIcon name={favoritesOnly ? 'heart' : 'inspect'} size={26} />
              <span>
                {favoritesOnly
                  ? 'No favorites yet — tap the heart on any app to add it here.'
                  : 'No apps match your search.'}
              </span>
            </div>
          ) : (
            <div style={styles.grid}>
              {filtered.map(app => <AppCard key={app.id} app={app} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational sub-components
// ---------------------------------------------------------------------------

function InfoRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={styles.infoRow}>
      <dt style={styles.infoLabel}>{label}</dt>
      <dd style={styles.infoValue}>{value}</dd>
    </div>
  );
}

function CategoryButton(
  { id, label, count, active, onClick }: { id: string; label: string; count: number; active: boolean; onClick: () => void },
): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...styles.catBtn, ...(active ? styles.catBtnActive : null) }}
      aria-pressed={active}
    >
      {label}
      <span style={{ ...styles.catBtnCount, opacity: active ? 0.9 : 0.6 }}>{count}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Color helpers — tint an app's accent color into a soft icon background.
// CSS-variable colors (e.g. "var(--color-accent)") can't be parsed to rgba,
// so fall back to neutral surfaces for those.
// ---------------------------------------------------------------------------

function isHex(color: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color);
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function tintBg(color: string): string {
  if (!isHex(color)) return 'var(--color-bg-hover)';
  const [r, g, b] = hexToRgb(color);
  return `rgba(${r},${g},${b},0.14)`;
}

function tintBorder(color: string): string {
  if (!isHex(color)) return 'var(--pg-border)';
  const [r, g, b] = hexToRgb(color);
  return `rgba(${r},${g},${b},0.30)`;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  // Root page surface. No background here -> transparent, so the page sits on the
  // window's normal `--color-bg-base` (no glass, no framing box). Full-bleed.
  container: {
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
    borderRadius: 0,
  },
  // Toolbar header — transparent (no glass); only the bottom hairline + layout.
  header: {
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 'var(--space-3)',
    padding: 'var(--space-2) var(--space-4)',
    minHeight: 'var(--app-header-height)', boxSizing: 'border-box', flexShrink: 0,
    borderBottom: '1px solid var(--pg-border)',
    borderRadius: 0,
    display: 'flex',
    alignItems: 'center',
  },
  titleBlock: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    padding: '0 var(--space-3)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--pg-border-strong)',
    background: 'var(--color-bg-surface)',
    color: 'var(--color-text-primary)',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  storeIcon: {
    width: 34,
    height: 34,
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: 'var(--color-text-secondary)',
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-accent-soft, rgba(10,132,255,0.28))',
  },
  title: APP_TITLE,
  subtitle: APP_SUBTITLE,
  controls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 'var(--space-2)',
    minWidth: 0,
    maxWidth: '100%',
    overflowX: 'auto',
    overflowY: 'visible',
    scrollbarWidth: 'thin',
  },
  searchWrap: { display: 'flex', alignItems: 'center', minWidth: 180, flex: '1 1 240px' },
  filterPill: {
    minHeight: 32,
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '0 10px',
    border: '1px solid var(--pg-border-strong)',
    borderRadius: 'var(--radius-lg)',
    background: 'var(--color-bg-surface)',
    color: 'var(--color-text-secondary)',
    fontSize: 12,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    cursor: 'pointer',
  },
  sortPill: {
    minHeight: 32,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 8px 0 10px',
    border: '1px solid var(--pg-border-strong)',
    borderRadius: 'var(--radius-lg)',
    background: 'var(--color-bg-surface)',
    color: 'var(--color-text-secondary)',
    fontSize: 12,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  sortSelect: {
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-primary)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    outline: 'none',
    appearance: 'none',
    paddingRight: 2,
  },
  catStrip: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: 'var(--space-3) var(--space-4) 0',
    overflowX: 'auto',
    scrollbarWidth: 'thin',
    flexShrink: 0,
  },
  catBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 30,
    padding: '0 12px',
    border: '1px solid var(--pg-border)',
    borderRadius: 9999,
    background: 'var(--color-bg-surface)',
    color: 'var(--color-text-secondary)',
    fontSize: 12.5,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    flexShrink: 0,
  },
  catBtnActive: {
    background: 'var(--color-accent-fill)',
    borderColor: 'var(--color-accent)',
    color: '#fff',
  },
  catBtnCount: { fontSize: 11, fontWeight: 700 },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: 'var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-5)',
  },
  rail: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },
  railHead: { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-primary)' },
  railTitle: { margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' },
  railScroll: {
    display: 'flex',
    gap: 'var(--space-3)',
    overflowX: 'auto',
    paddingBottom: 6,
    scrollbarWidth: 'thin',
  },
  railItem: { width: 200, flexShrink: 0 },
  gridSection: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },
  gridHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 'var(--space-3)',
  },
  // App tile — solid surface (no glass), sits on the normal app background.
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-lg)',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--pg-border)',
    color: 'var(--color-text-primary)',
    textAlign: 'left',
    cursor: 'pointer',
    minHeight: 0,
  },
  cardCompact: { height: '100%' },
  cardTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  appIcon: {
    width: 46,
    height: 46,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    border: '1px solid var(--pg-border)',
  },
  favBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    flexShrink: 0,
  },
  cardName: { fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
  cardDesc: {
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    lineHeight: 1.4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  cardFoot: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 'auto' },
  catChip: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: 9999,
    border: '1px solid var(--pg-border)',
    background: 'var(--color-bg-hover)',
    color: 'var(--color-text-secondary)',
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  installedBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 9999,
    border: '1px solid var(--color-success-soft, rgba(48,209,88,0.3))',
    background: 'var(--color-success-light, rgba(48,209,88,0.12))',
    color: 'var(--color-success)',
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  stars: { display: 'inline-flex', alignItems: 'center', gap: 2 },
  starBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    padding: 2,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-6)',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    border: '1px dashed var(--pg-border)',
    borderRadius: 10,
  },
  // Detail view
  detailScroll: { flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' },
  detailHero: { display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)' },
  detailIcon: {
    width: 88,
    height: 88,
    borderRadius: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    border: '1px solid var(--pg-border)',
  },
  detailName: { margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' },
  detailMetaRow: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  detailActions: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  primaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    minHeight: 36,
    padding: '0 16px',
    borderRadius: 'var(--radius-lg)',
    border: 'none',
    background: 'var(--color-accent-fill)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  secondaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    minHeight: 36,
    padding: '0 14px',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--pg-border-strong)',
    background: 'var(--color-bg-surface)',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  resetAppsBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    padding: '0 12px',
    marginLeft: 'auto',
    borderRadius: 9999,
    border: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface)',
    color: 'var(--color-text-secondary)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  detailSection: { display: 'flex', flexDirection: 'column', gap: 8 },
  sectionTitle: { margin: 0, fontSize: 13, fontWeight: 700, textTransform: 'none', letterSpacing: '0.01em', color: 'var(--color-text-secondary)' },
  detailDesc: { margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-primary)' },
  metaDim: { fontSize: 12, color: 'var(--color-text-tertiary)' },
  permGrid: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  permChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 10px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--pg-border)',
    background: 'var(--color-bg-surface)',
    color: 'var(--color-text-secondary)',
    fontSize: 12,
    fontWeight: 600,
  },
  infoGrid: { display: 'flex', flexDirection: 'column', gap: 0, margin: 0 },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '9px 0',
    borderBottom: '1px solid var(--pg-border)',
  },
  infoLabel: { margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' },
  infoValue: { margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', textAlign: 'right', wordBreak: 'break-word' },
};
