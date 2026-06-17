# DEX — Roadmap (single source of truth)

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
