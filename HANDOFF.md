# DEX HANDOFF

Operational state of the DEX desktop platform. Update at the end of every session.

Current version: **4.60.5** · Branch: `main` · Last session: 2026-06-03 (next-gen phase, **13 slices**: Surface + Motion frameworks, dock excellence, project continuity bridge, UKI knowledge layer + operator, workflow templates, workload governor, comfort/a11y layer, **search & command unification, Nexus 2.0 memory-first model, Rewind memory timeline, and UKI operator→unified-search wiring** — **uncommitted, in working tree**; `tsc --noEmit` = 0, changed-area + new modules re-run green in isolation. See **HANDOFF-PREMIUM.md** next-gen section for the per-slice detail + the pending-UI-integration list.)

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

## Current Phase: Master Evolution — wave execution (see top blockquote + `docs/evolution/`)

The active phase is the Master Evolution wave work (batches 1–3 above). The prior **UI/UX
Modernization** phase below is **complete at the code level** (kept for reference) — its residue is
subjective visual taste that needs eyes-on the running app.

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
