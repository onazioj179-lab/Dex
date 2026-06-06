// =============================================================================
// DEX Platform — Phase 3 renderer: Reviews panel (anti-fake aware)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * The reviews surface on an app detail page. It talks to the main-process
 * ReviewService (store:review:list/submit/flag) whose public average counts
 * ONLY non-suspicious (visible) reviews — so a burst of fake 1- or 5-stars
 * cannot move an app's rating. The UI mirrors that integrity honestly:
 *   - the summary shows the visible-only average + histogram and, when some
 *     reviews are held, how many are under integrity review;
 *   - submitting tells the truth — a review caught by the engine is reported
 *     as "held for review", never as "posted".
 */

import React, { useCallback, useEffect, useState } from 'react';
import DexIcon from '../../components/DexIcon';
import { premiumGlassCard } from '../../styles/glassMenu';
import { formatRelativeTime } from '../../../shared/format/units';
import type { ReviewRecord, ReviewSummary, ReviewStatus, Rating } from '../../../shared/store/reviewIntegrity';
import { ipc, toMessage, StarRating, storeButton, SectionTitle, STAR_GOLD } from './storeKit';

interface ListResult { summary: ReviewSummary; reviews: ReviewRecord[] }
interface SubmitResult { ok: boolean; status?: ReviewStatus; summary?: ReviewSummary; error?: string }

const RATINGS: Rating[] = [5, 4, 3, 2, 1];

export default function ReviewsPanel({ packageId }: { packageId: string }): React.ReactElement {
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>('');

  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const r = (await ipc().invoke('store:review:list', packageId)) as ListResult | null;
      setSummary(r?.summary ?? null);
      setReviews(Array.isArray(r?.reviews) ? r!.reviews : []);
    } catch (e) {
      setLoadError(toMessage(e));
    } finally {
      setLoading(false);
    }
  }, [packageId]);

  useEffect(() => { void load(); }, [load]);

  const submit = useCallback(async () => {
    if (rating < 1) { setNotice({ tone: 'warn', text: 'Choose a star rating first.' }); return; }
    setSubmitting(true);
    setNotice(null);
    try {
      const r = (await ipc().invoke('store:review:submit', packageId, { rating, title: title.trim() || undefined, body: body.trim() || undefined })) as SubmitResult;
      if (!r.ok) {
        setNotice({ tone: 'error', text: r.error ? r.error.charAt(0).toUpperCase() + r.error.slice(1) : 'Could not submit review.' });
      } else if (r.status === 'visible') {
        setNotice({ tone: 'ok', text: 'Thanks! Your review is posted.' });
        setRating(0); setTitle(''); setBody('');
      } else {
        // Honest: the integrity engine flagged or hid it — do not claim it posted.
        setNotice({ tone: 'warn', text: 'Review received. It is held for integrity review and will not count toward the rating unless cleared.' });
        setRating(0); setTitle(''); setBody('');
      }
      if (r.summary) setSummary(r.summary);
      await load();
    } catch (e) {
      setNotice({ tone: 'error', text: toMessage(e) });
    } finally {
      setSubmitting(false);
    }
  }, [packageId, rating, title, body, load]);

  const flag = useCallback(async (reviewId: string) => {
    try {
      const ok = await ipc().invoke('store:review:flag', reviewId);
      if (ok) {
        // A flagged review drops out of the visible list + the average.
        setReviews(prev => prev.filter(r => r.id !== reviewId));
        await load();
      }
    } catch { /* non-critical */ }
  }, [load]);

  const avg = summary?.avg ?? 0;
  const visibleCount = summary?.visibleCount ?? 0;
  const total = summary?.count ?? 0;
  const held = Math.max(0, total - visibleCount);
  const histMax = summary ? Math.max(1, ...RATINGS.map(r => summary.histogram[r])) : 1;

  return (
    <section style={{ marginTop: 8 }}>
      <SectionTitle icon="star" title="Ratings & Reviews" />

      {/* Summary */}
      <div style={{ ...premiumGlassCard, padding: 16, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', minWidth: 110 }}>
          <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{avg.toFixed(1)}</div>
          <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center' }}><StarRating value={avg} size={15} /></div>
          <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>
            {visibleCount === 0 ? 'No ratings yet' : `${visibleCount} rating${visibleCount === 1 ? '' : 's'}`}
          </div>
        </div>
        <div style={{ flex: '1 1 220px', minWidth: 200, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {RATINGS.map(r => {
            const c = summary?.histogram[r] ?? 0;
            const pct = Math.round((c / histMax) * 100);
            return (
              <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 12, textAlign: 'right', fontSize: 11, color: 'var(--color-text-tertiary)' }}>{r}</span>
                <DexIcon name="star" size={11} color={STAR_GOLD} />
                <span style={{ flex: 1, height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: STAR_GOLD, borderRadius: 999, transition: 'width 240ms ease' }} />
                </span>
                <span style={{ width: 24, textAlign: 'right', fontSize: 11, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{c}</span>
              </div>
            );
          })}
          {held > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              <DexIcon name="shield" size={12} />
              <span>{held} review{held === 1 ? '' : 's'} held by integrity checks and excluded from the average.</span>
            </div>
          )}
        </div>
      </div>

      {/* Write a review */}
      <div style={{ ...premiumGlassCard, padding: 16, marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Write a review</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <StarRating value={rating} size={22} onChange={setRating} ariaLabel="Your star rating" />
          <span style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>{rating > 0 ? `${rating} / 5` : 'Tap to rate'}</span>
        </div>
        <input
          aria-label="Review title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Title (optional)"
          maxLength={120}
          style={inputStyle}
        />
        <textarea
          aria-label="Review text"
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Share what you think (optional)"
          maxLength={4000}
          rows={3}
          style={{ ...inputStyle, marginTop: 8, resize: 'vertical', minHeight: 64, lineHeight: 1.5 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
          {notice ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: noticeColor(notice.tone) }}>
              <DexIcon name={notice.tone === 'ok' ? 'check-circle' : notice.tone === 'warn' ? 'shield' : 'alert-triangle'} size={13} />
              {notice.text}
            </span>
          ) : <span />}
          <button type="button" style={storeButton('accent')} disabled={submitting || rating < 1} onClick={submit}>
            <DexIcon name="send" size={13} /> {submitting ? 'Submitting...' : 'Submit review'}
          </button>
        </div>
      </div>

      {/* Review list */}
      <div style={{ marginTop: 14 }}>
        {loading ? (
          <div style={mutedRow}>Loading reviews...</div>
        ) : loadError ? (
          <div style={{ ...mutedRow, color: '#ff8a82' }}><DexIcon name="alert-triangle" size={13} /> Could not load reviews: {loadError}</div>
        ) : reviews.length === 0 ? (
          <div style={{ ...premiumGlassCard, padding: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            <DexIcon name="star" size={24} />
            <span style={{ fontSize: 12.5 }}>No reviews yet. Be the first to review this app.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reviews.map(r => (
              <article key={r.id} style={{ ...premiumGlassCard, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <StarRating value={r.rating} size={13} />
                    {r.title && <span style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{formatRelativeTime(r.createdAt)}</span>
                </div>
                {r.body && <p style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.55, color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' }}>{r.body}</p>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => flag(r.id)}
                    title="Report this review"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: 11, padding: 4 }}
                  >
                    <DexIcon name="flag" size={12} /> Report
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function noticeColor(tone: 'ok' | 'warn' | 'error'): string {
  return tone === 'ok' ? 'var(--color-success)' : tone === 'warn' ? STAR_GOLD : '#ff8a82';
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 11px',
  background: 'rgba(0,0,0,0.28)',
  border: '1px solid var(--pg-border-strong)',
  borderRadius: 9,
  color: 'var(--color-text-primary)',
  outline: 'none',
  fontSize: 13,
  fontFamily: 'inherit',
};

const mutedRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 4px',
  fontSize: 12.5,
  color: 'var(--color-text-secondary)',
};
