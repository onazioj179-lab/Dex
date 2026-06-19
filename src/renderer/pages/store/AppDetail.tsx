// =============================================================================
// DEX Platform — Phase 3 renderer: App detail page
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * The Apple-style product page for one catalog app: a hero with the install
 * action, a screenshot gallery, the full description, a "What this app can do"
 * capability panel (DEX knows what apps can access), a publisher card with the
 * recognition badge, and the anti-fake ReviewsPanel. Install/uninstall/plan
 * actions are owned by the Store shell and passed in as callbacks.
 */

import React from 'react';
import DexIcon from '../../components/DexIcon';
import { premiumGlassCard } from '../../styles/glassMenu';
import type { CatalogEntry, InstalledApp } from '../../../shared/store/catalog';
import type { PublisherProfile } from '../../../shared/store/publisher';
import { recognitionBadge } from '../../../shared/store/publisher';
import { explainCapabilities } from '../../../shared/store/capabilityExplain';
import ReviewsPanel from './ReviewsPanel';
import {
  AppIcon, RecognitionPill, StarRating, StateBadge, SectionTitle,
  storeButton, categoryLabel, contentRatingLabel, formatSize,
} from './storeKit';

export default function AppDetail({
  entry,
  installedRecord,
  publisher,
  busy,
  planText,
  onInstall,
  onUninstall,
  onPlan,
}: {
  entry: CatalogEntry;
  installedRecord?: InstalledApp;
  publisher?: PublisherProfile;
  busy: string | null;
  planText?: string;
  onInstall: (packageId: string) => void;
  onUninstall: (packageId: string) => void;
  onPlan: (packageId: string) => void;
}): React.ReactElement {
  const m = entry.manifest;
  const id = m.packageId;
  const name = m.name ?? id;
  const installed = !!installedRecord;
  const rating = entry.reviewSummary?.avg ?? 0;
  const ratingCount = entry.reviewSummary?.count ?? 0;
  const caps = explainCapabilities((m.capabilities ?? []) as string[]);
  const screenshots = entry.screenshots ?? [];
  const working = busy === id;

  return (
    <div style={styles.scroll}>
      {/* Hero */}
      <section style={styles.hero}>
        <AppIcon iconUrl={entry.iconUrl || undefined} name={name} size={96} radius={22} />
        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{name}</h1>
            <RecognitionPill publisher={publisher} />
            {installed && <StateBadge kind="installed" />}
            {!installed && entry.comingSoon && <StateBadge kind="soon" />}
          </div>
          <div style={{ marginTop: 5, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>
            {publisher?.name ?? id}
          </div>

          <div style={styles.metaRow}>
            {ratingCount > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <StarRating value={rating} size={14} />
                <span>{rating.toFixed(1)} ({ratingCount})</span>
              </span>
            )}
            <span>v{m.packageVersion}</span>
            <span>{formatSize(entry.bundleBytes)}</span>
            <span>{contentRatingLabel(m.contentRating)}</span>
            <span>Requires DEX {m.minRuntime}+</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            {installed ? (
              <button type="button" style={storeButton('danger')} disabled={busy !== null} onClick={() => onUninstall(id)}>
                <DexIcon name="trash" size={14} /> {working ? 'Removing...' : 'Uninstall'}
              </button>
            ) : entry.comingSoon ? (
              <button type="button" style={storeButton('muted')} disabled title={`${name} is not yet available`}>
                <DexIcon name="clock" size={14} /> Coming soon
              </button>
            ) : (
              <button type="button" style={storeButton('accent')} disabled={busy !== null} onClick={() => onInstall(id)}>
                <DexIcon name="download" size={14} /> {working ? 'Installing...' : 'Install'}
              </button>
            )}
            <button type="button" style={storeButton('muted')} disabled={busy !== null} onClick={() => onPlan(id)} title="Preview the install plan">
              <DexIcon name="clipboard" size={14} /> Install plan
            </button>
          </div>
          {planText && (
            <div style={styles.planNote} role="status">
              <DexIcon name="info" size={13} /> <span>{planText}</span>
            </div>
          )}
        </div>
      </section>

      {/* Screenshots */}
      <section style={{ marginTop: 22 }}>
        <SectionTitle icon="image" title="Preview" />
        {screenshots.length > 0 ? (
          <div style={styles.shotRail}>
            {screenshots.map((src, i) => (
              <img key={i} src={src} alt={`${name} screenshot ${i + 1}`} style={styles.shot} loading="lazy" />
            ))}
          </div>
        ) : (
          <div style={styles.shotRail}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ ...styles.shot, ...styles.shotPlaceholder }} aria-hidden>
                <DexIcon name="image" size={26} />
                <span style={{ fontSize: 11, marginTop: 6, color: 'var(--color-text-tertiary)' }}>Screenshot pending</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Description */}
      {m.description && (
        <section style={{ marginTop: 22 }}>
          <SectionTitle icon="file-text" title={`About ${name}`} />
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'var(--color-text-secondary)', maxWidth: 760, overflowWrap: 'anywhere' }}>
            {m.description}
          </p>
        </section>
      )}

      {/* What this app can do */}
      <section style={{ marginTop: 22 }}>
        <SectionTitle icon="shield" title="What this app can do" />
        {caps.length === 0 ? (
          <div style={{ ...premiumGlassCard, padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--color-text-secondary)', fontSize: 12.5 }}>
            <DexIcon name="check-circle" size={16} color="var(--color-success)" />
            <span>Runs fully sandboxed. This app requests no special access to your device.</span>
          </div>
        ) : (
          <div style={styles.capGrid}>
            {caps.map(cap => (
              <div key={cap.capability} style={{ ...premiumGlassCard, padding: 'var(--space-3)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: cap.sensitive ? STAR_AMBER : 'var(--color-accent)', flexShrink: 0, marginTop: 1 }}>
                  <DexIcon name={cap.sensitive ? 'shield' : 'check-circle'} size={16} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700 }}>{cap.title}</span>
                    {cap.sensitive && (
                      <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 999, color: STAR_AMBER, background: 'rgba(255,159,10,0.12)', border: '1px solid rgba(255,159,10,0.30)' }}>
                        Sensitive
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 11.5, lineHeight: 1.45, color: 'var(--color-text-tertiary)' }}>{cap.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 'var(--space-2)', fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <DexIcon name="info" size={12} />
          <span>You approve sensitive access at install time. DEX can revoke any capability later in Settings.</span>
        </div>
      </section>

      {/* Categories */}
      <section style={{ marginTop: 22 }}>
        <SectionTitle icon="tag" title="Category" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {m.categories.map(c => (
            <span key={c} style={styles.categoryPill}>{categoryLabel(c)}</span>
          ))}
        </div>
      </section>

      {/* Publisher */}
      <section style={{ marginTop: 22 }}>
        <SectionTitle icon="award" title="Publisher" />
        <PublisherCard publisher={publisher} fallbackId={id} />
      </section>

      {/* Reviews */}
      <div style={{ marginTop: 22 }}>
        <ReviewsPanel packageId={id} />
      </div>
    </div>
  );
}

function PublisherCard({ publisher, fallbackId }: { publisher?: PublisherProfile; fallbackId: string }): React.ReactElement {
  const badge = recognitionBadge(publisher);
  if (!publisher) {
    return (
      <div style={{ ...premiumGlassCard, padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span style={{ color: 'var(--color-text-tertiary)', display: 'inline-flex' }}><DexIcon name="user" size={22} /></span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>Unverified publisher</div>
          <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>
            This app is not yet linked to a DEX-verified publisher identity ({fallbackId.split('.').slice(0, 2).join('.')}).
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...premiumGlassCard, padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <span style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)', background: 'rgba(10,132,255,0.12)', border: '1px solid rgba(10,132,255,0.26)' }}>
        <DexIcon name={badge?.level === 'first-party' ? 'shield' : 'award'} size={22} />
      </span>
      <div style={{ minWidth: 0, flex: '1 1 220px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>{publisher.name}</span>
          <RecognitionPill publisher={publisher} />
        </div>
        <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>{publisher.id}</div>
        <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--color-text-secondary)' }}>
          {publisher.verified
            ? 'DEX-verified publisher. Its signing key is in the trust store, so updates are guaranteed to come from the same author.'
            : 'Identity registered but not yet DEX-verified.'}
        </div>
      </div>
      {publisher.homepage && (
        <a
          href={publisher.homepage}
          target="_blank"
          rel="noreferrer noopener"
          style={{ ...storeButton('muted'), textDecoration: 'none' }}
        >
          <DexIcon name="external-link" size={13} /> Website
        </a>
      )}
    </div>
  );
}

const STAR_AMBER = '#ff9f0a';

const styles: Record<string, React.CSSProperties> = {
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: 'var(--space-4)',
  },
  hero: {
    ...premiumGlassCard,
    display: 'flex',
    gap: 18,
    alignItems: 'flex-start',
    padding: 22,
    borderRadius: 10,
    flexWrap: 'wrap',
  },
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px var(--space-4)',
    marginTop: 'var(--space-3)',
    fontSize: 12,
    color: 'var(--color-text-tertiary)',
    alignItems: 'center',
  },
  planNote: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginTop: 'var(--space-3)',
    padding: 'var(--space-2) 11px',
    borderRadius: 6,
    border: '1px solid var(--pg-border)',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--color-text-secondary)',
    fontSize: 12,
    overflowWrap: 'anywhere',
  },
  shotRail: {
    display: 'flex',
    gap: 'var(--space-3)',
    overflowX: 'auto',
    overflowY: 'hidden',
    paddingBottom: 6,
    scrollbarWidth: 'thin',
    scrollSnapType: 'x proximity',
  },
  shot: {
    width: 360,
    height: 225,
    flexShrink: 0,
    borderRadius: 10,
    objectFit: 'cover',
    border: '1px solid var(--pg-border)',
    background: 'rgba(0,0,0,0.25)',
    scrollSnapAlign: 'start',
  },
  shotPlaceholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-text-tertiary)',
  },
  capGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 10,
  },
  categoryPill: {
    padding: '4px 11px',
    borderRadius: 999,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--pg-border)',
    color: 'var(--color-text-secondary)',
    fontSize: 12,
  },
};
