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
  Per-app depth passes — DONE (2026-06-13): grounded perf + interaction polish
  per app (zoom-to-cursor, viewport-clamped menus, input-field shortcut guards,
  RAF/listener-leak fixes, honest empty states, and wiring orphaned engine
  capabilities — Axl ConstraintSolver, Flux easing presets). See REFINEMENT P6
  session entry. Nexus already had its WS3 depth pass; not re-churned.

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
> testing). Slice 6 per-app DEPTH passes landed 2026-06-13 (see slice 6 below);
> Rewind 2.0 + UKI reliability remain open. Slice 4 navigation audit still needs
> a human pass.

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
2b. **App-internal toast surface** — DONE (follow-up to slice 2, was out of scope).
   The parallel `dex-toast` toast surface (`styles/components.tsx` `toast` +
   `DexToastContainer`, CleanUI `showToast`, and ~60 direct `dex-toast` dispatchers
   across the creative apps) was orphaned: `DexToastContainer` was never mounted,
   so every one of those toasts rendered nothing. DECISION: unify onto the single
   banner surface via `services/notify` with `transientOnly: true` (banner only,
   NEVER persisted to the center) rather than reviving a second renderer.
   AppManager now bridges `dex-toast` -> `notify({ transientOnly })`; `toast.*` and
   CleanUI `showToast` are thin shims that dispatch `dex-toast`; `DexToastContainer`
   is a deprecated no-op. Fixed a latent bug where `transientOnly` events still
   persisted (`UnifiedSystems` bridge keyed only on `_dexPersisted`; now also skips
   `_dexTransient`). DELIBERATE CARVE-OUT: AXL CAD keeps its own in-window toast
   (`axl/stores/uiStore` `toastMsg`) for high-frequency editor feedback
   ("Distance: x.x mm" during drag) so it never floods the banner stack or center.
3. **Settings search-first** — DONE. Fuzzy search box (auto-focused, keyboard-nav,
   jump+flash to the exact control) over a ~150-entry index; AI + Developer
   sections added (surfacing existing controls), Privacy/Plugin keyword-reachable.
   New: `settingsPanels/settingsSearchIndex.ts`, `settingsPanels/DeveloperSection.tsx`.
3a. **Home experience** — DONE. `HomeDashboard` (in HomeWidgets.tsx) adds the 7
   widgets (Recent Projects/Notes, Current Tasks, Active Workflows, Rewind Summary,
   AI Suggestions, Pinned Apps) on real existing data sources with honest empty
   states. FLAG: no first-class "recent projects" channel exists — derived from
   the recent-files store; a dedicated subsystem is the proper long-term source.
4. **Navigation audit** — PARTIAL (2026-06-13). Conservative pass: pages were
   already largely on the EmptyState "what next" pattern; fixed one real dead end
   (store/ReviewsPanel error state -> "Try again"). 3 items flagged for human
   judgment (see REFINEMENT consolidation-sweep entry). The broad redesign is
   still a human pass.
5. **Tauri flip prep** — PREP DONE (2026-06-13), flip NOT done (owner/hardware
   gated). Closed every renderer-fixable `__dexDegradeReport()` entry via new
   `services/platform/rendererShims.ts` (local motion/render/resource/input/
   WebAuthn answers + telemetry sinks); catalogued the genuinely native-pending
   channels (filesystem/keychain/process/data-store) as `NATIVE_PENDING` so the
   report is honest. Reaching an empty report needs Rust commands in `dex_ipc`
   (out of this slice). Then flip default + retire Electron (TAURI-MIGRATION P4).
6. **Per-app depth (P6)** — DONE (2026-06-13). Grounded depth pass across the
   creative suite (Prism, Flux, Imosion, Forge, Axl, Vinx, Canvas/PixelArt
   whiteboard) on non-overlapping file sets: refinement only, no new feature
   categories. Renderer `tsc` + main `tsc` + watermark (2525) green. **Rewind 2.0
   + UKI reliability** remain NEXT (REFINEMENT P5 + Rewind track).

## Decisions needed from the owner
- **C++ modules: yes/no.** Recommendation above is Rust-first; C++ only for a
  proven gap. No C++ work starts without this decision.

## Quality bar (unchanged, enforced)
No slice ships unless stable, type-checked (renderer `tsc` + main `tsc`),
watermark-clean, native crates `cargo check` green, and honestly documented here.

---

## Spatial Layout, Dock Positioning & Internal Plumbing (owner brief, 2026-06-15)

Owner direction: DEX should feel *engineered and grounded* — anchored to screen
edges, not floating / crowded / disconnected. The target compliment is "it feels
finished." Reconciled + sequenced below; much overlaps the DEX Sharp + UKI +
notification work already shipped this cycle, so this is incremental, not a redo.

### Spatial / layout (visible, renderer-verifiable)
- **Dock highlight removed + centering locked** — DONE (2026-06-15). Active/hover
  background squares hard-removed (icon glyph + running dot are the only
  affordances); the dock transition animates opacity only, never the centering
  `translateX(-50%)`, so it can no longer drift off-centre on a width change.
- **Window open/close motion de-bounced** — DONE (2026-06-15). Removed the 20%
  overshoot "boing"; gentle decelerate (`0.3s cubic-bezier(0.25,0.46,0.45,0.94)`).
- **Dock to the bottom edge / height audit** — DONE (2026-06-15). Trimmed per-preset
  edge margins (dockGeometry `EDGE_MARGIN_BY_PRESET`: regular 10->6, large 14->8,
  compact 4->3, floating 22->18): the dock now sits 6px off the bottom (was 10) and
  the reserved inset shrank 68->64px (more workspace). Height audit: already lean
  (40px icon + 8px padding = 48px) -- no trim needed.
- **Top bar centering + flat** — DONE (2026-06-15). Title/activity strip truly
  centred (was hard-pinned at left:280); removed a `backdrop-filter` straggler on
  the live-activity pill (full-flat conformance).
- **Apps out of bounds / not full screen** — DONE (2026-06-15). Killed the
  work-area "moving target" (removed the 320ms margin transition on the content
  surface so `getShellWorkspace` never reads a transient box) and gave the split-
  mode container the same `contain: layout` as the single surface, so position:
  fixed windows can no longer escape to the viewport.
- **Wall alignment (edges)** — DONE for the shipping surfaces (2026-06-15).
  Notification banners now anchor below the 34px chrome, flush to the right edge,
  and clear a top/right dock via the reserve vars; dock + top bar already edge-
  aligned. No other floating panel was found misaligned.
- **Empty-space / visual-weight / density** — DONE (substantively). DEX Sharp
  full-flat + per-app sweeps + per-app depth already cut decorative weight to the
  ONE 28/32/40 rhythm; no further blind density churn is warranted.
- **Workspace expansion** — DONE for the shell. Scroll/min-height fixes + the dock
  reserve reduction reclaimed content area.
- **Multi-app harmony / OS feel** — DONE at the system level (DEX Sharp shared
  tokens/rhythm + the motion/dock/chrome fixes). NOTE: the 65 creative-app modals
  use transform-centering (`translate(-50%,-50%)`) -- they ARE centred; converting
  them to flex-centering is a sub-pixel-blur nicety, not a misalignment, so it was
  deliberately NOT swept (65 risky edits across live-edited files for ~zero visible
  gain, against the quality bar).

### Internal plumbing / service consolidation (one owner each)
- **Notification service** — DONE. Single `notify()` path -> unified banner +
  `unified_notification_hub` (one queue / priority / renderer). Toast is a shim.
- **Context service** — IN FLIGHT. `appContextRegistry` + resolvers (Notes/Tasks/
  Files done 2026-06-15, `_foreground` fallback for the rest). Remaining: promote
  it to the single "active project / file / window / workspace" source every app
  reads.
- **Search service** — IN FLIGHT. Native `dex-search` (Tantivy) +
  `global_content_search` / `full_text_index`; the unified search UI is the lead
  remaining surface (ROADMAP).
- **Memory service** — IN FLIGHT. Native `relationship_graph.rs`; converge the
  renderer stores onto it (no duplicate index / retrieval).
- **Workflow service** — NEXT. One execution engine shared by UKI / automations /
  plugins / actions; needs the native workflow runtime store (TAURI-MIGRATION).

Sequence: spatial items first (visible, verifiable now), plumbing consolidation
follows the native-engine track. Quality bar above applies unchanged.

## Workspace Flow, Recovery, Stability & Completion (owner brief, 2026-06-15)

Philosophy: the system should disappear beneath the work — calm, fast, focused,
in control; flow like a river, carry complexity away. Status-mapped against what
already shipped so we extend rather than churn:

- **Multitasking / window arrangement / window-awareness** — PARTLY DONE.
  WindowManifest persistence + crash/clean-restart restore, dock centering fix,
  `clampWindowToWorkspace`/`fitWindowToWorkspace`/`cascadeWindow`, and the
  `--dex-reserved-*` workspace insets are in. Auto-arrange SURFACED 2026-06-15:
  the existing `autoTileAll` (predefined 1-6 window layouts, dock-context-menu
  only) is now also a Command Palette command ("Arrange Windows") via a
  `dex-arrange-windows` event — verified the command fires it and repositions
  windows into the layout. (Avoided duplicating it — found + reused the existing
  tiler.) KNOWN LIMIT: per-app min-widths can't shrink into narrow workspaces, so
  tiling overlaps when windows are wider than their cell (pre-existing; affects
  the dock auto-tile too). Min-size-aware capping DONE + preview-verified
  (2026-06-15): `autoTileAll` now computes max columns from a 560px usable-width
  floor and falls back to fewer columns / a vertical stack when the predefined
  layout's columns won't fit. Verified at 1920x1200 -> 3 windows tile with ZERO
  overlap (left + top-right + bottom-right, 951px each); at ~1135px -> a single
  full-width column (no horizontal over-columning). Residual vertical overlap
  only when the work area is shorter than the windows' stacked min-heights (a
  true space limit, not the algorithm). NEXT: a shared "available space / focus"
  awareness hook.
- **Drag & docking refinement** — window drag works; NEXT: precision pass (no
  stutter/glitch), snapping/alignment guides for floating windows.
- **Scrolling / progressive loading** — major list surfaces DONE (2026-06-15).
  Audit result: Gallery (`@tanstack/react-virtual` + IntersectionObserver) and
  Files (`visibleCount` + IntersectionObserver) were already windowed;
  Achievements windowed earlier. Added windowing to the two unbounded gaps,
  both preview-verified: Notes (`NoteListPanel`, 80/page, scroll + "Load N more";
  favorites/pinned full) -> 100 seeded showed 80 + "Load 23 more" -> 103 on click;
  Tasks (`pages/Tasks.tsx`, 60/page, gated to non-manual sort so drag-reorder
  keeps every row) -> 80 seeded showed 60 + "Load 20 more" -> 80 on click. Both
  windows reset on filter/search change. Remaining: opportunistic checks on any
  future large lists (project libraries) as they appear.
- **Zero hidden work / visibility** — DONE in spirit. Full-flat de-glassing, blur
  kill switch, bottom-fade reduction; the modal scrim is the one intentional dim.
- **Stability / zero black screen / state preservation** — PARTLY DONE. DEX-wide
  crash recovery screen (batch 5) + WindowManifest geometry restore. NEW: blank/
  frozen-window watchdogs + recovery paths on every surface.
- **Recovery Mode** — recovery screen + auto-recovery exist; EXPANDED 2026-06-15:
  added `exportDiagnostics()` (crash history + environment -> downloadable JSON,
  read-only/no data touched) wired to the root crash screen ("Save diagnostics")
  AND a Command Palette command ("Save Diagnostics Report"). Preview-verified:
  command present, invoking it triggers a valid diagnostics download
  (generatedAt/userAgent/crashReports…). Safe "reset settings" DONE +
  preview-verified (2026-06-15): `resetSettingsToDefaults()` clears an explicit
  13-key ALLOWLIST of UI/appearance prefs (dex-settings/theme/accent/reduce-motion/
  window-controls/stage-manager/volume/clock/focus/recent-actions/tab-order) and
  nothing else — audited against `dataExport.ts` DATA_SECTIONS so no data key
  (notes/tasks/kanban/clipboard/projects/…) is ever touched; a missed key fails
  safe. Surfaced as a Command Palette command "Reset Appearance & Settings"
  (window.confirm + reload). Verified: command present; allowlist ∩ data-keys = ∅.
  NEXT: restore-last-session already runs on reload; plugin repair.
- **Internal architecture completion** — the native Tauri flip (all 8 core crates
  exposed) + command-layer tail (terminal/PTY, OS accent, live file-watcher, HTTP
  transfer done 2026-06-15). System communication = the plumbing consolidation
  above (one action updates all relevant systems).
- **Keyboard power user** — shortcut viewer + SEARCH DONE + preview-verified
  (2026-06-15): rebuilt `components/KeyboardShortcuts.tsx` (already mounted in
  App.tsx, was inaccurate/incomplete) — catalog now mirrors the real AppManager
  bindings (42 shortcuts across Apps / Assistant & Search / Windows & Layout /
  Focus & Dock / Navigation; removed stale wrong entries like AXL/Lock/Fullscreen),
  added a live search box (Ctrl+/ or "?" to pin), and replaced the heavy black
  overlay with a solid panel + light scrim (honors "zero hidden work"). Verified:
  Ctrl+/ opens "42 shortcuts", searching "tile" -> "2 of 42". Per-user
  customization (slice) DONE + preview-verified (2026-06-15): a persisted
  "Show on holding Ctrl" toggle (`dex-shortcuts-hold-reveal`) lets users disable
  the hold-Ctrl auto-reveal while keeping Ctrl+/ and "?" — isolated to
  KeyboardShortcuts.tsx, no keydown-core change. Verified: default on; uncheck ->
  'false', recheck -> 'true'. NEXT: chained (multi-key) shortcuts remain — they
  need conflict-safe sequencing in the shared keydown handler (deferred as risky).
- **Accessibility** — `keyboard-nav`/`i18n` channels exist. Focus management
  IMPROVED 2026-06-15: applied the existing `useFocusTrap` (Tab-trap + focus
  restore-on-close) to the shortcut viewer, workspace-presets manager, and the
  notes template selector. Preview-verified: opening the shortcut viewer moves
  focus into it and closing restores focus to the triggering element. NEXT:
  screen scaling, large-display support, broader modal/overlay focus audit.
- **Utility audit** — Task Manager / Calculator / Browser / Files / Settings /
  Notifications / Clipboard: fast, reliable, clear, consistent; none unfinished.
  Audit DONE 2026-06-15 (preview, zero console errors, no bugs found across 7
  utilities): Calculator (7+8=15, AC clears to 0), Settings (opens/renders), Task
  Manager (live CPU/memory/processes), Clipboard History (opens/renders), Browser
  (opens, address input present), Gallery (opens), Notification Center (panel
  opens) all verified functional. No fix needed — code is sound, no churn.
- **Templates / presets / workspace memory** — Notes starter templates DONE +
  preview-verified (2026-06-15): `src/renderer/store/noteTemplates.ts` (Daily
  Plan, Weekly Plan, Meeting Notes, Research Notes, Journal, built from the
  document-model helpers); `notesStore.loadTemplates` merges them in and
  `createFromTemplate` materializes the chosen one via the standard `create`
  path (the `dexnotes:listTemplates` backend was an empty stub). Verified in the
  browser preview: all 5 render in "Choose a Template", and selecting Daily Plan
  creates+opens a note titled "Daily Plan" with its structured content.
  Workspace layout presets DONE + preview-verified (2026-06-15): new
  `shell/WorkspacePresets.ts` (named layouts in localStorage) + AppManager
  event-driven save/restore reusing the crash-recovery launch+clamp path
  (`dex-workspace-save`/`dex-workspace-restore` CustomEvents), surfaced as
  Command Palette commands ("Save Workspace Layout" + dynamic "Restore Workspace:
  <name>"). Verified: detach Notes -> save -> preset stored `['notes']`; palette
  lists both commands; restore handler fires + relaunches the app (geometry rides
  the same rAF-gated restore as crash recovery — not observable headless, code
  path identical). Board/dev/media note templates DONE + preview-verified
  (2026-06-15): added Sprint Planning, Architecture Review, Project Tracker,
  Brainstorm, Storyboard, Product Plan, Content Plan, Production Workflow to
  `noteTemplates.ts` (13 total) — all render in the selector; Sprint Planning
  creates a titled note with its sections. Visual presets manager DONE +
  preview-verified (2026-06-15): `components/WorkspacePresetsPanel.tsx` (mounted
  in App.tsx, opened via `dex-workspace-manage` from the Command Palette "Manage
  Workspace Layouts" command) lists saved layouts with Restore / Rename / Delete;
  verified rename updates+persists and delete removes + shows the empty state.
  Workspace-memory loop complete (save + restore + manage). Built-in workspace
  PRESETS DONE + preview-verified (2026-06-15): `WORKSPACE_TEMPLATES` in
  `shell/WorkspacePresets.ts` (Development = DEX Code+Files, Writing =
  Notes+Browser, Research = Browser+Notes+Rewind, Creative = Canvas(axl)+Gallery+
  Notes — each with `uki: true`). The panel shows a "Starter layouts" section;
  applying one dispatches `dex-workspace-apply-template`, which opens each windowed
  app via the proven `dex-open-in-window` path then runs the min-size-aware
  auto-arrange, and summons the UKI overlay separately (UKI is a global assistant,
  NOT a tiled window — opened only if not already open). Verified: "Writing" tiles
  [browser, notes] and flips the dock control to "Close UKI" (UKI summoned).

Happiness test for every change: "Does this make work easier?" — not "does this
add a feature?". Verifiable renderer/UX items lead (browser preview); native
recovery/state items ride the migration track.

## Workspace Structure, Multitasking & System Cohesion (owner brief, 2026-06-15)

Maturity-phase expansion (pasted owner doc + /goal). Status-mapped against shipped
work so we deepen rather than re-churn:
- **Multitasking / multi-split / smart layout** — auto-arrange is min-size-aware;
  WindowManifest persistence + presets done. Explicit split RATIOS DONE +
  preview-verified (2026-06-15): `applySplitRatio(ratios)` in AppManager arranges
  the open windows into full-height columns sized by ratio, floored at each app's
  real min-width (`APP_WINDOW_MIN_SIZES`) with overflow trimmed from slack columns
  — so a narrow pane never clips/overlaps; falls back to the tiler + a notice when
  even the mins can't fit. Fired by `dex-split-layout {ratios}`; Command Palette
  exposes "Split 50/50", "Split 70/30", "Split 60/20/20". Verified at 1600px:
  70/30 on notes+browser tiles with ZERO overlap, both within the viewport (browser
  floored at its 720 min, notes takes the rest). Live neighbor-rebalance on manual
  resize DONE + preview-verified (2026-06-15): the right-edge resize handler finds
  a window flush to the dragged edge and moves its left to follow (right edge fixed,
  floored at the neighbor's min-width) — live during drag + committed via the
  existing clampWindowToWorkspace/setDetachedApps path; the no-neighbor case is
  byte-identical to the prior handler (no regression). Verified at a 1700px viewport:
  dragging notes' right edge left ~160px narrowed notes by 163, moved browser's left
  left by 162, widened browser by 163, and held browser's right edge fixed (Δ2px) —
  the divider behavior. (An earlier "couldn't verify" was a collapsed 14px preview
  viewport, not the feature.) Left-edge mirror DONE + preview-verified (2026-06-15):
  dragging a window's LEFT edge rebalances the window flush to its left (that
  neighbor's left stays fixed, its right follows; floored at the neighbor's
  min-width). Verified at 1700px: dragging browser's left edge right held notes'
  left fixed (Δ−2px) and widened notes ~150 as browser narrowed — so BOTH edges of
  a divider now rebalance.
- **Workspace presets (Dev/Writing/Research/Creative)** — DONE (above), opens +
  tiles windowed apps + summons UKI.
- **Window awareness / stability / restoration** — restore + crash recovery +
  dock-glitch fix done. NEW: shared available-space/focus hook; resize-glitch sweep.
- **Task Manager 2.0** — audited (functional). Health monitoring DONE +
  preview-verified (2026-06-15): a `health` model (`pages/TaskManager.tsx`) derives
  healthy/elevated/critical from live CPU/memory, frozen-app count, and a runaway
  top process; a header health PILL + a conditional BANNER list the issues and
  offer a recovery action (End the worst CPU offender via the existing kill-confirm
  flow). Verified by injecting a 92% CPU / 95% memory + a 95%-CPU process: pill ->
  "Critical", banner lists all three issues + "End runaway.exe"; healthy state shows
  no banner. Workflows SECTION DONE + preview-verified (2026-06-15): a full-width
  "Workflows" panel reads the saved automations (same `workflows:getAll` /
  `localStorage['dex-workflows']` source as the Workflows app) and shows each with
  step count + last-run (read-only — run status is ephemeral in the engine).
  Verified by seeding two workflows: both render with correct steps ("4 steps" /
  "2 steps") and run-times ("last run … ago" / "never run"). NEW: Services/Plugins
  sections still need a renderer source (no store yet) — flagged, not faked.
- **Utility / creative consistency** — utility audit done; shared zoom engine
  (Prism/Flux) done. Zoom keyboard-shortcut parity DONE + preview-verified
  (2026-06-15): Flux gained Ctrl/Cmd +/- (zoom) and Ctrl/Cmd 0 (reset to default),
  matching Prism — both 2D-canvas apps share `useCanvasZoomPan`, now with identical
  shortcuts. Verified via the Flux canvas transform: Ctrl+= scaled 0.6->0.69 (x1.15),
  Ctrl+0 reset to 0.5. FINDING (do-not-force): the other creative apps use
  fundamentally different viewport models — Imosion = 1D audio-timeline zoom, AXL =
  3D viewport (viewportStore), Vinx = video timeline — so the 2D pan+zoom hook is
  correctly NOT applied there (forcing it would regress, not unify). The zoom
  consistency axis is therefore appropriately complete.
- **UKI context mesh / action routing, scroll virtualization (Notes/Tasks done),
  density, cohesion, architecture** — continue on the native + context tracks.
