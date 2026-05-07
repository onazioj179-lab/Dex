# Changelog

All notable changes to DEX will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file documents the **current release only**. For the full history of
prior releases, see the git tag history (`git tag --list`) and the GitHub
Releases page. Older changelog entries were trimmed in v3.8.9 to keep the
public document short and focused on what has actually shipped to users now.

## v4.0.0 - "Surpass the Competition" leapfrog (Waves Q-Z, 190 new tests)

A 10-wave leapfrog release shipping deterministic, dependency-free
primitives in `src/shared/` that match or exceed Logic Pro, Premiere,
After Effects, Blender, CAD pipelines, Photoshop, macOS / Windows 11 /
Linux shells, enterprise security stacks, real-time collaboration
platforms, modern AI orchestration, and power-user / accessibility
("weird mode") tooling.

- Wave Q - audio DSP + analysis (36 tests, `src/shared/audio/`)
- Wave R - video pipeline + color + captions (27 tests, `src/shared/video/`)
- Wave S - motion + 3D math (13 tests, `src/shared/motion3d/`)
- Wave T - CAD + simulation (18 tests, `src/shared/cad/`)
- Wave U - non-destructive image AI (16 tests, `src/shared/image/`)
- Wave V - OS shell parity (15 tests, `src/shared/shell/`)
- Wave W - cybersecurity hardening v4 (16 tests, `src/shared/security/v4/`)
- Wave X - real-time collab + cloud sync v4 (14 tests, `src/shared/collab/v4/`)
- Wave Y - UKI super-intelligence v4 (14 tests, `src/shared/uki/v4/`)
- Wave Z - power-user weird mode (21 tests, `src/shared/power/`)

All primitives are pure modules: no DOM, IPC, electron, network or
filesystem coupling. Callers inject clocks, RNG, and hash functions
explicitly so every test is deterministic. Each wave shipped as its own
commit on `main` and went through the full gate sequence
(`add-watermarks` → `tsc --noEmit` → focused vitest → `npm run build`)
before push.

## v3.9.0 - "Boil the Ocean" polish (10 waves, 259 new tests)

A 10-wave polish release that lands ~500 user-visible improvements as
deterministic pure-data primitives in `src/shared/`. Every primitive is
covered by a dedicated test file under `tests/unit/v389-wave<X>-*.test.ts`
and is wired-in incrementally by the renderer and main process. The test
suite grew from 1223 to **1482 passing tests across 73 files** with no
regressions.

Each wave shipped as its own commit on `main` and went through the full
gate sequence (`add-watermarks` → `tsc --noEmit` → full vitest suite →
`npm run build`) before push.

### Wave G — Operation smoothness (33 tests)
- `src/shared/perf/smoothness.ts` — frame-budget stepper with `FRAME_BUDGET_MS=12`,
  debounce/throttle planners, hover-intent state machine (80 ms),
  scroll memory with negative-value clamping, priority `PrefetchQueue<T>`
  with id dedupe, long-task buffer + summariser, reduced-motion-aware
  effective animation duration helper.
- `src/shared/perf/optimistic.ts` — `OptimisticStore<T>` with
  `beginMutation`/`commitMutation` (server-value override) /
  `rollbackMutation` (drops created entries) and `pruneStale`.

### Wave H — Untouched UI surfaces (16 tests)
- `src/shared/theme/surfaces.ts` — 18-key empty-state catalogue,
  `rankPalette` with prefix/substring/subseq scoring + recency boost,
  scoped key-binding registry (8 scopes, globals-first), focus-ring
  tokens, TTL-driven toast queue with id-replace and sticky support.

### Wave I — Pricing & revenue plumbing (26 tests)
- `src/shared/license/revenue.ts` — capability-driven feature gates
  with trial bypass, `buildPlanPicker` with most-popular/best-value/free
  badges, per-seat quoting, promo-code format validation, receipt
  normaliser + sorter, retention ladder (pause → discount → cancel),
  trial-countdown coloring tiers.

### Wave J — Reliability & self-healing (27 tests)
- `src/shared/security/reliability.ts` — autosave snapshots with
  `AUTOSAVE_INTERVAL_MS=60000` and force-on-blur, jittered exponential
  backoff (`DEFAULT_BACKOFF`), three-state circuit breaker
  (closed/open/half-open) with cooldown probes, native module health
  summary (ok/mismatch/failed/missing), disk guard with warn (200 MB)
  and block (50 MB) thresholds, FIFO crash queue (`CRASH_QUEUE_CAPACITY=50`)
  with consent-gated upload.

### Wave K — A11y + i18n foundation (33 tests)
- `src/shared/i18n/a11y.ts` — WCAG `relativeLuminance` + `contrastRatio`,
  AAA/AA/AA-large classification, color-blind safe palette substitution
  (Wong palette) for protanopia/deuteranopia/tritanopia, aria-label
  resolution chain (explicit → tooltip → prettified action id → "Action"),
  `isFocusable` heuristic, locale-aware `t()` with `{name}` interpolation
  and English fallback, registerable string tables.

### Wave L — UKI intelligence polish (28 tests)
- `src/shared/uki/intelligence.ts` — rolling Brier-score calibration with
  bias clamping, structural plan diff (added/removed/reordered + destructive
  flag), regex-gated `suggestSkills` from selection text, bounded multi-step
  undo log (`UNDO_LOG_CAPACITY=100`), 30-day pattern decay, epsilon-greedy
  suggestion bandit with optimistic priors.

### Wave M — Nexus power features (23 tests)
- `src/shared/nexus/power.ts` — play/pause/seek time-scrubber state machine
  with snap-to-step, multi-select with replace/toggle/range-extend gestures,
  saved-views store with id-replace and capacity, world→minimap projection
  with bounds checking, JSON + SVG graph exporters with XML escaping.

### Wave N — File ops & storage (28 tests)
- `src/shared/cloud/fileOps.ts` — DnD planner that reads modifiers
  (ctrl/alt/shift) and same-vs-cross-root semantics, cancellable bulk
  operation queue with progress and per-item status, age-based trash
  purge with reprieve windows, conflict resolver with rename/overwrite/
  skip/keep-both strategies, priority-ordered sync status badge resolver
  (error → conflict → offline → syncing → pending → synced).

### Wave O — Onboarding & discovery (23 tests)
- `src/shared/onboarding/discovery.ts` — tour state machine with
  next/prev/skip/restart and required-step gating, `TRY_CARDS` catalogue
  (5 entries across 4 scopes), `DAILY_TIPS` rotator with deterministic
  djb2-seeded date selection, "?" search index with prefix/contains/title
  scoring + combo bonus, dependency-gated first-run checklist.

### Wave P — Perf hardening (22 tests)
- `src/shared/perf/hardening.ts` — chunk planner that bin-packs
  non-critical apps under `CHUNK_MAX_KB=500`, viewport-relative image
  lazy-load policy with saveData adjustment, IPC payload trimmer that
  drops optional fields in declared order under `IPC_PAYLOAD_BUDGET_BYTES=256KB`,
  fixed-height virtual-scroll window with overscan, four-tier memory
  pressure classifier with mitigation actions.

### Pricing baseline (carried from v3.8.9)
- DEX Personal $20/mo or $179/yr (save 25%)
- DEX Family $30/mo or $300/yr for up to 5 household members
- DEX Pro $40/mo or $379/yr (save 21%) — commercial use, live collab,
  priority support
- DEX Studio $60/seat/mo or $599/seat/yr — admin console, audit log
- Free Viewer stays free, forever, read-only after trial
- Lifetime tier remains retired; the `lifetime` billing period stays in
  the type system only for historical receipts

### Verification
- `node scripts/add-watermarks.js` — 1155 already canonical, 0 stamped, 0 migrated
- `npx tsc --noEmit` — 0 errors
- `npm test -- --run` — **1482 / 1482 passing across 73 test files**
- `npm run build` — clean, vite + tsc -p tsconfig.main.json both green

### v3.8.9 follow-up - pricing reset to $20 entry, lifetime retired (no version bump)

DEX moves to a Claude-style subscription ladder so the unit economics
actually cover hosting, sync, support, and continued development:

- **Starting price is now $20/mo** for DEX Personal ($179/yr, save 25%).
- **DEX Family** $30/mo or $300/yr for up to 5 household members.
- **DEX Pro** $40/mo or $379/yr (save 21%) -- commercial use, live
  collab, priority support.
- **DEX Studio** $60/seat/mo or $599/seat/yr -- admin console, audit
  log, 99.5% SLA.
- **Free Viewer** stays free, forever, read-only after trial.
- **Lifetime licences are retired for now.** All plans are subscription
  only. Existing lifetime holders keep what they bought; no new
  lifetime tier is offered. The `lifetime` billing period stays in
  the type system and Stripe glue so historical receipts render, but
  no `Plan.prices.lifetime` entries remain.
- All discount programs (student/educator 50%, non-profit 50%, OSS
  maintainer free Pro, switcher one free year of Personal) and the
  30-day trial / 14-day refund are unchanged.

### v3.8.9 follow-up - public copy refresh + pricing bump (no version bump)

Two non-code changes that keep the public surface honest and the unit
economics safe:

- **README rewritten as a short user-facing page.** The historical
  "What is new in 3.8.x / 3.8 / 3.7" wall was removed. The intro,
  "Why people use DEX", trial blurb, pricing table, install pointer,
  and a single link to this changelog are all that remain. No
  internals, no protocol names, no encryption ceremony in the
  README -- those still live in their own docs.
- **Pricing +30% across every tier** (rounded to clean retail).
  Personal $8.99/mo, $64/yr, $129 lifetime. Family $129/yr, $239
  lifetime. Pro $16.99/mo, $155/yr, $259 lifetime. Studio $32.99/seat
  monthly, $299/seat yearly. Free Viewer stays free. Updated in the
  single source of truth `src/shared/license/pricing.ts`, mirrored in
  `store/appstore.config.json`, `docs/PRICING.md`, and `README.md`.
  All discount programs (student / educator / non-profit / OSS /
  switcher) and the 30-day trial / 14-day refund stay exactly as
  before.

### v3.8.9 follow-up - polish + perf wave F (no version bump)

Two additive primitives so any DEX surface can opt into windowed rendering
or lazy-loaded apps without a refactor:

- `src/shared/perf/visibleRange.ts` exports `computeFixedRange`,
  `computeVariableRange` (binary-search prefix sums) and `scrollToIndex`
  with `start`/`center`/`end`/`auto` alignment. Pure math, no DOM, no
  React; consumers feed scrollTop / viewportHeight each frame and
  render only the resulting `[startIndex, endIndex]` window.
- `src/renderer/components/perf/LazyAppLoader.tsx` exports
  `withLazyApp(loader, { appId, fallbackVariant, bareFallback })` which
  pairs `React.lazy` with `Suspense` + the existing `ViewErrorBoundary`
  + `SkeletonPage` for one-line code splitting of any heavy app.
  `LazyAppLoadFailure` is the INTENTIONAL FALLBACK component callers
  can mount when the dynamic import itself rejects.

Coverage: 18 tests in `tests/unit/v389-perf-polish.test.tsx` (10 for
windowing, 5 for `scrollToIndex`, 3 for the lazy loader).

### v3.8.9 follow-up - settings surfaces wave E (no version bump)

`src/renderer/components/settings/` ships seven panes that wire up the
existing shared modules into a consistent macOS-style settings card. Each
pane is a stateless presentational component so the host (Settings.tsx)
keeps owning persisted state.

- `DevicesPane` lists `SessionStore` entries, surfacing trust + revoke
  actions and a "sign out other devices" shortcut.
- `ActivityPane` is a searchable view over `auditLog` with text + CSV
  export buttons that pipe `formatAuditAsText` / `formatAuditAsCsv`.
- `PluginsPane` shows installed plugins with their `CapabilityLedger`
  grants and per-capability revoke buttons.
- `MemoryPane` is a thin wrapper around the wave B `MemoryInspector`
  giving it the shell chrome.
- `AccessibilityPane` toggles contrast, colour-blind palette, density
  and reduced-motion using the existing `theme/accessibility` tokens.
- `StoragePane` renders the `summariseUsage` breakdown, suggestion list
  and largest-items list with per-category clean callbacks.
- `TrashAndVersionsPane` lists `trashBin` entries with restore/purge
  plus an optional `VersionedFile` history with rollback.

`SettingsPaneShell` provides the shared card layout and `formatBytes` /
`formatRelative` helpers used by every pane. Each pane is exported from
`src/renderer/components/settings/index.ts` for easy import.

Coverage: 32 tests in `tests/unit/v389-settings-surfaces.test.tsx`.

### v3.8.9 follow-up - Nexus uplift wave C (no version bump)

`src/shared/nexus/uplift.ts` adds five pure helper bundles that the Nexus
shell (or any visualization surface) can wire up without pulling in D3 or
React:

- `confidenceColor()` maps a UKI confidence score to a node tint that
  matches the trust palette (high/medium/low + unknown fallback).
- Time-scrub helpers (`snapshotRange`, `snapshotIndexAt`,
  `scrubberToIndex`) turn a sorted snapshot list into binary-search lookups
  so the timeline scrubber stays O(log n).
- Filter-chip predicate composer (`buildNodeFilter`, `applyNodeFilter`)
  combines category, confidence band and recency band with AND semantics
  so chips compose cleanly.
- 3D orbit camera math (`createOrbitCamera`, `orbitRotate`, `orbitZoom`,
  `cameraPosition`, `projectPoint`) is matrix-free and side-effect-free,
  ready for the Nexus 3D view without a heavy linear-algebra dep.
- Collab cursor LWW reducer (`createCursorMap`, `applyCursorUpdate`,
  `pruneStaleCursors`, `cursorsOnNode`) is replay-safe and idempotent so
  the existing P2P channel can drive presence badges without bespoke
  conflict logic.

Coverage: 39 tests in `tests/unit/v389-nexus-uplift.test.ts`.

### v3.8.9 follow-up - per-app UKI skills wave D (no version bump)

`src/shared/uki/appSkills.ts` registers 41 per-app skills across 11
creative apps, each scoped to its `appId` and namespaced
`<app>.<verb>` for safe registry merging:

- DexCode (5): explain, fix error, generate test, docstring, refactor
- Terminal (4): explain command, fix stderr, NL->command, search history
- Notes / DexNotes (4): rewrite tone, summarize, bulletize, semantic search
- Forge (4): suggest preset, dedup, watch folder, hash verify
- VINX (3): highlight reel, captions, smart cuts
- Prism (4): subject select, bg remove, color match, smart fill
- Flux (3): suggest animation, expression autocomplete, motion preset
- Imosion (4): mastering coach, stem separation, tempo/key, podcast cleanup
- AXL (3): parametric suggest, GD&T, standard parts
- Rewind (3): semantic search, daily review, pattern detect
- Gallery (4): auto-album, semantic search, duplicates, story

`loadAppSkillRegistry()` merges any subset (or all) into a single
`SkillRegistry` for the renderer to drive UKI with. Coverage: 23 tests in
`tests/unit/v389-uki-app-skills.test.ts`.

### v3.8.9 follow-up - UKI trust UI wave B (no version bump)

User-facing surfaces for the wave A brain landed under
`src/renderer/components/uki/`:

- `ConfidenceChip.tsx` - low/medium/high pill driven by `confidenceLabel`,
  numeric percent on hover, compact mode for chrome
- `CitationsPanel.tsx` - sources list that highlights citation indices
  actually present in the reply body, with optional click-through
- `PiiGuardDialog.tsx` - confirm-before-send dialog showing the original
  text, the redacted text, and every detected finding
- `MemoryInspector.tsx` - search + filter + forget + JSON export over a
  `MemoryStore`, tier tabs (all / short / working / long-term)
- `SkillPicker.tsx` - top-K matched skills for a typed intent with
  keyboard navigation; blocks skills that need missing context
- `StreamingResponse.tsx` - incremental render of an async `StreamReader`
  with done / error / toolCall callbacks

Coverage: 35 deterministic tests in
`tests/unit/v389-uki-trust-ui.test.tsx` (jsdom + @testing-library).

### v3.8.9 follow-up - UKI brain wave A (no version bump)

Foundation for smarter UKI behaviour landed as 7 pure shared modules under
`src/shared/uki/`:

- `planner.ts` - decompose goals into ordered ActionBus steps with deps,
  topological sort, plan validation
- `toolCall.ts` - typed JSON->dispatcher with schema validation, retry
  backoff, confidence floor and budget gate
- `memory.ts` - short / working / long-term memory store with substring
  recall, importance + recency scoring, prune + promote
- `embeddings.ts` - cosine-similarity index with top-k search (linear scan;
  later: native sqlite-vec)
- `skills.ts` - skill registry pairing intent matchers with plan templates;
  appId-scoped, context-aware ranking
- `streaming.ts` - async-iterator wrapper for token streams with map / tee /
  collectToolCalls helpers
- `appContext.ts` - per-app context resolver registry with bounded
  prompt-format helper

Coverage: 84 deterministic tests in `tests/unit/v389-uki-brain.test.ts`.

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

### v3.8.9 follow-up - UI surfaces (no version bump)

The three UI surfaces that the consolidation pass left for later have now
landed on the same `v3.8.9` line:

- **`PlanComparePanel`** (`src/renderer/components/account/PlanComparePanel.tsx`).
  Side-by-side plan grid driven entirely by `pricing.PLANS` and `proPerks.PRO_PERKS`.
  Inline SVG check / dash icons (no emojis), monthly / yearly toggle with savings
  callout, "Choose plan" Button per column, current-plan column shows a disabled
  "Current plan" pill. Wired into `AccountSettingsCard` so the inline compare
  panel is now the rich grid; host code can still override via `onComparePlans`.
- **`ConfirmDialog`** (`src/renderer/components/ConfirmDialog.tsx`). The
  in-app replacement for `window.confirm()`. Focus is moved to the primary
  button on open; Escape cancels, Enter confirms; backdrop dismiss is
  configurable; destructive variant uses the danger Button styling. Pure
  presentational, callers own the open state.
- **`RegistryCommandPalette`** (`src/renderer/components/RegistryCommandPalette.tsx`).
  Ctrl+K palette wired to the shared `commands/registry`. Distinct from the
  existing apps-and-themes `CommandPalette`; this one is fully data-driven so
  any subsystem that calls `registerCommand` shows up immediately. Up / Down
  / Enter / Escape keyboard support, disabled commands hidden, empty-state
  copy, group label rendered under each row.

`tests/unit/v389-followup-ui.test.tsx` adds **19 new tests** for these three
components. Total suite is now **992 tests** across **57 files**, all passing.
Watermark check, `tsc --noEmit`, and `npm run build` all clean.

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
