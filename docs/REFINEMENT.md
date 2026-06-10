# DEX 6.0 — Refinement & Consolidation Initiative

> **The release theme: no major feature expansion, no feature bloat, no
> parallel systems, no duplicate functionality.** Transform DEX from a powerful
> collection of tools into a cohesive, premium, operating-layer experience.
>
> Every decision must pass one question: **"Does this make DEX faster, simpler,
> clearer, or more reliable?"** If not, do not build it.
>
> **This file is the living checkpoint for the initiative** (the engineering
> twin of [TAURI-MIGRATION.md](TAURI-MIGRATION.md), which remains the detailed
> migration tracker). Update it every session: mark what landed, add what was
> learned, keep the next-batch list honest. No emojis, no fluff.

---

## RESUME HERE — status and next batches

**Done (2026-06-10):**
- **P4 glass reduction is now consistent at the token layer.** GOAL-6D had
  landed blur -60% (`--blur-sm/md/lg/xl`) and shadow -40% for `--pg-shadow-*`
  only. This pass completed it: the legacy `--shadow-*` family (sm/md/lg/xl,
  float, glow, depth-1..4, inset, dock, card-hover) reduced -40%;
  transparency -50% applied to `--color-bg-glass(-strong)` (dark + light),
  the `--pg-surface/-sidebar/-toolbar` fallbacks, the boot fallback in
  `index.html`, and the M3 translucency rungs; `--dex-elevation` reduced -40%.
  Exemptions (documented in CSS): focus ring and inset white gloss highlights
  keep full strength (affordances, not elevation); the light-theme shadow
  block was already subtle (0.04-0.10 alphas) and is untouched.
- **All `backdrop-filter` blur literals in the styles layer now route through
  the blur tokens** (`design-system.css`, `design-tokens.css`, `globals.css`;
  ~105 literals replaced with the nearest reduced token; the `@supports
  (backdrop-filter: blur(1px))` probe intentionally kept). Perf-tier and
  thermal caps in `globals.css` tightened proportionally.

**Also done (2026-06-10, second batch):**
- **Component glass sweep (P2/P4):** all inline `backdropFilter` blur literals
  in renderer components now route through the reduced `--blur-*` tokens; the
  shared `glassMenu.ts` module applies the GOAL-6D -60% factor once inside
  `adaptiveBlur`/`liquidGlass` (call sites keep their historical numbers) and
  its shadow/glass-fallback literals carry the -40%/-50% passes. Only the
  deliberate 1-2px minimal blurs remain literal.
- **Radius standardization (P2):** ONE canonical scale (`--radius-*`,
  design-system.css). `--dex-radius-*` aliases it, the `index.html` boot
  fallbacks now match it (previously a conflicting third scale that flashed on
  load), and tailwind's window/dock radii bind to the vars. Remaining: the
  `tokens.ts` JS radius mirror + the per-component literal sweep.
- **Tauri migration, filesystem tail (P1):** voice-memo save (base64 audio ->
  `.opus` under data_dir/voice-memos) + whisper probe, media-library new-file
  import (fs stat + type detection) + thumbnail unlink on remove,
  backup:create/verify/restore/delete (full `.dexbak` gzip format parity).
  bulk-metadata / smart-rename turned out to be already fully ported (the
  checkpoint entry was stale). New shared `src-tauri/src/util.rs` (uuid, ISO
  timestamp) — one implementation each, used by session-replay/backup.
- **Duplicate-system audit (P1/P9) complete:** 15 confirmed findings with
  evidence, survivors, risk, and sequencing in
  [CONSOLIDATION-AUDIT.md](CONSOLIDATION-AUDIT.md). Headlines: 6+ parallel
  search indexers, 3-4 notification systems, 5 motion engines, 5x duplicate
  debounce/throttle, two file-watchers, two task-queues, three undo systems.

**Also done (2026-06-10, third batch — consolidation tier 1):**
- **Debounce/throttle merged (finding 6):** `src/shared/perf/helpers.ts` is
  the canonical superset implementation (leading/trailing/maxWait +
  cancel/flush); the four renderer copies are now re-exports.
- **Dead duplicate detectors deleted (finding 10):** `DuplicateContentFinder`
  (zero importers) and `SmartDuplicateDetector` (never instantiated, zero
  renderer callers). Survivors: `DuplicationDetectorManager` + `dex-scanner`.
- **NotesSystem deleted (finding 3):** never initialized; NotesManager is the
  system of record.
- **Context menus consolidated (finding 12, survivor REVERSED by evidence):**
  `ContextMenu.tsx` is live in 6 pages and stays; `EnhancedContextMenu.tsx`
  and `ToolContextMenu.tsx` had zero consumers and are deleted.
- **Finding 13 corrected, not executed:** FileWatcher (Phase 38) and TaskQueue
  (Phase 19) are LIVE via FileIntelligenceController / WorkflowController —
  retiring them requires rewiring those controllers first (see audit).
- **tokens.ts radius mirror** documented as bound to the canonical scale
  (values already matched).

**Next batches (in order):**
1. **Rewire FileIntelligenceController -> FileWatcherManager and
   WorkflowController -> TaskQueueManager** (finding 13), then retire
   FileWatcher.ts / TaskQueue.ts.
2. **Single modal host (finding 12 remainder):** one `useModal`/host, migrate
   the ~15 hand-rolled createPortal dialogs incrementally.
3. **Notifications consolidation (finding 2):** UnifiedNotificationHub as the
   single path; migrate the JSON NotificationCenter store; retire
   `notifications.rs` in favor of `unified_notification_hub.rs`.
4. Then the storage-migration tier (findings 5, 8, 9, 11) per the audit.

---

## Priorities (the full program)

### P1 — Performance: DEX should feel instantaneous
- Targets: startup < 300 ms, search < 20 ms, command execution < 50 ms, AI
  first token < 50 ms, near-zero UI stutter, smooth scrolling everywhere.
- Audit every system (Rewind, UKI, Notes, Canvas, Search, Dock, Notifications,
  Workflows, Plugins, Memory); remove duplicate processing, storage, indexing,
  rendering.
- **Tauri optimization is the core engine of this priority:** keep moving
  expensive logic out of JavaScript into Rust-native services, indexing,
  search, workflow execution, notifications. UI stays lightweight.
- Lazy-load everything: applications, panels, workspaces, plugins, views,
  indexes, AI providers.

### P2 — Consistency: one product, not multiple products
- Design audit of every screen: typography, spacing, radius, motion, padding,
  alignment, color usage, shadow usage.
- Every component from one design system (buttons, inputs, cards, lists,
  modals, toolbars, menus, panels, notifications — everything).
- One corner-radius scale; no random values; consistent across all apps.
- One icon family, weight, and style (the `--dex-icon-*` set: 16/20/24,
  1.75 px stroke).

### P3 — Fluidity: users should never feel friction
- Motion audit: remove slow animations, unnecessary transitions, bounce.
  Keep purposeful, context-preserving, fast motion (the v4.61 motion contract
  in design-system.css is the reference).
- Window fluidity: linked windows snap naturally, resize smoothly, move
  together, remember positions. No jumps, lag, or flashing.
- Dock fluidity: expands/collapses smoothly, responds instantly.

### P4 — Visual cleanup: reduce noise, increase clarity
- Glass reduction, global: blur -60%, transparency -50%, shadow -40%.
  **Token layer DONE (see RESUME HERE); component literal sweep remains.**
- Surface cleanup: layer hierarchy, content contrast, visual grouping,
  readability. Content first, effects second.
- Typography refresh: reading comfort, hierarchy, density, scanning speed.

### P5 — UKI refinement: smarter without becoming larger
- Context engine: automatic awareness of current project, task, active file,
  active workspace.
- Response quality: better action/workflow suggestions, project awareness,
  memory recall; fewer hallucinations and unnecessary responses.
- Execution reliability: plan generation, action execution, error recovery,
  permission handling. Reliability before capability.

### P6 — Creative apps: polish, not expansion
- Canvas: zooming, panning, selection, grouping, performance.
- Notes: editor speed, search speed, linking, formatting consistency.
- Whiteboards: rendering, layout, interaction quality.
- Diagrams: connection logic, alignment, smart placement.

### P7 — Search: a defining DEX feature
- Unified search over files, projects, notes, tasks, workflows, commands,
  screenshots, memory — one interface.
- Ranking: relevance, context awareness, project awareness, recent-activity
  weighting. (Native Tantivy index in `core/dex-search` is the foundation.)

### P8 — Reliability: every feature works every time
- Stability audit: track crashes, slowdowns, UI freezes, failed workflows,
  failed commands. Fix before shipping.
- Logging: better diagnostics, error reporting, debug visibility — especially
  UKI and workflows.

### P9 — Developer experience
- Internal tools: performance dashboards, workflow debugger, plugin debugger,
  memory inspector, search diagnostics.
- Architecture cleanup: reduce technical debt, duplicate systems, legacy code
  paths. Clear ownership for every subsystem.

### P10 — Finish existing features
- No new feature categories. Complete, polish, optimize, connect, document,
  test, and refine what exists.

## Release goal

Users should notice faster startup, faster search, better responsiveness,
consistency, visuals, reliability, AI behavior, and workflows — not because
there are more features, but because everything feels finished.

## Working rules for sessions on this initiative

1. Batch work; verify per the testing discipline (verify at batch end, not per
   change). Baselines that must stay green: `cd core && cargo test`,
   `cd src-tauri && cargo check`, `npx vitest run` for touched renderer areas.
2. Prefer the token layer / single source of truth over per-site edits; when a
   sweep is needed, make it deterministic and reviewable.
3. Never leave the tree broken between batches.
4. Update this file (and TAURI-MIGRATION.md when the migration is touched)
   before ending a session.
