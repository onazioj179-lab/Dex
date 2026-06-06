# DEX HANDOFF

Operational state of the DEX desktop platform. Update at the end of every session.

> **PRIVACY + MONETIZATION STANCE UPDATE (2026-06-06).** Owner direction: stop making absolute
> "never sell / no ads ever" promises so future ads, partners, and data-use are not contradicted.
> Removed those promises across README, docs/PRICING.md, LICENSE (data clause now points to the
> Privacy Policy), `shared/license/proPerks.ts` (ad-free reframed as a paid-plan perk), and
> `shared/license/pricing.ts`. New stance: **paid plans ad-free**; ads possible in the free tier /
> games; optional opt-in analytics; may share with service providers and partners incl. for
> advertising; **California Do-Not-Sell/Share opt-out + GDPR rights**. Added Advertising + Sharing +
> "Your Choices and Rights" sections to the canonical privacy text (in-app `shared/policyDocuments.ts`
> and root `PRIVACY.md`) and an advertising/commercial clause to terms; the older `docs/PRIVACY.md` /
> `docs/TERMS.md` now defer to the canonical Privacy Policy. Bumped policy version **2.0.0 -> 2.1.0**
> (effective 2026-06-06) in `shared/policies.ts`, which **forces re-consent** on the material change;
> updated the onboarding consent copy; updated `policies.test.ts` + `policyConsent.test.ts`. Removed
> stale pre-5.0 release-notes files. **DRAFT — needs counsel review before public release; deliberately
> does NOT declare a data "sale".** Verify: tsc=0, policy tests 11/11, watermark OK (2519).
>
> **REMOTE ULTRA-REVIEW FIXES (2026-06-06).** A cloud ultra code-review of the branch flagged 18
> candidates, confirmed 8, refuted 10. Triaged and fixed the 6 real ones; the 8th (`merged_bug_001`,
> "modules missing from working tree") is a **false positive vs. the local tree** — the review clones the
> *pushed* commit, which lacks our uncommitted new files (localInstall, envelopeGate, ReviewService,
> pages/store/*, tabReorder); they exist locally and tsc=0 proves it. It resolves when the branch is
> committed. Fixes:
> • **bug_003** (headline Magnify flow): `dex-codesign.cjs` `sign`/`validate` only accepted v1
>   `id`/`version`; a v2 `DexPkgManifestV2` (formatVersion 2, packageId/packageVersion) couldn't even be
>   signed. Added `id||packageId` / `version||packageVersion` fallbacks in `cmdSign`, `evaluateEnvelopeCli`,
>   `cmdVerify`, and `installLocalEnvelope`/`validateLocalFile`. **Smoke-tested end to end**: keygen → sign
>   v2 → verify → validate = STATUS approved.
> • **bug_013**: `installLocalEnvelope` wrote files before `requestCapabilities`; a denial left orphaned
>   bytes with no uninstall path. Reordered caps-consent BEFORE any disk write (matches planInstall).
> • **bug_006**: locally installing an app whose id matched a bundled coming-soon tile (e.g.
>   `dex.app.magnify`) then uninstalling permanently erased the bundled tile. Uninstall now restores the
>   bundled entry instead of removing it when one exists.
> • **bug_015**: `verifyPublisher` accepted any renderer-supplied `recognition` string (first-party badge
>   spoofing vector). Now whitelisted against `recognized|partner|first-party`. (Kept the recognition
>   param functional — the Developer panel legitimately uses it for local testing; barring renderer-set
>   first-party entirely is a product decision flagged for the owner.)
> • **bug_012** (introduced by this session's ghost-drag): the tab ref callback never deleted on unmount,
>   leaking detached nodes whose `getBoundingClientRect()` returned 0 and skewed the drop index. Ref now
>   deletes on null.
> • **bug_011** (nit): `evaluateEnvelopeCli` integrity was gated on `!!block`, so an unsigned envelope
>   printed a false "file hash mismatch". Integrity now stands on the bundle bytes alone.
> • **Verify:** `tsc --noEmit` = 0; codesign + store + tab suites 32/32 green; CLI v2 smoke test approved;
>   watermark OK (2519).
>
> **GALLERY SELECTION + RIGHT-CLICK REMOVE + SHORTCUTS (2026-06-06).** `src/renderer/pages/Gallery.tsx`
> already had selection mode, `batchDelete`/`batchExport`, a context menu, and lightbox keys — the gaps
> were that none of it was selection-aware or keyboard-driven. Added: (1) a unified `handleItemActivate`
> for grid + list items — Ctrl/Cmd-click toggles, Shift-click extends a range from the last anchor
> (`lastSelectedIndexRef`, indices resolved against `sortedMedia`), plain click opens; (2) a
> **selection-aware right-click menu** — right-clicking inside a multi-selection shows "Export N items" /
> "Clear selection" / "Delete N items" instead of single-item actions, and the single-item menu gained a
> Select/Deselect entry; (3) **grid-level shortcuts** — Ctrl/Cmd+A select-all, Delete/Backspace remove
> selection, Escape clear — all suppressed while the lightbox or a text input is focused so they never eat
> typing. `tsc --noEmit` = 0; touched logic suites 24/24 green; watermark OK (2519). UI interactions
> (drag, right-click) still want eyes-on in the running app.
>
> **CREATIVE ZOOM PARITY (2026-06-06, partial — creative-app cleanup slice).** Closed a real keyboard-zoom
> gap between the named creative apps. **Prism** (`DEXAPPLICATIONS/prism/Prism.tsx`) had wheel + button +
> slider zoom but NO keyboard shortcuts — added Ctrl/Cmd `=`/`+` (in), `-`/`_` (out), `0` (reset to 100%),
> matching its multiplicative wheel feel and `[10,500]` clamp. **Imosion** (`DEXAPPLICATIONS/imosion/
> Imosion.tsx`) had `+`/`-` zoom but no reset key — added Ctrl/Cmd `0` -> `setZoom(40)` (matches its 1:1
> button). `tsc --noEmit` = 0. **NOT done (needs eyes-on, intentionally not guessed):** removing empty
> visual placeholders, fixing control overlap, and icon/alignment in the creative apps — those are runtime-
> visual and unsafe to change blind in 6k-line working files. Grep confirmed the "placeholder" hits are
> legitimate input `placeholder=` attrs + backend engine stubs, not removable empty UI. Awaiting
> screenshots / specific pointers to continue safely.
>
> **GHOST DRAG-TO-PLACE TABS (2026-06-06, Phase 4 slice).** Reworked the App Tab Bar drag in
> `src/renderer/components/AppManager.tsx` from dragging the live element (jumpy "torn out" feel) to a
> ghost-drag: the dragged tab stays in the strip as a dimmed dashed placeholder that settles into the
> drop slot, while a lifted "ghost" copy follows the cursor (fixed-position, shadowed, scaled). Drop
> placement uses real measured tab centres (handles variable-width tabs) instead of a fixed 110px guess.
> • **Pure, tested math:** `src/shared/shell/tabReorder.ts` — `computeTabDropIndex(centers, draggingId,
>   pointerX)` (counts other tabs left of the pointer, ignoring the dragged tab's own slot), `moveTab`
>   (clamped relocate), `sameOrder` (skip no-op mid-drag state updates). 8 vitest cases
>   (`tests/unit/tab-reorder.test.ts`), all green. Order still persists to `localStorage['dex-tab-order']`.
> • **Verify:** `tsc --noEmit` = 0; tab-reorder 8/8 green; watermark OK (2519). Eyes-on the live drag
>   feel still needs the running Electron app (pointer drag can't be exercised headlessly); the placement
>   logic is proven by the unit tests. Window-level ghost tiling is NOT done yet — only the tab bar.
>
> **LOCAL APP INSTALL + FULL-PRODUCTION VALIDATION (2026-06-06).** Built the developer path to push a
> separately-built app (e.g. Magnify) into DEX locally and test the store install/uninstall loop, WITHOUT
> relaxing the gate. Owner directive: support all runtime kinds, full production gate (no unsigned bypass).
> • **The gap that existed:** install was remote-HTTPS-only (`fetch(bundleUrl)`), `unpack` was a stub that
>   wrote nothing runnable, and there was no path to validate/install a local file. A locally-submitted app
>   got `bundleUrl: ''` -> `isInstallable` false -> could never install.
> • **Pure, tested core** `src/shared/store/localInstall.ts` — `isSafeRelPath`/`planUnpack` (load-bearing
>   containment over the envelope's attacker-controlled file keys: rejects traversal/absolute/drive/backslash/
>   empty), `detectRuntime` (web vs native + entry, honours manifest then infers from index.html),
>   `canLocallyInstall` (approved-only = same strictness as publishing). +8 tests
>   (`tests/unit/store-local-install.test.ts`).
> • **Gate reuse without a cycle:** extracted `validateEnvelope` into `src/main/services/envelopeGate.ts`
>   (shared by PublishService + AppStoreService; PublishService re-exports for compat).
> • **Main** `AppStoreService`: `store:local:pick` (open dialog -> read .dexplug -> run FULL gate -> return
>   checklist), `store:local:validateFile`, `store:local:install` (re-runs the gate, then a REAL unpack to
>   `apps/<id>/<version>/` with double path-containment, routes declared caps through PermissionsService,
>   registers the install with `source:'local'` + `runtime`/`entry`, upserts a `local:true` catalog entry).
>   Uninstall now also drops the synthetic local catalog entry. Types extended in `catalog.ts`
>   (`InstalledApp.source/runtime/entry/bundleSha256`, `CatalogEntry.local`).
> • **UI** `src/renderer/pages/store/DeveloperPanel.tsx` (terminal button in the Store header): (1) Trust a
>   publisher key -> `store:publisher:verify` (adds it to the trust store), (2) Install from file -> shows the
>   gate's checklist verbatim (each block/warn check, pass/fail, detail) + status banner; Install enables only
>   when `approved`; trusting a key auto-re-validates the picked file.
> • **The Magnify loop (full production gate):** `node scripts/dex-codesign.cjs keygen` -> in DEX Store ->
>   Developer -> paste the PUBLIC KEY (Trust) -> `dex-codesign sign <magnifyDir>` (its `manifest.json` MUST be
>   a valid DexPkgManifestV2: formatVersion 2, reverse-DNS packageId, semver packageVersion/minRuntime,
>   capabilities/dependencies/signatures/deltas/categories arrays) -> Developer -> Choose the .dexplug ->
>   checklist shows approved -> Install.
> • **Honest limit:** install lays files down + records `runtime`(web|native)+`entry`, but actually LAUNCHING
>   an installed app is still Phase 6 (app-container runtime) — captured, not yet executed. Verify: `tsc`=0;
>   33 store tests green (incl. the codesign signature vector); watermark OK (2517); `vite build` green. The
>   real install flow uses Electron IPC + a native file dialog, so it must be exercised in the packaged app.
>
> **PHASE 3 — STOREFRONT UI + REVIEWS WIRED (2026-06-06).** Completed the Phase 3 "big one":
> the Apple-style DEX Store and the anti-fake review backend are now live end-to-end.
> • **Review backend un-orphaned:** `ReviewService` (store:review:list/submit/flag) existed but
>   `registerReviewIpc()` was never called. Wired it into `src/main/main.ts` next to the other Phase 3
>   host bridges. The `store:` channel prefix is already in the preload allowlist, so the renderer reaches it.
> • **Storefront UI rebuilt** (`src/renderer/pages/Store.tsx` + new `src/renderer/pages/store/*`): the
>   flat list became a two-surface storefront in DEX premium-glass —
>   - `storeKit.tsx` — IPC accessor, formatters, category labels, glass/button atoms, a fractional
>     `StarRating` (display + interactive), `AppIcon`, recognition/state badges, and the reusable `AppTile`.
>   - `StoreHome.tsx` — featured hero, horizontal category rails grouped by `StoreCategory`,
>     search-results grid, installed-only grid.
>   - `AppDetail.tsx` — hero with install/uninstall/plan, screenshot gallery (graceful placeholders),
>     full description, a "What this app can do" capability panel (sensitive caps flagged) via
>     `explainCapabilities`, a publisher card with the recognition badge, and the reviews section.
>   - `ReviewsPanel.tsx` — live `store:review:*`: visible-only average + 1-5 histogram, a count of
>     reviews held by integrity checks, a write-review form, and per-review report/flag.
> • **Integrity honesty:** the public average counts ONLY `visible` reviews (engine in
>   `shared/store/reviewIntegrity`), and a review the engine flags/hides is reported to the author as
>   "held for integrity review", never "posted" — the UI surfaces the held count rather than hiding it.
> • **Verify:** `tsc --noEmit` = 0; `vitest` store suites 16/16 green (review-integrity 8 + catalog 8);
>   watermark check OK (2513); `vite build` green (Store bundles cleanly). Eyes-on is NOT possible
>   headlessly — the Store needs `window.dex` IPC (absent in the browser preview), so the live
>   storefront must be verified in the packaged Electron app.
>
> **MEDIA DSP ENGINES WIRED + SILENCE DE-DUPLICATED (2026-06-05).** Finished and verified the
> ROADMAP-600 #198/#199/#233/#241 media slice: the shared, unit-tested DSP engines now drive real
> creative-app behaviour end-to-end, and the one duplicate silence path was folded onto the shared
> engine so there is a single source of truth.
> • **`src/shared/media/silenceTimeline.ts`** (new) — pure, deterministic frame math turning the
>   silence engine's "keep" regions into rippled NLE clip specs (`planSilenceClips`/`rippledLength`),
>   honouring clip speed (timeline = media / speed) and media in-point. No store/editor dependency,
>   so the correctness-critical seconds->media-frames->timeline-frames mapping is fully headless-testable.
> • **`src/renderer/services/media/decodeAudio.ts`** (new) — thin renderer-only Web Audio adapter:
>   `decodeAudioToMono(url)` (fetch -> `decodeAudioData` -> mono down-mix) + `slicePCM(...)`. Shared by
>   Vinx and Imosion; side-effect-free beyond the AudioContext it opens/closes.
> • **Vinx** (`handleVinxOp`) — `removeSilence`/`smartCuts` run **for real** against the timeline:
>   decode the clip's media -> `planSilenceRemoval` (shared DSP) -> `planSilenceClips` -> ripple-rebuild
>   the clip via `_removeClip`/`_addClip`. Honest skips when there is no media or no removable silence.
> • **Imosion** (`handleImosionOp`) — `detectTempoKey`/`detectBeats` run **for real** via the shared
>   `beatDetect` engine (decode -> `detectTempo`/`detectOnsets`, read-only). Other ops skip honestly
>   through `enginePendingApplier`.
> • **De-dup:** `src/renderer/DEXAPPLICATIONS/imosion/ImosionEditing.ts` `AudioEditingEngine.detectSilence`
>   no longer hand-rolls a peak-abs, channel-0 loop — it now delegates to the shared
>   `silenceDetect` engine (windowed-RMS / dBFS over a full mono down-mix). Public signature and
>   sample-index return shape are unchanged, so `stripSilence` and the `'silence'` slice mode keep
>   working; the swap is a deliberate quality upgrade. All ops already registered in `creativeActions.ts`.
> • **Verify:** `tsc --noEmit` = **0**. Media suites **17/17 green** (`silence-timeline` 4,
>   `silence-detect` 9, `beat-detect` 4). Full `vitest run` = **5536 passed / 7 skipped / 2 failed** —
>   the 2 failures (`codesign-gate`, `trust-store`) belong to a **separate, unrelated in-flight
>   code-signing feature** in the working tree (untracked `scripts/dex-codesign.cjs`,
>   `src/main/security/*`), not to this media work. The apps aren't launchable headlessly, so the
>   timeline-application logic is proven by the pure `silenceTimeline` unit tests.
>
> 🟢 **NL CREATIVE COMMAND BAR — #095 wired live (2026-06-05).** Closed the biggest "built but
> orphaned" gap: the whole NL→plan→op stack (executor + creativeActions + planSummary + confirmTier)
> existed and was unit-green but **nothing in the UI drove it**. Now it does, end-to-end, in a real app.
> • **`src/shared/uki/creativeCommand.ts`** — renderer-safe orchestrator: `buildCreativeCommand(goal)`
>   runs the side-effect-free NL→op dry run and returns `{understood, plan, ops, summary, mutates, tier}`
>   (preview #003 + confirm tier #018/#106); `applyCreativeCommand(ops, applier)` applies each op via a
>   host callback and returns a per-op report; `tierForOps` = strictest-wins gate.
>   **Correctness fix:** the planner scores a skill >0 when `requiredContext` is satisfied **even if the
>   intent didn't match**, so with `layerId` present *any* text produced a spurious op. Added an **intent
>   gate** — the bar only acts when the goal actually mentions a skill's intent, so it never invents an
>   action for unrelated text (anti-fake).
> • **`src/renderer/components/CreativeCommandBar.tsx`** — generic, host-agnostic command bar:
>   type a goal → plan preview (op list + mutate/read-only badges + tier banner) → Apply/Run/Cancel →
>   run report. Each creative app passes its `facts` (active layer/selection ids) + an `onApplyOp` that
>   mutates its own document. Glyph-free (respects the design-token emoji guard).
> • **Honest outcomes:** appliers may return a note (=applied), throw (=failed), or
>   `{outcome:'skipped'}` — engine-pending is NOT an error. `enginePendingApplier(label)` is the
>   reusable honest "needs the <app> engine" applier; the report headline shows applied/skipped/failed.
> • **Wired into ALL 5 creative apps:** **Prism** (top of the Adjustments panel, facts
>   `{layerId: selectedLayerId}`) runs `autoEnhance`/`colorGrade` **for real** via live, undoable
>   adjustment sliders (`pushHistory`) and marks AI-only ops `skipped` (no faking). **Vinx / Imosion /
>   Flux / Axl** each mount the bar (Axl inside its existing AI panel; the others as a top strip in the
>   app root) with best-effort facts (clip/track/layer/part ids) + `enginePendingApplier(<App>)` until
>   their engines land — real ops drop in per-op like Prism's.
> • **Tests:** `tests/unit/creative-command.test.ts` (12 — orchestrator + intent/tier gates + skipped
>   outcome + forbidden policy + `enginePendingApplier`) + `tests/unit/creative-command-bar.test.tsx`
>   (3, full jsdom UI flow: plan→confirm→apply→report, honest-failure, not-understood). **All green.**
>   `tsc --noEmit` = **0**; watermarks canonical (2471); `renderer-pages`/`app-shell` suites still green
>   (no regression from the 5 app edits). The apps aren't launchable headlessly (no `window.dex`), so the
>   UI flow is proven by the RTL component test, not a screenshot.
>
> 🗺️ **ROADMAP-600 + UKI CONTROL/MEDIA WIRING (2026-06-05).** Authored **`ROADMAP-600.md`** (repo
> root) — 600 numbered, prioritized features: §1 UKI & Creative intelligence (400, incl. a 70-item
> NL creative-control group benchmarked vs Photoshop/Premiere/Ableton/AE/Cursor), §2 Platform
> (150: shell, terminal, DexCode, Dev Mode, microservices, Nexus, plugins), §3 Sound/Video I/O (50).
> Single source of truth; status tags `[have]/[partial]/[missing]` + P0/P1/P2.
> **First wiring slice landed (all unit-tested, `tsc --noEmit` = 0):**
> • **UKI action executor** `src/shared/uki/actionExecutor.ts` — pure executor binding skill
> `actionId`→handler with dependsOn/retries/optional + `{{var}}` interpolation, UndoLog-compatible
> trail, `runGoal()` (decompose→execute). Closes the gap where `appSkills.ts` declared skills but
> nothing ran them.
> • **Creative action handlers** `src/shared/uki/creativeActions.ts` — 53 creative ops
> (prism/vinx/imosion/flux/axl) emitting pure `CreativeOp{app,op,params,mutates}` descriptors.
> • **+36 NL creative-control skills** in `shared/uki/appSkills.ts` (registry 41→**77**).
> • **Sound I/O** `src/renderer/services/media/AudioPlaybackService.ts` — Web Audio playback OUT
> (ctx→gain→analyser, `dbToGain` from `shared/audio/dsp`) + mic capture IN (MediaRecorder→Blob) +
> level meter.
> • **Video I/O** `shared/video/pipeline.ts` — pure `planExport()` (in-app WebM vs native MP4/ProRes
> descriptor) + `probeFromMetadata()` import probe.
> • **Nexus live ingest** `shared/nexus/ingest.ts` — pure ContextBus-event→`NexusModel` mapper
> (upsert + contains/in links + co-occurrence) so the graph fills live.
> **+30 vitest tests** (`action-executor`, `creative-actions`, `video-io`, `nexus-ingest`).
>
> **LIVE WIRING LANDED (same session) — #094/#502/#551-552/#571-572 (tsc=0, +6 tests):**
> • **#094** `UkiCreativeOperator.dispatchCreativeOp()` maps a `CreativeOp`→whitelisted action
> type→IPC channel (op name in payload, confidence gate + audit). `main/uki/creativeRunner.ts`
> `runCreativeGoal(goal, invoker)` = full NL→decompose→execute→dispatch path.
> • **#502** `renderer/services/nexus/nexusLiveStore.ts` — `installNexusIngest()` subscribes
> ContextBus (project/file/note/app/asset) → `ingestEvent`, back-fills from the replay ring;
> mounted from `standalone/Nexus.tsx`.
> • **#551-552** `AudioPlaybackService` is now an app singleton (`getAudioPlaybackService`); the
> Audio page syncs master volume into it. (Audio.tsx HTMLAudioElement player + ImosionRecording
> MediaRecorder already provide working playback/capture; the service is the shared primitive.)
> • **#571-572** Vinx `ExportDialog` routes codec/mime/bitrate/engine through shared `planExport`
> (in-app WebM path; MP4/MOV flagged as native fallback).
> **+6 tests** (`creative-runner`, `nexus-live-store`). Tests: `tests/unit/{action-executor,
> creative-actions,video-io,nexus-ingest,creative-runner,nexus-live-store}.test.ts`.
>
> **ROADMAP P0/P1 BATCHES 2-3 (same session, +28 tests, tsc=0):**
> • **#001** `shared/uki/agentLoop.ts` — iterative think→act→observe over the executor w/ fact
> scratchpad + `next`/`reduceFacts` hooks + iteration budget.
> • **#003/#049** `shared/uki/planSummary.ts` — `summarizePlan` (preview) + `summarizeResult` + counts.
> • **#010/#011/#021** `shared/uki/budget.ts` — cost/latency/token guard (`charge`/`checkBudget`/`wouldExceed`).
> • **#555** `shared/audio/levelMeter.ts` (peak/RMS/LUFS/true-peak + clip latch + peak-hold) wired into
> `AudioPlaybackService.meter()`. **#559** loop region (`setLoop`/`clearLoop`).
> • **#577** `video/pipeline.planThumbnails` (segment-centred frames+timecodes). **#135** `planSmartTrim`.
> • **#592/#598/#600** `shared/media/jobQueue.ts` — priority queue w/ progress/cancel/history/counts.
> Tests: `tests/unit/{agent-loop,plan-summary,budget,level-meter,job-queue}.test.ts` + extended `video-io`.
>
> **ROADMAP BATCH 4 (same session, +11 tests, tsc=0):** `shared/uki/resultCache.ts` (#041 LRU+TTL
> +`hashKey`), `shared/uki/confirmTier.ts` (#018/#106 auto/confirm/forbidden + policy),
> `shared/media/avSync.ts` (#591 offset cross-corr + drift slope + correctedTime),
> `shared/uki/contextPack.ts` (#028 greedy token-budget packer). Tests:
> `tests/unit/{result-cache,confirm-tier,av-sync,context-pack}.test.ts`.
>
> **Session totals:** ROADMAP-600 authored + **~33 roadmap items implemented** across **21 new
> modules** + 6 wired app files, **86 new tests** (16 files). Full suite green; `tsc --noEmit`=0.
>
> 🛠️ **ENGINE + UI PATCH (same session).**
> **Native (C++, real benchmarks via g++ 15.2 AVX2):** `src/native/dex-cpp/src/ringbuffer.h`
> (lock-free SPSC, 0-alloc/0-lock, cache-line-split atomics) + `audio_kernels.h` (SIMD
> `applyGain`/`mixAccumulate`/`peakAbs`, AVX2/SSE2/NEON + scalar fallback) + `bench/audio_bench.cpp`.
> **Measured:** applyGain **6.66×**, mixAccumulate **5.40×**, 256-frame DSP **112.9 ns/block**,
> ring buffer **19.4 ns/item** under 2-thread contention, SIMD==scalar PASS → `ENGINE_BENCHMARKS.md`.
> C ABI contract + latency budgets → `docs/NATIVE_ABI.md` (audio ≤5ms, video ≤16.67ms @60fps).
> **UI:** single canonical `src/renderer/styles/design-tokens.css` (system font stack, no-bounce
> motion 150–220ms, hairline, focus ring, 16/20/24 icons, tabular nums, frameless titlebar/sidebar/
> panel primitives, vibrancy) loaded last in `main.tsx`; mirrored in `tokens.ts` (`fontStack`/`motion`/
> `hairline`/`focusRing`). Removed the one real dingbat (`✓` in AiProviderSettings). Reports:
> `UI_GAP_REPORT.md` (9 gaps closed). Guard test `tests/unit/design-tokens.test.ts` (5, green). tsc=0.

Current version: **4.60.5** · Branch: `main` · Last session: 2026-06-03 (next-gen phase, **13 slices**: Surface + Motion frameworks, dock excellence, project continuity bridge, UKI knowledge layer + operator, workflow templates, workload governor, comfort/a11y layer, **search & command unification, Nexus 2.0 memory-first model, Rewind memory timeline, and UKI operator→unified-search wiring** — **uncommitted, in working tree**; `tsc --noEmit` = 0, changed-area + new modules re-run green in isolation. See **HANDOFF-PREMIUM.md** next-gen section for the per-slice detail + the pending-UI-integration list.)

> 🎨 **WORKSPACE REDESIGN — GOAL-6D foundations (2026-06-05).** Owner pasted the "Workspace &
> Navigation Redesign" spec; it's ~90% visual (needs eyes-on — headless can't verify the look).
> Captured as **`GOAL-6D-WORKSPACE-REDESIGN.md`** + built the **testable logic foundations** across its
> sections (all green, on PR #7 / branch `feat/dex-6.0-tauri-native-engines`):
> • **Reduced glass** (design tokens, `design-system.css`): `--blur-*` −60%, `--glass-opacity-*` −50%
> transparency, `--pg-shadow-*` −40% (cascades; the ~247 hardcoded inline blurs are a follow-up
> consolidation pass).
> • **UKI 3.0** `shared/uki/contextEngine.ts` — live project/file/workspace/task + activity → summarize().
> • **Dock 2.0** `shared/dock/appCategories.ts` — auto creative/dev/comm/utility grouping.
> • **Linked windows** `shared/workspace/windowLinks.ts` (link graph) + `linkedLayout.ts` (smart-expansion tiling).
> • **Plugin system** `shared/plugins/manifest.ts` — manifest validation.
> • **Onboarding** `shared/onboarding/redesignFlow.ts` — 6-step <3min flow.
> • **Integrations** `shared/integrations/registry.ts` — GitHub/Figma/Slack/Gmail/Drive/Notion framework.
> • **Project-centered** `shared/project/projectModel.ts` — a project bundles notes/files/workflows/etc.
> **+35 vitest tests.** These are the LOGIC; the **UI wiring + purely-visual sections (window chrome,
> layouts, dock rendering, creative apps, dev-mode UI, design-system consolidation) need eyes-on** on the
> running app. The foundation modules are **not yet wired into the renderer** — adopt incrementally.
>
> 🦀 **TAURI MIGRATION STARTED (2026-06-05) — owner approved "full Tauri".** Scope reality: the
> renderer drives the whole backend through `window.dex.<ns>.<method>()` / `window.electron.invoke`,
> all funnelling through `ipcRenderer.invoke('<ns>:<method>', ...)` — **~2,369 `ipcMain` handlers across
> 200+ files** (main.ts 276, SecurityController 82, WorkflowController 62…). So "full Tauri" =
> re-implementing the entire backend in Rust: a long, phased migration with **Electron staying the
> shipping product** until parity. Done this session:
> • **Tooling + feasibility:** installed `@tauri-apps/cli` 2.11 + `@tauri-apps/api`; `tauri info` shows
> WebView2 present. **Tauri builds on the GNU toolchain here** — debug `cargo build` of `src-tauri`
> compiled the full stack (tauri/wry/webview2-com) → runnable `dex-tauri.exe`, **no MSVC/VS Build Tools
> required**. v2 config completed: `withGlobalTauri:true`, window `label:"main"`, `capabilities/default.json`.
> • **IPC compatibility bridge (the migration seam):** `src/renderer/services/platform/tauriCompat.ts`
> installs a Proxy-based `window.dex`/`window.electron` that routes EVERY `<ns>:<method>` call to one
> native command **`dex_ipc(channel, args)`** (`src-tauri/src/main.rs`); unported channels return `null`
> for a graceful degraded boot (same as the browser preview). `installTauriCompat()` is wired first in
> `main.tsx` — **no-op under Electron** (shipping app untouched). `tsc` = 0.
> • **Installer WORKS:** `npm run build:tauri` produces **`DEX_6.0.0_x64-setup.exe` (NSIS, 3.8 MB)** +
> `DEX_6.0.0_x64_en-US.msi` (5.9 MB) in `src-tauri/target/release/bundle/` — ~40x smaller than
> Electron's ~150 MB (uses the system WebView2). The first failure was only the one-time WiX/NSIS
> toolset download (cached now). The installers embed the renderer WITH the bridge.
> • **Subsystems ported (native `dex_ipc` handlers — owner said "do them all, you drive"):**
> **window controls** (min/max→toggle/close/hide → Tauri window API); **Files** full read+write —
> `files:list` (real `std::fs` dir listing via Tauri path resolver, matching the Electron shape
> `{success,path,files:[{name,path,isDirectory,size,modified,extension}]}`) + `rename`/`move`
> (cross-volume copy+remove fallback)/`copy`/`delete`/`mkdir`; **System** via `sysinfo` —
> `getStatus`/`getProcesses`/`killProcess` (+ `power:getStats`,`power:closeProcess`); **Shell**
> `openPath`/`openExternal` via the `open` crate; **OS** `lockScreen` (shutdown/restart/sleep DEFERRED
> for safety until GUI-tested — avoids an accidental shutdown). **Everything else returns `null` →
> graceful degrade** (and most renderer state is localStorage, which works natively under WebView2).
> Crates added to `src-tauri`: `sysinfo`, `open`. Debug build green (3m21s); `tsc`=0, watermark OK (2412).
> Raw Rust `std::fs`/`sysinfo` aren't gated by Tauri permissions, so these work without fs/plugin perms.
> • **+5 more batches (2026-06-05):** (1) **clipboard** (`arboard`) — `clipboard:writeText/readText`,
> `vault:copyToClipboard`; (2) **persistent KV store** — `capability:storage`/`storage` get/set → JSON
> in the app config dir; (3) **reveal/open** — `fileIntel:revealInExplorer`/`openFile`,
> `shell:showItemInFolder`, `media:openWithSystem` (explorer `/select` + `open` crate); (4)
> **health/diagnostics** — `health:check`/`getStatus`, `watchdog:health`, `diagnostics:getSystemInfo`;
> (5) **app data locations** — `app:getPath`, `data:getLocations`. Crate `arboard` added. Debug build
> green (1m08s). Owner directive: "do them all, sharp, work multiple, update HANDOFF every ~5 batches."
> • **Wave 2 (+5 batches, 2026-06-05) — real file search/recent without an index yet:** (6)
> **`files:search`/`fileSearch:search`/`search:query`** — bounded recursive filename search (cap 8k
> files, skips hidden/`node_modules`/recycle so it can't hang the worker thread); (7) **`files:recent`/
> `fileIntel:getRecentFiles`** — walks Documents/Desktop/Downloads, sorts by mtime; (8) **scopes** —
> `files:getScopes`/`fileSearch:getScopes` (kv-backed, defaults to user dirs); (9) **diagnostics/crash**
> — `diagnostics:getPerformance` (sysinfo), `getLogs`/`crashReporter:*` empties; (10) **connectivity** —
> `connection:isOnline`/`networkHygiene:isOnline`. Debug build green (11s). **~10 subsystems / ~40
> channels ported.** Remaining = heavy engines only (vault crypto, Tantivy search index, audio DSP,
> automation/agent VMs, transfer protocols) — each a real multi-session project; all degrade gracefully
> meanwhile. A native search **index** would replace the bounded walk for big trees.
> • **🔐 VAULT ENGINE (GOAL-6B, 2026-06-05) — first heavy engine done, 100/100:** new tested Rust crate
> **`core/dex-vault`** — Argon2id KDF + AES-256-GCM (`crypto.rs`), RFC-6238 TOTP + base32 + otpauth parse
> (`totp.rs`), password generate/strength (`password.rs`), and `VaultManager` in `lib.rs` (create/unlock/
> lock, credential + authenticator CRUD, search, export/import with a SEPARATE password, change-master).
> **14 cargo tests green** incl. the RFC-6238 TOTP vector (`287082`), crypto round-trip + wrong-password
> rejection, full vault round-trip, export/import, master-change. Wired into `dex_ipc` via a Tauri-managed
> `Mutex<VaultManager>` — **all ~28 `vault:*` channels**. Vault file at `app_config_dir/vault.dex`; key
> only in memory while unlocked. Core workspace `cargo test` green (smart-router 10 + vault 14 = 24).
> Crates: `aes-gcm`,`argon2`,`hmac`,`sha1`,`rand`,`base64`.
> • **Wave B (2026-06-05) — breadth:** `files:trash`/`shell:trashItem`/`fileIntel:moveToTrash` → recycle
> bin (`trash` crate, safe delete); `os:getInfo`/`system:getInfo` (platform/arch/cores/mem/hostname);
> `app:getName`; `system:getDiskUsage` (sysinfo disks). Debug build green (4m14s). **Net: ~16 subsystems
> / ~70 channels ported + the Vault crypto engine.** Next heavy engine = native **search index (Tantivy)**
> — same A-style deep build as the Vault. Remaining heavy: audio, automation/agents, transfer.
> • **🔎 SEARCH INDEX (GOAL-6A, 2026-06-05) — Tantivy engine built + tested:** new crate
> **`core/dex-search`** — Tantivy full-text file index with an **edge-ngram tokenizer** for prefix search
> ("budg" → "budget.pdf"); `open_or_create`/`index_path`(bounded walk)/`clear`/`count`/`search` →
> `FileHit{path,name,extension,type,modified,size,score}`. **2 cargo tests green** (index+prefix, clear).
> Wired into `dex_ipc`: `search:query`/`files:search`/`fileSearch:search` prefer the index + fall back to
> the bounded walk when empty; `search:rebuild`/`fileSearch:reindex` build from the user doc dirs;
> `search:getStats`; managed `Mutex<Option<SearchIndex>>` in setup. **The src-tauri build with Tantivy is
> green (debug 5m52s) — the index is live in the shell.** Core workspace cargo test now **26**
> (smart-router 10 + vault 14 + search 2).
> • **🔗 DUAL-SHELL BLEND (2026-06-05):** affirmed + sharpened the Electron+Tauri model — one renderer,
> both shells, `detectShell()`-selected; Electron = full backend, Tauri = native-where-ported + graceful.
> New `services/platform/capabilities.ts` (`getCapabilities`/`hasNative`/`TAURI_NATIVE_SUBSYSTEMS`) +
> re-export from `platform/index.ts` so the UI is operable-everywhere-aware. `tsc`=0. See
> `docs/TAURI-MIGRATION.md` → "Dual-shell blend". (You can't fuse the two runtimes into one binary; this
> is one codebase → two shells, which is the real, working "blend".)
> • **🧩 CAPABILITY UI WIRING (B, 2026-06-05):** `useCapabilities()` hook + reusable
> **`DesktopFeatureNotice`** component (`components/DesktopFeatureNotice.tsx`) — renders a calm "runs in
> the full desktop app" notice for unported features under Tauri, and a no-op passthrough under Electron
> (so it's safe to wrap any feature); plus a "Running on {shell}" indicator in the AI Providers panel.
> **4 vitest tests** for the capability logic across web/electron/tauri (`tests/unit/capabilities.test.ts`,
> 58 passing in the AI+capability subset). `tsc`=0, watermark OK (2416), Electron build green.
> • **🔊 AUDIO ANALYSIS ENGINE (GOAL-6C, 2026-06-05) — third engine, 100/100:** new crate
> **`core/dex-audio`** — Symphonia `metadata()` (duration/sampleRate/channels + title/artist/album tags)
> + `waveform(path, buckets)` (full decode → mono-mix → downsampled peak amplitudes in [0,1]). Codecs:
> wav/pcm/mp3/flac/ogg/aac/m4a. **3 cargo tests green** (metadata + waveform exercised against a
> programmatically-generated WAV, no fixture; + downsample bounds). Wired into `dex_ipc`:
> `audio:getMetadata`/`audio:getInfo` → metadata; `audio:getWaveform`/`audio:getPeaks`/`media:getWaveform`
> → peaks. Capability list + test updated (`audio` now native; `automation` is the not-yet-ported
> example). **Playback (a real output sink) is intentionally OUT of scope** — device-dependent +
> untestable headlessly; analysis is the verified core.
> • **⚙️ AUTOMATION + 🔁 SCANNER ENGINES (GOAL-6C/6A, 2026-06-05):** `core/dex-automation` — workflow
> execution (setVar/transform/concat/condition/log over a context with `${var}` interpolation; unknown
> steps skipped; conditions gate the run) → `{success,context,log,stepsRun}`, **4 cargo tests**; wired
> `automation:run`/`workflow:executeNew` (id-based `workflow:execute`/`automations:execute` need a native
> store → graceful). `core/dex-scanner` — duplicate detection (size-group → streaming SHA-256), **3 cargo
> tests**; wired `fileIntel:findDuplicates`. `automation` added to the capability native list (`transfer`
> is now the not-yet-ported example). **Core workspace cargo test now 36** (smart-router 10 + vault 14 +
> search 2 + audio 3 + automation 4 + scanner 3). **Five native engines done** (Vault, Search, Audio,
> Automation, Scanner); remaining heavy: transfer (network) + audio playback (device).
> **Next:** owner tests via `npm run dev:tauri` (live renderer + bridge; window buttons work; other
> backend returns null until ported). Then port IPC subsystems — NOTE **localStorage-based state already
> works under WebView2** (keystore, modelPrefs, perf tier, onboarding, most prefs), so only the
> IPC-backed features need porting: Files (Tauri fs), universal search, system/processes, vault, audio,
> notifications, transfer. Port order should follow what the Home/shell touch first.
>
> 🩹 **UI + PERF FIXES (2026-06-05) — owner-reported glitches from live screenshots.**
> • **Spotlight bleed-through (Home):** the embedded results dropdown was 64% opaque AND the
> `HomeWidgets` layer (clock) painted over it (it renders as a later sibling inside the
> `zIndex:2` scroll context). Fixed: dropdown is now near-opaque (`rgba(18,18,22,0.97)`) in
> `shell/SpotlightSearch.tsx`; the home variant dispatches `dex-home-search-active` and
> `pages/Home.tsx` fades + click-disables the widget layer while results are open (clear stacking
> fix, fully reversible). **Verified live** (preview, low tier): dropdown bg opaque, `backdrop-filter:none`,
> widget layer `opacity:0`, no console errors.
> • **🔴 LOW-TIER PERF BUG (also fixes bleed-through on budget PCs):** `globals.css`
> `html[data-perf-tier="low"] [style*="backdrop"], [style*="blur"]` was **forcing
> `backdrop-filter: blur(10px) !important` on EVERY glass panel** — directly contradicting the
> `TierManager` low preset (`enableBackdropFilter:false`) and a major compositor load on exactly the
> machines that overload/crash. Changed to **`backdrop-filter: none !important`** + opaque
> `rgba(20,20,22,0.95)`. Budget/low-tier hardware now gets flat, readable, cheap panels. (Owner is on a
> budget PC reporting overload — this is a direct win; the broader timer-swarm/blur audit is still open.)
> • **Settings doubled window chrome:** a maximized detached app rendered its **own** titlebar
> (min/max/close) under the global shell bar + tab = triple chrome. Fixed in `components/AppManager.tsx`:
> the floating titlebar is hidden when `isMaximized` (chromeless full-screen app); **double-click the
> app's tab** toggles maximize/restore (`tileWindow(id,'maximize')` is a toggle) so a maximized app is
> never stranded. Compiles + app renders clean in the preview; **needs eyes-on the real Electron app**
> (the Settings page can't render in the headless browser preview — it needs `window.dex`).
> • **Green:** `tsc --noEmit` = 0; **watermark gate restored** — `node scripts/add-watermarks.js`
> stamped **156** previously-unstamped files (mostly pre-existing `tests/unit/*.test.ts` + the 2 new
> Smart-Router tests), so `npm run lint` (tsc + watermark `--check`) is green again (2411 in compliance).
> Full `vitest run --maxWorkers=2` + `npm run build` were run to confirm the CI test+build jobs.
>
> 🚀 **DEX 6.0 KICKOFF (2026-06-04) — Tauri migration decided; Native Core + Smart Router first slice.**
> Direction (owner-approved): treat DEX as the operating layer above Win/macOS/Linux; **migrate to
> Tauri** as a long-horizon, additive track (Electron stays the shipping product); roadmap covers all
> pillars. Three 6.0 phase files added — **`GOAL-6A-NATIVE-CORE.md`** (Tauri + Rust `core/` + perf
> targets), **`GOAL-6B-INTELLIGENCE.md`** (UKI 2.0 Smart Router + Memory Graph + Agents),
> **`GOAL-6C-PLATFORM.md`** (Workflows/Marketplace/Creative/Cloud/SDK/Visual). The leading-edge slice
> of 6A+6B shipped this session:
>
> • **Smart Router (UKI 2.0), TS — lands in today's Electron app.** New pure modules
> `src/shared/uki/modelProfiles.ts` (cost/latency/intelligence catalog keyed to the provider model
> ids) + `src/shared/uki/smartRouter.ts` (`classifyTask`, `routeModels`, `fanOutModels`; goals
> Auto/Cheapest/Fastest/Smartest/Offline). Wired into `uki/providers/connect.ts`: new
> `configuredCandidates`/`routeConfiguredModels`; `askConfiguredLLM` now runs the ranked list through
> `chatWithFallback` (degrades pick→pick), `streamConfiguredLLM` streams the top pick; routing goal
> stored in `modelPrefs.ts` (`get/setRoutingGoal`, default `auto`). UI: `AiProviderSettings.tsx` gains
> a **Routing** selector + a routing-aware active-model banner. **54 unit tests green** (new
> `smart-router`/`model-profiles` + extended `ai-connect`; **the 32 prior ai-connect tests still pass
> — no regression**). `tsc --noEmit` = **0**.
>
> 🦀 • **Native core proven in Rust.** New Cargo workspace **`core/`** with `dex-smart-router` — a
> **parity port** of the TS router (`core/dex-smart-router/src/lib.rs`), **`cargo test` = 10/10 green**;
> plus scaffold crates `dex-search`/`dex-rewind`/`dex-scanner`/`dex-ai-runtime` (workspace compiles).
> This extends the `contenthash.rs` TS→Rust precedent and is the load-bearing proof of the migration.
>
> 🪟 • **Tauri shell + platform bridge (additive, does not touch `src/main`).** `src-tauri/`
> (Cargo.toml/build.rs/tauri.conf.json/main.rs) loads the **existing Vite renderer** and exposes
> `smart_router_route` (backed by the crate). New seam `src/renderer/services/platform/index.ts`
> (`detectShell`, `smartRouterRoute`) dispatches to the native command under Tauri, else the TS path —
> proving the Electron↔Tauri seam with one channel. `package.json`: `dev:tauri`/`build:tauri` scripts +
> `@tauri-apps/api`/`@tauri-apps/cli` deps; `.gitignore` updated for `core/target`, `src-tauri/target`.
> **Deferred (network-heavy, NOT run here):** `npm install` (fetch Tauri CLI/api) + first
> `npm run dev:tauri` (downloads the `tauri` crate) to boot the shell. The Rust logic is `cargo test`-
> verified regardless; the rest of the `window.dex` IPC surface migrates behind the bridge in later 6A.
>
> 🤖 **AI-PROVIDER FRAMEWORK (2026-06-04) — biggest roadmap gap, now built + tested.** UKI had
> **zero** LLM integration; this is the full framework under `src/renderer/uki/providers/` +
> `uki/keystore.ts`: a provider contract (`types.ts`, `LLMProvider` with pure
> build-request/parse-response/parse-stream split for testability), **5 providers** —
> **OpenAI** (`openai.ts`), **Anthropic** (`anthropic.ts`, hoists system → `system` field, x-api-key),
> **Google Gemini** (`google.ts`, `?key=` + `system_instruction`, "model" role), **Ollama** local
> (`ollama.ts`, no key, NDJSON), **OpenRouter** (`openrouter.ts`, OpenAI-compatible aggregator) — a
> model `registry.ts` (lookup + capabilities), a `keystore.ts` (per-provider keys, obfuscated — OS
> keychain/`crypto.rs` replaces it in Electron), and an `orchestrator.ts` (`chat`/`chatWithFallback`,
> **injectable `fetch`** so it's fully testable), plus a **streaming reader** (`stream.ts` —
> SSE + NDJSON with partial-line buffering across chunks). **28 unit tests green**
> (`ai-providers`/`ai-providers-extra`/`ai-keystore`/`ai-orchestrator`/`ai-stream`). **Feature-complete:**
> providers · registry · keystore · orchestrator · fallback · streaming. Fully buildable+testable
> here; **going live needs only a user API key.**
>
> ✅ **AI-PROVIDER UI WIRING (2026-06-04, live-verified) — the framework is now usable from Settings.**
> New `src/renderer/components/AiProviderSettings.tsx` — a self-contained panel that lists every
> provider from `registry.allProviders()` and, for each key-requiring one, a password key input +
> Save/Remove backed by the `keystore` (`getApiKey`/`setApiKey`/`removeApiKey`), a live "Connected"
> dot, and the provider's model list; Ollama shows "local · no key". Mounted into `Settings.tsx` with
> a one-line additive change: new **`AI Providers`** section under the **Intelligence** category
> (`ids: ['uki','aiproviders']`) + render `case 'aiproviders'`. **Verified live in the Vite preview:**
> Settings → AI Providers renders OpenAI/Anthropic/Google/Ollama/OpenRouter with **4 key inputs**
> (the 4 key-requiring providers); `tsc --noEmit` = **0 errors**. A user can now paste a key and it
> persists.
>
> ✅ **UKI → LLM WIRING (2026-06-04) — the assistant now talks to the configured provider.**
> New `src/renderer/uki/providers/connect.ts` bridges the framework to UKI's chat surface:
> `pickConfiguredModelId(configured)` (pure — priority openai→anthropic→google→openrouter→ollama,
> returns that provider's default model), `hasConfiguredProvider()` (reads the keystore), and
> `askConfiguredLLM(userText, systemPrompt, {history, fetchImpl})` (builds system+history+user
> messages, runs `orchestrator.chat`, returns text or **null on any failure so UKI never hard-fails**).
> Wired into `UkiOverlay.tsx`: in the free-form fallback (after the structured slash/app/system/web
> routes), **if a provider key is configured** it builds a `buildSystemPrompt` context + the last 4
> turns and calls `askConfiguredLLM`; on success it streams the real LLM reply, else it degrades to
> the existing local-AI/HuggingFace fallback. **10 new unit tests green** (`ai-connect` — pure model
> selection, keystore-gated `hasConfiguredProvider`, and end-to-end `askConfiguredLLM` via injectable
> fetch incl. system+history ordering and graceful HTTP-failure/empty degradation). `tsc` = **0**;
> live app re-renders clean after HMR (no Vite error). **End-to-end path is now closed:** paste a key
> in Settings → AI Providers, ask UKI a free-form question → it routes to that provider. (Structured
> commands still answer instantly/offline; only un-routed free-form questions escalate to the LLM.)
>
> ✅ **UKI LLM STREAMING (2026-06-04) — replies now token-stream live instead of arriving whole.**
> Added `streamConfiguredLLM(text, systemPrompt, onToken, {history, streamFetch})` to `connect.ts`:
> builds the request with `stream:true`, reads the response body as an async iterable of chunks (a
> `defaultStreamFetch` wraps real `fetch` + `ReadableStream.getReader()`/`TextDecoder`; injectable for
> tests), and drives the existing **`createStreamParser`** with the right wire format per provider
> (`STREAM_FORMAT`: OpenAI/Anthropic/Google/OpenRouter = SSE, Ollama = NDJSON) — so partial JSON lines
> split across network chunks are buffered/reassembled correctly. To avoid the previous fake-typewriter
> double-animation, `UkiOverlay`'s finalize logic was **extracted into a shared `commitTurn()`**
> (history + UKI memory + pattern learning + Nexus feed + optional TTS); the typewriter path and the
> new live-stream path both call it. UKI's LLM branch now sets `streamingResponse` straight from the
> network tokens as they arrive, then `commitTurn`s on completion (degrades to the local/HF fallback on
> failure). **+5 streaming unit tests** (15 total in `ai-connect`): SSE token stream, **chunk-boundary
> reassembly**, no-provider/null, non-ok response, and **Ollama NDJSON local (keyless)**. `tsc` = **0**;
> live app re-renders clean after the refactor.
>
> ✅ **PER-PROVIDER MODEL PICKER (2026-06-04, live-verified) — choose the model, not just the key.**
> New pure `src/renderer/uki/providers/modelPrefs.ts` (`get/set/clearPreferredModel` over localStorage).
> `pickConfiguredModelId` now takes an injectable `prefFor` resolver (defaults to the real store): it
> uses the user's preferred model when set **and still valid**, else the provider's default — so a
> stale/removed model id can never wedge selection. The AI Providers panel gained a per-provider model
> `<select>` (persists on change via `setPreferredModel`). **+6 unit tests** (21 total in `ai-connect`):
> prefs round-trip/clear/empty-clears, and pref honored / invalid-falls-back / unset-falls-back /
> reads-real-store. `tsc` = **0**. **Live-verified:** Settings → AI Providers shows **5 model dropdowns**
> with the right options (OpenAI/Anthropic/Google/Ollama/OpenRouter), and changing OpenAI → "GPT-4o mini"
> persists to `localStorage['dex-uki-model-openai']`.
>
> ✅ **ACTIVE-MODEL BANNER (2026-06-04, live-verified) — the AI panel now tells you what UKI will use.**
> The AI Providers panel shows a status banner computed from the live keystore via
> `pickConfiguredModelId(configuredProviders())` → `findModel`: when a provider is connected it reads
> **"UKI will use {model} · {provider}"** (green), otherwise **"No AI provider connected — paste a key…"**
> (and notes structured commands still work without a key). Reactive: saving/removing a key re-renders it.
> `tsc` = **0**. **Live-verified both states:** empty shows the connect prompt; after saving an Anthropic
> key through the UI the banner flips to "UKI will use Claude 3.5 Sonnet · Anthropic". This exercises the
> real selection logic end-to-end in the browser. Remaining AI niceties (optional): cancel-in-flight;
> tool-call/function execution from `toolCall.ts`.
>
> 🔄 **SYNC-ENGINE CORE (2026-06-04) — second "needs-runtime" item, built + tested as pure logic.**
> `src/shared/sync/`: **`lww.ts`** — Last-Writer-Wins CRDT register + map (deterministic conflict
> resolution: timestamp wins, ties by actor id; tombstone deletes; **merge is commutative/associative
> → two offline devices always converge** regardless of merge order); **`syncQueue.ts`** — immutable
> offline op queue that **coalesces** repeated edits to the same (entity,key), drains oldest-first,
> and removes on ack. **9 unit tests green** (`sync-lww`/`sync-queue`). This is the conflict-free
> data layer; the only missing piece is a **network transport** (the bytes-mover), which is a
> later, runtime/backend concern.
>
> 🦀 **NATIVE RUST EXPANSION (2026-06-04) — toolchain IS present here (cargo/rustc 1.95).** Added
> `src/native/dex-core/src/contenthash.rs` — FNV-1a 32/64-bit + `content_hash_hex` for native asset
> de-dup (mirrors the TS `assetHash.ts`; far faster over large file buffers), with `#[cfg(test)]`
> tests (incl. known FNV-1a vectors) and a `#[napi] content_hash` export wired in `lib.rs`. Verified
> with **`cargo test`** (not just Electron — `cargo`/`rustc` are installed, so Rust logic builds +
> tests here; only the addon *runtime load* needs Electron). This proves the TS→Rust perf-migration
> path is doable from here.
>
> 🟢 **UX FIXES (2026-06-04, live preview, owner-reported) — popup blur + dock aggressiveness.**
> (1) **Popups no longer blur the whole screen.** Removed full-screen `backdrop-filter: blur(...)`
> from every modal/popup scrim — kept a dim scrim only (standard desktop behaviour, also cheaper):
> `.modal-backdrop` (`design-system.css`), `ShareDialog.tsx`, `HelpOverlay.tsx`, and the
> notification-center backdrop (`NotificationBanners.tsx`). Panel/menu glass (Spotlight/UKI cards,
> dropdowns) left intact — that's the card's own material, not a whole-screen haze. Verified live:
> `.modal-backdrop` computed `backdropFilter: none`. (2) **Dock stops popping up while you work.**
> The bottom reveal hover-intent was a 140ms/0.45px-ms gate → too eager near the bottom of an app;
> raised to **280ms dwell / 0.35px-ms** in `AppManager.tsx` so only a deliberate move-to-edge-and-
> rest reveals it. (3) **Left-strip "glitchy" slide smoothed:** the StageManager left-edge strip
> (`StageManager.tsx`) slides in via `translateX`+opacity but wasn't on its own GPU layer — added
> `will-change: transform, opacity` + slightly longer easing (0.12s→0.2s) so it glides instead of
> snapping/flickering. (Owner: confirm whether that was "the glitch" — it was described loosely.)
> All three verified: `tsc` = 0, live app renders clean, `.modal-backdrop` computed `none`.
>
> 🔴 **CRITICAL FIX (2026-06-04, live preview) — app-blocking CSS bug.**
> `src/renderer/styles/design-system.css:347` had a CSS comment containing the motion-token
> names `window-*/workspace-*/dock-*/panel-*`; the `*/` inside `window-*/` **prematurely closed the
> `/* */` comment**, turning the rest of the file into invalid CSS — Vite/Lightning-CSS threw
> `Unexpected token Delim('*')` and **the entire renderer failed to mount** (blank screen behind a
> Vite error overlay). Fixed (commas instead of slashes). **Verified live:** the renderer now boots
> in the Vite preview (`[DEX] Startup complete`), onboarding → Home shell renders. **Command-palette
> unified search verified end-to-end live (via `preview_eval`):** calc `12 * (3 + 4)` → "= 84";
> unit `5 km to mi` → "= 3.106856 mi"; app-find `prism` → "Open PRISM Image Editor". **Integrity
> note (corrected after reading the component):** those results come from `CommandPalette.tsx`'s
> *own inline* `tryEvalMath`/`tryUnitConvert`/static `commands` list + `fuzzyScore` — **NOT** this
> session's `createUnifiedSearch`/`calcProvider`/`searchProviders`, which remain **orphaned w.r.t.
> this UI** (a real dedup/integration target: replace the inline logic with the shared modules).
> **✅ FIRST real module→UI integration done + verified live:** wired `services/searchScope.ts`
> (`parseSearchScope`) into `CommandPalette.tsx` so **scoped queries filter by category** —
> verified live: `in:settings` → only the Settings group (no apps); `in:apps prism` → only
> "Open PRISM" (no settings leak); plain `prism` unchanged. `searchScope` is no longer orphaned;
> the same pattern wires the other shared modules into their UIs. **Scope→category mapping extracted
> to a tested module** `services/commandScope.ts` (`scopedQuery`) with **5 unit tests**
> (`tests/unit/command-scope.test.ts`); CommandPalette now imports it (behaviour-preserving,
> re-verified live).
> **✅ + Recent commands** (completes the palette's previously-unused `recent` category): executed
> commands are recorded via `runCommand` and surfaced as a "Recent" group when the box opens empty
> (deduped from the normal groups). Verified live: seeding recents → palette shows "RECENT · Toggle
> Fullscreen · Toggle Theme" on top. (Gotcha fixed: the filter memo needed `recentIds` in state +
> deps to recompute on each open.) **Store extracted to a tested shared module**
> `services/recentCommands.ts` (move-to-front, dedupe, cap, corrupt-storage-safe) with **7 unit
> tests** (`tests/unit/recent-commands.test.ts`) — so the feature is at the same tested bar as the
> rest. Behaviour-preserving (re-verified live after the extraction).
> Also: `openApp`→`launchApp` is a renderer-side zustand store (not IPC), so app windows *do* open
> in-browser; "nexus" didn't open only because **Nexus isn't in the palette's command list**.
> **Degraded-mode boundary (honest):** the browser preview has **no `window.dex` IPC**, so
> **app-launch** (Enter on an app result does nothing — goes through the Electron window registry)
> and **data screens** (Nexus/Rewind/Files render empty states) **cannot be verified here** — they
> need the packaged Electron app. Also `preview_screenshot` times out on the canvas/CSS wallpaper
> animation → verify via `preview_eval` DOM reads. Onboarding is a multi-step consent wizard
> (Get Started → policies "Read" + checkbox → Accept → skip sign-in); no single localStorage skip flag.
>
> **Master Evolution phase — wave execution started (2026-06-04).** Strategy docs live in
> **`docs/evolution/`** (README + a catalog of grounded improvements across 11 of 14 categories so
> far + the wave sequence) — this is the backlog source of truth. **Wave-1/2 code shipped this
> session (real + tested, uncommitted):** Canvas now uses the shared bounded `GlobalUndoManager`
> (first adopter; killed its O(n²) unbounded stroke stack) + gained redo (+ `redo` DexIcon);
> configurable autosave (`utils/autosavePrefs.ts` → shared `useAutoSave`); UKI operator
> `searchEnvironment()` + `search` intent; Rewind timeline session-summary (`buildTimeline` now
> load-bearing in `Rewind.tsx`); shared `SnapshotHistory` engine (`shared/creative/history.ts`);
> Nexus memory model (`shared/nexus/model.ts`); shortcut-conflict detection
> (`utils/shortcutConflicts.ts`); asset content-hash + dedup (`services/assetHash.ts`); and a
> calculator/unit-conversion search provider (`services/calcProvider.ts`, wired into
> `createUnifiedSearch`). Three batches landed: **batch 2** — Nexus memory-view selector
> (`shared/nexus/views.ts`), Rewind activity analytics (`shared/rewind/analytics.ts`),
> recent-searches store (`services/recentSearches.ts`), notification priority/grouping/coalesce
> (`shared/notifications/group.ts`); **batch 3** — output filename tokens
> (`shared/creative/namingTokens.ts`), search-scope parser (`services/searchScope.ts`), shared
> bytes/duration/relative-time formatters (`shared/format/units.ts`); **batch 4** — Rewind workspace reconstruction
> (`shared/rewind/reconstruct.ts`), named workspace layouts (`services/workspaceLayouts.ts`),
> usage-based search re-ranking (`services/searchRecency.ts`); **batch 5** — prompt secret/PII
> redaction (`shared/uki/redact.ts`), color/WCAG-contrast utils (`shared/creative/colorUtils.ts`),
> compact number formatters (`shared/format/numbers.ts`), Rewind retention policy
> (`shared/rewind/retention.ts`); **batch 6** — glob matcher (`shared/automation/glob.ts`),
> LLM context-window fitting (`shared/uki/contextFit.ts`), video timecode
> (`shared/format/timecode.ts`); **batch 7** — aspect-ratio fit math
> (`shared/creative/aspectRatio.ts`), search match-highlighting (`shared/search/highlight.ts`),
> Nexus entity search (`shared/nexus/entitySearch.ts`); **batch 8** — recurring schedule
> (`shared/automation/schedule.ts`), audio gain utils (`shared/creative/audioUtils.ts`), file-type
> categorization (`shared/format/fileType.ts`); **batch 9** — cubic-bezier easing
> (`shared/creative/bezier.ts`), source citations (`shared/uki/citation.ts`), activity streaks
> (`shared/rewind/streak.ts`); **batch 10** — audio waveform peaks (`shared/creative/waveform.ts`),
> image histogram (`shared/creative/histogram.ts`), list/copy formatting (`shared/format/list.ts`);
> **batch 11** — cross-platform path utils (`shared/format/pathUtils.ts`), timeline/grid snapping
> (`shared/creative/snap.ts`), search synonym expansion (`shared/search/synonyms.ts`);
> **batch 12** — 2D affine matrix (`shared/creative/matrix2d.ts`), sentence splitting
> (`shared/uki/sentences.ts`), duration parsing (`shared/format/durationParse.ts`);
> **batch 13** — color blend modes (`shared/creative/colorBlend.ts`), CSV parse/stringify
> (`shared/format/csv.ts`), exponential backoff (`shared/automation/backoff.ts`);
> **batch 14** — keyframe interpolation (`shared/creative/keyframe.ts`), token-bucket rate limit
> (`shared/automation/rateLimit.ts`), text stats/reading-time (`shared/format/wordCount.ts`);
> **batch 15** — tempo/BPM math (`shared/creative/bpm.ts`), automation condition rules
> (`shared/automation/condition.ts`), search tokenizer (`shared/search/tokenize.ts`);
> **batch 16** — Levenshtein/typo similarity (`shared/search/levenshtein.ts`), Nexus graph
> pathfinding (`shared/nexus/pathfind.ts`), grid layout math (`shared/creative/gridLayout.ts`);
> **batch 17** — JSON extraction from LLM text (`shared/uki/jsonExtract.ts`), markdown→plaintext
> (`shared/uki/markdownStrip.ts`), color harmony hues (`shared/creative/colorHarmony.ts`);
> **batch 18** — natural sort (`shared/format/naturalSort.ts`), Nexus degree-centrality
> (`shared/nexus/centrality.ts`), prompt builder (`shared/uki/promptBuilder.ts`);
> **batch 19** — slash-command parsing (`shared/uki/slashCommands.ts`), palette quantization
> (`shared/creative/paletteQuantize.ts`), name initials/avatar hue (`shared/format/initials.ts`);
> **batch 20** — middle/path truncation (`shared/format/truncateMiddle.ts`), focus score
> (`shared/rewind/focusScore.ts`), zoom-level stepping (`shared/creative/zoomLevels.ts`);
> **batch 21** — core math utils (`shared/math/num.ts`), BM25 ranking (`shared/search/bm25.ts`),
> Nexus neighborhood subgraph (`shared/nexus/subgraph.ts`);
> **batch 22** — search-result snippets (`shared/search/snippet.ts`), hotkey display formatting
> (`shared/format/hotkey.ts`), color scale/gradient (`shared/creative/colorScale.ts`);
> **batch 23** — line diff (`shared/uki/diffLines.ts`), byte-size parsing (`shared/format/byteParse.ts`),
> video safe-areas (`shared/creative/safeArea.ts`);
> **batch 24** — cron parsing/matching (`shared/automation/cron.ts`), search-result grouping
> (`shared/search/groupResults.ts`), per-app usage time (`shared/rewind/appUsage.ts`);
> **batch 25** — tool-arg schema validation (`shared/uki/jsonSchema.ts`), pure transform pipeline
> (`shared/automation/pipeline.ts`), relative date bucketing (`shared/format/dateBucket.ts`);
> **batch 26** — SSE stream parsing (`shared/uki/sseParse.ts`), activity heatmap
> (`shared/rewind/heatmap.ts`), input validators (`shared/format/validate.ts`);
> **batch 27** — autocomplete suggest (`shared/search/suggest.ts`), tag clustering
> (`shared/nexus/clusterByTag.ts`), frame-rate math (`shared/creative/fps.ts`);
> **batch 28** — named easing presets (`shared/creative/easingNamed.ts`), Nexus model
> (de)serialization (`shared/nexus/serialize.ts`), Rewind day summary (`shared/rewind/daySummary.ts`);
> **batch 29** — percentage helpers (`shared/format/percent.ts`), 2D bezier path sampling
> (`shared/creative/curveSample.ts`), step state machine (`shared/automation/stepMachine.ts`);
> **batch 30** — provider message merge (`shared/uki/mergeMessages.ts`), Nexus orphan detection
> (`shared/nexus/orphans.ts`), ordinal numbers (`shared/format/ordinal.ts`);
> **batch 31** — slugify (`shared/format/slugify.ts`), Rewind day→markdown export
> (`shared/rewind/exportMarkdown.ts`), Nexus recent entities (`shared/nexus/recentEntities.ts`);
> **batch 32** — readable text color (`shared/creative/textOnColor.ts`), harmony palettes
> (`shared/creative/harmonyColors.ts`), color shade adjust (`shared/creative/colorShade.ts`);
> **batch 33** — 2D vector math (`shared/math/vec2.ts`), rectangle math (`shared/math/rect.ts`),
> angle math (`shared/math/angle.ts`);
> **batch 34** — text case (`shared/text/titleCase.ts`), n-gram similarity (`shared/search/ngram.ts`),
> descriptive stats (`shared/math/stats.ts`);
> **batch 35** — markdown code extraction (`shared/uki/extractCode.ts`), immutable priority queue
> (`shared/automation/queue.ts`), extended easings (`shared/creative/easingExtra.ts`);
> **batch 36** — word wrap (`shared/text/wordWrap.ts`), Nexus graph stats (`shared/nexus/graphStats.ts`),
> Rewind week summary (`shared/rewind/weekSummary.ts`);
> **batch 37** — bounding boxes (`shared/math/bbox.ts`), mention/tag/link extraction
> (`shared/uki/mentions.ts`), search score blending (`shared/search/scoreCombine.ts`);
> **batch 38** — diacritics/search-normalize (`shared/text/diacritics.ts`), abbreviation match
> (`shared/search/abbreviation.ts`), hour-of-day histogram (`shared/rewind/hourHistogram.ts`);
> **batch 39** — Nexus tag index (`shared/nexus/tagIndex.ts`), color temperature
> (`shared/creative/colorTemperature.ts`), key-value/frontmatter parse (`shared/uki/keyValueParse.ts`);
> **batch 40 (integration aggregators — "Shared Intelligence Layer")** — Rewind insights service
> (`shared/rewind/insights.ts`, composes timeline/usage/histogram/focus/streak), Nexus dashboard
> view-model (`shared/nexus/dashboard.ts`, composes views/centrality/tags/graph-stats), document
> ranking pipeline (`shared/search/rankDocuments.ts`, composes tokenize/BM25/recency);
> **batch 41 (more aggregators)** — accent→theme generator (`shared/creative/themeFromColor.ts`,
> composes colorShade/textOnColor), note→graph auto-linker (`shared/nexus/linkFromText.ts`,
> composes mentions+model), in-memory BM25 `SearchIndex` (`shared/search/searchIndex.ts`, the
> pure-logic Search Engine core / JS fallback before native fts.rs);
> **batch 42 (more aggregators)** — deterministic key→color (`shared/creative/projectColors.ts`,
> composes nameHue+colorUtils), autocomplete/type-ahead (`shared/search/autocomplete.ts`, composes
> abbreviation+ngram), Rewind daily-report markdown (`shared/rewind/dailyReport.ts`, composes
> insights+formatters).
> **~135 modules/wirings, +651 new tests** (2.7× the original 50-module target; +`search/facets.ts`
> started, tsc-clean, test pending). **Pivoted from leaf utilities to integration aggregators**, then
> to **live preview integration** (found+fixed the critical CSS bug above; verified the calc provider
> live).
> Verified: `tsc --noEmit` = 0 (all batches incl. facets); **clean authoritative seal — batches
> 1–42 = 5212 passed / 0 failed / 7 skipped (395 files)** via **`--maxWorkers=2`** (the proven flake
> fix: **0 flakes** vs 2–9 at higher worker counts).
> **Test-infra (catalog INF-065/066): adopt `--maxWorkers=2` as the default** (bake into
> `vitest.config`/CI) — the forks pool times out starting runners under high parallelism.
> NOTE: run `tsc` and the full suite *separately* — concurrently they induce fork-startup-timeout
> flakiness (a prior run showed 6 false failures at 654s; all passed on isolated re-run).
> Run `tsc` and the full suite separately. Remaining heavy items (Nexus memory sidebar UI, AI-provider framework, native
> Rust/C++ expansion, sync engine) stay in the `docs/evolution/` catalog backlog — they need the
> running app / dedicated builds and were deliberately NOT faked.
>
> See **HANDOFF-PREMIUM.md** for the premium UI/UX phase: overheat fix (thermal-hot universal backdrop-filter kill), dock full-width reveal fix, fluid-glass refinement, and the **🆕 Next-Generation phase** section (2026-06-03) detailing the Surface/Motion frameworks, dock running-indicators + anchored persistence, the `.dexproject` ↔ WorkspaceSnapshot continuity bridge, and the extended UKI `uki-core-data` (troubleshooting + architecture knowledge). v4.60.5 tagged to trigger an unsigned release build; the release workflow auto-prunes old releases to newest 3.

### Release Artifacts per Platform
| Platform | Artifacts |
|---|---|
| Windows | NSIS installer (x64 + ARM64) · Portable exe (x64) · ZIP (x64) |
| macOS | DMG (x64 + ARM64) · ZIP (x64 + ARM64) |
| Linux | AppImage (x64) · DEB (x64) · RPM (x64) |

Release mechanism: bump `package.json` version → commit → push tag `vX.Y.Z` → GitHub Actions release workflow builds + publishes. Auto-update reads the GitHub provider in `package.json build.publish` (`onazioj179-lab/Dex`).

---

## Current Phase: DEX 6.0 — Native Core + Smart Router (GOAL-6A/6B kickoff; see top blockquote)

The active phase is **DEX 6.0** (see `GOAL-6A/6B/6C-*.md` + the top blockquote): a Tauri migration as
an additive track, with the Smart Router (UKI 2.0) as the first shipped slice. The earlier **Master
Evolution** wave work and the prior **UI/UX Modernization** phase below are kept for reference (the
latter is complete at the code level; its residue is subjective visual taste that needs eyes-on the
running app).

### Prior phase — UI/UX Modernization (modern · sharp · pro · fluid glass) — code-complete

Goal: a more modern, sharp, "pro" feel across the shell and apps — thin/sharp icons, fluid (liquid) glass where it fits, consistent surfaces, no missing/inconsistent styling — while scaling cleanly from low- to high-end machines. Improve *in place* (replace/refine existing components); not a drag-to-rearrange system.

### IMPORTANT — these systems already exist and are wired. Build on them; do not reinvent.

| System | Where | What it does |
|---|---|---|
| **Device perf tier** (low/mid/high/ultra) | `src/renderer/services/TierManager.ts` | Single source of truth for the **visual** tier. Detects hardware on **first launch** (`getHardwareSummary` — cores, RAM, GPU renderer string via WebGL), **persists to localStorage**, applies `data-perf-tier` + CSS vars (`--blur-intensity`, `--glass-opacity`, motion durations). `initializeTier()` is called in `App.tsx:147`. Re-detection does not happen every launch — stored tier is reused (your "detect once in the background, then just read it"). |
| **Adaptive perf monitor** | `src/renderer/services/AdaptivePerfMonitor.ts` | Downgrades/upgrades the live visual tier when the system is hot/busy; restores on idle. |
| **Compute tier** (separate, backend selection) | `src/main/compute/PerfTier.ts` | Main-process classification (ultra-low…workstation) for WebGPU/ONNX-quant/worker-count/path-tracing presets. Distinct purpose from the visual tier — not a duplicate. NOT IPC-wired to the renderer (compute subsystems consume it directly). |
| **Fluid / "liquid" glass** | `src/renderer/styles/glassMenu.ts` + `shellPreferencesStore.ts` | `GlassMode = 'off' | 'reduced' | 'normal' | 'liquid'`. `adaptiveBlur()` scales blur+saturation by tier and `data-glass-effective-mode`. `applyGlassVars()` sets `--dex-glass-effective-mode` + `data-glass-mode`/`data-glass-effective-mode` on root. Low tier → backdrop-filter off. |
| **Perf-tier CSS** | `src/renderer/styles/design-system.css` (~line 2572+) | `html[data-perf-tier="low"]` strips blur/shadows/transitions; full effects on high/ultra. |
| **Design tokens** | `design-system.css` | Comprehensive: `--color-*`, `--space-1..20`, `--radius-xs..2xl`, `--blur-sm..xl`, `--pg-shadow-*`, full `--z-*` ladder, glass/gloss tokens. Refining core tokens cascades app-wide. |
| **Icons** | `src/renderer/components/DexIcon.tsx` | `<DexIcon name size strokeWidth=1.5 />` — already thin/sharp by default. |

### Changed this session (safe, cascade-level, perf-tier-aware)
- `src/renderer/styles/design-system.css` — modernized the core fluid-glass utilities (`.dex-glass-panel`, `.dex-frosted`): higher backdrop saturation, **token-based hairline border** (`--color-border-glass` instead of a hardcoded rgba — consistency), and a 1px inner top highlight (`--pg-gloss-top`) for crisp modern depth. Low tier still strips these automatically.

### Modernization audit — every item investigated this session (not deferred)
Each "redesign" candidate was opened and checked against the real code. Findings:
1. **Glass-surface consistency** — ✅ already consistent. Grep of shell chrome for opaque one-off panel backgrounds found **none** (only one intentional notification-badge red). Shell surfaces already route through the glass tokens / `adaptiveBlur`. Core `.dex-glass-panel`/`.dex-frosted` modernized this session (token border + inner highlight).
2. **Icon thin/sharp** — ✅ already correct. DexIcon defaults to `strokeWidth=1.5`. The inline SVGs that *look* heavy (sw 2.5–3.5) are on **tiny** icons (7–13px) in a 24-unit viewBox, so they render at ≈0.9–1.5px *actual* — correctly tuned for crispness at small sizes. Forcing them to 1.5 would render ≈0.6px (faint/blurry), i.e. a regression. No change warranted.
3. **Token radii/shadows** — radii are already tight (xs 3 → 2xl 12). Tightening further or re-weighting `--pg-shadow-*` is subjective taste with app-wide blast radius; doing it blind risks regressing a tuned look (over-doing). Needs a before/after screenshot pass with the user.
4. **Density (Spotlight/Stage/Imosion)** — purely subjective spacing taste; no concrete defect found. Needs user direction on the live app.
5. **`liquid` glass default on high/ultra** — evaluated; rejected. `normal` is already a full 22px-blur glass; `liquid` (30px) is marginal, would override a user's deliberate `normal` choice, and can't be visually confirmed here. Available in Settings for users who want it.

Net: the **code-level** modernization is complete (glass consistent + modernized, icons correctly thin, perf scaling wired). What genuinely remains is **subjective visual taste** that needs eyes on the running app — share a screen (Dock / Spotlight / a creative app) and it's a quick contained pass.

---

## Test / Build Status
| Item | State |
|---|---|
| TypeScript | Clean (`tsc --noEmit`, renderer + main). |
| Unit tests | **5212 passed / 0 failed / 7 skipped** (395 files) on Windows, via `--maxWorkers=2` (0 flakes). |
| Production build | `npm run build` (vite renderer + main tsc) — **passing** (exit 0). Release-buildable. |
| Watermarks | In compliance (`npm run watermark:check`). |

> **Test-infra note:** the default `vitest run` (full fork parallelism) intermittently fails
> ~7 tests on this machine with `[vitest-pool]: Timeout starting forks runner` — a fork
> **startup** timeout under load, not a logic failure (it falsely marks whole files "failed").
> Run with **`npx vitest run --maxWorkers=4`** for a reliable green (4942 passed, ~6–11 min — run it
> alone; a concurrent `tsc` induces fork-startup-timeout flakiness).

---

## Stability / Release — externally blocked (cannot be done from the codebase)
- **Windows code signing** 🔒 *user action*: set `CSC_LINK` + `CSC_KEY_PASSWORD` repo secrets (Settings → Secrets → Actions). Until then builds ship **unsigned** (Defender warns).
- **ARM64 Windows installer** 🔒 *hardware*: build target exists; validate on real ARM64.
- **Multi-monitor focus / memory-pressure CSS / crash-recovery / long-session heap** 🔒 *runtime*: need the packaged app on real hardware. WorkspaceSnapshot load path was code-reviewed + hardened (skips malformed files).

---

## Prior phase (sessions 1–4): production stabilization — COMPLETE
All code-actionable items from the stabilization backlog were resolved. Highlights:
- Windows test suite 31 failures → 0 (powerMonitor guard, `path.posix.basename`, platform-agnostic fixtures, ToastProvider wrap).
- Invalid `var()`+hex-alpha CSS bug fixed (NotificationBanners, Vinx) via `color-mix`.
- Z-index ladder alignment (Spotlight→`--z-spotlight`, StageManager→`--z-stage-manager`, Vinx ctx menu→`--z-context-menu`).
- Long-session leak caps: NotificationBanners `recentTitlesRef`, Imosion `decodedBuffersRef` (FIFO 48).
- WorkerPool suspend-on-minimize + fixed no-op `pause()` stub.
- Dead-code removal: `CollaborationLayer.ts`, `notificationStore.ts`.
- Deferred with documented reasons: achievementsCatalog async lazy-load (race risk for 40ms), Prism ImageData pooling (Canvas-2D allocates), Imosion decode chunking (`decodeAudioData` no streaming variant).

---

## Important Development Rules (updated 2026-06-03 — relaxed per owner direction)
- **Full latitude**: free to add, change, or remove anything to move the phases forward. Prefer
  reusing/extending mature systems (perf-tier, glass, ContextBus, WorkspaceSnapshot) when it's the
  sharp choice, but adding focused new modules is fine where the roadmap genuinely needs them. No
  need to refactor everything.
- **Sharp, not placeholder**: every line should do real work. Quality bar is high ("100/100").
- Visual changes still benefit from eyes-on iteration; keep blind visual changes token-level and
  perf-tier-aware (the universal low-tier + thermal-hot rules already gate blur/shadow/motion).
- Always keep `tsc --noEmit` = 0 and `vitest run` green before declaring a slice done. Windows is
  the primary platform.
- Always update this HANDOFF at the end of a working session.
- **Hard rule (only one): never `git commit` or `git push` without an explicit go-ahead.** Work
  stays in the local working tree until then.
