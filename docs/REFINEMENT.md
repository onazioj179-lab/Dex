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

**Next batches (in order):** — consolidation tier 2 + 3 largely landed 2026-06-13
(see "Consolidation tier 2/3 sweep" entry below). Remaining open:
1. **Finding 13 TaskQueue half** — FileWatcher half DONE (rewired + deleted);
   TaskQueue->TaskQueueManager is BLOCKED by an out-of-scope `core/index.ts`
   re-export + a model mismatch (executor-registry vs run-fn). Needs a batch that
   may edit `core/index.ts` + `preload.ts` and decide if the old `tasks:*`
   surface is still live.
2. **Finding 2 notifications** — renderer path already collapsed onto
   `unified_notification_hub` (DEX-5.5 slice 2). Remaining: delete the JSON
   `NotificationCenter`/`notifications.rs` losers once usage confirms the hub
   covers them (needs main + Rust edits).
3. **Storage tier (finding 5)** — high-risk data migration; do behind usage
   verification, not blind. Findings 8/9/11 done (see below).
4. **Largest, behind facades:** Search (1), Perf tiers (14), Rewind (15) — still
   gated on runtime + native engine per the audit's own sequencing.

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

## P6 — Creative-app depth pass, full sweep (2026-06-13)

Verified: renderer `tsc --noEmit` clean + main `tsc -p tsconfig.main.json` clean
+ watermark check OK (2525 files). Parallel implementation across non-overlapping
app folders (the same safe mode used in UX Depth 250 Session 2). Refinement only:
no new feature categories, no new deps, no files touched outside each app folder.

- **Notes (template for the sweep):** live client-side list filter as you type
  (multi-term AND across title/preview/tags, no IPC round-trip) + honest "N
  matches"/"no match" states; editor `emitChange` now does cheap live char/word
  counts off DOM `textContent` every keystroke and defers the heavy
  htmlToDoc/serialize/plainText into the existing 300ms debounce; wiki-link popup
  viewport-clamped (flips above the caret near the bottom edge) and closes on
  scroll/blur; Ctrl/Cmd+Shift+V paste-as-plain-text; removed per-checkbox change
  listeners that leaked across innerHTML rebuilds and double-fired (delegated
  onClick already syncs data-checked).
- **Prism (raster):** global keyboard shortcuts now bail when focus is in an
  input/textarea/select/contentEditable (was corrupting numeric fields and
  swapping tools mid-edit); layer context menu viewport-clamped + closes on
  Escape/scroll; Ctrl/zoom-tool wheel now zooms toward the cursor instead of the
  image center.
- **Flux (motion):** fixed double-fire Ctrl+Z (two handlers undid two steps and
  corrupted the redo stack); clamped ArrowRight scrubbing to duration; fixed
  double-easing in getAnimatedValue (layer curve was eased then eased again by
  the per-keyframe preset); wired the 29 EASING_PRESETS (were inert divs) to
  updateLayerEasing; removed orphaned imports.
- **Imosion (audio/DAW):** playhead ref reset on Stop/Rewind (Play no longer
  resumes from the old position); live automation read via ref during playback;
  spectrum analyzer resumes after a tab/window switch (was permanently frozen)
  and a duplicate RAF chain removed; honest empty states for the arrange grid and
  track-notes panel.
- **Forge (media batch encoder):** fixed an IPC `watch:fileAdded` listener leak
  (now tracked + detached on unmount); viewport-clamped the job context menu;
  memoized selectedJob lookup + folded three per-render queue-count filters into
  one pass. Then DELETED ForgeEditor.ts + ForgePreview.ts (~1,900 lines): orphaned
  legacy code for a different "web IDE" app (EditorEngine/PreviewEngine/HMR/dev
  server), zero importers verified by grep. Watermark count 2525 -> 2523.
- **Axl (CAD):** wired the orphaned ConstraintSolver — constraints were stored
  `satisfied:false` and never solved; new solveConstraints() store action runs
  the Gauss-Seidel solver, applies position/rotation updates, writes back live
  satisfied flags, auto-solves on add/remove, plus a Re-solve button and a
  UI-type alias map (mate/align/offset). Fixed a HiDPI device-pixel bug in
  InputHandler measure/hit-test; viewport-clamped the context menu; made
  wheel-zoom multiplicative (consistent precision at every zoom).
- **Vinx (video/timeline):** fixed a Rules-of-Hooks violation in ClipVisual (cull
  return ran before a useCallback -> "fewer hooks" crash on scroll); real
  visible-lane-width culling instead of a hardcoded 5000px; timeline keyboard
  handler now guards text fields; ScopesPanel skips the pixel readback while
  hidden; PlaybackEngine seek now detaches prior `seeked` listeners (leak during
  rapid scrubbing).
- **Canvas (whiteboard) + PixelArt:** DPR-correct backing store + ResizeObserver
  repaint (was blurry on HiDPI and painted stale empty state on resize); wired
  the advertised-but-dead undo/redo/Escape shortcuts; live stroke via ref (no
  per-move re-render, correct segment origin). PixelArt: window-level mouseup
  fixes stuck-drawing when releasing off-canvas; memoized the thumbnail strip
  (was running toDataURL per frame every render); B/E/G/I tool hotkeys.
- **Games (pages/Games.tsx):** empty + no-match states replaced with the shared
  EmptyState component (icon, description, primary/secondary actions).
- Nexus already had its WS3 depth pass (Session 2) — deliberately not re-churned.
  Per-app skips were flagged honestly in each pass (e.g. Vinx dual-viewer double
  decode, Forge dead engine files) rather than papered over.
- Forge follow-up: DELETED the orphaned ForgeEditor.ts + ForgePreview.ts
  (~1,900 lines, a different "web IDE" app, zero importers verified by grep).

## Consolidation tier 2/3 sweep (2026-06-13)

Parallel implementation across non-overlapping file sets, then merged and
verified together: renderer `tsc` clean, main `tsc -p tsconfig.main.json` clean,
watermark OK (2524). Method throughout: prefer DELEGATION/shim over rip-out (the
finding-6 pattern), grep-verify importers before any deletion, and document
honestly where a "duplicate" turned out to be a distinct role of one system.

- **Finding 13 (file-watcher) DONE:** `FileIntelligenceController` rewired off
  `FileWatcher.ts` onto `FileWatcherManager` (watch->watchPath, unwatch->
  unwatchPath, status accessors remapped; the generic path-watch subsystem +
  `FileChangeEvent`/`PathWatcherConfig`/`PathWatcherStatus` types ported into the
  Manager, which now extends EventEmitter). `file-intel:*` IPC contract preserved.
  `FileWatcher.ts` deleted (zero importers after rewire). TaskQueue half NOT done
  — blocked (see Next batches #1).
- **Finding 12 (modal host) PARTIAL — audit premise was stale:** the repo already
  has a canonical `ui/Modal` primitive (portal, backdrop, Escape, focus-trap,
  scroll-lock, `--z-modal`) and the major dialogs already use it. Built the
  genuinely-missing piece: `shell/ModalHost.tsx` (`ModalProvider` + `useModal()`)
  managing a modal STACK through one mount, mounted once in `App.tsx`. Migrated
  PiiGuardDialog + WhatsNewModal off their hand-rolled overlays onto `ui/Modal`.
  Deliberately left DiagnosticsPanel (corner-anchored, backdrop-less by design)
  and PolicyViewer (doubles as inline embed + special stacking) with TODOs. The
  real `createPortal` callers were ~4 (Modal + anchored menus), not ~15.
- **Finding 11 (caches) DONE via delegation:** `CacheCoordinator` owns one disk
  tier (lazily materialized, so no main.ts wiring change); `DiskBackedCache`
  reduced to a deprecated delegator into it (full surface + `ssd-cache:*`
  preserved); `MediaCache` now self-registers into `CacheRegistry` for
  pressure-relief/diagnostics. IPC handler registration made idempotent
  (removeHandler before handle) so a disk-tier re-materialize can't double-register.
- **Findings 8 + 9 (UKI memory + semantic) DOCUMENTED, not physically merged:**
  these turned out to be distinct ROLES of one system, not redundant stores.
  Made `compressedMemory` the documented cold tier of `renderer/uki/memory`;
  reconciled `UkiRewindMemory` as a registration/fusion surface (owns no records);
  made `semanticSearch` the single documented facade with a hybrid-contract note
  (lexical `index_search` + semantic `embeddings`/`EmbeddingService` = one
  retriever, semantic gated off until the embedding phase). Comment/contract only,
  zero logic change. True physical merge needs cross-process IPC (out of scope).
- **Finding 4 (motion) PARTIAL + correction:** folded `animationBudget` into
  `UnifiedMotionSystem` (real relocation; animationBudget.ts re-exports, all 24
  names + the hardware-tier detector preserved). Did NOT collapse `MotionController`
  / `spring-animation` — FINDING: `MotionController.SpringAnimator` is what
  `motionHooks` (the survivor's own React surface) is built on, so it IS part of
  the survivor, not a duplicate. The two spring cores have disjoint preset/physics
  contracts. If single-engine consolidation is wanted later, the survivor to
  centralize on is `MotionController`, not `UnifiedMotionSystem` (audit premise
  was backwards here).
- **Radius closeout (finding 7) DONE:** tokens.ts mirror + `--pg-row-radius`
  were already bound; swept the remaining scale-exact `border-radius` literals in
  design-system.css/globals.css to `var(--radius-*)` (value-identical). Off-scale
  literals (50%, 1px hairlines, 12px/5px) left for visual sign-off.
- **DEX-5.5 slice 5 (Tauri flip PREP) — degrade report:** catalogued how
  `__dexDegradeReport()` works (channels that hit the Rust dispatcher's null arm),
  closed every RENDERER-fixable degrade entry via new
  `services/platform/rendererShims.ts` (motion/render/resource/input governors +
  WebAuthn probe + fire-and-forget telemetry sinks answered locally), and
  catalogued the genuinely native-pending channels (filesystem/keychain/process/
  data-store) as `NATIVE_PENDING` so the report is honest. The actual flip is NOT
  done — owner/hardware-gated.
- **DEX-5.5 slice 4 (navigation audit) — conservative pass:** pages were already
  largely on the EmptyState "what next" pattern. Fixed one real dead end
  (store/ReviewsPanel error state now has a "Try again" action). Flagged 3 items
  needing human judgment (StoreHome installed-empty has no browse action; Audio
  "no favorites" affordance is misleading; a few search-empty states lack a clear
  button). The broad redesign remains a human pass.

NOTE (process): a sub-agent's `git stash` mid-run swept the in-flight work into a
stash; it was recovered file-by-file and the merged tree re-verified green before
the stash was dropped. No work lost. Runtime smoke still pending (no dev server
this session) — eyeball on next run, per the standing norm.

## DEX 6.0 grand plan — Foundation batch 1: Sharp 2.0 appearance + consolidation (2026-06-14)

First batch of the v6.0 grand plan (the deep-research OS-redesign roadmap). The
plan's "restore glass blur" items were deliberately OVERRIDDEN: the user wants
DEX sharp, and the codebase already chose full-flat, so depth is expressed as
crisp border + tight shadow, never blur.

Landed and verified (renderer tsc 0, main tsc 0, 17/17 new unit tests, watermark
2525):
- **Sharp 2.0 elevation system** (design-system.css): `--elev-0..4` = hairline
  border + low-spread shadow (flat-friendly depth), plus `.dex-elev-*`,
  `.dex-hover-lift` (1px rise + one rung), and `.dex-tnum` (tabular numerals)
  utility classes — the documented sharp toolkit for the per-app sessions.
- **Density consolidated (was triple-fragmented).** Found three competing
  systems: a dead `--density-scale` var (set by TextDensityControls + main.tsx,
  consumed nowhere), a dormant `[data-density="compact|spacious"]` toolbar-token
  block (no driver), and a binary compact toggle. Collapsed onto ONE attribute:
  `data-density="compact"|(absent)|"comfortable"`, driven by the canonical
  `comfortPrefs.ts`, persisted in `dex:comfort`, applied pre-paint in main.tsx
  and on mount via initComfort. The consolidated density block now rescales BOTH
  the global `--space-*` scale (felt in every pad/gap) and the toolbar/menu
  tokens; `spacious` kept as a back-compat alias of `comfortable`. Settings'
  binary toggle upgraded to a real 3-way control.
- **Accent made coherent + consolidated.** The chosen accent only ever set
  `--color-accent`(+hover) — accent tints/pressed states stayed blue. New shared
  `utils/accentFamily.ts` (`parseAccentColor`/`deriveAccentFamily`/
  `applyAccentFamily`, unit-tested) expands one colour into the whole
  `--color-accent-*` family; wired into ALL FIVE accent appliers (App.tsx
  settings boot, App.tsx OS accent, Settings live path, and both ThemeManager
  paths applyTheme/applyAccentColor — which previously set base-only or used
  divergent light/soft/muted alphas). Also resolves `var(--token)` swatches and
  removes the old latent circular-var bug (`--color-accent: var(--color-accent)`)
  on the default sentinel. Consolidated, not 4th-added.
- **Dark-room mode** (new): `data-darkroom="on"` drops surfaces toward black and
  dims text for low-light work; toggle in Settings > Appearance > Visual Effects.

Files: improvements500/comfortPrefs.ts (extended: density + darkroom, defensive),
utils/accentFamily.ts (NEW), App.tsx, pages/Settings.tsx, main.tsx,
styles/design-system.css; tests/unit/comfort-prefs.test.ts (extended) +
tests/unit/accent-family.test.ts (NEW). Runtime smoke pending (no dev server).

## DEX 6.0 — operated-live session, flexibility + features (2026-06-14)

This session DID run the dev server (preview) and operated DEX live, which caught
real bugs and let layout/token changes be verified in the running app. Full vite
build exit 0, renderer + main tsc 0, watermark 2525, targeted tests green.

- **Caught + fixed live:** onboarding consent checkbox still had advertising/paid/
  partner-data-sharing text -> rewritten to free-for-all.
- **All policy + app version removed from every in-app surface AND the repo policy
  .md headers** (TERMS/PRIVACY/PLUGIN_POLICY/SECURITY); internal re-consent version
  constants kept (verified: stale acceptance still re-prompts).
- **Responsive shell (was dead):** old breakpoints targeted legacy class names the
  inline-styled live shell never uses. New layer on real hooks
  ([data-tauri-drag-region], [aria-label="Application dock"], [role="main"],
  .dex-app-container). Verified at 390px (dock scrolls in-viewport, every app
  reachable) and 820x420 (chrome trims so content keeps the room); desktop unchanged.
- **Dock made flexible:** MOUSE drag-to-reorder added (was touch-only; mouse only
  opened on press). Launch deferred to pointer-up so click still launches. Verified
  live: click activates app, drag reorders + persists. Did NOT delete the dock
  (Spotlight Ctrl+K + Home free-floating pinned apps already give dock-free access).
- **Deeper dark = true OLED black:** deepened the single darkroom mode to pure #000
  surfaces (no duplicate near-black mode); relabeled "Pure black (OLED)". Verified
  live #0c0c0e -> #000.
- **Icon consistency:** audited (dock glyphs all unique, one icon component); fixed
  the lone collision passwordgenerator 'lock' -> 'key'.
- **Pin-to-home + widget rearrange already exist** (audited): widgetStore drag+resize
  edit mode, homePinnedAppsStore free-floating app icons, right-click "Pin App Here".
  Needs surfacing, not building.
- **Page features (3 parallel agents, non-overlapping):** Tasks (P1-P4 priority, due
  time + overdue, filter bar, completion pulse); Files (breadcrumb nav, sort persist,
  no-match empty state); Notes (favorites section, working Daily note, markdown
  callouts). All integrated, build green.

BACKLOG (logged, not done): theme-setter consolidation (4 applyTheme() + ThemeManager
inline-overriding base tokens — root cause of mode-override quirks; deliberately not
rushed); font-scale triplication (14-vs-16 base); Tauri flip (hardware-gated); native
Rust engines / on-device ML (Rewind 2.0, search backend swap, stem separation, OCR).

## DEX 6.0 — OS-grade shell: dock reserves space + window work area (2026-06-14)

Owner direction this session: "redesign/arrange DEX as a full operating system,
fix the DUI, leave the internals." The trigger was content cut off under the dock
(seen live in Prism: its bottom status bar was buried under the floating dock and
clipped off the screen edge). Operated live against the dev server throughout;
every fix verified by measuring real geometry in the running app.

Root cause: the dock published `--dex-reserved-*` insets but NOTHING consumed them
for the app surface, and `getShellWorkspace`/`getMaximizedWindowBounds` reserved
0 for chrome and dock — so maximized creative windows were sized to the full
viewport (running 62px PAST the bottom edge) and inline apps rendered full-height
behind the floating dock.

- **Dock is now a pinned taskbar by default** (dockPinStore: default mode
  always-visible; versioned one-time migration flips legacy auto-hide -> pinned,
  raw-parsed-first so a missing version reads as 0; saveSettings stamps the
  version so a later explicit auto-hide choice sticks). Pinned dock never hides
  on maximize (taskbar behavior); auto-hide/floating modes still overlay.
- **Inline app surface reserves the dock footprint** via an edge margin on
  `[role="main"]` + the split container (keyed to pinned mode, stable — NOT
  taskbarVisible, which flickers with hover and collapsed the inset to 0).
  Removed the duplicate `id="dex-main-content"` (App.tsx owns it).
- **Window work area fixed at the source.** Detached windows are positioned
  relative to the content surface (its `contain: layout` makes it their
  containing block), which already sits below the chrome and above the reserved
  dock. So `getShellWorkspace` now derives the work area from that surface's
  clientWidth/clientHeight (immune to the useAppTransition transform that was
  baking a stale offset into stored bounds), and `getMaximizedWindowBounds`
  returns that work area. Maximized creative windows now fit y=chrome..dock-12px.
- **Feathered bottom shelf** (owner ask "blur from the bottom up, like a feather,
  so everything balances"): a masked gradient + backdrop-blur in the reserved
  strip only (never over app toolbars); degrades to gradient-only on low perf
  tier via the existing html[data-perf-tier="low"] * rule.
- **Verified live (760x560 + 1280x800):** Home + all six main creative apps
  (Flux/Prism/Imosion/Axl/Vinx/Forge) open at y=62, bottom=488, 12px clear of the
  dock, all fully rendered, zero error fallbacks. One self-inflicted TDZ crash
  (reserved-inset effect referenced anyWindowMaximized before its declaration)
  found via the error boundary and fixed by relocating the effect.

Window-management follow-up (same session, second batch):
- **Dock magnification gentler** (owner chose "keep it but make it gentler"):
  handleDockMouseMove now GLIDES (transform transition 0.18s) instead of snapping
  (transition was 'none'), with a wider sigma (40->60) + influence (80->120) and a
  softer peak (0.25->0.22 factor) so the swell is a broad soft lift, not a
  left-to-center pop. Safe to transition because centres come from offsetLeft, not
  transformed rects (no scale-feedback loop).
- **Snap-drag preview bound to the work area:** the blue preview overlay was
  viewport-based with a hardcoded TOP=36, so it never matched where the window
  actually snapped. It now mirrors tileWindow's exact PAD=6 work-area math and
  translates to screen by the content surface's on-screen origin -- preview == drop.
- tileWindow + arrange-all grid were ALREADY workspace-derived, so the
  getShellWorkspace fix bound keyboard tiling/maximize/arrange to the work area for
  free; only the preview overlay needed aligning.

OWNER MANDATE (this session): redesign DEX as a full OS across four areas, all
selected -- window management (Tahoe), top chrome/menu bar, per-app polish, dock +
launch experience. Window-management foundation DONE + verified. NEXT BATCHES:
top chrome/menu-bar redesign; per-app toolbar/panel consistency pass; dock + launch
(running indicators, launcher/Launchpad, switcher). Snap-zone hardcodes now bound;
remaining Tahoe polish = window open/move/close motion. Files: store/dockPinStore.ts,
components/AppManager.tsx, shared/shell/dockGeometry.ts (unchanged, now consumed).
Runtime smoke green across Home + all six creative apps; tsc 0 (batch 1), batch-2
tsc checkpoint running at write time.

## Precision UI Initiative (DEX 5.5 visual-discipline brief, 2026-06-15)

Owner brief: visual discipline, not decoration. Alignment, consistent spacing
rhythm, density calibration (kill oversized chrome), border reduction, ONE radius
language, Widget Freedom (remove dedicated "Arrange" controls -> direct
manipulation), gallery/large-workspace perf, Task Manager progressive detail.

RECON FINDING (4 parallel read-only agents): the design FOUNDATION is already
sound -- canonical `--radius-*` (2/3/4/6/8/10) + `tokens.ts` mirror, `--space-*`
4px grid, the `data-density` system (comfortPrefs.ts rescales space + chrome),
Sharp 2.0 `--elev-*`, `--dex-icon-*`, `DexIcon`. The gap is ADOPTION, not design:
~2,856 hardcoded inline padding/margin/gap literals (worst: vinx/imosion/flux/axl)
bypass density entirely; ~80 off-scale radius literals (5/7/9px); icons at
non-canonical 12/14/18; `--elev-*` ~0% adopted (old `--pg-shadow-*` still ~80% of
floating UI). So this initiative is mostly a disciplined APPLY of the existing
language + chrome de-bulking, not new primitives. Sequenced batches:
1 shell precision (DONE), 2 Widget Freedom (DONE), 3 token-adoption sweep
(scripted, reviewable), 4 Task Manager 3-level progressive detail + virtualized
process table (reuse improvements500/virtualList.ts), 5 gallery threshold/thumbnail
order (Gallery is already virtualized via @tanstack/react-virtual -- minor only).

Landed + verified (renderer `tsc --noEmit` clean; operated live against the dev
server -- restarted once to clear a corrupted HMR transform cache from rapid
edit/reload cycling):

- **Batch 1 -- shell chrome consistency.** Aligned chrome to the documented
  34/40 control rhythm + 12px padding standard: `ui/AppShell.tsx` title strip
  36->34 (matches the shell top bar), toolbar 44->40 (the large-control rung);
  AppManager floating-window title bar 38->36 + padding 14->12 (the 12px standard
  used everywhere else); dock inter-item gap 5->4 (on the 4px grid). Left the
  dock pill's deliberate 15px radius and the `dockGeometry.ts` presets untouched
  (the 15px carries a "bespoke chrome, thinner in 6.0" comment -- not churn).
  Dock gap 4px confirmed live.
- **Batch 2 -- Widget Freedom (direct manipulation).** Retired the global widget
  edit mode: removed the dedicated "Arrange" button + the "Edit/Done Editing
  Widgets" Home context-menu entry. Widgets are now ALWAYS directly draggable
  (interactive-content passthrough so a press on a control inside a widget stays a
  click, primary-button only); the resize handle + remove button + a brighter
  hairline border (`--color-border-strong`, replacing the loud blue dashed edit
  border) are revealed on per-widget hover; the idle wiggle is gone. `widgetStore`
  dropped `editMode`/`toggleEditMode`/`setEditMode` (zero remaining consumers) and
  gained `pickerOpen`/`setPickerOpen`; the picker is now store-driven so both the
  one quiet persistent "Add widget" button and the context-menu "Add Widget" open
  it directly. Files: store/widgetStore.ts, components/HomeWidgets.tsx,
  pages/Home.tsx. Verified live: hover reveals resize/remove + lifts the border;
  direct drag repositions and PERSISTS to `dex-home-widgets` (clock 32,110 ->
  152,190 -> restored); "Add widget" button opens the picker (store + button
  onClick both confirmed). The transient `editMode is not defined` ReferenceErrors
  in the console were mid-edit HMR artifacts, gone after the clean restart.

- **Batch 3 -- radius consistency snap (scripted, reviewable).** New
  `scripts/snap-radius-precision.mjs` snaps OFF-SCALE corner-radius literals onto
  the canonical scale (1->2, 5->4, 7->6, 9->8, 11->10; canonical values, circles/
  pills `50%`/`999`/`9999`, `var(--radius-*)`, SVG rx/ry, and values >=12 all left
  alone; skips `styles/**` and `dist/**`). Dry-run first, then `--write`: 51
  off-scale radii across 28 files (creative apps + pages + shell). DELIBERATELY
  SCOPED OUT (not churn): the ~2,856 inline padding/margin/gap literals were NOT
  auto-rewritten onto `--space-*` -- blindly tokenizing tuned pro-tool layouts is
  the churn risk the owner warned about; that belongs in a separate pass with
  per-app visual sign-off. Icon-size snapping (12/14/18 -> 16/20/24) likewise
  deferred (dense creative toolbars can overflow). So density still does not reach
  the creative apps -- that is the honest remaining gap.
- **Batch 4 -- Task Manager progressive detail + virtualized process table.**
  Replaced the binary Compact toggle with a 3-level segmented control (Essential /
  Diagnostics / Advanced), persisted to `dex-taskmanager-detail`: L1 shows only the
  key metric cards (Apps/CPU/Memory/Battery); L2 adds the secondary metrics +
  Workspaces/Workflows/Open Apps; L3 adds the System Processes table. Reduced
  metric-card bulk (value 24->20, padding 14->11, sparkline 46->36, grid minmax
  180->160, gaps tightened) and panel-header 42->36. The process table is now
  WINDOWED via the existing `improvements500/virtualList.ts` (fixed 30px rows,
  padTop/visible/padBottom) instead of a hard 80-row cap -- smooth at thousands of
  processes. Files: pages/TaskManager.tsx. Verified live: L1/L2/L3 switch + persist
  correctly, panels gate per level, no crash (process rows are empty only because
  the native bridge is absent in the browser preview).
- **Batch 5 -- Gallery (minor, as scoped).** Lowered the grid virtualization
  threshold 60 -> 30 (named `GRID_VIRTUALIZE_THRESHOLD`) so medium libraries also
  window their rows. Gallery was already virtualized (@tanstack/react-virtual) +
  lazy-loaded (`loading=lazy`/`decoding=async`) + native-thumbnailed, so no further
  change was warranted -- did not manufacture churn. Files: pages/Gallery.tsx.

Verified together: renderer `tsc --noEmit` clean; operated live -- Task Manager
(all three levels), Gallery, and Home all mount with zero console errors and no
error boundaries; Home widgets still directly draggable after the radius sweep.

- **Batch 6 -- spacing tokenization (density now reaches every app).** New
  `scripts/tokenize-spacing-precision.mjs` routes inline spacing literals that
  EXACTLY equal a density-responsive rung onto the matching token (8->`--space-2`,
  12->`--space-3`, 16->`--space-4`, 20->`--space-5`, 24->`--space-6`, 32->`--space-8`,
  40->`--space-10`). Critical finding: the density block in design-system.css
  rescales ONLY those seven rungs (it deliberately keeps `--space-1`=4px hairlines
  and the fractional tokens fixed so seams never drift), so the sweep targets
  exactly them -- VISUALLY IDENTICAL at default density, and compact/comfortable
  now actually affect the creative apps. Safe by construction: spacing props only
  (never width/height/font/radius/shadow), `.tsx` only (so `.ts` geometry/store
  code that uses gap/padding as a COMPUTED NUMBER is never stringified), a
  complete-value lookahead so `gap: 8 + x` arithmetic is never touched, and
  styles/dist skipped. 2961 literals across 142 files (heaviest: imosion 395,
  prism 207, flux 176, settings 153, vinx 110). Verified HARD: renderer `tsc`
  clean across all 2961 (proves every site was a CSSProperties context -- no
  number-typed field was stringified); full `npm run build:renderer` exit 0;
  operated live -- imosion (heaviest) and prism render pixel-correct, Home/dock/
  widgets/Spotlight clean, ZERO console errors on a fresh server.
- **Icons -- deliberate non-churn decision.** The brief's "one icon family, weight,
  style" is ALREADY satisfied: a single `DexIcon` component (Lucide), one visual
  language. The remaining size VARIETY (12/14 inline badges, 16/18 toolbar, 20/24
  headers) is intentional HIERARCHY, not drift -- mass-snapping it to 16/20/24
  would overflow dense creative toolbars and flatten scan hierarchy, degrading the
  UI. So icon sizes are intentionally left as-is; forcing uniformity would be
  completing the letter while breaking the spirit (and the owner's don't-churn rule).

- **Batch 7 -- alignment / visual-rhythm follow-up (honest gap-closure).** A
  re-audit against the brief (3 parallel read-only agents over shell / pages /
  creative apps) found the foundation genuinely clean -- radius holds (0 off-scale
  JSX literals, 1 trivial CSS exception), spacing tokenized, borders already
  hairline from Sharp 2.0, no double-border bugs in any app. The ONE real residual
  defect was MODAL ALIGNMENT on Home: the Pin-App modal used hardcoded
  `18px 22px` / `padding: 14` while the sibling Wallpaper modal used the token
  rhythm, so its body grid sat 8px inside its own header (a ragged left edge); and
  the Wallpaper footer was off-grid (`14px ... 18px`) while active wallpaper tiles
  swapped border width `2px <-> 2.5px` on selection (a 0.5px layout shift on every
  click, on top of an already-sufficient scale + ring + check-badge active signal).
  Fixed in pages/Home.tsx: both Home modals onto the canonical modal rhythm
  (header `--space-5/6/4` = 20/24/16, body `--space-4/6` = 16/24 so the body left
  edge meets the header, footer `--space-4/6/5` = 16/24/20 mirroring the header);
  active tile border made constant-width (color-only). Verified: renderer `tsc
  --noEmit` exit 0, zero console errors, and live computed-style read of the open
  modal confirms header 20/24/16, body 16/24/16, footer 16/24/20, tile borders a
  single 2px (no 2.5px). The audit's other flags were verified FALSE POSITIVES and
  deliberately NOT touched: the AppManager title-bar inset `0 0.5px 0` gloss is a
  TOP highlight, not a duplicate of the BOTTOM border; the HomeWidgets hover border
  is already constant-width color-only and the remove-button 2px ring is an
  intentional contrast cutout.
- **Shadows / elevation -- deliberate non-churn decision (like icons).** The modern
  `--elev-*` 0-4 ramp is defined but used 0 times; the purpose-named `--pg-shadow-*`
  set (card/panel/modal/popover/tooltip/...) backs ~263 sites. These are DIFFERENT
  MODELS, not redundant duplicates: `--pg-shadow-*` is the set the 6.0 reduced-glass
  redesign already tuned (-40% intensity), while `--elev-*` bakes a `0 0 0 1px`
  border ring into every step. Migrating would re-introduce borders, change tuned
  intensities, and need a per-site semantic->numeric remap -- textbook churn. So
  `--pg-shadow-*` stays the system; `--elev-*` is left unused (a redundant
  abstraction, not a gap). Do NOT "adopt" it in a future pass.

The Precision UI initiative is COMPLETE and re-verified: alignment + visual rhythm
(Home modals now on one modal rhythm; no layout-shift affordances), spacing rhythm,
density calibration (reaching every app), border reduction (hairline throughout; no
redundant borders found), one radius language, Widget Freedom, gallery perf, Task
Manager progressive detail, and consistency all landed and verified. The two
standing quality decisions -- icons left at intentional size variety, shadows left
on the tuned `--pg-shadow-*` system -- are deliberate non-churn calls, not gaps.

## Operational Simplicity / Creative Completion / Scale (owner brief, 2026-06-15)

Next DEX 5.5 brief: operational simplicity, safe delete/recovery, widget redesign,
text reduction, UKI intelligence, creative-suite completion (AXL/Nexus/Rewind/
Journal), large-scale handling, search infra, consistency. RECON (4 parallel
agents) finding: this brief is far more FUNCTIONAL than the visual Precision UI
work, and a large share of the "completion" is gated on native engines / ML and
therefore HONESTLY BLOCKED, not fakeable:
- AXL: STEP/IGES import, real FEA, robust parametric constraint solver -> native CAD
  kernel. Nexus: semantic graph + vector search -> graph DB + embeddings. Rewind:
  AI search + smart summary -> ML backend. File-content search -> Tantivy native
  (core/dex-search exists but no renderer binding). These stay BLOCKED; the apps
  already degrade honestly (stubs, not broken).
- Widget redesign (remove permanent Add-Widget chrome, right-click to add) was
  ALREADY satisfied in the tree (the persistent button is gone; empty-state quick-add
  + Home context-menu "Add Widget" remain). Not re-churned.

Landed + verified (renderer `tsc` clean; operated live -- Gallery + Rewind mount
clean, Journal search filters with a working no-match state, zero crashes):
- **UKI Workspace Awareness** -- registered context resolvers for Gallery (active
  album, view, selection, item count) and Rewind (active view, recording state,
  journal size), mirroring the existing Notes/Tasks/Files resolvers via
  `uki/appContextRegistry`. Real signal folded into the assistant prompt through
  `formatUkiContexts`, not a stub. Files: pages/Gallery.tsx, DEXAPPLICATIONS/rewind/
  Rewind.tsx. (Remaining resolvers -- Kanban, Browser-tab via IPC, Nexus graph --
  sequenced; Browser/Nexus are heavier/privacy-gated.)
- **Journal text search** -- title/body/tags filter + search input + honest no-match
  state in Rewind's Journal view (was filter-only: all/pinned). Files: Rewind.tsx.
- **Nexus search cap 8 -> 24** -- the hardcoded result slice starved large knowledge
  bases. Files: DEXAPPLICATIONS/standalone/Nexus.tsx.

NEXT (real, renderer-safe, sequenced -- NOT blocked): Tasks/Rewind-timeline
virtualization (System Scale; Tasks has drag-reorder so handle carefully); the
delete/management-action consistency quick wins (Trash access in Journal/Rewind,
Notes drag-move between folders, Files Duplicate); conservative text-reduction
(icon-only + tooltip for genuinely-redundant labels like Prism "Apply Rotation").
The native/ML items above are the honest hard blockers.

## OS-Level Refinement -- foundations pass (owner brief, 2026-06-15/16)

Owner brief: "Aggressive OS-Level Refinement & Creative Workspace Transformation"
-- stop polishing edges, fix FOUNDATIONS. Window mgmt completeness, small-screen
usability, premium shell, creative production-readiness, browser/rewind/uki/audio
maturity, consistency, navigation, STABILITY (no raw exceptions/broken screens),
performance, precision density. Explicitly "aggressive refinement, NOT feature
growth."

RECON (4 read-only Explore agents -- window mgmt / small-screen / stability /
feature-state map). Honest verdict per foundation:

- **Window management -- VERIFIED FUNCTIONALLY COMPLETE (no work needed).** Central
  architecture: `shell/FloatingWindow.tsx` + `components/AppManager.tsx` (controls,
  geometry, z-order) + `shell/snapEngine.ts` (13-zone snap) + `store/runningApps.ts`
  (lifecycle + `APP_DEFINITIONS` registry, ~50 apps) + `shell/WindowManifest.ts`
  (persisted bounds/z/minimized). All of minimize / maximize-restore / resize / snap
  / move / focus-raise / close are wired CENTRALLY, so every windowed app inherits
  them -- NO app is missing controls. Confirms the owner's standing finding ("most OS
  features already exist; the problems were layout/dock bugs"). Remaining items are
  MATURITY POLISH only (genie minimize-to-dock animation, stash-zone routing,
  center-snap, inter-window edge magnetism, keyboard window-mgmt for split/maximized
  states) -- deliberately NOT done this pass: they touch AppManager heavily and are
  decoration, not foundation. Do not rebuild the window system.

- **Stability -- LANDED + verified.** The ErrorBoundary infra is already strong
  (`services/ErrorBoundary.tsx`: RootErrorBoundary in main.tsx with bounded
  auto-recovery; per-app `AppErrorBoundary`; lightweight `ViewErrorBoundary`; raw
  stacks DEV-gated so production never shows them; global window error/rejection
  handlers). The GAP was coverage: several surfaces in App.tsx mounted with bare
  `Suspense` / no boundary -- most critically **AppManager itself (the entire shell)
  was in `Suspense` with NO AppErrorBoundary**, so a shell crash fell through to the
  fatal root screen with no in-place recovery. Extended the existing proven pattern
  to 7 surfaces: appmanager (the shell), onboarding, pip, miniplayer, minishell,
  minipulse, diagnostics. Now any of these crashing shows the recoverable app-crash
  card, never a raw screen. Files: App.tsx only. Verified: `tsc --noEmit` exit 0;
  full cold reload mounts the shell clean with zero runtime/render errors (the
  residual `[hmr] Failed to reload /App.tsx` console lines are the known stale-cache
  artifact of editing one file 7x rapidly -- a fresh load doesn't use HMR and mounts
  fine).

- **Small-screen -- mostly OK; one item DEFERRED on purpose.** Modals/dialogs already
  use the responsive `min(NNNpx, calc(100vw - NN))` pattern (Modal.tsx, Home modals,
  CommandPalette) and popovers that clamp (ContextMenu, UnifiedDropdown flip+clamp).
  The two flagged shared dropdowns are narrower than they first looked: `Select.tsx`
  menu is `left:0; right:0` (= parent width, CANNOT overflow horizontally; only lacks
  vertical flip-up near the viewport bottom), and `SendToMenu.tsx` is right-anchored
  (left-overflow only at the extreme screen edge, and it lives in toolbars). Flip/
  clamp surgery on the app-wide `Select` for a moderate edge-case is churn risk on a
  load-bearing component, so it is DEFERRED to a focused, separately-verified pass
  (extract/reuse UnifiedDropdown's flip+clamp into a shared positioning hook, apply
  to Select + SendToMenu, verify live at a small viewport). Not started this pass.

SEQUENCED feature-area backlog (FEATURE-SCALE -- next phase, NOT this refinement
pass; several are owner-in-flight or blocked). The owner is currently editing
Rewind.tsx / Nexus.tsx / Gallery.tsx / HomeWidgets.tsx (the UKI-resolver + journal-
search + nexus-cap work above), so those files were deliberately left untouched here:
- UKI cross-app: register Browser + Files context resolvers (highest leverage; the
  registry + chatActions pipeline already exist); add workflow error-recovery
  (re-prompt/fallback) -- currently absent.
- Browser: session save/restore across app restart (tabs lost on close today);
  send-to integration (Rewind link capture, Note-from-selection, Search indexing).
- Rewind: tab-snapshot capture wired to Browser navigate/close -> "restore session"
  in the timeline (recovery today is file-path level, not tab/app state).
- Audio/Imosion (DAW substantial + in-flight): sample-library picker via Files,
  preset CRUD, plugin UI surfacing.
- Creative coherence (axl/nexus alpha): undo/redo + session save + large-project
  handling; unify the "new content" entry across Notes/Canvas/Rewind-journal.
- Dropdown viewport-clamp (Select/SendToMenu) -- the deferred small-screen item.

## Developer Platform / DEX Script / Notes Evolution brief (owner, 2026-06-16)

Brief: developer mode, DEX Script automation language, terminal evolution, Notes
evolution, account/security/IPC/memory. RECON (2 agents) finding: most of this
brief's BACKBONE ALREADY EXISTS at the controller/engine level -- so the honest
work is mostly RENDERER UI surfacing existing systems, plus a few native blockers:
- ScriptingEngine (FULL, sandboxed VM, manual/schedule/event/hotkey triggers),
  DiagnosticsController (FULL, crash/perf/IPC metrics), AuthController (REAL
  biometric/PIN/password, OS keychain), PtyService+Terminal, Calculator (ALREADY
  scientific + memory + history), crash protection (silent ErrorBoundary, no raw
  stack traces in prod), encryption, IPC kernel, memory-leak instrumentation +
  the 9 fixes already shipped. Gaps = renderer panels (dev diagnostics panel,
  script editor UI, account card, memory monitor) -- buildable but each a real
  panel. NATIVE-BLOCKED: terminal split/char-mode/mouse (needs node-pty),
  multi-device account sync (needs cloud backend).
- Notes is ALREADY strong: rich text, headings, lists, checklists, code blocks,
  callouts, wiki-links, backlinks, templates, images, TOC, find AND replace.
  Genuine gaps: code-block syntax highlighting (needs a highlighter dep), table
  INSERT UI, callout INSERT button (round-trips via the `[!NOTE]` blockquote
  marker -> needs htmlToDoc/docToHTML round-trip care), and Find navigation.

Landed + verified (renderer `tsc` clean; operated live in Notes):
- **Notes Find navigation upgrade** (NotesComponents.tsx FindReplace) -- the find
  bar highlighted all matches but had no way to STEP through them (no active match,
  no position, Replace blindly hit the first). Added: active-match highlight
  (orange vs yellow) with scroll-into-view, a "X / Y" position counter, Prev/Next
  buttons (Enter = next, Shift+Enter = prev, wrap-around both ways), and Replace
  now targets the CURRENT match. Verified live: 1/4 -> 2/4 -> 3/4 -> 4/4 -> wrap
  to 1/4, Prev wraps to 4/4, active highlight tracks each step.

OBSERVED (not chased -- possible keep-alive/double-mount artifact): two FindReplace
instances were mounted during testing (one empty/disabled, one live). Worth a
glance to confirm DexNotes isn't rendering the find bar in two view branches.

NEXT (renderer-safe, sequenced): Notes insert-buttons batch (callout + table
insert, with round-trip verification) and code-block language picker; then the
"surface an existing controller" panels (dev diagnostics, script editor, account
card, memory monitor) -- each a real build, none blocked. Terminal split + account
cloud sync stay native-blocked.

## Responsive dropdown/popover foundation (OS-level refinement, 2026-06-16)

Closed the small-screen dropdown gap that was deferred in the foundations pass
above -- this time BUILT, not punted. New shared hook
`hooks/useDropdownPosition.ts`: measures the trigger + menu against the viewport
before paint (useLayoutEffect, no flicker), FLIPS the menu up when there is no room
below, caps `maxHeight` to the available space (a menu always scrolls inside the
viewport instead of off the bottom of a laptop screen), and CLAMPS horizontally so
a menu never leaves the screen edge. Options: `matchWidth` (full-width menus keep
left:0/right:0 + vertical flip only), `align` ('left'|'right'), `gap`, `margin`,
`minHeight`. Re-measures on window resize while open; degrades to prior behavior if
refs aren't ready.

Applied to the high-traffic SHARED dropdowns (one fix -> every screen that uses
them): `Select` + `MultiSelect` (matchWidth) and `RichTextInput`'s suggestions
dropdown (matchWidth), plus `SendToMenu` (align:right, so the creative-suite "Send
To" menu clamps instead of overflowing the screen edge). Also hardened the
`.popover` CSS utility with `max-width: min(320px, calc(100vw - 16px))`.

REAL BUG fixed in passing: `Select`/`MultiSelect` rendered the literal text "check"
(`<span>check</span>`) next to the selected option instead of a checkmark -- now a
proper `<DexIcon name="check" />`.

Verified: `tsc --noEmit` exit 0; `npm run build:renderer` exit 0; live cold reload
mounts clean at 1280x800 and at 1024x600 (small laptop) with no error boundary
(session-restore prompt shows -- silent recovery working). Files: hooks/
useDropdownPosition.ts (new), components/Select.tsx, components/SendToMenu.tsx,
components/RichTextInput.tsx, styles/design-system.css.

## Notes insert-buttons + Developer crash-reports (2026-06-16)

Built the sequenced wins from the Developer-Platform brief (BUILT, not deferred):
- **Notes: Callout + Table insert buttons** (NotesEditor.tsx). The model already
  rendered callouts (`[!NOTE/WARNING/TIP]` blockquotes) and tables, and `htmlToDoc`
  already REVERSES both (reads `data-callout`/`callout-body` -> marker, parses
  `table/tr/td|th`), but there were NO toolbar buttons -- you had to type the raw
  marker / paste HTML. Added a toolbar group: Insert Table (3x3, header row) + three
  Callout buttons (Note/Warning/Tip), each inserting the RENDERED HTML via
  execCommand insertHTML so it shows styled immediately. Verified live in Notes:
  callout inserts as `blockquote[data-callout=note]` with body + label, table inserts
  3 `th` + 6 `td`; and crucially the MODEL ROUND-TRIP is lossless + IDEMPOTENT
  (htmlToDoc->docToHTML->htmlToDoc->docToHTML identical; callout marker + table cells
  survive), so both PERSIST across save/reload (confirmed: the edited notes show the
  `[!NOTE]`/table content in the Recent Notes widget after the fact).
- **Developer Mode: crash reports** (DiagnosticsPanel.tsx). The live diagnostics
  overlay (MiniPulse -> expand) showed memory/render/timeline/logs but NOT crash
  history, which `DiagnosticsController` already exposes. Added a Crash Reports
  section calling `window.dex.diagnostics.getCrashReports()` (guarded; degrades to
  "No crashes recorded." without the native bridge). Verified live: section renders
  in the panel with the empty state. (This SURFACES an existing controller -- the
  pattern for the remaining dev panels: script editor, account card, memory monitor.)

Verified: renderer `tsc --noEmit` clean; operated live (Notes inserts + round-trip,
diagnostics panel opened via MiniPulse). NOT a code-block syntax-highlight picker
(needs a highlighter dep + docToHTML/htmlToDoc language round-trip) -- a separate,
honestly-scoped follow-up. Files: DEXAPPLICATIONS/notes/NotesEditor.tsx,
components/DiagnosticsPanel.tsx.

## Unified command catalog: shortcuts -> DEX, terminal + UKI access (2026-06-16)

Owner brief: map shortcut commands to DEX (and most of the 1000 we don't need),
make them runnable from the terminal, have UKI know them, work under the hood with
NO duplicates, DEX inner apps only, cross-platform. RECON (1 agent) finding: DEX
has the command-registry TYPE (`shared/commands/registry.ts`: PaletteCommand,
searchCommands, parseArgv) but NO populated instance -- commands/shortcuts are
scattered across CommandPalette.tsx (hardcoded 70+), KeyboardCommandSystem +
HotkeyController (duplicate keybindings), AppManager keydown, SpotlightEngine, and
UKI's separate action map. The terminal was a pure OS shell with zero DEX-command
access.

Built the SINGLE SOURCE OF TRUTH + first surface (tsc clean; 19 unit tests green):
- **`src/shared/commands/dexCommands.ts`** -- the canonical DexCommand catalog.
  App-launch commands DERIVE from APP_DEFINITIONS (caller passes it in; the app
  list is NEVER duplicated); system/window/nav commands authored once in
  CORE_DEX_COMMANDS. Every command is CROSS-PLATFORM (`crossPlatform()` derives
  win+mac from one string; Ctrl<->Cmd, Alt<->Option; `resolveShortcut` picks per
  platform). Helpers: `buildDexCommands`, `toCommandRegistry` (plugs into the
  EXISTING registry -- no parallel type), `matchTerminalCommand` (`dex notes`),
  `findByUtterance` (UKI NL match). Pure (no DOM/React/IPC) so main+renderer+tests
  share it. Maps only to DEX inner apps.
- **Terminal `dex` command** (`Terminal.tsx`) -- reads the catalog; `dex list`
  prints the catalog with per-platform shortcuts, `dex <app>` launches via the
  running-apps store, lines starting with `dex` are handled locally (not sent to
  the OS shell). The explicit "access via terminal" ask. (Live click-test needs
  the Electron PTY -- absent in the browser preview -- so the matching/exec logic
  is UNIT-TESTED instead; tsc clean.)
- **`tests/unit/dexCommands.test.ts`** (19 tests) -- cross-platform derivation,
  app derivation w/o dup, unique ids+aliases, terminal matching (+dex prefix+args),
  shortcut resolution, registry-adapter feeding searchCommands, UKI utterance match.
- **`docs/SHORTCUTS.md`** + `docs/shortcuts-1000.md` -- the triage: ~40 ergonomic
  slots assigned (apps Ctrl+1..9 / Alt+letter from APP_DEFINITIONS; system/window/
  nav core), the other ~960 of the 1000 stay reserved/unbound.

NEXT (all READ the same catalog -- no new lists): wire the palette (mount
RegistryCommandPalette or feed CommandPalette via toCommandRegistry), feed unified
search/Spotlight, bridge UKI chatActions through findByUtterance, and have the
keydown layer look up commands by resolveShortcut instead of hardcoding (retiring
the duplicate KeyboardCommandSystem/HotkeyController maps).

### Surface wiring -- executor + command bus + UKI (2026-06-16)

Built the GLUE so non-keyboard surfaces can RUN catalog commands, one path each:
- **`src/renderer/services/dexCommandRunner.ts`** -- the ONE renderer executor.
  `executeDexCommand(cmd)`: app commands launch via the running-apps store (payload
  from APP_DEFINITIONS, no dup); ACTION commands dispatch a single `dex-command`
  window event. Every surface runs commands through this.
- **AppManager `dex-command` listener** -- a ref-based listener (mirrors the existing
  keyHandlerRef pattern) routes actions (uki / closeApp / maximize / tileLeft /
  tileRight / splitScreen / arrangeWindows / overview / navBack / navForward) to the
  SAME handlers the keyboard already uses. One router, no per-surface action code.
  VERIFIED LIVE: dispatching `dex-command {action:'uki'}` flipped the uki store's
  showPanel false->true.
- **Terminal** refactored to call `executeDexCommand` (dedup -- both app launches AND
  actions now work from `dex <cmd>`).
- **UKI (chatActions.ts)** -- new `chat.dexCommand` skill + `dex.command` action map
  natural-language window/system phrases ("split screen", "tile left", "maximize",
  "arrange windows", "go back", "toggle assistant") through `findByUtterance` ->
  `executeDexCommand`. App open/close stays on the existing app.open path; an
  unresolved-phrase guard lets ordinary conversation fall through. VERIFIED
  deterministically (buildChatCommand is pure -- no LLM): "split screen"/"tile left"/
  "maximize" -> understood, `dex.command` step, confirm tier; "open notes" ->
  app.open; "what is the weather" -> not understood (normal chat).

Net: ONE catalog -> ONE executor -> ONE event bus, consumed by terminal + UKI today,
keyboard already covers the same shortcuts, palette/Spotlight already derive app
launches from APP_DEFINITIONS. tsc clean; watermark OK; 19 catalog tests green.
STILL open (lower value, working surfaces): feed the catalog's ACTION commands into
the palette/Spotlight lists, and the keydown-from-catalog dedup refactor.

## Dock positioning freedom + alignment (owner brief, 2026-06-16)

Owner brief: dock mobility (drag/snap to edges + bottom alignment), interaction
reliability, reordering, apps-menu parity, visual/perf. RECON: most of it already
existed -- magnification is HARD-DISABLED (line 661: the "icons move under the
cursor" glitch is already fixed), reorder works (drag + context-menu move),
drag-vs-click is launch-on-pointer-up, the dock is already compact (4px/6px pad,
radius 13). The real GAP: a parallel session had hardcoded the dock to bottom-centre
for stability ("never moves"), which removed mobility, and dockGeometry had no
ALIGNMENT (bottom always centred).

Built + verified live (dock is renderer-only, so the preview exercises it):
- **Alignment in dockGeometry** (`shared/shell/dockGeometry.ts`): new `DockAlign`
  = start | center | end. `computeDockGeometry` now anchors along the edge:
  bottom+center == the prior `translateX(-50%)` midpoint (back-compat), start/end
  anchor to a fixed corner. `normalizeDockAlign` added. The five brief positions =
  bottom+center / bottom+start / bottom+end / left+center / right+center.
- **Persisted `dockAlign` pref** (`shellPreferencesStore`): mirrors dockEdge
  (default/hydrate/action/persist). Saved to `dex-shell-preferences-v1` -> restores
  after restart/update/crash.
- **Geometry-driven dock again** (`AppManager`): the outer wrapper was hardcoded
  bottom-centre; now uses `computeDockGeometry({edge, align, preset})` for position +
  a STATIC transform (no transition) so STABILITY IS PRESERVED -- the dock only
  relocates on an explicit user pick, never drifts/jumps during use. Inner container
  lays out column for left/right edges (maxHeight) vs row for bottom/top (maxWidth).
- **"Dock Position" in the dock context menu**: five items (Bottom Center/Left/Right,
  Left Side, Right Side), active one check-marked, each sets edge+align via the store.

Verified live: dock moves bottom-center -> left edge (column) -> bottom-left
(left:4) -> bottom-right (right:4) -> back to centred; persistence confirmed in
localStorage; no error boundary. 22 dockGeometry unit tests (added alignment +
normalizeDockAlign), tsc clean. The brief's reliability/visual/perf items were
largely already addressed (magnification off, compact dock, pointer-up launch).
