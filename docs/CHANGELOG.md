# Changelog

All notable changes to DEX will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file documents the **current release only**. For the full history of
prior releases, see the git tag history (`git tag --list`) and the GitHub
Releases page. Older changelog entries were trimmed in v3.8.9 to keep the
public document short and focused on what has actually shipped to users now.

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
