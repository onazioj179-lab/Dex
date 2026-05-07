# Changelog

All notable changes to DEX will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file documents the **current release only**. For the full history of
prior releases, see the git tag history (`git tag --list`) and the GitHub
Releases page. Older changelog entries were trimmed in v3.8.9 to keep the
public document short and focused on what has actually shipped to users now.

### v3.8.9 follow-up - consolidation pass (no version bump)

A "boil the ocean" follow-up landed on the same `v3.8.9` line: ~30 new pure
shared modules + 180 new tests + a no-`alert()` rewrite of the account
settings panel. The version stays at `v3.8.9`; the tag stays at the original
ship commit. These modules are pure, self-contained, fully covered by the new
`tests/unit/v389-followup-consolidation.test.ts` suite, and ready to be wired
into UI surfaces in subsequent updates.

**Account hardening.** `src/shared/account/sessions.ts` (device list, trusted
window, step-up policy, suspicious-sign-in heuristic),
`src/shared/account/auditLog.ts` (capped event log + text/csv exporters),
`src/shared/account/magicLink.ts` (issue / verify / consume with email +
fingerprint binding and 10-minute lifetime).

**Security primitives.** `security/pwnedCheck.ts` (k-anonymity response
parser, severity grading), `security/secretRedactor.ts` (AWS / GitHub / JWT /
private-key detector + redactor), `security/urlPolicy.ts` (allow / deny lists,
private-IP blocking, scheme allowlist), `security/cspBuilder.ts` (renderer CSP
builder, no `unsafe-inline` by default), `security/emailCanonical.ts`
(plus-tag stripping, gmail-dot collapse, honeypot + dwell-time bot detector).

**Cloud storage internals.** `cloud/dedup.ts` (content-id refcounting,
chunk ranges), `cloud/trashBin.ts` (TTL-based recycle bin with sweeper),
`cloud/versioning.ts` (keep-N history with rollback that preserves history),
`cloud/selectiveSync.ts` (gitignore-style include / exclude),
`cloud/bandwidthCap.ts` (time-window pacing with wrap-around),
`cloud/conflictResolver.ts` (3-way base / mine / theirs auto-merge),
`cloud/coldTier.ts` (idle-based demotion, recent-access promotion, thaw ETA),
`cloud/storageBreakdown.ts` (category roll-ups, stale-large finder, cleanup
suggestions), `cloud/shareLinks.ts` (revocable share tokens with passphrase,
opens cap, and expiry).

**UKI runtime.** `uki/tokenBudget.ts` (rolling-window charge / cap),
`uki/confidence.ts` (logprob + citation + retry score, label bands, citation
extraction), `uki/promptTemplates.ts` (validated `{{var}}` substitution +
control-character stripping + standard summarise / rewrite / bullet
templates), `uki/piiDetector.ts` (email / phone / SSN / credit-card with Luhn
gating / IPv4 / IPv6, with redactor), `uki/webCache.ts` (TTL cache with
oldest-eviction + per-tool budget), `uki/agentProfile.ts` (researcher /
writer / coder / planner profiles, deterministic seeding overlay).

**Collaboration.** `collab/comments.ts` (threaded tree with edit / resolve /
cascade-delete), `collab/reactions.ts` (semantic reaction names - thumbs-up,
eyes, heart, celebrate, questioning, thinking - **no emojis**, plus mention
parser that ignores email-style `@`), `collab/crdt.ts` (LWW register +
G-Counter with deterministic actor tie-break), `collab/kanban.ts` (board /
column / card with WIP limits).

**Payments.** `payment/coupons.ts` (percent / amount / free-months with min
spend, plan scoping, and one-use enforcement), `payment/referrals.ts`
(deterministic 8-char codes, monthly cap with prorating), `payment/trial.ts`
(idle / active / expired / converted / cancelled state machine + dunning
schedule with success short-circuit), `payment/tax.ts` (30+ country VAT
table, Intl-backed currency formatter with fallback, FX conversion).

**Plugin platform.** `plugin/manifest.ts` (reverse-DNS id, semver, capability
allowlist, manifest validator + capability ledger), `plugin/eventBus.ts`
(typed pub-sub with per-plugin detach for clean unload).

**Cross-cutting.** `i18n/messages.ts` (`{var}` + ICU-style plurals, RTL
locale detection, locale fallback chain), `perf/helpers.ts` (debounce,
throttle, deterministic-jitter retry, virtualised `visibleRange`),
`theme/accessibility.ts` (high-contrast palettes, three colour-blind palettes
based on Wong, density scales), `onboarding/helpers.ts` (changelog parser
that finds the entry for the current version, persona quiz, NPS prompter +
score), `commands/registry.ts` (palette command store, fuzzy ranker, `argv`
parser with `--key=value` and `--key value`, public API contract version).

**Account settings UI no longer uses `alert()`.** The two `alert()` calls in
`AccountSettingsCard.tsx` have been replaced with two inline panels (billing
+ plan compare) inside the signed-in view. Both panels have an honest stub
banner if no callback handler is wired in. New props `onManageBilling` and
`onComparePlans` allow host code to take over with a real surface.

**Tests.** `tests/unit/v389-followup-consolidation.test.ts` adds 180 new unit
tests across 56 suites for everything above. Total suite is now **973 tests**
across **56 files**, all passing. `tsc --noEmit` reports zero errors and
`npm run build` ships clean.

## [3.8.9] - 2026-05-13 -- Polished accounts, 100 GB cloud, sharper Pro

### Added

- **Polished account UI.** New `src/renderer/components/account/`
  surface: `AccountAuthFlow` (welcome / sign-in / sign-up / terms gate /
  two-factor / skip / success), `AccountSettingsCard` (signed-in or
  signed-out view inside Settings), `ProBadge` and `UpgradePrompt` for
  consistent "this is paid" signposting. Every component uses the
  shared `Button` and `TextInput` primitives so the visual system stays
  consistent across the app.
- **Onboarding sign-in / sign-up / skip.** New `account` step inserted
  into the first-launch onboarding between the Terms screen and the
  Ready screen. Skipping is the recommended default; an account is
  always optional.
- **Pure onboarding flow logic.** `src/shared/account/onboardingFlow.ts`
  with full state machine, validators, and a hard cloud-action gate
  that refuses sign-in / payment until Terms + Privacy are accepted.
- **Pro perks catalogue.** `src/shared/license/proPerks.ts` lists
  every perk a paying user gets, mapped to gates the renderer can
  query: 100 GB storage, end-to-end encryption, legacy handover,
  unlimited snippets, workspace sync, theme studio, ad-free promise,
  commercial use, live collab, priority support, plugin publishing,
  on-device voice cloning, beta channel, admin console, SLA.

### Changed

- **Paid cloud storage doubled to 100 GB** for Personal, Family, Pro,
  and Studio (per seat). Free Viewer remains 10 GB. Updated in
  `src/shared/cloud/quota.ts`, `src/shared/license/planFeatures.ts`,
  PRICING.md, TERMS.md, PRIVACY.md, and the related unit tests.
- **Settings -> Account** is a first-class section. The card renders
  `AccountAuthFlow` when signed out and a polished management view
  with cloud-storage usage bar + upgrade prompt when signed in.
- **CHANGELOG trimmed.** Older release entries were removed from this
  document. Tag history and GitHub Releases retain the full record.

### Tests

- `tests/unit/onboarding-and-perks.test.ts` -- 19 new tests covering
  every flow branch, every validator, and every Pro-perk gate.

### Notes

- Free Viewer keeps its full feature set (10 GB cloud, 20 UKI plans
  per day, all local features). The paid tiers only add capability;
  they never restrict free.
- All new files are watermarked under the DEX Software License
  Agreement v1.0 (see `LICENSE`).
