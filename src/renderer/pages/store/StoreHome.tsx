// =============================================================================
// DEX Platform — Phase 3 renderer: Store home (featured + rails)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * The browse surface of the DEX Store, in the Apple App Store mould:
 *   - a featured hero spotlighting one app,
 *   - horizontal category rails grouped by StoreCategory,
 *   - a flat search-results grid when the user is searching,
 *   - an installed-only grid when that filter is on.
 * Pure presentation: catalog/installed/publishers + an onOpen callback come
 * from the Store shell. The detail view and all install actions live elsewhere.
 */

import React, { useMemo } from 'react';
import DexIcon from '../../components/DexIcon';
import { premiumGlassCard } from '../../styles/glassMenu';
import type { CatalogEntry, InstalledApp } from '../../../shared/store/catalog';
import type { PublisherProfile } from '../../../shared/store/publisher';
import type { StoreCategory } from '../../../shared/dexpkg/manifestV2';
import {
  AppTile, AppIcon, RecognitionPill, StarRating, StateBadge, SectionTitle,
  storeButton, categoryLabel, CATEGORY_ORDER, publisherFor, isInstalledId,
} from './storeKit';

export default function StoreHome({
  catalog,
  installed,
  publishers,
  query,
  installedOnly,
  busy,
  onOpen,
}: {
  catalog: CatalogEntry[];
  installed: InstalledApp[];
  publishers: PublisherProfile[];
  query: string;
  installedOnly: boolean;
  busy: string | null;
  onOpen: (packageId: string) => void;
}): React.ReactElement {
  const q = query.trim().toLowerCase();

  const installedIds = useMemo(() => new Set(installed.map(a => a.packageId)), [installed]);

  // Search results — flat, ranked by name match first.
  const searchResults = useMemo(() => {
    if (!q) return [];
    return catalog
      .filter(e => {
        const m = e.manifest;
        const hay = `${m.packageId} ${m.name} ${m.description ?? ''} ${m.categories.join(' ')}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const an = (a.manifest.name ?? '').toLowerCase().startsWith(q) ? 0 : 1;
        const bn = (b.manifest.name ?? '').toLowerCase().startsWith(q) ? 0 : 1;
        return an - bn;
      });
  }, [catalog, q]);

  // Featured: prefer an installable, verified-publisher app; else first installable; else first.
  const featured = useMemo(() => {
    if (catalog.length === 0) return undefined;
    const installable = catalog.filter(e => !e.comingSoon);
    const verified = installable.find(e => publisherFor(publishers, e));
    return verified ?? installable[0] ?? catalog[0];
  }, [catalog, publishers]);

  // Category rails — an entry appears in each category rail it declares.
  const rails = useMemo(() => {
    const byCat = new Map<StoreCategory, CatalogEntry[]>();
    for (const e of catalog) {
      for (const c of e.manifest.categories) {
        const list = byCat.get(c) ?? [];
        list.push(e);
        byCat.set(c, list);
      }
    }
    return CATEGORY_ORDER
      .map(c => ({ category: c, entries: byCat.get(c) ?? [] }))
      .filter(r => r.entries.length > 0);
  }, [catalog]);

  // --- Search mode --------------------------------------------------------
  if (q) {
    return (
      <div style={styles.scroll}>
        <SectionTitle icon="search" title={`Results for "${query.trim()}"`} action={<span style={styles.countHint}>{searchResults.length} found</span>} />
        {searchResults.length === 0 ? (
          <EmptyNote icon="search" text={`Nothing matches "${query.trim()}". Try a different term.`} />
        ) : (
          <div style={styles.grid}>
            {searchResults.map(e => (
              <AppTile key={e.manifest.packageId} entry={e} installed={installedIds.has(e.manifest.packageId)} publisher={publisherFor(publishers, e)} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- Installed-only mode ------------------------------------------------
  if (installedOnly) {
    const installedEntries = catalog.filter(e => installedIds.has(e.manifest.packageId));
    return (
      <div style={styles.scroll}>
        <SectionTitle icon="check-circle" title="Your apps" action={<span style={styles.countHint}>{installed.length} installed</span>} />
        {installedEntries.length === 0 ? (
          <EmptyNote icon="inbox" text="You have not installed any apps from the catalog yet." />
        ) : (
          <div style={styles.grid}>
            {installedEntries.map(e => (
              <AppTile key={e.manifest.packageId} entry={e} installed onOpen={onOpen} publisher={publisherFor(publishers, e)} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- Browse mode (featured + rails) -------------------------------------
  if (catalog.length === 0) {
    return (
      <div style={styles.scroll}>
        <EmptyNote icon="inbox" text="The catalog is empty. Publish an app or drop a catalog.json into the store directory." />
      </div>
    );
  }

  return (
    <div style={styles.scroll}>
      {featured && (
        <FeaturedHero
          entry={featured}
          installed={isInstalledId(installed, featured.manifest.packageId)}
          publisher={publisherFor(publishers, featured)}
          busy={busy}
          onOpen={onOpen}
        />
      )}

      {rails.map(({ category, entries }) => (
        <section key={category} style={{ marginTop: 22 }}>
          <SectionTitle icon="layers" title={categoryLabel(category)} action={<span style={styles.countHint}>{entries.length}</span>} />
          <div style={styles.rail}>
            {entries.map(e => (
              <AppTile key={e.manifest.packageId} variant="rail" entry={e} installed={installedIds.has(e.manifest.packageId)} publisher={publisherFor(publishers, e)} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FeaturedHero({
  entry,
  installed,
  publisher,
  busy,
  onOpen,
}: {
  entry: CatalogEntry;
  installed: boolean;
  publisher?: PublisherProfile;
  busy: string | null;
  onOpen: (packageId: string) => void;
}): React.ReactElement {
  const m = entry.manifest;
  const name = m.name ?? m.packageId;
  const rating = entry.reviewSummary?.avg ?? 0;
  const ratingCount = entry.reviewSummary?.count ?? 0;
  return (
    <section
      style={{
        ...premiumGlassCard,
        position: 'relative',
        overflow: 'hidden',
        padding: 22,
        borderRadius: 10,
        background: 'linear-gradient(135deg, rgba(10,132,255,0.16), rgba(94,92,230,0.10) 60%, rgba(255,255,255,0.02))',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <DexIcon name="sparkles" size={13} /> Featured
      </div>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
        <AppIcon iconUrl={entry.iconUrl || undefined} name={name} size={84} radius={20} />
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.1 }}>{name}</h1>
            <RecognitionPill publisher={publisher} />
            {installed && <StateBadge kind="installed" />}
            {!installed && entry.comingSoon && <StateBadge kind="soon" />}
          </div>
          {m.description && (
            <p style={{ margin: 'var(--space-2) 0 0', fontSize: 13.5, lineHeight: 1.5, color: 'var(--color-text-secondary)', maxWidth: 640, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {m.description}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
            {ratingCount > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <StarRating value={rating} size={14} />
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{rating.toFixed(1)}</span>
              </span>
            )}
            <button type="button" style={storeButton('accent')} disabled={busy !== null} onClick={() => onOpen(m.packageId)}>
              <DexIcon name="arrow-right" size={14} /> View
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function EmptyNote({ icon, text }: { icon: string; text: string }): React.ReactElement {
  return (
    <div style={{ ...premiumGlassCard, padding: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
      <DexIcon name={icon} size={28} />
      <span style={{ fontSize: 13, maxWidth: 420, lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: 'var(--space-4)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 'var(--space-3)',
  },
  rail: {
    display: 'flex',
    gap: 'var(--space-3)',
    overflowX: 'auto',
    overflowY: 'hidden',
    paddingBottom: 6,
    scrollbarWidth: 'thin',
    scrollSnapType: 'x proximity',
  },
  countHint: { fontSize: 11.5, color: 'var(--color-text-tertiary)', fontWeight: 600 },
};
