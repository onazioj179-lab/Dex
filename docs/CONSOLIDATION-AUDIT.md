# DEX 6.0 Consolidation Audit — Duplicate Systems Kill-List

> Produced 2026-06-10 for the Refinement & Consolidation initiative
> ([REFINEMENT.md](REFINEMENT.md), P1/P9: no parallel systems, no duplicate
> functionality). Every finding is backed by at least two pieces of evidence.
> Survivor recommendations weight the Tauri migration's preference for
> Rust-native cores ([TAURI-MIGRATION.md](TAURI-MIGRATION.md)). Before retiring
> any loser, confirm with the degrade report / real usage that the survivor
> covers the hits.
>
> Status note: finding 7 (radius scales) was partially resolved the same day —
> the canonical scale is now `--radius-*` in design-system.css, with
> `--dex-radius-*` aliased to it, the index.html boot fallbacks matched, and
> tailwind bound to the vars. The remaining work there is the literal sweep and
> the `tokens.ts` JS mirror.

Ordered by impact (performance + maintenance burden).

---

## 1. Duplicate SEARCH INDEXING — at least 6 indexers over the same content

Systems involved:
- `src/main/core/FileSearchIndexer.ts:8` — "File Search Indexer ... Indexes user-approved folders" (JS, DataStore-backed).
- `src/main/core/FullTextIndexManager.ts:9` — "FTS5 virtual table for universal full-text search with BM25 ranking" (SQLite).
- `src/main/core/GlobalContentSearch.ts:9` — "Searches across all DEX content sources in parallel" (own worker + DatabaseManager).
- `src/main/core/UniversalSearchHub.ts:9` — "One search box finds everything: files, apps, notes, media, actions."
- `src/main/core/TrustworthySearch.ts:8` and `SearchCorrectness.ts:9` — two more independent ranking/caching search engines.
- `core/dex-search/src/lib.rs:5` — Tantivy native full-text file index (the migration's intended survivor).
- `src/renderer/services/UnifiedSearchService.ts:9`, `src/renderer/shell/SpotlightEngine.ts:9`, `src/renderer/workers/searchIndexer.worker.ts:9`, `src/shared/search/searchIndex.ts` + `src/shared/search/SearchOrchestrator.ts:8` — renderer-side indexes and a separate orchestrator.

Evidence: six distinct main-process search engines, three of them building their own indexes; `SearchController.ts:16` imports `getFileSearchIndexer`, confirming it is wired. The renderer adds `UnifiedSearchService`, `SpotlightEngine` ("Adaptive search index with learning"), and a `searchIndexer.worker.ts` building another in-thread index; `shared/search/SearchOrchestrator.ts` admits "every search surface ... Existing implementations register themselves" and is "additive" — layered on top of, not replacing, the others.

Survivor: `core/dex-search` (Tantivy) for file/content indexing, fronted by the single `SearchOrchestrator` facade in the renderer. Retire `FileSearchIndexer`, `FullTextIndexManager`, `GlobalContentSearch`, `UniversalSearchHub`, `TrustworthySearch`, `SearchCorrectness`, and the `searchIndexer.worker.ts` index. `SpotlightEngine` should query the orchestrator, not maintain its own index.

Risk: high (many IPC channels and UI surfaces; do it provider-by-provider behind the orchestrator).

## 2. Triple NOTIFICATION system (storage + UI duplicated 3-4x)

Systems involved:
- `src/main/core/NotificationCenter.ts:9` — JSON-file persisted activity stream + Electron OS notifications.
- `src/main/core/UnifiedNotificationHub.ts:9` — "Single path for every notification ... Stores in SQLite" with per-app prefs, DND, bell count.
- `src-tauri/src/notifications.rs` (port of NotificationCenter, JSON) AND `src-tauri/src/unified_notification_hub.rs` (port of the hub, SQLite) — both ported natively, perpetuating the split.
- `src/shared/notifications/center.ts:8` + `group.ts` — a third (renderer view-model) notification center, self-described as "today unwired."
- `src/renderer/components/Toast.tsx:8` and `src/renderer/services/TransferNotifications.ts:8` — separate in-app toast + transfer-event notification paths.

Evidence: `UnifiedNotificationHub.ts:9` claims to be the "Single path for every notification," yet `NotificationCenter.ts` persists its own copy to JSON and both were independently ported to Rust. The shared `center.ts` header admits the renderer center is "today unwired" — a third store built and never connected.

Survivor: `UnifiedNotificationHub` (SQLite, the self-declared single path) -> its Rust port `unified_notification_hub.rs`. Delete `NotificationCenter` + `notifications.rs`; fold `Toast`/`TransferNotifications` into one renderer subscriber off the hub; wire or delete `shared/notifications/center.ts`.

Risk: medium (storage migration from the JSON store into SQLite; UI re-pointing is mechanical).

## 3. Duplicate NOTES backend — RESOLVED 2026-06-10 (deletion half)

Usage verification confirmed `NotesSystem.ts` was never initialized in
`src/main/main.ts` (only `notesManager` is); its only references were its own
barrel export and a comment in NotesManager. Deleted, with its core/index.ts
barrel block. Remaining: decide whether the `notesStore.ts` localStorage
fallback (`dex-notes-fallback-v1`) stays as a no-DB shim or is retired.

## 4. Multiple MOTION / animation engines (5+ JS spring systems)

Systems involved:
- `src/renderer/services/UnifiedMotionSystem.ts:8` — "Single motion controller for all renderer animations."
- `src/renderer/utils/MotionController.ts:8` — "Spring physics engine ... Single source of animation truth for the entire DEX UI."
- `src/renderer/utils/spring-animation.ts:8` — "Spring Animation System ... Physics-based spring animations."
- `src/renderer/utils/motionHooks.ts` + `motionHooksExtended.ts` — React spring hooks.
- `src/renderer/utils/animationBudget.ts:8` and `src/main/core/MotionController.ts:8` — a budget system and a main-process motion controller.
- Tokens split across `src/renderer/styles/animationTokens.ts` and `src/main/utils/motionConstants.ts`.

Evidence: both `UnifiedMotionSystem.ts:8` ("Single motion controller for all renderer animations") and `utils/MotionController.ts` ("Single source of animation truth") claim to be the one true system. `spring-animation.ts` (tagged "v3.7.3") is a third independent spring engine.

Survivor: `UnifiedMotionSystem` (newest, capability/CPU-tier aware) plus `motionHooks` as its React surface. Retire `utils/MotionController.ts`, `spring-animation.ts`; consolidate `animationBudget` into UnifiedMotionSystem. Keep a single token file.

Risk: medium (many components import the spring helpers directly).

## 5. Overlapping STORAGE layers (electron-store + SQLite + bespoke engines)

Systems involved:
- `src/main/store/DataStore.ts` — "Local-first data persistence using electron-store."
- `src/main/core/DatabaseManager.ts:9` — "Central SQLite Database Manager. Single database connection shared by all DEX subsystems."
- `src/main/core/StorageManager.ts` — "Efficient, structured storage layer for Dex system data."
- `src/main/core/StorageEngine.ts` and `src/main/core/DatabaseCluster.ts` — a file-ops storage engine and a "Database Cluster."

Evidence: `DatabaseManager.ts:9` declares itself the "Single database connection shared by all DEX subsystems," yet `SearchController.ts:8` and `FileSearchIndexer.ts` persist via `DataStore` (electron-store), and `StorageManager`/`StorageEngine` are separate structured stores — the same config/state data lands in electron-store JSON, SQLite, and bespoke files.

Survivor: `DatabaseManager` (`dex.db`) for structured/subsystem data — the one the Tauri sweep standardized on. Keep `DataStore`/localStorage only for small renderer prefs. Audit `StorageManager`/`StorageEngine`/`DatabaseCluster` for live use and collapse into DatabaseManager.

Risk: high (data lives in these; needs migration, not just deletion).

## 6. Duplicate DEBOUNCE / THROTTLE utilities — RESOLVED 2026-06-10

`src/shared/perf/helpers.ts` is now THE canonical implementation (upgraded to
the superset: optional leading/trailing/maxWait, cancel()/flush(), with the
same defaults every copy used). `utils/performance.ts`,
`utils/infrastructure.ts`, `utils/index.ts`, and `utils/PerformanceUtils.ts`
re-export from it; their local bodies are deleted. `improvements500/throttle.ts`
is intentionally kept: it is part of the versioned, test-pinned
improvement-wave library, not an ad-hoc copy.

## 7. Three+ DESIGN-TOKEN radius scales — PARTIALLY RESOLVED (see status note)

Systems involved:
- `src/renderer/styles/design-tokens.css` — `--dex-radius-*` (now aliased to the canonical scale).
- `src/renderer/styles/design-system.css:295-302` — `--radius-*` (now THE canonical scale) plus ad-hoc `--pg-row-radius: 8px`.
- `src/renderer/styles/tokens.ts:52` — a JS `radius` object (still independent).
- `tailwind.config.js` — borderRadius (now bound to the canonical vars).
- Hardcoded `border-radius: Npx` literals across CSS and component inline styles.

Remaining work: point `tokens.ts`'s radius object at the canonical values, fold `--pg-row-radius` into the scale, sweep literals.

Risk: low-medium (visual regressions possible; sweep consumers).

## 8. UKI MEMORY persisted/modeled in 3-4 places

Systems involved:
- `src/shared/uki/memory.ts:8` — "UKI memory store. Three tiers ... Pure data + Map."
- `src/renderer/uki/memory.ts:9` — "capped, append-only ... stored in localStorage via the UKI cache layer."
- `src/renderer/uki/compressedMemory.ts:8` — consolidates older turns into a compact archive (a parallel cold store).
- `src/main/uki/knowledge/UkiRewindMemory.ts` — a fourth memory store on the main side.

Survivor: `shared/uki/memory.ts` as the model; `renderer/uki/memory.ts` as the single persistence adapter calling `compressedMemory` as its cold tier (not a parallel store). Reconcile `UkiRewindMemory` to feed the same store.

Risk: medium (semantic differences between tiers; verify before merging).

## 9. Duplicate SEMANTIC SEARCH / embedding indexes inside UKI

Systems involved:
- `src/main/services/EmbeddingService.ts:8` — embeddings over IPC (ONNX + hashing fallback).
- `src/shared/uki/embeddings.ts:8` — "Pure cosine-similarity embedding index. In-memory, paged."
- `src/renderer/uki/semanticSearch.ts` — "single entry point UI components should import for 'find'."
- `src/renderer/uki/index_search.ts:9` — lexical inverted index over the same knowledge base + workflows + turns.

Survivor: `semanticSearch.ts` as the facade, backed by `EmbeddingService` for vectors; keep `index_search` only if lexical-vs-semantic is an intentional hybrid (then document it as one system).

Risk: medium.

## 10. Duplicate DUPLICATE-DETECTION — RESOLVED 2026-06-10

Usage verification showed `DuplicateContentFinder.ts` had zero importers and
`SmartDuplicateDetector.ts` was never instantiated (its IPC registration lived
in a constructor nothing called; the renderer has zero `duplicates:*` callers).
Both deleted. Survivors: `DuplicationDetectorManager` (live, registered in
main.ts, renderer calls `duplication-detector:*`, already ported to
`src-tauri/src/duplication_detector.rs`) for content similarity, and
`core/dex-scanner` for native file duplicates.

## 11. Redundant CACHE layers

Systems involved:
- `src/main/core/DiskCache.ts` — "2GB LRU Disk Cache."
- `src/main/core/DiskBackedCache.ts` — "SSD-Based Temporary Memory Extension."
- `src/main/core/CacheCoordinator.ts` — "Map-based LRU caches with TTL per domain."
- `src/renderer/services/CacheRegistry.ts` + `src/renderer/services/MediaCache.ts` — renderer registry plus a standalone media cache.

Survivor: `CacheCoordinator` as the main-process owner with one disk tier (merge `DiskCache` + `DiskBackedCache`); `CacheRegistry` owns `MediaCache`.

Risk: medium.

## 12. Context menus — RESOLVED 2026-06-10 (survivor reversed); MODALS open

Usage verification REVERSED the original recommendation: `ContextMenu.tsx` is
the live one (imported by 6 pages: Workflows, Transfers, Audio, Gallery,
Tasks, NotesComponents), while `EnhancedContextMenu.tsx` had zero importers
and `ToolContextMenu.tsx` existed only in the components barrel. Both dead
files deleted; `ContextMenu.tsx` is the single context-menu system.

Still open from this finding: no `ModalProvider`/`useModal`/`modalStore`
exists; ~15 components hand-roll `createPortal` dialogs (`ConfirmDialog.tsx`,
`ShareDialog.tsx`, `WhatsNewModal.tsx`, `PolicyViewer.tsx`,
`DiagnosticsPanel.tsx`, `PiiGuardDialog.tsx`, ...). Introduce one modal host
and migrate incrementally.

Risk (modal host): medium.

## 13. Two FILE-WATCHER managers and two TASK-QUEUE systems — CORRECTED

Usage verification showed the originally proposed deletions are NOT dead:
- `FileWatcher.ts` is imported by `FileIntelligenceController.ts:18`, and that
  controller IS live (`initFileIntelligenceController` at main.ts:975).
- `TaskQueue.ts` is imported by `WorkflowController.ts:24`, and
  `workflowController` IS live (imported at main.ts:60).

So this is a real consolidation, not a deletion: migrate
FileIntelligenceController onto `FileWatcherManager` (registered at
main.ts:1173) and WorkflowController onto `TaskQueueManager` (initialized at
main.ts:1117), then retire the old modules.

Risk: medium (live controllers must be rewired and behavior-checked).

## 14. Proliferating PERFORMANCE-TIER / monitor systems (renderer)

Systems involved:
- `src/renderer/services/TierManager.ts:8` — tiers low|mid|high|ultra, presets every subsystem reads.
- `src/renderer/services/SystemTier.ts:9` — {low, mid, high} (a different tier set), sets `dataset.tier`.
- `src/renderer/services/AdaptivePerfMonitor.ts` — adjusts `data-perf-tier` from jank.
- `src/renderer/services/ProPerformanceEngine.ts:6` — its own scheduler + GPU layer + memory management.
- Plus `ThermalAdaptiveMonitor`, `PerformanceOptimization`, `EditingPerformanceLayer`, `CreativeAppPerformance`, `MemoryMonitor`, `PerformanceMonitor.tsx`.

Survivor: one tier authority (`TierManager`) writing one attribute, with `AdaptivePerfMonitor` as its runtime adjuster. Collapse the rest into clearly-scoped services.

Risk: medium-high (CSS `data-tier`/`data-perf-tier` selectors and many readers).

## 15. REWIND timeline logic computed in JS and (planned) Rust, analytics split

Systems involved:
- `src/shared/rewind/*` (16 modules).
- `src/main/core/RewindEngine.ts` plus 8 sibling Rewind managers (two analytics engines among them).
- `core/dex-rewind/src/lib.rs:5-8` — scaffold; "The TS timeline logic in `src/shared/rewind/` becomes the JS fallback."

Survivor (per migration intent): `core/dex-rewind` for capture + reconstruction + summaries once built; `shared/rewind` kept only as the documented fallback. Consolidate the 9 main-process Rewind managers first.

Risk: high (stateful, capture-heavy; flagged for planning, not immediate deletion).

## Honorable mentions

- WORKFLOWS vs AUTOMATION: `WorkflowEngine/Graph/Intelligence/Controller/Service` coexist with `AutomationEngine/AutomationController/RuleEngine/FolderRulesEngine` — confirm one pipeline, not two.
- SCHEDULERS: `ProcessScheduler`, `WorkStealingScheduler`, `ThreadOrchestrator`, `SchedulerController`, plus `ProPerformanceEngine`'s scheduler.
- LOCALIZATION: `LocalizationEngine.ts` + `LocalizationManager.ts`, and two Rust ports (`localization.rs`, `localization_engine.rs`).
- VOICE: `VoiceCommandProcessor`, `VoiceControlEngine`, `VoiceFeedbackSystem`, `VoiceScopeManager`, `VoiceMemoManager` plus two voice controllers.
- UNDO: `GlobalUndoHistory.ts` + `SystemUndoManager.ts` (main) and `src/renderer/services/undoManager.ts`.

## Recommended sequencing

1. Low-risk pure-function merges: debounce/throttle (6), radius tokens (7, mostly done), duplicate detectors -> dex-scanner (10).
2. "Newer replaces older" deletions where the survivor is wired: Notes (3), file-watcher/task-queue (13), context menus (12).
3. Storage-migration items: Notifications (2), Storage (5), Caches (11), UKI memory/semantic (8, 9).
4. Largest last, behind facades: Search (1), Motion (4), Perf tiers (14), Rewind (15, gated on the native engine).

Use `__dexDegradeReport()` and real usage data to confirm which duplicate paths are actually hit before deleting.
