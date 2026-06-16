// =============================================================================
// DEX Platform — Phase 3 renderer: Store UI kit
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Shared building blocks for the Apple-style DEX storefront: the IPC bridge
 * accessor, formatting helpers, category metadata, glass style atoms, the
 * StarRating control (display + interactive), and the AppTile card used by the
 * home rails, search grid, and installed grid. Keeping these here lets the
 * Store shell, StoreHome, AppDetail, and ReviewsPanel stay focused.
 */

import React, { useState } from 'react';
import DexIcon from '../../components/DexIcon';
import { premiumGlassCard } from '../../styles/glassMenu';
import { formatBytes } from '../../../shared/format/units';
import type { CatalogEntry, InstalledApp } from '../../../shared/store/catalog';
import { recognitionBadge, type PublisherProfile } from '../../../shared/store/publisher';
import type { StoreCategory } from '../../../shared/dexpkg/manifestV2';

// ---------------------------------------------------------------------------
// IPC + small helpers
// ---------------------------------------------------------------------------

export type IpcBridge = { invoke: (channel: string, ...args: any[]) => Promise<any> };

/** Resolve the renderer-side IPC bridge (Electron preload). Throws if absent. */
export function ipc(): IpcBridge {
  const w = window as any;
  const bridge = w.dexAPI ?? w.electronAPI ?? w.electron;
  if (!bridge?.invoke) throw new Error('DEX IPC bridge is unavailable');
  return bridge;
}

export function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Bundle size for the storefront — "Size pending" for coming-soon (0-byte) apps. */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Size pending';
  return formatBytes(bytes, bytes >= 1024 * 1024 * 1024 ? 1 : 0);
}

export const STAR_GOLD = '#ffc043';

// ---------------------------------------------------------------------------
// Categories — friendly labels + a stable browse order for the home rails
// ---------------------------------------------------------------------------

export const CATEGORY_ORDER: StoreCategory[] = [
  'creative', 'productivity', 'developer', 'utility',
  'communication', 'media', 'game', 'education', 'health',
];

export const CATEGORY_LABELS: Record<StoreCategory, string> = {
  creative: 'Creative',
  productivity: 'Productivity',
  developer: 'Developer Tools',
  utility: 'Utilities',
  communication: 'Communication',
  media: 'Media & Music',
  game: 'Games',
  education: 'Education',
  health: 'Health & Fitness',
};

export function categoryLabel(c: string): string {
  return (CATEGORY_LABELS as Record<string, string>)[c] ?? (c.charAt(0).toUpperCase() + c.slice(1));
}

export const contentRatingLabel = (r: string): string =>
  r === 'everyone' ? 'Everyone' : r === 'teen' ? 'Teen' : r === 'mature' ? 'Mature 17+' : r === 'adult' ? 'Adults only' : r;

// ---------------------------------------------------------------------------
// Star rating — fractional display + clickable input
// ---------------------------------------------------------------------------

export function StarRating({
  value,
  max = 5,
  size = 14,
  onChange,
  ariaLabel,
}: {
  value: number;
  max?: number;
  size?: number;
  onChange?: (next: number) => void;
  ariaLabel?: string;
}): React.ReactElement {
  const [hover, setHover] = useState(0);
  const interactive = typeof onChange === 'function';
  const shown = interactive && hover > 0 ? hover : value;

  if (!interactive) {
    // Display mode: gray base with a gold overlay clipped to the fractional value.
    const pct = Math.max(0, Math.min(1, value / max)) * 100;
    return (
      <span
        role="img"
        aria-label={ariaLabel ?? `Rated ${value.toFixed(1)} of ${max}`}
        style={{ position: 'relative', display: 'inline-flex', lineHeight: 0, flexShrink: 0 }}
      >
        <span style={{ display: 'inline-flex', color: 'var(--pg-border-strong)' }}>
          {Array.from({ length: max }, (_, i) => <DexIcon key={i} name="star" size={size} />)}
        </span>
        <span
          aria-hidden
          style={{ position: 'absolute', inset: 0, display: 'inline-flex', overflow: 'hidden', width: `${pct}%`, color: STAR_GOLD }}
        >
          {Array.from({ length: max }, (_, i) => <DexIcon key={i} name="star" size={size} />)}
        </span>
      </span>
    );
  }

  return (
    <span role="radiogroup" aria-label={ariaLabel ?? 'Your rating'} style={{ display: 'inline-flex', gap: 2 }}>
      {Array.from({ length: max }, (_, i) => {
        const v = i + 1;
        const filled = v <= shown;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={v === value}
            aria-label={`${v} star${v === 1 ? '' : 's'}`}
            onMouseEnter={() => setHover(v)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange!(v)}
            style={{
              background: 'none',
              border: 'none',
              padding: 2,
              margin: 0,
              cursor: 'pointer',
              lineHeight: 0,
              color: filled ? STAR_GOLD : 'var(--pg-border-strong)',
              transition: 'color 120ms ease, transform 120ms ease',
              transform: filled ? 'scale(1.04)' : 'none',
            }}
          >
            <DexIcon name="star" size={size} />
          </button>
        );
      })}
    </span>
  );
}

// ---------------------------------------------------------------------------
// App icon — real iconUrl when present, else a glass glyph
// ---------------------------------------------------------------------------

export function AppIcon({ iconUrl, name, size = 56, radius = 14 }: { iconUrl?: string; name?: string; size?: number; radius?: number }): React.ReactElement {
  const box: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    color: 'var(--color-accent)',
    background: 'linear-gradient(160deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))',
    border: '1px solid var(--pg-border)',
    boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.10)',
  };
  if (iconUrl) {
    return <div style={box}><img src={iconUrl} alt={name ? `${name} icon` : 'App icon'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>;
  }
  return <div style={box} aria-hidden><DexIcon name="package" size={Math.round(size * 0.42)} /></div>;
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export function RecognitionPill({ publisher, compact }: { publisher?: PublisherProfile; compact?: boolean }): React.ReactElement | null {
  const badge = recognitionBadge(publisher);
  if (!badge) return null;
  const tint = badge.level === 'first-party'
    ? { bg: 'rgba(10,132,255,0.16)', bd: 'rgba(10,132,255,0.36)', fg: '#7fb8ff' }
    : badge.level === 'partner'
      ? { bg: 'rgba(94,92,230,0.16)', bd: 'rgba(94,92,230,0.36)', fg: '#a7a4ff' }
      : { bg: 'rgba(48,209,88,0.14)', bd: 'rgba(48,209,88,0.30)', fg: 'var(--color-success)' };
  return (
    <span
      title={`${badge.label} publisher`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        padding: compact ? '1px 6px' : '2px 8px',
        borderRadius: 999, background: tint.bg, border: `1px solid ${tint.bd}`,
        color: tint.fg, fontSize: compact ? 10 : 11, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap',
      }}
    >
      <DexIcon name={badge.level === 'first-party' ? 'shield' : 'check-circle'} size={compact ? 10 : 11} />
      {badge.label}
    </span>
  );
}

export function StateBadge({ kind }: { kind: 'installed' | 'soon' }): React.ReactElement {
  const installed = kind === 'installed';
  return (
    <span style={{
      padding: '2px 7px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap',
      background: installed ? 'rgba(48,209,88,0.12)' : 'rgba(10,132,255,0.12)',
      border: `1px solid ${installed ? 'rgba(48,209,88,0.28)' : 'rgba(10,132,255,0.28)'}`,
      color: installed ? 'var(--color-success)' : 'var(--color-accent)',
    }}>
      {installed ? 'Installed' : 'Coming soon'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export function storeButton(variant: 'accent' | 'muted' | 'danger'): React.CSSProperties {
  const base: React.CSSProperties = {
    minHeight: 34,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '0 14px',
    borderRadius: 6,
    border: '1px solid var(--pg-border-strong)',
    color: 'var(--color-text-primary)',
    background: 'var(--color-bg-surface)',
    fontSize: 12.5,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };
  if (variant === 'accent') return { ...base, background: 'var(--color-accent)', color: '#fff', borderColor: 'transparent' };
  if (variant === 'danger') return { ...base, background: 'rgba(255,69,58,0.14)', color: '#ff8a82', borderColor: 'rgba(255,69,58,0.36)' };
  return base;
}

// ---------------------------------------------------------------------------
// AppTile — the storefront card (rails + grids)
// ---------------------------------------------------------------------------

export function AppTile({
  entry,
  installed,
  publisher,
  onOpen,
  variant = 'grid',
}: {
  entry: CatalogEntry;
  installed: boolean;
  publisher?: PublisherProfile;
  onOpen: (packageId: string) => void;
  variant?: 'rail' | 'grid';
}): React.ReactElement {
  const [hover, setHover] = useState(false);
  const id = entry.manifest.packageId;
  const name = entry.manifest.name ?? id;
  const rating = entry.reviewSummary?.avg ?? 0;
  const ratingCount = entry.reviewSummary?.count ?? 0;
  const primaryCategory = entry.manifest.categories[0];

  return (
    <button
      type="button"
      onClick={() => onOpen(id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={`View ${name}`}
      style={{
        ...premiumGlassCard,
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        gap: 'var(--space-3)',
        alignItems: 'center',
        padding: 'var(--space-3)',
        width: variant === 'rail' ? 280 : '100%',
        flexShrink: variant === 'rail' ? 0 : 1,
        color: 'var(--color-text-primary)',
        transform: hover ? 'translateY(-1px)' : 'none',
        borderColor: hover ? 'var(--pg-border-strong)' : undefined,
        transition: 'transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease',
      }}
    >
      <AppIcon iconUrl={entry.iconUrl || undefined} name={name} size={52} radius={13} />
      <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          <RecognitionPill publisher={publisher} compact />
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {primaryCategory ? categoryLabel(primaryCategory) : entry.manifest.contentRating}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 1 }}>
          {ratingCount > 0 ? (
            <>
              <StarRating value={rating} size={12} />
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{rating.toFixed(1)}</span>
            </>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>No ratings yet</span>
          )}
          {installed && <StateBadge kind="installed" />}
          {!installed && entry.comingSoon && <StateBadge kind="soon" />}
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Section header — shared across home rails and detail sections
// ---------------------------------------------------------------------------

export function SectionTitle({ icon, title, action }: { icon?: string; title: string; action?: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '4px 0 10px' }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-text-primary)' }}>
        {icon && <span aria-hidden style={{ color: 'var(--color-accent)', display: 'inline-flex' }}><DexIcon name={icon} size={15} /></span>}
        {title}
      </h2>
      {action}
    </div>
  );
}

export function publisherFor(publishers: PublisherProfile[], entry: CatalogEntry | undefined): PublisherProfile | undefined {
  if (!entry?.publisherId) return undefined;
  return publishers.find(p => p.id === entry.publisherId);
}

export function isInstalledId(installed: InstalledApp[], id: string): boolean {
  return installed.some(a => a.packageId === id);
}
