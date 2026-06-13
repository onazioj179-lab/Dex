# DEX — Roadmap (single source of truth)

> This is the one forward-looking plan. Completed goal/handoff/sprint/audit
> writeups were removed (2026-06-09 cleanup); their work is done and lives in
> git history. Anything still pending is captured here. The detailed, actively
> maintained migration checkpoint is [TAURI-MIGRATION.md](TAURI-MIGRATION.md) —
> start there to resume engineering work.
>
> **Release theme (2026-06-10): Refinement & Consolidation.** No major feature
> expansion — performance, consistency, reliability, clarity, fluidity,
> stability, discoverability, maintainability. The full program and its live
> status are in [REFINEMENT.md](REFINEMENT.md); the Tauri migration below is
> its Priority 1 engine.
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

## Build / run

- `npm run dev:tauri` — live dev window.
- `npm run build:tauri` — installers in `src-tauri/target/release/bundle/`.
- Native core crates: `cd core && cargo test`. Tauri shell: `cd src-tauri && cargo check`.
