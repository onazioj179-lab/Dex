# DEX OS - Backend & Intelligence Modernization Roadmap

Authoritative pre-release plan for v4.4.x -> v5.0. Refinement-first; no
feature bloat. Each section names the surface area, the concrete deliverables,
the existing files to evolve, and the acceptance signal.

Conventions:
- "Built-in" = ships in the renderer + main bundle, no external service.
- "Native" = Rust `dex-native` napi-rs module under `native/`.
- "Local-first" = no network calls in the hot path; offline must be 100%
  functional except for opt-in free-API enrichment.

---

## 1. UKI Built-In Backend Infrastructure

UKI's brain stops being "localStorage + ad-hoc fetch" and becomes a real
local data plane. Existing pieces (`uki/cache.ts`, `uki/memory.ts`,
`uki/compressedMemory.ts`, `uki/knowledgeFeeder.ts`,
`uki/index_search.ts`) are kept and grown.

### 1.1 Storage tiers

| Tier        | Backend                 | Purpose                          | TTL / cap         |
|-------------|--------------------------|----------------------------------|-------------------|
| Hot turns   | `uki:mem:turns` (LS)     | Last 200 conversation turns      | rolling window    |
| Warm        | `uki:mem:archive` (LS)   | gzip archives w/ summaries       | 100 MB default    |
| Cold        | `dex-native` SQLite      | Long-tail facts, embeddings, FTS | budgeted (>= 1GB) |
| Vectors     | `dex-native` HNSW        | Semantic search                  | rebuild-on-write  |
| Cache       | `uki:cache:*` (LS)       | Free-API responses (TTL)         | 5min - 24h        |

Deliverables:
- `native/src/uki_store.rs`: rusqlite-backed table set
  (`facts(id, source, key, payload, ts, embedding_id)`,
  `events(ts, kind, app_id, payload)`,
  `embeddings(id, dim, vec BLOB)`,
  `fts_facts USING fts5(content)`).
- napi exports: `ukiStorePut`, `ukiStoreGet`, `ukiStoreSearchFts`,
  `ukiStoreSearchVec`, `ukiStorePrune`.
- Renderer adapter `src/renderer/uki/store.ts` -> falls back to LS when
  native is unavailable (web preview, tests).

### 1.2 Semantic indexing + vectors

- Embed via on-device MiniLM-style model packaged as ONNX in
  `native/models/`. Native side runs `tract` for inference, returns
  Float32Array.
- HNSW index built incrementally; persisted to
  `%APPDATA%/DEX/uki/hnsw.bin`.
- Renderer surface: `uki/semanticSearch.ts -> search(query, k)` returns
  ranked `FactRef[]` joining FTS lexical + cosine vector scores.

### 1.3 Context-aware memory

- New `src/renderer/uki/contextEngine.ts` consumes existing
  `uki/context.ts` (foreground app, selection, time of day, recent files)
  and emits a `ContextSnapshot` per query.
- Snapshot is persisted as an `event` row -> retrievable via
  `recentEvents(window)`.
- Workflow history: `events.kind = 'workflow_step'` with run id.

### 1.4 Background indexing service

- `src/main/services/ukiIndexer.ts` (main process) wakes on idle (using
  `powerMonitor` + `app.getIdleTime()`); pulls new facts from renderer
  via IPC and pushes them through the embed -> store -> hnsw pipeline.
- Backpressure: max 250 facts/sec, max 8% sustained CPU. Monitored via
  `process.cpuUsage()` deltas.
- Resumable across restarts (cursor stored as `events.last_indexed_ts`).

### 1.5 AI task routing

- `src/renderer/uki/router.ts` already exists for slash commands; extend
  to route by capability tag rather than exact verb.
- Each app declares `ukiCapabilities: string[]` in `APP_DEFINITIONS`
  (e.g. `notes` -> `['create-note','search-notes','summarise']`).
- Router selects best app via lexical + embedding match against the
  capability index.

Acceptance: cold-search latency p95 < 60 ms for 100k facts; warm < 20 ms.

---

## 2. Backend Architecture Modernization

### 2.1 IPC + service bus

- Audit every `ipcMain.handle` registration. Migrate ad-hoc handlers in
  `src/main/index.ts` into named modules under
  `src/main/ipc/<domain>.ts`.
- Single `src/main/ipc/registry.ts` enforces:
  - Channel naming: `<domain>:<verb>` (`store:install`, `uki:vec:search`).
  - Auto-generated TS types in `src/shared/ipc/contracts.ts`.
  - Per-channel rate limits and origin checks.
- Drop `(window as any).electron`/`dexAPI` shims; expose one preload-
  scoped `window.dex` object with typed methods.

### 2.2 Background services lifecycle

- `src/main/services/ServiceHost.ts`: registry of long-lived services
  (UkiIndexer, FileWatcher, RewindRecorder, UpdateChecker, NotificationBus,
  PluginRuntime). Each service implements
  `init() / start() / stop() / health()`.
- Crash isolation: services run in a `utilityProcess` worker where
  feasible (Node 20 utilityProcess API).
- `health()` results surfaced in Task Manager > System tab.

### 2.3 Workflow execution pipeline

- `src/renderer/uki/workflows/Engine.ts`: deterministic DAG runner with
  step-level retry, timeout, compensation hooks.
- Plan -> Approve -> Execute already exists via ActionBus; formalise the
  state machine and persist runs to `events` table for Rewind.

### 2.4 Resource scheduler

- New `src/main/services/Scheduler.ts` allocates time slices to:
  indexer, file watcher, plugin loader, update checker. Priority lanes:
  `interactive > realtime > background > idle`. CPU budget per lane
  configurable.

### 2.5 File watching

- Replace any per-folder `fs.watch` with a single chokidar instance
  multiplexing watchers by mountpoint. Debounced 250 ms; coalesced
  events emitted on `files:changed` channel.

### 2.6 Notification routing

- `src/renderer/components/NotificationCenter` already exists; introduce
  `notifications:emit` IPC with categories (`system`, `app`, `update`,
  `security`) and DND policy enforced in main.

### 2.7 Plugin runtime

- Sandboxed via `vm` + structured-clone-only IPC. Manifest must declare
  required capabilities; missing capability -> install denied.
- Plugin storage namespaced under `plugins/<id>/`; quota 50 MB default.

### 2.8 Update + recovery

- `electron-updater` already wired. Add staged rollout via
  `update-server.json`'s `cohort` field.
- Recovery: on startup if `last_clean_exit != true`, open Rewind
  recovery panel listing the last 5 sessions.

Acceptance: clean shutdown of every service in < 1.5 s; service crash
restarts in < 2 s without renderer reload.

---

## 3. Desktop & Operating Workflow

### 3.1 Floating windows + workspaces

- Window metadata stored per workspace in `uki:cache:workspace:<id>` and
  in cold store for cross-session restore.
- New `src/renderer/services/WorkspaceManager.ts` merges existing
  `widgetStore`, `unifiedSystemsStore.useWorkspaceLayoutStore`,
  `wallpaperStore` into a single facade.

### 3.2 Snap + tile

- `src/renderer/components/AppManager` already supports drag; add
  edge-snap zones (left/right/top quarters/halves + 2x2 quadrant
  shortcut Win+Arrow). Implement as overlay in `SnapAssistant.tsx`.
- Hold Shift while dragging -> tiling group (windows resize together).

### 3.3 Dock + Stage

- Dock: pin/unpin, recents, running indicator, hover preview thumbnail
  (offscreen `<canvas>` snapshot per app, throttled 1Hz).
- Stage Manager equivalent: side strip showing other workspace clusters;
  click swaps cluster.

### 3.4 Multi-monitor

- Detect displays via `screen.on('display-added')`; persist per-monitor
  layouts. Per-monitor wallpaper, scaling, workspace assignment.

### 3.5 Background task management

- Visible in Task Manager: per-app CPU/RAM, per-service status, pending
  workflow steps. Kill / restart actions gated by approval card.

Acceptance: workspace restore p95 < 600 ms for 12 windows; snap
animation 60fps on integrated GPU.

---

## 4. UI & Shell Modernization

Tightening pass, no new visual language.

### 4.1 Tokens

- Move all hard-coded `rgba(...)` and pixel values in
  `src/renderer/components` and `src/renderer/pages` to CSS variables in
  `src/renderer/styles/tokens.css`.
- Spacing scale: 4-8-12-16-20-24-32-48. Radii: 4-6-8-12-16-20.
- Typography scale: 11/12/13/14/16/18/22/28; weights 400/500/600.

### 4.2 Glass + blur quality

- Single `src/renderer/styles/glassMenu.ts` source of truth (already
  present). Standardise on three intensities: `whisper` (4px),
  `panel` (16px), `overlay` (28px). Forbid inline `backdropFilter`.

### 4.3 Motion

- Spring tokens (`stiff`, `gentle`, `slow`) defined once. Replace any
  bare `cubic-bezier` strings.
- Respect `prefers-reduced-motion` everywhere; degrade to opacity-only
  transitions.

### 4.4 Hover + focus

- Every clickable surface declares `:hover`, `:focus-visible`, `:active`,
  `[aria-disabled='true']` states. Audit script in
  `scripts/check-interaction-states.js`.

### 4.5 Visual hierarchy

- Three-rail layout convention for full-page apps: nav rail (56px),
  primary list (260-320px), detail. Apps that diverge document why.

### 4.6 Accessibility

- Lint pass: every icon-only button must have `aria-label`. Add
  `eslint-plugin-jsx-a11y` rule set. Existing `A11Y_BUTTON_AUDIT.md`
  already tracks the backlog -> close it.
- Keyboard: every panel trapping focus must restore on close.

Acceptance: Lighthouse a11y >= 95 on every full-page app.

---

## 5. Windows-Inspired Improvements

Borrow concepts, do not clone visuals.

- Snap Layouts overlay on window maximize-button hover.
- App grouping in dock (right-click -> "Group with...").
- Hardware visibility: GPU/CPU/RAM live in Task Manager > Performance.
- Win+. (period) opens emoji + symbol picker (built-in, no IME shell).
- Game Mode: when a fullscreen GPU-bound app is foreground, suspend
  background indexer + dim notifications.

## 6. Linux-Inspired Improvements

- Tiling mode toggle (i3-style) with `Mod+H/J/K/L` navigation.
- `dexctl` CLI (built into the app installer) -> opens windows, runs
  workflows, queries UKI from a terminal: `dexctl uki ask "..."`.
- Modular config: `~/.config/dex/dex.toml` overrides settings; Settings
  UI writes through.
- Lightweight session: `--minimal` flag boots without optional services
  for low-power devices.

## 7. Internal Systems Optimization

### 7.1 Renderer

- Code-split every page lazily (already done via dynamic `import()`).
  Add a build assertion: no single chunk > 500 KB gzipped.
- Replace residual `useEffect` polling loops with subscription channels
  (`AbortController` everywhere; verified by lint rule).
- Memoize Zustand selectors with `shallow` where lists are returned.

### 7.2 Native

- Enable `lto = "fat"` and `codegen-units = 1` in
  `native/Cargo.toml` release profile.
- GPU-accelerated image ops (PRISM, Gallery thumbnail) use `wgpu` once
  the napi binding lands.
- Thread pool: `rayon` global pool sized to `min(cpus, 8)`; expose
  `setNativeThreadCap()` for low-power mode.

### 7.3 Startup

- Splash window paints first frame in < 200 ms.
- Defer non-critical service init by 1.5 s after `did-finish-load`.
- Persist a warm-cache of last-frame layout snapshot to skip first
  layout pass.

### 7.4 Idle

- After 30 s idle: drop renderer raster cache, garbage-collect Zustand
  stores' history slices, pause non-essential animations.

### 7.5 Targets

| Metric                   | v4.4 baseline | Target v5.0 |
|--------------------------|---------------|-------------|
| Cold start to interactive | < 2.5 s       | < 1.6 s     |
| Idle RSS                 | ~280 MB       | < 200 MB    |
| App launch (built-in)    | 350 ms        | < 180 ms    |
| Search 100k facts (p95)  | n/a           | < 60 ms     |
| Frame budget             | 16.6 ms       | 8.3 ms p99  |

---

## 8. Cross-App Intelligence

- Shared workspace memory: `workspace:current` keyed snapshot consumed
  by Notes, Tasks, DexCode, Browser to surface "Continue where you left
  off" cards.
- Shared clipboard: `ClipboardHistory` already exists; expose
  `clipboard:list / clipboard:pin` IPC for UKI to query.
- Cross-app DnD: `application/x-dex-ref` MIME type carrying
  `{appId, ref, label}`; receivers register `acceptDexRef(ref)`.
- Quick actions: contextual menu shows top 3 UKI suggestions derived
  from current selection + open apps.

## 9. Creative & Productivity Apps

Per-app polish; constraints, not redesigns.

- **VINX**: autosave every 30 s into `events` table; project crash
  recovery on next open.
- **Imosion**: lock audio thread at realtime priority via native
  `set_thread_priority`.
- **PRISM**: tile-based undo (already partial); cap history at 200 MB.
- **FORGE**: queue persisted to disk; resume on restart.
- **AXL**: parametric model nodes serialised to JSON Patch for diff.
- **Notes**: full-text search uses the new SQLite FTS5 store; backlinks
  computed in native.
- **Tasks**: respects DND; reminders flow through unified
  notifications.
- **Nexus**: project context emitted on focus -> shared workspace.
- **Files**: smart folders feed UKI `file-tags` collector.
- **Browser**: history + bookmarks already feed UKI; add downloads.
- **Rewind**: writes to `events` directly; replay UI reads back.
- **Collab Hub**: presence broadcast over local network discovery only
  (no cloud) until v5.

## 10. Stress Testing & Reliability

- `tests/perf/` new suite using Playwright + custom harness:
  - 24h soak test (open, close, switch every 30 s).
  - 50-window multitask test.
  - 1M-fact UKI search test.
  - Plugin overload (10 misbehaving plugins) -> all isolated.
  - Update interrupted at byte N -> resumes cleanly.
- Memory leak gate in CI: heap snapshot delta after 200 nav cycles
  must be < 5 MB.
- Crash report capture via `crashReporter.start({ uploadToServer:false })`;
  surfaced in Settings > Diagnostics.

## 11. Production Readiness Strategy

Phasing:

- **4.4.1 (immediate)**: IPC registry refactor, service host skeleton,
  notification routing unification, lint/a11y gate green.
- **4.5.0**: native `uki_store` (SQLite + FTS5), background indexer,
  semantic search behind feature flag.
- **4.6.0**: vector embeddings + HNSW; capability-based router; Rewind
  events table.
- **4.7.0**: snap layouts, multi-monitor parity, dexctl CLI.
- **5.0.0**: enable semantic search by default; Game Mode; full plugin
  sandbox; performance targets met; 24h soak passing.

Every phase ships behind a flag (`dex-feature-flags` localStorage
namespace) and graduates only when:
1. Telemetry-free local benchmark hits the target.
2. Soak test for the touched subsystem passes.
3. Two clean releases with the flag default-on for opt-in cohort.

Non-negotiables:
- No regressions in cold-start time, idle RSS, or input latency.
- No new always-on network calls.
- Every new IPC channel typed and rate-limited.
- Every new service implements `init/start/stop/health`.
