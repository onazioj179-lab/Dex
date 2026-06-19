# DEX — Roadmap (single source of truth)

> **Active goal (2026-06-19): Calendar redesign + Tauri migration push.**
> (1) Calendar reskinned to the icon-grid design (the mock): Monday-first week,
> pill day headers, true-black rounded tile cells, per-event app icons +
> notification dots, bold "today". Added an optional `icon` field to events with an
> icon picker in the New Event modal; mirrored the Monday-first + icon change into
> the FloatingLauncher calendar widget so the two stay consistent. Renderer-only,
> `tsc` 0. (2) Tauri migration resumed: ported `analytics:*` (11 channels,
> `src-tauri/src/analytics.rs`) and the rest of `power:*` (`PowerController.ts` ->
> `src-tauri/src/power.rs`: profiles/stats/resource-hogs/quick-boost/cleanup) and
> `mode:*` (6 channels, KV-backed CRUD + active-state via `modes_dispatch`) at
> Electron parity. THEN a multi-agent workflow bulk-ported 22 more clean subsystems
> (~110 channels: activity/duplicates/focus/memory/operations/perf/reader/resource/
> rule/sessions/split/splitview/stability/startup/systemHealth/tags/user/voiceNotes
> + logs/patterns/permissions/notes); 5 over-included namespaces (auth/settings/theme
> already native; render-error/renderer shimmed) were dropped; heavy channels degrade
> honestly (not faked). THEN round-2: a workflow bulk-ported ~119 more subsystems
> (264 channels) across nearly every remaining namespace. main.rs mod count 74->222;
> `cargo check` 0 errors, `tsc` GREEN. INCIDENT: round-2 agents ran `git checkout
> main.rs`, wiping all uncommitted wiring; recovered by re-wiring from the surviving
> module files (lost helpers rebuilt as modules modes.rs/projects.rs). LESSON: COMMIT
> before workflows; agents must never touch shared files. Deferred (degrade to null):
> rewind:getDaySummary, auth:setup:*, files:organizeByType. Details in
> docs/TAURI-MIGRATION.md. Calendar follow-up still parked (15/16 icon render).

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
> 3 parallel audits; full matrix written to `docs/V6-CONFORMANCE.md`. Codebase is
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

## Build / run

- `npm run dev:tauri` — live dev window.
- `npm run build:tauri` — installers in `src-tauri/target/release/bundle/`.
- Native core crates: `cd core && cargo test`. Tauri shell: `cd src-tauri && cargo check`.
