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

**Also done (2026-06-10, fourth batch — typography + token closeout):**
- **One text vocabulary (P2/P4):** deleted the unused "M1 per-region" semantic
  size/leading set (zero consumers — a dead parallel vocabulary);
  `--text-md` is now an alias of `--text-base`; `--leading-normal` aliases
  `--leading-base`; `--tracking-tight/normal` alias their value-identical
  `--ls-*` rungs; unused `--leading-tight` deleted. Zero visual change —
  aliases are value-identical, deletions had no consumers.
- **Font stacks documented as the complete set** (mono identity
  `--font-family` for code/data surfaces vs `--dex-font-ui` chrome default);
  tailwind fontFamily/fontSize now bind to the CSS tokens instead of
  restating them; tokens.ts fontSize mirror completed (3xl/4xl) + documented.
- **Radius closeout:** all scale-exact `border-radius` literals in
  design-system.css/globals.css swept to tokens (~90 sites incl. pill
  idioms 100px/999px/9999px -> --radius-full); `--pg-row-radius` bound to the
  scale. Remaining off-scale literals flagged for visual review: 4x 14px,
  1x 16px, 1x 5px, 1x 7px (plus sub-scale 1-2px hairlines, intentional).
  Component inline borderRadius numbers remain (JS numbers; sweep later
  with visual sign-off).

**Also done (2026-06-10, fifth batch — boot token parity):**
- **Every boot-fallback token in index.html now equals its runtime value.**
  A scripted diff found 17 drifted tokens (every surface/text/border color,
  success/warning hues, both font stacks, glass alpha) — the app flashed the
  wrong look on every launch since whenever these diverged. All aligned;
  the boot body now uses --dex-font-ui like the runtime rule.
- **Boot-only tokens given runtime owners:** --color-danger (alias of
  --color-error), --color-accent-text/-subtle, --color-shadow-soft/-strong
  were defined ONLY in the boot HTML while runtime components consumed them.
  Now owned by design-system.css; shadow-color alphas carry the GOAL-6D -40%
  pass (Browser.tsx shadows had escaped the sweep behind these vars).
- Parity is scripted (see git history of this batch) — rerun it after any
  index.html or token edit.

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

## UX Depth 250 program — Session 1 (2026-06-10)

WS0 scaffold + WS1 free tiers/updates + WS6 recovery levels. Checklist:
docs/UX_DEPTH_250.md. Verified: lint (tsc + watermark 2520 files) + build:main green.

- WS1 free tiers: all 41 FEATURE_FLAGS_CONFIG gates -> 'free'; new + existing
  installs pinned to pro-equivalent, no trial clock, getLimits() returns null.
  Licensing machinery untouched (reversible). LicensingManager.ts.
- WS1 payments hidden: AccountSettingsCard PAYMENTS_ENABLED=false flag gates the
  manage-subscription button, UpgradePrompt, Billing/PlanCompare/PaymentMethod
  panels; plan line shows "Free — all features included". Files kept. Store.tsx
  had no plan gating to strip.
- WS1 immediate updates: ReleaseManager DEFAULT_CONFIG autoDownload true,
  autoInstall (install-on-quit) true, checkInterval 24h -> 4h; loadConfig pins
  download/install policy for existing installs; autoInstallOnAppQuit wired.
- WS6 L1: shellPreferences.autoRecoverApps (default on); ErrorBoundary auto-fires
  the existing bounded handleRecover while crashCount < 3; Settings toggle added.
- WS6 L2: new windowStateKeeper.ts persists main-window bounds + maximized to
  window-state.json, restores with multi-display visibility validation; wired
  into main.ts createWindow.
- WS6 L3: last-session journal in runningApps (writeJournal debounced, marked
  clean on pagehide/beforeunload); AppManager shows a one-click "Restore your
  workspace?" banner when the prior session ended unclean within 24h.
- FLAGGED FOR USER SIGN-OFF (not executed): tier/ad language in
  policyDocuments.ts TERMS section 8, PRICING.md, TERMS.md (UXD-025).

## UX Depth 250 program — Session 2 (2026-06-10)

Parallel implementation across non-overlapping file sets. Verified: full lint
(tsc + watermark 2520) + full build (renderer + main) green.

- WS3 Nexus modernized in place (standalone/Nexus.tsx): additive layered node
  bloom (lighter compositing + restore), z-depth size/alpha/saturation cueing,
  3-shell parallax starfield with deterministic twinkle, gradient connection
  lines, radial vignette, glass HUD with tabular-nums + tighter tracking;
  rotating hexagons replaced by concentric breathing rings + golden-angle
  particle orbit. New oscillations gated by prefers-reduced-motion. All morph
  modes / drag-rotate / zoom / tooltips intact.
- WS4 Notes depth: [[wiki-link]] autocomplete (caret-anchored popup mirroring
  WordSuggestions) + render/round-trip in NotesDocumentModel; TableOfContents
  outline (H1-H3, click-to-jump) in right panel; drag-drop attachments with
  drop-target highlight; AutosaveIndicator wired to store.saving. Pinned-notes
  grouping already existed (left intact).
- WS7 accessibility: real WCAG-AAA high-contrast palette ([data-high-contrast]
  dark + light overriding all --color-* tokens, hairlines to ~0.4) wired live to
  the existing Settings toggle (was pointing at nothing); WCAG-1.4.12 text
  spacing controls (letter/line/word multipliers as root CSS vars, persisted);
  contrast checker in AccessibilityManager flagged available for a dev overlay.
- WS2 partial: AutosaveIndicator mounted in Prism/Flux/Forge/Imosion headers
  with honest dirty->saving->saved state. ScrollEnhancements wraps deferred
  (real panels use differing token backgrounds; wrapping risked layout/fade
  regression) — revisit with a token-aware fade. FINDING: prism/PrismUI.tsx and
  flux/FluxUI.tsx are dead code (zero importers) — candidates for deletion.

## UX Depth 250 program — Session 3 (2026-06-10): WS5 compact mode

Verified: full lint (tsc + watermark 2521) + full build (renderer + main) green.

- New src/renderer/shell/MiniShell.tsx + useCompactMode zustand store: single-
  window morph (no 2nd BrowserWindow), shows active app + 3 quick actions
  (Notes/Timer/Clipboard — each expands then fires a real, listened event) + an
  expand control. Press feedback + hover via MotionController cssTransitions.
- Main process IPC (main.ts): window:enter-compact saves bounds, unmaximizes,
  shrinks to a corner pill (clamped to the current display's work area via
  screen.getDisplayMatching), setAlwaysOnTop('floating'), non-resizable;
  window:exit-compact restores saved bounds + resizable + min size. Exposed
  through preload window.enterCompact/exitCompact (window: prefix already
  allow-listed).
- App.tsx renders MiniShell as a top overlay when compact (apps keep running
  underneath, so expand returns to exact state); global Ctrl+Shift+M shortcut;
  new dex-open-clipboard listener so the compact clipboard action is real.
- Discoverable: Spotlight action "Compact Mode (Mini Window)" + a Settings
  shell-section "Enter compact mode" button.

## UX Depth 250 program — Session 4 (2026-06-11): perf sweep + release prep

Verified: full lint (tsc + watermark 2519) + full build green; version 5.1.0.

- Perf sweep: two confirmed memoization fixes — Stopwatch bestLap/worstLap (ran
  ~60x/sec via the RAF elapsed tick) and AXL FeatureTree totalWeight (volume/
  weight math per part on every render). Triaged ~20 agent findings and rejected
  the false positives: App.tsx auto-lock listeners + MutationObserver already
  clean up; Timer interval is cleaned up and playSound is a stable useCallback;
  WorldClock + ClipboardHistory already pause on visibilitychange and cap growth.
  Note-list virtualization deferred (only helps at 500+ notes; risky on the
  flagship file) — flagged as a scaling follow-up.
- Context menu: submenus now flip leftward near the right screen edge instead of
  overflowing off-screen (edge-aware subDir).
- Release prep for v5.1.0 (staged, NOT pushed/published — outward steps are the
  user's): package.json 5.0.1 -> 5.1.0; docs/CHANGELOG.md v5.1.0 entry; in-app
  WhatsNewModal entries refreshed; docs/RELEASE_v5.1.0.md checklist (repo
  topology Dex + dex-updates feed, exact release-script commands, signing note,
  legal-text sign-off flag); docs/RELEASE_NOTES.md public block + commit message.

## SOTA 1000 program — Batch A / WS1 first sub-batch (2026-06-11)

Crash-first. Verified: npm run lint (tsc + watermark 2520) green. Checklist: docs/SOTA_1000.md.

- Terminal crash root cause (SOTA-001..009): PtyService now validates the shell
  binary before spawn with a fallback chain (Win pwsh->powershell->cmd, unix
  $SHELL->zsh->bash->sh); an ENOENT spawn error emits a clean pty:exit and removes
  the session instead of leaking a dead one; real resize tracking. Terminal.tsx
  gained bounded exponential-backoff retry, a fast-fail vs clean-exit distinction
  (no more respawn loop), and an "unavailable" state with a Retry button.
- Global process guards (SOTA-010..013): main.ts installs uncaughtException +
  unhandledRejection handlers (there were none -> silent main-process death) with
  a fatal-error circuit-breaker, plus exponential backoff + jitter on the renderer
  crash-reload (was a fixed 500ms storm).
- Native-module crash guard (SOTA-014..015): new src/main/native/safeSqlite.ts
  contains the better-sqlite3 require so a missing/incompatible prebuilt binary
  degrades to fallbacks instead of killing startup at module-load; 8 managers that
  used unguarded `import Database from 'better-sqlite3'` now route through it
  (type fidelity preserved via typeof import + namespace re-export).
- Universal-only build rule (SOTA-340..342, WS12 applied early): package.json
  build.win.target is nsis-only (per-arch x64/arm64, portable, zip removed),
  artifactName drops -${arch}, and the package:win:x64/arm64/portable scripts are
  retired — every build now produces exactly one DEX-Setup-<version>.exe.

## SOTA 1000 — Batch A / WS1 second sub-batch (2026-06-11)

Verified: npm run lint + main tsc green.

- Perf-tier startup pacing (SOTA-016): initializeSubsystems now detects getPerfTier()
  and on ultra-low/low tiers yields to the event loop (breathe()) between the ~30
  subsystem .start() groups instead of one synchronous burst, so weak machines no
  longer thrash/crash at startup. perf:getTier IPC + 'perf:' allowlist added so the
  renderer reads one authoritative tier (SOTA-018).
- ErrorBoundary coverage (SOTA-017): audited — AppManager already wraps all four app
  render paths (keep-alive/detached/current/split) in AppErrorBoundary; one sub-app
  crash cannot kill the renderer. No change needed; verified, not fabricated.
- GPU crash resilience (SOTA-019..020): app.on('child-process-gone') records GPU
  process crashes to gpu-state.json; shouldDisableHwAccel() trips after 2, so the next
  launch calls app.disableHardwareAcceleration() and software-renders instead of a
  blank screen on flaky integrated GPUs. Count clears after 60s of stable run, and
  DEX_FORCE_GPU / DEX_DISABLE_GPU env overrides are honoured.

## SOTA 1000 — WS3 trackpad smoothness first sub-batch (2026-06-12)

Verified: npm run lint (tsc + watermark 2520) green.

- SmoothZoom (SOTA-090..094): added an immediate, non-animated zoom path (functional
  setTransform) for live gestures so high-frequency pinch/wheel events no longer each
  start a 200ms animation that stacks and stutters. A live transformRef removes the
  stale-scale read that caused jumpy pinch. Trackpad pinch (ctrl/meta wheel) now zooms
  immediately and cursor-anchored with exponential speed mapping; two-finger trackpad
  scroll pans the canvas (opt-in enableWheelPan); touch pinch is immediate too. The
  discrete button/wheel-click zoom keeps its smooth 200ms animation.

## SOTA 1000 — WS3 smoothness + Liquid Glass (2026-06-12)

Verified: npm run lint (tsc + watermark 2520) green.

- ScrollEnhancements (SOTA-095..097): added a configurable fadeColor prop so the
  top/bottom fades match the wrapping panel's background — this was the exact
  mismatch that blocked wiring it into the creative apps, now unblocked. Removed a
  dead velocity ref. Kept native scroll momentum (WebkitOverflowScrolling) rather
  than faking a JS reimplementation that would fight the OS — honest call.
- Liquid Glass material (SOTA-098): new .dex-liquid-glass utility gives the
  macOS-Tahoe "lit glass" look — a bright top specular rim falling off down the
  side edges — composed only from existing tokens (--surface-glass, --blur-lg,
  --shadow-premium-md, --color-border-glass). Auto-degrades: the universal
  html[data-perf-tier="low"] * rule strips the blur on weak machines, and
  prefers-reduced-transparency drops it for accessibility.

## SOTA 1000 — WS2/WS24 verified findings + RadioGroup (2026-06-12)

Verified: npm run lint green. Honest corrections to the audits:

- WS2 engine code-split: SKIPPED with reason — vite.config already lazy-loads each
  app into its own chunk (opening one app never downloads others), and a code comment
  documents that splitting axl's engine into sub-chunks caused a production circular-dep
  crash ("Cannot access 'S' before initialization"). Re-attempting would reintroduce a
  known crash. Not done.
- WS24 missing components: the audit was WRONG — Toggle/Checkbox/Slider already exist
  as DexToggle/DexCheckbox/DexSlider in shell/UIComponents, re-exported via ui/index.
  Deleted the redundant Switch.tsx/Checkbox.tsx duplicates I had drafted rather than
  ship dead duplicates. Added the ONE genuinely-missing primitive: DexRadioGroup
  (role=radiogroup/radio, aria-checked, arrow-key roving selection), exported as
  RadioGroup from the ui barrel. Tabs/Tooltip remain genuinely missing (open).
- design-system: added --shadow-hover / --shadow-pressed state tokens for hover-lift
  and press-in affordances.

## SOTA 1000 — Tabs primitive + audit-vs-reality finding (2026-06-12)

Verified: npm run lint green.

- Added DexTabs (role=tablist/tab, aria-selected, arrow-key roving, spring underline
  indicator), exported as Tabs from the ui barrel. This was the one genuinely-missing
  shared primitive (apps rolled their own inline tab bars).
- IMPORTANT FINDING: the design-system audit over-claimed "missing components". Verified
  already-present: Toggle/Checkbox/Slider (DexToggle/DexCheckbox/DexSlider), Tooltip
  (the [data-tip] CSS system in uiPolish.ts). Only RadioGroup and Tabs were truly
  missing — both now added. Net: the component layer is far more complete than the
  1000-item plan implied; remaining real work is narrower than the headline count.

## SOTA 1000 — WS5 Prism: adjustment editor + Curves graph (2026-06-12)

Verified: npm run lint + full build green.

- Real feature, engine-grounded: Prism's pixel engine already supported curves,
  levels, brightness/contrast and hue/saturation (applyAdjustmentToImageData +
  curveLUTFromPoints), but updateLayerAdjustment was never called by any UI, so
  adjustment layers applied defaults and could not be tuned. New
  prism/AdjustmentControls.tsx provides the editor: sliders for the scalar
  adjustments and an interactive Curves graph (draggable control points over a
  0..255 square, click to add, right-click to remove, live LUT rebuild via
  curveLUTFromPoints, reset). Wired into the layer-properties panel, replacing the
  static "Adjustment: {kind}" text; edits flow through updateLayerAdjustment ->
  setLayers -> live re-composite.
