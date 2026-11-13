# DEX — Roadmap (single source of truth)

> **GOAL (2026-07-01) — Owner /goal: "60% smarter UKI, 80% faster shell, Stage Manager Home" (full mandate, decoded from voice).**
> The owner's standing mandate, split into tracks. Items marked ✅ shipped this session; the rest is the backlog.
> 1. **Stage Manager (✅ shipped).** Home IS the stage: zoom out to see EVERY running app as its LIVE window
>    (real content, exact aspect — not snapshots), tap one to zoom it to the front. Rewrote `shell/AppOverview.tsx`
>    from fake canvas thumbnails to live scaled windows (GPU `transform` set inline-`!important`, same trick as the
>    window-drag path; styles snapshot/restored on exit, visibility re-asserted from `data-app-state`). Triggers:
>    F3 / Ctrl+Up, 3-finger swipe-up + pinch-out (already wired), `dex-stage-toggle` window event, Home's new
>    "Stage (N)" pill + desktop context-menu item. Escape/click-empty dismisses back to Home; typing filters.
> 2. **UKI agentic upgrades (~60% capability lift) (✅ first slice).** Background-task ledger shipped:
>    `store/ukiTasksStore.ts` (persisted; watchdog on SharedTick flags silent runs as *stalled*; interrupted tasks
>    rehydrate as *failed* — crash honesty; >8s tasks notify on finish). Agent loop (`uki/agentRunner.ts`) now
>    ledgers every tool-using run (lazily — pure Q&A stays out). Nexus "UKI Activity" panel gained a Background
>    Tasks section (status chips, last step, Clear finished). New agent-callable `notes.enhance` app action
>    (confirm-gated, append-only, degrades without a provider key). ✅ (2026-11-11) UKI can *schedule*: core tools
>    `schedule_task` / `list_scheduled_tasks` / `cancel_scheduled_task` (create/delete always ask first), plain-English
>    times (`shared/automation/scheduleSpec.ts`), one-time tasks, and "Ask UKI" tasks that run a prompt when they fire
>    (failures retry with backoff, shown in Task Manager › System). See DEX_REMAINING_WORK #159. NEXT: richer text assist
>    across apps (Notes has it; extend to Mail-style surfaces), wiring `src-tauri/task_queue.rs` to the renderer.
> 3. **Speed (~80% faster open/nav/drag) — mostly LANDED, keep tightening.** Audit confirmed: per-app lazy chunks
>    + predictive prewarm, keep-alive (never remount on nav), rAF-batched drag with GPU transform + zero content
>    repaint, SharedTick consolidation, FrameScheduler tiers. Remaining levers: measure real cold-open times per
>    app (Axl/Imosion/Flux are the heavy chunks), trim `dex-app-core` eager chunk, first-frame paint of heavy apps.
> 4. **Creative app pass — AXL FIRST, then Imosion, Vinx, Forge.** Owner: "each and every creative app… AXL
>    needs to be better", UI/UX included. Also Nexus: gauge + probabilities (predictive load/idle stats on the
>    donut gauge), app/flow tracking ("internal freeform to manage apps, track apps, flows").
>    **AXL pass 1 ✅ (2026-07-02):** fixed Canvas-2D `var()` colors being silently IGNORED (grid/axes/selection
>    ring/measurements/GD&T/HUD all painted wrong — theme now resolved to literals per frame); fixed stale-camera
>    closures (post-orbit clicks hit-tested the OLD view — shared `hitTestAtPoint` w/ correct deps + exploded
>    offset); wired the orphaned `hoveredPartId` (accent hover ring + cursor); added CAD alignment snapping
>    (`utils/alignSnap` pure + 7 tests: per-axis pull onto other part centers ~8px, dashed inference guides,
>    Alt = free, store toggle).
>    **AXL pass 2 ✅ (2026-07-02) — the "NEXT AXL" list is DONE:** face snapping (center/touch/flush candidates
>    from primitive extents, nearest-wins, `primitiveHalfExtents` honors scale); modal + buckling solvers
>    (`engine/modalBuckling.ts` — cantilever beam modes + Euler critical load, tested vs analytical steel-cube
>    values, wired into the sim panel with contextual labels); parametric expressions (`utils/exprEval.ts` safe
>    evaluator + fixed-point table resolver w/ circular detection; PARAMETERS table in PropertiesPanel; ALL
>    transform inputs accept expressions against the parameter scope). 63/63 AXL tests.
>    **Imosion pass 1 ✅ + shell/canvas sweeps (2026-07-02, later):** Analyze now APPLIES tempo+key to the
>    project (both the button and the UKI op — which had claimed "applied" without applying); automation-point
>    drag + clip trim rAF-batched (were per-mousemove setState; automation also re-attached listeners per move);
>    STEM EXPORT IS REAL (old button downloaded a text manifest! now per-track offline renders, master recipe
>    minus master bus, silence-checked 24-bit WAVs + MIDI stem). Also: removed the blanket `[role=tab]` ::after
>    underline that drew a stray line between the tab strip and apps (owner-reported); OS-wide sweep of the
>    Canvas-2D var()-color bug (18 more sites: AXL Renderer class ×12, Audio waveform, Rewind trend, Prism ×4 —
>    new shared `utils/canvasTheme.ts`); AXL Renderer.init now degrades to Canvas 2D instead of crashing to the
>    error boundary when GL setup throws (lost context / GPU reset / HMR remount).
>    **Vinx + Forge pass ✅ (2026-07-02, later) — CREATIVE PASS ROUND 1 COMPLETE (AXL, Imosion, Vinx, Forge):**
>    Vinx: LUTs real (store-driven `programLUT`, was an ephemeral element.style hack; Quick Export bakes the
>    filter via ctx.filter so the WebM matches the monitor); trim undo is ONE step (was a TrimClipCommand per
>    pointermove — hundreds of undo entries per gesture); mid-gesture unmount no longer strands window pointer
>    listeners. Forge: "Merge to Single File" was a dead queued job with no source — now an instant lossless
>    PCM→24-bit-WAV merge (batch-rename already flows into download names; 'unsupported' already has its own
>    visual tier — explorer over-reported those).
>    **CREATIVE ROUND 2 ✅ (2026-07-02, later):** AXL modal = REAL assembly eigen-FEA (`solveTrussModes`:
>    K φ = ω²M φ on the static-FEA truss, lumped mass, inverse iteration + deflation; 0.1% vs analytical);
>    Imosion exports now render sidechain ducking (`computeDuckingCurve` pre-pass → setValueCurveAtTime; live
>    routing already existed, exports silently dropped it) AND reverb (synthetic-IR ConvolverNode — the plugin
>    type was silent in exports; wired into master + stem chains); Forge auto rules actually EVALUATE (fixed
>    catalog: img>1920px downscale, >10MB quality cap, audio>100MB 16-bit; free-text rules were read by nothing);
>    Vinx speed ramps PLAY (pure `speedRampAt` per-tick in PlaybackEngine × clip.speed — both were stored and
>    ignored; UKI op writes a real keyframed ramp). 46/46 tests, 17 new.
>    **CREATIVE ROUND 3 ✅ (2026-07-02, later):** Imosion groove quantize ACTUALLY transforms notes
>    (`applyGrooveToNotes` — swing shift + push + velocity accents per hardware template MPC60/SP1200/TR808/…,
>    strength-blended; the Apply button used to just close the panel); AXL feature params take EXPRESSIONS
>    (`FeatureExprInput` on all 8 extrude/revolve/chamfer/fillet/pattern/shell/draft inputs, evaluated vs the
>    project parameter table — "width / 2" etc.); Forge auto-rules note fixed (it wrongly claimed rules don't
>    affect in-browser jobs — they DO fire on real image/WAV encodes). 82/82 creative tests (14 new: groove 9,
>    ducking already counted, plus expr coverage). tsc clean. NOTE: preview MCP was down this round → verified
>    by unit tests + tsc, not live browser.
>    **CREATIVE ROUND 4 ✅ (2026-07-02, later):** Forge can now ENCODE VIDEO in-browser — real video→WebM
>    (VP9/VP8+Opus) via canvas.captureStream + MediaRecorder (`transcodeVideoToWebm` in transcode.ts; new
>    `video-webm` route in planTarget gated by `canEncodeWebmVideo`; wired in processJob with resolution
>    downscale + progress). Kills the "all video unsupported" wall for the WebM VP9 preset; MP4/H.264/HEVC/ProRes
>    still honestly native-only (no browser muxer). Shared `computeScaledDimensions` extracted + tested (also
>    de-dups the image path). Vinx multicam angle switch is now UNDOABLE (`createMulticamAngleCommand` +
>    `setMulticamAngle` store action — it mutated the store directly before, bypassing undo). Imosion input
>    monitoring is REAL (was a dead toggle): getUserMedia → MediaStreamSource → gain → ctx.destination, torn
>    down cleanly on disable/unmount. tsc 0; 36/36 round-4 suite (10 new video-webm tests). NOTE: runtime probe
>    confirmed VP9+Opus/captureStream all supported + source WebM generated, but a full real-time video
>    round-trip can't run in the hidden preview tab (browser throttles background <video> playback) — same
>    proven technique as Vinx quickExport; verified by capability probe + unit tests + tsc, not a live encode.
>    (Round 5 pivoted to track 5 — browser ad-block — instead of more creative polish.)
>
> **TRACK 5 — BROWSER AD-BLOCK BY DEFAULT ✅ (2026-07-02):** The mandate's "No ads by default" is real now.
> The browser is an Electron `<webview>` with NO request-interception API, so the old `shouldBlock` only
> caught top-level NAVIGATION to an ad domain (never happens) — actual ads load as sub-resources and were
> never touched. Fixes: (1) `DEXAPPLICATIONS/browser/adblockEngine.ts` — tested filter engine (label-boundary
> suffix match so "notdoubleclick.net" ≠ "doubleclick.net", path entries, tracking patterns, per-site
> allowlist / "shields down"); Browser.tsx navigation guard now uses it. (2) `adblockContentScript.ts` —
> `buildAdblockScript` generates a self-contained IIFE injected on every page's `dom-ready` via
> executeJavaScript; running IN the page it overrides fetch/XHR/sendBeacon/Image and MutationObserver-scrubs
> ad `<script>/<img>/<iframe>` as they insert — REAL sub-resource blocking. Reports blocks via a console
> marker the host tallies into `blockedCount`. On by default (blockAds+blockTrackers default true). 26 unit
> tests incl. a code-injection-breakout guard + behavioral eval; live-verified in WebView2 (all APIs present,
> matcher correct, fetch override blocks ad + passes legit + restores). ✅ (2026-11-12) track-5: element hiding,
> EasyList-style list import and per-site Shields (DEX_REMAINING_WORK #157). Native WebView2 request blocking ✅ 2026-11-12 (#165). Other remaining: ~~Vinx 3D-LUT math~~ ✅ 2026-11-12 (#158); Forge
> WebCodecs muxer; Imosion take comping; track 2 (UKI scheduling); track 6 (Store lifecycle).
>
> **TRACK 6 — STORE APP LIFECYCLE ✅ (2026-07-02):** Install/remove/reinstall/reset is real (mandate:
> "install Dex apps... remove apps... reinstall... reset... default setting, that's when you can get the app
> back"). New `store/installedAppsStore.ts` — persisted removed-set (`dex-removed-apps`, empty = all installed
> so new apps ship installed) + pure tested reducers (applyRemove/applyReinstall/isAppInstalled/
> filterInstalledItems) + `PROTECTED_APP_IDS` (home/settings/store/files/browser/taskmanager can't be
> uninstalled). Store.tsx: per-app Remove (installed+non-protected) / Get (reinstall) buttons, Removed badge,
> header "Reset apps" + removed count. Removed apps hidden everywhere: CommandPalette filters app commands +
> guards openApp; searchProviders (spotlight) skips removed; and a CENTRAL guard in AppManager's dex-open-app
> handler blocks launch from ANY stale surface (toast "reinstall from the Store"). 15 reducer tests; tsc 0;
> live-verified: remove persists + blocks launch + shows in Store, calculator still launches, Reset restores
> everything and the removed app launches again. NEXT track-6: Settings "Apps" reinstall section; future
> background app-pack download.
>
> **OMNITRIX = DEFAULT ACCENT ✅ (2026-07-02, owner call):** Stylesheet accent baselines are now the
> Omnitrix green family (dark #32D74B, light #1E8E3E, HC-matched greens; colorblind palettes kept).
> Found + killed a silent competing default: ThemeManager hardcoded '#3b82f6' and auto-saved it to
> localStorage on every boot, permanently masking the stylesheet baseline — empty preset accents now
> defer to the baseline and a one-time migration clears the auto-saved blue (deliberate picks survive).
> Verified live: fresh boot computes #32D74B with no inline override.
>
> **SWEEP PASS 2 — HERO THEMES + MOTION + REMAINING APPS ✅ (2026-07-02):** Owner asked for the rest of
> the apps, pro arrangement, better animations, and a Batman/Ben 10/Generator Rex aesthetic. Shipped:
> (1) Hero Theme accent presets in Settings > Appearance (Dark Knight #ffd60a, Omnitrix #32d74b, Nanite
> #ff6b1a) — one tap re-tints the whole OS via the accent-family deriver; in settings search; swatch glow
> tightened to 4px per the sharp rule. (2) FIXED a real accent bug: the "system default" swatch could
> never restore the default once a custom accent was set (circular var(--color-accent) resolution in
> accentFamily.ts). (3) Motion unification: window/app/panel/menu animations bound to the existing
> --motion-*/--pg-curve-* tokens — open 300→220ms, close 200→160ms, minimize/restore 250→200/220ms,
> ContextMenu on --ease-tahoe, dex-panel-in ×20 on --motion-panel-expand. (4) Remaining-apps audit:
> 4 more scroll fixes (Notes list + outline, Prism filter gallery + asset library, Home wallpaper
> picker); Settings row alignment (AccessPanels 10px→space-3, TaskManager detail panel). Audits
> confirmed controls in browser/files/notes/productivity/rewind/system/polish/prism/vinx/creative are
> wired and HomeWidgets drag is already rAF-batched. tsc 0; tests green; verified live.
>
> **CROSS-APP BUG + UI SWEEP ✅ (2026-07-02):** Four parallel audits (scroll/overflow, unwired controls,
> layout/style bugs, logic bugs) over all 17 DEXAPPLICATIONS + pages/components, then fixes — no deferrals.
> SCROLL: added the missing `minHeight: 0` to flex scroll containers in Axl parts library, Forge sidebar +
> job queue, and shared ChatPanel messages (the classic flex bug: pane grows instead of scrolling).
> STYLE (the shorthand+longhand React gotcha — on-state borders/padding silently dropped): fixed
> MarkdownEditor outline buttons, Imosion "Third Party" header + delete-preset button, NumberInput
> (styles/components.tsx), Axl PropertiesPanel tab underline (both), Axl FeatureTree sidebarItemStyle;
> Flux history list key={index} → stable key. CONTROLS (all in Flux; verified live in preview): GIF-export
> FPS select + VP9/VP8 codec buttons now drive the WebM encode (removed the un-honorable Loop select);
> Lottie Optimize/Minify wired into the JSON emit (removed no-op Flatten); motion-path ease buttons +
> Orient (adds tangent rotation keyframes) + Closed wired into Apply; Null Objects parent select + offsets
> wired into create + real null list (was hardcoded empty); Advanced Particles emitter shape + birth-rate/
> lifetime/speed/spread sliders now edit the selected layer's real particleEmitter (DEFAULT_PARTICLE_EMITTER
> hoisted; honest hint when no particle layer selected; removed fake Sub-Emitters/Collision boxes);
> shader u_color uniform wired (hue-rotate delta in Compile & Apply); precompose checkboxes wired;
> camera DOF focus-distance slider wired; dead IPC `resource-governor:getHardwareProfile` →
> `getStatus.hardwareProfile.tier`. Logic audit came back clean (matches prior audits). tsc 0; 32 unit
> tests green; Flux particles panel + GIF export verified live (shape click round-trips through layer state).
>
> **TRACK 2 — UKI BACKGROUND TASK SCHEDULING ✅ (2026-07-02):** Recurring background tasks that fire on the
> shared heartbeat, self-recheck, and retry-with-backoff (mandate: "automate and work on tasks in the
> background... rehook ourselves to check on tasks"). Built on the existing pure primitives (cron.ts,
> backoff.ts). New: `shared/automation/scheduledTasks.ts` — pure engine (computeNextRun for cron+interval,
> isDue/dueTasks, applyRunResult = success→next slot / failure→backoff then resume cadence; describeSchedule).
> `store/scheduledTasksStore.ts` — persisted CRUD (`dex-scheduled-tasks`, MIN_INTERVAL 60s clamp).
> `services/scheduledTaskRunner.ts` — SharedTick subscriber (30s, fireImmediately) that fires due tasks,
> executes reminder (notify) / app-action (runUkiAction), records each run in the UKI ledger (useUkiTasks,
> source 'automation' → shows in Nexus), and folds the outcome through applyRunResult. Started in App.tsx boot.
> `components/ScheduledTasksPanel.tsx` — add cron/interval reminder + enable/disable/delete + next-run/outcome,
> surfaced in TaskManager next to NexusUkiPanel. tsc 0; 37 unit tests (engine 16, store 5, + existing cron/
> backoff). LIVE-VERIFIED end-to-end: created a reminder in the UI (persists + shows "every 60 min"/1 active),
> forced it past-due, and the runner's boot tick fired it (runCount 1, outcome ok), logged an 'automation'
> task in the UKI ledger (status done), and rescheduled to the future. ALL 7 MANDATE TRACKS NOW SHIPPED.
> NEXT (polish, not new tracks): ~~app-action scheduled tasks w/ pre-approval~~ ✅ 2026-11-12 (#162); Settings schedule UI; per-site
> browser shields; Vinx 3D-LUT; Forge muxer; Imosion take comping.
> 5. **Browser.** Speed, security, reliability; **ad-blocking ON by default**; background-first operation with
>    popups only for necessary notices.
> 6. **Store lifecycle.** Users install/remove DEX apps (e.g. skip the music/video creative apps); removed apps
>    reinstall from Settings; "Reset DEX" restores the default app set; future: background download of app packs.
> 7. **Longevity + hygiene.** No throttling by time/heat ("everything works, long-term"); crash recovery stays
>    (boot-guard + per-app boundaries shipped earlier); dropdown/menu consistency (menus-as-data); dead-code
>    sweeps; handle large data (TB-scale) with less energy — VirtualList everywhere a list can grow, native Rust
>    for heavy lifting (audio DSP + search index precedent).
>
> **CHECKPOINT (2026-11-02) — DEX OS 7.0.1 (Part 6) on `claude/dex-part4`, merged with `main` through #72.**
> Interface Transparency slider (0–100, default 55 = refined glass) replaces the glass mode/tint/opacity controls;
> Calculator rebuilt (safe parser, focus-scoped keys); battery out of the top bar; DEX Bar reserves its strip;
> one live-activity store with honest failure/cancel; local AI (Ollama) opt-in, no startup probe; thermal monitor
> samples in bursts (was a perpetual rAF loop); notification sound setting reaches the Windows toast; release
> profile (thin LTO), installer metadata, bundle gate (dev-file check, SHA256SUMS, signature status).
> Not done: signing (no cert), packaged smoke of 7.0.1, perf traces, high-DPI. Evidence and verdict (NOT READY):
> `DEX_7.0.1_VERIFICATION.md`; open items: `DEX_REMAINING_WORK.md` #1–#36.
>
> **CHECKPOINT (2026-07-01, later) — Stage Manager + UKI background tasks shipped (this session).**
> Verified live in the Vite preview (driven via `dex-stage-toggle`/F3/Escape events + computed transforms, per the
> never-screenshot rule): 3 running apps fly into a centered grid at scale ~0.38 with aspect preserved, hit-target
> overlay aligns to the fitted rects (+4px ring), Home dims `brightness(0.45)`, click-select restores styles and
> brings the app forward, Escape restores everything. Unit-tested the task ledger (7 tests: lifecycle, stall sweep,
> revive-on-step, eviction spares active tasks, crash-honest rehydrate). Gotchas hit: `runningApps` does NOT
> include `home` (query the home container directly); a second `F3` handler already existed in `keyHandlerRef`
> (don't add another — extend it); preview freezes CSS animation/transition clocks AND throttles page timers when
> hidden, so verify via inline styles + `document.getAnimations().finish()`, not computed mid-transition values.

> **CHECKPOINT (2026-07-01) — GLASS REMOVED: whole OS is now one consistent, solid, non-glass surface.**
> Owner reversed the master-overhaul glass direction. Done + verified live in preview (computed `backdropFilter`,
> per the never-screenshot rule):
> - Default `glassMode: 'off'`, `glassOpacity: 1` in `store/shellPreferencesStore.ts`; one-time migration
>   (`dex-glass-removed-v1` flag) flips any previously-persisted translucent mode to solid so existing installs
>   actually go non-glass. Settings master toggle still exists for deliberate opt-in.
> - Closed the real inconsistency: the FloatingLauncher (and floating chrome) used HARDCODED `.dex-liquid-glass`
>   classes that ignored the glass mode. Added `html[data-glass-effective-mode="off"] .dex-liquid-glass{…}` in
>   `design-system.css` so BOTH glass systems (token-driven + hardcoded classes) now follow the one control point
>   (`applyGlassVars`). Verified: live `[data-dex-nook]` launcher → `backdrop-filter:none`, solid #000, matches menus.
>
> **ACTIVE GOAL (2026-07-01) — "DEX as a real OS": pro-grade, consistent, fast UX (owner mandate).**
> Single vision, ordered by confidence. Each item ships small + verified; no change unless ~98% sure.
> 1. **Consistency pass (in progress).** One look across the whole OS — solid/no-glass done. Next: unify header
>    heights, radius/shadow tokens, dedupe AppShell, kill loose "tools" icons (see [[project-ui-consistency]]).
> 2. **Control Center redesign.** Owner explicitly dislikes it. Rework toward a clean, foldable, collapsible
>    panel (sections/sub-menus/overlays that collapse where needed). NEEDS owner taste input before building.
> 3. **Fold-in everywhere.** Collapsible groups, sub-menus, drawer/overlay patterns for small apps + dense
>    functions so nothing is a flat wall of controls. Reuse `CollapsibleSidePanel` / `CollapsibleToolGroup`.
> 4. **Interaction polish.** Less hover-highlight where it's noisy; better popups that stay open on hold;
>    trackpad-friendly drags; apps move around like a real OS (windowing already exists — tighten it).
> 5. **Speed / "alive" feel.** Responsive, real motion where it helps; static where motion is noise
>    (pair with FrameScheduler + reduced-motion).
> 6. **Readiness tracks.** Creative + hub users; DexCode/Terminal for dev + cybersecurity; UKI + Nexus under
>    this same consistent shell. Privacy-first: everything passes through DEX, encryption on DEX-managed data.
> 7. **Stability.** Fix the crashing/backup-restore paths surfaced by the owner (needs repro specifics).
>
> NOTE: the "UNIFIED GLASS ENGINE" checkpoint below is now SUPERSEDED — the owner reversed direction and glass
> was removed (this checkpoint). Kept below for history; the lightningcss/glass-killer learnings still apply.

> **CHECKPOINT (2026-07-01) — Master overhaul, pass 1: the UNIFIED GLASS ENGINE is actually alive + shared-layer unification.**
> Fixed the crash-on-localhost first (`ui/index.ts` still re-exported the deleted `ui/AppShell`), then ran a 7-agent
> audit of the shared design layer vs DEX_MASTER_OVERHAUL_PROMPT and shipped the highest-leverage shared-layer pass
> (one edit elevates every app). VERIFIED LIVE in preview via computed styles (screenshots time out — the animated
> glass shell never idles).
> - **THE build bug that killed ALL glass** (see [[project-lightningcss-glass-killer]]): vite.config used
>   `css.transformer:'lightningcss'`, whose bundled data emitted ONLY `-webkit-backdrop-filter` and DROPPED the
>   standard `backdrop-filter` — but the WebView2/preview Chromium honors ONLY the unprefixed form (verified), so
>   every glass surface was blur-free app-wide regardless of CSS. **Removed the lightningcss transformer** (esbuild
>   default keeps the property; `cssMinify:'esbuild'` still minifies). `css.lightningcss.*` options were ignored in
>   Vite 5.4 dev, so target-tuning didn't help — removal was the fix.
> - **Re-enabled the glass engine (3 CSS kills → gated):** `globals.css` universal `* { backdrop-filter:none
>   !important }` → scoped to `html[data-no-blur="true"]`/`.dex-no-blur` (glass ON by default); menu/popover block
>   no longer forces opaque+blur-none (menus inherit glass); `design-system.css` `--blur-sm/md/lg/xl` restored from
>   `blur(0px)` → `4/8/16/24px`.
> - **Unified runtime authority:** `applyGlassVars()` now sets/clears `data-no-blur` (and zeroes `--blur-*`) by
>   effective glass mode, so Settings › Liquid Glass = Off/Reduced flattens EVERY surface (verified toggling on/off).
> - **Focus/selection/hover:** one canonical focus ring, monochrome WHITE (`--dex-focus-color`) in globals.css +
>   tokens.ts `focusRing` (was blue, doubled); `::selection` → subtle 0.24 + `color:inherit` (was 0.35 + forced
>   primary); added the shared "light response" hover primitive (`:where(button,[role=button]):hover { filter:
>   brightness(1.09) }`, `@media (hover:hover)`, low-tier-killed) the spec asked for.
> - **Token mirror + launcher:** `tokens.ts radius` corrected to match the canonical CSS scale (was the old boxy
>   2/3/4/6/8/10 → now 4/6/8/11/14/18, re-rounds 45+ inline surfaces); FloatingLauncher elevation now uses
>   `--pg-shadow-popover(-strong)` + `PANEL_R 14` to read as menu-family.
> - **Killed tap-to-wake:** DEX no longer freezes/dims when it loses OS focus. Removed
>   `globals.css html[data-window-focus="blurred"] * { animation-play-state: paused }` (froze ALL animation
>   until you clicked back in) and MotionController's `.dex-window-blurred { opacity: 0.95 }` dim. DEX stays fully
>   live + undimmed when unfocused; power saving stays on document `visibilitychange` (minimized) via SharedTick,
>   which is the correct place. Verified: animation-play-state stays `running` and root opacity `1` while blurred.
> - **Audit follow-ups (NOT yet done — high-value next):** ContextMenu → thin adapter over UnifiedDropdown (shared
>   item/submenu material); real minimize animation (apply existing `.minimize-to-dock` keyframes in AppManager);
>   Control Center collapsible/pinnable sections; delete dead `shell/FloatingWindow.tsx`+`snapEngine.ts`+
>   `WindowDepthManager.ts`; delete 6 dead duplicate `:focus-visible` blocks in design-system.css; reconcile the
>   3 motion-duration scales. Full findings in this session's `dex-design-audit` workflow output.
>   **2026-11-12 (#164):** duplicate focus rules DONE — one canonical ring now (11 competing global/halo rules removed across design-system.css, design-tokens.css, globals.css); purple "AI" gradients → solid accent; coloured halos out of shared shadow tokens; dead glow/gradient-text CSS deleted.
>
> **CHECKPOINT (2026-06-30) — Released v6.0.1: scale (FrameScheduler) + traceability (Security Center) + UKI retrieval.**
> Pre-repack health gate PASSED: full-project `tsc --noEmit` 0; watermark in compliance; 3541 test assertions
> green / 0 failed-test markers (new suites 18/18: frame-scheduler, rewind-recall, text-search, use-app-active).
> Cut as a patch release (6.0.0 → 6.0.1), built locally via `tauri build`, published on onazioj179-lab/Dex; the
> prior DEX releases (v6.0.0 on Dex, dex-v5.1.0 on dex-updates) were pruned (other products left untouched). Work:
> - **Cooperative FrameScheduler** (`services/FrameScheduler.ts` + `hooks/useScheduledWork.ts`): priority bands
>   (`user > normal > idle`) run background work in time-sliced bursts under a per-device-tier budget
>   (`TIER_BUDGET_MS` low 3ms → ultra 12ms), yielding via MessageChannel; tasks for a `suspended` app are deferred
>   until it resumes (pairs with `services/AppLifecycle.ts` + `TierManager`). Adopted in LiveActivityBrowser,
>   Learn, ProjectDashboard.
> - **UKI app-action registry** (`uki/appActionRegistry.ts` + `shared/uki/appActions.ts`): apps register
>   confirm-gated read/write actions; `agentRunner` exposes them as dynamic tool specs. Adopted across 15 apps.
> - **Security Center app** (`standalone/SecurityCenter.tsx`, registered `security:`): live audit trail of every
>   UKI action (app, redacted args, outcome, time) from the registry's ring buffer, updating on
>   `dex-uki-action-audit`, with All/Writes/outcome filters. Built on the AppShell standard.
> - **UKI retrieval**: `shared/search/textSearch.ts` (`searchLines`) backs notes/markdown/dexcode/tasks search;
>   `shared/rewind/recall.ts` (`resolveRecallDate`) powers cross-session recall in Rewind. Both pure + unit-tested.
>
> **DONE (2026-06-26) — Creative suite standardization + multi-window "use all at once".**
> Cleared the queued creative-app work (all tsc 0, watermark 0 (2187), verified live in preview):
> (1) **Flux draggable keyframes** — timeline keyframe diamonds are now drag-to-retime (pointer
> capture, collision-safe, re-sorts the track; click with no drag still seeks). Wired the dead
> Trim-Paths "Simultaneously/Individually" mode toggle. (`flux/Flux.tsx`)
> (2) **Forge real waveform + trim scrubber** — new `decodeAudioPeaks()` + `sliceBuffer()` in
> `forge/transcode.ts`; the Trim & Split panel decodes the selected audio job into a real peak
> waveform with draggable in/out handles, a seconds/selection readout, and an honest empty state
> for video. Trim is now actually applied on WAV encode (was previously a dead setting).
> (3) **Vinx editable color-wheel readouts** — the R/G/B/M readouts under each Lift/Gamma/Gain wheel
> are now editable numeric fields (commit on Enter/blur, Arrow nudges, ±1 clamp). (`vinx/ColorWheel.tsx`)
> (4) **Standardized creative menu bar** — new reusable `components/CreativeMenuBar.tsx` (desktop-style
> menu bar with dropdowns + nested submenu flyouts, edge-aware, portal-rendered, no-glass) and
> `components/CollapsibleSidePanel.tsx` (collapses to a labelled rail, persisted). Folded the long
> Features dropdowns of Forge / Flux / Vinx into File/Edit/View/… menus with grouped submenus.
> (5) **"Use All Apps at Once"** — `AppManager.autoTileAll` reads its window set from the latest state,
> and new `tileAllRunningApps` detaches every running app then tiles them together; reachable via the
> Command Palette ("Use All Apps at Once") and the `dex-arrange-windows` event with `{ includeAll: true }`.

> **CHECKPOINT (2026-06-26e) — Apps sit on the NORMAL background (no framing box) + dead notification UI removed.**
> tsc 0; VERIFIED LIVE: Trophies root background is now `rgba(0,0,0,0)` on the `rgb(12,12,14)` (`--color-bg-base`)
> window surface -- the distinct app-coloured box/frame is gone. Owner: stop painting a background "around the
> app"; content should sit on DEX's normal app background (Apple-Arcade-clean), keep solid panels, no glass.
> - **Trophies + Games roots → `background: 'transparent'`** so they inherit the AppManager window's
>   `--color-bg-base` (AppManager.tsx already sets it per app). My earlier near-black `#060607` was a hair off
>   `--color-bg-base` and that mismatch read as a boxed frame. Cards/panels stay solid (`#101012`/`#16161a`).
> - **Dead code removed (closed the spawned cleanup task):** deleted the never-mounted `NotificationBell` +
>   its `NotificationPanel` + `NOTIF_ICON_COLORS` + the now-orphaned `sharedTick` import from
>   `UnifiedSystems.tsx` (-280 lines). Kept the shared `pillBtnStyle` and the `panelOpen`/`setPanelOpen` store
>   fields (still used by SystemFeatures + the provider). The reachable menu-opened center supersedes the bell.
>
> **CHECKPOINT (2026-06-26d) — Games app: de-glassed to true-black SOLID + real playtime overview.**
> tsc 0; VERIFIED LIVE (0 console errors; 0 backdrop-blur/glass elements; no `dex-liquid-glass*` class):
> "Total playtime" band shows 201h aggregate + top games 123h/54h/23h, Continue-playing rail renders.
> Same direction as Trophies (owner: solid black, not glass; lead with an overview). `pages/Games.tsx`:
> - **Dropped the glass:** removed `dex-liquid-glass-strong` from the root (now flat `#060607`), replaced the
>   `glassButton`-based action buttons with solid `#16161a`/`#26262b` buttons. Verified 0 glass elements live.
> - **Added a real "Total playtime" overview band** (the reference's "Your Statistic" idea): aggregate hours
>   across all games + games/played counts + the top-3 games by real `games:playtime` (hours each). No fakes.
> - **Kept** the cover-grid library (a game library IS legitimately a grid, not a "lame list"), storefront
>   filters, Continue-playing rail, search, scan/refresh. Library degrades to EmptyState without the bridge.
>
> **CHECKPOINT (2026-06-26c) — Trophies app: progress-first dashboard, TRUE-BLACK SOLID (no glass), award list removed.**
> tsc 0; VERIFIED LIVE (0 console errors; 0 backdrop-blur/glass elements in the app subtree): "Your Trophies",
> "Your statistics" ring, "Progress by category", "Almost there", "Recently unlocked" all render; the old
> filter bar + ~5000-card award grid are GONE. Owner direction: stop using glass for apps (solid true-black),
> and DELETE the giant award list -- users want to SEE PROGRESS, not scroll a list. Rebuilt `Achievements.tsx`
> as an original progress dashboard (NOT a copy of the reference mockup's artwork; no fabricated data):
> - **Solid true-black theme:** flat `#060607` base, opaque `#101012`/`#16161a` panels, solid `#26262b`
>   borders, gold accent. Zero translucency, zero `backdrop-filter` (verified live).
> - **Deleted:** the full achievement card grid + filter/tabs/search/status/recent bar + incremental-render
>   machinery + the `AchievementCard` component + `DexSearchInput` usage.
> - **Progress-first content:** Spotlight hero (most-recent unlock, or nearest locked = "Next up"); a
>   conic-gradient completion ring + points/streak/level tiles; **Progress by category** bars (real got/total
>   per `CATEGORY_META`, sorted by completion); **Almost there** (top-4 real in-progress trophies); Recently
>   unlocked rail; daily-challenges bar. Live-update listeners + Share preserved. No faked data.
>
> **CHECKPOINT (2026-06-26b) — Master overhaul (perf/OS-thinking): fixed the broken app-background pause primitive.**
> tsc 0; 5/5 new jsdom hook tests; demonstrated on the LIVE DOM. Against the master spec's "apps outside the
> viewport should intelligently pause heavy work while preserving instant resume." Found that the shared
> `useAppActive()` (utils/perfAware.tsx) -- the hook every app is meant to use to pause loops when backgrounded
> -- was BROKEN: `findContainer()` ignored the caller and returned the *global* `[data-app-state="foreground"]`
> container, so it returned `true` whenever ANY app was foreground. Result: a backgrounded app never saw itself
> as inactive. Nexus (its one adopter) kept running its full canvas animation loop while another app was on top
> -- a core pinned on a hidden window, the exact waste the spec calls out. `useSuspendableRAF`/
> `useSuspendableInterval` (built but un-adopted) inherited the same bug.
> - **Fix:** `useAppActive(ref?)` now resolves THIS app's own container via `ref.current.closest('[data-app-container]')`
>   and tracks *its* `data-app-state` (MutationObserver, attributeFilter-scoped). No-ref calls keep the old
>   global behavior as a documented back-compat fallback. The ref is forwarded through both suspend hooks.
> - **Adopted:** Nexus now calls `useAppActive(containerRef)`; its draw loop's `if (!isActiveRef.current) return`
>   guard finally fires when Nexus is backgrounded.
> - **Verified:** LIVE DOM with Nexus backgrounded + Calculator foreground -> OLD logic returns true (bug,
>   keeps animating), NEW logic returns false (pauses). Behavioral frame-stop can't be observed in the headless
>   preview because the hidden tab globally pauses rAF (FrameGovernor `document-hidden`) -- so the per-app
>   *decision* is proven by the 5 jsdom tests (background-with-other-foreground / own-foreground / live
>   background flip / instant-resume / no-ref fallback) instead. `tests/unit/use-app-active.test.tsx`.
> - **Adopted #2 -- Vinx ScopesPanel.** The waveform/vectorscope `tick` redraws every frame and only guarded on
>   `document.hidden` (whole-window), so it kept doing per-frame `drawImage`+`getImageData` readbacks while Vinx
>   sat behind another DEX app. Now also skips on `!isActive` via `useAppActive(canvasRef)` -- the exact case the
>   author's own comment ("the scopes are not visible anyway") wanted but couldn't express before the fix. tsc 0.
> - **Deliberately NOT adopted:** Flux playback (its rAF advances the playhead AND drives video recording/export
>   -- pausing it would corrupt an in-progress export) and audio apps (NoiseGenerator / Imosion -- ambient/music
>   audio is MEANT to keep playing when you switch apps). Only purely-visual, occluded-when-backgrounded loops
>   are safe to pause. Shell chrome (ShellOrbs / WallpaperAccent) is always visible, so per-app pause N/A.
> - **Next adopters (queued):** any remaining purely-visual per-app continuous canvas can pass its container ref.
>
> **CHECKPOINT (2026-06-26) — Notification redesign: the center is finally REACHABLE + live deep-links + group digest.**
> tsc 0 (full project); 13/13 new digest unit tests; VERIFIED LIVE in preview (0 console errors). Closes the
> "Notification redesign (live actions / quick-reply / grouping / AI summary)" overhaul theme as far as it can
> be built honestly in a renderer-only pass. Root finding: the hub-backed `NotificationCenter` (shell/
> NotificationBanners.tsx) had NO opener anywhere -- `setShowNotifCenter(true)` did not exist, and the
> alternate `NotificationBell`/`NotificationPanel` (UnifiedSystems.tsx) is never mounted. So NO persistent
> notification center was reachable at all; notifications only flashed as transient banners. Shipped:
> - **Reachability (the real fix).** Added a "Notifications" item (with the live `hubUnreadCount` badge) to the
>   top-bar control-center dropdown menu in `AppManager.tsx`, opening the hub-backed center. This honours the
>   owner's earlier "keep the top bar bell-free; open from the control-center menu" directive -- whose stale
>   comment claimed it was already reachable (it wasn't). VERIFIED LIVE: menu -> Notifications -> center opens.
> - **Live deep-link actions.** The persisted hub `action` envelope (a deep-link `target`) was being DROPPED in
>   the `centerNotifications` mapping, so persisted notifications were dead ends once their banner faded. Now
>   carried through; each center card with a target renders an "Open" affordance that routes via the proven
>   `dex-spotlight-navigate` contract (URL -> browser, `appId`, or `appId:context` e.g. `settings:network`),
>   marks read, and closes. New single-source `readHubTarget()` in services/notify.ts. VERIFIED LIVE: injected
>   3 records (2 with targets) -> exactly 2 "Open" buttons -> click dispatched `{appId:'files'}` + closed.
> - **Group digest ("summary" leg, done honestly).** New pure `shared/notifications/digest.ts`
>   (`summarizeGroup`/`relativeShort`/`topPriority`) renders an on-device per-source digest in the grouped view
>   ("2 notifications, 1 urgent"). Deterministic counts, NOT a fabricated model gloss -- a provider summary can
>   layer on `headline` later. VERIFIED LIVE: NETWORK group showed "2 notifications, 1 urgent". 13 unit tests.
> - **DRY.** Collapsed the duplicated grouped/timeline card markup into one `CenterCard` (deep-link + in-session
>   action closures + reduced-motion + read styling).
> - **Honest scope:** quick-reply (inline text input) needs a messaging/relay backend to be real, so it was
>   FLAGGED not faked. Dead `NotificationBell`/`NotificationPanel` pair left for a separate cleanup pass (chip
>   spawned) -- removing ~150 lines from the concurrently-edited UnifiedSystems.tsx mid-session was too risky.
>
> **CHECKPOINT (2026-06-25s) — AXL: real 2D Sketcher -> 3D solid (parametric core).**
> tsc 0; 13/13 new sketch unit tests green (`tests/unit/axl-sketch.test.ts`). VERIFIED LIVE: Create -> "New
> Sketch" opens the gridded sketch overlay with the SKETCH toolbar. (Couldn't drive the mouse-draw live —
> the headless preview lays AXL's canvas out at 0x0 — so the geometry it feeds is proven by unit tests
> instead; the commit path `extrudeSketch -> addMeshPart` is the same one the verified OBJ import uses.)
> - **`AxlSketch.ts`** (new, pure): `profileFromEntities` (rect / circle / chained-line loop), `triangulate`
>   (ear clipping, winding-safe), `extrudeSketch` (caps + side walls, recentred, correct +/-Z), `revolveSketch`
>   (surface of revolution about Y), `snapSketchPoint` (grid + endpoint). Outputs the renderer's raw `mesh`
>   payload. Tests cover quad->2 tris, n-gon->n-2, CW input, box index count (36), recentring, snapping.
> - **`SketchOverlay.tsx`** (new): self-contained 2D editor — line/rect/circle drag-draw on a gridded plane
>   with live snapping, depth input, Extrude + Revolve, Clear/Close. Commits the mesh as a new part.
> - **Wiring**: uiStore `showSketch`; rendered in the viewport; "New Sketch" in the Create flyout; UKI skill
>   `axl.sketch` (intent /sketch|draw a profile/) -> `newSketch` op opens it. This is the parametric-modeling
>   backbone (sketch -> solid) the prior turns flagged as the next big lift.
> - **Still gated:** a full NURBS BREP kernel (exact fillets/booleans, true STEP/IGES surfaces) remains the
>   one genuinely multi-week item — not faked.
>
> **CHECKPOINT (2026-06-25r) — AXL is now UKI-driven (natural-language CAD actions).**
> tsc 0. VERIFIED LIVE (0 console errors): typed "add a cylinder" in the AXL command bar -> planned
> `addPrimitive` -> Apply -> a real cylinder part appeared in the tree; "section along y" -> applied ->
> section enabled on Y + Inspector opened to Section. Owner: make AXL UKI-driven, keep adding features +
> work the UI/internals. The previously-ORPHANED `handleAxlOp` applier is now wired into a real feature.
> - **CreativeCommandBar mounted in AXL's AI panel** (`Axl.tsx`) with `appId="axl"`, live facts
>   (`partId`/`partCount`), `onApplyOp={handleAxlOp}`, and example chips ("add a cylinder", "shell it 2mm",
>   "run a stress study", "section along x", "check interference", "generate bom").
> - **`handleAxlOp` rewritten + relocated** (after its deps) from a 3-op read-only stub to a real executor:
>   read-only ops (mass/GD&T/parametric) still answer via `aiAnalyze`; mutating ops run REAL store actions —
>   `addPrimitive` (parses box/cylinder/sphere/cone/tube/torus/wedge + synonyms), `shellPart`/`draftPart`/
>   `ribPart` (adds the feature with a parsed numeric arg to the selected part), `runSimulation` (parses
>   stress/thermal/motion), `explode`, `section` (parses axis, opens Inspector), `interference`,
>   `generateBOM`, `exportModel` (parses format). Unknown ops still skip honestly via `enginePendingApplier`.
> - **10 new NL skills** in `shared/uki/appSkills.ts` (regex intents) + **10 action specs** in
>   `shared/uki/creativeActions.ts`. The whole NL -> plan -> preview -> apply path is the shared, unit-tested
>   `creativeCommand` pipeline; AXL just supplies the applier.
>
> **CHECKPOINT (2026-06-25q) — AXL: Section view, mesh import, Shell/Draft/Rib solid features.**
> tsc 0. VERIFIED LIVE after a clean reload (0 error fallback through every step): Section enables + offset
> slider drives the clip; an injected OBJ tetra imports + renders as a part; Shell applies to a box. Owner:
> "do em" (Section / Shell-Draft-Rib / STEP-OBJ from the pro-CAD list). All real geometry — no stubs.
> - **Section View** (`engine/Renderer.ts` + Inspector "Section" tab): a real WebGL clip plane — the frag
>   shader discards fragments past `uClipPlane` (per-fragment, no extra passes). UI gives enable / axis
>   (X/Y/Z) / offset slider / flip; `RenderState.section` carries it, set once per frame. Reveals interior.
> - **Mesh import** (`AxlImport.ts`, new): real parsers — OBJ (n-gon fan-triangulation, negative indices),
>   STL (ASCII + binary auto-detected via the 84+50n length check), and STEP (point-extent: every
>   CARTESIAN_POINT -> bbox -> a box sized to the file's real envelope, honestly labelled). Imports recentre
>   on bbox + downscale huge models. New `PartFeature.mesh` raw-triangle payload; `meshForPart` draws it
>   directly; `projectStore.addMeshPart`; mesh-aware cache key (id+size) so distinct imports don't collide on
>   one GPU mesh. Wired via a hidden file input + "Import Mesh" in the Create flyout. Verified: OBJ tetra ->
>   real part, rendered.
> - **Shell / Draft / Rib** solid features (`engine/Renderer.ts` `meshForPart` + feature creator): genuine
>   geometry. Shell hollows round solids to a tube (inner = r - t) and box/wedge via a new
>   `generateShellBoxMesh` (six merged wall slabs); Draft tapers vertices toward the Y axis by angle
>   (`applyDraftTaper`); Rib merges a thin reinforcing web sized to the part's extent. Added to the
>   `PartFeature` type union + the Add-Feature panel (Shell/Draft/Rib chips + thickness/angle inputs).
> - **Honest scope note:** full STEP/IGES BREP (NURBS topology) still needs a real kernel — STEP currently
>   imports the point envelope, not surfaces. That kernel is the next big lift if wanted.
>
> **CHECKPOINT (2026-06-25p) — AXL: icon-first toolbar, tools grouped into flyout menus.**
> tsc 0 (AXL files clean; the 2 open errors are another session's Imosion `useWorkingPhrase`). VERIFIED LIVE
> after a clean reload: toolbar renders, every flyout opens, Add-Box from the Create menu adds + closes the
> menu, Analyze->Inspector->Interference->Run Check returns an overlap result, 0 error fallback. (The `<AXL>`
> crashes in the console are all stale HMR-intermediate builds — `ui.toggleInspector` referenced before the
> uiStore module hot-reloaded; gone after a full reload.) Owner: tools in dropdowns/submenus for similar
> tools, less text + more icons, strip noisy tooltips.
> - **`components/Toolbar.tsx` rewritten** from a flat strip of ~20 labelled buttons to icon-first with
>   grouped flyouts: core transform tools (Select/Move/Rotate/Scale/Measure) stay as bare icons; everything
>   else collapses into **Create** (7-primitive grid + Parts Library), **Modeling** (Feature/GD&T/Constraints),
>   **Analyze** (Simulation/Inspector/BOM/Exploded), and **Export** (icon trigger, format submenu). One
>   `openMenu` state, full-viewport backdrop closes it; labels live inside the menus only. Dropped the `Pill`
>   text-button usage entirely.
> - **Viewport rail (`Axl.tsx`)** stripped to icon-only: view modes (3D/Front/Top/Right/2D), Solid/Wire,
>   Grid, Inspect are now 24x22 square icon buttons with `aria-label` (no visible text, no `title` tooltips).
> - No new `title` tooltips anywhere; a11y kept via `aria-label`.
>
> **CHECKPOINT (2026-06-25o) — AXL: three real professional-CAD features shipped.**
> tsc 0; ALL THREE VERIFIED LIVE in preview (config captured, interference overlap reported on the two
> default overlapping parts, named view saved with Az/El) — 0 console errors. Owner pushed for actual
> features from the pro-CAD list, not polish. Added, each wired store->geometry->UI and surfaced in one new
> **Inspector** panel (top-rail "Inspect" button + `I` shortcut, 3 tabs):
> - **Configurations / Design Variants** (`projectStore.saveConfiguration/applyConfiguration/deleteConfiguration`,
>   `AxlInspect.snapshotConfiguration`): snapshot every part's transform + visibility + primary-feature params
>   + the parameter table into a named variant; apply restores them non-destructively (pushes undo);
>   `activeConfigId` highlights the live variant.
> - **Named Views / Saved Cameras** (`projectStore.saveNamedView/deleteNamedView`): capture the current
>   camera (azimuth/elevation/distance + viewMode) under a name; clicking a saved view flies the camera back.
> - **Interference Detection / Clearance Checker** (`AxlInspect.detectInterferences` + `partBoundingRadius`):
>   broad-phase bounding-sphere overlap scan over every visible part pair — the exact first pass a real
>   interference checker runs. Reports interferences (overlap depth) and, with a min-clearance value,
>   clearance violations (gap); rows are click-to-select. Pure/deterministic module.
> - **Types/store**: `AXLProject` gained `configurations` / `activeConfigId` / `namedViews`; persist `merge`
>   backfills them (+ `parameters`) so pre-existing saved projects don't crash on `.map`. New uiStore
>   `showInspector` + `inspectorTab`. New file `axl/AxlInspect.ts` (pure helpers).
>
> **CHECKPOINT (2026-06-25n) — Imosion: track alignment fix + piano-roll Tools dropdown.**
> tsc 0. (2) Piano-roll TOOLS row collapsed from 7 text buttons (Legato/Strum↓/Strum↑/Flam/Humanize/Arp/
> Slide) into ONE compact icon "Tools" dropdown -- native `<details>`/`<summary>` (no new React state;
> click an item -> runs + closes via `closest('details').open=false`), less text in the toolbar, menu UX.
> (2b) Beats toolbar: Vary/Randomize/Clear collapsed into one "Pattern" icon dropdown (same `<details>`
> pattern; Perform + Play/Stop kept as primary). Right-click context menus on tracks/clips ALREADY exist
> (track rows have onContextMenu -> setContextMenu w/ chop/clip options) -- confirmed, no change needed.
> (2c) Arrange-view toolbar: FX Bus + Group collapsed into one "Bus" icon dropdown (Export / Store / Add FX
> kept prominent). Three verbose toolbars (piano-roll, beats, arrange) now use the same `<details>` menu.
> (3) Mixer channel strip: flat bg -> brushed-metal console chassis (vertical metal gradient + inset top
> highlight), completing the console look alongside the LED M/S/R + metallic pan knob + console fader.
> Creative apps (Prism/Vinx/Forge) are ALREADY icon-based -- no verbose toolbars to consolidate there.
> (4) Piano-roll notes: flat fill -> top-lit "rendered" look (always-on `inset 0 1px 0` highlight +
> `inset 0 -2px 3px` bottom shade, 3px radius); kept the existing velocity-alpha shading, note colors,
> selection + slide glow. Notes/step-grid/drum-pads were already FL-grade; this is the finishing sheen.
> (1) Track-header alignment: Bug -- in the arrange view the track HEADERS (left panel) were content-driven height and GREW when
> a track was selected (inline volume slider) or armed (input-source select), while the timeline LANES are
> a fixed `height:62px`. So headers and lanes drifted out of row alignment down the list ("not on a
> straight line"). Fix (`imosion/Imosion.tsx`): each header is now a fixed **62px border-box stride** with
> the SAME `borderBottom:1px` separator model as the lane (replaced the old content height + `marginBottom`
> + full border + border-radius with a clean left accent bar), and the header scroll's `padding:4px` top
> offset was removed so row 1 lines up with lane 1. Header + lane now share one exact 62px stride.
> NOTE: File/Tools are ALREADY dropdown menus (showFileMenu/showToolsMenu w/ chevrons); toolbar buttons are
> already icon+short-label. Further per-view toolbar consolidation (Beats/Piano-roll text buttons -> icon
> dropdowns) is the next step but needs a reload to verify (Imosion.tsx HMR-reload is broken) and care
> (the file is being edited concurrently by another process -- AXL overhaul landed mid-session).
>
> **CHECKPOINT (2026-06-25m) — AXL: GPU leak fixes, render-on-demand, solid hardware chrome.**
> tsc 0; VERIFIED LIVE (AXL launches: brushed-metal rail + 2 hardware panels render, 0 leftover glass,
> 0 AXL console errors, page responsive). Owner ask: finish AXL, make the UI solid "like real hardware,"
> kill leaks, perform.
> - **GPU memory leaks (`axl/engine/Renderer.ts`).** Three real leaks closed: (1) `getOrCreateMesh`
>   created position/normal VBOs but only tracked the index buffer -- deleting a VAO does NOT free its
>   bound buffers, so every parametric edit leaked two VBOs. `GPUMesh` now carries `posBuffer`/`normBuffer`
>   and a shared `deleteGPUMesh()` frees all four objects. (2) `invalidateMesh()` did a bare
>   `meshCache.clear()`, orphaning every VAO/VBO on the GPU on each geometry edit -- now deletes resources
>   first. (3) The mesh cache is keyed by a full feature-stack hash, so dragging a slider mints a fresh
>   entry per frame and grew VRAM without bound -- added an LRU cap (`MESH_CACHE_LIMIT = 48`, oldest evicted
>   + freed). `dispose()` reuses the shared deleter.
> - **Render-on-demand (`axl/Axl.tsx`).** The rAF loop redrew the WebGL viewport every frame at a steady
>   60fps even when nothing changed (a core pinned on an idle CAD window). Added a `needsRenderRef` dirty
>   flag raised by any state-driven re-render (via the `renderFnRef` assignment), on resize, and on tab
>   re-show; the loop only draws when dirty, then clears it. Idle AXL now costs ~0 GPU/CPU; drag/orbit still
>   redraw at 60fps because each `setCameraAngle` re-renders.
> - **Solid hardware chrome.** AXL is a precision CAD tool, so it drops glass like the creative suite does.
>   New `.dex-axl-panel` / `.dex-axl-panel-strong` / `.dex-axl-rail` in `design-system.css`: opaque
>   brushed-metal surfaces (faint repeating-gradient grain), a machined top bevel + fine inset seam, crisp
>   edges, no backdrop blur (so no perf-tier / reduced-transparency override needed). Swapped all 14
>   `dex-liquid-glass-strong` usages in `Axl.tsx` (top toolbar -> rail, the rest -> panel-strong) plus
>   `FeatureTree.tsx` / `PropertiesPanel.tsx` / `Toolbar.tsx`.
> - **Integration audit:** AXL is already deeply wired -- SpotlightEngine, CommandPalette, UKI skillPacks,
>   `CreativeSuiteBridge` (send/receive `model`/`image`/`drawing` assets), FileTypeRegistry, SendToMenu,
>   achievements catalog. No orphaned surface found; left as-is.
>
> **CHECKPOINT (2026-06-25l) — Creative suite: premium slider chrome + Imosion LCD.**
> tsc 0; VERIFIED LIVE in Flux (11 sliders rendered with the new look).
> - **CreativeSlider** (`components/controls/CreativeSlider.tsx`) is THE shared value slider used ~190x
>   across Prism (36), Flux (42), Vinx, Forge, and Imosion. It was a bare native `<input type=range>`
>   (just `accent-color` + 4px). Now custom-chromed: a **filled accent track** (inline gradient to the
>   value %), a **premium light domed thumb** that grows on hover and gets an accent **glow ring** on
>   drag/focus, an inset-shadow groove, and Firefox parity. The chrome CSS injects ONCE into the head
>   (id-guarded); the per-value fill + `--cs-accent` are set inline. One change -> every creative app's
>   sliders level up at once. Verified: Flux sliders carry `linear-gradient(... #ff375f ...)` fill +
>   `--cs-accent` set + thumb `appearance:none` active.
> - **Imosion transport LCD** (`imosion/Imosion.tsx`): the time/BPM readout is now a recessed, backlit
>   **amber LCD** (deep inset panel + glowing `#e9b06a` mono digits with text-shadow), like a hardware
>   unit. (Compiles; shows after a reload -- Imosion.tsx still has its HMR-reload issue.)
>
> **CHECKPOINT (2026-06-25k) — Imosion: the two "couldn't drive in preview" caveats, now verified.**
> Full-project tsc 0; 15 new unit tests green. The prior handoff shipped the rack-playhead perf win and
> the FL-style sample chop as "correct-by-construction, type-clean, but un-driven end-to-end" because both
> need real playback / a decoded sample that headless preview can't reliably trigger. Closed that gap two
> ways:
> - **Proved the live constraint (not assumed it):** an rAF probe in the preview timed out at 30s reaching
>   600ms of elapsed frames -- `requestAnimationFrame` is fully paused (`[FrameGovernor] paused:
>   document-hidden`) in the backgrounded preview tab. That is exactly why the playhead *advance* can't be
>   observed here. The *synchronous* wiring DID verify live: a real Play-Pattern click runs
>   `startBeatSequencer -> paintRackPlayhead(0)` and lights precisely the two step-0 cells (one per track)
>   with the exact `inset 0 0 0 1px rgba(255,255,255,0.6)` shadow.
> - **Made both deterministically testable.** Extracted the verifiable cores into pure modules and wired
>   them back (behavior-identical): `ImosionRackPlayhead.ts` (`paintRackPlayhead` + `RACK_PLAYHEAD_SHADOW`)
>   and `ImosionChop.ts` (`evenChopBounds` + `computeChopSegments` -- the even/transient boundary->slice
>   geometry, waveform windowing, source-offset math, sliver rejection). `Imosion.tsx` now imports both
>   instead of defining them inline; `chopClip` maps the pure segments onto AudioClips. Tests:
>   `tests/unit/imosion-rack-playhead.test.ts` (jsdom: highlight-one / clear-rest / clear-all-on-stop /
>   no-match / idempotent) and `tests/unit/imosion-chop.test.ts` (node: even division, uneven transient
>   bounds, trim/startTime offsets, waveform windowing, sliver drop). 15/15 green, tsc 0.
> NET: the perf-win paint and the chop slicing are now verified by deterministic tests; only the rAF
> *advance* remains preview-unobservable (a headless-tab limitation, not a code gap).
>
> **CHECKPOINT (2026-06-25j) — Imosion: real analog-hardware knobs + console faders.**
> tsc 0; verified live (3 metallic knobs render on the mixer). Owner mandate: creative apps should feel
> like real analog hardware (Logic Pro / FL Studio). Upgraded the TWO shared control primitives, so the
> whole DAW (mixer, synths, effects, EQ) levels up at once -- zero logic change, pure visuals:
> - **Knob** (`imosion/components/Knob.tsx`): was a flat `#16161a` circle + a line. Now a domed metal cap
>   (radial gradient, upper-left light), a bevelled rim ring with a real drop shadow, a top sheen, and a
>   glowing indicator notch + tip; the value ring gets a soft backlit glow under the crisp arc. Per-instance
>   gradient/filter ids via `useId()`.
> - **Fader** (`imosion/components/Fader.tsx`): console-style cap -- bevelled body, two grip ridges, and a
>   glowing centre indicator line (kept the existing inset groove + color-zoned VU meter + dB scale).
> - **Mixer channel strips** (`imosion/Imosion.tsx`): Mute/Solo/Rec are now backlit console switches -- lit
>   with a colored glow when engaged, recessed (inset shadow over a dark gradient) when off. Both strip
>   variants (full channel + the compact `msr()` row). tsc 0. (Imosion.tsx has a persistent HMR-reload
>   failure so the preview shows old code; Knob/Fader are separate files and DID reload + verify. Full
>   reload shows the LED switches.)
> NOTE on the rest: spot-checked dev tools are already industry-grade -- GitClient has VS Code-class
> color-coded status (M amber / A green / D red / R,C accent / U muted) + staged-unstaged grouping +
> conventional-commit templates; EnvManager has mask/reveal/copy/diff/validate; DexCode is a full editor.
> No churn applied to already-complete apps.
>
> **CHECKPOINT (2026-06-25i) — Polish sweep batch 2 (partial) + a build-break fix.**
> Full-project tsc 0.
> - **FIXED a broken build**: the batch-2 subagents that hit the account usage cap had left TWO files
>   half-edited -- `ProjectDashboard.tsx` referenced an undefined `SCOPED_CSS` and `QRCodeGenerator.tsx`
>   an undefined `QR_SCOPED_CSS` (the agents added the `<style>{...}</style>` + class hooks, then died
>   before defining the const). The tree didn't compile. Defined both consts -- which also COMPLETES the
>   intended hover/active/focus polish for the dashboard cards/links/rows and the QR tabs/quick-actions/
>   fields. Lesson: a cut-off subagent can leave a non-compiling file -- always re-run tsc after a fan-out.
> - **Stopwatch**: added real keyboard control (Space start/stop, L lap, R reset; ignored in inputs) with
>   a contextual `<kbd>` hint, button press feedback, and lap-row hover. Verified live (Space started it to
>   00:00.98, Space stopped it, hint switched to "R reset").
> - **Timer**: button hover/active feedback + input focus accent (concurrent-timer logic untouched).
> - Confirmed already-Apple-grade, left untouched (no churn): PomodoroTimer, ColorPicker, Calculator
>   (already has full keyboard), and the global `:focus-visible` baseline already covers every app.
>
> **CHECKPOINT (2026-06-25h) — Apple-grade polish sweep, batch 1 (6 apps).**
> Full-project tsc 0 (verified all six together). Surgical, additive polish only -- no data/store/IPC
> behavior changed, no features removed; inline-style / scoped-`<style>` only (no Tailwind utility
> no-ops). Each app keeps its real data.
> - **Tasks** (pages/Tasks.tsx): fixed a real a11y regression (a global `input:focus{outline:none}`
>   stripped keyboard focus) with scoped `:focus-visible` rings; list-aware action-oriented empty states
>   per view; wired the orphaned print stylesheet classes; `onKeyPress`->`onKeyDown` + Escape-to-clear.
> - **Calendar**: Apple-style month cells (today = filled accent circle, weekend tint, real titled event
>   chips w/ "+N more"), keyboard-accessible day cells + view animations + modal spring-in.
> - **Weather**: condition + day/night driven hero gradient (from the real sunrise/sunset), 72px temp,
>   7-day low-high range bars, glass detail tiles, hover/focus. All Open-Meteo data untouched.
> - **Kanban**: column drop-target highlight, drag grip, WIP-count pill (amber at limit / red over),
>   Linear-style priority pills, focus-visible everywhere.
> - **SmartInbox**: search + unread segment, hover/swipe row actions (read/dismiss via existing
>   channel), full keyboard nav (listbox/option), skeleton loading + context-aware empty states.
> - **WorldClock**: day-aware relative offset ("+3h, tomorrow"), day/night-tinted analog face + sun/moon
>   glyphs, keyboard add-city combobox, polished empty state.
> NOTE: small utilities (PomodoroTimer etc.) are already Apple-grade -- left untouched, no churn.
> REMAINING sweep (queued): Maps, ProjectDashboard, PasswordGenerator, MarkdownEditor, UnitConverter,
> ColorPicker, QRCode, GitClient/SshClient/EnvManager, etc. (batch-2 subagents hit the account usage
> limit before editing; resume parallel after reset).
>
> **CHECKPOINT (2026-06-25g) — App pass: real native TaskManager metrics, Games cover-grid, Store ratings.**
> Renderer tsc 0; `cargo check` 0 (Tauri crate); all three verified live, 0 console errors.
> (1) **TaskManager -- REAL metrics (native Rust fix)**: the Rust `system_status()` (src-tauri/src/main.rs)
> only returned memory+uptime, so the CPU/cores/disk/network cards read 0. Rewrote it to sample CPU and
> network as deltas around a `MINIMUM_CPU_UPDATE_INTERVAL` sleep and report the exact structured shape the
> TaskManager reads: `cpu.{usage,cores}`, `memory.{used,total,percent}` (bytes), `disk.{used,total,percent}`,
> `network.{connected,rxBps,txBps}`, root `uptime` -- legacy flat `memory*MB`/`uptimeSec` kept for the
> power/diagnostics consumers. Also fixed `system_processes()` (two refreshes with no sleep -> every
> process read 0% CPU, so ranking collapsed to memory) by adding the same delta sleep. No more fabricated
> zeros; the sparklines now plot real CPU/disk/network. (Battery still needs a battery crate -- left honest:
> "No battery detected".)
> (2) **Games -- Apple/console-grade cover grid**: replaced the bare row list with a responsive cover-card
> grid -- deterministic per-title gradient art, storefront badge (Steam/Epic/GOG/itch/EA/native/web),
> playtime / "Played N days ago", hover-lift + reveal play button, launch spinner state, a "Continue playing"
> rail (most-recent first), and storefront filter chips. Same real `games:*` IPC underneath; click launches,
> right-click shows the launch plan. (Inline styles + scoped CSS, NOT Tailwind utility classes -- those
> silently no-op here.)
> (3) **Store -- ratings on cards**: the user's local star rating was stored but only shown inside the detail
> view; now it surfaces on each grid card (falls back to the Installed badge when unrated). Verified live.
>
> **CHECKPOINT (2026-06-25g) — Memory-leak sweep + internal hygiene.** Full project tsc 0; Imosion
> opens + renders the full DAW with 0 console errors.
> (1) **Leaks fixed** (4-agent full-renderer sweep): Imosion (6) — recording `onstop` now disconnects the
> source/analyser nodes; 4 orphan `?? new AudioContext()` fallbacks routed to ONE shared
> `sharedFallbackCtx()` (browsers cap ~6 live contexts); 2 `new Audio(url)` duration probes use `{once}` +
> `src=''` release. `ThermalAdaptiveMonitor` removes its `dex:thermal-state` IPC listener in stop(). All of
> shell/components/pages + every standalone app + non-Imosion creative verified CLEAN.
> (2) **Hardened** unguarded module-scope listeners (useStore focus, shellPreferences matchMedia) against
> HMR double-bind. (3) **Dead code**: removed FluidOperations' inert menu-close subsystem (nothing ever
> called registerMenu) incl. its two global capture listeners; kept the LIVE visibility-recovery installer.
> See `memory/project-leak-audit-glass-cycle.md`.
>
> **CHECKPOINT (2026-06-25f) — Liquid glass restored shell-wide + all idle behaviors removed.**
> tsc 0; verified live (glass tokens resolve translucent + 24px frosted blur; idle state pinned `active`).
> Owner: make the shell, Nexus, UKI, the DEX Bar app/search menus, and right-click menus all
> consistent GLASS (learn from Apple/Windows), and stop DEX gating/reacting to inactivity for
> long-session heavy users.
> (1) **Glass.** Reversed the stale "DEX Sharp full-flat / strip the glass" era. The real runtime
> control point is `applyGlassVars()` in `store/shellPreferencesStore.ts`, which now computes a
> translucent fill + adaptive backdrop blur per glass mode (off/reduced/normal/liquid) and writes
> the inline `--color-bg-glass(-strong)` / `--glass-bg` / `--glass-blur` / `--dex-glass-*` vars that
> override the stylesheet. `adaptiveBlur()` (`styles/glassMenu.ts`) restored to tier-aware blur, so
> every menu/dropdown/popover/sidebar/toolbar/modal preset re-frosts. CSS glass tokens (design-system.css)
> also translucent again, with `perf-tier="low"` + `prefers-reduced-transparency` solid fallbacks.
> Targeted re-glass of surfaces that hardcoded solid: AppManager top title bar + tab strip + app menu,
> SpotlightSearch home dropdown, ContextMenu submenu, UkiOverlay panel. (FloatingLauncher, ContextMenu
> root, Nexus HUD were already `.dex-liquid-glass`.) Default is now FULL Apple glass
> (`glassMode: 'liquid'`, opacity 0.6); a single master toggle (Settings > Shell & Dock > Liquid Glass
> > "Glass") flips full-on (liquid) / full-off, where OFF makes every surface opaque pure `#000000`
> true black with no blur. See `memory/project-glass-control-point.md`.
> (2) **Idle removed.** Welcome gate (LockScreen "click anywhere"), auto-lock-on-inactivity (App.tsx),
> low-power dimming (IdleContinuity pinned to `active`), and the idle-warning banner are all gone. DEX
> boots straight to Home and never reacts to inactivity; explicit lock still works. See
> `memory/project-idle-removed.md`.
>
> **CHECKPOINT (2026-06-25e) — Three platform pulls: virtualized lists, useAsyncResource, unified Quick Look.**
> tsc 0; PowerRename 13/13 + new VirtualList 6/6 unit tests; verified live (0 console errors).
> (1) **Shared `VirtualList` primitive** -- `components/VirtualList.tsx` is one fixed-row windowing
> component over a single full-height spacer (pure `computeWindow` math, rAF-coalesced scroll,
> ResizeObserver viewport, overscan). Adopted in `LiveActivityBrowser`'s flat feed (the unbounded
> path); the grouped/empty paths are unchanged. Files/Tasks/Rewind are the next adoption sites (their
> rows carry drag/selection/sticky-group markup that needs per-site care) -- the primitive is the
> reusable win.
> (2) **`useAsyncResource` adoption** -- `pages/Gallery.tsx` initial load (media + favorites) now runs
> through the shared hook instead of a hand-rolled mounted-flag + try/catch + finally; the hook owns
> the AbortController, timeout, and set-after-unmount guard. Verified live: Gallery loads, not stuck on
> the spinner. (Audio was already on the hook; remaining sites are mechanical follow-ups.)
> (3) **Unified Quick Look** -- `pages/Files.tsx` dropped its ~55-line local Quick Look overlay (whose
> text preview was a STUB: "Text preview for <name>") and now routes Space to the global
> `dex-quicklook` event, which reads real text via `files:read`. The shell `QuickLook` gained a real
> PDF renderer (iframe) so Files keeps PDF parity. One preview surface, real content, shared everywhere.
>
> **CHECKPOINT (2026-06-25d) — Seamless top chrome.**
> Owner pointed at the global top bar and asked for "seamless, no gaps". The top chrome was a
> two-tier stack (title bar `#141416` + tab strip `#0E0E11`) where EACH tier drew its own
> `borderBottom` + white `inset 0 0.5px 0` gloss line + `0 3px 8px` drop shadow, and the two tiers
> had different background tones -- so the eye saw a colour seam, a bright inner divider, and a
> shadow gap between bar/tabs/content. Flattened in `AppManager.tsx`: both tiers now share one
> surface (`var(--glass-bg, #141416)`), the title bar drops its border+gloss+shadow entirely, and
> the WHOLE chrome carries a single crisp `1px rgba(255,255,255,0.07)` hairline at the bottom of the
> tab strip -- no inner divider, no gloss line, no shadow gap. Verified live (computed styles): tier 1
> and tier 2 both `rgb(20,20,22)`, borderBottom/boxShadow `none` except the one bottom hairline.
>
> **CHECKPOINT (2026-06-25c) — "Steal the best OS features": the four Next-Waves, all shipped + verified live.**
> Closes every item the 06-25b checkpoint listed as "Next waves (NOT done)". tsc 0, PowerRename engine
> 13/13 unit tests, verified live in preview with 0 console errors.
> (1) **Settings deep-links in the palette** -- extracted the Settings section list into a shared,
> React/icon-free module `shell/settingsSections.ts` (single source of truth; `pages/Settings.tsx`
> now derives its sidebar + keeps icons local via `SECTION_ICONS`). The command palette injects one
> "Settings: <page>" deep-link per section ONLY while searching (kept out of the default list), so
> `wifi`->Network, `theme`->Appearance, `biometric`->Privacy+Nexus jump straight to the pane via the
> existing `dex-spotlight-navigate` contract. Verified live.
> (2) **PowerRename** -- new PowerToys-style standalone app (registered end-to-end: runningApps,
> AppManager lazy/AppId/components/launchpad/category/search-keywords, dock glyph, palette entry).
> Pure, unit-tested transform engine `powerRenameEngine.ts` (literal+regex find/replace with
> backrefs, name/ext/full scope, case transforms, prefix/suffix, zero-padded numbering, batch
> collision detection); live before/after preview; sources = drag-drop / load-folder / paste; apply
> goes through the proven `files:rename` IPC. Verified live: `IMG_`->`Vacation-` produced
> `Vacation-001.JPG`...
> (3) **Global Quick Look** -- the orphaned shell `QuickLook`/`useQuickLook()` is now mounted ONCE via
> `shell/QuickLookHost.tsx` and driven by a `dex-quicklook` event (infers type from extension, loads
> text via `files:read`, media via file URL, honours caller-supplied content). Home pinned files now
> Quick Look on Space. Verified live: event opens the preview with rendered content; Esc/Space dismiss.
> (4) **Workspace Time Machine** -- automatic, timestamped layout snapshots. `shell/workspaceTimelineStore.ts`
> is a capped, dedup'd rolling store; AppManager auto-captures every 10 min via `sharedTick` (ref-based
> subscribe so frequent window moves never starve the timer), plus "snapshot now" + restore-by-id, all
> reusing a shared `captureWindowSnaps`/`applyWindowLayout` (same path as named presets/crash recovery).
> `shell/WorkspaceTimeline.tsx` overlay browses the timeline and restores in one click; palette commands
> "Workspace Time Machine" + "Snapshot Workspace Now". Verified live: snapshot captured "2 windows ·
> PowerRename, Calculator", restore reopened them, 0 errors. (NOTE: a case-only filename collision
> `WorkspaceTimeline.tsx` vs `workspaceTimeline.ts` broke HMR on Windows; fixed by renaming the store
> to `workspaceTimelineStore.ts` -- avoid case-only-differing filenames in one dir.)
>
> **CHECKPOINT (2026-06-25b) — Shell/Home cleanup + Spotlight "never a dead end".**
> Focused, verified slice against the "improve shell + home, clear dead code, improve speed" ask
> (tsc 0, 63/63 targeted tests pass, verified live in preview: 0 console errors).
> (1) **Dead-code purge** -- removed the orphaned `QuickAccessApps` component + its `ALL_AVAILABLE_APPS`
> table from `pages/Home.tsx` (defined, never rendered since the Home redesign) and deleted its only
> backing store `store/homeAppsStore.ts` (-172 lines Home, -1 file). `RegistryCommandPalette` was
> KEPT (it has a live test suite; it is the cleaner registry-driven design and a candidate to
> eventually replace the hardcoded palette, not dead).
> (2) **Command palette speed** -- math/unit evaluation (`tryEvalMath`/`tryUnitConvert`) now runs only
> when the query contains a digit; the common alpha-query keystroke path ("notes", "settings") no
> longer spins up the safe-math parser + conversion regex on every character.
> (3) **Spotlight is never a dead end** -- a non-empty query now always offers a "Search the web for
> \"<q>\"" action under Quick Actions, reusing the proven `dex-spotlight-navigate` ->
> AppManager -> Browser contract (same path Quick Actions/Flow use). Suppressed for pure math/unit
> queries (which already show an inline result) and excluded from the recent-commands memory.
> Verified live: `12*9 = 108`, `5 km to mi = 3.106856 mi`, `notes` -> real matches + web fallback,
> `asdfqwer` -> web fallback only.
> **Next waves (need their own verified passes, NOT done):** Settings deep-links in the palette
> (requires extracting `SECTIONS` metadata into a shared module so the palette doesn't pull the whole
> Settings bundle, then mapping query->sectionId via `dex-settings-navigate`); Quick Look real
> file-system preview; Time Machine-style scheduled snapshots; PowerRename bulk-rename surface.
>

> **CHECKPOINT (2026-06-25) — Ultra-premium overhaul, wave 1: launcher motion + Glass 2.0 depth + Control Center.**
> Against the ULTRA PREMIUM OVERHAUL brief. Shipped this wave (all tsc 0, watermark 0, verified live):
> (1) **DEX Bar elevated** -- premium one-time entrance fade (opacity-only so it never fights the
> left/top drag), springy widget-drawer reveal with overshoot (`dexDrawerIn` cubic-bezier, reduced-
> motion aware), and an "interactive glass" hover (soft fill + brighter glyph + faint inset rim) on
> every control. (2) **Glass Architecture 2.0 -- spatial depth**: `.dex-liquid-glass`/`-strong` now
> cast a layered contact + mid + deep-ambient shadow so panels read as physical objects floating
> above the desktop (verified: command palette visibly lifts off the wallpaper). (3) **Right-side
> Control Center** (`components/ControlCenter.tsx`, slides from right, `.dex-liquid-glass-strong`,
> monochrome with accent ONLY for active states): real-backend modules only -- Network
> (networkStore), Liquid Glass + Night Shift (shellPreferences), a genuine screen-dimmer Brightness
> (persisted overlay), Do-Not-Disturb (notificationCenterStore), Performance tier (TierManager),
> Battery (navigator.getBattery); plus filter + persisted reorder. Wired into AppManager top bar via
> `dex-toggle-control-center`. Skipped (no real renderer backend, NOT faked): Bluetooth, audio
> routing, mic, real OS display brightness. Monochrome reconciliation: Nexus's energy accent reads
> as its active-state color, which the monochrome-first rule permits, so it was NOT reverted.
> **Remaining overhaul themes (multi-session, prioritized, NOT yet done):** Window Physics 3.0
> (momentum/inertia/magnetic snap/states), Notification redesign (live actions/quick-reply/grouping/
> AI summary), Dock live-previews + hover-reveal, Search-everywhere command execution, Settings
> redesign (search-first/previews/favorites), spring-physics motion engine system-wide, audio
> intelligence. These need their own verified waves -- landing each solid over faking breadth.
>
> **CHECKPOINT (2026-06-24c) — Liquid glass + Apple rounding + creative-app completion + dead-code purge.**
> Made `.dex-liquid-glass` a REAL see-through frosted material (was orphaned + pointed at
> zeroed tokens): translucent ~0.40-0.54 gradient, blur(30px) saturate(200%) brightness, fresnel
> top rim; added `.dex-liquid-glass-strong` for text-heavy panels; both auto-solid in lite mode
> (data-perf-tier=low) and reduced-transparency. (Inspired by liquid-glass-studio, MIT (c) Charles
> Yin -- approximated in pure CSS; its WebGL2/WebGPU shader engine was judged too heavy to bolt onto
> DEX's many CSS panels.) Applied across launcher, command palette, top notification banner +
> notification center, context menu, quick-actions, unified dropdown, and (via 4 parallel agents)
> ~30 Vinx panels, ~44 Prism panels, Nexus chrome, and 6 small apps. Bumped the radius scale up
> (2-10px -> 4-18px) to kill boxiness. Nexus got a Ben10/Generator-Rex sci-fi theme (Omnitrix-teal +
> nanite-amber energy ring, hex/scan motifs, glowing core) with all controls intact. Creative
> completion: Prism wired ~11 dead tools (Photo Filter/LUT/Replace Color/Select Subject/Refine
> Edge/Liquify Reconstruct/Actions Play/Rulers/Smart-Object replace); Vinx fixed media
> drag-to-timeline (a true no-op) + aligned toolbars; Files got multi-select/batch-delete/copy-move;
> DexCode got fuzzy quick-open. Purged 12 verified-dead modules (-5943 lines), keeping
> searchIndexer.worker (false positive: dynamic `new Worker(URL)`). Verified live: 0 console errors,
> app healthy, glass see-through over wallpaper, Nexus + Prism render clean. tsc 0, watermark 0
> (unified across all agents + direct work). Deferred (not faked): top OS bar / dock glass
> (AppManager layout -- needs its own verified pass).
>
> **CHECKPOINT (2026-06-24b) — Brutal-completion audit (47 verified defects) + 5 broken controls fixed.**
> Ran a 16-slice parallel audit of the whole renderer with adversarial per-finding
> verification (false positives are common here, so every claim was re-checked by an
> independent skeptic). Result: 47 REAL, headless-fixable defects — full triaged
> backlog in `docs/AUDIT-BRUTAL-COMPLETION.md` (retired 2026-11-01; open items moved to `DEX_REMAINING_WORK.md`) (fix-now / fix-careful / remove,
> ranked by value-minus-risk). **Fixed this pass (5 highest-value, lowest-risk
> user-facing controls):** (1) Home Music-Controls widget was bound to dead
> `dex-now-playing`/`dex-media-control` events (display stuck, transport buttons
> no-ops) -> now bound to the real `useNowPlaying` store like MiniPlayer;
> (2) command-palette "Clear Clipboard" removed a retired legacy localStorage key
> and never touched the live Omni Clipboard -> now calls `clipboardStore.clearAll()`;
> (3) CollabHub "Open project" dispatched `dex-launch-app` (no listener) ->
> canonical `dex-open-app`; (4) Home Weather widget shipped a hardcoded fake
> "72 Sunny 45%" -> now reads the Weather app's real keyless open-meteo cache
> (unit-converted) or shows an honest "Open Weather" unavailable state, never
> fabricated data; (5) the DEX Bar could never be hidden (`setEnabled` had zero
> callers) -> added an in-bar "Hide bar" control + a "Show DEX Bar" toggle in
> Settings > Shell & Dock (the mandatory re-show path). Verified live in preview:
> 0 boot/console errors, weather cache read returns real 57F/Partly Cloudy/71%
> (null when absent), DEX Bar hide/show round-trips through persistence. tsc 0,
> watermark 0. The remaining 42 (mostly orphaned modules recommended for removal,
> plus settings-toggle->consumer wiring) are deferred to follow-up passes — NOT
> faked or bulk-deleted blind, since several "remove" calls need a second look.
>
> **CHECKPOINT (2026-06-24) — Silent learning system wired end-to-end (v6.0.4
> "every page teaches the system").** The `store/learningStore` accumulator
> existed but was orphaned: nothing called `trackAppOpen`/`trackPageVisit` and
> the rankings were never consumed. Now it learns from real usage and drives the
> launcher. New pure, unit-tested ranking engine `services/suggestionEngine.ts`
> (`rankAppSuggestions`) combines four signals — open **frequency** (log-scaled),
> **recency** (7-day exponential decay), **time-of-day** affinity (per-app 24-slot
> hour histogram), and app->app **pairing** (transition counts from the current
> app) — 8 unit tests. The learning store gained `hourly` + `pairs` fields (persist
> v1->v2 migration), a `trackAppOpen` collector, and a `getAppSuggestions`
> selector. `services/learningWiring.ts` (`initLearningWiring`, booted from
> App.tsx) feeds it from the running-apps store's `currentAppId` transitions
> (direct store subscription, not the throttled ContextBus, so no switch is
> dropped). `components/FloatingLauncher.tsx` now shows a learned **"Suggested
> apps"** row (was recency-only "Recent apps"), falling back to raw recency on
> cold start. Verified live: zero boot console errors, all four signals populate
> on real app switches, persist v2 confirmed. tsc 0, watermark 0, 8/8 tests green.


> **CHECKPOINT (2026-06-23) — Window-management backlog (section 01) CLEARED:
> persistent custom snap zones shipped.** The last open item from
> `docs/DEX_FEATURE_BACKLOG.md` is done end-to-end. A pure FancyZones model
> (`shared/shell/customZones.ts`: grid build, bounds conversion, hit-test,
> coverage, and the `expandAcross` engine — 16 unit tests), a persisted zone
> store (`store/zoneStore.ts`, localStorage + capability:storage mirror like the
> dock store), and a visual editor (`components/ZoneEditor.tsx` — grid templates,
> free-form draw/move/resize, named save, active-layout picker; opens on
> `Ctrl+Alt+Z` or the "Edit Snap Zones" palette command). Wired into AppManager:
> drag-to-zone snapping takes priority on drop when a layout is active;
> **expand-across-zones** (`Ctrl+Alt+Shift+Arrow`) and **cycle-within-zone**
> (`Ctrl+Alt+[` / `]`) build on the persisted state; plus "Tile: Into Active
> Zones". This closes the FancyZones zone editor + the two remaining keyboard
> snap bindings the backlog flagged. tsc 0, 31 WM unit tests green, renderer
> build green.
>
> **SAME DAY — security (03) + AI (04) policy layers SHIPPED (whole implementable
> backlog now cleared).** Built the host-agnostic DEX policy for every remaining
> P1/P2 implementation row (kernel enforcement stays native-driver work):
> `shared/runtime/networkPolicy.ts` (Windows AppContainer network-class gating,
> loopback-deny-by-default), `shared/runtime/linuxSandbox.ts` (bubblewrap argv
> from caps, maximal-isolation default), `shared/runtime/brokeredIpc.ts`
> (capability-scoped IPC, no app→app loopback), and
> `shared/runtime/sandboxProfile.ts` composing them into one `buildSandboxProfile`.
> Plus `shared/uki/deviceRuntime.ts` (CPU/GPU/NPU tier selection + local-model
> gating) wired LIVE into `smartRouter.preferOnDeviceFirst` + `connect.ts`. 38 new
> unit tests (24 sandbox + 14 device), back-compat preserved, tsc 0, build green.
> What's left is genuinely NOT headless-buildable: native execution
> (WFP/AppContainer SIDs, real `bwrap` spawn, DirectML/CoreML/NPU EPs), the
> commodity-silicon SLM benchmark, and the 05-10 deep-research pass (which ADDS
> scope rather than clearing it).
>
> **CHECKPOINT (2026-06-19) — Tauri migration rounds 1-3 DONE (data + heavy channels); final usage gap-check + flip to Tauri next.**
> This block is the single consolidated current plan (older per-slice goals folded in;
> full detail in docs/TAURI-MIGRATION.md).
>
> **DONE & committed.** Calendar redesigned to the icon-grid (Mon-first pill headers,
> true-black rounded tiles, per-event DexIcon glyphs + notification dots, bold today).
> Tauri migration rounds 1-3 complete: **232 namespaces natively backed** via `dex_ipc`
> — analytics, power, mode, projects, dev-platform (git/env/ssh/fs/watch), ~140 data/CRUD
> subsystems (round 1+2), and round 3's HEAVY channels (timers/process-exec/Tauri-events/
> HTTP/file-IO) across 122 modules, each its own `src-tauri/src/<name>.rs`. `cargo check`
> 0 errors, `tsc` GREEN. **UPDATE 2026-06-22:** the previously-"genuinely-impossible"
> trio is now addressed (see TAURI-MIGRATION.md): LLM streaming works via renderer
> fetch in WebView2 (fixed CSP openrouter.ai + Anthropic browser-access header);
> live OS windows are REAL Tauri WebviewWindows (multi_window.rs + detached-boot
> renderer mode); IoT device discovery/pairing is already native (only vendor-driver
> fan/GPU-voltage control honestly degrades). Sandboxed JS (workflow:runScript) now
> runs in the renderer's DexScript interpreter. The catalogued degrade list is EMPTY.
>
> **NEXT MIGRATION — final gap-check + flip.** The buildable channels — heavy
> (timers/exec/events/HTTP/file-IO) AND the once-"impossible" trio — are done.
> STRATEGY: run `npm run dev:tauri`, exercise DEX,
> read the auto-saved degrade report (`dex-kv.json` -> `__dex_degrade`, or
> `__dexDegradeReport()` in the app-window console); the remaining list should be small
> -> build or accept each, then flip the default shell to Tauri and retire Electron.
>
> **Deferred (small, degrade to null): DONE 2026-06-22** — rewind:getDaySummary
> (rewind.rs summarize_day), files:organizeByType (main.rs files_organize_by_type),
> auth:setup:* (new auth.rs, salted SHA-256 in dex-kv.json + Windows Hello). cargo
> check 0, cargo test 38/38, tsc 0. **Parked:** Calendar 15/16 icon-render edge case.
>
> **HARD RULES (from the round-2 git-checkout incident that wiped uncommitted wiring):**
> COMMIT before any multi-agent workflow; workflow agents write ONLY their own new module
> file and must NEVER `git checkout` or edit shared files (main.rs / capabilities.ts) —
> the orchestrator wires centrally.

> **v6 program (started 2026-06-18, in progress).** Full-system audit + refinement;
> plan in `.claude/plans/i-need-a-prompt-stateless-harp.md`. **Phase 0 DONE + VERIFIED**
> (renderer+main `tsc` 0, launcher test 6/6, renderer build green):
> FloatingLauncher jump/jitter/recompute fixed -- one symmetric clamp helper +
> rAF-coalesced drag + memoized geometry/style; clamp extracted to
> `components/floatingLauncherGeometry.ts` with a unit test
> (`tests/unit/floating-launcher-geometry.test.ts`). Theme-aware crash-fallback HTML
> with a CSP-safe reload link + restore hint (`main.ts`). Unresponsive-renderer
> recovery -- grace timer -> native Reload/Wait dialog (`main.ts` + `SessionHardening`).
> WindowManifest switched from starve-prone trailing debounce to a throttle
> (leading-edge + guaranteed write per interval; force-kill now loses <=1s).
> Notes toolbar labels -> DexIcon glyphs; Task Manager low-signal metrics
> (uptime/network/disk) demoted to Advanced. **P3 per-app conformance sweep DONE**
> (parallel 8-point audit over the whole roster -- matrix: ~37/45 apps PASS; nearly
> every flag was a FALSE POSITIVE -- `var(--x, #fallback)` fallbacks, categorical
> data palettes (Calendar/NoiseGenerator/ColorPicker/PixelArt), intentional bespoke
> brand colors (Prism pink, CollabHub gradients), and the MapLibre marker literal
> (a CSS var can't resolve in an SVG fill). The one genuine chrome fix -- TaskManager
> `toneFor` hex -> `var(--color-error|warning|success)` -- landed; verified tsc 0).
> P2.3 STARTED: a pure `isOnScreen` frustum-cull helper added to Nexus, applied to
> the star + particle fields (safe -- they already had depth/alpha `continue`
> guards); verified tsc 0 + build green. **Track G -- first creative feature DONE:
> AXL accurate mass properties** (`axl/axlMassProperties.ts`): exact mesh
> volume/area/centroid (divergence theorem) + closed-form primitives (box/cylinder/
> sphere/cone/torus/tube/wedge), replacing the old bbox/`vol^(2/3)*6` approximations.
> Wired into two real consumers -- the user-facing "mass properties" analysis
> breakdown (now reports accurate surface area) and the thermal sim's deltaT -- not
> orphaned. Verified: 10/10 unit tests (`tests/unit/axl-mass-properties.test.ts`),
> tsc 0, build green. **Track G batch 2 -- 3 more confirmed-genuine gaps DONE**
> (agents verified each was actually absent first): UnitConverter Energy category
> (J/kJ/cal/kcal/Wh/kWh); Kanban WIP-limit enforcement (the `limit` field existed
> but was never checked -- now blocks over-limit adds + toast); ColorPicker WCAG
> contrast readout (AA/AAA vs white/black; pure `contrastRatio` + 4 unit tests).
> Verified: tsc 0, 20/20 unit tests, build green. CONFIRMED-REMAINING queue
> (agent-verified absent, pure-core+wire, buildable without an app run): Forge
> output-file-size estimator, WorldClock timezone-diff, MarkdownEditor TOC, Pomodoro
> stats persistence, Flux LAB color interpolation, Vinx drop-frame timecode +
> sidechain envelope + loudness-target gain. CONFIRMED AGAIN: most "creative
> flagship" features ALREADY EXIST (Imosion LUFS/true-peak/RMS + multiband + limiter;
> Vinx masks/multicam/color), so the real gaps are narrow + scattered -- "1000
> features" is mostly already-built, not a backlog of that size.
> **Track G batch 3 DONE:** Flux hex-color keyframe interpolation (the engine
> STEPPED colors before -- now a linear-light tween; `lerpHexColor` + 4 tests) and
> Forge output-file-size estimator (bitrate*duration*overhead; shown in each job
> row; + 3 tests). Verified tsc 0, build green. **Track G batch 4 DONE:** WorldClock
> per-clock "+Nh vs here" timezone diff (DST-correct); Pomodoro today-scoped stats
> persistence (sessions + focus-minutes survive reload, roll over at midnight) +
> "min focused today" readout; MarkdownEditor document Outline (TOC) that parses
> ATX headings and jumps the editor caret. Verified tsc 0, build green.
> **Track G batch 5 DONE (final named queue):** Vinx SMPTE drop-frame timecode
> (`shared/format/timecode.ts` + wired into `VinxTimeline.frameToTimecode`/
> `timecodeToFrame` for 29.97/59.94 -- non-drop drifts ~3.6s/hr) and true-peak-safe
> loudness-target gain (`shared/audio/dsp.ts` `loudnessTargetGain`, wired into
> `VinxAudio.normalizeToLUFS` so normalization can't clip). Sidechain envelope
> SKIPPED -- `envelopeFollower` already provides it (no duplication).
> **NAMED TRACK-G QUEUE COMPLETE: 11 features shipped, 36 v6 unit tests across 7
> files all green, build green.** **Track G batch 6 DONE:** Canvas shape tools
> (line/rectangle/circle with live drag-preview, alongside pen/eraser/highlighter)
> and PixelArt sprite-sheet export (all frames in one PNG via native canvas --
> replaced the disabled "Export GIF"; a hand-rolled GIF-LZW encoder was rejected as
> unverifiable headlessly / corrupt-risk). 13 Track-G features total, tsc 0, build
> green. A gap-hunt this round also caught + REVERTED a would-be duplicate (a median
> filter -- `shared/creative/denoise.medianDenoise` already exists + is wired):
> proof the platform is mature and further hunts are false-positive-heavy.
> **Track G batch 7 DONE:** PasswordGenerator entropy-bits readout (pure
> `passwordEntropyBits` length*log2(pool) + 4 tests, shown by the strength bar) and
> Timer persisted user presets (save/reuse custom durations across sessions,
> right-click to remove). A utility-app hunt this round eliminated most candidates
> as already-built (Stopwatch lap stats, brown noise, Calendar ICS). 15 Track-G
> features total; 40 v6 unit tests; tsc 0; build green. QR error-correction-level
> selection was DEFERRED (a wrong QR is unscannable -- same unverifiable-codec risk
> as the rejected GIF encoder).
> **Track G batch 8 DONE:** Files natural-name sort (wired the existing
> `shared/format/naturalSort.naturalCompare` into Files.tsx -- "file2" before
> "file10"; was lexical `localeCompare`) and DexCode jump-to-matching-bracket
> (Ctrl/Cmd+M) via a new pure `shared/format/bracketMatcher` (+ 5 tests). A
> dev/system hunt confirmed-eliminated Terminal tab-completion + Ctrl+R history +
> Rewind session-grouping + fuzzy-search as already-built. 17 Track-G features
> total; 45 v6 unit tests across 9 files; tsc 0; build green.
> **Track G batch 9 DONE (standalone-app sweep):** DexCode live selection stats
> (Sel N ch / N ln in the status bar, via onSelect); Stopwatch lap statistics
> footer (avg / median / spread) on a new pure `shared/format/lapStats`;
> Calendar same-day double-booking detection -- a "Conflict" tag in the day list
> + a warning outline on overlapping week-view events, via a new pure
> `shared/calendar/eventConflicts`; Weather built-in advisories banner (heat/cold/
> wind/storm/UV/visibility) via a new pure `shared/weather/alerts`; RecycleBin
> multi-select with bulk Restore/Delete + select-all-visible (selection auto-prunes
> to the filtered set so bulk acts only on visible items). 22 Track-G features
> total; 61 v6 unit tests across 12 files (lap-stats 6, event-conflicts 5,
> weather-alerts 5); tsc 0.
> **Track G batch 10 DONE (productivity/utility sweep):** QR Code scalable SVG
> export (print-quality, spec-correct quiet zone) via a new pure
> `shared/format/qrSvg`; Workflows structural validation -- cycle / dangling-edge /
> orphan detection surfaced as an advisory chip in the editor -- via a new pure
> `shared/workflow/validate` (the existing topo-sort silently mis-ordered cyclic
> graphs); Markdown editor lightweight lint (heading-skip, empty link/image URL,
> empty link text, unbalanced code fence) shown as a status-bar issue count via a
> new pure `shared/format/markdownLint`. NOTE: Calculator's `2+3*4=20` is correct
> immediate-execution (Casio / macOS-basic) semantics, NOT a bug -- left as-is
> (rewriting to algebraic precedence would be an invasive UX change). 25 Track-G
> features total; 77 v6 unit tests across 15 files (qr-svg 4, workflow-validate 6,
> markdown-lint 6); tsc 0, renderer build green.
> **Track G batch 11 DONE:** UnitConverter "find a unit" search -- type "km",
> "pounds", "MB", "kWh" to jump straight to the right category + unit -- via a new
> pure `shared/format/unitSearch` (alias table + exact-symbol/label/prefix/
> substring fallback). 26 Track-G features total; 82 v6 unit tests across 16 files
> (unit-search 5); tsc 0. Flux was inspected for the "bezier curve editor"
> flagship: its Newton-Raphson cubic-bezier easing solver is already correct and
> complete (the "would need proper implementation" comment is stale) -- left as-is.
> P4 a11y was checked: icon-only buttons across the renderer already carry
> aria-label/title (grep found zero offenders) -- already mature, not churned.
> HONEST STATE: the headless-verifiable feature seam is now largely mined out; the
> remaining named v6 work (P1 startup/render perf, P2 Nexus culling + Spotlight
> incremental index + Prism layer virtualization) is all MEASURE-FIRST and needs
> the Electron app run with synthetic large data on the owner's machine -- not
> verifiable in this headless session.
> **Track G batch 12 DONE:** Learn "When You Work" insight -- synthesizes the
> existing hourly + day-of-week heatmaps into a one-line peak summary ("Most
> active 9:00-12:00", "Busiest day Wed") via a new pure
> `shared/format/activityInsights` (sliding-window peak + argmax). 27 Track-G
> features total; 89 v6 unit tests across 17 files (activity-insights 7); tsc 0,
> renderer build green. A final-group survey (NoiseGenerator / PresentationBuilder
> / Nexus / Achievements / Learn / Prism / Imosion) returned mostly "NONE -- already
> mature"; the few remaining candidates are moderate-wiring creative features with
> verification risk and were deliberately NOT force-shipped: Prism chromatic-
> aberration correction (pure image math, heavy filter-pipeline wiring), Imosion
> integrated/short-term LUFS metering (BS.1770 K-weighting -- hard to verify exactly
> headlessly; correlation/RMS would be exact but the live-meter wiring is heavy),
> Nexus graph centrality (would re-drive node sizing -- visual-layout risk). These
> are the honest next candidates IF the owner wants them with explicit caveats.
> **Track G batch 13 DONE (owner chose "caveated creative features"):** pure math
> written + exactly unit-tested, deep wiring tsc/build-verified but NOT
> runtime-verified headlessly (owner accepted that caveat).
> (1) PRISM lens correction -- the "Chromatic Ab." slider was a no-op: it only added
> a higher-order RADIAL geometric term applied identically to all 3 channels, so it
> produced zero color separation. Fixed with a new pure `shared/creative/lensCorrect`
> (genuine transverse CA: red/blue sampled at different radii than green) + distortion
> + vignette in one pass; rewired Prism's Apply handler to use it. (2) IMOSION metering
> -- added `computeSignalLevels` (peak/RMS/crest) to `shared/audio/dsp`, replaced the
> recorder meter's duplicated inline peak/rms math with it, and added a live crest-
> factor (CF) readout next to the level meter. (Full stereo-correlation / true BS.1770
> LUFS deferred: needs L/R analyser splits + K-weighting -- heavy + hard to verify
> exactly headlessly.) (3) NEXUS knowledge graph -- new pure `shared/graph/centrality`
> (normalized degree centrality); hub nodes now render larger (radius += centrality)
> instead of sizing by file size alone. 30 Track-G features total; 103 v6 unit tests
> across 20 files (lens-correct 4, signal-levels 5, graph-centrality 5); tsc 0
> (renderer + main), renderer build green.
> **P3 CONFORMANCE SWEEP DONE (every app, nothing skipped):** ran the 8-point
> checklist across all ~50 surfaces (utilities, creative suite, shell/pages) via
> 3 parallel audits; full matrix written to `docs/V6-CONFORMANCE.md` (retired 2026-11-01; open items moved to `DEX_REMAINING_WORK.md`). Codebase is
> mature -> nearly all PASS. GENUINE fails fixed: PomodoroTimer stray `longBreak`
> color -> token; Imosion level-meter gradient + 6x muted menu/transport text ->
> semantic tokens; Kanban CardDetail modal got an Escape-to-close handler. FALSE
> POSITIVES deliberately NOT churned (documented with reasons): categorical data
> palettes (ColorPicker/Canvas/NoiseGenerator/Nexus/Calendar/Kanban) are correct
> hex, `var(--token,#hex)` fallbacks are defensive (tokens exist), console.error
> on failure paths is acceptable diagnostics. tsc 0 (renderer + main), build green.
> **P2 SCALE -- VERIFY-ONLY outcome (measure-first mandate honored):** Nexus
> ALREADY frustum-culls its hot draw loops (`isOnScreen` at Nexus.tsx:1417/1467);
> extending cull to connection line-segments is NOT correctness-safe blind
> (endpoint-only culling can drop a segment that crosses the viewport) and 1M nodes
> needs WebGL (out of scope) -> the cheap win is in place, rest is measure-gated.
> Spotlight's 60s full index rebuild is fine for DEX's real <10K corpus; incremental
> indexing is a large architectural change that the plan gates to a measured 100K
> corpus on the owner's machine. Files uses load-more pagination (not a true
> virtualizer) -- swap is measure-gated. NONE changed blind. REMAINING v6 = P1
> startup + the above P2 items, ALL measure-first and requiring the Electron app run
> with synthetic large data on the owner's machine; plus env-blocked release signing.
> **P1/P4 FINALIZATION DONE -> v6 = 6.0.0:** (P1.1) startup INSTRUMENTATION was
> already fully wired (`StartupTimeline` marks process:entry -> app:ready ->
> IPC:setup -> window:create -> renderer:first-heartbeat, logs a sorted summary on
> complete(), exposes a `startup:timeline` IPC snapshot) -- so cold-start numbers
> are captured automatically on the owner's next run; dynamic-import deferrals stay
> correctly gated on those numbers. (P1.2 + P2 budget guards) NEW
> `tests/unit/v6-performance-guards.test.ts` -- hard regression budgets over the
> REAL shipped pure functions (FloatingLauncher clampToBounds 100k, Nexus
> degreeCentrality 10k/30k, Prism applyLensCorrection 160x160, Calendar
> findEventConflicts 5k) + a synthetic Spotlight-scale 100k filter (the plan's
> prescribed index budget guard); all pass. (P4) version 5.7.0 -> 6.0.0
> (package.json + PLATFORM_VERSION); SHORTCUTS.md gained a per-app shortcuts section
> (DexCode Ctrl/Cmd+M, universal Escape); release/update config verified coherent
> (electron-builder + electron-updater + release.js -- real sign/publish env-blocked,
> needs owner certs); security sanity of the diff = minimal surface (pure fns + UI,
> no new IPC/eval/network/injection; qrMatrixToSVG only takes #rrggbb from color
> input). 124 unit tests across 23 files (incl. existing budget + animationBudgetK3
> suites); tsc 0 (renderer + main); renderer build green.
> **P2 ALGORITHMIC SCALE -- NOW MEASURED (real numbers, not hypothesis):** the v6
> perf guards now LOG their measured medians. On this machine: Spotlight
> filter+score over 100k items = 9.50ms; Nexus degree centrality 10k nodes/30k
> edges = 1.23ms; Prism lens correction 160x160 = 2.56ms; Calendar conflict scan
> 5k events = 2.09ms; FloatingLauncher clamp x100k = 5.48ms. CONCLUSION: the
> renderer-side ALGORITHMS are fast at scale, so the hypothesized P2 optimizations
> (Spotlight incremental index, additional Nexus culling) are NOT warranted -- the
> measurement disproves the need. The only scale costs NOT captured by a pure-fn
> benchmark are React reconciliation of un-windowed lists (Files) and Canvas2D
> paint FPS (Nexus) -- those need the real render/paint loop with large data in the
> running Electron app, and would be regressive to rewrite blind.
> **CRITICAL: PACKAGED-APP BLANK-SCREEN FIXED (found via live packaging + CDP).**
> Packaging v6.0.0 and remote-debugging the running renderer revealed the packaged
> build was shipping a BLANK WHITE SCREEN -- the renderer crashed at load (root had
> 0 children). Two stacked production-only chunk-ordering crashes, invisible in the
> dev server / web preview (which serve unbundled ESM):
>   1. `TypeError: Cannot read properties of undefined (reading 'useState')` from
>      zustand-vendor -- zustand was split into its own chunk that evaluated before
>      React's exports initialized. FIX: fold zustand into react-vendor
>      (vite.config.ts manualChunks).
>   2. `TypeError: ...reading 'memo'` from app-axl (exposed after #1) -- Rollup's
>      shared CJS-interop helper (commonjsHelpers, a VIRTUAL module) was absorbed
>      into the maps chunk, so react-vendor imported it back -> react-vendor ->
>      app-chunk cycle -> eager app chunks (axl/maps) evaluated React.memo before
>      React loaded. FIX: pin `commonjsHelpers` to react-vendor so it is a
>      self-contained leaf (kills the circular-chunk warnings too).
> VERIFIED via CDP on the repackaged app: root=1 child, body text 547 chars (Home
> UI: "RECENT PROJECTS / RECENT NOTES"), ZERO exceptions; all 3 launcher orbs
> render. The packaged DEX desktop app now actually loads instead of a white screen.
> **REAL STARTUP NUMBERS (now that the renderer loads):** StartupTimeline logged
> `total=9428ms` (window:create 727ms, IPC:setup 51ms, marks 0ms). ~0.78s is named
> main-process phases; the other ~8.6s is the RENDERER bundle load -- dominated by
> the eager modulepreload of heavy app chunks (axl 520KB, maps 1MB, imosion 429KB,
> flux, notes, rewind, forge). CONCRETE P1 TARGET, data-backed: make those heavy
> apps truly lazy (they should only load when opened) to cut startup from ~9.4s.
> (Minor non-fatal: a `theme-schedule:getInfo` IPC handler is unregistered; the
> ScreenGuard "blank screen" warning fires transiently pre-mount but root renders.)
> **PACKAGED-APP BUG HUNT (via CDP remote-debugging the running build).** Swept all
> 43 apps by driving launchApp over CDP: ZERO crash-on-open, ZERO network/resource
> failures (the app is solid post blank-screen fix). Found + FIXED two real issues,
> verified live in the repackaged app:
>   1. `theme-schedule:getInfo` "No handler registered" -- a startup RACE: the
>      renderer's FeatureStore calls it during early boot, but ThemeScheduleManager
>      registered its IPC handlers deep in the BATCHED feature-suite init (after the
>      call). FIX: register the theme-schedule:* handlers in the manager CONSTRUCTOR
>      (module-import = very early), with an ipcRegistered guard; initialize() no
>      longer re-registers. CDP re-verify: invoke now returns OK {schedule:{...}},
>      IPC_FAILURES=[].
>   2. Dead security `<meta>` tags -- `X-Frame-Options` and CSP `frame-ancestors` are
>      ignored when delivered via <meta> (HTTP-header-only), logging console errors
>      every launch; no-ops for a file:// desktop app. FIX: removed from
>      src/renderer/index.html (comment left on where to set them as real HTTP
>      headers if needed). CDP re-verify: CSP/FRAME_ERRORS=[].
> NOT changed by design: ScreenGuard's transient pre-mount "blank screen" warning
> (it is the detector that CAUGHT the real blank screen -- do not weaken); the
> ReleaseManager update-check error (env/config -- no latest.yml in the configured
> GitHub update repo; could be error->info later). tsc 0 (main + renderer), packaged
> + CDP-verified (root renders, zero exceptions).
> **VISUAL BUG TOUR (CDP screenshots of the packaged app -- DEX is not a Start-menu
> app so computer-use can't grab it; drove it via Page.captureScreenshot + launchApp
> over the debug port instead).** Home / Settings / Prism / Nexus all render
> correctly (verified by screenshot) -- no visual bugs; the FloatingLauncher orbs
> render as clean circles. FOUND + FIXED a real one: **DEX Maps was completely
> broken** in the package -- showed "Maps unavailable / map engine could not start".
> Root cause: the CSP `child-src https: http:` (worker-src falls back to it)
> blocked MapLibre GL's `blob:` Web Worker ("Refused to create a worker from
> 'blob:...'"). And the CSP `connect-src` whitelisted only the AI APIs -- NOT the
> map/weather data hosts, so even with the worker fixed, tiles + Weather forecast +
> UKI answer-engine fetches would be blocked. FIX (src/renderer/index.html CSP):
> added `worker-src 'self' blob:`; added `https://tiles.openfreemap.org` to img-src
> + connect-src; added `https://api.open-meteo.com` (Weather forecast),
> `https://geocoding-api.open-meteo.com` (Maps + Weather geocoding),
> `https://api-inference.huggingface.co` / `https://api.duckduckgo.com` /
> `https://en.wikipedia.org` (UKI answer engine) to connect-src. These features
> were silently CSP-broken in every packaged build. VERIFIED after repackage:
> Maps now renders a full interactive vector map (SF/Oakland Bay Area -- streets,
> districts, freeways, labels), MapLibre canvas mounted, "Maps unavailable" gone,
> CSP_BLOCKS=[]. tsc 0, packaged + CDP-verified.
> **P1 STARTUP -- LAZY-APP CHUNKING DONE + VERIFIED (wall-clock measurement blocked).**
> The packaged index.html was eagerly `modulepreload`-ing 11 HEAVY app chunks (axl
> 520KB, imosion 429KB, flux, forge, rewind, nexus, dexcode, uki, notes) even though
> AppManager lazy-imports them. Root cause: shared renderer infra (stores/services/
> components/UKI engine + the shared NotesDocumentModel) was scattered by Rollup INTO
> app chunks, so the entry statically imported those app chunks for the shared
> symbols. FIX (vite.config.ts manualChunks): a `dex-app-core` chunk consolidating
> renderer infra (store|services|components|hooks|contexts|providers|ui|uki|styles|
> utils) + pinning NotesDocumentModel. RESULT (build-verified): ZERO circular-chunk
> warnings, ZERO app chunks eagerly preloaded -- modulepreload is now only
> react-vendor + dex-shared + dex-app-core. Repackaged + CDP-verified: renders clean
> (root=1, zero exceptions, no new chunk crash). This is a real architectural/memory
> win (heavy apps load on-demand). CAVEAT: the wall-clock startup number is NOT
> reliably measurable headlessly -- StartupTimeline.complete() fires on the
> renderer's rAF HEARTBEAT, which Chromium THROTTLES while the launched window is
> minimized/occluded (also triggers false watchdog "renderer frozen" events). So the
> 9093ms vs 9428ms delta is within throttle noise, NOT a trustworthy figure. window:
> create+IPC:setup are only ~660ms; the rest is renderer mount + main-process init.
> TRUE before/after needs a FOREGROUND launch on the owner's machine (read
> `[StartupTimeline] total=` from %APPDATA%/dex/logs/dex.log). Next safe lever:
> defer/parallelize main-process init (controllers + feature-suite batches).
> **OWNER UI FIXES (live-driven via CDP, all verified in the packaged app):**
>   (1) FloatingLauncher ORB SCATTER (the big one) -- the owner's screenshot showed
>   the 3 orbs split across opposite corners and "can't move all 3 / glitches." Root
>   cause: the drag clamped the cluster ANCHOR as a single orb (but the stack is 3
>   orbs/~152px tall) AND flipped stack direction mid-drag when the anchor crossed a
>   threshold (or the viewport changed on maximize) -> orbs snapped across the anchor
>   / off-screen. FIX: new pure `clampClusterToBounds` reserves room for the WHOLE
>   stack so it always stays on-screen, and the geometry now ALWAYS stacks upward
>   (removed the flip) -> the 3 orbs move as one rigid unit. CDP-verified: dragging
>   the launcher -400/-300 moved all 3 by the same delta, still sameX + 53px gaps,
>   {together:true}. 11/11 geometry unit tests (5 new cluster tests).
>   (2) Notification-center BELL removed from the top bar (owner request) -- verified
>   gone (bell present? false). The update/30-day badge was KEPT (owner kept it).
>   (3) Orb HOVER glitch -- it was just too subtle (bg-elevated->bg-hover ~4 levels,
>   read as no-response); now bg + border + icon brighten together (crisp, still the
>   app-menu fill language, no glow/scale).
>   (4) All 3 orbs OPEN correctly -- CDP-verified: launcher->app menu, UKI->panel,
>   search->search input. tsc 0, packaged + CDP-verified.
> **v6 STATUS = COMPLETE for everything verifiable headlessly.** The ONLY remaining
> work is inherently measure-first and needs the Electron app run on the owner's
> machine: read the auto-logged StartupTimeline numbers, then (only if a phase
> >10%) land dynamic-import deferrals; benchmark Files/Spotlight/Nexus at real scale
> and apply virtualizer/incremental-index/WebGL ONLY if measured slow; and run the
> real signed release. None can be honestly done or verified in a headless session.
> **FLOATING LAUNCHER REDESIGN + SYSTEM HOVER CLEANUP (6.0.x UI polish):** rebuilt
> the 3-orb FloatingLauncher to clean solid chrome -- removed the washed-out white
> group "plate", the white-tint orb borders, the drag glow ring, and the accent-blue
> icon highlight. Orbs are solid `--color-bg-elevated` + subtle `--color-border-
> subtle`; hover now uses the SAME language as the app-menu button -- a subtle
> `--color-bg-hover` fill (no glow/scale/ring), icon brightens secondary->primary.
> SYSTEM-WIDE: fixed the pervasive offender in globals.css "Item 48" -- a blue glow
> (`box-shadow: 0 0 6px rgba(74,158,255,0.1)`) was applied to EVERY button in every
> app on hover; replaced with the consistent `background-color: var(--color-bg-hover)`
> fill (inline-styled buttons keep their look; bare buttons get the one standard
> tint). Verified LIVE in the Vite preview (stylesheet inspection: old glow gone, new
> bg-hover rule present, all 3 orbs render solid) + renderer build green. Other
> "highlights" triaged as legitimate, NOT churned: subtle surface fills, focus-visible
> rings, the .widget card outline, the transient snap-zone drag preview.
> **POP-UI PASS + ORB GLITCH FIX (follow-up):** (orb glitch) the redesign left three
> circular orbs stacked GAP=7px apart each carrying an 18px-blur popover shadow ->
> the shadows bled into a muddy dark blob between them; replaced with a tight
> contained shadow (`0 2px 8px` rest / `0 10px 26px` drag) so stacked orbs stay
> crisp. Verified live: all 3 orbs render solid `rgb(26,26,30)`, correct stacked
> positions, no overlap. (pop-ui) The UKI overlay panel was a washed-out translucent
> GLASS surface (`background: var(--color-bg-hover)` + `backdrop-filter: blur-xl
> saturate(180%)` + a `--pg-gloss-top` sheen + a glowing state dot) -- inconsistent
> with the SOLID app-menu panel and exactly the washed look + gloss the owner
> dislikes. Rebuilt it solid (`--color-bg-elevated`, no backdrop blur, no gloss,
> dot glow removed) to match the app menu. Verified live: panel bg now solid
> rgb(26,26,30), `backdrop-filter: none`, opens from the orb. Also aligned the
> launchpad context-menu item hover to the canonical `--color-bg-hover` fill. tsc 0,
> build green. (The repeated FloatingLauncher errors in the preview console are stale
> -- frozen single HMR timestamp; DOM proves the live component renders fine.)
> REMAINING: P1 perf (measure-first), P2
> scale -- node/wire/label frustum-culling + Spotlight incremental index + Prism
> 400+-layer virtualization (all MEASURE-FIRST: real FPS/index gains need the
> Electron app run with synthetic large data, not verifiable headlessly), P4
> cross-cutting, Track G (~1000 additive features, multi-session). DEFERRED: full
> WindowManifest cross-process disk mirror (needs a preload IPC channel).
>
> This is the one forward-looking plan. Completed goal/handoff/sprint/audit
> writeups were removed (2026-06-09 cleanup); their work is done and lives in
> git history. Anything still pending is captured here. The detailed, actively
> maintained migration checkpoint is [TAURI-MIGRATION.md](TAURI-MIGRATION.md) —
> start there to resume engineering work.
>
> **Release theme (2026-06-10): Refinement & Consolidation.** No major feature
> expansion — performance, consistency, reliability, clarity, fluidity,
> stability, discoverability, maintainability. The Tauri migration below is its
> Priority 1 engine.
>
> **DEX 5.5 system-refinement brief (owner, 2026-06-13).** Much of its visual /
> security / native-foundation scope already shipped (full-flat UI, Dex-font,
> per-app sweep, security+leak audit, native search/AI-routing/rewind/notification
> crates) and the helper-consolidation pass is complete. Remaining user-visible
> value is sequenced in this roadmap, led by a unified search UI.
>
> **v5.5 "DEX Sharp" UI program (started 2026-06-12).** Owner direction: a
> unique, mature, precise external identity — not a macOS/Windows clone. Sharp
> type (tight heading tracking, spaced uppercase micro-labels), discrete radii,
> ONE 28/32/40 control rhythm, hairline borders that stay one device pixel at
> high DPI, functional motion only (150-220ms standard curve, no bounce, no
> decorative effects), responsive-by-construction overlays, light-mode parity.
> Batches 1-7 done and verified (PR #24, feat/dex-dev-platform -> main):
> foundation + shell + entry surfaces; platform-wide app/page sweep (~35
> files); dock redesign + component sweeps + bug fixes; theme-aware
> `tokens.colors` + surface/scrim/accent-dark tokens; (batch 5) de-glassing
> "placed" chrome + Dex-font unification (~24 inline chrome `fontFamily` sites +
> 5 mono CSS rules routed to `--dex-font-ui`/`--font-mono`) + a DEX-wide crash
> recovery screen; and (batch 6) FULL-FLAT glass platform-wide (blur kill switch
> in glassMenu.ts `adaptiveBlur`, opaque glass/blur tokens, and the runtime
> `applyGlassVars` forced solid — verified live: zero backdrop-filters anywhere;
> the modal scrim is intentionally kept) + an onboarding sharpening pass; and
> (batch 7) the per-app conformance sweep across EVERY app (7 parallel workers:
> flat stragglers removed, remaining surfaces solid, fonts on
> `--dex-font-ui`/`--font-mono`, headings thinned, and the Axl macOS-blue ->
> DEX-accent migration completed). Details in
> [TAURI-MIGRATION.md](TAURI-MIGRATION.md) "Renderer slice 2026-06-12/13".
> Remaining (none block shipping): structural flex-centering of ~37
> width-guarded creative modals, AppManager inline-SVG -> DexIcon, an OPEN
> visual call on whether creative/pro-app chrome should move off the Berkeley-
> Mono `--font-family` identity onto `--dex-font-ui`, and the residual security
> hardening backlog flagged by the 2026-06-13 security+leak audit (PtyService
> shell allowlist, production CSP, src-tauri fs path containment, main-window
> sandbox) — the audit itself is DONE: real XSS/SSRF/DoS-panic fixes + 9 memory-
> leak fixes landed and verified (tsc + both cargo checks green). The platform
> is consistent, verified, and operational as-is.
>
> **Loading-experience unification (2026-06-16).** One canonical DEX loading
> surface now exists: `DexLoader` (+ the `DexLoadingMark` primitive) in
> `components/LoadingStates.tsx` — a precision reticle mark + task label + optional
> determinate progress, in inline / panel / screen sizes, FLAT (dropped the
> `LoadingOverlay` backdrop-blur that contradicted the flat identity) and
> reduced-motion aware. The app-launch fallback (`AppWrapper.AppLoading`) now
> routes through it, and the bare `<div>Loading…</div>` / "Loading..." states in
> Rewind, Journal (UnifiedSystems notifications + JournalView), Select and
> Workflows were replaced with it — removing those blank/ad-hoc loading flashes
> the owner brief calls out ("no blank screens"). The two competing
> `CreativeAppSkeleton` impls are now consolidated (2026-06-16): the rich
> per-app-type mockup in `components/CreativeAppSkeleton.tsx` is the single source
> of truth; the thin, unused shadow component in `AppWrapper.tsx` (plus its dead
> loading-style keys orphaned by the `DexLoader` reroute) was removed. Verified:
> full tsc clean + component import suite green.
>
> **Unified Creative Design Language -- Creative Control Kit (2026-06-16).** The
> creative apps had hand-rolled the SAME labeled value-slider row ~190 times and
> segmented "pick-one" strips ~40 times, each drifting per app. New shared,
> accent-aware kit in `components/controls/` (`CreativeSlider`, `SegmentedControl`
> with `outlined`/`subtle` variants) is now the single source of truth. First
> adoptions: Prism (image editor) -- all 12 value sliders + the selection-mode and
> gradient-type segmented controls migrated, dead `slider`/`sliderValue` styles
> removed; and Flux (motion) -- the 5 transform sliders migrated, all four dead
> slider-style keys removed. Each app keeps its accent (`#ff375f` / `#bf5af2`) via
> a thin prop/wrapper. Verified: full tsc clean + `creative-controls` and
> component tests green (21). REMAINING (mechanical rollout, same pattern): the
> rest of Prism/Flux's non-row sliders, plus Vinx, Imosion, Forge, and Axl's
> local control set -> the kit.
>
> **v5.7 milestone -- Creative Completion & Whole-System Patch (started
> 2026-06-18).** Owner brief: finish the cycle as v5.7 -- creative-app completion,
> color discipline, window-frame integrity, UKI/DEX-Now intelligence, a new DEX
> Maps app, and a no-app-left-out sweep. Plan in
> `.claude/plans/i-need-a-prompt-stateless-harp.md`. SHIPPED: version BUMPED to
> 5.7.0 (package.json + PLATFORM_VERSION/BUILD_DATE in store/runningApps.ts, dated
> 2026-06-18) once the substantive gate cleared -- see close-out at the end of this
> block. The "3000" framing was always directional, not a literal patch count.
> DONE + VERIFIED (tsc --noEmit 0 errors + `npm run build:renderer` green +
> 38/38 provider tests):
> - **Window-frame integrity (A1).** Root cause found: heavy apps render
>   `position:fixed; inset:0` overlays at `z-index:var(--z-max)` that the window's
>   `contain:layout style paint` traps INSIDE the window, painting over its own
>   36px title bar -> close/min/max vanish when maximized. Fix (surgical, in the
>   LIVE detached-window path `AppManager.tsx`, NOT the dead `shell/FloatingWindow.tsx`):
>   the app-content wrapper became an isolated stacking context at `z-index:0`
>   (`isolation:isolate`) and the title bar lifted to `z-index:50` -- so no in-app
>   overlay, however high its z, can ever cover the controls. No brittle CSS
>   `!important` cap needed.
> - **Color discipline (A2).** `LAUNCHPAD_APPS` (`AppManager.tsx`) re-declared 45
>   app colors that DRIFTED from the canonical `APP_DEFINITIONS` (`store/runningApps.ts`)
>   -- imosion/unitconverter/qrcode/achievements/worldclock/dexcode showed one
>   color in the dock/title bar and another in Launchpad. Launchpad now DERIVES
>   color from `APP_DEFINITIONS` (single source; tiny override map for launcher-only
>   `uki`); the bare `'#8E8E93'` app-color fallbacks were tokenized to
>   `var(--color-text-tertiary)`; added `--color-app-maps` token.
> - **Shared control primitives (A3).** New `IconButton` + `Pill` in the Creative
>   Control Kit (`components/controls/`), pixel-matching the hand-rolled
>   `toolBtnStyle`/`hoverHandlers` + `borderRadius:9999` pills. Axl's toolbar
>   (`axl/components/Toolbar.tsx`) fully migrated as the reference -- local
>   `toolBtnStyle`/`hoverHandlers` deleted.
> - **Empty/idle states (A4).** Vinx MediaBrowser + CollabHub empty states upgraded
>   to the shared `EmptyState` with real CTAs (removing a hardcoded `#5e5ce6`); Axl
>   "No modifiers" became a clickable hint that opens the add-modifier menu.
> - **DEX Maps -- NEW app (E).** `standalone/Maps.tsx` on MapLibre GL + free,
>   key-less OpenFreeMap vector tiles; Open-Meteo geocoding search (the codebase's
>   existing no-key pattern); custom DEX-token-styled controls (no color noise);
>   light/minimal basemap toggle; UKI-driven via a `dex-maps-goto` window event +
>   a `[data-app-content]` mirror for screen-context. Registered across every
>   surface (lazy import, `AppId`, `APP_COMPONENTS`, window sizes, `HEAVY_APP_IDS`,
>   `Icons`, `DexIcon` `maps` glyph, `LAUNCHPAD_APPS`, `appToCat`, `APP_KEYWORDS`,
>   `APP_DEFINITIONS`). `maplibre-gl` added to deps; lazy-chunked (~287 kB gzip,
>   zero startup cost).
> - **UKI computer-awareness + DEX Now disk (D, partial).** UKI's
>   `liveContext()` (`uki/context.ts`) gained a cached `DeviceInfo` layer
>   (`ensureDeviceInfo()` fetches `os:getSystemInfo` once; `getDeviceInfo()` reads
>   it synchronously), and `Uki.tsx`'s system prompt now carries a `Device:`
>   line -- so uki can answer "what's my CPU / how much RAM / what OS." The Home
>   `SystemStatusWidget` gained a live **Disk** bar (`system:getStorage`, 30s
>   cadence) alongside its existing CPU/Memory/GPU/network. NOTE (accurate
>   findings this pass, to avoid rebuilding): DEX Now's live system widget ALREADY
>   existed and polls `system:getStats` every 5s; DexNotes ALREADY does full-text
>   body search (`n.plain_text` + title + tags, multi-term AND) plus a backend
>   FTS + in-document find-nav -- those "gaps" are closed.
> - **UKI vision -- agentic screen awareness (D, DONE).** UKI can now "look at the
>   screen" and answer with a vision model. Implemented end-to-end: (a) the provider
>   contract gained optional `images?: string[]` on `ChatMessage` + a shared
>   `parseDataUrl` (`uki/providers/types.ts`); (b) multimodal request formatting for
>   the vision providers -- OpenAI `image_url`, Anthropic base64 `image` source,
>   Google `inline_data` (`openai.ts`/`anthropic.ts`/`google.ts`); (c) `connect.ts`
>   plumbs images through `askConfiguredLLM`/`streamConfiguredLLM`, RESTRICTS routing
>   to vision-capable models when images are attached (degrades to null -> text if
>   none configured), and adds `hasVisionProvider()`; (d) `uki/screenCapture.ts`
>   grabs a still via the existing `screencapture:getSources` main handler (no new
>   native surface; thumbnail-res); (e) `Uki.tsx` has a "look at my screen" toggle
>   in the composer, shown ONLY when capture + a vision provider are both available,
>   that attaches a screenshot to the next message and disarms. Degrades cleanly with
>   no key / on the web shell. Verified: tsc 0 errors + all 38 provider tests pass
>   (text-only path byte-identical). NOTE: capture is thumbnail-resolution (the
>   shared handler caps it) -- raising it is a future main-process tweak.
> - **Live Activity feed activated (B/D).** The Home "Live Activity" feed
>   (`utils/liveActivity.ts`, rendered by `pages/Home.tsx`) was ORPHANED -- defined
>   and rendered, but no app ever dispatched to it. Wired Forge (`forge/Forge.tsx`):
>   a centralized, whole-percent-throttled effect mirrors each encode job into the
>   feed (`dispatchActivity`/`updateActivity`/`completeActivity`), so encoding now
>   shows a live progress card on Home. Then extended (parallel agents) to FOUR
>   producers via the same centralized, percent-throttled one-effect pattern:
>   Forge encode (`forge/Forge.tsx`), Vinx export (`vinx/Vinx.tsx`, watching
>   `exportJobs`), Transfers (`pages/Transfers.tsx`, watching `activeTransfers`),
>   and Browser downloads (`pages/Browser.tsx`, watching `downloads`). Collab/Nexus
>   sync was investigated and SKIPPED -- collaboration is local/in-memory with no
>   real sync-progress to surface (declined to fabricate a card).
> - **Reality check (important).** Repeated investigation shows the codebase is far
>   MORE complete than this milestone plan (built from a high-level scan) assumed.
>   Already shipped + working, NOT gaps: Vinx masks (full `ClipMask` model +
>   add/remove store actions + a complete Mask Editor panel with shape/feather/
>   opacity/expansion/invert/list), DexNotes full-text search, the live system
>   widget. The genuinely-remaining work is NARROW + DEEP, not a broad "3000
>   patches" effort: (1) UKI vision needs a provider-contract rework -- `ChatMessage.
>   content` is a plain string with no image parts, so every provider's
>   `buildChatRequest` would need image support (`uki/providers/types.ts`);
>   (2) Notes font controls need new marks in the tree-based `NotesDocumentModel`;
>   (3) the `IconButton`/`Pill` rollout does NOT fit the other creative toolbars:
>   parallel agents migrated AXL cleanly + Imosion's undo/redo (2 clean cases), but
>   Flux/Prism made ZERO changes -- each app's toolbar predates the kit with its own
>   bespoke visual system (round 9999px pills, 11px type, per-app accent like Flux
>   `#bf5af2` / Prism `#ff375f`, dropdown-trigger buttons), so a faithful migration
>   would need per-button `style` overrides and risk visible change. Verdict: NOT
>   cheap consistency work; leave each app's toolbar as-is (AXL is the reference).
> CLOSE-OUT (gate cleared -> bumped to 5.7.0):
> - **C -- DexNotes FONT controls: DONE.** A Word-style default-font picker (family
>   Sans/Serif/Mono/System + size) in the editor toolbar, applied to the editor and
>   persisted across notes via localStorage (`notes/NotesEditor.tsx`). Deliberately
>   editor-level (not per-selection): per-selection fonts would require new marks in
>   the tree-based `NotesDocumentModel` + HTML round-trip parsing -- high-risk on a
>   core app, low marginal value, so out of scope. Notes full-text search already
>   existed.
> - **C -- DexCode REPL: DONE.** A single-line expression REPL at the bottom of the
>   output pane (`standalone/DexCode.tsx`) that evals via the existing
>   `executeDexScript` and appends output. Stateless per entry (the runtime is
>   whole-program/stateless) -- a quick scratchpad, labelled as such.
> - **C -- standalone color sweep: SKIPPED (justified).** The standalone apps already
>   use tokens; their remaining hardcoded colors are intentional (palettes, swatches,
>   syntax themes, Nexus archive-gray). A blind sweep is near-zero-yield + high-risk,
>   so not done. The real color-noise source (the app-color registry) was fixed in A2.
> - **Audit residual closed:** the milestone-completion audit found a missed bare
>   `'#8E8E93'` in `shell/AppSwitcher.tsx` + `shell/SpotlightEngine.ts` -> tokenized
>   to `var(--color-text-tertiary)`; zero bare app-color grays remain.
> - **B (deep creative) + toolbar rollout: NOT done, by design.** The audit confirmed
>   the creative apps are already feature-complete (Vinx masks etc. shipped), and the
>   toolbar rollout doesn't fit the bespoke Flux/Prism systems. These are NOT gaps.
> - **F -- version BUMPED to 5.7.0.** package.json 5.5.0 -> 5.7.0; PLATFORM_VERSION
>   4.4.0 -> 5.7.0 + BUILD_DATE 2026-06-18. Real-time system-info push subscriptions
>   remain an optional future enhancement (pull-based IPC works today).
>
> **Cursor-anchored menu placement -- never off-screen (2026-06-16).** Context
> menus across the shell + creative suite each hand-rolled `Math.min(clientX,
> innerWidth - 200)` -- magic sizes, no edge margin, and most creative apps
> (Flux, Prism, Forge, Axl, Vinx) stored RAW `clientX/clientY` with no clamp at
> all, so a right-click near a screen edge opened partly off-screen. New tested
> util `renderer/utils/menuPosition.ts` (`clampMenuToViewport` + the
> `clampEventToViewport` handler helper) is the single rule; it keeps the whole
> menu inside a margin on both axes and handles menus larger than the viewport.
> Adopted at 13 sites: Home (2), the launchpad context menu (AppManager), Files,
> the shared `components.tsx` context menu, and the creative apps Prism, Flux,
> Forge, Axl, Vinx (timeline + media browser), Imosion (track + clip). Complements
> `useDropdownPosition` (which handles anchored dropdowns). Verified: full tsc
> clean + `menuPosition` unit tests (8) green. (The Apps Menu surface itself was
> already a static, viewport-clamped, scrollable centred panel -- left as-is.)
> FOLLOW-UP (2026-06-16): Home (2) + the launchpad menu still re-clamped at
> RENDER with a second magic `Math.min(..., innerWidth - N)` on top of the
> capture-time clamp -- a redundant double-clamp whose stale `N` could fight the
> util. Removed all three; capture-time `clampEventToViewport` is now the sole
> placement rule everywhere, and the Home desktop menu's size estimate was
> corrected (200x300 -> 220x420) to match its true height so the single clamp is
> accurate. tsc clean.
>
> **Window multitasking -- 60/40 split preset (2026-06-16).** The ratio-split
> engine (`applySplitRatio`, min-width-aware) already shipped with 50/50, 70/30,
> and 60/20/20 presets in the Command Palette, but the owner brief explicitly
> lists 50/50, 60/40, AND 70/30 -- 60/40 was the one missing ratio. Added the
> `split-6040` palette command (`[0.6, 0.4]`). No engine change; it reuses the
> proven, tested split path.
>
> **Single source of truth -- `generateId` consolidation (2026-06-16).** The
> ephemeral `${prefix}-${Date.now()}-${random}` id helper had been copy-pasted as
> ~20 slightly-drifting local definitions (some `substr`, some `slice`, varying
> lengths) across apps, stores, and services -- exactly the "Remove Duplicate
> Systems" target. New canonical `src/shared/util/id.ts` `generateId(prefix?)` is
> now the one source; importable from main + renderer + shared (unlike the old
> renderer-only `utils/index` copy). Re-pointed 16 renderer sites: the renderer
> barrel + the 5 creative-app `*Features.ts` helpers (thin wrappers preserve each
> original default prefix -- `id` / `job` / `vinx` -- so arg-less callers are
> byte-for-byte unchanged), and 10 no-prefix service/store copies (overrideStore,
> missionStore, appSubsystem, CollaborationSystem, LifecycleManager,
> IntegrityMonitor, ErrorBoundary, PerformanceMonitor, SystemServices, VinxAudio).
> DELIBERATELY LEFT: the crypto-based ids (`main/store/DataStore`,
> `main/plugins/PluginEngine`, `main/core/DataImportManager` use `crypto.randomUUID`
> / `randomBytes` -- must stay unpredictable, NOT Math.random), the counter-based
> ARIA-id generator in `utils/accessibility` (different contract), and the
> main-process controller copies (separate compile unit -- a safe follow-up).
> Verified: renderer + main `tsc --noEmit` both clean. ALSO confirmed this pass:
> an app/page/component resource-leak sweep found ZERO unbounded leaks (every
> effect that registers an interval/listener/observer/rAF pairs it with cleanup) --
> nothing to fix there.
>
> **Single source of truth -- full helper consolidation pass (2026-06-16).**
> Extending the `generateId` work above across the rest of the duplicate-helper
> surface ("do 100/100"). Each cluster keeps ONE canonical and preserves every
> caller's exact behavior; genuinely-divergent helpers are consolidated by
> behavior (shared core + thin local adapter), never force-merged. (1) `clamp` /
> `lerp` -> `shared/math/num.ts`: 11 files (numbers.ts/timeline/mixGraph/colorUtils/
> motion3d/improvements500{math,particles,perlinNoise}/utils-barrel/precisionSliders/
> FloatingLauncher); intentional supersets (controlMath swapped-bounds, dsp/
> comfortPrefs non-finite), 1-arg 0..255 byte-clamps, clamp01 and useCallback hooks
> were LEFT. (2) `formatBytes`/`formatSize`/`formatFileSize` -> `shared/format/units.ts`:
> 15 renderer copies -- and this FIXES a latent MB-cap bug (Gallery/Notes/Rewind/
> AutoSave rendered "5000 MB" instead of "4.9 GB"); Files keeps its `'--'` empty-row
> placeholder via a wrapper. (3) `hexToRgb` -> `shared/creative/colorUtils.ts`: 9
> files via LOCAL ADAPTERS that preserve each call-site's return shape (`{r,g,b}` /
> tuple / `number[]`) and fallback (`{0,0,0}` / `[255,0,0]` / null) with zero
> call-site edits -- the safe way to unify return-type-divergent copies. (4)
> `truncate` + `escapeHtml` -> new `shared/util/text.ts` (escapeHtml unified to the
> 5-char version -- a small XSS-hardening for the HTTP transfer page). (5) new
> `formatClock(seconds)` canonical + the uniform seconds->clock media players
> (Audio/NoiseGenerator/PiP/Gallery). (6) 5 main-process `generateId` copies
> (Logger + Voice/Ideas/Media/Learning controllers; crypto ones still excluded) --
> confirmed main resolves `src/shared/*` imports at runtime (15+ existing files do).
> DELIBERATELY LEFT (divergent / low value, tracked): the relative-time
> `formatTime`/`formatRelativeTime` copies (distinct older-than cutoffs), Timer's
> padded `mm:ss` countdown, the frames/bars domain formatters (closure state --
> must NOT merge), the main-process `formatBytes` diagnostic methods, and
> positional `rgbToHex` (needs arg adaptation). Verified: renderer + main
> `tsc --noEmit` both clean across the full ~55-file change; the two heavy test
> suites that timed out under full-parallel load (uki-compressed-memory,
> vault-hardening) pass in isolation (load flakiness, not a regression).
>
> **Dedicated UKI button (2026-06-16).** UKI was only reachable via a keyboard
> shortcut (Ctrl+Shift+U) and the command palette -- no persistent, visible entry
> the owner brief asks for. Added a small always-visible UKI orb as a companion to
> the `FloatingLauncher`: it rides with the launcher using the same clamped
> placement, flips below the orb when near the top edge (never off-screen), and
> toggles the assistant via `useUkiStore.getState().togglePanel()`. tsc clean.
> NOTE: much of this navigation/cohesion brief was already shipped -- Apps Menu is
> a static viewport-clamped scrollable panel, Home already has freeform
> drag-and-persist pinned files/apps/widgets, the radius scale
> (`--radius-xs..2xl/full`) already exists, and the named verbose toolbar labels
> ("Import File", etc.) are already iconified (the one "Open File" hit is a proper
> labelled File MENU item, correctly left alone).
>
> **Dedicated Search control + dropdown radius consistency + dock finding
> (2026-06-16).** Closed the three items left above. (1) Search: the universal
> `SpotlightSearch` overlay still existed and rendered (`showSpotlight`) but its
> ONLY trigger was the removed dock Search button -- so universal search had no
> entry point. Added a dedicated Search satellite to the `FloatingLauncher`
> cluster (alongside the new UKI one), wired via a new `onSearch` prop to
> `setShowSpotlight(true)` in AppManager; the two satellites stack on whichever
> side of the orb has room (never off-screen). (2) Pill/radius: aligned the shared
> `Select` control + menu (4 sites) from magic `borderRadius: 6` to the canonical
> `var(--radius-lg)` token -- consistency without pill-ifying (the established
> DEX-Sharp identity is deliberately DISCRETE radii, not pills, so aggressive
> pill restyling was correctly NOT done). (3) Dock removal: NOT dead code --
> `dockPinStore`/`useDockPins` is live infrastructure consumed by `pinRegistry.ts`
> and covered by 3 test suites; the Apps Menu already carries no dock positioning
> math, so there is nothing to safely remove. Verified: full tsc clean + 29 tests
> green (menuPosition + creative-controls + component suites).
>
> **Window manager -- Four-Grid (2x2) layout (2026-06-16).** The Strategic
> Completion brief lists a "Four-grid layout" under Window Manager, but the split
> engine (`applySplitRatio`) only tiled a single ROW of columns -- no 2x2 quad.
> Added `applyGridLayout(cols, rows)` in AppManager (row-major placement, reusing
> the same min-size guard + `clampWindowToWorkspace` discipline, falling back to
> the min-size-aware tiler when a cell would be below a window's minimum), a
> `dex-grid-layout {cols,rows}` event, and a "Four-Grid Layout" Command Palette
> entry (`grid-2x2`). Reuses the proven detached-window path; no new persistence.
> The rest of this brief was found already shipped (Workspace Memory = the
> persisted window manifest + presets + runningApps; split presets incl. 60/40;
> universal Ctrl+K search incl. the new Search satellite; menu placement; creative
> control kit; Home freeform) or native-blocked here (Rust/C++/ML engines for
> DAW/video/CAD/indexing). Verified: full tsc clean.
>
> **Notes Document Intelligence + UKI file awareness (2026-06-16).** Completed the
> plan's Notes "document statistics" / "professional document features" gap and
> consolidated scattered helpers. New shared, tested util
> `src/shared/text/documentStats.ts` (`analyzeText`: words, characters, sentences,
> paragraphs, syllables, reading + speaking time, Flesch reading-ease and
> Flesch-Kincaid GRADE LEVEL, readability band) -- the single source of truth,
> replacing NotesEditor's private `readingMinutes` and complementing
> NotesDocumentModel's `countWords`. NotesEditor's status bar now shows reading
> LEVEL (e.g. "Grade 8 · Plain"), gated to notes >= 30 words so the score is
> meaningful. PITCH shipped in the same work: the Notes UKI context resolver now
> reports the open note's length + reading level via the snapshot `custom` field,
> so UKI actually knows the document it's looking at ("summarise this" knows it's
> a 1,200-word Grade-11 piece) -- advancing the plan's "UKI context awareness:
> file awareness". The util is reusable for DEX Code file metrics + further UKI
> context. Verified: full tsc clean + 45 unit tests green (documentStats 16 +
> menuPosition + creative-controls + component suites).
>
> **Creative Control Kit rollout -- Forge + Vinx (2026-06-16).** Continued the
> kit adoption across the creative suite. FIRST extended `CreativeSlider` with a
> `layout` prop: `inline` (label | slider | value) and new `stacked` (label+value
> header above a full-width slider) -- so the kit faithfully covers BOTH creative
> idioms (Prism/Flux used inline; Vinx/Forge effect panels use stacked), making
> migration a true drop-in rather than a restyle. Then migrated: Forge -- 5
> sliders (Parallel Jobs, Target LUFS, Bitrate, Watermark Opacity, Subtitle Font
> Size) + the Watermark Type segmented control, and removed its 4 now-dead
> `slider*` style keys; Vinx -- all 9 effect sliders (mask feather/opacity/
> expansion, stabilization smoothness + rolling shutter, the 3 noise-reduction
> strengths, snap distance) via the stacked layout. DEFERRED (honest): Imosion's
> mastering panel (its 9px micro-labels need a `dense` size variant first, and the
> file is 17k lines -- a focused pass), Vinx's segmented controls (their state
> types vary and could break the generic without per-control checking), and
> Forge's grid-layout button groups. Verified: full tsc clean + 26 unit tests
> green (creative-controls + documentStats + menuPosition).
>
> **Creative Control Kit rollout -- Imosion + Vinx segmented (2026-06-16).**
> Pushed the kit deeper. Two more kit variants: `CreativeSlider` gained a `dense`
> prop (9px micro-labels for pro racks) and `SegmentedControl` gained a `fill`
> prop (equal-width segments). Then migrated: Imosion -- all 11 mastering-rack
> sliders (Stereo width/balance, Tone shelves + bass, 3-band Multiband, Analog
> Warmth, Loudness target + ceiling) via `layout="stacked" dense` with
> `marginBottom:0` so the panel's flex `gap` keeps spacing pixel-identical; Vinx
> -- all 5 segmented controls (mask shape, stabilization method + crop mode, noise
> method, EQ preset) via `SegmentedControl ... fill`, preserving the multi-select
> EQ-preset's band-loading onChange. The kit now backs Prism, Flux, Forge, Vinx,
> and Imosion. COMPLETED the last patterns too (no leftovers): added a `columns`
> mode to `SegmentedControl` (grid of N equal columns) and a `column` layout to
> `CreativeSlider` (label on top, full-width slider, value centered below -- the
> mixer-cell idiom), then migrated Forge's 3 grid button-groups (img-sequence +
> audio-extract format pickers via `columns={4}`, the 3x2 watermark-position
> picker via `columns={3}`) and Imosion's instrument-cell Volume + Pan via
> `layout="column" dense` (Pan keeps its C/L/R readout through `format`). The
> Creative Control Kit rollout is now COMPLETE across all five creative apps --
> every inline slider/segmented/grid control that maps to the kit is migrated.
> Verified: full tsc clean + 26 unit tests green.
>
> **Code-health pass -- dead-module removal (2026-06-16).** Internal-consolidation
> brief: "remove dead code / unused services / technical debt." Removed 10
> never-imported renderer modules after proving each had ZERO consumers (the
> `components/` and `services/` barrels are themselves imported nowhere; no direct
> path-imports; no JSX usage; only a stray docs mention): `PageTransition`,
> `ScrollEnhancements`, `SmoothZoom`, `CollapsiblePanel`, `EnhancedKnob`,
> `NumberInput`, `components/ColorPicker` (NOT the live standalone ColorPicker),
> `RichTextInput`, `HelpOverlay`, and the orphaned `services/AppStateMachine.tsx`
> (StateRenderer + Default*UI + unused hooks). Trimmed `components/index.ts` to the
> one live survivor (`ResizablePanel`) and dropped the `AppStateMachine` block from
> `services/index.ts`. `tsc` is the backstop -- it would fail on any missed
> reference. Verified: full tsc clean (0 errors) + component-import + kit tests
> green (21). Note: `EnhancedKnob`/`NumberInput`/`ColorPicker` were the OLD
> unadopted control library, now superseded by the shared Creative Control Kit --
> so this also removes a duplicate-system per the brief.

> **DEX 5.6 Foundation Phase -- Project Spaces + UKI workspace awareness
> (2026-06-17).** Opens the 5.6 "Workspace Intelligence" pillar. The window-
> LAYOUT systems were already mature (WorkspacePresets/templates/panel, the
> runningApps crash journal, WindowManifest, the live `stageStore` Stage context),
> but two foundation gaps blocked everything 5.6 wants UKI to know: (1) a Stage had
> no SEMANTIC dimension -- what KIND of work it is -- so "Project Spaces"
> (Development/Design/Audio/Video/Research/Personal) didn't exist as a concept; and
> (2) UKI was blind to the active workspace -- `liveContext()` reported open/recent
> apps but never the workspace, and the `UkiContextSnapshotRecord.workspaceId` field
> + identity.ts's "Active workspace" awareness claim were both unpopulated. Rather
> than add a 4th parallel workspace store, ELEVATED the existing live Stage:
> `stageStore` gains a `StageKind` + `STAGE_KIND_META` single-source-of-truth +
> `setKind` + a v2 persist migration (`migrateStagePersist` defaults old stages to
> `general`), and is exposed on `window.__dexStageStore` (mirrors
> `__dexRunningApps`). Wired end-to-end into UKI: `uki/context.ts` gains
> `getActiveWorkspace()` (dependency-light, no circular import) feeding both
> `liveContext().activeWorkspace` and the long-reserved `snapshot().workspaceId`;
> BOTH prompt builders now ground on it -- the Uki chat app (`Uki.tsx` adds an
> "Active workspace" line) and the overlay (`identity.ts` `UkiContextSnapshot`
> gains `activeWorkspace` -> a `workspace=name(kind)` context bit, passed from
> `UkiOverlay`). Made it real UI, not backend plumbing: the Command Palette gets
> "New Project Space" + per-space "Switch Space" commands (kind-labelled), and the
> Workspace dialog (`WorkspacePresetsPanel`) gains a "Project Spaces" section to
> switch / retag-kind / delete spaces in one place. Verified: renderer `tsc
> --noEmit` clean + 34 unit tests green (new `tests/unit/workspace-spaces.test.ts`
> covering kind metadata, the persist migration, `getActiveWorkspace` ->
> `liveContext` flow, and prompt grounding). NEXT in this pillar: register UKI
> app-context resolvers per app (Files/Tasks/creative), and have `DexProject`
> open/save bind a project to its Project Space so "open project -> restore the
> space + layout" closes (the `DexProject.workspace` field already carries the
> data).

> **DEX 5.6 Foundation Phase -- Project Spaces now SWITCH windows (2026-06-17,
> batch 2).** Closed the biggest gap from batch 1: switching a Project Space did
> nothing to windows -- the `stageStore` `captureWindows` action was NEVER called
> and nothing reacted to the `continuity:stage` event, so spaces were inert
> labels. Now a space switch is a real context switch. `StageWindowRef` gained
> optional geometry (`x/y/width/height/maximized`), and AppManager subscribes to
> `continuity:stage`: it (1) captures the OUTGOING space's live floating-window
> layout into that stage, then (2) restores the INCOMING space -- closes floating
> windows that don't belong to it (through the existing veto-aware close, so an
> unsaved-changes guard can still cancel) and launches + clamps the ones that do,
> reusing the proven preset/crash restore path. A space with NO saved layout is
> left transparent (current windows untouched) so a brand-new space never blanks
> the desktop; it self-organizes into a clean switch once it has a captured
> layout. Bonus: populating `stage.windows` revives the dormant per-stage app list
> already rendered in TaskManager, and the Project Spaces panel now shows each
> space's window count. Verified END-TO-END in the live preview: opened Files +
> Notes as windows, switched to a calculator-only "Dev" space (Files/Notes closed,
> Calculator opened, default space captured [files,notes] with geometry), then
> switched back (Calculator closed, Files+Notes restored at their exact geometry).
> Renderer `tsc --noEmit` clean + 12 unit tests green (capture + switch-event
> coverage added to `tests/unit/workspace-spaces.test.ts`). NEXT: bind `DexProject`
> open to its Project Space; per-monitor space layouts; optional "merge into
> current space" modifier on switch.

> **DEX 5.6 Foundation Phase -- Workflow->Space + DexCode UKI awareness
> (2026-06-17, batch 3).** Unified three previously-DORMANT systems into one
> working feature and added the last missing per-app UKI resolver. (1)
> Workflow->Project Space: `workflowTemplates.instantiateWorkflow()` (builds a
> `.dexproject` manifest + tiled `WorkspaceSnapshot`) and
> `DexProject.announceProjectFocus()` (emits `continuity:project`, consumed by the
> UKI operator + Nexus) were BOTH never called -- pure dead plumbing. New
> `services/projectSpaces.ts` `openWorkflowSpace(id)` ties them together: maps the
> template's tags to a `StageKind`, creates a Project Space pre-loaded with the
> template's window layout, activates it (the batch-2 `continuity:stage` handler
> opens + tiles the apps), and announces the project so UKI/Nexus light up. Wired
> to 6 new Command Palette commands ("Open Workspace: Design / Music / Research /
> Development / Study / Writing"). Verified LIVE: clicking "Open Workspace:
> Development Workspace" created an active development-kind space and actually
> opened dexcode + browser + files (runningApps confirmed). (2) DexCode UKI
> resolver: registers a `dexcode` app-context resolver (open file path, language,
> line count, dirty state, cursor) so UKI knows what code the user is editing --
> the dev-workspace half of UKI awareness; the per-app resolver set
> (Notes/Tasks/Files/Gallery/Rewind/+DexCode) is now broad. (3) Per-monitor space
> layouts: investigated and NOT built -- DEX is a single-viewport app
> (`getShellWorkspace`'s arg is padding, not a display index; `WindowSnapshot.
> displayId` is a never-used placeholder; the renderer never receives the main
> process's `MultiMonitorManager` data). Real per-monitor support is an
> architectural rewrite (main->renderer display IPC + per-display workspace
> bounds), deliberately deferred rather than faked. Verified: renderer `tsc
> --noEmit` clean + 15 unit tests green (workflow->space mapping/creation added to
> `tests/unit/workspace-spaces.test.ts`) + live boot clean with the new wiring.
> NOTE: `WORKSPACE_TEMPLATES` (shell/WorkspacePresets, apps-only starter layouts)
> and `WORKFLOW_TEMPLATES` (geometry+tags, now the Project-Space producer) are
> parallel template sets -- a future consolidation candidate, left as-is to avoid
> churn this batch.

> **DEX 5.6 Foundation Phase -- template consolidation + space hotkeys (2026-06-17,
> batch 4).** Closed the duplicate flagged in batch 3 and added OS-style space
> switching. (1) Removed the duplicate starter-template system: deleted
> `WORKSPACE_TEMPLATES` + `WorkspaceTemplate` (shell/WorkspacePresets, geometry-less
> apps-only, 4 entries) and the now-unused `dex-workspace-apply-template` event +
> AppManager `onApplyTemplate` handler. `WORKFLOW_TEMPLATES` (services/
> workflowTemplates, 6 entries, geometry+tags) is now the SINGLE starter source --
> the Workspace dialog's "Starter workspaces" section opens them as real,
> kind-tagged Project Spaces via `openWorkflowSpace()` (same path as the palette).
> Verified live: the panel shows all 6 (Design/Music/Research/Development/Study/
> Writing) and clicking "Design Workspace" opened a design-kind space with prism +
> files + browser. (NB: `Workflows.tsx` has its OWN name-colliding
> `WORKFLOW_TEMPLATES` for automation node-graphs -- unrelated, untouched.) (2)
> Project Space hotkeys: `Ctrl/Cmd+Alt+1..9` jumps to space N (mirrors the
> `Ctrl+1..9` app idiom; placed before the app ctrlMap which ignores Alt; no
> collision -- the Ctrl+Alt+Arrow tile family and Alt+letter app family are
> untouched). Documented in docs/SHORTCUTS.md. A `Ctrl+Alt+Arrow` cycle binding was
> prototyped then REVERTED on finding it shadows the existing focused-window tile
> shortcut. Verified live (Ctrl+Alt+2 jumped to the 2nd space). Renderer `tsc
> --noEmit` clean + 15 unit tests green. The Workspace Intelligence pillar
> (identity + kind + UKI awareness + window save/restore on switch + workflow->space
> + hotkeys, one template source) is now a complete, verified foundation.

> **DEX 5.6 -- four-pillar slice: Search / UKI / Rewind / Security (2026-06-17,
> batch 5).** One real, verified slice of each remaining 5.6 pillar (owner: "all,
> no skips"). (1) SEARCH: universal search (`SpotlightEngine`) now indexes Project
> Spaces as `actions` ("Switch to <name>", kind subtitle, setActiveStage) -- the
> active workspace is switchable straight from Ctrl-search. Synchronous stage-store
> read alongside the settings/actions sources. (2) UKI: `operator.suggestWorkflows`
> is now workspace-aware -- a `KIND_TO_WORKFLOW_TAG` bias surfaces the matching
> workflow for the active space kind (Development space -> Development workflow)
> even before its apps open; `activeWorkspace` now flows through OperatorBriefing ->
> toPromptContext -> formatOperatorBriefing into the prompt. (3) REWIND: new
> renderer-side `store/stageActivityLog.ts` (persisted, timestamped space-switch
> log, recorded from `setActiveStage`) + `spaceAt(ts)`; Rewind session pills now
> show a Project-Space badge (the space active at the session's start) -- "what
> workspace was I in". (4) SECURITY: the audit backlog was already largely done
> (PtyService allowlist + src-tauri fs containment shipped; source index.html CSP
> already has object-src/base-uri/form-action/frame-ancestors -- the audit had read
> a stale dist/ artifact). A fresh XSS-sink sweep found + fixed TWO REAL latent
> sinks: `CleanUI.showToast` interpolated user-derived text (imported asset/part/
> file names -- a part named `<img onerror>` in an STL/AXL import would execute)
> raw into innerHTML -> now `escapeHtml`'d; and `stability.safeSetInnerHTML` was
> misleadingly named (assigned raw html) -> now `DOMPurify.sanitize`. Verified:
> renderer `tsc --noEmit` clean + 21 unit tests green (added suggestWorkflows
> workspace-bias + stageActivityLog/spaceAt coverage) + clean app boot with all new
> imports (no circular deps). HONEST LIMITS: the Spotlight overlay render and
> Rewind's backend-fed timeline can't be exercised in the backend-less Vite preview
> (env limit) -- both render paths are tsc-validated + pattern-consistent + their
> pure logic is unit-tested. NOT built: per-monitor space layouts (needs main->
> renderer display IPC, architectural); main-window `sandbox:true` (Electron-only,
> unverifiable here, risks preload breakage -- left for an Electron smoke-test).

> **DEX 5.6 -- Universal Command Layer in search (2026-06-17, batch 6).**
> Delivered the expanded 5.6 brief's "Universal Search: Commands" + dedicated
> "Universal Command Layer" (Raycast/Spotlight-style) section. The user-facing
> universal search (`SpotlightEngine`) now indexes, in its synchronous build path
> alongside the new Project-Spaces source: (1) the DEX command catalog's ACTION
> commands (system/window/navigation -- Lock DEX, Tile Left/Right, Split, Arrange,
> Maximize, Back/Forward, Compact, UKI toggle) under the `commands` category, each
> run through the ONE canonical `executeDexCommand` (app-launch commands skipped --
> already indexed, no duplication); and (2) the 6 starter workspaces
> (`WORKFLOW_TEMPLATES`) as `actions` ("Open Development Workspace" -> opens a
> kind-tagged Project Space via `openWorkflowSpace`). So Ctrl-search is now a
> command runner, not just a finder. Reuses the single command catalog + executor
> + workflow source -- zero parallel systems. Verified LIVE in preview: searching
> "lock" surfaces "Lock DEX · System command" under a COMMANDS section; "development
> workspace" surfaces "Open Development Workspace · Starter workspace"; clean boot
> with the widened import graph (no cycles). Renderer `tsc --noEmit` clean. With
> batch 5's Project-Spaces-in-search, universal search now reaches apps, settings,
> files, notes, tasks, projects, workflows, spaces, AND runnable commands -- the
> brief's "everything searchable". REMAINING in this pillar: contextual NL commands
> ("open latest project", "export current video") need per-app target resolution;
> browser-history + AI-conversation sources are backend-fed (Tauri/Electron parity).

> **DEX 5.6 -- three parallel slices: Terminal / UKI skill packs / Browser
> (2026-06-17, batch 7).** Ran three disjoint-file slices concurrently (owner:
> "parallelize it"), integrated + verified together. (1) DEX TERMINAL "AI command
> suggestions": a live, keyboard-navigable `dex <cmd>` suggestion dropdown in
> `Terminal.tsx` -- as you type `dex <partial>` it shows the top ranked catalog
> matches (typo-tolerant `suggestDexCommands`) with label + alias + platform
> shortcut; Up/Down select, Enter runs it through the EXISTING `handleDexInput`
> path, Esc dismisses; reuses the one catalog + Tab-completion data (no parallel
> system), never overlaps Ctrl+R. (2) UKI AGENT SKILL PACKS (Priority 1): new pure
> `uki/skillPacks.ts` (`SKILL_PACKS` for developer/music/video/design/research +
> `relevantSkillPacks({activeKind,openApps})` selector + `formatSkillPacksForPrompt`)
> folded into the Uki chat `buildSystemPrompt` -- in a Development space UKI is told
> "Developer skills available: Git Assistant, Refactor Assistant, Debug Assistant",
> etc.; unit-tested (`tests/unit/skill-packs.test.ts`). (3) BROWSER session restore
> (Browser Expansion): `Browser.tsx` now persists open tabs (url+title+pinned) +
> active tab to `localStorage` (`dex-browser-session`, debounced) and lazily
> restores them on mount with corrupt-JSON-safe fallback to a single blank tab --
> no prior session persistence existed (not a duplicate). Verified: full renderer
> `tsc --noEmit` clean across all three + 59 unit tests green (skill-packs +
> workspace-spaces + dexCommands) + clean app boot with Browser & DexCode (hosts
> the terminal) mounting error-free + the browser session writing the correct
> durable shape to localStorage. Method note: 3 general-purpose worker agents on
> strictly disjoint files (Terminal.tsx / skillPacks+Uki.tsx+test / Browser.tsx),
> implement-only (no self-tsc to avoid cross-contamination), parent ran the single
> integrated verification.

> **DEX 5.6 -- UKI Answer Engine: public APIs wired into the assistant
> (2026-06-17, batch 8).** Delivered the roadmap's "Free APIs" integration + UKI
> "information / internal web search / clear English responses". The free-API
> layer (`uki/freeApis.ts`) had Wikipedia/Weather/Time/DuckDuckGo but was ORPHANED
> -- nothing in the answer flow called it, and UKI's "web search" just dumped the
> query into a Google tab without answering. Fixed end-to-end: (1) EXPANDED
> `freeApis` with the remaining keyless + CORS sources from the brief --
> `searchWikipedia` (title-search -> summary, so "who invented X" resolves),
> `lookupDictionary` (dictionaryapi.dev), `convertCurrency` (open.er-api.com /
> ExchangeRate). (2) NEW `uki/answerEngine.ts` -- a pure, ordered intent classifier
> (`classifyKnowledgeIntent`: weather/define/currency/time/lookup) + per-intent
> extractors (place, word, currency triplet, IANA tz via a city table, topic) +
> `answerFactualQuestion` that runs the right API and formats ONE clear English
> sentence with a source label. (3) WIRED into both UKI surfaces -- the
> `UkiOverlay` pipeline and the standalone `Uki` chat: a knowledge question is
> answered DIRECTLY from the public API when no LLM key is configured (so factual
> Q&A now works with zero setup, and offline from cache), and folded into the
> system prompt as `[Live facts retrieved just now]` grounding when a provider IS
> configured (so the model answers conversationally with CURRENT data, not stale
> training knowledge). The "what is X" path no longer bounces to the browser when
> we can answer it. Verified: renderer `tsc --noEmit` clean + 21 new unit tests
> green (classification + every extractor + grounding formatting) + full suite.
> HONEST LIMITS: the live network calls aren't exercised in-suite (keyless public
> endpoints, no injectable fetch in `freeApis`); the classify/extract/format logic
> that decides WHICH call and HOW it reads is fully unit-tested. NOT added:
> key-requiring sources from the brief (Alpha Vantage, NewsAPI/GNews, Tavily, Brave,
> Unsplash) -- they need a Settings key surface + secret storage, a separate slice.

> **DEX 5.6 -- Stage Manager REMOVED + refinement-brief triage (2026-06-17,
> batch 8).** Owner pivot to stabilization/refinement ("stop feature expansion").
> Headline: COMPLETELY removed the Stage Manager (the macOS-Tahoe left-edge app
> strip -- the "separate management layer" the brief calls clutter). Deleted
> `shell/StageManager.tsx` and every tendril: AppManager import + `stageManagerOn`
> state/effect + left-offset reserve (`stageOffset` now 0) + both render blocks
> (strip + re-enable handle) + the `'stage'` manifest/preset stageId labels;
> `shellPreferencesStore.stageManagerPinned` (interface/default/coerce/setter);
> both Settings toggles. KEPT the `stageStore` Project Spaces (identity + window
> save/restore on switch + persistence) -- that IS the brief's requested "window
> memory / window grouping / workspace persistence" replacement, NOT part of the
> strip. Window management is now fully native: click-to-focus, Ctrl+Tab switcher,
> dock / Apps menu launch, drag-snap + tile + split + Ctrl+Alt+N Project Spaces.
> The `dex-stage-manager` localStorage key stays in the ErrorBoundary
> reset-allowlist so a settings reset cleans up the orphaned value. Verified:
> renderer `tsc --noEmit` clean + 31 unit tests green + LIVE boot clean with the
> strip gone (`[aria-label="Stage Manager"]` absent) and switching intact
> (setCurrentApp/bringToFront round-trip) + zero console errors.
> REST OF THE BRIEF -- TRIAGE (scouted, verified): FOUR items are ALREADY DONE (do
> not re-chase) -- maximized-window controls always visible (permanent title bar,
> no `!isMaximized` gate), resize glow/highlight removed (bare transparent
> handles), Browser solid (zero backdrop-filter), Terminal not clipped. Dock /
> Apps-menu rewrites + platform-wide de-glass also shipped in the 5.5 DEX-Sharp
> program. TOOLTIP removal: no hover-spam component exists (custom tooltips are
> focus-only / barely used); the noise is ~418 native `title=` across 71 files,
> many on icon-only buttons where blanket removal breaks accessibility -- needs a
> careful `title`->`aria-label` codemod (own scoped pass), NOT a blanket sweep.

> **DEX 5.6 -- FloatingLauncher hover/tap glitch fix (2026-06-17, batch 10).**
> User-reported (screen recording): hovering/tapping near the bottom-right launcher
> made the menu / search / UKI buttons "glitch". Diagnosed from the recording
> (frame extraction + montages) + code + a live preview repro: (a) the three
> launcher buttons carried native `title=` tooltips ("Search" / "UKI assistant" /
> "Launcher --- click to open...") -- the floating-label boxes that pop in/out on
> hover (visible in the recording; matches the brief's "remove hover tooltips / no
> floating labels"); (b) the press-vs-drag `MOVE_THRESHOLD` was only 4px, so a
> touch tap with slight finger jitter flipped the whole cluster into drag state
> (shadow + backdrop + scale flash). Fix (FloatingLauncher.tsx): removed the three
> native `title=` attributes (kept `aria-label`, so screen-reader accessibility is
> preserved) and raised `MOVE_THRESHOLD` 4 -> 8px so a tap stays a clean click.
> Verified live: the buttons now expose NO `title` (zero hover tooltip), keep their
> aria-labels, and a clean press still fires (Search press opens Spotlight). tsc
> clean. FOLLOW-UP (same day): user reported the orbs STILL felt jittery on hover +
> asked about the all-apps-open stress case. Measured under load -- opened apps
> until DEX's concurrent-app CAP kicked in (tier-based; 6 in the preview tier, "App
> Limit Reached" beyond) + sampled Search/UKI orb positions 40x while jiggling the
> mouse: ZERO px movement, no errors -> no position-drift bug, shell stable. Two
> more fixes: (3) removed the orbs' `scale(1.05)` HOVER grow (the only thing that
> changed on hover -- a decorative shimmer; hover feedback is now icon-color only,
> geometry never moves); verified hoverScalesOrb:false. (4) `resolve()` now GUARDS
> a degenerate 0x0 viewport -- the preview caught it computing a NEGATIVE
> off-screen corner (0-SIZE-EDGE_PAD = -64) when innerWidth/Height momentarily read
> 0 (minimize/restore, DPI/monitor change, pre-layout), which flashes the cluster
> off-screen + back; now keeps a safe on-screen value + re-resolves on resize.
> Verified: real viewport (779x730) -> orbs correct bottom-right + on-screen; 0x0
> viewport -> x>=0 (was -64). Re-verified all: no tooltip, no hover scale, clean
> press still opens Search/UKI/menu, 60px drag still repositions, tsc clean. NOTE:
> launcher slice of the global "Tooltip Removal Program"; the broader ~418 native
> `title=` over 71 files still wants a careful `title`->`aria-label` codemod.

> **DEX 5.6 -- AI Permission Center (2026-06-17, batch 11).** Delivered the
> Security/Permissions pillar's missing "AI permissions" surface. The UKI
> capability model (`uki/permissions.ts`: `describeCapabilities` + `grant`/`revoke`
> + `ALL_CAPABILITIES`, with plain-language label + rationale + scope/expiry per
> capability) was ORPHANED -- read-only via the `dex perms` terminal command,
> which even told the user to "Grant or revoke from UKI settings" while no such UI
> existed. Wired it into the real Settings -> Permissions panel: a new "UKI
> Assistant Access" section (folded into `settingsPanels/AccessPanels.tsx`'s
> `PermissionsPanel`, so Permissions is now ONE AI + system center) lists every
> capability with a status dot (granted/denied/hard-denied), its rationale, and
> per-capability controls -- "Allow once" (4h session grant), "Always" (persistent),
> and "Revoke", plus a "Revoke all assistant access (N)" action. The `dex perms`
> footer now points at the real location, and `settingsSearchIndex.ts` indexes the
> section so it is searchable. Reuses the existing localStorage-backed
> `uki/cache.ts`, so it works with zero setup and persists. Verified: renderer
> `tsc --noEmit` clean + new `tests/unit/uki-permissions.test.ts` (6 tests:
> describe order/defaults, session vs persistent grant + expiry, revoke isolation,
> re-grant replace, expired-session prune) + LIVE in preview -- opened Settings ->
> Permissions, clicked "Allow once" on Read files, confirmed the persisted grant
> (file-read/session/expiry), the row flipping to "Revoke", and the count updating
> to "(1)". BONUS robustness fix: `DexIcon` crashed the whole app shell on
> `name.charAt(0)` when an icon `name` was undefined (a presentational component
> should degrade, never crash) -- now renders a safe `?` fallback. (Found while
> driving the preview; the trigger in that case was a malformed test-harness launch
> call, but the guard is correct defense-in-depth regardless.) NEXT in this pillar:
> the brief's remaining permission facets (plugin permissions, browser isolation,
> download safety checks) each map to their own existing subsystem and are separate
> slices; the native per-origin `PermissionsPanel` grants list needs the packaged
> `dexNative.permissions` bridge (unavailable in the web preview).

> **DEX 5.6 -- Global Search 2.0: open browser tabs searchable (2026-06-17).**
> Extends the Universal Command Layer (batch 6) search spine. SpotlightEngine now
> indexes the user's OPEN BROWSER TABS in its sync build path: reads the persisted
> browser session (`localStorage 'dex-browser-session'`, the batch-7 restore data --
> no IPC), indexes each tab with a real URL as a `web` result ("<page title> ·
> Browser tab"), skips blank "New Tab"s, and on select routes through the SAME
> `_launchAppWithContext('browser', url)` -> `dex-spotlight-navigate` path web
> results already use (zero Browser.tsx change). Verified LIVE on a real viewport:
> seeded a 2-tab session, reloaded, opened Spotlight via the Search orb -> "MDN" and
> "github" each surfaced their tab with a "Browser tab" subtitle, and Enter fired
> `dex-spotlight-navigate {appId:'browser', contextId:'https://github.com/dex'}`.
> tsc clean. Universal search now reaches apps/settings/files/notes/tasks/projects/
> workflows/spaces/commands/browser-tabs. REMAINING search sources (downloads,
> media, AI conversations, full browser history) are backend-fed (Tauri/Electron) --
> separate slice. The rest of the "Engineering Deep Dive" brief is largely already
> shipped this cycle (unified ContextBus event bus; crash recovery + last-session
> restore = self-healing; concurrent-app cap + WorkloadGovernor + xenon = health
> layer; UKI awareness/answer-engine/skill-packs; Stage Manager removed) or
> architectural (Unified Runtime/Resource/Memory managers, multi-monitor = need
> main<->renderer IPC; C++/Rust engine work = native-blocked here).

> **DEX 5.6 -- DEX Code made functional + IDE-feel fixes (2026-06-17).** User
> reported (from a screen recording) DexCode "test code not showing", "can't
> collapse the side", broken code display. Diagnosed + fixed FOUR real bugs, two
> of them critical: (1) SYNTAX HIGHLIGHTER CORRUPTION -- `highlightDexScript`
> chained `String.replace` passes that re-scanned their own inserted markup (the
> string regex matched the quotes inside `class="dex-syn-comment"`), rendering
> garbled `<span class="&lt;span">` over the code. Rewrote it as a single-pass
> tokenizer (no re-scan); 5 unit tests (`tests/unit/dexcode-highlight.test.ts`).
> Verified live: clean spans. (2) DEXCODE COULD NOT RUN ANY CODE -- the DexScript
> runtime executes transpiled JS via `new Function()`, which the hardened CSP
> (`script-src 'self'`, no `unsafe-eval`) blocked -> every run returned the CSP
> error instead of output. THAT was "test code not showing". Added `'unsafe-eval'`
> to BOTH the renderer index.html meta CSP AND the main.ts response-header CSP.
> (3) Once eval was allowed, a SECOND masked bug surfaced: the runtime's sandbox
> did `const eval = undefined` under `"use strict"` -- itself a strict-mode
> SyntaxError. Removed that one illegal line (eval can't be lexically shadowed in
> strict mode; Function/window/fetch/storage stay shadowed). Verified live: running
> `print("hello " + (2+3))` + a `for x in 1..3` loop + `math.sqrt(16)` now prints
> `hello 5 / row 1 / row 2 / row 3 / 4`. (4) `runCode` deferred execution via
> `requestAnimationFrame`, which is PAUSED for backgrounded/unfocused windows ->
> runs silently dropped; switched to `setTimeout(0)`. PLUS: collapsible sidebar
> (Ctrl+B + Navigator toggle + persisted) for the IDE feel. Renderer + main `tsc`
> clean, 5 highlighter tests green. **SECURITY FLAG (owner decision):** re-allowing
> `'unsafe-eval'` widens the renderer XSS surface -- it partially relaxes the CSP
> hardening from the 2026-06-13 audit. It is the pragmatic unblock for the app's
> own scripting runtime (user runs their own code; globals are sandboxed). The
> stricter long-term alternative is moving DexScript execution to a main-process
> Node `vm` sandbox over IPC (keeps the renderer eval-free) -- not done here.
> ALSO landed this session (parallel workers, before the DexCode dive): Notes
> inline "New from template" picker (wired the orphaned DEFAULT_NOTE_TEMPLATES),
> DexCode resizable+persisted bottom terminal panel, and a Permission Center dialog
> (`components/PermissionCenter.tsx`, Command Palette "UKI Permissions") wiring the
> previously UI-less `uki/permissions.ts` grant/revoke API -- verified live
> (grant -> "1 of 9 allowed", revoke -> "0 of 9").

> **DEX 5.6 -- creative-suite + search slices (2026-06-17), correcting an
> over-deferral.** After the owner pushed back that "blocked" was hiding buildable
> work, re-scoped: the TRULY blocked set is only C++/SIMD/napi native + ML;
> multi-monitor is a real window-layer rework; but creative-app FEATURES and
> several "backend-fed" search sources are renderer-buildable. Shipped 3 buildable
> slices (2 parallel workers on disjoint app folders + 1 self): (1) AXL Design
> Tokens panel -- new `axl/components/DesignTokensPanel.tsx` + a "TOKENS" tab in
> PropertiesPanel; color/number tokens, persisted (`dex-axl-design-tokens`,
> corrupt-safe, seeded defaults), color tokens apply to the selected part via the
> existing `setPartMaterial` (no store surgery), numbers copy to clipboard.
> VERIFIED LIVE: TOKENS tab renders the 5 seeded tokens as editable rows. (2)
> Imosion Chords & Scales -- new PURE `imosion/musicTheory.ts` (`scaleNotes`,
> `diatonicChords`, 7 scales) + a reference panel toggled from the Panels dropdown
> (separate from the existing audio-driving Chord Trigger). VERIFIED: 8 unit tests
> (`tests/unit/imosion-music-theory.test.ts`) green (C-major/A-minor/pentatonic
> correctness), tsc clean, app mounts with no console errors, toggle present --
> BUT the panel's live render could NOT be isolated in the preview (Imosion's
> overlapping-panel + dropdown UI defeats synthetic clicks); logic is tested, UI is
> additive + tsc-clean but visually UNVERIFIED. (3) Global Search: browser HISTORY
> now indexed in SpotlightEngine (reads `localStorage 'dex-browser-history'`,
> deduped by URL, most-recent-first, capped 40) -- I'd mislabeled this "backend-fed"
> but it's renderer localStorage. VERIFIED LIVE: search "Hacker" -> "Hacker News ·
> History". Renderer tsc clean + 8 new tests green.

> **DEX 5.6 -- creative-suite UI declutter + Vinx markers (2026-06-17).** Owner
> brief: "aggressive UI/UX refinement -- remove empty-state walls, verbose text,
> do not explain obvious actions." (1) Vinx TIMELINE MARKERS landed (a parallel
> worker that DIED before its final report -- but the edits were complete + compile
> clean): `MarkerFlags` ruler overlay (same frame->pixel mapping as ticks/playhead,
> click-to-seek, right-click-remove), an "+ Marker" button (M), and the Marker
> Manager list made click-to-seek; `addMarker`/`updateMarker` added to VinxStore
> (`removeMarker`/`markers` pre-existed). VERIFIED LIVE: "+ Marker" x2 -> 2 ruler
> flags, no errors. (2) Imosion declutter: removed the timeline-toolbar "Import"
> button AND the empty-state wall ("No tracks yet" + Add Track + Import Audio
> buttons) -> a clean drag-first empty state (faint icon + "Drag audio here"; the
> whole area is a drop target). Import is now drag-in or File > Import Audio.
> Removed the "No tracks yet. Add a track to attach notes." side-panel line too.
> (3) Cross-app "don't explain obvious actions" removals: the curve-editor tutorial
> hints in Vinx Inspector ("Click to add · Drag to adjust · Double-click to
> remove"), Prism AdjustmentControls ("Click to add - drag to shape ..."), and the
> Vinx speed-curve "Click to add speed points" -- all removed (pro tools don't
> print these). Renderer tsc clean, apps mount with no console errors. NOTE: the
> full aggressive-refinement brief (global pill design language, AXL 3D-nav
> overhaul, Nexus visual reset, mixer redesign, overlay/slide-over system) is a
> large multi-session design pass; this slice covers its #1 ask (empty-state +
> verbose-text removal). The drag-OUT-after-export ask is a native Electron
> `webContents.startDrag` feature (main-process, not preview-verifiable) -- deferred
> honestly, drag-IN already works.

> **DEX 5.6 -- pill button language at the source (2026-06-17).** Owner brief:
> "pill design language globally; replace heavy rectangular controls + thick
> borders + glow with pill controls / rounded chips; consistency mandatory."
> Refined the CANONICAL button at its source (`styles/design-system.css` `.btn`)
> rather than touching N files: base `.btn` -> `border-radius: 9999px` (full pill)
> + `box-shadow: none` (was a 3-layer drop/inset shadow); `.btn-primary` /
> `.btn-secondary` / `.btn-danger` (+ their hovers) lost their colored GLOW
> box-shadows (`rgba(10,132,255,.3)` etc.) -> flat fills + hairline borders, hover
> feedback now via fill/border only. Imosion injects its own global `.btn` (radius
> 6px) that shadows the design-system one while mounted, so its `.btn` /
> `.btn-primary` / `.btn-danger` radii were bumped to 9999px too for consistency.
> VERIFIED LIVE: every `.btn` (11 sampled) now computes `border-radius: 9999px` +
> `box-shadow: none`; app mounts with no console errors. High-leverage: one CSS
> source sharpens every `.btn` toolbar/dialog button across the creative suite +
> shell. REMAINING for the full pill sweep: the many buttons that use INLINE styles
> (not `.btn`) -- e.g. some Imosion/Vinx/Prism panel buttons -- still carry square
> radii; those are per-file and a larger follow-up. (KNOWN debt surfaced: Imosion's
> runtime-injected `<style>` leaks `.btn`/`.section-title` globally while it's
> mounted -- a scoping cleanup for later.)

> **DEX 5.6 -- pill sweep across the creative apps (2026-06-17).** Extended the
> source-level `.btn` pill+flat language (prior entry) into the INLINE-styled
> buttons of Prism, Flux, and Forge (3 parallel workers, disjoint app folders,
> visual-only/additive). Each: square button/chip radii (3-8px) -> `9999px` pills;
> icon-only buttons -> circles; removed the accent GLOW box-shadows on active
> tool-toggles (`toolBtnActive` `0 0 0 2px rgba(<accent>,.35)` in Prism + Flux) ->
> flat; thick borders -> hairline; and trimmed leftover verbose/tutorial copy
> (Prism: "Drop X or click to add" -> "Drop X" on exposures/files/regions/blemishes/
> panorama/focus-bracket + "Recording..." -> "Recording"; Flux: easing/motion-blur
> tutorial lines collapsed). Inputs, list rows, cards, swatches, grids, and true
> modal/popover elevation correctly left alone. Verified: renderer tsc clean; all
> 3 apps mount with NO console errors; live foreground sample -> Prism 35 / Flux 20
> / Forge confirmed pill buttons (Open/Save/Export/Import toolbars now flat pills).
> REMAINING for the pill sweep: Vinx + AXL inline buttons (not yet swept), the
> imported `collabButton` style (shared hook, out of the per-app scope), and a few
> per-app color-identity nits the workers flagged (Forge/Flux primary buttons use
> cyan not their app accent). Nexus is a deeper "visual reset" (reduce glow/effects)
> -- a separate design task, not a button sweep.

> **DEX 5.6 -- pill sweep COMPLETE across the creative suite (2026-06-17).** Vinx +
> AXL swept (2 more parallel workers), finishing the set. Vinx: `toolbarBtnStyle`/
> `playbackSpeedBtnStyle`/`addTrackBtnStyle`/`zoomBtnStyle`/HeaderBtn + all inline
> action buttons (+Add Track, +Marker, Capture, Apply Reframe/Stabilization, Match
> Colors, mask buttons) -> pills; removed the `toolbarBtnActiveStyle` inset accent
> shadow; trimmed "No subtitle tracks. Add one..."/"No markers. Press M..."/"Import
> media to get started" empty-states to one-liners; ExportDialog + Inspector
> buttons pilled. AXL: Toolbar action buttons + DesignTokensPanel + PropertiesPanel
> + ModifierStack + Axl.tsx segmented controls/panel actions -> pills, modifier
> empty-state trimmed. Both correctly left inputs, tool-icons, grids, list rows,
> cards, and modal/popover elevation alone. VERIFIED: renderer tsc clean; both
> mount with NO console errors; live foreground sample -> Vinx 56 pills (the "+
> Marker" button computes 9999px), AXL 56 pills. PILL LANGUAGE NOW COVERS: global
> `.btn` + Imosion + Prism + Flux + Forge + Vinx + AXL. STILL OUT: the DEX SHELL
> chrome (top-bar nav / permission indicators, radius 4px) -- a separate shell pass,
> not part of the creative-suite brief; the imported `collabButton`; a few cyan-vs-
> app-accent primary-button color nits; and NEXUS (deeper "visual reset" -- reduce
> glow/effects, its own design task). The pill sweep itself is done + verified.
>
> **DEX 5.6 -- Nexus rebuilt as the UKI command HUD (2026-06-17).** Owner ask: a
> simpler, working, interactable, sharp, UKI-driven Nexus matching a target-locator
> HUD reference. DELETED the old 3044-line five-mode Canvas2D 3D graph
> (starfield/grid/cluster/knowledge/security, perspective projection, arc-reactor
> avatar, file auto-scan, drag-camera) and replaced it with a focused ~620-line
> single-view HUD: concentric tick rings + orange cardinal accent arcs + dotted
> ring + crosshair + diagonal corner-framing lines + corner brackets, a central
> reticle that IS UKI (colour/pulse/sweep track the live `useUkiStore` state +
> mic `audioLevel`), and a ring of REAL markers drawn from the live Nexus memory
> graph (`getNexusModel().byKind` over all kinds, recency-ranked, +UKI
> `knowledgeNodes`, deduped, cap 28). Sharp DOM chrome wired to real numbers: TL
> identity+tier (`getTierLabel`), TR "TARGET LOCATOR / N TRACKED / active-5m", BL
> warning chip (`getSecuritySummary().recentBlocksLastHour` -> "N BLOCKED" / "ALL
> CLEAR"), BR "SHIELD score / nodes mapped", plus two live SVG dial gauges
> (memory/activity). Genuinely interactable: drag-rotate the ring, hover marker ->
> tooltip, click marker -> selection read-out, click the core or the mic button ->
> `startListening`/`stopListening`, filter field dims non-matching markers, "/"
> focuses ask + Esc clears. The ask field DRIVES UKI end-to-end via a new
> `dex-uki-ask` bridge: `UkiOverlay.handleSendText` now takes an optional explicit
> query and a global listener opens the panel + runs the full reasoning pipeline.
> Kept the tested pure data layer (`nexusGraphSimulation.ts` + all
> `shared/nexus/*`) intact -- only the UI was replaced. Respects reduced-motion +
> perf-tier (dotted-ring density, RAF paused when backgrounded) + DPR. VERIFIED:
> renderer tsc clean (0 errors); live preview -> HUD renders matching the
> reference, zero console errors through full interaction, mic toggles real UKI
> state, `dex-uki-ask` opens UKI, filter input live.
>
> **DEX 5.6 -- Nexus HUD made theme-consistent (2026-06-17, follow-up).** Owner:
> "where is the blue coming from -- match DEX design." The first cut hardcoded a
> cyan/orange HUD palette (`#64D2FF` etc.) that ignored the app accent. Reworked
> Nexus to be fully DEX-token-driven: DOM chrome uses `var(--color-*)` directly,
> and the canvas reads the same tokens via `getComputedStyle` into a palette
> (refreshed on the read-out interval, so a theme/accent change re-colours the
> HUD too -- no hardcoded blues). Structure/rings/markers lead with
> `--color-accent`; the "armed" arcs use `--color-warning`; state + kind colours
> map to `--color-success`/`--color-info`/`--color-error`/`--color-text`. Marker
> colours carry a token KEY (entities) or a resolved literal (knowledge nodes,
> `var()`-aware), so entity markers live-retheme. VERIFIED: renderer tsc clean;
> live preview -> accent resolves to the app's own `rgb(59,130,246)`, HUD renders
> in the app blue (no cyan), no Nexus console errors. (Note: a separate concurrent
> "DEX Bar" rewrite of `FloatingLauncher.tsx` is mid-flight and currently throwing
> in that component -- unrelated to Nexus, left for that batch.)

## Next major phase: uki AI + intelligence everywhere (owner brief, 2026-06-09)

The owner's feature brief, translated into DEX terms and ordered by buildability.
Honest scoping: items that need heavy on-device ML or hardware DEX doesn't target
are marked stretch/N/A rather than pretended.

**1. uki AI — the biggest upgrade (the assistant DEX already has, made first-class)**
The `src/shared/uki` agent framework already exists (planner, agentLoop, memory,
embeddings, appContext, skills, confidence, citations, streaming). Deliverables:
- [x] **Persistent conversation history** — native `uki-chat:*` store in dex.db
      (multi-conversation, auto-titling, search; survives restarts — Electron's
      copilot history was in-memory only). DONE 2026-06-09 (src-tauri/src/uki_chat.rs).
- [x] **Chat-style uki app** — dedicated inner app (`DEXAPPLICATIONS/standalone/
      Uki.tsx`, registered id `uki`): conversation list + thread view + composer in
      one interface, backed by `uki-chat:*` and streaming through `providers/
      connect.ts`. Done 2026-06-09: persistent multi-conversation history, native
      cross-conversation content search (wires `uki-chat:search`), double-click
      rename (wires `uki-chat:renameConversation`), auto-grow composer, working
      Stop (AbortController threaded through `connect.ts`), live provider re-check
      on focus + unconfigured hint. Text-only today; voice capture is a follow-up.
- [~] **On-screen context awareness** — DONE (basic + first deep resolver):
      `liveContext()` (foreground/open/recent apps + time + online) folds into uki's
      prompt per send; `uki/appContextRegistry.ts` now provides the shared resolver
      registry, Notes registers a resolver (open note title + live selection), and
      the uki chat app folds `formatUkiContexts()` in. REMAINING: register resolvers
      for more apps (Files/Tasks/creative) + contextPack.
- [x] **Multi-step actions** — DONE 2026-06-09 in the uki chat: `uki/chatActions.ts`
      wires the same planner -> actionExecutor -> confirmTier pipeline the creative
      command bar uses. An imperative message ("open Notes", "summarise: …") is
      decomposed into a Plan, previewed (summarizePlan), and tier-gated: `app.open`
      is a REAL mutating action (launches via the running-apps store, confirm-gated
      with a Run/Cancel card) while `uki.*` LLM transforms auto-run. Intents are
      anchored to the message start so normal conversation isn't hijacked.
      REMAINING: more cross-app action handlers (create note, etc. — need bridges).
- [ ] **uki across apps** — the CreativeCommandBar pattern rolled out to Notes,
      Tasks, Files (mentions + slash commands exist in shared/uki).
- [x] **Intent tolerance + workflow awareness (2026-06-16)** — a shared fuzzy
      resolver (`shared/commands/resolve.ts`: OSA edit-distance + noise/verb-aware
      token coverage) now backs the one command catalog, so UKI utterance matching
      (`findByUtterance`) and terminal `dex` lookup tolerate typos ("noets"),
      partial words ("calc"), reordering ("notes open") and filler ("can you open
      notes please") while still returning null for noise. Exposed
      `suggestDexCommands` / `didYouMean` as the engine for terminal autocomplete
      (dropdown UI wiring in progress). Also closed the long-standing
      workflow-awareness gap: `ukiBridge` now pushes the active app to the main
      NLU engine via `uki.setContext` (preload -> IPC -> UkiEngine.setContext was
      fully wired, but the renderer never called it, so the engine always saw a
      null active app). Tested: tests/unit/command-resolve.test.ts +
      dexCommands.test.ts (52 green).
- Stretch: visual/object identification (needs a vision model); N/A: AirPods/CarPlay.

**2. Intelligence expansion (per-app AI affordances, all on existing uki plumbing)**
- [x] Writing assistance in Notes (rewrite/summarize/extend via promptTemplates).
      DONE 2026-06-09: uki AI group in the Notes editor toolbar (Improve, Summarise,
      Bullets, Continue) in `NotesEditor.tsx`, running `askConfiguredLLM` on the
      selection (or whole note) and inserting non-destructively. Degrades to a
      status hint when no provider key is set.
- [ ] Smart Mail-style organization -> smart grouping for Notes/Files. BLOCKED
      (2026-06-09 finding): the native `smart-grouping:*` engine (+ duplication-
      detector and the notes half of statistics-dashboard / daily-briefing) reads
      `settings.notes_data`/`tasks_data`, but NOTHING writes those keys anywhere in
      the repo — including the shipping Electron build — so the engines are dormant
      for lack of input. Real fix = a Notes/Tasks -> `notes_data`/`tasks_data` writer
      (shape `[{id,title,content,tags,createdAt}]`); needs a native settings-table
      write channel (no renderer-facing one exists). Build UI only AFTER the writer,
      else it shows perpetually-empty suggestions.
- [ ] Natural-language shortcut creation -> uki planner emits Workflows-app
      shortcuts (schedulerLogic + slashCommands exist).
- [x] Natural-language task creation in Tasks. DONE 2026-06-09: the "Add a task"
      input now routes through the native `nl-task:parse` engine, so "Email Sam
      tomorrow high priority" becomes title + due date + priority. Degrades to the
      raw title off-platform.
- [ ] Context-aware automation -> AutomationEngine triggers suggested by uki.

**3. Performance (largely DONE this cycle — see Optimization backlog below)**
Faster launches (per-app chunks), faster transfers/scans (rayon engines), faster
search (off-lock rebuild), no auto-backup stalls (VACUUM off-lock), 48MB->1KB
waveform memory. Remaining: heavy-read allowlist, creative-chunk trims.

**4. App-level upgrades (map of the brief to DEX apps)**
- Photos -> Gallery/media: faster loading via native thumbnails (real); AI object
  removal / spatial reframe = stretch (heavy ML, revisit after uki core).
- Safari -> Browser: AI tab organization via uki grouping (buildable);
  NL extension creation = stretch.
- Passwords -> Vault: credential health audit is native already; auto-update of
  changed credentials = incremental follow-up.
- Messages -> CollabHub/live-collab: smarter replies via uki once the chat app
  lands.
- Accessibility: continue the shell a11y sweep (Select/labels done; VoiceOver
  pass + keyboard nav audit next).
- Screen Time / parental / Maps / AirPods: N/A for a desktop productivity OS.

## Checkpoint 2026-11-04 (Part 16: DEX Ledger, universal pinning, smart App Menu)

- **DEX Ledger** (`DEXAPPLICATIONS/ledger/`): local-first finance app. Engine is the new Rust crate `core/dex-ledger` (own `ledger.db`, separate from dex.db): integer minor units (i64, ISO 4217 exponents), versioned migrations (`PRAGMA user_version`), every write in one SQLite transaction with an audit row, FK integrity, transfers as linked pairs (never income/expense), splits must sum exactly, reconciled rows locked behind `confirmReconciled`, envelope budget with explicit rollover rules, CSV import (delimiter/header/date-order detection, duplicate detection by import id + pre-import counts, auto backup first), CSV export (formula-injection guarded), statement matching, reconcile/undo/history, reports (income vs expenses, cash flow, spending, balances, budget vs actual), backups (VACUUM INTO, validated restore with a safety backup, export/import file), integrity check, corrupt-file recovery that keeps the damaged file. 28 Rust tests (`cd core && cargo test -p dex-ledger`).
- **One Ledger (owner decision, 2026-11-05):** #88 (Part 17) had landed a second, document-style Ledger (TS model + `ledger:load/save` over dex.db tables) under the same app id. Owner chose this native engine. #88's `ledgerModel.ts`/`ledgerStorage.ts` are removed; its `ledger.rs` is now the read-only `src-tauri/src/ledger_legacy.rs`, and setup offers **Import earlier ledger** (`ledger:legacy:probe/import` → `Ledger::import_legacy`, one transaction, only into an empty ledger, backup first). The old dex.db tables are never written or deleted.
- Shell bridge `src-tauri/src/ledger_ctl.rs`: `ledger:*` channels; only a DEX window's own webview may call them (browser child webviews refused in `dex_ipc`); every user-file read/write goes through a native dialog opened in Rust — the renderer never passes a path.
- **One pinning service**: `store/dockPinStore.ts` now holds Dock pins + App Menu pins (no permanent pins, deduped, persisted + native-mirrored); `services/appPinning.ts` is the API every surface uses. The DEX Bar shows the Dock (`components/DockPins.tsx`): pinned apps only (bar doesn't shift), running dots, drag reorder, drop-from-App-Menu to pin, Alt+←/→.
- **App registry** `services/appRegistry.ts`: window sizes (moved from AppManager) + remembered per-app window size, pin eligibility, settings targets, registered quick actions (Ledger, Notes, DexCode, Browser — each implemented via `services/appIntents.ts`; a test asserts every advertised action has a handler), local app/action search (no fuzzy guessing).
- **Smart App Menu** (`components/AppMenuPanel.tsx`): Search · Pinned · Recent · All Apps; Enter runs only the highlighted hit. **Shared app context menu** (`components/AppContextMenu.tsx`) from Dock, App Menu, DEX Bar search results, window title-bar icon and Task Manager rows: open / own window / quick actions / pin to Dock / pin to App Menu / app settings / App Information / bring to front / minimize / close window / quit — AppManager executes via `dex-app-command`.
- Open: run the NSIS installer on the owner's machine (the release exe was verified on an isolated profile); drag a Dock icon by mouse (verified by keyboard + store tests, not a real mouse drag); multi-currency is intentionally unsupported (one book currency).

## Checkpoint 2026-11-04 (Part 13: telemetry, top bar, control consolidation)

- DEX telemetry (Task Manager › Diagnostics) rebuilt: section list + detail pane like the Performance view instead of a card grid; live DEX memory/CPU history from `xenon:selfSample` with 1/5/15-minute ranges (`services/diagnostics/resourceHistory.ts`, in-memory only, sampled only while open and visible); startup phase waterfall; crash/error log table; launch p95. Chart shared in `components/telemetry/LineChart.tsx`.
- Settings › System Monitor no longer runs a second 3 s process poller; it opens Task Manager.
- Top bar: network/mic/camera/location icons show only when notable (restricted network, permission on). The controls moved to a new Control Center › Privacy section (shared `usePermissionToggle`). Battery stays out of the top bar.
- Fixed the React border shorthand/longhand bug on Task Manager's resource list and "Group by app" pill (deselected rows kept a white border).
- Earlier on this branch: fullscreen black strip (#85 work), docked DEX Bar, Weather, Trophies, launcher icons.
- Open: verify in the packaged build (preview pane was hidden: layout verified by measurement, not by eye); per-app sizing pass for remaining apps; creative/engineering app passes.

## Checkpoint 2026-11-04 (Part 12: one installer, release build)

- The release build was broken on `main` since #78 (chunk cycle via `shell/input/appKeyScope.ts`); fixed here and, in parallel, by #81 (the merge keeps #81's version, which also keeps the Browser chunk out of startup).
- One official Windows setup (NSIS); MSI and the stale Electron CI packaging removed. Built, checksummed and smoke-tested (6/6, 31 apps) on an isolated profile.
- Apps fill the full screen height; the DEX Bar floats over them.
- Open: install/upgrade test of the setup (#102), per-app workflow pass (#105), signing (#30). Evidence: `DEX_7.0.1_VERIFICATION.md` › Part 12.

## Checkpoint 2026-11-03 (Part 8: completion + stress testing)

- Data-safety fixes in Files and the native layer (`src-tauri/src/file_mutations.rs`): delete goes to the OS Recycle Bin, copy never overwrites, move/rename refuse existing names, recursive folder copy; renderer treats `{success:false}` as failure. DEX Recycle Bin restore actually rehydrates notes/Kanban cards.
- Stress-tested 3x59 windows and 100 theme switches in the preview: closed apps now unmount on every close path; AppOverview update loop fixed; perf alerts measure real things; fresh-install 0% transparency now persists.
- Open from this pass: launch latency grows with open windows (#65), theme-switch cost (#66). Evidence: `DEX_7.0.1_VERIFICATION.md` › Part 8.

## Checkpoint 2026-11-01 (Part 4: assistant)

- UKI safety layer shipped on `claude/dex-part4`: enforced processing modes (`shared/uki/assistantPolicy.ts`, checked in `orchestrator.chat()` + stream), Fast/Balanced/Deep budgets, scoped file tools (`uki/fileTools.ts`, Recycle Bin only), pause/resume/cancel, persistent audit, DPAPI key store (`src-tauri/src/secrets_ctl.rs`), Ollama installed-model discovery, system-picker screen capture.
- Palette = Part 4 table; `--color-accent-fill` for filled surfaces (AA). Radius ratchet at 0.
- Active backlog: `DEX_REMAINING_WORK.md`. Evidence: `docs/reports/`.

## Where DEX is

- **Shipping build:** Electron (v5.0.1). It remains the product until the Tauri
  build reaches parity — do not remove Electron source before then.
- **Direction:** full migration to **Tauri** for a lighter (~4 MB vs ~88 MB),
  faster app on the system WebView2. Electron is the temporary bridge.
- **Tauri shell today:** boots, serves the same renderer, ~80 namespaces are
  natively backed (24 platform + all ~57 `dex.db` SQLite subsystems), plus the
  OS command layer (dialogs, OS notifications, zlib/gzip file formats, backup
  VACUUM-INTO snapshot/restore, reminder + auto-backup scheduler threads,
  voice-memo audio save, link-preview HTTP, monitors) and a live renderer
  event bridge (`dex.on(channel, cb)` over Tauri events; reminder +
  notification-center pushes wired). Unported channels degrade to `null` so
  the UI never crashes.

## The only goal that matters now: finish the Tauri migration

Work the migration in this order (recipe + live status in
[TAURI-MIGRATION.md](TAURI-MIGRATION.md)):

1. **Remaining `dex.db` subsystems** — keep porting DatabaseManager-backed
   managers with the proven recipe (module with `ensure_schema()` + `dispatch()`,
   register in `setup()`, add a prefix arm to `db_dispatch`). Order by real usage
   via `__dexDegradeReport()`.
2. **Non-DB engines** — native file/folder dialogs (Tauri dialog plugin),
   transfer / device / pairing, audio playback sink, PTY / terminal.
3. **Big controllers** — security, workflow, agents, microservices (the long
   tail), ported by what real usage hits.
4. **Flip default + retire Electron** — once P1–P3 cover real usage: make the
   Tauri build the shipped artifact, point release at `build:tauri`, drop the
   Electron packaging, and remove the now-dead `tauriCompat` `null` fallbacks.

## Definition of done (parity)

- Every channel the renderer actually calls is natively handled (degrade report
  empty in normal use).
- `npm run build:tauri` produces a working installer that boots and runs the
  core apps with persistence intact.
- Electron packaging removed; Tauri is the single shipped artifact.

## Optimization backlog (post-migration perf/UX)

Measured findings (2026-06-09). Renderer startup was already lazy-split per inner
app, so wins are elsewhere. Done + remaining, ranked by leverage/risk:

DONE (all verified — `cd core && cargo test` + `cd src-tauri && cargo check` green):
- Renderer: split the ~370 KB `app-standalone` mega-chunk into per-standalone-app
  chunks (Calculator now ~16 KB vs 364 KB on open) + `virtual-vendor` split. (vite.config.ts)
- Scanner: parallelized SHA-256 duplicate hashing with `rayon` (was fully serial). (core/dex-scanner) — 5 tests green.
- Search index lock: `index_rebuild`/`index_search` now clone the (Arc-backed)
  `SearchIndex` out of the Mutex and DROP the lock before the multi-second walk —
  searches stay responsive during a rebuild. (`#[derive(Clone)]` on SearchIndex + main.rs)
- index_path parallel content reads: rayon the per-file reads, serial IndexWriter adds. (core/dex-search) — 4 tests green.
- DB VACUUM off-lock + restore gate: `backup:create`/auto-backup `VACUUM INTO` now
  runs on a SEPARATE connection (managed mutex no longer held during the snapshot,
  so the recurring auto-backup stall is gone); added `db::DbGate` (RwLock) — restore
  takes the write side before the file swap, snapshot takes the read side. (db.rs, main.rs, native_ops.rs)
- Waveform: two-pass streaming, 48 MB alloc -> ~1 KB, identical output. (core/dex-audio) — 4 tests green.

REMAINING (lower leverage / deferred):
- **DB heavy-read allowlist**: route the few scan-heavy read channels (global-search,
  fts, stats-dashboard, project-health, relationship-graph) onto short-lived read-only
  connections for true read concurrency. (The big stall — VACUUM — is already fixed.)
  Do NOT build a full r2d2 pool (read/write classification across 57 modules is the cost).
  EVIDENCE (2026-06-09): must be PER-METHOD, not per-prefix — e.g. global-search is pure
  read, but statistics_dashboard.rs:221/336 WRITES a results cache + usage counter inside
  its "get" path, so a read-only connection would silently swallow that write (the
  `let _ = execute` hides the error) and make stats RECOMPUTE every call — a silent perf
  regression. Only route methods verified pure-read; leave cache-on-read methods alone.
- **Renderer creative-shared chunk** + intra-app lazy-loading (vinx panels, export
  pipelines, axl/utils/export, flux 3D) to shrink app-axl(536K)/app-imosion(420K).
  MEDIUM; the creative-shared move carries eager-import risk — verify a renderer build.
- **UI/UX sharpening pass (2026-06-10, DONE)**: canonical radius scale tightened one rung
  (xs2/sm3/md4/lg6/xl8/2xl10) in design-system.css and ALL mirrors (tokens.ts, index.html
  boot CSS, VisualConsistencyLock, ThemeSystem — ThemeSystem had been overriding
  --radius-md/lg to 8/12px at runtime and VisualConsistencyLock locked xl at 12px; both
  now aligned; CleanUI.ts already matched the target scale). 2,223 hardcoded radii stepped
  down across 150 files via scripts/sharpen-radius.mjs; 73 true circles/pills (toggles,
  dots, knobs) restored via scripts/audit-radius-circles.mjs (radius >= half-box detection).
  Tailwind rounded-* now bound to the --radius-* vars. Universal button press feedback
  (scale 0.97 on :active, specificity-0 :where) added in design-tokens.css. Onboarding
  buttons converted from dead inline styles to CSS classes with hover/press/disabled
  states; onboarding card/modal radii put on canonical rungs. Per-app audit fixes:
  vinx tab accents tokenized, axl invisible borders removed + 7 close buttons unified
  (.axl-close with hover), notes folder-tree/color-swatch hover, uki delete-button hover,
  imosion track color-dot hover, forge Tools button hover. Per-app accent identities
  (prism pink, imosion green, forge cyan) deliberately KEPT — they are design, not drift.
  Verified: tsc + watermark + full build green. NEXT UI candidates: snap remaining
  off-rung radii (5/7px inherited from old off-scale values; must skip circle/pill lines),
  per-app deep passes (vinx timeline tooling, imosion mixer), hover states on remaining
  inline-styled buttons.

- **Desktop & Window System Refinement (2026-06-16, DONE)**: the live floating-window
  system (AppManager.tsx detached-window block; FloatingWindow.tsx is unused/legacy) now
  keeps window chrome PERMANENT. Previously the title bar — and thus close/minimize/restore
  — was gated behind `{!isMaximized && ...}`, so a maximized window had no reachable
  controls and the already-written drag-from-maximized restore handler was dead code. The
  gate is removed: the title bar renders in every state, the maximize control shows a
  Restore glyph + "Restore" label when maximized, and dragging a maximized window restores
  it and continues the drag in one motion. Resize-edge blue hover glow removed (visual
  stability: no resize highlight/glow). Verified live in preview: maximized Files window at
  1440x772 keeps Minimize/Restore/Close on-screen (x 1346-1428 within 1440 viewport,
  clickable); restore round-trips to 700px and the label flips back to Maximize.
  Unified Home surface: per-widget glass and per-card backgrounds removed — DraggableWidget
  (HomeWidgets.tsx) and the dashboard bento cards (CARD_BG/CARD_BORDER -> transparent/none),
  plus Home.tsx recent-files rows and ActivityCard, now sit flat on the desktop (hover-only
  hairline, soft text-shadow for legibility on mid/high tiers). Verified: 0 elements retain
  the old elevated card bg; renderer + main build green. NEXT: the fixed HomeDashboard bento
  is visually unified but not yet free-positionable like pinned files/apps/widgets — a
  larger object-model rework deferred to avoid churn.

- **Core Engine Expansion + UKI/Creative/Memory program (2026-06-16, IN PROGRESS)**:
  two large owner briefs (Runtime/C++/Rust/Xenon foundation pass; UKI cognition +
  creative-suite + memory + permissions) captured here because they exceed the
  /goal 4000-char limit. This is a multi-session program; executed in verified
  renderer slices, NOT claimed complete.
  DONE this session (all `tsc --noEmit` green):
  - Idle-cost consolidation onto SharedTick (one shared 1s tick, auto-pauses when
    hidden): theme re-check (App.tsx), notification unread poll (UnifiedSystems),
    heap telemetry (MemoryMonitor), memory:report IPC (PerformanceOptimization),
    preload-cache cleanup (InstantAppLoader). Left as raw timers by design:
    autosave (data safety), permission auto-disable / ScreenGuard / IntegrityMonitor
    (security), Thermal/PowerManager (precision/decay), clipboard (must run hidden),
    frame/FPS sampling (measurement), LockScreen (tick paused while locked),
    app-local timers (Timer/Pomodoro/WorldClock — correct as-is).
  - Reliability: React root cached + reused in main.tsx so HMR / double-eval can't
    call createRoot() twice on the same node.
  - UKI Local Memory maturity: uki/memory.ts workflows were appended UNBOUNDED with
    no dedup; now dedup-by-title (re-save updates in place + keeps usage), capped
    (MAX_WORKFLOWS=100) with recency-scored eviction (frequency field forward-ready).
    Feeds the live index_search index + MemoryInspector. (schemas.ts adds optional
    useCount/lastUsedTs.)
  - Terminal command experience (Terminal.tsx): Tab completion (dex catalog +
    history-prefix) and Ctrl+R reverse history search (inline banner + cycle).
  - Terminal multi-session tabs (NEW components/TerminalTabs.tsx): a compact tab
    strip over N independent <Terminal> instances (each keeps its own PTY +
    scrollback while hidden); + adds a session, × closes one, closing the last
    closes the panel. Base Terminal untouched; swapped into DexCode's terminal
    panel. Maps to the creative-suite brief's "Terminal Expansion: Sessions/Tabs".
  - UKI permission transparency (uki/permissions.ts): describeCapabilities() +
    ALL_CAPABILITIES (status granted/denied/hard-denied + scope/expiry + rationale),
    surfaced via a new `dex perms` terminal command (wired, not an orphan API).
  - UKI context assembly (uki/context.ts + Uki.tsx): recentFiles now folds into
    liveContext() and the system prompt, so UKI sees recent activity.
  - NATIVE (Rust, all `cargo test`/`cargo check --workspace` green — toolchain IS
    present: cargo 1.95):
    * dex-search: incremental index maintenance — upsert_file() (delete-then-add in
      one commit, opstamp-correct so re-index replaces not duplicates) + remove_path()
      + shared file_record() helper. Lets a watcher keep the index live without a
      full rebuild. 6/6 tests.
    * dex-scanner: change detection — FileStamp/Snapshot, scan_snapshot(), and
      diff_snapshots() (added/modified/removed, deterministic). `walk` refactored to
      carry mtime (no duplicate walk). This is the file-monitoring half that feeds
      dex-search's upsert/remove. 8/8 tests.
    * src-tauri: `search:sync` command (main.rs index_sync) closes the loop —
      snapshot indexed folders -> diff vs managed baseline Snapshot -> upsert
      added/modified + remove deleted; bulk-rebuild fallback on first run / >500-file
      diff so it never does thousands of per-file commits. `cargo check` green.
    * src-tauri: `start_index_watcher` — live PUSH-based fs.watch (reuses the
      existing `notify` dep + the cmd_file_watcher pattern) over the indexed dirs;
      debounces change bursts (~1.5s quiet window on a bg thread) then runs
      index_sync, so the OS tells us what changed and we update only the delta.
      Started best-effort in setup(); poll-based search:sync stays as fallback.
      So native incremental indexing is end-to-end (poll + push), `cargo check` green.
      REMAINING: a renderer trigger (call search:sync on focus) — deferred because
      it needs handlers in BOTH the Electron + Tauri shells (cross-shell migration).
    * dex-cache (NEW crate, core/dex-cache): the brief's "Cache manager into Rust" —
      a bounded LRU + per-entry-TTL cache as ONE shared primitive (replaces ad-hoc
      per-module HashMap caches). Pure std, no deps; deterministic LRU (monotonic
      access counter, not wall-clock) so it is fully test-stable. 8/8 tests; added to
      the workspace members. ADOPTED (not left orphan): dex-search now uses it as a
      query-result hot cache (query -> Vec<FileHit>, LRU 64), invalidated on every
      write (index_path/upsert/remove/clear) so a cached result can never be stale —
      it only saves repeat-query Tantivy work between mutations. 7/7 dex-search tests
      incl. a cache-invalidation test. (The SQLite-backed value caches in src-tauri
      were correctly left alone — replacing them would drop persistence.)
    * Cross-shell search:sync trigger: renderer fires a debounced (30s) `search:sync`
      on window focus + once on mount (AppManager.tsx, fire-and-forget); Electron
      main got a lightweight `search:sync` ack handler (FileSearchIndexer is already
      incremental/self-maintaining); Tauri runs the native index_sync. So the live
      index actually refreshes in use, in BOTH shells. tsc green.
    * Process manager maturity (NOT a new crate — src-tauri already lists/kills via
      sysinfo): system:getProcesses dumped ALL pids unsorted; added a pure, tested
      `rank_processes` (CPU% desc, memory tiebreaker, top-60) so the UI gets the
      resource hogs, not raw noise. 2/2 ranking tests (cargo test green). A new
      process-manager crate would have been a duplicate — avoided.
  HONEST CONSTRAINTS / NEXT:
  - The brief's "10 GB UKI memory cap" cannot live in uki/cache.ts (localStorage,
    ~5-10 MB origin quota). A true multi-GB memory store needs IndexedDB or native
    dex.db — separate track.
  - Event-listener "passive/leak sweep" is NOT a safe blanket batch: ~66 high-freq
    listeners lack `passive` but many call preventDefault (gesture/zoom) and would
    break; the 730/606 add/remove gap is mostly intentional app-lifetime singletons.
    Needs per-site surgical work, not a sweep.
  - CORRECTION: the Rust `core/` workspace IS buildable + testable here (cargo 1.95),
    so native Rust work is in-scope and verified above. Status of the brief's named
    services: cache = DONE (dex-cache); process = ALREADY EXISTS (sysinfo, matured
    with ranking); search/file-monitoring = DONE. Genuinely still missing/separate:
    a URL download manager (network/async — core logic testable, the fetch isn't),
    C++/SIMD media + napi, Xenon orchestration + dynamic scaling, thread pools, and
    UKI cognition/visual-reasoning (ML models).
  - Creative-Suite-Completion brief (owner, 2026-06-16) captured: DAW/video/design/
    CAD pro tools, Notes (tables/outline/stats), DEX Code (multi-cursor/refactor),
    gaming + app-store + asset ecosystem, UI density/consistency pass. Multi-session,
    mostly per-app renderer work; sequenced in this roadmap. STARTED with Terminal
    multi-session tabs (above). The big-app tool work (DAW razor/slice, video blade,
    etc.) is real per-app feature work, not a single sweep.

## Signature Feature Extraction (owner brief, 2026-06-20)

> Convert industry-defining capabilities into DEX-native, DEX-named signature
> features (never copies). The brief lists OS-level systems first (Workspace
> Continuity, Universal Workspace, Smart Clipboard, Session Restore, Intelligence
> Layer) plus per-suite features. Strategy: wire the existing backbone into real,
> opt-in UI rather than orphaning new modules.
>
> **CONSTRAINT discovered (do not violate):** the auto "Restore your workspace?"
> prompt was removed by owner directive — `AppManager` silently clears the
> last-session journal on boot ("DEX never nags to reopen apps"). All
> continuity/resume features must therefore be USER-INVOKED, never a boot nag.
>
> **DONE — Omni Clipboard (Smart Clipboard System, the "Universal Clipboard"
> signature).** Turned the old clipboard panel (which only captured while it was
> *open*, so history was almost always empty, and was text-only) into a real
> cross-app clipboard memory:
> - `store/clipboardStore.ts` — single source of truth (Zustand, persisted via
>   debouncedJsonStorage, key `dex-clipboard-omni`, cap 100, pinned never evicted),
>   with conservative `detectClipKind` typing: text / code (+language: ts/js/py/
>   rust/html/css/sh/json) / link / color / email / path / number. One-time
>   migration of the legacy `dex-clipboard-history` format.
> - `services/ClipboardMonitor.ts` — continuous background capture (copy/cut DOM
>   events + focus-gated SharedTick poll) that attributes each clip to the
>   foreground DEX app. Started once in `App.tsx`.
> - `components/ClipboardHistory.tsx` — rewritten to read the store: typed icons,
>   code in monospace + language tag, live color swatches, source-app + time meta,
>   type-filter chips (All/Pinned/Text/Code/Links/Colors), search over content/
>   source/language, pin-to-top, copy-without-closing, clear-unpinned. Still
>   opt-in (Ctrl+Shift+V).
> - Ecosystem wiring: `system.clipboard` command in the canonical catalog
>   (`dexCommands.ts`) → `clipboard` action in AppManager's command bus →
>   `dex-open-clipboard`; and a new `clipboard` Spotlight category (engine index
>   block + label/order/icon in SpotlightSearch) so clips are globally searchable
>   and copy on select.
> - IMAGE support DONE: the monitor captures copied images (copy-event file items)
>   as data URLs (kind `image`), the panel renders thumbnails, and copy/select
>   writes a real image blob back to the clipboard. Images are SESSION-ONLY
>   (partialize drops them) so base64 never blows the localStorage quota. Verified
>   in preview (thumbnail renders; persisted store excludes images).
> - Verified: `tsc --noEmit` 0 errors, watermark check 2110/2110, and in the live
>   preview — typing classified correctly (incl. single-line JSON→json,
>   interface→ts, arrow-fn→js), source attribution, pin-to-top, and the type
>   filter all confirmed via accessibility snapshots; no console errors.
>
> **DONE — DEX Flow (Universal Send-to / Handoff, the "Handoff → Flow Transfer"
> signature).** Generalized the creative-only `continuity:handoff` into an
> OS-wide "send anything to any app":
> - `services/FlowTransfer.ts` — `sendFlow(appId, payload)` with two tiers: a
>   RICH built-in Browser route (links open, text searches) + a `registerFlowIntake`
>   registry for apps to add their own, and a UNIVERSAL fallback (copy → open app →
>   "paste to drop it in") that works for every app today with zero per-app wiring.
>   `getFlowTargets(payload)` suggests kind-appropriate destinations (excludes the
>   origin app). Every send is announced on ContextBus `continuity:handoff`.
> - `components/FlowSendMenu.tsx` — a global opt-in "Send to…" picker opened via
>   `dex-flow-open` (with an explicit payload, or it resolves the current text
>   selection → latest clip). Mounted in App.tsx.
> - Entry points: a "Send to app" action on every Omni Clipboard clip, and a
>   `system.sendTo` command (`Ctrl+Shift+O`) → `sendto` action in AppManager's bus.
> - Verified: tsc 0; live preview — link→Browser routed the URL via
>   `dex-spotlight-navigate`, target suggestions correctly excluded the origin app,
>   the universal fallback opened the target + toasted, and the no-payload command
>   resolved the latest clip. Shell stays mounted (no error-boundary fallback).
> - Rich Notes intake DONE (`services/flowIntakes.ts`, registered at startup):
>   Send-to-Notes creates a REAL note (title = first line, body = TipTap doc) via
>   the Notes app's own store — verified in the preview (note created, success
>   toast, no error). Tasks intake intentionally SKIPPED: the Tasks app persists
>   via its own path, not `nl-task:create`, so a rich intake would write to the
>   wrong store — the universal fallback is correct for Tasks.
>
> **DONE — DEX Now / Context Engine (the "Intelligence/Memory" signature).**
> `shared/uki/contextEngine.ts` was a pure accumulator fed by nothing (orphaned).
> Now wired + surfaced:
> - `services/contextEngineWiring.ts` (`startContextEngine`, in App.tsx) feeds the
>   engine from ContextBus: project (`continuity:project`), workspace
>   (`continuity:stage`), file (`file:opened/saved`), notes/tasks activity, and a
>   recent-activity stream. Open-apps is driven by a DIRECT `useRunningApps`
>   subscription, NOT ContextBus — the bus throttles one event/channel/~frame, so
>   two rapid app opens dropped the second and left the set stale (caught + fixed
>   in preview). Exposes `window.__dexContextEngine`.
> - `components/ContextNowPanel.tsx` — a user-invoked "Now" panel (active project/
>   workspace/file + open-app chips + recent-activity timeline; live-refreshes
>   while open). Opened via `dex-open-context`; `system.context` command
>   ("now" / "what am I working on") → `context` action in AppManager's bus.
> - Verified: tsc 0; live preview — launched 3 apps via the store, all appeared in
>   open-apps; project/file/activity rendered; the throttle bug was found and fixed.
>
> **DONE (next batch):** (1) UKI loop closed — `uki/operator.formatOperatorBriefing`
> now appends a `recent:` line from the Context Engine's activity stream (the one
> thing the briefing lacked), so UKI sees what the user just *did*, not only what's
> open. (2) Creative Flow intakes (`services/flowIntakes.ts`) — sending an IMAGE to
> Prism/Flux/Forge/AXL routes through each app's existing CreativeSuiteBridge inbox
> (verified in preview: "Sent to PRISM" success + app open), so it lands as a real
> import; the Notes intake skips images (they fall through to paste). tsc 0.
>
> **DONE — DEX Learn (Education layer, "every app can teach itself").**
> `services/learnRegistry.ts` (per-app guides: overview + bullet sections;
> `registerBuiltinLearn` ships guides for Notes/DexCode/Prism/Files) +
> `components/LearnOverlay.tsx` (reads the CURRENT app's guide, or a generic one
> built from APP_DEFINITIONS + the DEX-wide shortcut tips, so EVERY app is
> teachable with zero per-app work). `system.learn` command ("learn"/"help") →
> `learn` action → `dex-open-learn`. Guides cross-reference the new Clipboard/
> Flow/Now superpowers. Verified: tsc 0, build green, preview (custom Notes guide
> + generic Calculator fallback both render).
>
> **DONE — DexCode Outline (first deep per-app feature; "precision navigation").**
> `DEXAPPLICATIONS/standalone/dexCode/symbols.ts` — a pure, tested-by-preview
> single-pass parser: DexScript `fn` functions, `class`, and TOP-LEVEL (column-0)
> `let`/`const`/`var` (top-level only, so function-body locals are excluded);
> JS `function`/`class` recognised too. Plus `lineStartOffset`. Surfaced as an
> always-on collapsible **Outline** section in the DexCode sidebar (tag + name +
> line); clicking a symbol moves the caret to that line, focuses, and centers it
> (`jumpToLine`, reusing the textarea + onScroll highlight sync). No shortcut
> conflict (Ctrl+Shift+O is now the global DEX Flow). Verified in preview: parsed
> `fn add`/`fn factorial`/`let total` from real code (locals excluded), click →
> caret jumped exactly to `fn factorial` + editor focused. tsc 0, build green.
>
> **DONE — DexCode Go to Line + Outline filter (more precision nav).** Ctrl/Cmd+G
> opens an inline go-to-line bar that reuses `jumpToLine` (verified: "5" → caret on
> `fn factorial`); the Outline gains a filter input (shown when >6 symbols) backed
> by a `filteredSymbols` memo (verified: 7 symbols → "alph" narrows to 1). tsc 0,
> build green, clean reload.
>
> **DONE — DexCode output → ecosystem (the DexCode "stronger together" signature).**
> When a run produces output, the Output pane shows Copy + Send buttons: Copy puts
> the output on the clipboard (so it lands in the Omni Clipboard), Send opens the
> DEX Flow picker pre-loaded with the output (route to Notes/Browser/Tasks/Files;
> DexCode excluded as origin). Verified in preview: Run → output → Send → Flow
> picker shows the output text + correct targets. tsc 0, build green.
>
> **DONE — DEX color ecosystem (cross-app, "stronger together").** Two flagship
> color apps now feed the Omni Clipboard so picked/copied colors are reusable +
> sendable across DEX (typed automatically as `color` clips, attributed to source):
> PRISM's eyedropper (`prism/Prism.tsx`, on pick → store.add + OS clipboard + toast)
> and the Color Picker's copy helper (`standalone/ColorPicker.tsx`). Verified in
> preview: Color Picker "Copy HEX" → `{kind:color, #3399ff, src:Colors}` in the
> store; PRISM uses the identical store.add path. tsc 0, build green.
> NOTE: **Notes app assessed as already mature** (live word/char/reading-time, TOC
> outline w/ jump, backlinks, tags, find, SendToMenu all exist) — deliberately NOT
> churned a low-value feature into it.
>
> **DONE — Calculator → ecosystem (upgrade).** Copy result now also lands in the
> Omni Clipboard (typed `number`, attributed); the old Notes-only "Send" was
> GENERALIZED to the universal DEX Flow picker (send a result to any app). Verified
> in preview: Copy → `{number, src:Calculator}` clip; Send → Flow picker opens.
> tsc 0, build green. (Pattern now applied across DexCode output, Prism, Color
> Picker, Calculator — value-producing apps feed Clipboard/Flow.)
>
> **NEXT candidates:** DEX Audio Pattern Engine (deep, audio hard to verify
> headlessly); surface IntelligenceLayer predictions (IPC → full-app verify); Omni
> Clipboard external-image capture; DexCode multi-cursor (heavier).
>
> **DONE — window-system interaction polish (v6 shell track).** Three fixes in
> `shell/FloatingWindow.tsx`, the chrome every detached app window shares.
> (1) DRAG "GHOST"/WOBBLE root-caused + fixed: the live drag position is written to
> the DOM imperatively each frame, but render still bound `left/top` from the stale
> committed `pos`, so the throttled snap-zone preview's `setPreviewZone` re-render
> snapped the window back to its drag-start position for a frame (visible wobble,
> worst near screen edges). Render now reads the live position from a ref while
> dragging, so an incidental mid-drag re-render can't clobber the imperative
> position (React 18 createRoot batches the pointer handlers, so release is jump-free
> too). (2) Title-bar controls (close/min/max) no longer initiate a drag — a plain
> press used to flip the window into its heavy "dragging" shadow and flash the snap
> preview; a target-is-`button` guard in the pointerdown handler suppresses it while
> the window-root onPointerDown still focuses the window. (3) Removed dead
> `GPU_HINTS` const (defined, referenced nowhere). Verified tsc 0.
> AUDIT (verify-first, like the P3 sweep — mostly FALSE POSITIVES, NOT churned): no
> dead/no-op buttons in the renderer; global scroll containment already correct
> (`* { overscroll-behavior: contain }` — the "40+ chaining containers" finding was
> bogus, the universal rule already covers them); `.dex-btn` per-variant state matrix
> + global `:focus-visible` ring already complete; `WindowDepthManager` z-order/
> stacking already correct. Universal `scroll-behavior: smooth` is an intentional
> premium-feel choice (team opts out per-context, e.g. timeline scrub) — left as-is.
>
> **DONE — DEX-wide refinement sweep (v6, 6 surfaces in parallel + Imosion).**
> Verify-first fixers over DISJOINT files (no shared-file edits, no git); central
> `tsc` 0 after all edits. GENUINE FIXES: (a) Spotlight search — async deep-search
> results (host files / universal search / file-intelligence / screenshots /
> conversations) were indexed but NEVER rendered: the engine refresh callback read
> `query` from a mount-time `[]`-deps closure (always ''), so its repaint guard was
> permanently false; fixed with a live `queryRef` (`shell/SpotlightSearch.tsx`).
> (b) Terminal — Ctrl+C with an active text selection sent SIGINT instead of
> copying; now copies when output text is selected (`components/Terminal.tsx`).
> (c) UKI — auto-scroll didn't follow token streaming (added streamingResponse/
> isThinking/thoughtSteps deps), no Esc-to-close (added), auto-grown textarea didn't
> collapse after send (`components/UkiOverlay.tsx`). (d) Task Manager — process rows
> rendered 6 grid children into a 5-column template, so End/Tree buttons fell out
> from under the Action header; wrapped them in one Action cell + widened the column
> (`pages/TaskManager.tsx`). (e) Clipboard — the forward-Delete key in the search
> box deleted a clip instead of editing text; now only removes a clip when forward-
> delete is a no-op on the query (`components/ClipboardHistory.tsx`). (f) Command
> Palette — selection drift: arrows/Enter/aria indexed fuzzy-score order but the
> list renders grouped-by-category, so the highlighted row and the command Enter ran
> could differ; added an `orderedCommands` flatten matching render order + id-based
> scroll-into-view (`components/CommandPalette.tsx`). (g) Notifications — a swipe-to-
> dismiss also fired the banner's click/deep-link; suppressed click after a drag
> (`shell/NotificationBanners.tsx`). (h) Imosion CRASH-LOOP root-caused + fixed:
> `navigator.mediaDevices.addEventListener('devicechange')` ran OUTSIDE the device-
> enum try/catch, so when `mediaDevices` is undefined (insecure/headless ctx, or mic
> denied) it threw synchronously on mount -> bounded error-boundary retry loop. Now
> every media access is feature-detected and degrades (input disabled, app still
> renders) (`DEXAPPLICATIONS/imosion/Imosion.tsx`). VERIFIED LIVE: launched Imosion
> in the headless preview (no mediaDevices) -> mounts + renders, no crash card.
> FALSE POSITIVES (verified solid, NOT churned): QuickControls; Calculator (l-to-r
> precedence is intentional) / Timer; Terminal split-panes/tabs (genuinely absent,
> needs multi-session PTY — reported, not faked); no standalone Dock/Screenshot/
> Reminder component files exist (dock lives in AppManager). tsc 0 across 8 files.
>
> **DONE — Multi-Mind / "many paths" initiative: verified ~already built, shipped
> the one genuine gap.** AUDIT FIRST (the initiative is mostly philosophy and the
> platform already satisfies it, so almost nothing to churn): search surfaces
> ACTIONS / settings / commands, not just files (`SpotlightEngine` result types +
> alias system); inline calc AND unit conversion already work in both Spotlight
> (`SpotlightEngine.ts:404`) and the Command Palette; UKI already answers calc,
> unit conversion, time/date, system, running-apps, and knowledge (weather/define/
> currency) queries LOCALLY before any LLM via `trySystemTool` (`UkiOverlay.tsx:973`
> -> tryMathCalculation / tryUnitConversion) plus 14 slash commands
> (`UkiSlashCommands`). So "invisible apps" + "search finds actions" are already
> DONE -- not churned. THE GENUINE GAP -- "right-click anything and ask UKI" --
> built end-to-end: the global context-menu handler (`App.tsx`, the single
> right-click authority that suppresses the native menu) now, when no component
> claimed the click and there is a text selection on non-editable content,
> dispatches `dex:ask-uki-selection`; a new self-contained
> `components/AskUkiContextMenu.tsx` renders a DEX menu there ("Ask UKI about
> '<sel>'" + Copy); choosing it dispatches a new reusable `uki:ask` event that
> `UkiOverlay` listens for (new `openPanel()` on `ukiStore`), opening UKI seeded
> with the selection and focused. `uki:ask` is a reusable inbound bridge that
> drag-drop / commands can adopt with one dispatch. VERIFIED LIVE end-to-end in the
> preview: selection -> right-click -> menu -> click -> UKI opens with the text
> seeded; tsc 0. NOTE: the first attempt (a window-level contextmenu listener) was
> DEAD because App's document-level suppressor preventDefaults every right-click
> before the window bubble phase -- caught by live testing, then re-routed through
> the global handler. Files: App.tsx, components/AskUkiContextMenu.tsx (new),
> components/UkiOverlay.tsx, store/ukiStore.ts, components/AppManager.tsx.
>
> **DONE — DEX-wide stability + consistency pass (onboarding -> apps).** STABILITY:
> two sweeps. (1) EMPIRICAL -- launched ~40 apps via the running-apps store in the
> live preview and checked each for an AppErrorBoundary crash card: ZERO crashes
> (every creative/media/system/utility app mounts clean; Imosion, the one prior
> crasher, confirmed fixed). (2) CODE-LEVEL -- swept all of DEXAPPLICATIONS for the
> Imosion bug class (env-dependent browser APIs -- mediaDevices/getUserMedia/
> AudioContext/geolocation/MIDI/WebGL/clipboard/Notification accessed unguarded at
> mount): found NONE outside the already-fixed Imosion site -- every other site is
> already behind try/catch, feature-detection, or a user-triggered handler. So the
> apps are genuinely stable; not churned. CONSISTENCY/SHARPNESS: Settings toggle
> ON-state color had drifted -- several hand-rolled toggles rendered BLUE
> (`--color-accent`) while the canonical `renderToggle` (~80% of rows) is GREEN
> (`--color-success`), and the drifted ones even had a green fallback literal under
> the blue var (proof of the drift). Unified 3 toggles to green + aligned one
> off-scale toggle geometry (44x26/r13 -> 44x24/r12, knob recentred) + one slider
> width (140 -> 120) to the shared scale (`pages/Settings.tsx`). LockScreen Unlock
> button rendered at full accent opacity while functionally disabled on an empty
> password -- its disabled visual now matches its `disabled` condition
> (`components/LockScreen.tsx`). Onboarding + the rest of LockScreen audited and
> confirmed solid (flow/gating/keyboard/focus/aria all correct) -- not churned.
> Verified: tsc 0; ~40-app live crash sweep green.
>
> **DONE — flagship creative-app internal-UI sharpness pass (parallel, 1 app per
> agent, disjoint dirs).** Each found GENUINE chrome inconsistencies (not churn):
> PRISM -- DEAD HOVER STATES: hover CSS for `.prism-tool-btn` / `.prism-icon-btn`
> / `.prism-tab` / `.prism-layer-item` existed but the class names were never
> applied to any element, so the tool palette / layers / tabs had NO hover
> feedback; wired them (guarded vs active) + added missing color-swatch aria-labels
> (`prism/Prism.tsx`). FLUX -- tool-flyout selected state rendered RED (#ff375f)
> while the app accent is PURPLE (#bf5af2); bezier curve drew a CSS var on a 2D
> canvas (silently failed) -> literal #4a9eff; blank Inspector with no layer ->
> added empty state; Morph confirm button had no disabled visual (`flux/Flux.tsx`,
> `flux/EasingCurveEditor.tsx`). AXL -- literal `×` / `°` / `³`
> escape sequences sat in RAW JSX text (JS escapes don't apply there) so users saw
> "×" instead of x / deg / cubed; -> HTML entities, matching the file's
> existing `&sup3;` convention (`axl/Axl.tsx`, `axl/PropertiesPanel.tsx`). FORGE --
> literal "arrow-right" text shown instead of an arrow glyph; default tab was
> 'queue' (no such panel) -> blank sidebar on first load, fixed to 'presets' +
> guarded the persisted-restore; segment-label casing (`forge/Forge.tsx`). VINX --
> 4 bare literal `X` close buttons -> the `DexIcon name="close"` used by the other
> ~20 (`vinx/Vinx.tsx`, `vinx/Inspector.tsx`, `vinx/ExportDialog.tsx`). Each agent
> also confirmed the bulk of its app's chrome already consistent (toolbars/panels/
> states/aria) -- not churned. FLAGGED (not faked, out of chrome scope): Forge
> subtitle Position/Style selects are dead (uncontrolled, not consumed by encode);
> VINX timeline ruler canvas uses CSS vars in ctx fill (won't resolve). Verified:
> tsc 0; all 5 edited apps re-launched in the live preview -> mount clean, no
> regressions.
>
> **DONE — productivity/utility app internal-UI sharpness pass (parallel, 1 app per
> agent, disjoint files).** ~26 genuine fixes across 8 apps; recurring theme was
> DEAD HOVER/ACTIVE STATES (CSS/transitions declared but never wired) plus a few
> real defects. NOTES -- duplicate color swatches (Orange+Yellow both mapped to
> `--color-warning`; Yellow -> #FFD60A), dead hover on New-Note/format-toolbar/AI
> buttons wired (the format toolbar's `toolbarBtnActive` style was defined but
> unused) (`notes/NotesComponents.tsx`, `notes/NotesEditor.tsx`). KANBAN -- active
> board tab was INVISIBLE (same bg token as its track) -> elevated pill; hardcoded
> #5e5ce6 accent -> `--color-accent`; dead hover on add-column/modal/add-board
> buttons wired (`standalone/KanbanApp.tsx`). DEXCODE -- literal `\$` rendered as
> text in the output empty-state -> `$`; collapsed-sidebar left a dead 220px grid
> column (workspace squashed) -> conditional grid template; Find/Terminal toggles
> had no active state; dead hover on sidebar buttons (`standalone/DexCode.tsx`).
> NEXUS -- dead hover on cradle buttons + selected chip, missing title tooltips
> (`standalone/Nexus.tsx`). MAPS -- missing no-results empty state; basemap toggle
> missing hover (`standalone/Maps.tsx`). GALLERY -- empty-state icon rendered 18px
> in an 80px circle (fontSize on a fixed-size SVG is inert) -> 40px SVG; list
> favorited heart was gray not red; selection-mode Export/Delete text clipped in a
> 28px icon-width box; lightbox prev/next had no disabled state at first/last
> (`pages/Gallery.tsx`). FILES -- DEAD PAGINATION: the load-more sentinel existed
> only in grid view but list is the DEFAULT, so folders >100 items silently capped;
> added the list sentinel + re-bind observer on view switch; removed dead code
> (`pages/Files.tsx`). BROWSER -- the bookmark-remove X was permanently invisible
> (`display:none` never overridden) -> reveal-on-hover like the tab close button
> (`pages/Browser.tsx`). FLAGGED (not faked, out of chrome scope): Browser
> Keychain/Bookmarks/Reading-Mode/tab-context-menu panels are built but have no
> trigger to OPEN them; Files column-view trailing panels need async per-column
> loads; Nexus `ctx.font` uses a CSS var (won't resolve). Verified: tsc 0; all 8
> edited apps re-launched live -> mount clean, no regressions.
>
> **DONE — small-utility + media + system app internal-UI sharpness pass (parallel,
> ~18 apps, disjoint files).** ~24 fixes. Two real defects stood out: GAMES --
> undefined utility classes (`sm:*`, `space-y-2`, `opacity-70/80`, `break-words`)
> SILENTLY NO-OP in this project's hand-authored utility layer, so game rows were
> permanently stacked (Plan/Launch fell below the title at ALL widths), had no gaps,
> dim text wasn't dim, and buttons had no padding/disabled feedback -> rewrote to
> real inline styles/tokens (`pages/Games.tsx`) [confirms the known
> utility-css-not-tailwind trap]. POWER -- sorting by Disk/Status/Threads silently
> sorted by PID (comparator missing those branches); active sort header + memory
> trend rendered EMPTY-STRING indicators (invisible); missing `°C`; 4 panels
> (startup items / scheduled tasks / app-memory / thermal) rendered BLANK with no
> empty state (`pages/Power.tsx`). Plus: NoiseGenerator both slider ends drew the
> SAME volume icon -> volume-1/volume-2; Weather bare `+`/`×` glyph buttons ->
> DexIcon (+ dead fontSize, redundant var fallback); PixelArt bare `x` delete ->
> DexIcon; Canvas + UnitConverter `disabled` controls had no disabled visual ->
> added; QRCode/ScreenRecorder/PDFViewer icon controls missing aria-label/title (+
> PDFViewer hyphen `-` -> proper minus); WorldClock missing empty state; LearnOverlay
> section bullets used the generic accent instead of the per-app accent; Store/
> StoreHome Install/Refresh disabled buttons had no feedback. Also fixed an undefined
> `--font-system` token (silently fell back to the browser default font) in 3 apps
> -> `--font-family`, matching the rest of DEX (`ScreenRecorder.tsx`, `PixelArt.tsx`,
> `PDFViewer.tsx`). Stopwatch/Pomodoro/ColorPicker/PasswordGenerator/Achievements/
> RecycleBin/Learn/LiveActivityBrowser audited + confirmed solid -- not churned.
> FLAGGED (real bug, out of UI scope): Workflows execution engine switches on
> kebab-case action ids but nodes carry catalog ids (a1..a60), so every step falls
> through to default and never runs -- needs a dedicated action-id-contract fix.
> Verified: tsc 0; all 14 edited apps re-launched live -> mount clean, no regressions.
>
> **DONE — remaining apps sharpness pass (Music/Calendar/Tasks/Git/SSH/Env/Collab);
> completes the app-by-app internal-UI sweep.** ~17 fixes, genuine again. CALENDAR --
> recurring-frequency buttons had an INVISIBLE active state: active bg `var(--accent)`
> resolves to white in the true-black theme -> white-on-white selection; inactive bg
> used undefined `--bg-tertiary` (fell back to off-palette #333); rewired to
> `--color-accent`/`--color-text-inverse` like the rest of the app; also nav arrows
> said "month" while stepping by WEEK -> view-aware labels (`standalone/Calendar.tsx`).
> COLLABHUB -- tab icons were LITERAL placeholder strings ('PRJ'/'TEAM'/'SAVE'/'LOG')
> and activity-feed icons ('!'/'OK'/'NO'/'SAVE'/'USER') rendered as clipped text in a
> 40px circle -> real inline SVGs; bespoke empty states -> shared EmptyState; removed
> dead imports (`standalone/CollabHub.tsx`). DEV TOOLS (Git/SSH/Env) -- the shared
> `glassButton` base has no `:disabled` CSS, so EVERY disabled button stayed fully
> lit with a pointer cursor; added a `disabledVisual` helper across ~15 controls in
> all 3 files. MUSIC -- error token `--color-danger` -> `--color-error`; tabular-nums
> on transport + track-list time readouts (`pages/Audio.tsx`). TASKS -- decorative
> add-row checkbox had a misleading pointer cursor (-> default + aria-hidden); dead
> `fontSize` on 2 DexIcon buttons + icon centering (`pages/Tasks.tsx`). Verified:
> tsc 0; all 7 re-launched live -> mount clean, no regressions.
>
> **UI/UX SHARPNESS SWEEP -- COVERAGE COMPLETE.** Across this program: the shell
> (window drag/controls), onboarding + lock screen, settings, search/command-palette/
> notifications/clipboard/task-manager, and the INTERNAL UI of ~43 apps (every entry
> in APP_DEFINITIONS that has a UI) have been audited + sharpened, each verified with
> `tsc` 0 and a live mount check; a ~40-app empirical crash sweep is green. Recurring
> defect classes found + fixed app-wide: dead hover/active CSS never wired; INVISIBLE
> active states (same-bg or white-on-white in true-black); LITERAL escape/placeholder
> text in JSX; undefined utility classNames + CSS var tokens silently no-op; disabled
> controls with no visual; missing empty states; icon-only controls missing aria.
> REMAINING (genuine behavior/wiring bugs, deliberately flagged not faked, each needs
> a focused task): Workflows execution action-id mismatch (steps never run); Browser
> Keychain/Bookmarks/Reading-Mode panels have no open trigger; Forge subtitle
> Position/Style selects uncontrolled + not consumed by the encoder; Files column-view
> needs async per-column loads; a few canvas `ctx.font/fillStyle` CSS-var deep-render
> spots (Nexus/VINX ruler).
>
> **DONE — behavior/wiring batch (the flagged real bugs, not cosmetics).**
> WORKFLOWS EXECUTION FIXED -- `executeWorkflow` switched on kebab action ids but
> nodes carry catalog ids `a1`..`a60` AND used wrong config keys (folder/destination/
> duration/script vs path/dest/seconds/code), so every step hit `default` and never
> ran. Rewrote the switch to the catalog ids + correct keys, executing client-side
> actions (a1/a2/a3 files list/copy/move, a11 delete, a12 rename, a6 wait, a7 run-
> script, a8 open-app, a9 condition w/ all operators, a10 loop, a35/a36 open url/file)
> through the SAME IPC channels Files.tsx already uses; server-side action types still
> route to `dex.workflows.execute`. Correctly determined the chatActions/dexCommand
> runner uses a DIFFERENT catalog (app-launch/window/nav) and would not run these
> (`pages/Workflows.tsx`). BROWSER -- Keychain / Bookmarks / Reading-Mode panels were
> built but had no open trigger; wired 3 triggers in the existing toolbar/address-bar
> pattern (Reading Mode gated on an active tab), each traced to its panel's visibility
> state; VERIFIED LIVE: clicking Keychain opens the panel (DOM grows, password content
> renders) (`pages/Browser.tsx`). FORGE -- subtitle Position/Style selects were
> uncontrolled + dropped; added state, controlled them, and threaded both into the
> same `subtitleBurnIn` settings object that carries font/size. Honest finding: burn-in
> is SIMULATED in this build (the canvas/MediaRecorder encode path reads neither
> subtitleBurnIn nor cues -- 0 drawtext/subtitles refs), so values are genuinely wired
> to where font/size go, not faked into a non-existent encoder (`forge/Forge.tsx`).
> FILES -- column (Miller) view rendered blank trailing panels because only column 0
> had data; added per-column async loading via the existing `files:list` bridge with
> per-column loading/empty states, and fixed folder clicks to push columns without
> collapsing via navigateTo (`pages/Files.tsx`). Verified: tsc 0; all 4 apps
> re-launched clean; Browser keychain trigger verified live. REMAINING (minor,
> flagged): Workflows backend-only action types need dedicated renderer IPC; Forge
> burn-in has no encode consumer yet; Files column cache isn't invalidated after
> create/delete/move/rename; canvas `ctx.font/fillStyle` CSS-var spots (Nexus/VINX).
>
> **DONE — final cleanup batch (cleared the remaining flagged items).** WORKFLOWS --
> wired 18 MORE action types to run CLIENT-SIDE by reusing existing renderer modules
> (no new IPC): Notes a4/a20/a21/a22 (useNotesStore create/append/search/export),
> a5/a25 notification+dialog (toast helper), a24 clipboard (useClipboardStore +
> navigator.clipboard), a26 play-sound (Web Audio), a28 stop (now actually halts via
> context.stopped), a29 set-var, a31 eval (charset-guarded), a32 regex, a33/a34 JSON,
> a54-a57 text transforms, a58-a60 list sort/filter/count. Native/OS (file-write/
> media/system), email, and CORS-blocked web actions stay on the backend
> `dex.workflows.execute` path -- reported, not faked (`pages/Workflows.tsx`). FORGE --
> implemented REAL subtitle burn-in in the canvas/MediaRecorder composite loop: active
> cue picked by `video.currentTime`, position (top/center/bottom), style (outline=
> stroke+fill / shadow / box), multi-line; fully gated so the no-subtitle path is
> byte-identical (`forge/Forge.tsx`). FILES -- column cache (`columnData`/
> `columnLoading`) now cleared at the top of `loadFiles`, the single funnel every
> mutation (create/delete/move/rename/paste/organize) already calls; no reload loop
> (load effect only fetches undefined+not-loading paths), column 0 (live) unaffected
> (`pages/Files.tsx`). CANVAS CSS-VARS -- Nexus `ctx.font` now resolves `--dex-font-ui`
> via the existing palette resolver (once/frame); VINX Timeline ruler resolves its
> bg/tick/label tokens via one `getComputedStyle` per draw -- both render the intended
> font/colors instead of the invalid-value fallback, unchanged when tokens are defined
> (`standalone/Nexus.tsx`, `vinx/Timeline.tsx`). Verified: tsc 0; all 5 affected apps
> re-launched clean. **ALL PREVIOUSLY-FLAGGED BEHAVIOR/WIRING/RENDER ITEMS NOW
> RESOLVED.** Only genuinely native/OS/CORS-bound workflow steps + a real ffmpeg
> subtitle encoder remain backend-dependent (honest platform limits, not defects).

> **DONE — window-drag smoothness (root cause) + search-field pill/no-highlight.**
> DRAG: app windows dragged badly on this machine because it runs perf-tier=LOW,
> and `html[data-perf-tier="low"] * { will-change: auto !important; contain: layout
> style !important }` (globals.css) OVERRODE the drag handlers' imperative
> `el.style.willChange='transform'` -- so the dragged window never got its own
> compositor layer and the live transform repainted the whole heavy window every
> frame. Both window systems (FloatingWindow + AppManager) already tag the in-flight
> window with `data-dragging`/`data-resizing`; added a tier-scoped override
> (`html[data-perf-tier="low"] [data-dragging="true"]`, etc. -- higher specificity
> than the low-tier `*` rule so it actually wins) that re-grants
> `will-change: transform` + `contain: layout style paint` ONLY during the gesture,
> released on pointer-up. "Spend GPU for the active drag, keep low-tier savings
> everywhere else." VERIFIED LIVE: tier=low, a data-dragging element now computes
> will-change:transform (was forced to auto). SEARCH FIELD: the canonical
> `DexSearchInput` (styles/components.tsx) had a heavy focus look -- white border +
> 3px white glow stacking with the inner input's global :focus-visible blue outline
> (three rings, two colors). Per owner: make every search bar a FULL PILL with NO
> highlight. Now `borderRadius: 9999`, `boxShadow: none` (no glow ever), focus only
> nudges the hairline to `--color-border-strong` (neutral, no accent), and the inner
> input's global outline is suppressed via a scoped `.dex-search-field:focus-visible
> { outline:none }` (globals.css). VERIFIED LIVE: focused field = 9999px radius,
> boxShadow none, input outline none. Propagates to all ~18 DexSearchInput call
> sites. tsc 0.
>
> **DONE — dropdowns / menus / bars / overlays: calm-consistent "pro" pass + bugs
> (parallel, 8 shared components, disjoint).** Carried the pill-search restraint
> (no glow, calm) across the shared overlay layer; ~25 fixes. SELECT/UNIFIEDDROPDOWN
> -- removed the accent GLOW RING on the Select trigger; panel radius 6->10 + item
> radius unified; loud selected-fill -> calm accent text + check; FIXED a literal
> `'check'` string rendered instead of an icon + a literal `×` -> DexIcon; added
> missing option hover + "No options" empty states; UnifiedDropdown swapped an
> invented heavy double-shadow for `--pg-shadow-popover`, removed a DEAD `itemHover`
> style, and stripped a stacked (bg + 2px outline) focus highlight to one subtle bg
> (`components/Select.tsx`, `components/UnifiedDropdown.tsx`). UICOMPONENTS --
> DexListItem selected/hover used hardcoded rgba + border-color-as-fill (invisible
> in light/HC themes) -> `--color-accent-light`/`--color-bg-hover`; radius aligned;
> same hover-token fix on SelectionToolbar (`shell/UIComponents.tsx`). QUICKCONTROLS
> -- removed warning-dot glow, popover radius 8->10, added the missing disabled
> visual on the permission toggle (`shell/QuickControls.tsx`). APPOVERVIEW -- FIXED
> a real focus bug: two `<input>`s shared one `searchRef`, so typing focused the
> hidden input and the visible filter never received keystrokes; merged to one
> input, calm accent-outline selection, added empty state + close aria
> (`shell/AppOverview.tsx`). APPSWITCHER -- selection was nearly INVISIBLE (muted
> tertiary border) -> clear 1.5px accent ring + uniform `--pg-shadow-card`; added
> role=listbox/option + aria-selected (`shell/AppSwitcher.tsx`). MINISHELL -- token
> shadow + removed status-dot glow (`shell/MiniShell.tsx`). UNIFIEDSYSTEMS --
> hardcoded accent/error rgba -> tokens (theme-correct), added notification-row
> hover, and made Esc-to-close robust for Global Search + Scratchpad (it broke once
> focus left the backdrop) (`components/UnifiedSystems.tsx`). ModalHost/Toast are
> pure shims (no visual surface) -- correctly unchanged. Verified: tsc 0; shell
> boots clean; Settings/Files/Tasks/Calendar (heavy Select/overlay users) mount
> clean. FLAGGED: DexSlider lacks ARIA slider semantics (a11y, separate task).

> **DONE — search consolidation + FloatingLauncher wiring/polish + UKI tune.**
> SEARCH: every DEX search bar is now the one canonical pill (DexSearchInput --
> full pill, muted placeholder, NO focus glow/outline). Swapped/restyled the
> custom holdouts (FloatingLauncher dock, SpotlightSearch hero, MediaBrowser x3,
> Home, SystemFeatures, Maps, EnvManager, Store, CommandPalette, UnifiedSystems;
> many others were already canonical). DOCK DOUBLE-SEARCH: removed the large
> "Search apps" inline field from the app-launcher panel (owner pick) -- the
> launcher is now a clean app grid and the dock pill (+ overlay) is the single
> search; bumped the dock pill sm->md (32px) to match the 32px bar buttons and the
> canonical size, so the dock row aligns inline. FLOATINGLAUNCHER WIRING: the
> Recent-apps buttons were DEAD -- `openRecent` dispatched `dex-open-app` with
> `{ id }` but every handler keys off `{ appId }`; rewired to call `openApp(id)`
> directly (same path as the music/calendar buttons). Made the dock search a clean
> readOnly trigger (focus/click -> universal overlay) + aria-label. Verified live:
> launcher/search/UKI-toggle/expand/now-playing/calendar/recents all functional;
> dock UKI button opens the UKI panel. UKI POLISH: send button now shows a disabled
> visual; error state given a visible accent bar + role=alert (was invisible muted-
> on-muted, off-scale radius); added calm hover to speak/collapse/close/show-
> thinking/slash-suggestion controls. Auto-scroll/Enter/Shift+Enter/Esc/uki:ask/TTS
> confirmed intact. Verified: tsc 0; shell + dock + UKI mount clean; 2-search gone
> (launcher grid shows, only the dock pill remains).

> **DONE — v6.0.4 Per-App Completion, Batch 1 (productivity apps).** Honest
> finding first: these apps were already large/functional, so this closed the REAL
> gaps and wired the REAL missing pieces rather than rebuilding finished work
> (Notes TOC-nav/split-view/font-picker and the Games launcher were already done).
> SHARED FOUNDATIONS: `shared/time/dateHelpers.ts` (one definition of overdue/due-
> soon + token colours + recurrence advance) and `shared/collections/sortFilter.ts`
> (multi-term AND search, priority rank, comparator) -- reused across Kanban/Notes/
> DexCode for identical semantics. ACHIEVEMENTS (highest-value, cross-cutting): new
> `services/achievementEngine.ts` un-mutes the unlock reward the owner had disabled
> for spamming -- it now COALESCES a burst into ONE notification (verified live: a
> 2000-note stat bump unlocked 36 at once and produced a single "36 achievements
> unlocked +1415 points" banner, not 36). Added `unlockedAt` timestamps to
> EngagementState; fixed the silent-unlock leak where Prism/Flux/Vinx/Axl discarded
> `newUnlocks` (now routed through the coalescing engine); wired the built-but-dead
> daily-challenge system into a Trophies section (Lv/XP/streak + 3 live cards) with
> stat->challenge progress + completion toasts; live grid refresh on unlock; a
> "Recently unlocked" sort; and a local "Share progress" (clipboard). Multiplayer
> leaderboard left as local-first (no backend exists -- not faked). KANBAN: controls
> strip (canonical DexSearchInput + sort by due/priority/created/title + dir toggle
> + priority filter, display-only), within-column drag-reorder with a drop indicator
> and the same-column off-by-one fix, overdue/due-soon colouring + relative labels,
> and REAL recurring tasks (a recurring card reaching Done respawns in origin with
> the due date advanced + checklist reset). NEXUS: fixed the close glitch -- added a
> close button (verified: closes the app via dex-close-app) + minimal-mode toggle +
> auto-collapse under 520px; second-Esc closes; tiered marker cap by perf tier with
> a shown/total overflow read-out; low-tier drops the sweep/framing passes. NOTES:
> indent/outdent + alignment toolbar group (native execCommand, persists like Bold);
> a per-editor word-count goal pill with session delta; and REAL cross-folder search
> -- the store's `dexnotes:search` fallback returned [] (found nothing); now a real
> title+body scan, merged into the folder-scoped list so search spans the vault.
> DEXCODE: new `dexCode/project.ts` (open a folder via the proven Forge dialog/
> readdir bridge, browse top-level source files, open on click, grep across files to
> file:line hits that open + jump). Verified: tsc 0, watermark lint 0; live runtime
> checks of Achievements engine/UI, Kanban controls, and Nexus close all pass; no
> console errors. NOTE: DexCode project-open uses the native directory dialog (absent
> in the web preview) -- verify in the packaged app. Deferred (honest): Notes folder
> breadcrumb (avoided render surgery near two TitleInput sites); DexCode goto-def
> across files. NEXT BATCH: Creative suite completion (Imosion/Vinx/Prism/Flux/Forge/
> Axl) under the same no-skip mandate (real engines via WebCodecs/WASM/WebGL/Web
> Audio, native paths flagged honestly).

> **DONE — Nexus de-chat + UKI popup drag polish (owner follow-up).** The inline
> "command cradle" in Nexus (Filter-nodes input + Ask-UKI chat field + send + mic)
> was glitchy on contact and unwanted -- removed it entirely along with its dead
> code (askUki/toggleMic/micArmed/query state + filter, the click-core-to-mic
> gesture, the "/" focus keybind, and the now-unused cradleBtn helper). Nexus is now
> a pure visualisation HUD: hovering/clicking a marker still routes it to the UKI
> assistant (the draggable popup) via dex-uki-ask -- no chat surface lives in Nexus.
> Then made the floating UKI popup (UkiOverlay) drag *better*: the drag handle is
> now just the header (clicking the response/content area no longer starts a drag),
> dragging uses pointer events (survives fast moves / leaving the window) with a
> body grabbing-cursor + selection lock, the on-screen clamp uses the panel's
> MEASURED size (the old hard-coded 380x320 mis-clamped a taller panel), the
> position persists to localStorage and re-clamps on window resize. Verified live:
> Nexus shows no ask/filter/mic/send controls and the close button still closes it;
> the UKI popup drags from its header and the live position matches the persisted
> `dex-uki-panel-pos`. tsc 0, watermark lint 0, no console errors.

> **DONE — UKI agentic upgrade (web search + control + multi-step).** The audit
> found UKI's LLM was wired (streamConfiguredLLM/askConfiguredLLM across 5
> providers) but the loop was missing: it was text-in/text-out, "web search" only
> opened a browser tab, and it could not chain actions -- plus a rich orphaned
> backbone (shared/uki/toolCall, webCache ToolBudget, freeApis). Added a provider-
> agnostic ReAct agent: new `src/renderer/uki/agentRunner.ts` gives the model a tool
> catalog + a one-line text protocol (`TOOL <name> {json}`), runs the tool, feeds
> the RESULT back, and loops -- bounded by a per-tool budget (webCache) and a step
> cap. Works across OpenAI/Anthropic/Google/Ollama/OpenRouter with NO per-provider
> tool-format wiring. REAL tools: web_search (live keyless DuckDuckGo + Wikipedia
> via freeApis), open_app/close_app (drive the shell via dex-open-app/dex-close-app),
> notify, get_context (formatUkiContexts), list_apps. Wired into UkiOverlay's
> configured-provider branch (replaces the single-shot stream); each tool call
> surfaces in the "show thinking" trace; degrades to the existing local/HF fallback
> if the provider fails. ALSO made web search keyless-real: UKI's "search for X"
> intent now returns inline DuckDuckGo+Wikipedia results instead of just bouncing to
> the browser, and fixed the query-extraction bug ("search for X" leaked "for X").
> Verified live (no provider key in the preview): web endpoints reachable (Wikipedia
> REST returned real JWST text); "search for Eiffel Tower" answered inline from
> Wikipedia; UKI pipeline intact, no console errors. NOTE: the full agentic
> tool-loop (control + multi-step) activates once a provider key is set in Settings
> -> AI Providers -- agentic reasoning inherently needs an LLM; the keyless path
> still does real web search + the existing system tools. tsc 0, watermark lint 0.

> **DONE — Batch 1 deferred items closed (no-skip pass).** Finished every item the
> earlier batches had deferred or left partial. NOTES: a folder breadcrumb above the
> title (walks selectedFolderId -> parents via parent_id, each segment jumps via
> store.selectFolder; shows only inside a folder); a "Two Columns" toolbar inserter
> -- implemented as a 1-row 2-cell table so it ROUND-TRIPS through the document model
> (a raw flex div would be dropped on save), using the exact insertHTML path as the
> working table inserter. ACHIEVEMENTS: the local self-history "leaderboard" is now a
> 14-day daily-XP sparkline + best-day in the DailyChallengesBar, sourced from the
> maintained challenge history (hidden until history accrues). DEXCODE: cross-file
> go-to-definition + find-references -- new `buildSymbolIndex(project)` in project.ts
> indexes every file's symbols by name; F12 / Ctrl+Click on the caret's identifier
> jumps to the defining file+line (cross-file, falling back to the current file's
> symbols), Shift+F12 greps the project and lists references in the Project panel.
> DEXCODE async-startup (a planned item) was intentionally NOT changed: the editor
> already uses lazy useState initializers (one sub-ms localStorage read, non-blocking)
> -- converting them to a useEffect hydrate would flash default content then swap to
> the real file, a regression, so the fast path stays. Verified: tsc 0, watermark lint
> 0 (2138 files); Notes toolbar shows Two Columns + indent + align; the Columns
> inserter uses the same (working) mechanism as Table (programmatic execCommand can't
> be driven from the harness, so verified by parity); DexCode shows the go-to-def
> hint; no NEW console errors across Notes/DexCode/Achievements/Kanban. Native-gated
> checks (DexCode project/goto-def need the OS folder dialog; breadcrumb needs a
> created folder; sparkline needs accrued history) verify in the packaged app.

> **DONE — Backlog sweep: real features across the whole app roster + Creative suite.**
> Pulled from docs/DEX-BACKLOG-smallapps.md (retired 2026-11-01; the ~522-item per-app catalog) and the
> v6.0.4 Creative initiative, building REAL working features (no stubs, no fakes) app
> by app. Small/utility/system/media/dev apps: Calculator (copy/send-to-Notes, unit-
> aware input), Unit Converter (swap + recents), Color Picker (multi-format copy +
> send swatch), QR (paste/encode-URL, PNG+SVG download, copy-image, EC level + size,
> history, Wi-Fi/vCard/geo payloads — plus a real scannable-matrix fix), World Clock
> (add-city search, reorder, 12/24h, home offset, day/night, working-hours), Weather
> (multi-location, hourly + 7-day, unit toggles, sunrise/sunset, auto-refresh+cache),
> Maps (geocode search/recents, saved places, haversine distance, drop-pin/copy-
> coords, tile styles, send-to-Notes), Noise Generator (9 real Web-Audio layers,
> mixer, presets, sleep-fade, shuffle), Pixel Art (frames+onion-skin, mirror, fill/
> replace, line/rect, PNG@scale + spritesheet), Markdown Editor (synced split, toolbar,
> outline, find/replace+regex, GFM task toggles, export/Send-to-Notes), Calendar
> (day/week/agenda, drag-create, recurrence, categories, search), Canvas (layers,
> brush/eraser, shapes, undo/redo, text, pan/zoom, export), Gallery (lightbox keys,
> slideshow, batch, sort, favorites, rename, breadcrumb), Timer/Stopwatch/Pomodoro
> (NEW shared store/timerStore.ts — wall-clock state survives switch+reload; multi-
> timers, laps export, pomodoro config+log), Tasks (NL due dates, !/#/@ tokens,
> recurrence, subtask rollup, smart lists, bulk), Env Manager (profiles, mask/reveal,
> import/export, diff, validation, .env.example), Presentation (rail reorder, themes/
> layouts, speaker notes, present mode, image/PDF export, outline import), Learn
> (progress/resume, badges, search, bookmarks→Notes, streak), Audio (queue reorder,
> loop/shuffle/speed, A-B repeat, sleep-fade, media keys), SSH (profiles, groups,
> recents, copy-cmd, ssh-config import), Recycle Bin (restore, empty-older-than,
> search, reclaimable size, bulk, sort), Task Manager (search/sort, group-by-app,
> sparklines, pin, detail, snapshot→Notes), Store (search/filter, detail, featured/
> recent, favorites+ratings), Git (history+details, ahead/behind badges, commit
> templates — skipped amend/branch-create/diff/stash where no IPC channel exists),
> Files (breadcrumb, recents, batch copy/cut/paste, view+sort, open-with, pins,
> properties), Workflows (drag steps, triggers, run history, templates, enable/
> disable, dry-run, retry/continue-on-error), Collab Hub (local presence/rooms/chat —
> honestly local-only), Live Activity (filter/range, group, pause, search, export),
> Screen Recorder (getDisplayMedia capture, mic, countdown, pause/resume, formats,
> downloads, still-shot), Settings (per-section reset; search was already present),
> Terminal (persisted history+Ctrl-R, named tabs restore, snippets, scrollback search,
> output→Notes, exit-code badges), PDF Viewer (zoom/rotate/jump, send-selection→Notes;
> thumbnails+text-search honestly flagged as pdf.js-only), Browser (bookmarks search,
> URL→Notes, per-site zoom memory, reader→Notes), Transfers (pause/resume/cancel,
> speed/ETA, retry, throughput, reorder), Power (battery+wake-lock keep-awake, power
> mode, wake log, per-app energy).
> CREATIVE SUITE (real engines, native-blocked paths flagged honestly): VINX real
> WebM export via canvas.captureStream + MediaRecorder of actual playback (ProRes/
> H.265/etc. flagged native-only, no fake completion); FLUX real sandboxed expression
> evaluator (time/value/index + wiggle/seeded-random, per-frame, degrades to static
> on error) + 12 real templates; FORGE real image transcode (PNG/JPEG/WebP via canvas)
> + real WAV PCM encoder (lossy audio + all video honestly flagged native; removed
> ~290 lines of fake simulated encode); AXL real direct-stiffness 2D truss FEA
> (engine/fea.ts — assemble K, Gaussian solve K·u=F, axial stress, von Mises, safety
> factor; hand-verified physics) replacing the stubbed ratio-coloring; PRISM real
> canvas-boolean layer ops + real merge/flatten + real diffusion inpainting (content-
> aware fill); IMOSION real built-in Web-Audio subtractive synth (synth.ts — polyphony,
> ADSR, resonant filter) routed through the existing mixer so MIDI/piano-roll makes
> sound without external plugins (VST/AU hosting flagged native). New shared sink:
> services/sendTo.ts (sendToNotes) wired app-wide, and AppManager routes uki:create-
> note / dex-send-to-notes to it. Verified: tsc 0, watermark lint 0 (2146 files) after
> every wave. Honestly native/dependency-blocked and NOT faked: true video transcode
> (ffmpeg), lossy audio encode, pdf.js thumbnails/text-search, a WebGL/Three 3D CAD
> viewport, VST/AU plugin hosting, and any feature whose IPC channel doesn't exist
> (skipped + noted per app, never invented).

> **DONE — Shared-platform primitives (ADR-0003 track) + an a11y pass.** From
> docs/DEX-BACKLOG-shared.md "First Wins". Built the genuinely-missing shared
> primitives (the existing ones — useAsyncResource, DexLoader, leakDetector — were
> NOT re-chased): `utils/useReducedMotion.ts` (prefersReducedMotion/Transparency +
> reactive hooks + motionDuration), `utils/usePersistentState.ts` (useState that
> persists+restores via safe localStorage, plus useAppUIState namespacing and
> imperative read/write/clear), `utils/useManagedTimers.ts` (leak-safe useInterval/
> useTimeout/useAnimationFrame/useEventListener — callback kept in a ref, always
> cleared on unmount, null delay pauses), and `services/toastResult.ts` (one
> standard success/error path over the dex-toast contract: reportOk/Error, toastResult,
> copyWithToast, withToast). Then an additive, behavior-preserving accessibility pass
> across ten standalone apps: aria-labels on icon-only buttons, aria-label+aria-valuetext
> on sliders, role/tabIndex/keydown on custom button-divs (ColorPicker, PixelArt, Canvas,
> QRCode, NoiseGenerator most-affected; Weather/Maps/SSH/EnvManager were already labeled),
> and a reduced-motion gate on WorldClock's analog-hand sweep via the new util. Honest
> note: agents did NOT bolt the reduced-motion util onto apps with no decorative loop
> (an unused import would not compile) — adoption of these primitives across the rest of
> the roster is the remaining (large) shared-backlog work. tsc 0, watermark lint 0 (2150).

> **DONE — Stability/Performance primitive gaps (shared backlog).** Honest finding:
> MOST of this track already exists in-codebase and was NOT re-chased — error boundaries
> (`services/ErrorBoundary.tsx`, `AppWrapper`, `RewindViewErrorBoundary`), Zustand
> debounced/quota-pruning persistence (`utils/debouncedStorage.ts` = Perf #25), plus
> leakDetector, cacheExpiry, useAsyncResource, TierManager, debounce/throttle, useVirtualList.
> The genuine gaps were the general-purpose (non-Zustand) helpers apps hand-roll everywhere,
> now built: `utils/safeJson.ts` (safeJsonParse with optional shape validator + safeJsonStringify),
> `utils/safeStorage.ts` (canonical safe get/set/getJSON/setJSON with quota-prune-and-retry +
> per-app `namespaced()` prefixing), and `utils/migrateState.ts` (versioned `__v` step-migration
> of persisted blobs + `loadMigrated` that rewrites the upgraded form). tsc 0, watermark lint 0
> (2153). Remaining shared-backlog work is now overwhelmingly ADOPTION of existing+new primitives
> across the roster, plus the Design/Accessibility/Platform/Future categories and the separate
> 200-patch initiative.

> **DONE — 200-patch initiative: roster-wide leak-safety + a11y + robustness pass.** Three
> verified waves of parallel per-file agents (disjoint sets, `npm run lint` green after each)
> across ~40 app/page/component files. REAL bugs fixed (not just polish): Imosion (collab
> BroadcastChannel + sounding MIDI voices leaked on unmount), Prism (canvas-drag rAF never
> cancelled), Forge (AudioContext leaked on decode error), Browser (webview listeners never
> detached), Weather (a fresh AbortController per 15-min tick, never aborted), Maps (stale
> one-shot styledata listener), SSH/EnvManager/Settings/Rewind (flash/scroll setTimeouts firing
> after unmount), Power (memory-cleanup double-fire), DexNotes (resizer rAF + drag listeners
> leaked mid-drag). Plus, app-wide: aria-labels on icon-only buttons, labels on inputs/sliders
> (aria-valuetext), role/tabIndex/Enter-Space on custom button-divs, overflow clamping
> (ellipsis + minWidth:0) on titles/rows that could blow out layout, async-button disable-while-
> in-flight to stop double-fire, and null-guards on handlers that could throw. Many files were
> already clean and honestly left untouched. tsc 0, watermark lint 0 (2153) after every wave.

> **DONE — Per-app feature DEEPENING (more catalog items).** Three more verified waves
> pulling deeper from DEX-BACKLOG-smallapps.md. Tasks: blocked-by dependencies + warning
> badge, snooze (tomorrow/next-week/date), estimate-vs-actual time tally, j/k/x/e keyboard
> triage, quick filter chips. Files: disk-usage breakdown, duplicate finder, copy-path/relative,
> show-hidden, properties. Clipboard: snippet library, transform actions (upper/trim/slugify),
> merge clips, source labels, send-to. Calculator: scientific panel, programmer mode (hex/bin/oct),
> date math, constants, angle mode. Calendar: ICS export (event + range), agenda view, working-
> hours overlay + weekend dim, duplicate + quick-reschedule, category visibility round-tripped
> through ICS. Gallery, Browser, Weather: deeper media/browse/forecast features. PixelArt:
> tile-preview seamlessness, palette lock with nearest-color snap, image import + downscale.
> DexCode, MarkdownEditor, Maps: more dev/editor/map depth. Design/A11y focus rings confirmed
> ALREADY global in globals.css (not re-chased). tsc 0, watermark lint 0 (2153) after each wave.
> Honest remainder: the "Future" backlog (marketplace, cross-device sync, real-time multiplayer,
> offline-first conflict resolution) is roadmap-scale architecture, not single-pass — flagged, not
> faked.

> **DONE — Deepening wave 4.** Notes: inline #tag filter chips, per-note color labels (list dot +
> border), New-from-template (Meeting/Standup/Retro/Blank). Terminal: deeper session/snippet/
> broadcast features. Store: detail/changelog/update-all depth. Settings: export/import profile +
> per-section reset depth. tsc 0, watermark lint 0 (2153). The achievable per-app catalog is now
> deeply covered roster-wide; the genuinely-remaining work is the roadmap-scale "Future" track.

> **DONE — Future track, the tractable (local-first) items.** Three NEW real apps, built
> self-contained then registered through the proven 5-touchpoint path (lazy import + AppId union
> + APP_COMPONENTS map + LAUNCHPAD_APPS + APP_DEFINITIONS in runningApps.ts): **Spaces**
> (`WorkspaceSpaces.tsx`, Future #2/#27 — snapshot the running apps + active Project Stage into a
> named space, restore by re-opening them; rename/delete; persisted), **Inbox** (`SmartInbox.tsx`,
> Future #32 — aggregates the notification hub `notification-center:getAll` + live `dex-notification`
> events + ContextBus activity, grouped, click-through via dex-open-app, degrades to live-only when
> the native hub is absent), and **Project** (`ProjectDashboard.tsx`, Future #8 — active Stage
> header, task/notes/activity stat cards read from existing persistence, ContextBus recent-activity
> feed, quick links). tsc 0, watermark lint 0 (2156). HONESTLY NOT BUILT (would require a backend /
> are multi-week, so flagged not faked): app marketplace w/ third-party review (#1), cross-device
> sync (#3) + handoff (#26), real-time multiplayer / live co-editing (#6/#17), offline-first +
> E2E-encrypted sync (#9/#10), pluggable cloud storage backends (#33), bundled local offline-AI
> model (#34). These need a server/CRDT-transport/native-model that doesn't exist in a renderer-only
> build; their local-first foundations (crdt.ts, dataExport, keystore, projectSpaces) are present to
> build on when that backend lands.

> **DONE — Future track local-first CORES (was "blocked", now real).** Pushed past the earlier
> "needs a backend" framing by building the genuinely-achievable renderer cores, no fakes:
> **Live collaboration** — `services/collabSession.ts` (BroadcastChannel transport + `shared/collab/crdt.ts`
> LWW merge): real live presence, shared synced state, and chat across windows of the same device;
> CollabHub wired to use it (labeled "Live (this device)"). **Encrypted backup + offline sync + E2E** —
> `services/backupSync.ts` + `BackupSync.tsx` app: real AES-GCM-256 via `shared/cloud/encryption`
> (PBKDF2 600k), conflict-resolved merge/replace restore via `shared/cloud/conflictResolver`, and
> folder-based offline sync. **Local extension framework / marketplace groundwork** —
> `services/pluginHost.ts` + `ExtensionsManager.tsx` app: real manifest validate (`shared/plugin/manifest`),
> install/enable/disable/remove lifecycle, capability→permission gating via `permissionStore`, sandboxed
> `shared/plugin/eventBus` access, 3 working built-in example extensions. **Local AI** was already covered
> (Ollama in the provider router). Two new apps registered (backup, extensions). tsc 0, watermark lint 0
> (2161). The ONLY genuinely-remaining piece is the hosted network layer — a sync/relay server + a public
> marketplace registry — which can't exist in a renderer-only repo; the local-first foundations above are
> ready for it (see docs/NEXT-STAGE.md (retired 2026-11-01; open items moved to `DEX_REMAINING_WORK.md`)).

> **DONE — "Agentic DEX: AI everywhere" (AI track).** UKI now knows what the user is looking at
> across the app and can be asked about any selection. (1) Extended the UKI app-context registry
> (`registerUkiAppContext`) from 6 apps to 21: added Kanban, Calendar, MarkdownEditor, Browser, Audio,
> Weather, Maps, Calculator, UnitConverter, Learn, EnvManager, WorldClock, Workflows, GitClient,
> PresentationBuilder — each registers once (live state via a ref) and unregisters on unmount, exposing
> meaningful per-app context (board/card, selected date+events, file+word-count, tab+URL, now-playing,
> location+temp, centered place, expression+result, course+progress, profile+keys, cities, workflow+steps,
> repo+branch+staged, deck+slide). (2) New `components/AskUkiSelection.tsx` mounted in the shell: selecting
> text in ANY surface shows a floating "Ask UKI" chip (or Ctrl/Cmd+Shift+U) that routes the selection to the
> agent loop via `dex-uki-ask` — no per-app wiring. Builds on the provider-agnostic ReAct agent (web search +
> app control) shipped earlier. tsc 0, watermark lint 0 (2162).

## Imosion: pro-DAW overhaul (Logic Pro + FL Studio standard)

Goal: bring Imosion to professional standard and beyond, learning from Logic Pro and FL Studio.
Priority order: Imosion UI/UX + missing creative features FIRST, then Games, Task Manager,
Achievements (Apple-inspired). Only add what is genuinely missing; do not rebuild what exists.

> **DONE — Imosion fast open/close + pro UI pass.** (1) Speed: removed the on-mount
> `getUserMedia({audio:true})` mic activation (it prompted + blocked first paint on every launch);
> device enumeration and `requestMIDIAccess` now run on `requestIdleCallback` so opening/closing is
> instant. Mic permission is requested lazily by `startRecording`. (2) Piano roll: realistic
> white/black keyboard column (52px -> 90px) with octave labels, scale/root ticks and live note
> highlight; configurable row height (14px -> 22px default) with a vertical key-zoom control (12-40).
> (3) Mixer: channel strips 108px -> 132px, real fader cap + 0 dB line + dB scale, larger pan knob,
> bigger M/S/R; bus/master strips 94px -> 116px; sidechain overlay geometry updated. (4) Panels:
> plugin panel 260 -> 340 (min 280, max 540), track panel 200 -> 224 (min 180, max 420). tsc 0.

> **DONE — Imosion piano-roll creative tools (FL/Logic-inspired, net-new).** Added Note Color
> (per-note color tag + palette + colored rendering), Quick Legato, Strum up/down, Flam, Humanize,
> Arpeggiate (chord -> run), and Typing-Keyboard-to-Piano (A-K play the preview synth, Z/X octave).
> All operate on the selection or the whole part. New "TOOLS" row in the piano roll. tsc 0, verified
> in preview (tools render, color applies, no console errors).

> **DONE — Imosion workflow batch 2 (FL/Logic gap fill).** Shipped: Stamp tool (drops a diatonic
> triad in the current key/scale on click — new 'stamp' piano-roll tool); Smart Controls / Macros
> (one knob drives many plugin params via 0..1 -> min..max mapping, with a Track->Plugin->Param
> assign form); searchable Plugin Picker (live filter in the FX browser); Freeze / Bounce-in-Place
> (wires `frozenTracks` — bypasses the FX chain in the live graph, FROZEN badge + context toggle);
> Channel-Strip Presets (save/recall a track's volume+pan+full chain, localStorage-persisted);
> Track / Project Alternatives (named whole-session snapshots: tracks/buses/MIDI/tempo/master,
> capture+restore); Event List editor (table of all MIDI notes, edit start/length/velocity, delete);
> Tap Tempo (manual Smart Tempo next to BPM); Clone/Duplicate Track (context menu). New WORKFLOW
> section in the Tools menu. Step sequencer already existed (beatmaker view). tsc 0; verified in
> preview (menu items, stamp tool, Event List modal, Note Color all render; no console errors).

> **DONE — Tooltip purge + Beats actually plays.** (1) Removed ALL HTML `title=` tooltips from the
> creative apps (179 across imosion/prism/forge/vinx/flux/axl) via a careful attribute-stripper that
> leaves `aria-label` for a11y and skips SVG `<title>` + object keys; fixed the one over-removal
> (vinx EmptyState `title` is visible text). Pro controls speak for themselves now. (2) Fixed a real
> Beats bug: the sequencer was SILENT (it only moved the playhead). Extracted a shared
> `triggerDrumPad(pad, velocity, index)` and wired it into the rAF tick via a live `beatSeqRef`
> snapshot (no stale closures / no playback restarts) so active cells now sound. (3) Per-lane
> Mute/Solo (FL channel-rack style) in the Beats lane column, honored by the trigger; clicking a lane
> name previews its sound. tsc 0; verified in preview (16 M/S lanes render, Play/Stop runs, no errors).

> **DONE — Playback power cut (30fps state throttle).** The "Smooth Playback" rAF called
> `setCurrentTime` EVERY frame (~60fps), re-rendering the whole 9.7k-line component 60x/sec during
> playback — the main power drain. `currentTimeRef` still updates every frame (audio stays
> sample-accurate); the React state update is throttled to ~30fps (`STATE_UPDATE_INTERVAL` 16->33),
> halving playback re-renders with no visible scrubber change. Verified: Imosion mounts + playback
> advances. The full per-view split was NOT attempted — the repo is mid-edit elsewhere (unrelated tsc
> errors: ProjectDashboard `SCOPED_CSS`, QRCodeGenerator `QR_SCOPED_CSS`; and a parallel pass is
> retheming the Imosion Knob/EQ to muted analog colors), so a 140-line structural move would collide.
> Next when the tree is stable: DOM-driven playhead (decouple playhead motion from React) + per-view memo.

> **DONE — DOM-driven playhead (15fps state, 60fps playhead).** Both playheads (arrange + piano
> roll) now carry refs (`arrangePlayheadRef`/`pianoPlayheadRef`); the playback rAF writes their
> `left` straight to the DOM every frame using value mirrors (`phZoomRef`/`phBpmRef`/`phPrZoomRef`,
> since the rAF effect deps can't include them). With the playhead decoupled from React, the time
> state now updates at ~15fps (`STATE_UPDATE_INTERVAL` 33->66) — quarters full-component re-renders
> vs the original 60fps, big power win, playhead stays buttery. tsc 0 (Imosion clean). IMPORTANT
> VERIFICATION FINDING: the offscreen preview PAUSES requestAnimationFrame (a 500ms rAF probe never
> completed -> 30s timeout), so playback clock / playhead / meters / beat animation CANNOT be observed
> there — they only run in a focused real app window. Verify rAF features by tsc + code review, not
> the preview.

> **DONE — Piano-roll note dragging (move + resize + marquee).** Core DAW interaction that was
> entirely DEAD: `pianoRollDrag` was set by the resize handle but NEVER consumed, so notes couldn't be
> moved OR resized. Wired three mouse-event handlers (no rAF, so verifiable): `startNoteMove` (drag the
> selection by snapped beats + semitones, group-aware, 3px threshold, alt=toggle slide, shift=add to
> selection), `startNoteResize` (drag the right edge to set duration, snapped), `startMarquee`
> (rubber-band box-select from empty grid space, shift=additive) with a live marquee rectangle. The
> dead `pianoRollDrag` state was removed. tsc 0; VERIFIED in preview with synthetic mouse events — a
> note dragged exactly +2 beats (0->128px) and +2 semitones (506->462px), correctly snapped.

> **DONE — Piano-roll editing keys + double-click delete.** Added a piano-roll keydown handler
> (active only when the roll is visible, ignores text fields): Copy (Ctrl/Cmd+C), Cut (X), Paste (V,
> at the snapped playhead, clipboard normalized to t=0 in `prClipboardRef`), Duplicate (D, +1 bar),
> Select-All (A), and Delete/Backspace to remove the selection. Notes also double-click-to-delete.
> The velocity-lane drag already existed (kept). tsc 0; VERIFIED in preview: copy/paste 11->22 notes,
> double-click 22->21, select-all + Delete -> 0, no console errors. (Preview note: this server had to
> be restarted via preview_start `npm run dev:renderer` on :5180 — the harness server kept dropping.)

> **DONE — Piano-roll zoom (Ctrl+wheel) + right-click context menu.** (1) Ctrl/Cmd+wheel zooms the
> roll horizontally (`pianoRollZoom` 24..220), Ctrl+Shift+wheel zooms key height — zoom-toward-cursor
> behavior FL/Logic users expect, on top of the existing toolbar +/- buttons. (2) Right-click anywhere
> in the roll opens a context menu (Copy/Paste/Duplicate/Delete/Select-All/Quantize/Humanize/Legato +
> note-colour swatches); right-clicking a note selects it first so the action targets it. Extracted
> the edit ops into reusable callbacks (`prCopy`/`prPaste`/`prDuplicate`/`prDeleteSelected`/
> `prSelectAll`) now shared by BOTH the keyboard shortcuts and the menu (no duplicated logic). tsc 0;
> VERIFIED in preview: Ctrl+wheel grew a note 32->39px, menu renders with all actions, menu Duplicate
> 14->15 notes.

> **DONE — Piano-roll nudge + glue + chop.** Arrow keys nudge the selection (Left/Right = +/- snap in
> time, Up/Down = +/- semitone, Shift+Up/Down = octave). `prGlue` merges selected same-pitch notes
> into one spanning note; `prChop` splits each selected note into snap-grid pieces (FL Glue/Chop). Both
> added to the right-click menu; all three are reusable callbacks. tsc 0; VERIFIED in preview: arrow
> nudge moved a note +32px and -1 semitone, menu Chop split 11->24 notes, menu shows Glue+Chop. Page
> churn during verification traced to a concurrent UkiOverlay.tsx HMR failure (not Imosion, not mine).

> **DONE — Piano-roll Reverse + Invert (FL Flip H/V).** `prReverse` mirrors note timing within the
> target span; `prInvert` mirrors pitches around the selection's lo/hi center. Both operate on the
> selection (or the whole part if nothing selected) and are in the right-click menu. tsc 0. Live
> click-verification was blocked by the dev server dying (concurrent UkiOverlay/LockScreen HMR
> failures keep crashing it), but they're trivial pure transforms wired into the SAME menu mechanism
> already verified this session (Chop 11->24, Duplicate 14->15 clicked through it).

> **DONE — Piano-roll per-note Mute (FL).** `MidiNote.muted` + `prMuteToggle` (right-click "Mute /
> Unmute" and the `M` key) toggle mute on the selection. Muted notes render dashed + 35% opacity and
> are skipped in all 3 playback/export scheduling loops. tsc 0. (Couldn't live-verify: both dev-server
> ports were held by a concurrent chat's servers; same menu/keyboard patterns verified earlier.)

> **STATUS — Imosion piano roll is now FL/Logic-complete.** Editing toolkit shipped across this
> session: draw/select/erase/stamp tools, marquee box-select, drag-move, edge-resize, copy/cut/paste/
> duplicate, delete + double-click-delete, arrow-nudge (time+pitch+octave), glue, chop, reverse,
> invert, quantize, humanize, legato, strum up/down, flam, arpeggiate, slide/glide, note colors,
> scale highlight, typing-keyboard input, Ctrl+wheel zoom (H + key height), right-click context menu,
> velocity lane. Arrange + piano-roll right-click menus both complete. Remaining FL/Logic items are
> the big Channel-Rack rebuild and ML/DSP-blocked features (Drummer/Session Players, Flex Time,
> Audio-to-MIDI, Stem Separation, Dolby Atmos) — NOT started (correctly deferred, not faked).

> **DONE — Solid menus + Piano Roll horizontal zoom/slide.** (1) Imosion dropdowns (File/Tools/
> Panels) were translucent (`--color-bg-elevated` glass token) — made SOLID `#16161b` so menus aren't
> see-through. (2) The piano roll was reusing the arrange `zoom` (=40 -> 2400px/beat, the "washed-up"
> feel); gave it its OWN `pianoRollZoom` (px/beat, default 64, 24..220) with horizontal Zoom in/out
> buttons next to the existing vertical key-zoom; bar grid-lines + playhead boldened for clarity.
> (3) `Slide` tool added to the piano-roll TOOLS row (`toggleSlideSelected` toggles portamento on the
> selection). Velocity lane + Note Color already present. tsc 0; verified in preview (solid menu bg
> rgb(22,22,27); H-zoom, V-zoom, Slide, velocity all render). Unrelated: a LockScreen.tsx HMR error
> exists in the shell (caught by AppErrorBoundary) — not from Imosion, left for its owner.

> **DONE — Toned-down TOOLS colors + hardware Beat Maker.** (1) The piano-roll TOOLS color
> swatches were full-saturation 16px squares ("too loud") — now muted 11px dots at 0.6 opacity that
> brighten on hover. (2) Beat Maker restyled into a real hardware step sequencer: recessed slot cells
> that light like LEDs when active (lane colour + glow, brighter on the playhead), steps grouped in
> 4s with gaps, downbeats tinted, whole row dims when muted/soloed-out (`BEAT_PAD_COLORS` hoisted to
> module scope). Live pads are now MPC-style rubber pads (raised gradient + bevel, press = inset +
> glow + scale). tsc 0; verified in preview (16 lanes + pads render, no runtime errors). Lag: the
> remaining felt cost is the playhead tick re-rendering the whole component — fixed properly only by
> the per-view split (still the honest next task; not rushed mid-rebuild).
> **DONE — Imosion pro rebuild (audio-engineer pass, against the Acon Remix reference).**
> Built 3 reusable pro components under `imosion/components/`: `Knob` (270deg rotary, drag/shift-fine/
> dbl-reset/wheel, bipolar arc), `Fader` (real grab-the-cap vertical fader, dB ticks, unity line,
> optional meter — replaces the deprecated `WebkitAppearance: slider-vertical`), and `ParametricEQ`
> (interactive frequency-response curve with draggable low-shelf/mid-bell/high-shelf nodes wired to
> the eq plugin's real params). Rebuilt the mixer: the inline per-track strip is now a **memoized
> `MixerChannel`** (this kills the lag — editing one channel no longer re-renders all of them), with
> the new Fader + Pan Knob, cleaner layout, and **drag-to-reorder FX chain**. The right-panel plugin
> editor now shows **real rotary knobs** for every param + the **Pro EQ curve** for eq plugins.
> Sidechain router actually wires now: the Sidechain panel's "Apply Routing" finds/creates the
> target's compressor and sets its `sidechainSource` + params (was previously orphaned state). Tools
> menu is now **multi-column** (`.frosted-dropdown.cols`) so the long list isn't an endless scroll.
> tsc 0; mixer + components verified in preview (faders, knobs, no Imosion console errors).

> **DONE — Imosion lag + live meters pass.** (1) Lag: `Knob` and `Fader` coalesce drag updates to
> one per animation frame (a fast drag was firing 120+ state updates/sec, each re-running the
> 9000-line render). (2) Live meters: one shared rAF taps each track's post-fader gain node with a
> non-destructive `AnalyserNode` and writes the level straight into the meter DOM via
> `data-imosion-meter` (no React state -> zero re-render), only while the mixer is on screen — the
> reference's signature green meters, done performantly. (3) Taller faders (168px) + boxed dB
> readouts. NOTE: Imosion is too big for Vite fast-refresh, so edits need a window refresh to show;
> the deeper lag fix (split Imosion into per-view components so only the active view re-renders) is
> the next item. tsc 0; verified in preview (channels render faders/knobs/meters, no runtime errors).

### Imosion remaining backlog (gap analysis vs FL/Logic)

Renderer-feasible but larger (future batches):
- Ghost notes (faint notes from other parts) — needs a multi-part note model first
- Live Loops grid (cell launcher) + Performance Mode
- Take comping / Quick-Swipe over the existing Comp Lanes
- Detached/floating plugin windows; Visual Mixer (node view); Frequency Splitter (multiband routing)
- Full automation graph point editing; MIDI Transform sets; multi-output instrument routing
- Per-track latency compensation (reporting/PDC)

Out of renderer scope (ML / native): Audio-to-MIDI, Stem Separation, AI Drummer & Session Players,
Dolby Atmos / spatial, true Flex Time engine, hardware MIDI scripting, native plugin sandboxing.
These need DSP/ML or native hosting we don't fake.

> **DONE — native Smart Tempo (beat/tempo/onset) engine.** `core/dex-audio` gained
> `analyze_beats`/`analyze_pcm` (`BeatOptions`/`BeatAnalysis`): a real DSP port of `beatDetect.ts`
> (RMS onset-flux envelope → autocorrelation for BPM + peak-pick for onsets) that runs over the
> symphonia-decoded signal, so the heavy path is native instead of decoding the whole clip in JS. It
> adds an **octave correction** the JS path lacks (autocorrelation peaks at every multiple of the true
> period, so naive argmax reports half/third tempo). Wired through `dex_ipc`
> (`audio:analyzeBeats` / `audio:detectTempo`) and consumed via the new
> `services/media/analyzeBeats.ts` smart wrapper (native for real file paths, Web-Audio + TS engine
> for blob URLs). Imosion's tempo/beat op now goes through it. 4 new cargo tests (click-track BPM
> recovery, silence/empty guards, half/double-tempo band, WAV decode path) — `cd core && cargo test`
> green.

> **DONE — native key detection + silence/loudness + unified search index (the raw-core batch).**
> (1) **Key/scale detection** in `dex-audio`: `detect_key`/`detect_key_pcm` — a 12-bin chromagram via
> per-frame **Goertzel** (no FFT crate) + **Krumhansl-Schmuckler** profile correlation. (2)
> **Silence + loudness** in `dex-audio`: `analyze_silence`/`plan_silence_removal` (native port of
> silenceDetect.ts) and `analyze_loudness` — a genuine **BS.1770 integrated-LUFS** meter (per-fs
> K-weighting biquads + 400 ms/75%-overlap block gating) plus sample peak. (3) **Unified index** in
> `dex-search`: added `source`+`docid` fields and `upsert_doc`/`remove_doc`, so files, notes and
> clipboard share ONE index (schema-mismatch auto-rebuilds the old cache). Wired through `dex_ipc`
> (`audio:detectKey`, `audio:analyzeSilence`, `audio:loudness`, `search:upsertDoc`/`removeDoc`) and
> the renderer: Imosion's detectTempoKey now reports native key too; **notes fold into the index on
> save/delete** (notesStore → `search:upsertDoc`/`removeDoc`). +12 cargo tests. `cd core && cargo
> test` green (dex-audio 16, dex-search 9); `cd src-tauri && cargo check` exit 0; `tsc` exit 0.

> **DONE — engine consumers wired (clipboard index + Quick Look inspector).** (1) **Clipboard folds
> into the unified index**: clipboardStore `add` → `search:upsertDoc('clip:…','clipboard',…)`, and
> `remove`/`clearUnpinned`/`clearAll`/cap-eviction → `search:removeDoc` (text clips only; images
> skipped). Global search now spans files + notes + clipboard. (2) **Quick Look audio inspector**:
> `shell/QuickLook.tsx` audio preview now shows a native analysis strip — Tempo (native for paths,
> Web-Audio engine for URLs), Key + Loudness (LUFS) + Peak (native-only, shown only for real file
> paths, never faked for web URLs). Gives the key/loudness engines a real UI consumer. `tsc`
> exit 0 (renderer-only; no Rust change).

> **DONE — silence engine consumer + full 100% sweep.** Added `analyzeSilence` to the media wrapper
> (native for file paths, TS `silenceDetect` fallback for blob/URL) and surfaced it in the Quick Look
> audio inspector as a "Silence" metric (trimmable seconds · gap count). ALL FOUR audio engines —
> tempo, key, loudness, silence — now have real UI consumers; files+notes+clipboard share ONE search
> index. Honest scope: native **video** scene-cut/keyframe detection is NOT done — it needs a
> video-decoder crate (same out-of-scope constraint as bundling ffmpeg); not faked. Full verification:
> `cd core && cargo test` = **93 passed / 0 failed**; `cd src-tauri && cargo check` exit 0; `tsc` exit 0.

### Creative apps — pro-controls pass (applying Imosion's bar to the rest, one by one)
> **DONE — Prism + global creative sliders.** (1) Prism `AdjustmentControls` native `<input
> type=range>` replaced with a Lightroom-style draggable slider: recessed track, accent fill from the
> natural origin (centre for bipolar params like Brightness/Contrast/Hue, left otherwise), metal
> thumb, scroll-to-nudge, double-click reset (sensible `def` per param). (2) Global CSS in
> design-system.css upgrades EVERY native slider under `.dex-creative-panel`/`-strong` (Vinx/Prism/
> Forge) to a console look (recessed track + bevelled metal cap), webkit + moz. tsc 0; CSS-only for
> the global rule. Couldn't live-verify (concurrent chat holds both dev ports).
> **DONE — Pro sliders now cover ALL creative apps.** Forge + Vinx native sliders already sit under
> `.dex-creative-panel(-strong)` so the global console-slider rule covers them. Flux didn't use that
> class, so added `className="flux-root"` to its root + extended the CSS selector — every Flux slider
> (20+ across its floating panels) now renders as a console control too. tsc 0. Imosion, Prism, Vinx,
> Forge, Flux all share the hardware-slider look.
> **DONE — Vinx clip menu Split/Duplicate + Flux keyframe right-click delete.** Vinx clip context
> menu gained "Split at Playhead" (reuses the proven Ctrl+K split: clone L/R with adjusted media
> in/out) and "Duplicate" (clone placed right after, via `getClipById` + `_addClip`). Flux timeline
> keyframes restructured to keep their animation index so right-click deletes that exact keyframe
> (`setLayers` filter). tsc 0. (Not live-verified — concurrent chat holds the dev ports; both follow
> patterns already verified this session.)
> **VERIFIED LIVE (port 5199).** Fixed the preview block: project Vite is pinned to 5173/strict, so
> added a `dex-auto` launch config on an explicit free port (5199). On that server, all creative apps
> mount clean with NO console errors and NO error boundary: Prism (console slider computed 5px +
> gradient), Vinx, Forge, Flux (`.flux-root` present + slider console-style applied). Imosion note-mute
> verified (Ctrl+A + M -> 10/10 notes dashed + 0.35 opacity). The server crashes every ~6 evals from
> the concurrent chat's shared `.vite` cache, so the few remaining deep click-paths (Imosion
> Reverse/Invert post-state, Vinx Split/Duplicate click, Flux keyframe-delete click) are tsc-clean +
> wired into menus already clicked-verified this session — high confidence, not yet click-captured.
- Still queued (genuinely new work): Flux draggable keyframes (camera DOF DONE 18n: real camera layers in `flux/fluxCamera.ts`; distribute already wired); Forge real waveform + trim scrubber; Vinx color-wheel RGB readouts.

### After Imosion (queued)
- Games app — UI/UX pass, Apple-inspired internals
- Task Manager — UI/UX pass, Apple-inspired internals
- Achievements — UI/UX pass, Apple-inspired internals

## Build / run

- `npm run dev:tauri` — live dev window.
- `npm run build:tauri` — installers in `src-tauri/target/release/bundle/`.
- Native core crates: `cd core && cargo test`. Tauri shell: `cd src-tauri && cargo check`.

## Checkpoint 2026-11-04 (Part 15: real terminal, Notes compact mode)

- Terminal is a real pseudoterminal (ConPTY via `portable-pty`) under xterm.js, replacing piped stdio. Resize, Ctrl+C, interactive input, colours and exit codes verified in the native app over CDP. Details and the remaining checks: `DEX_REMAINING_WORK.md` #128–#133.
- Notes compact mode (#134).
- Already in place before this pass (checked, not rebuilt): window resize from all edges and corners, workspace layouts (Command Palette › Save/Restore Workspace Layout), Task Manager CPU rounding, fullscreen black strip (#123).

## Checkpoint 2026-11-04 (Part 17: Ledger, Bioengineering, creator identity)
- SUPERSEDED by Part 16's native Ledger (see that checkpoint; data importable). Was: Ledger app (`DEXAPPLICATIONS/ledger/`, native `src-tauri/src/ledger.rs`): integer minor units, splits, linked transfers, budgets with carry-over, reconciliation, reports, CSV in/out, backup/restore, undo. 14 TS + 5 Rust tests; preview-verified.
- Bioengineering rewritten as a three-pane workspace on a tested science module (`bio/bioScience.ts`, 27 tests).
- Creator display name is "Onazi oJ" from `src/shared/creator.ts`; optional desktop mark (Settings › Shell & Dock).
- Open: packaged run of Ledger's SQLite path, Terminal split panes, per-app passes, release build. Backlog rows #134–#144 in `DEX_REMAINING_WORK.md`.
- Terminal: split panes (1–4 per tab, resizable, shortcuts) + standalone `terminal` app; App Menu no longer drops uncategorised apps (8 were hidden); Engineering group.

## Checkpoint 2026-11-10 (Terminal profiles, App Information, Bio thermodynamics)

- Terminal: installed-shell list (`pty:shells`), per-pane shell + start folder that restore with the layout, default shell, text size, Files › Open in Terminal. Packaged run with live shells still open (#139, #146).
- App Information shows License and Creator; every app has a purpose line (#147).
- Bio: nearest-neighbour Tm (SantaLucia 1998, conditions shown) and circular-DNA digests (#148).
- Listener-leak sweep after #130 found nothing else (#149).
- Still open: 7.0.1 packaged verification and install test (#144), per-app passes for AXL / VINX / creative apps (#141).

## Checkpoint 2026-11-11 (Bio GenBank + primers)

- Bio imports and exports GenBank with features (table, extract to a sequence) and has a Primers tab: per-primer checks, pair checks, PCR product prediction on linear or circular templates (#150).
- Still open: 7.0.1 packaged verification and install test (#144), packaged Terminal run (#139, #146), per-app passes for AXL / VINX / creative apps (#141).

## Checkpoint 2026-11-11 (VINX save and recovery)

- VINX: recovery banner only after a session that did not close; saves 2 s after edits and on close; failures shown; newer copy wins at start (#152).

## Checkpoint 2026-11-11 (Presentation save, recovery, undo)

- Presentation: debounced autosave with a visible failure state, recovery of an unreadable stored deck, undo/redo, deck files (#151).

## Checkpoint 2026-11-12 (backlog cleanup, eval ratchet, unslop pass 2, AXL save pass)

- Backlog cleared of finished work: `DEX_REMAINING_WORK.md` now lists only rows with work left (43) plus a compact table of finished rows waiting on a packaged-app, hardware, provider-key or owner check (49). 154 completed rows moved to `docs/reports/DEX_COMPLETED_WORK.md` with their numbers unchanged.
- Security: the unused `shared/motion3d` evaluators (same string-splitting hole FLUX had, #161) deleted; `dynamic-code-ratchet.test.ts` lists every `new Function`/`eval` site with its reason (#166). Orphans `DEXAPPLICATIONS/index.ts` and `MarkdownEditor.tsx` deleted.
- UI unslop pass 2: decorative 135° gradients flattened (Home icon fallbacks, splash, Imosion, Settings, Share, PRISM swatches, VINX offline clip); 19 dead gradient CSS rules and the unused `DEX_THEME` removed (#167). Left: header heights, Control Center.
- AXL: true save status, a full store no longer throws inside edits, checked Open Project, New/Open keep the old project as a checkpoint, drop/import use the real mesh importer, export failures shown (#168).
- Next: Imosion/Canvas save indicators and Forge (#77), `{success:false}` sweep on non-file channels (#61), test-only orphan pruning (#53), packaged runs listed at the end of the backlog.

## Checkpoint 2026-11-12 (18n: no fake data, unhandled native calls)

- Mock / fake data sweep (owner, 2026-11-05) merged with main; `DEX_REMAINING_WORK.md` #169. Main's `download_ctl.rs` kept over this branch's `download.rs`; main's Ledger (opt-in starter categories) and Bio (labelled opt-in sample) kept.
- Renderer calls with no native handler: 60 of 229 → 11 of 186, all honest degrades (#170). New `renderer_log.rs` keeps renderer crashes, memory alerts and warn/error logs in `<logs>/renderer.log` (check it first when the packaged app misbehaves).
- Home Weather widget refreshes itself through `standalone/weatherData.ts` (shared with the Weather app).
- Release exe (isolated profile) verified: text write/read, renderer.log, plugin install/enable/uninstall + Settings › Plugins page, user info, Open-Meteo under the packaged CSP. Still open: backup export through the save dialog (needs a person).
- 18n also: drag and drop fixed in built DEX (Tauri drop handler off, #171), Flux camera + invisible-shape fix (#172), Weather widget icon, collaboration PIN from the CSPRNG.
