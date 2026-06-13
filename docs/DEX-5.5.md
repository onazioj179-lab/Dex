# DEX 5.5 — System Refinement Release (authoritative program)

> Owner brief (2026-06-13): not a feature release — refinement, consolidation,
> optimization, platform maturity. DEX should feel like a cohesive desktop
> operating environment: faster, more stable, more intelligent, more consistent,
> more professional, more reliable. Users notice the polish without learning
> anything new.
>
> This file reconciles that brief against what already exists, so execution is
> incremental and nothing is duplicated or lost. It is the umbrella plan;
> [TAURI-MIGRATION.md](TAURI-MIGRATION.md) remains the detailed engine tracker
> and [REFINEMENT.md](REFINEMENT.md) the consolidation tracker. Status is honest:
> a large share of the brief already shipped this cycle.

## Status legend
- DONE — shipped and verified.
- IN FLIGHT — partially built, tracked in the engine docs.
- NEXT — not started, ready to sequence.
- DECISION — needs an owner call before building.

---

## Reconciliation (brief section -> reality)

### Architecture modernization
- **Rust-first migration** — IN FLIGHT (the core engine of the release). Already
  native crates: `dex-search` (Tantivy index/file indexer), `dex-smart-router`
  (AI routing), `dex-rewind` (rewind processing), `dex-scanner`, `dex-audio`,
  `dex-automation`, `dex-vault`, `dex-ai-runtime`. Already native Tauri modules:
  `relationship_graph.rs` (memory graph), `unified_notification_hub.rs`,
  `global_content_search.rs` + `full_text_index.rs` + `search_history.rs`,
  `statistics_dashboard.rs`, `daily_briefing.rs`, ~57 SQLite subsystems.
  REMAINING: workflow runtime native store; promote the search/notification/
  memory crates from "exists" to "the only path the renderer uses"; flip default
  to Tauri and retire Electron (TAURI-MIGRATION P4).
- **C++ performance modules** — DECISION. DEX today is Rust + TypeScript + Tauri,
  with no C++ toolchain. Rust already covers the listed perf needs (audio via
  Symphonia, search via Tantivy, scan hashing via rayon). Introducing C++ adds a
  cmake/clang toolchain, cross-platform build complexity, and a second native
  language to maintain. RECOMMENDATION: stay Rust-first; add C++ ONLY for a
  proven, specific gap with a mature C++-only library and no Rust equivalent
  (candidate area: hardware video encode/decode pipeline). Do not add C++
  speculatively. Needs an explicit owner decision before any C++ lands.
- **Tauri optimization** (startup/RAM/CPU/battery) — IN FLIGHT. Renderer is
  lazy-split per app; full-flat removed all backdrop-filter GPU cost this cycle.
  REMAINING: measured startup/RAM budget pass after the Tauri flip.

### Shell, Home, Dock, Windows
- **DEX shell** (navigation/windows/dock/search/notifications/widgets/context) —
  IN FLIGHT; the surfaces exist (AppManager, FloatingWindow, StageManager,
  AppOverview, dock, SpotlightSearch, NotificationBanners, HomeWidgets). NEXT:
  treat them as one coherent shell layer (consistent context + project awareness).
- **Home experience** — IN FLIGHT. HomeWidgets exists. NEXT: confirm/complete the
  brief's widget set (recent projects, recent notes, current tasks, active
  workflows, rewind summary, AI suggestions, pinned apps) with no clutter.
- **Dock 2.0** (thinner/cleaner/indicators/pinning/drag-order/context/workspace) —
  largely DONE. Dock redesign (DEX Sharp batch 3) + `dockPinStore` (pins, modes,
  magnification, drag reorder) already deliver most of this. NEXT: workspace
  awareness + context actions polish.
- **Window system** (snapping/grouping/linked/restoration) — DONE foundation.
  FloatingWindow snapping + shake + genie; `WindowManifest`/`windowStateKeeper`
  restoration. NEXT: linked-window groups polish.

### Search, Rewind, UKI
- **Search rewrite** (one instant index over notes/files/tasks/projects/workflows/
  commands/screenshots/conversations/plugins) — backend DONE/IN FLIGHT
  (`dex-search`, `global_content_search`, `full_text_index`, `search_history`).
  NEXT: a single unified search UI that fans across all sources with ranking
  (relevance + recency + project/context weighting). This is the highest-value
  user-facing slice.
- **Rewind 2.0** (session detection/reconstruction/timeline/searchability) —
  IN FLIGHT (`dex-rewind` crate + Rewind app). NEXT: trustworthy session
  detection + searchable timeline.
- **UKI as system intelligence** (context awareness, reliability) — IN FLIGHT.
  `appContextRegistry` + `liveContext` + chatActions planner exist. NEXT: more
  per-app context resolvers; reliability (plans/execution/memory recall) over
  new capability (REFINEMENT P5).

### Creative suite
- **Notes / Canvas / Whiteboard / Diagrams** — Notes is mature (editor, wiki
  links, TOC, AI assist, sanitized paste). The "canvas/whiteboard/diagram" apps
  map to Prism (raster), Vinx (presentation), Flux (motion), Forge, Axl (CAD),
  Nexus (3D). All received the DEX Sharp conformance + leak audit this cycle.
  NEXT: per-app depth passes (canvas zoom/selection/perf; diagram connector
  routing/auto-layout) — REFINEMENT P6.

### Visual design, navigation, notifications, settings
- **Visual refresh / glass reduction / visual standards** — DONE. Full-flat
  platform-wide, Dex-font unification, sharp/thin type, per-app conformance
  (DEX Sharp batches 1-7, shipped in #26). This entire brief section is complete.
- **Navigation audit** (every screen answers "what next"; remove dead ends /
  duplicate paths) — NEXT. Concrete, mostly-renderer, reviewable.
- **Notification system** (reliability/prioritization/grouping/persistence) —
  backend ready (`unified_notification_hub.rs`). NEXT: route the renderer through
  the unified hub as the single path; add grouping/prioritization UI
  (REFINEMENT finding 2).
- **Settings rewrite** (search-first; AI/privacy/developer/plugin sections) —
  PARTIAL (Settings already has search-related code). NEXT: verify/complete a
  true search-first filter + the four sections.

### Developer platform & silent services
- **Developer Hub** (plugin/workflow/agent/API/prompt testing) — IN FLIGHT
  (`DeveloperPanel` exists). NEXT: a centralized hub; harden plugin sandboxing/
  docs/perf.
- **Silent system services** (Activity/Context/Memory/Search/Workflow/
  Notification/Plugin) — mostly EXIST as managers/crates already. NEXT: formalize
  naming/ownership; keep invisible to users (REFINEMENT P9 architecture cleanup).

---

## Sequenced execution (safe, incremental — each its own batch)

The visual/security/native-foundation pillars are done. The remaining
user-visible value is concentrated here, ordered by leverage and safety.

> **Shipped 2026-06-13 (this batch):** slices 1-3 + the Home experience landed
> (renderer `tsc` + watermark green; reuse existing native backends; degrade
> gracefully under Tauri parity). Not yet runtime-smoke-tested (DEX dev server
> wasn't running) — eyeball live on next run. DELIBERATELY NOT auto-done: slice 4
> navigation audit (too subjective to fan out safely — needs a human pass),
> slice 5 Tauri flip (must NOT flip the shipping build blind — needs hardware
> testing), slice 6 per-app depth/Rewind 2.0/UKI reliability (large, open-ended).

1. **Unified Search UI** — DONE. Extended SpotlightSearch/SpotlightEngine to fan
   projects/workflows/commands/screenshots/conversations (atop the existing
   notes/files/tasks/apps/settings) with recency + foreground-app + active-project
   ranking boosts and per-source grouped sections. — one palette that fans `dex-search` +
   `global_content_search` over notes/files/tasks/projects/workflows/commands/
   screenshots/conversations, ranked by relevance + recency + active project.
   (Backend exists; this is the flagship slice.)
2. **Notification consolidation** — DONE. New `services/notify.ts` is the single
   path; 5 parallel notification systems collapsed onto the `unified_notification_hub`
   (dex.db-persistent) with grouping (by source), prioritization (severity order),
   and persistence; legacy Toast/SystemFeatures callers shimmed so nothing broke.
3. **Settings search-first** — DONE. Fuzzy search box (auto-focused, keyboard-nav,
   jump+flash to the exact control) over a ~150-entry index; AI + Developer
   sections added (surfacing existing controls), Privacy/Plugin keyword-reachable.
   New: `settingsPanels/settingsSearchIndex.ts`, `settingsPanels/DeveloperSection.tsx`.
3a. **Home experience** — DONE. `HomeDashboard` (in HomeWidgets.tsx) adds the 7
   widgets (Recent Projects/Notes, Current Tasks, Active Workflows, Rewind Summary,
   AI Suggestions, Pinned Apps) on real existing data sources with honest empty
   states. FLAG: no first-class "recent projects" channel exists — derived from
   the recent-files store; a dedicated subsystem is the proper long-term source.
4. **Navigation audit** — per-screen "what next?", remove duplicate nav paths and
   dead ends. Renderer-only, reviewable.
5. **Tauri flip prep** — drive `__dexDegradeReport()` to empty, then flip default
   + retire Electron (TAURI-MIGRATION P4). Unlocks the startup/RAM/CPU wins.
6. **Per-app depth + Rewind 2.0 + UKI reliability** — REFINEMENT P5/P6 passes.

## Decisions needed from the owner
- **C++ modules: yes/no.** Recommendation above is Rust-first; C++ only for a
  proven gap. No C++ work starts without this decision.

## Quality bar (unchanged, enforced)
No slice ships unless stable, type-checked (renderer `tsc` + main `tsc`),
watermark-clean, native crates `cargo check` green, and honestly documented here.
