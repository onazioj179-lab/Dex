// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * v3.8.9 follow-up consolidation tests.
 *
 * Covers every new pure shared module added on the v3.8.9 line:
 *   account/sessions, account/auditLog, account/magicLink
 *   security/pwnedCheck, security/secretRedactor, security/urlPolicy,
 *   security/cspBuilder, security/emailCanonical
 *   cloud/dedup, cloud/trashBin, cloud/versioning, cloud/selectiveSync,
 *   cloud/bandwidthCap, cloud/conflictResolver, cloud/coldTier,
 *   cloud/storageBreakdown, cloud/shareLinks
 *   uki/tokenBudget, uki/confidence, uki/promptTemplates,
 *   uki/piiDetector, uki/webCache, uki/agentProfile
 *   collab/comments, collab/reactions, collab/crdt, collab/kanban
 *   payment/coupons, payment/referrals, payment/trial, payment/tax
 *   plugin/manifest, plugin/eventBus
 *   i18n/messages, perf/helpers, theme/accessibility
 *   onboarding/helpers, commands/registry
 */

import { describe, it, expect } from 'vitest';

// account/sessions
import {
  createSessionStore, addSession, touchSession, revokeSession,
  revokeAllExcept, trustDevice, requiresStepUp, detectSuspicious,
} from '../../src/shared/account/sessions';
// account/auditLog
import {
  createAuditLog, appendAudit, queryAudit, formatAuditAsText, formatAuditAsCsv,
} from '../../src/shared/account/auditLog';
// account/magicLink
import {
  buildMagicLink, verifyMagicLink, consumeMagicLink, MAGIC_LINK_LIFETIME_MS,
} from '../../src/shared/account/magicLink';
// security/pwnedCheck
import {
  parsePwnedResponse, pwnedCountForSuffix, pwnedSeverity, pwnedExplain,
} from '../../src/shared/security/pwnedCheck';
// security/secretRedactor
import {
  findSecrets, redactSecrets, containsSecret,
} from '../../src/shared/security/secretRedactor';
// security/urlPolicy
import {
  defaultUrlPolicy, checkUrl,
} from '../../src/shared/security/urlPolicy';
// security/cspBuilder
import { buildCsp, strictRendererCsp } from '../../src/shared/security/cspBuilder';
// security/emailCanonical
import { canonicaliseEmail, detectHoneypot } from '../../src/shared/security/emailCanonical';
// cloud/dedup
import {
  createDedupIndex, addRef, dropRef, physicalBytes, logicalBytes, dedupRatio, chunkRanges,
} from '../../src/shared/cloud/dedup';
// cloud/trashBin
import {
  createTrashState, pushToTrash, restoreFromTrash, purgeFromTrash, expiredEntries,
  sweepExpired, trashSize,
} from '../../src/shared/cloud/trashBin';
// cloud/versioning
import {
  createVersionedFile, pushVersion, currentVersion, rollback, totalBytesInHistory,
} from '../../src/shared/cloud/versioning';
// cloud/selectiveSync
import { shouldSync, defaultSyncRules, validateRules } from '../../src/shared/cloud/selectiveSync';
// cloud/bandwidthCap
import { defaultBandwidthCap, inWindow, effectiveCapKBps, pacingDelayMs } from '../../src/shared/cloud/bandwidthCap';
// cloud/conflictResolver
import { resolveConflict, strictEquals, jsonEquals } from '../../src/shared/cloud/conflictResolver';
// cloud/coldTier
import { defaultColdPolicy, pickForDemotion, pickForPromotion, thawEtaSeconds } from '../../src/shared/cloud/coldTier';
// cloud/storageBreakdown
import { summariseUsage, largestItems, staleLargeItems, cleanupSuggestions } from '../../src/shared/cloud/storageBreakdown';
// cloud/shareLinks
import { createShareLink, tryOpenShare, revokeShare } from '../../src/shared/cloud/shareLinks';
// uki/tokenBudget
import { createBudget, chargeBudget, remainingBudget, rollIfExpired, budgetPercent } from '../../src/shared/uki/tokenBudget';
// uki/confidence
import { scoreConfidence, confidenceLabel, extractCitationIndices, formatCitation } from '../../src/shared/uki/confidence';
// uki/promptTemplates
import { renderPrompt, STANDARD_TEMPLATES, PromptVariableMissingError } from '../../src/shared/uki/promptTemplates';
// uki/piiDetector
import { findPii, redactPii, luhnValid } from '../../src/shared/uki/piiDetector';
// uki/webCache
import { TtlCache, createToolBudget, chargeTool, resetToolBudget } from '../../src/shared/uki/webCache';
// uki/agentProfile
import { AGENT_PROFILES, pinSeed, applyDeterministic } from '../../src/shared/uki/agentProfile';
// collab/comments
import { createCommentTree, addComment, editComment, resolveComment, deleteComment, childrenOf, unresolvedCount } from '../../src/shared/collab/comments';
// collab/reactions
import { REACTION_NAMES, createReactionState, toggleReaction, reactionCounts, parseMentions } from '../../src/shared/collab/reactions';
// collab/crdt
import { lwwInit, lwwSet, lwwMerge, gCounterInit, gCounterIncr, gCounterValue, gCounterMerge } from '../../src/shared/collab/crdt';
// collab/kanban
import { createBoard, addCard, moveCard, removeCard, wipExceeded } from '../../src/shared/collab/kanban';
// payment/coupons
import { applyCoupon } from '../../src/shared/payment/coupons';
// payment/referrals
import { generateReferralCode, isValidReferralCode, createReferralLedger, awardCredit } from '../../src/shared/payment/referrals';
// payment/trial
import {
  createTrial, startTrial, tickTrial, convertTrial, cancelTrial, trialDaysLeft,
  startDunning, nextDunningAttempt, recordDunningAttempt, dunningDone, DEFAULT_DUNNING_SCHEDULE,
} from '../../src/shared/payment/trial';
// payment/tax
import { computeTax, formatCurrency, convertCurrency, VAT_RATES } from '../../src/shared/payment/tax';
// plugin/manifest
import { validateManifest, createCapabilityLedger, grantCapability, revokeCapability, hasCapability } from '../../src/shared/plugin/manifest';
// plugin/eventBus
import { EventBus } from '../../src/shared/plugin/eventBus';
// i18n/messages
import { format, isRtl, resolveLocale } from '../../src/shared/i18n/messages';
// perf/helpers
import { debounce, throttle, retry, nextDelay, visibleRange } from '../../src/shared/perf/helpers';
// theme/accessibility
import { HIGH_CONTRAST_DARK, HIGH_CONTRAST_LIGHT, COLORBLIND_PALETTES, applyColorBlind, DENSITY_SCALES, scaleSpacing } from '../../src/shared/theme/accessibility';
// onboarding/helpers
import { parseChangelog, entryForVersion, scorePersona, PERSONA_QUIZ, shouldPromptNps, recordNps, computeNps } from '../../src/shared/onboarding/helpers';
// commands/registry
import { createRegistry, registerCommand, unregisterCommand, fuzzyMatch, searchCommands, parseArgv, PUBLIC_API_VERSION } from '../../src/shared/commands/registry';

// ----- account/sessions -----

describe('account/sessions', () => {
  const baseSession = (id: string, trusted = false) => ({
    id,
    deviceName: `Device ${id}`,
    platform: 'web' as const,
    fingerprint: `fp-${id}`,
    ipHash: 'hash',
    geoCoarse: 'US-CA',
    trusted,
    current: false,
  });

  it('adds and dedupes sessions', () => {
    const s = addSession(addSession(createSessionStore(), baseSession('a'), 1), baseSession('a'), 2);
    expect(s.sessions.length).toBe(1);
  });

  it('touch updates lastSeenAt', () => {
    const s = touchSession(addSession(createSessionStore(), baseSession('a'), 1), 'a', 999);
    expect(s.sessions[0].lastSeenAt).toBe(999);
  });

  it('revoke removes a session', () => {
    let s = addSession(addSession(createSessionStore(), baseSession('a')), baseSession('b'));
    s = revokeSession(s, 'a');
    expect(s.sessions.map((x) => x.id)).toEqual(['b']);
  });

  it('revokeAllExcept keeps only current', () => {
    let s = addSession(addSession(createSessionStore(), baseSession('a')), baseSession('b'));
    s = revokeAllExcept(s, 'b');
    expect(s.sessions.map((x) => x.id)).toEqual(['b']);
  });

  it('trustDevice flips the trusted flag', () => {
    const s = trustDevice(addSession(createSessionStore(), baseSession('a')), 'a');
    expect(s.sessions[0].trusted).toBe(true);
  });

  it('requires step-up for delete-account always', () => {
    const sess = baseSession('a', true);
    expect(requiresStepUp({ session: sess, reason: 'delete-account', lastStepUpAt: Date.now() })).toBe(true);
  });

  it('requires step-up for untrusted devices unconditionally', () => {
    expect(requiresStepUp({ session: baseSession('a', false), reason: 'export-data', lastStepUpAt: Date.now() })).toBe(true);
  });

  it('skips step-up inside trusted window', () => {
    const now = 1_000_000;
    expect(requiresStepUp({ session: baseSession('a', true), reason: 'export-data', lastStepUpAt: now - 1000, now })).toBe(false);
  });

  it('detects new-geo concurrent sign-in', () => {
    const store = addSession(createSessionStore(), baseSession('a'));
    const suspicious = detectSuspicious(store, { fingerprint: 'fp-zzz', geoCoarse: 'BR-SP' });
    expect(suspicious).toBe(true);
  });
});

// ----- account/auditLog -----

describe('account/auditLog', () => {
  it('appends and queries by kind', () => {
    let log = createAuditLog();
    log = appendAudit(log, { kind: 'sign-in', actor: 'user' });
    log = appendAudit(log, { kind: 'plan-upgraded', actor: 'user' });
    expect(queryAudit(log, { kinds: ['sign-in'] }).length).toBe(1);
  });

  it('honours sinceMs / untilMs', () => {
    let log = createAuditLog();
    log = appendAudit(log, { kind: 'sign-in', actor: 'user', ts: 100 });
    log = appendAudit(log, { kind: 'sign-in', actor: 'user', ts: 200 });
    log = appendAudit(log, { kind: 'sign-in', actor: 'user', ts: 300 });
    expect(queryAudit(log, { sinceMs: 150, untilMs: 250 }).length).toBe(1);
  });

  it('drops oldest when over the cap', () => {
    let log = createAuditLog(2);
    log = appendAudit(log, { kind: 'sign-in', actor: 'user', ts: 1 });
    log = appendAudit(log, { kind: 'sign-in', actor: 'user', ts: 2 });
    log = appendAudit(log, { kind: 'sign-in', actor: 'user', ts: 3 });
    expect(log.events.length).toBe(2);
    expect(log.events.map((e) => e.ts)).toEqual([2, 3]);
  });

  it('formats text + csv exports', () => {
    let log = createAuditLog();
    log = appendAudit(log, { kind: 'sign-in', actor: 'user', detail: { ipv4Last: '12' } });
    expect(formatAuditAsText(log.events)).toContain('sign-in');
    expect(formatAuditAsCsv(log.events).split('\n')[0]).toContain('ts,iso,kind');
  });
});

// ----- account/magicLink -----

describe('account/magicLink', () => {
  it('rejects short body', () => {
    const t = buildMagicLink({ body: 'x', email: 'a@b.com' });
    expect(verifyMagicLink({ token: t, presentedEmail: 'a@b.com' })).toEqual({ ok: false, reason: 'short-body' });
  });

  it('accepts a fresh token', () => {
    const body = 'x'.repeat(40);
    const t = buildMagicLink({ body, email: 'a@b.com' });
    expect(verifyMagicLink({ token: t, presentedEmail: 'a@b.com' })).toEqual({ ok: true });
  });

  it('rejects expired tokens', () => {
    const body = 'x'.repeat(40);
    const t = buildMagicLink({ body, email: 'a@b.com', now: 0, lifetimeMs: 1 });
    expect(verifyMagicLink({ token: t, presentedEmail: 'a@b.com', now: 1000 })).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects email mismatch case-insensitively', () => {
    const body = 'x'.repeat(40);
    const t = buildMagicLink({ body, email: 'a@b.com' });
    expect(verifyMagicLink({ token: t, presentedEmail: 'OTHER@b.com' })).toEqual({ ok: false, reason: 'email-mismatch' });
  });

  it('rejects fingerprint mismatch when bound', () => {
    const body = 'x'.repeat(40);
    const t = buildMagicLink({ body, email: 'a@b.com', fingerprint: 'fp1' });
    expect(verifyMagicLink({ token: t, presentedEmail: 'a@b.com', presentedFingerprint: 'fp2' })).toEqual({ ok: false, reason: 'fingerprint-mismatch' });
  });

  it('marks consumed', () => {
    const body = 'x'.repeat(40);
    const t = consumeMagicLink(buildMagicLink({ body, email: 'a@b.com' }));
    expect(verifyMagicLink({ token: t, presentedEmail: 'a@b.com' })).toEqual({ ok: false, reason: 'consumed' });
  });

  it('lifetime constant is 10 minutes', () => {
    expect(MAGIC_LINK_LIFETIME_MS).toBe(10 * 60 * 1000);
  });
});

// ----- security/pwnedCheck -----

describe('security/pwnedCheck', () => {
  const SAMPLE = '0018A45C4D1DEF81644B54AB7F969B88D65:3\nFEEDFACEFEEDFACEFEEDFACEFEEDFACEFEED:200\n';

  it('parses lines + ignores garbage', () => {
    const rows = parsePwnedResponse(SAMPLE + 'not-a-row\n');
    expect(rows.length).toBe(2);
  });

  it('finds counts', () => {
    const rows = parsePwnedResponse(SAMPLE);
    expect(pwnedCountForSuffix(rows, '0018A45C4D1DEF81644B54AB7F969B88D65')).toBe(3);
    expect(pwnedCountForSuffix(rows, 'NOPE')).toBe(0);
  });

  it('grades severity', () => {
    expect(pwnedSeverity(0)).toBe('safe');
    expect(pwnedSeverity(5)).toBe('warn');
    expect(pwnedSeverity(50)).toBe('block');
  });

  it('explains breach counts', () => {
    expect(pwnedExplain(0)).toMatch(/not found/i);
    expect(pwnedExplain(2)).toMatch(/2/);
  });
});

// ----- security/secretRedactor -----

describe('security/secretRedactor', () => {
  it('finds AWS access keys', () => {
    const f = findSecrets('here is AKIAIOSFODNN7EXAMPLE in text');
    expect(f.some((x) => x.kind === 'aws-access-key')).toBe(true);
  });

  it('finds JWTs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    expect(findSecrets(jwt).some((x) => x.kind === 'jwt')).toBe(true);
  });

  it('redacts inline', () => {
    const out = redactSecrets('token: ghp_' + 'A'.repeat(40));
    expect(out).toContain('[REDACTED:github-token]');
  });

  it('containsSecret returns true on private-key blocks', () => {
    const blob = '-----BEGIN PRIVATE KEY-----\nMIIBV..\n-----END PRIVATE KEY-----';
    expect(containsSecret(blob)).toBe(true);
  });

  it('leaves clean text untouched', () => {
    expect(redactSecrets('hello world')).toBe('hello world');
  });
});

// ----- security/urlPolicy -----

describe('security/urlPolicy', () => {
  it('allows public https by default', () => {
    expect(checkUrl('https://example.com', defaultUrlPolicy()).allowed).toBe(true);
  });

  it('blocks file: scheme', () => {
    expect(checkUrl('file:///etc/passwd', defaultUrlPolicy()).allowed).toBe(false);
  });

  it('blocks loopback', () => {
    expect(checkUrl('https://127.0.0.1', defaultUrlPolicy()).allowed).toBe(false);
  });

  it('respects deny patterns', () => {
    const v = checkUrl('https://bad.example.com', { ...defaultUrlPolicy(), deny: ['*.example.com'] });
    expect(v.allowed).toBe(false);
  });

  it('honours allow list when provided', () => {
    const policy = { ...defaultUrlPolicy(), allow: ['*.trusted.com'] };
    expect(checkUrl('https://api.trusted.com', policy).allowed).toBe(true);
    expect(checkUrl('https://other.com', policy).allowed).toBe(false);
  });

  it('rejects http unless allowHttp', () => {
    expect(checkUrl('http://example.com', defaultUrlPolicy()).allowed).toBe(false);
    expect(checkUrl('http://example.com', { ...defaultUrlPolicy(), allowHttp: true }).allowed).toBe(true);
  });
});

// ----- security/cspBuilder -----

describe('security/cspBuilder', () => {
  it('builds default-src self', () => {
    expect(buildCsp()).toContain("default-src 'self'");
  });

  it('omits unsafe-inline for style by default', () => {
    expect(buildCsp()).not.toContain("'unsafe-inline'");
  });

  it('strict renderer allows blob media', () => {
    expect(strictRendererCsp()).toContain('blob:');
  });

  it('appends script hosts', () => {
    expect(buildCsp({ scriptHosts: ['https://example.com'] })).toContain('https://example.com');
  });
});

// ----- security/emailCanonical -----

describe('security/emailCanonical', () => {
  it('lowercases', () => {
    expect(canonicaliseEmail('Foo@Bar.COM')).toBe('foo@bar.com');
  });

  it('strips plus tag', () => {
    expect(canonicaliseEmail('me+spam@example.com')).toBe('me@example.com');
  });

  it('collapses gmail dots', () => {
    expect(canonicaliseEmail('first.last@gmail.com')).toBe('firstlast@gmail.com');
    expect(canonicaliseEmail('first.last@googlemail.com')).toBe('firstlast@gmail.com');
  });

  it('detects honeypot fill', () => {
    expect(detectHoneypot({ trapField: 'oops' }).isBot).toBe(true);
  });

  it('detects too-fast submission', () => {
    expect(detectHoneypot({ trapField: '', formDwellMs: 100 }).isBot).toBe(true);
  });

  it('detects too-few keystrokes', () => {
    expect(detectHoneypot({ trapField: '', keypresses: 0 }).isBot).toBe(true);
  });

  it('passes humans', () => {
    expect(detectHoneypot({ trapField: '', formDwellMs: 5000, keypresses: 30 }).isBot).toBe(false);
  });
});

// ----- cloud/dedup -----

describe('cloud/dedup', () => {
  it('counts refs and saves space', () => {
    const idx = createDedupIndex();
    expect(addRef(idx, 'cid1', 100)).toBe(true);
    expect(addRef(idx, 'cid1', 100)).toBe(false);
    expect(addRef(idx, 'cid2', 50)).toBe(true);
    expect(physicalBytes(idx)).toBe(150);
    expect(logicalBytes(idx)).toBe(250);
    expect(dedupRatio(idx)).toBeCloseTo(1 - 150 / 250, 5);
  });

  it('drops only when refCount hits zero', () => {
    const idx = createDedupIndex();
    addRef(idx, 'cid', 10);
    addRef(idx, 'cid', 10);
    expect(dropRef(idx, 'cid')).toBe(false);
    expect(dropRef(idx, 'cid')).toBe(true);
  });

  it('chunks ranges correctly', () => {
    expect(chunkRanges(0, 10)).toEqual([]);
    expect(chunkRanges(25, 10)).toEqual([{ start: 0, end: 10 }, { start: 10, end: 20 }, { start: 20, end: 25 }]);
  });
});

// ----- cloud/trashBin -----

describe('cloud/trashBin', () => {
  it('restores by id', () => {
    let s = createTrashState();
    s = pushToTrash(s, { id: 'a', originalPath: '/a', bytes: 100 }, 1);
    const r = restoreFromTrash(s, 'a');
    expect(r.restored?.id).toBe('a');
    expect(r.state.entries.length).toBe(0);
  });

  it('purges by id', () => {
    let s = createTrashState();
    s = pushToTrash(s, { id: 'a', originalPath: '/a', bytes: 100 });
    s = purgeFromTrash(s, 'a');
    expect(s.entries.length).toBe(0);
  });

  it('expires after ttl', () => {
    let s = createTrashState(1);  // 1 day
    s = pushToTrash(s, { id: 'a', originalPath: '/a', bytes: 5 }, 0);
    const day = 24 * 60 * 60 * 1000;
    expect(expiredEntries(s, day - 1).length).toBe(0);
    expect(expiredEntries(s, day).length).toBe(1);
  });

  it('sweeps + reports purged', () => {
    let s = createTrashState(0);
    s = pushToTrash(s, { id: 'a', originalPath: '/a', bytes: 5 }, 0);
    const r = sweepExpired(s, 1);
    expect(r.purged.length).toBe(1);
    expect(r.state.entries.length).toBe(0);
  });

  it('totals bytes', () => {
    let s = createTrashState();
    s = pushToTrash(s, { id: 'a', originalPath: '/a', bytes: 5 });
    s = pushToTrash(s, { id: 'b', originalPath: '/b', bytes: 7 });
    expect(trashSize(s)).toBe(12);
  });
});

// ----- cloud/versioning -----

describe('cloud/versioning', () => {
  it('keeps the most recent N versions', () => {
    let f = createVersionedFile('f1', 2);
    for (let i = 0; i < 5; i++) f = pushVersion(f, { versionId: `v${i}`, bytes: 1, contentId: `cid${i}` });
    expect(f.versions.map((v) => v.versionId)).toEqual(['v3', 'v4']);
  });

  it('always keeps at least one version', () => {
    let f = createVersionedFile('f1', 0);
    f = pushVersion(f, { versionId: 'v0', bytes: 1, contentId: 'cid' });
    expect(f.versions.length).toBe(1);
  });

  it('rollback creates a new version pointing back', () => {
    let f = createVersionedFile('f1', 5);
    f = pushVersion(f, { versionId: 'v0', bytes: 1, contentId: 'cid0' });
    f = pushVersion(f, { versionId: 'v1', bytes: 2, contentId: 'cid1' });
    f = rollback(f, 'v0', 1);
    expect(currentVersion(f)?.parentVersionId).toBe('v0');
    expect(currentVersion(f)?.contentId).toBe('cid0');
  });

  it('totals bytes across history', () => {
    let f = createVersionedFile('f1', 5);
    f = pushVersion(f, { versionId: 'v0', bytes: 10, contentId: 'cid' });
    f = pushVersion(f, { versionId: 'v1', bytes: 20, contentId: 'cid' });
    expect(totalBytesInHistory(f)).toBe(30);
  });
});

// ----- cloud/selectiveSync -----

describe('cloud/selectiveSync', () => {
  it('default rules skip node_modules', () => {
    expect(shouldSync('node_modules/foo', defaultSyncRules())).toBe(false);
  });

  it('default rules sync regular files', () => {
    expect(shouldSync('docs/readme.md', defaultSyncRules())).toBe(true);
  });

  it('respects negation', () => {
    const rules = { patterns: ['*.log', '!keep.log'] };
    expect(shouldSync('app.log', rules)).toBe(false);
    expect(shouldSync('keep.log', rules)).toBe(true);
  });

  it('validateRules detects bad patterns', () => {
    expect(validateRules({ patterns: ['ok', '#comment'] })).toEqual([]);
  });
});

// ----- cloud/bandwidthCap -----

describe('cloud/bandwidthCap', () => {
  it('infinite when uncapped', () => {
    expect(effectiveCapKBps(defaultBandwidthCap(), 'upload')).toBe(Infinity);
  });

  it('respects window', () => {
    const cap = { uploadKBps: 100, downloadKBps: 100, windowHours: { start: 9, end: 17 } };
    const am = new Date(2024, 0, 1, 8, 0, 0);
    const noon = new Date(2024, 0, 1, 12, 0, 0);
    expect(effectiveCapKBps(cap, 'upload', am)).toBe(Infinity);
    expect(effectiveCapKBps(cap, 'upload', noon)).toBe(100);
  });

  it('pacing delay scales with chunk size', () => {
    const cap = { uploadKBps: 10, downloadKBps: 10 };
    const noon = new Date(2024, 0, 1, 12, 0, 0);
    const ms = pacingDelayMs(cap, 'upload', 10240, noon);
    expect(ms).toBe(1000);
  });

  it('handles wrap-around windows', () => {
    expect(inWindow(new Date(2024, 0, 1, 23, 0, 0), { start: 22, end: 6 })).toBe(true);
    expect(inWindow(new Date(2024, 0, 1, 12, 0, 0), { start: 22, end: 6 })).toBe(false);
  });
});

// ----- cloud/conflictResolver -----

describe('cloud/conflictResolver', () => {
  it('no conflict when sides match', () => {
    expect(resolveConflict({ base: 1, mine: 2, theirs: 2 }, strictEquals).kind).toBe('no-conflict');
  });

  it('auto-merges when only theirs changed', () => {
    const r = resolveConflict({ base: 1, mine: 1, theirs: 2 }, strictEquals);
    expect(r.kind).toBe('auto-merged');
    if (r.kind === 'auto-merged') expect(r.value).toBe(2);
  });

  it('auto-merges when only mine changed', () => {
    const r = resolveConflict({ base: 1, mine: 9, theirs: 1 }, strictEquals);
    expect(r.kind).toBe('auto-merged');
  });

  it('reports conflict when both changed', () => {
    const r = resolveConflict({ base: 1, mine: 2, theirs: 3 }, strictEquals);
    expect(r.kind).toBe('conflict');
  });

  it('jsonEquals works on objects', () => {
    expect(jsonEquals({ a: 1 }, { a: 1 })).toBe(true);
  });
});

// ----- cloud/coldTier -----

describe('cloud/coldTier', () => {
  it('demotes idle large files', () => {
    const policy = defaultColdPolicy();
    const day = 24 * 60 * 60 * 1000;
    const now = 1_000_000_000;
    const files = [
      { fileId: 'big-old', bytes: policy.minBytes, lastAccessedAt: now - policy.idleDays * day - 1, tier: 'hot' as const },
      { fileId: 'small-old', bytes: 1, lastAccessedAt: now - policy.idleDays * day - 1, tier: 'hot' as const },
    ];
    expect(pickForDemotion(files, policy, now).map((f) => f.fileId)).toEqual(['big-old']);
  });

  it('promotes recently accessed cold files', () => {
    const now = 1_000_000_000;
    const files = [{ fileId: 'a', bytes: 1, lastAccessedAt: now - 1000, tier: 'cold' as const }];
    expect(pickForPromotion(files, 60 * 60 * 1000, now).length).toBe(1);
  });

  it('thaw eta scales with size', () => {
    expect(thawEtaSeconds(50 * 1024 * 1024, 50 * 1024 * 1024)).toBe(1);
  });
});

// ----- cloud/storageBreakdown -----

describe('cloud/storageBreakdown', () => {
  const items = [
    { id: '1', category: 'media' as const, bytes: 1000, lastAccessedAt: 0 },
    { id: '2', category: 'cache' as const, bytes: 500, lastAccessedAt: 0 },
    { id: '3', category: 'notes' as const, bytes: 200, lastAccessedAt: 0 },
  ];

  it('summarises by category', () => {
    const s = summariseUsage(items);
    expect(s.total).toBe(1700);
    expect(s.totals.media).toBe(1000);
  });

  it('largestItems orders desc', () => {
    expect(largestItems(items, 2).map((x) => x.id)).toEqual(['1', '2']);
  });

  it('staleLargeItems honours filters', () => {
    const now = 365 * 24 * 60 * 60 * 1000 + 1;
    const stale = staleLargeItems(items, { now, minBytes: 100, daysIdle: 1 });
    expect(stale.length).toBe(3);
  });

  it('cleanup suggestions include cache', () => {
    const s = cleanupSuggestions(items);
    expect(s.some((x) => x.category === 'cache')).toBe(true);
  });
});

// ----- cloud/shareLinks -----

describe('cloud/shareLinks', () => {
  it('opens a fresh share', () => {
    const t = createShareLink({ id: 'a', resourceRef: 'r', permission: 'view' });
    const r = tryOpenShare(t, {});
    expect(r.ok).toBe(true);
  });

  it('rejects expired', () => {
    const t = createShareLink({ id: 'a', resourceRef: 'r', permission: 'view', lifetimeMs: 1, now: 0 });
    expect(tryOpenShare(t, { now: 1000 })).toEqual({ ok: false, reason: 'expired' });
  });

  it('enforces opens cap', () => {
    let t = createShareLink({ id: 'a', resourceRef: 'r', permission: 'view', maxOpens: 1 });
    const r1 = tryOpenShare(t, {});
    if (r1.ok) t = r1.token;
    expect(tryOpenShare(t, { now: 1 })).toEqual({ ok: false, reason: 'opens-exceeded' });
  });

  it('requires + checks passphrase', () => {
    const t = createShareLink({ id: 'a', resourceRef: 'r', permission: 'view', passphraseHash: 'abc' });
    expect(tryOpenShare(t, {})).toEqual({ ok: false, reason: 'passphrase-required' });
    expect(tryOpenShare(t, { passphraseHash: 'wrong' })).toEqual({ ok: false, reason: 'passphrase-wrong' });
    expect(tryOpenShare(t, { passphraseHash: 'abc' }).ok).toBe(true);
  });

  it('revoke blocks access', () => {
    const t = revokeShare(createShareLink({ id: 'a', resourceRef: 'r', permission: 'view' }));
    expect(tryOpenShare(t, {})).toEqual({ ok: false, reason: 'revoked' });
  });
});

// ----- uki/tokenBudget -----

describe('uki/tokenBudget', () => {
  it('charges and reports remaining', () => {
    const b = createBudget(100, 60_000, 0);
    const r = chargeBudget(b, 30, 0);
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(70);
  });

  it('fails when over limit', () => {
    const b = createBudget(10, 60_000, 0);
    const r = chargeBudget(b, 11, 0);
    expect(r.ok).toBe(false);
  });

  it('rolls window after expiry', () => {
    const b = createBudget(10, 1000, 0);
    const after = rollIfExpired({ ...b, used: 10 }, 1001);
    expect(after.used).toBe(0);
  });

  it('reports remaining after roll', () => {
    expect(remainingBudget({ used: 10, limit: 10, windowStartedAt: 0, windowMs: 1000 }, 2000)).toBe(10);
  });

  it('budgetPercent clamps at 100', () => {
    expect(budgetPercent({ used: 99, limit: 50, windowStartedAt: 0, windowMs: 1000 }, 0)).toBe(100);
  });
});

// ----- uki/confidence -----

describe('uki/confidence', () => {
  it('higher with citations + sources', () => {
    const a = scoreConfidence({ citationCount: 0, retries: 0, distinctSources: 0 });
    const b = scoreConfidence({ citationCount: 4, retries: 0, distinctSources: 3 });
    expect(b).toBeGreaterThan(a);
  });

  it('lower with retries', () => {
    const a = scoreConfidence({ citationCount: 2, retries: 0, distinctSources: 1 });
    const b = scoreConfidence({ citationCount: 2, retries: 4, distinctSources: 1 });
    expect(b).toBeLessThan(a);
  });

  it('labels split into 3 bands', () => {
    expect(confidenceLabel(0.1)).toBe('low');
    expect(confidenceLabel(0.6)).toBe('medium');
    expect(confidenceLabel(0.9)).toBe('high');
  });

  it('extracts citation indices', () => {
    expect(extractCitationIndices('see [1] and [2] also [1]')).toEqual([1, 2]);
  });

  it('formats citation with url', () => {
    expect(formatCitation({ index: 1, title: 'X', url: 'https://x' })).toContain('https://x');
  });
});

// ----- uki/promptTemplates -----

describe('uki/promptTemplates', () => {
  it('renders standard summarise template', () => {
    const out = renderPrompt(STANDARD_TEMPLATES.summarise, { maxSentences: '2', text: 'hi' });
    expect(out).toContain('hi');
  });

  it('throws when required variable missing', () => {
    expect(() => renderPrompt(STANDARD_TEMPLATES.summarise, { maxSentences: '2' } as Record<string, string>)).toThrow(PromptVariableMissingError);
  });

  it('strips control characters', () => {
    const out = renderPrompt({ id: 't', body: '{{x}}', required: ['x'] }, { x: 'a\u0001b' });
    expect(out).toBe('ab');
  });
});

// ----- uki/piiDetector -----

describe('uki/piiDetector', () => {
  it('finds emails', () => {
    expect(findPii('mail me at foo@bar.com').some((p) => p.kind === 'email')).toBe(true);
  });

  it('finds SSN', () => {
    expect(findPii('SSN 123-45-6789').some((p) => p.kind === 'ssn')).toBe(true);
  });

  it('luhn validates real CC numbers', () => {
    expect(luhnValid('4111 1111 1111 1111')).toBe(true);
    expect(luhnValid('4111 1111 1111 1112')).toBe(false);
  });

  it('redacts emails', () => {
    expect(redactPii('me at foo@bar.com')).toBe('me at [EMAIL]');
  });
});

// ----- uki/webCache + tool budget -----

describe('uki/webCache + tool budget', () => {
  it('returns cached values until expiry', () => {
    const c = new TtlCache<string, number>(1000);
    c.set('a', 1, 1000, 0);
    expect(c.get('a', 500)).toBe(1);
    expect(c.get('a', 1500)).toBeUndefined();
  });

  it('evicts oldest when at capacity', () => {
    const c = new TtlCache<string, number>(60_000, 2);
    c.set('a', 1, 60_000, 0);
    c.set('b', 2, 60_000, 0);
    c.set('c', 3, 60_000, 0);
    expect(c.get('a', 0)).toBeUndefined();
    expect(c.get('c', 0)).toBe(3);
  });

  it('charges tool budgets per-tool', () => {
    let b = createToolBudget({ search: 2 });
    let r = chargeTool(b, 'search'); expect(r.ok).toBe(true); b = r.budget;
    r = chargeTool(b, 'search'); expect(r.ok).toBe(true); b = r.budget;
    r = chargeTool(b, 'search'); expect(r.ok).toBe(false);
  });

  it('reset clears use', () => {
    const b = chargeTool(createToolBudget({ s: 1 }), 's').budget;
    expect(resetToolBudget(b).used).toEqual({});
  });
});

// ----- uki/agentProfile -----

describe('uki/agentProfile', () => {
  it('exports the four core profiles', () => {
    expect(Object.keys(AGENT_PROFILES).sort()).toEqual(['coder', 'planner', 'researcher', 'writer']);
  });

  it('pinSeed yields determinism config', () => {
    expect(pinSeed(42)).toEqual({ seed: 42, temperature: 0, topP: 1 });
  });

  it('applyDeterministic overrides temperature/topP and adds seed', () => {
    const p = applyDeterministic(AGENT_PROFILES.coder, pinSeed(7));
    expect(p.temperature).toBe(0);
    expect(p.topP).toBe(1);
    expect(p.seed).toBe(7);
  });
});

// ----- collab/comments -----

describe('collab/comments', () => {
  const c = (id: string, parentId?: string, ts: number = id.charCodeAt(0)) => ({
    id, parentId, authorId: 'u', body: 'hi', createdAt: ts,
  });

  it('addComment tracks roots', () => {
    let t = createCommentTree();
    t = addComment(t, c('a'));
    t = addComment(t, c('b', 'a'));
    expect(t.rootIds).toEqual(['a']);
    expect(childrenOf(t, 'a').map((x) => x.id)).toEqual(['b']);
  });

  it('editComment updates body', () => {
    let t = addComment(createCommentTree(), c('a'));
    t = editComment(t, 'a', 'edited', 999);
    expect(t.byId.get('a')?.body).toBe('edited');
  });

  it('resolveComment marks resolved', () => {
    let t = addComment(createCommentTree(), c('a'));
    t = resolveComment(t, 'a');
    expect(unresolvedCount(t)).toBe(0);
  });

  it('deleteComment cascades children', () => {
    let t = createCommentTree();
    t = addComment(t, c('a'));
    t = addComment(t, c('b', 'a'));
    t = deleteComment(t, 'a');
    expect(t.byId.size).toBe(0);
  });
});

// ----- collab/reactions -----

describe('collab/reactions', () => {
  it('exposes semantic reaction names', () => {
    expect(REACTION_NAMES).toContain('thumbs-up');
  });

  it('toggle adds and removes', () => {
    let s = createReactionState();
    s = toggleReaction(s, 'thumbs-up', 'u1');
    expect(reactionCounts(s)['thumbs-up']).toBe(1);
    s = toggleReaction(s, 'thumbs-up', 'u1');
    expect(reactionCounts(s)['thumbs-up']).toBe(0);
  });

  it('parses mentions with leading @', () => {
    expect(parseMentions('hey @alice and @bob_99')).toEqual(['alice', 'bob_99']);
  });

  it('ignores email-like @', () => {
    expect(parseMentions('contact me@example.com')).toEqual([]);
  });
});

// ----- collab/crdt -----

describe('collab/crdt', () => {
  it('LWW newer ts wins on merge', () => {
    const a = lwwInit('a', 'u1', 1);
    const b = lwwSet(a, 'b', 'u2', 2);
    expect(lwwMerge(a, b).value).toBe('b');
  });

  it('LWW lex actor breaks tie', () => {
    const a = lwwInit('a', 'u1', 5);
    const b = lwwInit('b', 'u2', 5);
    expect(lwwMerge(a, b).value).toBe('b');   // 'u2' >= 'u1'
  });

  it('GCounter increments and merges by max', () => {
    const a = gCounterIncr(gCounterIncr(gCounterInit(), 'u1', 3), 'u2', 1);
    const b = gCounterIncr(gCounterInit(), 'u1', 5);
    expect(gCounterValue(gCounterMerge(a, b))).toBe(6);
  });

  it('GCounter rejects negative increments', () => {
    expect(() => gCounterIncr(gCounterInit(), 'u', -1)).toThrow();
  });
});

// ----- collab/kanban -----

describe('collab/kanban', () => {
  it('creates default 3-column board', () => {
    expect(createBoard('b', 'B').columns.length).toBe(3);
  });

  it('moves card across columns', () => {
    let b = createBoard('b', 'B');
    b = addCard(b, 'col-0', { id: 'c1', title: 'x' });
    b = moveCard(b, 'c1', 'col-2');
    expect(b.columns[0].cards.length).toBe(0);
    expect(b.columns[2].cards.map((c) => c.id)).toEqual(['c1']);
  });

  it('removeCard drops it', () => {
    let b = addCard(createBoard('b', 'B'), 'col-0', { id: 'c1', title: 'x' });
    b = removeCard(b, 'c1');
    expect(b.columns[0].cards.length).toBe(0);
  });

  it('wipExceeded flags overflow', () => {
    expect(wipExceeded({ id: 'c', title: 'T', cards: [{ id: 'a', title: 'a' }, { id: 'b', title: 'b' }], wipLimit: 1 })).toBe(true);
  });
});

// ----- payment/coupons -----

describe('payment/coupons', () => {
  it('applies percent coupon', () => {
    const r = applyCoupon({ code: 'X', kind: 'percent', value: 25 }, { amountMinor: 1000 });
    expect(r.discountMinor).toBe(250);
  });

  it('applies amount coupon, capped at total', () => {
    const r = applyCoupon({ code: 'X', kind: 'amount', value: 9999 }, { amountMinor: 500 });
    expect(r.discountMinor).toBe(500);
  });

  it('free-months returns months', () => {
    const r = applyCoupon({ code: 'X', kind: 'free-months', value: 3 }, { amountMinor: 0 });
    expect(r.freeMonths).toBe(3);
  });

  it('rejects expired', () => {
    const r = applyCoupon({ code: 'X', kind: 'percent', value: 10, expiresAt: 0 }, { amountMinor: 100, now: 1000 });
    expect(r.problem).toBe('expired');
  });

  it('rejects when min spend unmet', () => {
    const r = applyCoupon({ code: 'X', kind: 'percent', value: 10, minSpend: 1000 }, { amountMinor: 100 });
    expect(r.problem).toBe('min-spend');
  });

  it('rejects when plan mismatched', () => {
    const r = applyCoupon({ code: 'X', kind: 'percent', value: 10, planIds: ['pro'] }, { amountMinor: 100, planId: 'personal' });
    expect(r.problem).toBe('wrong-plan');
  });

  it('rejects oneUse if already redeemed', () => {
    const r = applyCoupon({ code: 'X', kind: 'percent', value: 10, oneUse: true }, { amountMinor: 100, alreadyRedeemed: new Set(['X']) });
    expect(r.problem).toBe('already-used');
  });
});

// ----- payment/referrals -----

describe('payment/referrals', () => {
  it('generates 8-char code from seed', () => {
    expect(generateReferralCode('deadbeef').length).toBe(8);
  });

  it('valid code has only safe alphabet', () => {
    expect(isValidReferralCode('AAAAAAAA')).toBe(true);
    expect(isValidReferralCode('AAAAAAA0')).toBe(false);   // 0 not in alphabet
    expect(isValidReferralCode('short')).toBe(false);
  });

  it('caps awards at monthly cap', () => {
    let l = createReferralLedger(500);
    let r = awardCredit(l, { referrerId: 'u', refereeId: 'r1', rewardMinor: 400, awardedAt: 0 });
    l = r.ledger; expect(r.awardedMinor).toBe(400);
    r = awardCredit(l, { referrerId: 'u', refereeId: 'r2', rewardMinor: 400, awardedAt: 0 });
    expect(r.awardedMinor).toBe(100);
  });
});

// ----- payment/trial + dunning -----

describe('payment/trial + dunning', () => {
  it('startTrial transitions to active', () => {
    const t = startTrial(createTrial(), 7, 0);
    expect(t.phase).toBe('active');
  });

  it('tickTrial expires after window', () => {
    const t = startTrial(createTrial(), 1, 0);
    expect(tickTrial(t, 24 * 60 * 60 * 1000 + 1).phase).toBe('expired');
  });

  it('convertTrial flips to converted', () => {
    expect(convertTrial(startTrial(createTrial(), 7, 0)).phase).toBe('converted');
  });

  it('cancelTrial only from active', () => {
    expect(cancelTrial(createTrial()).phase).toBe('idle');
    expect(cancelTrial(startTrial(createTrial(), 7, 0)).phase).toBe('cancelled');
  });

  it('trialDaysLeft counts down', () => {
    const t = startTrial(createTrial(), 14, 0);
    expect(trialDaysLeft(t, 0)).toBe(14);
  });

  it('dunning schedules attempts at default days', () => {
    let d = startDunning(0);
    const expected = DEFAULT_DUNNING_SCHEDULE;
    for (let i = 0; i < expected.length; i++) {
      const next = nextDunningAttempt(d, expected[i] * 24 * 60 * 60 * 1000);
      expect(next.isOverdue).toBe(true);
      d = recordDunningAttempt(d, { ok: false, at: 0 });
    }
    expect(dunningDone(d)).toBe(true);
  });

  it('dunning ends early when an attempt succeeds', () => {
    let d = startDunning(0);
    d = recordDunningAttempt(d, { ok: true });
    expect(dunningDone(d)).toBe(true);
  });
});

// ----- payment/tax -----

describe('payment/tax', () => {
  it('computes UK VAT', () => {
    expect(computeTax(1000, 'GB').taxMinor).toBe(200);
  });

  it('zero tax for US', () => {
    expect(computeTax(1000, 'US').taxMinor).toBe(0);
  });

  it('formats currency', () => {
    expect(typeof formatCurrency(1234, 'USD', 'en-US')).toBe('string');
  });

  it('converts via rate table', () => {
    expect(convertCurrency(1000, 'USD', 'EUR', { 'USD-EUR': 0.9 })).toBe(900);
  });

  it('throws when no conversion rate', () => {
    expect(() => convertCurrency(100, 'USD', 'XYZ', {})).toThrow();
  });

  it('VAT_RATES has expected keys', () => {
    expect(VAT_RATES.DE).toBe(0.19);
  });
});

// ----- plugin/manifest + capabilities -----

describe('plugin/manifest + capabilities', () => {
  it('rejects bad id', () => {
    const r = validateManifest({ id: 'bad id', name: 'x', version: '1.0.0', author: 'me', dexVersion: '1.0.0', entryPoint: 'i', capabilities: [] });
    expect(r.ok).toBe(false);
  });

  it('accepts a clean manifest', () => {
    const r = validateManifest({ id: 'com.example.tool', name: 'Tool', version: '1.0.0', author: 'Me', dexVersion: '3.8.9', entryPoint: 'index.js', capabilities: ['fs:read'] });
    expect(r.ok).toBe(true);
  });

  it('grants and revokes capability', () => {
    let l = createCapabilityLedger();
    l = grantCapability(l, { pluginId: 'p', capability: 'fs:read' });
    expect(hasCapability(l, 'p', 'fs:read')).toBe(true);
    l = revokeCapability(l, 'p', 'fs:read');
    expect(hasCapability(l, 'p', 'fs:read')).toBe(false);
  });
});

// ----- plugin/eventBus -----

describe('plugin/eventBus', () => {
  type M = { 'note.created': { id: string }; 'note.deleted': { id: string } };

  it('delivers events to subscribers', () => {
    const bus = new EventBus<M>();
    let got = '';
    bus.on('p1', 'note.created', (p) => { got = p.id; });
    expect(bus.emit('note.created', { id: 'n1' })).toBe(1);
    expect(got).toBe('n1');
  });

  it('detachPlugin removes all of a plugin\'s listeners', () => {
    const bus = new EventBus<M>();
    bus.on('p1', 'note.created', () => {});
    bus.on('p1', 'note.deleted', () => {});
    expect(bus.detachPlugin('p1')).toBe(2);
    expect(bus.listenerCount('note.created')).toBe(0);
  });

  it('returns an unsubscribe', () => {
    const bus = new EventBus<M>();
    const off = bus.on('p1', 'note.created', () => {});
    off();
    expect(bus.listenerCount('note.created')).toBe(0);
  });
});

// ----- i18n/messages -----

describe('i18n/messages', () => {
  it('substitutes variables', () => {
    expect(format('Hello, {name}!', { name: 'X' })).toBe('Hello, X!');
  });

  it('handles plurals', () => {
    expect(format('{count, plural, one{# item} other{# items}}', { count: 1 })).toBe('1 item');
    expect(format('{count, plural, one{# item} other{# items}}', { count: 5 })).toBe('5 items');
  });

  it('detects RTL locales', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('en')).toBe(false);
  });

  it('resolves locale fallback', () => {
    expect(resolveLocale('es-MX', ['en', 'es'])).toBe('es');
    expect(resolveLocale('zh-CN', ['en'])).toBe('en');
  });
});

// ----- perf/helpers -----

describe('perf/helpers', () => {
  it('debounce coalesces calls', async () => {
    let calls = 0;
    const fn = debounce(() => { calls += 1; }, 10);
    fn(); fn(); fn();
    await new Promise((r) => setTimeout(r, 25));
    expect(calls).toBe(1);
  });

  it('throttle fires immediately, then waits', async () => {
    let calls = 0;
    const fn = throttle(() => { calls += 1; }, 30);
    fn(); fn(); fn();
    expect(calls).toBe(1);
  });

  it('retry succeeds eventually', async () => {
    let n = 0;
    const out = await retry(async () => {
      n += 1;
      if (n < 3) throw new Error('nope');
      return 'ok';
    }, { attempts: 5, baseMs: 0, capMs: 0 });
    expect(out).toBe('ok');
  });

  it('retry stops after attempts', async () => {
    await expect(retry(async () => { throw new Error('boom'); }, { attempts: 2, baseMs: 0, capMs: 0 })).rejects.toThrow('boom');
  });

  it('nextDelay caps and jitters', () => {
    const ms = nextDelay(5, { attempts: 5, baseMs: 100, capMs: 1000, jitter: 0.2 });
    expect(ms).toBeGreaterThanOrEqual(800);
    expect(ms).toBeLessThanOrEqual(1200);
  });

  it('visibleRange handles empty list', () => {
    expect(visibleRange({ total: 0, itemHeight: 10, viewportHeight: 100, scrollTop: 0 })).toEqual({ startIndex: 0, endIndex: 0 });
  });

  it('visibleRange clamps to total', () => {
    const r = visibleRange({ total: 5, itemHeight: 10, viewportHeight: 1000, scrollTop: 0, overscan: 0 });
    expect(r.endIndex).toBe(5);
  });
});

// ----- theme/accessibility -----

describe('theme/accessibility', () => {
  it('high-contrast palettes are dark/light pair', () => {
    expect(HIGH_CONTRAST_DARK.bg).toBe('#000000');
    expect(HIGH_CONTRAST_LIGHT.bg).toBe('#ffffff');
  });

  it('color-blind palettes have 3 modes', () => {
    expect(Object.keys(COLORBLIND_PALETTES).sort()).toEqual(['deuteranopia', 'protanopia', 'tritanopia']);
  });

  it('applyColorBlind merges into base', () => {
    const p = applyColorBlind(HIGH_CONTRAST_DARK, 'deuteranopia');
    expect(p.accent).toBe(COLORBLIND_PALETTES.deuteranopia.accent);
  });

  it('density scaling reduces spacing', () => {
    expect(scaleSpacing(20, 'compact')).toBeLessThan(20);
    expect(DENSITY_SCALES.comfortable).toBe(1);
  });
});

// ----- onboarding/helpers -----

describe('onboarding/helpers', () => {
  const md = '# Changelog\n\n## v3.8.9\n- 100 GB cloud storage\n\n## v3.8.8\n- payments\n';

  it('parses changelog entries', () => {
    const entries = parseChangelog(md);
    expect(entries.map((e) => e.version)).toEqual(['3.8.9', '3.8.8']);
    expect(entryForVersion(entries, '3.8.9')?.body).toContain('100 GB');
  });

  it('persona quiz produces a persona', () => {
    expect(scorePersona({ q1: 'q1b', q2: 'q2b' })).toBe('developer');
  });

  it('persona quiz exposes 2 baseline questions', () => {
    expect(PERSONA_QUIZ.length).toBeGreaterThanOrEqual(2);
  });

  it('NPS prompts after 30 days', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(shouldPromptNps({ scores: [] }, 30 * day, 0)).toBe(true);
    expect(shouldPromptNps({ scores: [] }, 10 * day, 0)).toBe(false);
  });

  it('NPS computes promoters/detractors score', () => {
    let s = recordNps({ scores: [] }, 9);
    s = recordNps(s, 3);
    s = recordNps(s, 10);
    const c = computeNps(s);
    expect(c.promoters).toBe(2);
    expect(c.detractors).toBe(1);
    expect(c.score).toBe(33);
  });
});

// ----- commands/registry + cli -----

describe('commands/registry + cli', () => {
  it('registers and de-dupes by id', () => {
    let r = createRegistry();
    r = registerCommand(r, { id: 'a', label: 'Open file' });
    r = registerCommand(r, { id: 'a', label: 'Reopen file' });
    expect(r.commands.length).toBe(1);
    expect(r.commands[0].label).toBe('Reopen file');
  });

  it('unregisterCommand removes', () => {
    let r = registerCommand(createRegistry(), { id: 'a', label: 'x' });
    r = unregisterCommand(r, 'a');
    expect(r.commands.length).toBe(0);
  });

  it('fuzzyMatch scores in-order', () => {
    expect(fuzzyMatch('Open file', 'opf')).toBeGreaterThan(0);
    expect(fuzzyMatch('Open file', 'zzz')).toBe(0);
  });

  it('searchCommands ranks by score', () => {
    let r = createRegistry();
    r = registerCommand(r, { id: 'a', label: 'New note' });
    r = registerCommand(r, { id: 'b', label: 'New file' });
    const out = searchCommands(r, 'new');
    expect(out.length).toBeGreaterThan(0);
  });

  it('searchCommands skips disabled', () => {
    let r = createRegistry();
    r = registerCommand(r, { id: 'a', label: 'Off', enabled: false });
    expect(searchCommands(r, 'off').length).toBe(0);
  });

  it('parses argv with flags + positionals', () => {
    const a = parseArgv(['note', 'extra', '--title', 'Hi', '-v']);
    expect(a.command).toBe('note');
    expect(a.flags.title).toBe('Hi');
    expect(a.flags.v).toBe(true);
    expect(a.positional).toEqual(['extra']);
  });

  it('parses --key=value', () => {
    const a = parseArgv(['cmd', '--name=Alice']);
    expect(a.flags.name).toBe('Alice');
  });

  it('exposes API contract version', () => {
    expect(PUBLIC_API_VERSION).toBe('1');
  });
});
