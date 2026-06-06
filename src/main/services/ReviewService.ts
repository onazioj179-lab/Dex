// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Review service (DEX Developer Platform — E4). Persists app reviews and serves
 * a public summary whose average counts ONLY non-suspicious (visible) reviews,
 * so a burst of fake 1-star (or 5-star) reviews cannot move an app's rating.
 * The anti-fake scoring is the pure engine in shared/store/reviewIntegrity; this
 * is the thin main-process adapter (persistence + a stable local userId).
 *
 * IPC:
 *   store:review:list   (packageId)                 -> { summary, reviews }
 *   store:review:submit (packageId, {rating,title,body}) -> { ok, status?, summary?, error? }
 *   store:review:flag   (reviewId)                  -> boolean
 */

import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import log from 'electron-log';
import {
  scoreReview, aggregateReviews,
  type ReviewRecord, type Rating, type ReviewSummary, type ReviewStatus,
} from '../../shared/store/reviewIntegrity';

const REVIEWS_FILE = (): string => path.join(app.getPath('userData'), 'dex-reviews.json');
const USER_FILE = (): string => path.join(app.getPath('userData'), 'dex-review-user.json');

let cache: ReviewRecord[] | null = null;
let user: { userId: string; accountCreatedAt: number } | null = null;

function load(): ReviewRecord[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(fs.readFileSync(REVIEWS_FILE(), 'utf8'));
    if (Array.isArray(parsed)) { cache = parsed as ReviewRecord[]; return cache; }
  } catch { /* first run */ }
  cache = [];
  return cache;
}

function persist(): void {
  if (!cache) return;
  try { fs.mkdirSync(path.dirname(REVIEWS_FILE()), { recursive: true }); fs.writeFileSync(REVIEWS_FILE(), JSON.stringify(cache, null, 2), 'utf8'); }
  catch (e) { log.warn('[Review] persist failed', e); }
}

/** A stable per-install identity used for rate-limiting + new-account checks. */
function getUser(): { userId: string; accountCreatedAt: number } {
  if (user) return user;
  try {
    const parsed = JSON.parse(fs.readFileSync(USER_FILE(), 'utf8'));
    if (parsed && typeof parsed.userId === 'string') { user = { userId: parsed.userId, accountCreatedAt: Number(parsed.accountCreatedAt) || 0 }; return user; }
  } catch { /* first run */ }
  user = { userId: 'u-' + crypto.randomBytes(8).toString('hex'), accountCreatedAt: Date.now() };
  try { fs.writeFileSync(USER_FILE(), JSON.stringify(user), 'utf8'); } catch { /* best effort */ }
  return user;
}

export function listReviews(packageId: string): { summary: ReviewSummary; reviews: ReviewRecord[] } {
  const all = load().filter((r) => r.packageId === packageId);
  return {
    summary: aggregateReviews(all),
    reviews: all.filter((r) => r.status === 'visible').sort((a, b) => b.createdAt - a.createdAt),
  };
}

export interface SubmitReviewResult { ok: boolean; status?: ReviewStatus; summary?: ReviewSummary; error?: string }

export function submitReview(packageId: string, input: { rating: number; title?: string; body?: string }): SubmitReviewResult {
  const rating = Math.round(Number(input.rating)) as Rating;
  if (!(rating >= 1 && rating <= 5)) return { ok: false, error: 'rating must be 1..5' };
  if (!packageId) return { ok: false, error: 'missing packageId' };
  const now = Date.now();
  const all = load();
  const me = getUser();
  const rec: ReviewRecord = {
    id: 'rev-' + crypto.randomBytes(6).toString('hex'),
    packageId, userId: me.userId, rating,
    title: input.title ? String(input.title).slice(0, 120) : undefined,
    body: input.body ? String(input.body).slice(0, 4000) : undefined,
    createdAt: now, accountCreatedAt: me.accountCreatedAt,
    status: 'visible', integrityScore: 0,
  };
  const signal = scoreReview(rec, { now, prior: all });
  if (signal.flags.includes('duplicate')) return { ok: false, error: 'you have already reviewed this app' };
  rec.status = signal.status;
  rec.integrityScore = signal.score;
  all.push(rec);
  cache = all;
  persist();
  return { ok: true, status: rec.status, summary: aggregateReviews(all.filter((r) => r.packageId === packageId)) };
}

export function flagReview(reviewId: string): boolean {
  const all = load();
  const r = all.find((x) => x.id === reviewId);
  if (!r) return false;
  if (r.status === 'visible') r.status = 'flagged';
  cache = all;
  persist();
  return true;
}

export function registerReviewIpc(): void {
  ipcMain.handle('store:review:list', (_e, packageId: string) => listReviews(packageId));
  ipcMain.handle('store:review:submit', (_e, packageId: string, input: { rating: number; title?: string; body?: string }) => submitReview(packageId, input || ({} as never)));
  ipcMain.handle('store:review:flag', (_e, reviewId: string) => flagReview(reviewId));
}
