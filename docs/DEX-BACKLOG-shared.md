# DEX Backlog — Shared / Platform Improvements

> **On scope.** The originating spec asked for "Generate 500 New Shared Improvements." This
> document now delivers that as a curated, categorized **~500-item** catalog (currently **500**
> across the ten spec categories). Items are seeded from real findings in the codebase and prior
> session work; each is a concise, actionable one-liner grounded in DEX's real architecture
> (AppManager, AppPredictor, ContextBus, ActionBus, DexProject, CreativeSuiteBridge, Xenon,
> TierManager, IdleContinuity, the command registry, ScriptingEngine, UnifiedSearchService,
> useAsyncResource, cacheExpiry, leakDetector, the Tauri bridge, the UKI app-context registry, etc.).
> It is meant to be **pulled from**, not shipped wholesale — quality over literal padding.
>
> Several seed items are already **done** and noted as such so they aren't re-chased; they're
> kept here as the reference pattern that the remaining items should follow.
>
> Categories: Performance · Stability · UX · Creative · Developer · AI · Design ·
> Accessibility · Platform · Future.

### Counts

| Category | Items |
| --- | ---: |
| First Wins | 10 |
| Performance | 60 |
| Stability | 55 |
| UX | 60 |
| Creative | 45 |
| Developer | 55 |
| AI | 55 |
| Design | 45 |
| Accessibility | 40 |
| Platform | 45 |
| Future | 40 |
| **Grand total** | **500** |

(First Wins are highlights drawn from the categories below; the 500 grand total counts the ten
category sections, not the First-Wins restatement.)

---

## First Wins (~10 — highest value, lowest effort, build next)

1. **Shared async-load hook** — one `useAsyncResource` returning `{data, loading, error, retry}` to standardize every fetch.
2. **EmptyState / ErrorState adoption** — replace ad-hoc empty/error markup across apps with the shared components.
3. **DexLoader everywhere** — route all in-app loading through the shared loader (already used in launch).
4. **Command-registry adoption** — register every app's primary actions so the command palette is complete.
5. **Persisted per-app UI state** helper — last tab/filter/scroll restored on relaunch via one hook.
6. **Reduced-motion respect** — gate animations on `prefers-reduced-motion` from one shared util.
7. **Focusable shell** — visible focus rings + logical tab order on the bar, dock, and orbs.
8. **Leak-safe effects audit** — shared cleanup pattern for intervals/listeners/rAF in long-lived apps.
9. **ContextBus emit helpers** — tiny typed helpers so apps publish events without boilerplate.
10. **Toast/result standardization** — one success/error toast path for "copied", "sent to Notes", etc.

---

## Performance (60)

1. **(done)** Predictive prewarm of likely-next apps (AppPredictor Markov transition warmup).
2. **(done)** DexLoader integrated into the launch path.
3. **(done)** Idle-reclaim sweep — `cacheExpiry` sweep registry runs caches' eviction on deep idle.
4. Adopt shared `useAsyncResource` across every remaining fetch site to dedupe loading/error logic.
5. Virtualize long lists (Files, Tasks, Live Activity Browser, Rewind history tapes) via one shared list primitive.
6. Lazy-load heavy standalone apps (Maps, PDFViewer, Canvas, DexCode, PresentationBuilder) behind `InstantAppLoader` code-split boundaries.
7. Memoize expensive Zustand selectors in shared stores; audit re-render hotspots with the dev panel.
8. Debounce/throttle high-frequency inputs (search, sliders, resize) through one shared util.
9. Idle-time prefetch of project/UKI context for the active `DexProject` during `IdleContinuity` low-power state.
10. Decode images/assets off the main thread (`createImageBitmap`) in Gallery and creative imports.
11. Cache parsed results (timezones, unit tables, color math) across app mounts via `cacheExpiry` TTLCache.
12. Coalesce ContextBus writes through its throttled channels to avoid render storms.
13. Measure and budget per-app mount time; flag regressions in dev mode against a baseline.
14. Reuse the single shared `WorkerPool` instead of per-app workers.
15. Route all scheduled async through `OperationScheduler`/`WorkloadGovernor` so concurrency is bounded.
16. Drive per-frame work off one `SharedTick` rather than competing rAF loops across apps.
17. Gate visual effect cost by `TierManager` tier (blur radius, particle counts, shadow layers).
18. Defer non-critical app subsystems to idle via `IdleResourceBalancer` reallocation.
19. Precompute and cache fuzzy-match indexes in `UnifiedSearchService` instead of rebuilding per keystroke.
20. Cache UKI answers and embeddings via `uki/cache.ts` keyed by normalized query + context hash.
21. Persist `AppPredictor` transition table so prewarm is useful on the first launch after restart.
22. Warm the next-likely creative app's worker via `CreativeSuiteBridge` when a handoff is predicted.
23. Stream large file/transfer lists incrementally instead of materializing the whole array.
24. Compress large persisted payloads with `CompressionFramework` before writing to storage.
25. Batch `localStorage` writes (single rAF-flushed queue) instead of synchronous per-keystroke writes.
26. Throttle `xenonStore` metric fan-out so kernel push events don't trigger render churn.
27. Skip offscreen app renders using CSS containment presets (`CSSContainment.ts`) on stage panels.
28. Pause animation budget (`animationBudget.ts`) for apps not in the active stage panel.
29. Cache thumbnails/metadata through `MediaCache` for Gallery, Audio, and Files previews.
30. Reuse decoded audio buffers via `decodeAudio`/`AudioPlaybackService` across Audio and creative apps.
31. Lazy-init UKI embedding/semantic-search indexes only when first queried, not on shell boot.
32. Prefetch DexCode/Terminal project file tree on `DexProject` bind, before the panel opens.
33. Memoize Markdown/diff rendering in MarkdownEditor, DexCode, and Git Client diff views.
34. Pool and reuse canvas/WebGL contexts across Prism, PixelArt, Canvas, and Forge.
35. Debounce autosave through `AutoSaveManager` so rapid edits coalesce into one write.
36. Cap Rewind snapshot diffing work per tick; chunk large timelines across frames.
37. Lazy-mount Settings panes (`SettingsPaneShell`) so the Store/Permissions/AI panes load on demand.
38. Short-circuit ContextBus replay ring buffer reads for apps that don't subscribe to history.
39. Cache color/contrast (WCAG) computations shared by Color Picker and the design audit.
40. Precompute QR/barcode matrices once and reuse on re-render in QR Code Generator.
41. Throttle `ThermalAdaptiveMonitor`-driven downgrades so they don't thrash effect quality.
42. Use `requestIdleCallback` for non-urgent index builds (file intelligence, search history).
43. Avoid re-tokenizing large Notes documents on every keystroke; incremental parse on edit ranges.
44. Cache weather/world-clock/timezone API results per `cacheExpiry` TTL to cut redundant fetches.
45. Reuse a single geolocation/timezone resolution across Weather, WorldClock, Maps, and Calendar.
46. Memoize the home grid / dock layout so `homeAppsStore` changes don't re-layout everything.
47. Defer `leakDetector` heap sampling cadence by tier to keep low-tier devices cheap.
48. Batch ActionBus plan-step execution so UKI multi-step plans don't re-render per step.
49. Cache compiled ScriptingEngine programs keyed by source hash to skip re-parsing on rerun.
50. Stream Terminal/SSH output through a ring buffer with windowed rendering, not unbounded DOM.
51. Pre-resolve app icons (`DexIcon`) into a sprite/cache instead of per-mount SVG parse.
52. Profile and trim cold-start by deferring non-shell stores until first navigation.
53. Use `InputPriority` to keep typing/scrolling responsive under background load.
54. Cache `FileTypeRegistry` MIME→icon lookups instead of recomputing per file row.
55. Reuse downscaled image variants from `AssetLibrary` rather than re-decoding originals.
56. Bound `clipboardStore` history length and evict oldest via LRU to cap memory.
57. Memoize `IntelligenceLayer` smart-recents merge so the feed doesn't recompute on every event.
58. Throttle `CompositorHealth` sampling and surface a single rolled-up frame-health signal.
59. Skip redundant `TierManager` re-detection; cache the hardware profile and re-probe only on demand.
60. Add a dev-only "render heatmap" overlay highlighting components re-rendering most per session.

## Stability (55)

1. **(done)** Leak detector — dev-mode warning when sustained heap growth is detected (`leakDetector.ts`).
2. **(done)** Idle-reclaim recovery — caches reclaim memory on deep idle without a reload.
3. Shared error boundary wrapping every app with a recoverable `ErrorState` + "reopen" action.
4. Idle recovery: auto-recover an app that has hung or errored without a full shell reload (`crashRecovery.ts`).
5. Guard all `localStorage` reads/writes behind one safe helper (try/catch + quota handling).
6. Normalize the native-bridge degrade pattern (`dexInvoke`/`tauriCompat` resolve null off-platform) into one shared helper.
7. Crash/error telemetry sink with per-app attribution feeding the dev panel.
8. Defensive JSON parse helper for all persisted store state with schema fallback.
9. Watchdog for runaway timers/animations that escaped cleanup (tie into `leakDetector`).
10. Graceful handling of missing/disconnected resources (no native bridge, offline, no project).
11. State-migration helper for versioned persisted schemas across all Zustand stores.
12. Centralize unmount cleanup (intervals/listeners/rAF/AbortController) in one `LifecycleManager` hook.
13. Wrap every `useAsyncResource` consumer so timeouts surface a retryable ErrorState, not a blank panel.
14. Add per-app "panic reset" that clears the app's store slice without nuking the whole shell.
15. Detect and break ContextBus emit→render→emit feedback loops with a re-entrancy guard.
16. Verify ActionBus destructive steps always pass through approval-gating before executing.
17. Fail ScriptingEngine programs safely with bounded execution time and a kill switch.
18. Sandbox plugin/marketplace apps so a crash can't take down the shell.
19. Recover gracefully when the Tauri `dex_ipc` channel is missing — fall back to `rendererShims`.
20. Validate `DexProject` manifests (.dexproject) on load; quarantine corrupt ones instead of crashing.
21. Reconcile `runningApps` registry on resume so stale/orphaned app entries are pruned.
22. Guard `xenonStore` against malformed kernel push events (clamp/validate metric ranges).
23. Add retry-with-backoff to flaky native calls (file IO, transfers, SSH) through one helper.
24. Persist in-flight edits (`AutoSaveManager`) so a crash mid-edit in Notes/DexCode recovers cleanly.
25. Detect storage-quota exhaustion and prompt to evict caches before writes start silently failing.
26. Surface unhandled promise rejections to the telemetry sink with app attribution.
27. Make Rewind snapshot restore atomic — never leave a half-restored project state.
28. Validate clipboard payloads before paste so a malformed asset can't crash the target app.
29. Add a circuit breaker around UKI provider calls so repeated failures degrade to offline mode.
30. Guard creative export pipeline against OOM on huge canvases (downscale + warn).
31. Ensure `WorkerPool` workers are recycled/terminated on app close to avoid zombie workers.
32. Time out and cancel stuck `OperationScheduler` operations; report them in the dev panel.
33. Make all toasts dismissible and self-expiring so a stuck toast can't block the UI.
34. Verify focus is restored to a valid element after an app closes or a dialog dismisses.
35. Add idempotency keys to `FlowTransfer`/Transfers so a retried transfer doesn't duplicate.
36. Detect and recover from a wedged audio context in Audio/Imosion (reinit on resume).
37. Bound `clipboardStore`/`SearchHistory` growth so they can't grow unboundedly across a long session.
38. Validate persisted theme/wallpaper/widget state and fall back to defaults if invalid.
39. Ensure `IdleContinuity` state transitions are debounced so rapid focus/blur can't thrash.
40. Catch and surface plugin manifest parse errors instead of silently dropping the plugin.
41. Add a "safe mode" shell boot that disables non-core stores when a crash loop is detected.
42. Guard `TierManager` against an undetectable device — default to mid tier rather than failing.
43. Make `ContextBus` subscriptions auto-unsubscribe on unmount via a shared hook.
44. Verify all `setTimeout`/`setInterval` IDs are tracked and cleared (lint rule + shared timer helper).
45. Recover the command registry if an app registered malformed actions (skip, don't crash the palette).
46. Add health checks for the SSH/Terminal PTY so a dead session is reaped, not left hanging.
47. Ensure undo (`systemUndoStore`/`undoManager`) never leaves the document in an inconsistent state.
48. Validate imported files (size/type via `FileTypeRegistry`) before handing them to apps.
49. Guard against re-entrant navigation in `useNavigationHistory` (no infinite back/forward loops).
50. Add a global "last error" surface in Settings so users can report what broke.
51. Ensure `MediaCache`/`AssetLibrary` evictions never free an asset still referenced by an open app.
52. Make `AutoSaveManager` writes transactional (temp-write + rename) to avoid truncated saves.
53. Add a watchdog that reloads only the wedged stage panel, not the whole stage.
54. Verify `permissionStore` denials are enforced even if an app retries the same capability call.
55. Add structured logging levels (`notify.ts`/log viewer) so errors are filterable, not console-only.

## UX (60)

1. Crossfade smoothness pass on app switch via `UnifiedMotionSystem` (consistent duration/easing, no flash).
2. Consistent `EmptyState` across all apps (icon, title, hint, primary action).
3. Consistent `ErrorState` across all apps (cause, retry, report).
4. Universal "Send to…" and "Open with…" menus shared by every app (backed by `CreativeSuiteBridge`/`FlowTransfer`).
5. Persisted per-app UI state (last tab, filters, scroll, selection) via one hook.
6. Global command palette completeness via the command registry (`RegistryCommandPalette`).
7. Consistent toast semantics for copy/send/save/delete through one `Toast` path.
8. Undo for destructive actions (delete/move) via the shared `systemUndoStore`/`undoManager`.
9. Keyboard-first parity: every primary action reachable without the mouse.
10. Consistent context-menu items across apps (Copy, Send to, Open with, Delete) via shared `ContextMenu`.
11. Inline "copied" feedback standard for all copy buttons.
12. Drag-and-drop conventions shared (reorder handles, drop targets, drop-zone affordance).
13. Single canonical search field (`DexSearchInput`) and behavior everywhere.
14. Unify Spotlight (Ctrl+Space), Global Search (Ctrl+Shift+F), and Command Palette (Ctrl+K) UX via `UnifiedSearchService`.
15. Consistent confirm dialog (`ConfirmDialog`) for all destructive prompts.
16. Standard "recents" surface across apps fed by `IntelligenceLayer` smart-recents.
17. Consistent app header/toolbar layout (title, primary action, overflow menu).
18. Standard breadcrumb/back affordance using `useNavigationHistory` everywhere.
19. Consistent selection model (single/multi, shift/ctrl) across list and grid views.
20. Standard "no results" vs "empty" distinction in every searchable view.
21. Quick-switcher (recent apps) overlay matching the predictor's ranking.
22. Consistent keyboard shortcut hints in menus and tooltips (discoverability).
23. Standard "pin to dock / pin to home" affordance via `dockPinStore`/`homePinnedAppsStore`.
24. Consistent loading skeletons (`Skeleton`/`LoadingStates`) sized to real content shape.
25. Standard "share / export" affordance placement across creative and document apps.
26. Inline rename pattern (double-click / F2) shared by Files, Notes, Tabs, projects.
27. Consistent multi-select toolbar (count + bulk actions) for Files, Tasks, Gallery.
28. Standard drag-to-reorder for dock, home grid, tabs, Kanban columns.
29. Consistent "save / unsaved changes" indicator across editors.
30. Standard "open in new panel / split" gesture for the stage.
31. Consistent search-within-app (Ctrl+F) overlay component shared by Notes, DexCode, Terminal.
32. Standard "favorite / star" affordance with a shared `pinRegistry` backing.
33. Consistent date/time formatting via shared format helpers (no divergent strings).
34. Standard relative-time labels ("2m ago") shared across activity, transfers, notes.
35. Consistent number/byte formatting (`formatBytes`) across Files, Transfers, Tasks.
36. Standard tabbed-document model shared by Browser, DexCode, MarkdownEditor.
37. Consistent "settings within app" entry point and layout.
38. Standard onboarding/empty-first-run hint per app via `useOnboarding`.
39. Consistent notification/now-playing surface (`nowPlaying`/`notify`) across the shell.
40. Standard "copy link / deep link to this view" action for shareable app states.
41. Consistent focus-return after closing a modal/menu/app.
42. Standard "what's this?" inline help via `helpContent` on complex controls.
43. Consistent zoom/pan controls for Maps, Canvas, PixelArt, PDFViewer.
44. Standard keyboard-driven palette to jump to any setting (Settings search).
45. Consistent "duplicate" action across Notes, projects, Kanban cards, canvases.
46. Standard "drag out to file" / "drop file in" for any asset-producing app.
47. Consistent app-switch transition direction (predictable spatial model in the stage).
48. Standard progress UI for long ops (transfers, exports, recordings) with cancel.
49. Consistent "recently closed — reopen" affordance across apps and tabs.
50. Standard quick-actions row on the home grid surfaced from the command registry.
51. Consistent timestamped activity feed (`stageActivityLog`) presentation across apps.
52. Standard "clear / reset" affordance with confirm for history, caches, filters.
53. Consistent toast stacking, positioning, and max-visible across the shell.
54. Standard "drag handle reveal on hover" for reorderable rows.
55. Consistent empty-search suggestion list (recent + popular) in `UnifiedSearchService`.
56. Standard per-app keyboard cheat-sheet overlay (press `?`).
57. Consistent "send selection to UKI / ask UKI about this" affordance from any text surface.
58. Standard panel resize persistence (`ResizablePanel`) remembered per app.
59. Consistent right-click vs long-press parity for touch/pointer.
60. Standard "loading more…" infinite-scroll affordance for virtualized lists.

## Creative (45)

1. Shared color/palette service so Color Picker, Canvas, PixelArt, Prism, QR, and Forge share swatches (via `DexProject` palette).
2. Shared export pipeline (PNG/SVG/PDF/clipboard) used by all creative apps.
3. Shared undo/redo history primitive for canvas-like apps (`useUndoRedo`).
4. Shared image import/downscale utility feeding all creative imports.
5. Theme-aware export (respect true-black + glass tokens) for generated assets.
6. Reusable "send asset to Notes/Files" sink via `CreativeSuiteBridge`.
7. Shared asset clipboard (focus handoff) across Imosion, Vinx, Flux, Prism, Forge.
8. Shared `AssetLibrary` indexing + versioning consumed by every creative app.
9. Standard layers panel primitive reused by Prism, PixelArt, Canvas, Flux.
10. Shared brush/tool model so brush settings carry across Prism and PixelArt.
11. Shared timeline/keyframe primitive for Flux, Vinx, and Rewind.
12. Shared color-grading/LUT module between Vinx and the image apps.
13. Shared waveform/spectrogram view (`audioAnalysis`) for Audio, Imosion, NoiseGenerator.
14. Shared "send to presentation" sink so any asset drops into PresentationBuilder.
15. Shared snap/grid/guides system across Canvas, PixelArt, AXL, PresentationBuilder.
16. Shared swatch + gradient editor reused by every color-producing app.
17. Shared export-preset store (sizes, formats, quality) per `DexProject`.
18. Shared "open recent asset" feed from `AssetLibrary` across the creative suite.
19. Shared selection/transform handles (move/scale/rotate) for canvas apps.
20. Shared crop/resize dialog for image-producing apps.
21. Shared "duplicate as new asset" action across the suite.
22. Shared masking/alpha primitive between Prism, Vinx, and Forge.
23. Shared font/typography picker reused by PresentationBuilder, Canvas, MarkdownEditor.
24. Shared "place on canvas" drop behavior so any asset can be composited.
25. Shared color-blindness preview toggle for creative exports.
26. Shared performance budget (`CreativeAppPerformance`/`CreativeAppsSnappy`) applied to every creative app.
27. Shared "lock layer / hide layer" semantics across layered apps.
28. Shared eyedropper that samples across any creative surface into the palette.
29. Shared asset metadata panel (dimensions, format, source app).
30. Shared "export all artboards/frames" batch action.
31. Shared canvas zoom-to-fit / actual-size / 100% controls.
32. Shared generative-seed/parameter panel for Forge reusable by other generators.
33. Shared "send to Nexus graph" so assets become nodes in collaborative graphs.
34. Shared reference-image overlay (pin a reference while drawing/editing).
35. Shared color-history strip (recently used colors) across creative apps.
36. Shared "compare before/after" split view for edits and grades.
37. Shared non-destructive adjustment stack reused by Vinx and Prism.
38. Shared asset tagging/search reused across the creative suite via `fileIntelligenceStore`.
39. Shared "render preview at tier" so heavy effects preview at `TierManager` quality.
40. Shared export-to-clipboard-as-image action for quick paste into chat/notes.
41. Shared aspect-ratio / safe-area guides for Vinx, Flux, PresentationBuilder.
42. Shared "import from URL / paste image" entry point across creative apps.
43. Shared frame/onion-skin view between PixelArt animation and Flux.
44. Shared audio-reactive parameter binding (Imosion → Flux/Forge visuals).
45. Shared project "moodboard" surface aggregating linked assets per `DexProject`.

## Developer (55)

1. Dev-mode panel surfacing ContextBus events, app contexts, ActionBus plans, and store state.
2. Shared `DexProject` binding API (cwd, repo, file root, linked notes) consumed by Terminal, Git, DexCode, EnvManager, Workflows.
3. Shared scripting-engine invocation wrapper with consistent run/format/lint results.
4. Diff-view component reused by Git Client, DexCode, EnvManager.
5. Shared file-system access layer with consistent open/save dialogs and recents (`FlowTransfer`/`useRecentFiles`).
6. Command-registry API ergonomics: declarative action registration per app.
7. DEX-Script hooks so workflows can call any registered command (`dexCommandRunner`).
8. In-app log viewer component reused by Terminal, Workflows, Transfers, SSH.
9. Shared "run history" component (steps, status, timing) for Workflows and scripts.
10. Shared syntax-highlighting service reused by DexCode, MarkdownEditor, log viewer.
11. Shared file-tree component reused by DexCode, Files, Git Client.
12. Shared terminal/PTY component reused by Terminal and SSH Client.
13. Shared "open in DexCode" / "reveal in Files" cross-app navigation actions.
14. Shared environment-variable resolver reused by EnvManager, Terminal, Workflows.
15. Shared git status surface (`DexProject` repo binding) shown in Terminal and Files.
16. Shared "format / lint on save" hook routed through the scripting engine.
17. Declarative command manifest per app so the registry auto-populates the palette.
18. Shared keybinding registry so apps register shortcuts without collisions.
19. Shared "copy as path / copy as relative path" actions for any file row.
20. Shared snippet/template store reused by DexCode, Notes, Workflows.
21. Shared JSON/YAML viewer-editor reused by EnvManager, Settings schema, manifests.
22. Shared "run selection" affordance (DexCode → scripting engine, with output capture).
23. Shared diff-and-apply primitive for config changes (EnvManager, Settings, plugins).
24. Shared "watch a path and react" primitive for Workflows and dev tooling.
25. Shared output/console panel docked across dev apps with filtering.
26. Shared task-runner UI for project scripts surfaced from `DexProject`.
27. Shared "attach UKI to this file/project" so AI has dev context.
28. Shared SSH/known-hosts store reused by SSH Client and remote transfers.
29. Shared clipboard-as-code action (paste detection → DexCode with language guess).
30. Shared "export logs / share session" for bug reports.
31. Shared performance/inspector overlay (frame, memory via `MemoryMonitor`/`CompositorHealth`).
32. Shared "register a slash command" API mirroring `UkiSlashCommands` for any app.
33. Shared command-scope resolver (`commandScope`) so palette results respect the active app/context.
34. Shared recent-commands surface (`recentCommands`) in the palette.
35. Shared workflow-template library (`workflowTemplates`) browsable and forkable.
36. Shared "dry-run / preview" mode for any ActionBus-executed automation.
37. Shared file-type registry (`FileTypeRegistry`) so dev apps share open-with mapping.
38. Shared "open project in space" that restores Terminal + DexCode + Git layout.
39. Shared env/secret masking in logs and diffs (never print vault values).
40. Shared "copy command to clipboard" for any palette action.
41. Shared structured-error format so scripts/workflows report failures uniformly.
42. Shared "schedule this workflow" entry point (idle/time-based trigger).
43. Shared API-key/keystore accessor (`uki/keystore`) reused by any app needing provider creds.
44. Shared markdown-preview pane reused by MarkdownEditor, Notes, help content.
45. Shared "test connection" pattern for SSH, providers, and network resources.
46. Shared dependency/version surface (read package manifests via `DexProject`).
47. Shared "open terminal here" from any file/folder context menu.
48. Shared regex tester utility usable from the command palette.
49. Shared base64/hash/encode utilities surfaced as palette commands.
50. Shared "compare two files" entry point from Files into the diff view.
51. Shared workflow step library (HTTP, file, shell, AI) with consistent IO contracts.
52. Shared "pin command to home" so frequent dev actions are one click.
53. Shared inspector for ContextBus message shapes (schema + recent payloads).
54. Shared "replay last N events" debug action from the dev panel.
55. Shared scripting sandbox limits (time/memory) configurable per `TierManager` tier.

## AI (55)

1. Cross-app context via ContextBus + DexProject feeding Uki and Nexus.
2. Standard "app context provider" interface — extend the UKI app-context registry (`registerUkiAppContext`) beyond Tasks to every app.
3. Shared "insert AI result at cursor / send to Notes" action from any text surface.
4. Shared prompt-template store reusable by Uki and per-app AI actions.
5. Context-source citations surfaced consistently (which project/note/app was used).
6. Summarize-selection action available from any text surface.
7. Token/context budget indicator shared component fed by `uki/context`.
8. Guardrail: AI actions never auto-push, auto-delete, or move money (enforced via ActionBus risk gating).
9. Shared provider routing UI (auto/cheapest/fastest/smartest/offline) from `AiProviderSettings`.
10. Shared keystore accessor (`uki/keystore`) so any app can use configured providers.
11. Shared "ask UKI about this" entry point wired into every app's context menu.
12. Shared streaming-answer component (`answerEngine`) reused by Uki, Nexus, inline AI.
13. Shared action-approval card (`UkiApprovalCard`) for any AI-proposed change.
14. Shared plan-graph preview so users see UKI's steps before ActionBus runs them.
15. Shared semantic search (`semanticSearch`/`index_search`) across notes, files, and activity.
16. Shared compressed-memory layer (`uki/compressedMemory`) so long sessions keep relevant context.
17. Shared "explain this error/log" action from Terminal, Workflows, and the log viewer.
18. Shared "draft from template" using the prompt-template store per app.
19. Shared skill-pack registry (`uki/skillPacks`) so apps contribute reusable AI skills.
20. Shared offline/degraded mode banner when no provider is configured/reachable.
21. Shared "cite sources" panel listing the project/note/file contexts used.
22. Shared cost/usage indicator aggregated across providers.
23. Shared "redo with different model" affordance on any AI result.
24. Shared context-budget trimming policy so prompts respect provider limits.
25. Shared "summarize this app's current view" using each app's registered context.
26. Shared "turn selection into a task/note/event" AI action across surfaces.
27. Shared embeddings cache (`uki/cache`) reused by semantic search and recommendations.
28. Shared knowledge-feeder ingest (`uki/knowledgeFeeder`) for project docs and notes.
29. Shared screen-context capture (`uki/screenCapture`) gated by permission for visual questions.
30. Shared "AI never acts without confirmation on destructive steps" policy surfaced in UI.
31. Shared per-app AI action manifest so the command palette lists AI actions too.
32. Shared "continue / regenerate / shorten / lengthen" controls on any AI output.
33. Shared identity/preferences (`uki/identity`) so tone and defaults persist.
34. Shared "ground answer in this project" toggle binding UKI to the active `DexProject`.
35. Shared rate-limit/backoff and error surfacing for provider calls.
36. Shared "save this prompt as a command" so good prompts become reusable actions.
37. Shared Nexus "AI-suggest related nodes" using semantic search.
38. Shared "explain this diff / summarize PR" action in Git Client via UKI.
39. Shared "AI fill" for forms/fields with explicit confirm before apply.
40. Shared confidence/uncertainty indicator on AI suggestions.
41. Shared "compare answers across providers" view for important queries.
42. Shared memory-scope controls (this session / this project / global) for UKI.
43. Shared "redact secrets before sending to AI" filter (never leak vault/keystore values).
44. Shared "AI handoff" so a creative app can ask UKI to refine/caption an asset.
45. Shared transcript export for any AI conversation (to Notes/Files).
46. Shared pattern-learning hook (`usePatternLearning`) so UKI improves from accepted actions.
47. Shared "what can UKI do here?" affordance listing available actions in the active app.
48. Shared inline-completion service reusable by DexCode, Notes, MarkdownEditor.
49. Shared "translate / rephrase / fix grammar" actions on any text selection.
50. Shared answer-cache invalidation when the underlying context (note/file/project) changes.
51. Shared free/sandboxed API integrations (`uki/freeApis`) surfaced uniformly.
52. Shared "ask about my system" using `xenonStore` metrics as UKI context.
53. Shared escalation: when a safe action fails, UKI proposes a fix rather than silently stopping.
54. Shared per-app context throttling so UKI context refresh respects `IdleContinuity` state.
55. Shared "pin this answer" so useful AI results persist in the project/note.

## Design (45)

1. Audit all apps for true-black + glass token compliance (no leftover frosted chrome).
2. Single canonical search input (`DexSearchInput`) everywhere; remove one-off fields.
3. Radii on-scale (cap at the design-system value); fix off-scale corners.
4. Consistent spacing/typography via design tokens; remove hardcoded values.
5. One canonical card/panel/sidebar surface used across apps.
6. Iconography consistency via `DexIcon`; retire stray inline SVGs and emoji.
7. Hover/active/focus states standardized through tokens.
8. Empty/error/loading visuals share the same visual language.
9. Wallpaper/desktop layering rules documented and respected (`wallpaperStore`).
10. Single canonical button hierarchy (primary/secondary/ghost/destructive) via tokens.
11. Consistent input/select/checkbox/toggle controls from one shared kit.
12. Consistent dialog/sheet/popover chrome across the shell.
13. Standard elevation/shadow scale tied to the glass token system.
14. Consistent dock, bar, and orb visual treatment via `glassMenu`/shell tokens.
15. Standard app-icon grid metrics (size, gap, label) across home and dock.
16. Consistent table/list-row density and zebra/hover rules.
17. Standard tab strip styling shared by Browser, DexCode, MarkdownEditor.
18. Consistent badge/pill/status-chip styles via tokens.
19. Standard divider/section-header treatment in settings and panels.
20. Consistent scrollbar styling across the shell.
21. Standard progress-bar/spinner visuals (`DexLoader`) everywhere.
22. Consistent color semantics (success/warn/error/info) from one token set.
23. Standard toast visual language (size, icon, color, motion).
24. Consistent menu/context-menu item styling and spacing.
25. Standard focus-ring token applied uniformly (also an a11y item).
26. Consistent disabled-state treatment across controls.
27. Standard tooltip styling and delay.
28. Consistent avatar/thumbnail framing across Gallery, CollabHub, Nexus.
29. Standard "selected" treatment (rows, cards, tabs) via one token.
30. Consistent header-toolbar height and alignment across apps.
31. Standard glass-blur tier mapping documented (so `TierManager` downgrades look intentional).
32. Consistent slider/range control styling for ColorPicker, Audio, settings.
33. Standard keyboard-hint chip styling in menus and cheat-sheets.
34. Consistent code-block/inline-code styling shared by Notes, DexCode, help.
35. Standard empty-grid placeholder art shared by Files/Gallery/Store.
36. Consistent settings-pane layout (`SettingsPaneShell`) for every pane.
37. Standard "destructive zone" styling for dangerous settings/actions.
38. Consistent number/metric display styling (Xenon, TaskManager, Transfers).
39. Standard motion tokens (durations/easings) via `UnifiedMotionSystem`.
40. Consistent drag-preview/ghost styling for DnD across the shell.
41. Standard color-token contrast verified against true-black (reuse Color Picker WCAG check).
42. Consistent app-skeleton shells (`CreativeAppSkeleton`) generalized to all suites.
43. Standard iconography weight/stroke alignment across `DexIcon` set.
44. Consistent "now playing" / media-control visual treatment.
45. Design-token lint: flag hardcoded colors/radii/spacing in PRs.

## Accessibility (40)

1. `prefers-reduced-motion` respected globally from one util (gate `UnifiedMotionSystem`).
2. Focus-mode: dim non-active surfaces; keyboard-trappable active app.
3. Visible focus rings and logical tab order on bar, dock, orbs, and within apps.
4. ARIA roles/labels on interactive controls and live regions for toasts.
5. Keyboard navigation for lists, grids, and menus (arrow keys, Home/End).
6. Sufficient contrast checked against true-black backgrounds (reuse Color Picker WCAG check).
7. Respect `prefers-reduced-transparency` by reducing glass where set.
8. Screen-reader announcements for async results (copied, saved, error) via shared live region.
9. Scalable text / honor OS text-size where possible.
10. Skip-to-content and escape-to-close conventions standardized.
11. Focus trap + restore for every modal/dialog/popover (`ConfirmDialog`, palettes).
12. Roving-tabindex pattern shared by toolbars, dock, and tab strips.
13. Announce route/app changes to assistive tech via a polite live region.
14. Ensure all icon-only buttons have accessible names (`DexIcon` + aria-label).
15. Keyboard reorder (Ctrl+Arrow) for dock, home grid, Kanban, tabs.
16. High-contrast theme variant tied to the token system.
17. Respect `prefers-color-scheme`/forced-colors where applicable.
18. Ensure drag-and-drop has a keyboard-accessible alternative.
19. Caption/label association for every form control (no orphan inputs).
20. Announce long-op progress (transfers, exports) to screen readers.
21. Make `UnifiedSearchService` results keyboard-navigable with announced result counts.
22. Ensure toasts are reachable/dismissible by keyboard and announced.
23. Provide visible focus on canvas/creative tools, not just mouse hover.
24. Ensure color is never the sole signal (add icon/text to status).
25. Honor reduced-motion in crossfades, app-switch, and skeleton shimmer.
26. Accessible names for stage panels and the ability to focus/cycle them by keyboard.
27. Ensure context menus open and navigate via keyboard (Menu key / Shift+F10).
28. Provide an accessible label for the now-playing/media controls.
29. Make sliders (ColorPicker, Audio) operable with arrows and announce values.
30. Ensure error states are announced and programmatically associated with their control.
31. Provide a global "increase contrast / reduce transparency" quick toggle in Settings.
32. Ensure focus is never lost to `display:none` content after transitions.
33. Add landmark roles (nav/main/complementary) to the shell layout.
34. Ensure tables/lists expose row/column semantics to assistive tech.
35. Provide keyboard shortcuts cheat-sheet that is itself screen-reader friendly.
36. Ensure tooltips are dismissible and don't trap focus (WCAG 1.4.13).
37. Honor OS "reduce motion" for `IdleContinuity` ambient animations too.
38. Provide accessible state for toggles (aria-pressed/checked) across the kit.
39. Ensure minimum target size for touch/pointer controls across the shell.
40. Add an accessibility self-check (`AccessibilityManager`) surfaced in the dev panel.

## Platform (45)

1. Plugin/extension framework groundwork: a manifest + sandboxed app-host contract.
2. Capability/permission model surfaced in the Store and `PermissionCenter` (what an app can access).
3. Stable shared API surface (commands, context, project, file-system, send-to) for third-party apps.
4. Tauri-native parity wrappers (`tauriCompat`) so renderer code degrades cleanly off-platform.
5. Cross-platform path/locale/format helpers consolidated (avoid divergent `formatBytes`/relative-time).
6. Update/versioning flow for apps in the Store.
7. Settings schema shared so each app's preferences register centrally (`shellPreferencesStore`).
8. Inter-app event bus (ContextBus) documented as the supported integration point.
9. Background-task host for timers/recorders/transfers that outlive their app view.
10. Document and stabilize the `dex_ipc(channel, args)` contract + `rendererShims` fallback list.
11. Capability detection (`platform/capabilities`) exposed to apps so they feature-gate cleanly.
12. Permission request/grant flow (`permissionStore`/`PermissionCenter`) shared by all apps.
13. Plugin marketplace install/update/remove lifecycle with signature checks.
14. Shared file-system capability with scoped, permissioned roots per app.
15. Shared network capability (`networkStore`) with offline awareness for all apps.
16. Shared notification capability (`notify`) with OS bridge and in-shell fallback.
17. Shared clipboard capability (`clipboardStore`/`ClipboardMonitor`) with history.
18. Shared secrets/vault capability (`useVaultStore`/`uki/keystore`) gated by permission.
19. Shared background-scheduler so apps register idle/time-based jobs centrally.
20. Shared "open external URL / file" capability routed through the platform layer.
21. Document the `DexProject` (.dexproject) manifest as the cross-app project contract.
22. Shared workspace "spaces" persistence (`projectSpaces`/`workspaceLayouts`) as a platform service.
23. Shared deep-link/route scheme so apps can be opened to a specific view.
24. Shared telemetry/opt-in analytics contract with per-app attribution.
25. Shared crash-report capability feeding `crashRecovery` + the log viewer.
26. Shared device-tier capability (`TierManager`) exposed so apps adapt themselves.
27. Shared power/thermal signals (`PowerManager`/`ThermalAdaptiveMonitor`/`xenonStore`) for apps to throttle.
28. Shared auto-update channel for the shell itself with rollback.
29. Shared data-export/import capability (`dataExport`) for portability and backup.
30. Shared "open with default app" mapping via `FileTypeRegistry`.
31. Document the ActionBus handler-registration contract for third-party automations.
32. Shared sandbox resource limits per app (CPU/memory) governed by `WorkloadGovernor`.
33. Shared "app declares its capabilities in its manifest" model enforced at install.
34. Shared per-app storage namespace so apps can't clobber each other's persisted state.
35. Shared localization/i18n framework so app strings are translatable.
36. Shared OS-integration layer (tray, global shortcuts, file associations) via the bridge.
37. Shared "headless/native-blocked" capability flags so renderer-only builds degrade honestly.
38. Shared transfer/sync capability (`FlowTransfer`) usable by any app, not just Transfers.
39. Shared media capability (`MediaCache`/`AudioPlaybackService`) for any app needing playback.
40. Shared screen-capture/recording capability gated by permission (Screen Recorder + UKI vision).
41. Document the command-registry as the supported "expose an action" platform API.
42. Shared "app health" reporting so the shell can surface misbehaving apps.
43. Shared config-migration runner for cross-version app/setting upgrades.
44. Shared "platform extensions" registry (`PlatformExtensions`) documented for capability plugins.
45. Shared "verify app signature / trust level" surfaced before granting capabilities.

## Future (40)

1. App marketplace with third-party submissions and review.
2. Workspace "spaces" that snapshot which apps + project + layout are active (build on `projectSpaces`/`stageStore`).
3. Cross-device sync of notes/tasks/settings/vault.
4. Scriptable automations chaining commands across apps (DEX-Script + Workflows + ActionBus).
5. Semantic search across all DEX data (notes, files, activity) via one index.
6. Live collaboration primitives shared by CollabHub, Nexus, and editors.
7. Themeable design-token packs beyond true-black.
8. Per-project dashboards aggregating tasks, notes, git status, and activity.
9. Offline-first data layer with conflict resolution.
10. Local-first encrypted sync with end-to-end encryption for sensitive stores.
11. Multi-window / multi-monitor stage spanning.
12. Shared automation marketplace (publish/share Workflows and skill packs).
13. UKI "autopilot" that proposes multi-app plans grounded in the active project.
14. Cross-app "timeline" (Rewind generalized) showing all changes across the project.
15. Embeddable DEX apps in external surfaces via the stable API.
16. Voice control bound to the command registry.
17. Real-time multiplayer editing across creative and document apps.
18. Project-scoped knowledge base auto-fed by `knowledgeFeeder`.
19. Pluggable provider backends for AI beyond the current keystore set.
20. Adaptive layouts that learn from `learningStore` usage patterns.
21. Cross-app "follow context" mode where opening one app primes related ones.
22. Shared "mission/goal" framework (`missionStore`) surfacing progress across apps.
23. Federated search across local + connected remote sources.
24. Shared "agentic workflows" where UKI executes long-running multi-step jobs with checkpoints.
25. Per-app extension points (UKI skill packs) installable from the marketplace.
26. Cross-device handoff (continue an app/session on another device).
27. Shared "spaces gallery" of community workspace templates.
28. Generative theming (UKI builds a token pack from a prompt/image).
29. Project health scoring aggregating tasks, git, tests, and activity.
30. Shared "replay my session" for debugging and onboarding (privacy-gated).
31. Cross-app macros recorded from real user actions via ContextBus.
32. Shared "smart inbox" aggregating notifications/results across apps.
33. Pluggable storage backends (local, cloud, self-hosted) behind the data layer.
34. Shared offline AI (local model) fallback wired into provider routing.
35. Cross-app citation graph linking notes, files, and AI answers.
36. Shared "focus session" framework (`FocusSessionSystem`) coordinating Pomodoro across apps.
37. Marketplace ratings/usage signals feeding `IntelligenceLayer` recommendations.
38. Shared "project export" bundling apps' state into a portable archive.
39. Live data widgets on the home grid fed by any app via a widget contract.
40. Cross-app undo timeline spanning multiple apps within a project session.

---

## Reference patterns (already proven in-codebase — build the rest to match)
- **UKI app-context registry** — `registerUkiAppContext` / `unregisterUkiAppContext` (`uki/appContextRegistry.ts`; see `pages/Tasks.tsx`).
- **Native-bridge degrade** — `dexInvoke`/`tauriCompat` resolving `null` off-platform (`services/platform/tauriCompat.ts`; see `pages/Tasks.tsx`).
- **Cross-app services** — `services/ContextBus.ts`, `services/ActionBus.ts`, `services/DexProject.ts`, `services/CreativeSuiteBridge.ts`.
- **Predictive prewarm + DexLoader-in-launch** — already shipped (`services/AppPredictor.ts`); mirror their approach for new async paths.
- **Idle reclaim + leak detection** — `utils/cacheExpiry.ts` sweep registry and `services/leakDetector.ts`; reuse for new long-lived state.
- **Shared async-load** — `utils/useAsyncResource.ts` (AbortController + timeout + unmount guard); the template for every fetch.
- **Tier-aware behavior** — `services/TierManager.ts` + `store/xenonStore.ts`; gate cost by device tier, consume kernel push events.
