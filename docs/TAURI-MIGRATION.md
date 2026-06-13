# DEX — Electron → Tauri Migration

> **DECISION (2026-06-06, owner): full migration to Tauri. Electron is now the
> temporary bridge, to be retired once Tauri reaches parity.** Goal: a lighter
> (~4 MB vs ~88 MB installer), faster, sharper app on the system WebView2.
>
> **This file is the living checkpoint. Update it every session so the work is
> resumable with no mess-ups. Start any continuation at "RESUME HERE".**

---

## RESUME HERE  ← next session starts here

**Status:** Electron is the shipping build (v5.0.1). Tauri shell boots and serves
the same renderer; **~80 namespaces are natively backed** (24 platform + 57
SQLite subsystem modules sharing `dex.db`); the rest degrade to `null`.

**Renderer slice (2026-06-12): v5.5 "DEX Sharp" UI program, batch 1 (shell-wide,
applies identically to both shells — pure renderer).** Foundation: dex token
layer gained light-theme parity, responsive modal width vars, 28/32/40 control
rhythm, tight heading tracking + `dex-label-caps` micro-label, 0.5px hairlines
at >=1.5dppx. New canonical `ui/Modal.tsx` (portal, flex centering, focus trap,
scroll lock); ConfirmDialog/ShareDialog/HelpOverlay migrated onto it.
`ui/Button.tsx` states moved from JS mouse handlers to CSS (`.dex-btn`).
globals.css glitch layer rewritten: removed universal brightness-filter hovers,
duplicate press transforms, aria-label hover heuristics, `!important` selection
overrides, the transform-hijacking modal animation, and all decorative
keyframes (ripple/shine/glow/pulse — zero consumers). Token/maturity sweeps
landed on LockScreen, ChatPanel, HomeWidgets, Onboarding (hand-rolled CTA
system replaced with ui/Button), shell/UIComponents (no bouncy beziers),
SpotlightSearch, QuickControls, NotificationBanners. Verified: `tsc --noEmit`
green, vite build green, 5583/5584 unit tests pass (the 1 failure is
pre-existing on clean HEAD: terminal spawn-error UI test, spun off as a
separate fix task). Uncommitted — owner reviews and commits.

**Renderer slice (2026-06-12): v5.5 "DEX Sharp" batch 2 (platform-wide app
sweep, ~35 files).** Every remaining app/page surface swept to the identity:
- ThemeManager modal de-hacked (flex-center + responsive width); the other
  translate(-50%) grep hits (ColorPicker thumb/cursor, EnhancedKnob rotary,
  UnifiedSystems drag fallback) confirmed LEGITIMATE control positioning, left.
- AppManager: styling-only sweep (registry/lifecycle/IPC untouched); flagged
  the inline-SVG `Icons` map as the real DexIcon-consolidation debt (deferred).
- Standalone apps (all ~21), pages (Home/Tasks/TaskManager/Power/Store/Games/
  Files/Gallery/Settings/Browser/Audio/Workflows/Transfers), and creative apps
  (Imosion/Prism/Flux/Forge/Vinx+subs/Axl/Rewind/Nexus + notes/components)
  swept for: light-mode-breaking neutral/accent colors -> tokens; bouncy/spring
  easing -> standard curve; >250ms UI durations -> ~180ms; decorative motion
  removed; overflow-prone fixed dialog widths -> min(Xpx, calc(100vw-48px));
  gray section headers -> dex-label-caps. Gallery's 5 real centered-dialog
  hacks flex-centered; an Audio `translateX(-50)` typo (missing %) fixed; the
  QR generator's all-black unscannable-code default fixed (#fff bg).
- Foundation additions: `--color-text-on-accent` aliased to the canonical
  `--color-accent-text` (was dead-falling-back in Audio); `dex-label-caps`
  split into composable `.dex-caps` (tracking/weight/uppercase only) + turnkey
  `.dex-label-caps` (adds 11px + tertiary) so dense/tinted creative micro-
  labels can adopt the identity tracking without the size/color opinion.
Coverage: standard files ~100%; the monoliths (Imosion 655KB, Prism, Flux,
Settings 225KB, etc.) pattern-swept at ~85-100% of in-scope sites, honestly
reported per file. Verified: tsc --noEmit green, vite build green, full test
suite (see below). Uncommitted — owner reviews and commits.

DOCUMENTED FOUNDATION FOLLOW-UPS (batch 3, requested repeatedly by sweep
agents; deliberately NOT auto-applied to avoid orphan tokens / unverified
global visual changes):
1. `--color-accent-dark` token — for pressed/active accent affordances and
   theme-aware brand gradients (every creative agent asked).
2. Translucent neutral tokens — many apps use rgba(255,255,255,0.02-0.06)
   subtle surfaces that DON'T map to the opaque --color-bg-hover/-inset; a
   --color-surface-1/2/3 (or --color-scrim) set would let ~45+ Rewind sites
   and similar adopt theme-aware values without shifting the dark baseline.
3. ~18 Imosion + 19 Prism centered modals are wrapper-less position:fixed
   panels — width-guarded (overflow fixed) but still translate-centered; a
   structural pass could wrap+flex-center them for whole-pixel sharpness.
4. Axl uses macOS system-blue #0a84ff instead of DEX accent #4A9EFF — a
   deliberate accent migration, separate from the behavior-preserving sweep.
5. AppManager inline-SVG `Icons` map -> consolidate onto DexIcon.

**Renderer slice (2026-06-13): v5.5 "DEX Sharp" batch 3 (dock redesign,
component sweep, bug fixes) — PR #24 (feat/dex-dev-platform -> main).**
- DOCK REDESIGNED (AppManager): the active-app indicator was an ambiguous
  glowing colored dot (read as "highlighted anyhow"). Now one unmistakable
  focused state — accent-tinted icon pill + crisp accent underline bar —
  with a small neutral dot for background-running apps, real hover feedback
  (was forced transparent), no glow, and a bespoke 20px rounded-rect
  container (was a full pill). App-menu + UKI buttons aligned to the same
  active language; UKI infinite-pulse glow removed.
- Terminal spawn-error fixed: surface the failure reason immediately instead
  of a silent "starting…" while retrying in the background (also fixes the
  one failing unit test, so the suite is fully green).
- More real bugs fixed: QR generator all-black unscannable default ->
  #fff canvas bg; Audio translateX(-50) typo; Select MultiSelect undefined
  var(--color-text); AppOverview canvas fillStyle using an unresolvable CSS
  var; --color-text-on-accent aliased to --color-accent-text.
- Identity class made composable: .dex-caps (tracking/weight/uppercase only)
  + turnkey .dex-label-caps (adds size/color), so tinted/dense creative
  micro-labels can adopt the tracking without the color/size opinion.
- Component sweeps (waves 3-5): EmojiPicker/Select/UnifiedDropdown/
  ContextMenu and the shell window chrome (FloatingWindow/StageManager/
  QuickLook/AppOverview/MiniShell/etc.) fully swept. Big interactive
  overlays (UkiOverlay/CommandPalette/UnifiedSystems), feedback/panel
  components, and Learn/DexCode/CollabHub + system/productivity subdirs were
  PARTIALLY swept before a weekly usage limit stopped the agents mid-run;
  tsc + vite build confirm the partial edits are coherent. The
  browser/files/creative/polish/prism/flux subdirs are pure .ts logic (no
  .tsx) so nothing to sweep there.
Verified: tsc --noEmit clean, vite build clean. NEW batch-3 follow-up
(highest-leverage light-mode fix): the `colors` export in styles/tokens.ts
is dark-only literal hex; components consuming colors.* (UnifiedDropdown,
NumberInput, ColorPicker, EnhancedKnob, RichTextInput) don't react to light
mode. Needs careful per-consumer migration (some feed canvas fillStyle,
which can't resolve CSS vars). Plus: finish the partial wave-3/4/5 sweeps.

**Renderer slice (2026-06-09): uki chat app finished on top of `uki-chat:*`.**
`DEXAPPLICATIONS/standalone/Uki.tsx` (app id `uki`, wired into AppManager +
appSubsystem + AppIcon `sparkle`) is now feature-complete against the native
store: persistent history, native cross-conversation search, double-click
rename, auto-grow composer, a real Stop (AbortController threaded through
`uki/providers/connect.ts` → `fetch` signal), live provider re-check, and a
live on-screen context snapshot folded into the system prompt. `tsc --noEmit`
green. No backend channels changed — this consumes already-ported ones.

**Renderer slice (2026-06-09): uki writing-assist in Notes.** `NotesEditor.tsx`
toolbar gained an AI group (Improve / Summarise / Bullets / Continue) running
`askConfiguredLLM` (one-shot through the configured provider) on the selection
or whole note, inserting non-destructively (replace selection, else append).
Uses `shared/uki/promptTemplates` (injection-safe). `tsc --noEmit` green.

**Renderer slice (2026-06-09): uki deep app-context resolvers.** New
`uki/appContextRegistry.ts` (singleton over `shared/uki/appContext`): apps
register "what am I looking at?" resolvers; Notes registers one (open-note title
+ live selection); the uki chat app folds `formatUkiContexts()` into its prompt.
`tsc --noEmit` green.

**Renderer slice (2026-06-09): uki multi-step actions (confirm-gated).** New
`uki/chatActions.ts` brings the planner -> actionExecutor -> confirmTier pipeline
(the creative command bar's) to the uki chat. Imperative messages decompose into
a Plan, preview via `summarizePlan`, and gate by tier: `app.open` really launches
an app through the running-apps store (mutating -> Run/Cancel card), `uki.*` LLM
transforms auto-run. Anchored intents so normal chat isn't hijacked. `tsc` green.

**Renderer slice (2026-06-09): broader uki reach + NL tasks + suite green.**
(1) `app.close` chat action (confirm-gated, via running-apps store) joins
`app.open`. (2) `appContextRegistry` gained a built-in foreground resolver giving
uki the active app + selection for ANY app (defers to richer per-app resolvers).
(3) Tasks "Add a task" routes through native `nl-task:parse` (title/due/priority,
safe fallback). (4) Fixed a STALE pre-existing test (`pricing.test.ts` asserted a
dropped "no ads" promise; now asserts the current "ad-free on paid plans").
Full `npx vitest run` green (5584 passing, 0 failing) + `tsc --noEmit` clean.

**FINDING (2026-06-09) — dormant intelligence engines.** `settings.notes_data`/
`tasks_data` are READ by smart-grouping, duplication-detector, statistics-
dashboard, daily-briefing, goal-system, but WRITTEN by nothing in the repo
(Electron included). Those engines are dormant for lack of input. Lighting them
up needs a Notes/Tasks -> `notes_data` writer (`[{id,title,content,tags,
createdAt}]`) AND a native settings-table write channel (none renderer-facing
exists yet). Do not build smart-grouping UI before the writer — it would be empty.

**SQLite subsystem sweep complete (2026-06-09).** All ~57 DatabaseManager-backed
managers now have a native `src-tauri/src/<name>.rs` module (`ensure_schema` +
`dispatch`), wired through `db_dispatch` by channel prefix. Each copies its
Electron manager's CREATE TABLE verbatim and matches the IPC return shapes
exactly. Handlers that are NOT pure DB (filesystem zip/backup, native dialogs,
zlib BLOBs, live BrowserWindow/screen, networking/mDNS, fs watching, OS
notifications, background timers, in-memory session state) **degrade honestly**
(`{ success:false, error:"... (not ported)" }` or `null`) — they are the
follow-up work for the Tauri command layer (see "Known hard cases"). `cargo
check` green, zero warnings. Modules: activity-feed, changelog, color-labels,
content-expiry, daily-note, daily-briefing, dashboard, dependencies,
duplication-detector, bulk-metadata, feedback, goal-system, help, journal,
keyboard-nav, layout, licensing, i18n, localization, notifications,
notification-center, fts, global-search, link-preview, live-collab,
file-watcher, migration, multiwindow, multimonitor, dexnotes, nl-task,
project-archiver/comparison/health/linker/lock/timeline, export-bundle,
read-later, recycle-bin, relationship-graph, reminder, scratchpad,
search-history, session-replay, shared media-library, smart-grouping,
smart-rename, snapshot-comparison, stats-dashboard, theme-schedule,
time-tracking, vinx-presentation, version-history, voice-memo, word-count.

**Latest slice (2026-06-10, second pass): filesystem tail ported.** Now native:
  - **voice-memo**: `save` decodes the base64 audio and writes the `.opus` file
    under `data_dir/voice-memos`, inserts + returns the VoiceMemo shape;
    `isWhisperAvailable` probes `data_dir/whisper/whisper.wasm`; delete gates
    its recycle-bin entry on the file existing (dispatch now takes data_dir).
  - **media-library**: new-file `import` branch (fs stat, extension type
    detection, insert + return row); `remove` unlinks the cached thumbnail.
    Thumbnail generation stays absent (best-effort optional sharp/ffmpeg in
    Electron; NULL thumbnail either way).
  - **backup**: `create`/`verify`/`restore`/`delete` fully ported with exact
    `.dexbak` parity (base64 JSON archive, gzip level 6, SHA-256 checksum,
    manifest) — backups round-trip between shells. Auto-backup interval timer
    remains an Electron-runtime concern (no IPC surface).
  - **Correction:** bulk-metadata and smart-rename on-disk writes were listed
    as remaining, but those modules were already fully ported (their notes
    refer to Electron-internal event-bus side effects only).
  - New shared `src-tauri/src/util.rs` (pseudo uuid v4, ISO-8601 UTC now) and
    gzip/gunzip added to `zlib.rs`; licensing's SHA-256 is now crate-shared.
  What remains of the non-DB tail: native dialogs + OS notifications (Tauri
  plugins), live window/screen (multiwindow, multimonitor, layout, vinx),
  networking (link-preview fetch, live-collab mDNS), background runtimes
  (file-watcher, reminder/expiry/theme timers, scratchpad autosave buffer,
  migration runner), notes attachments file copy/remove, export-bundle native
  save dialog, zlib BLOB tails in feedback file write.

**Earlier slice (2026-06-10): zlib tier ported (start of the non-DB tail).**
Added `flate2` (zlib, Node `deflateSync`/`inflateSync` byte parity) + `base64`
to `src-tauri`, with a shared [src-tauri/src/zlib.rs](src-tauri/src/zlib.rs)
helper. Three subsystems went from degrade to fully native:
  - **version-history**: `save`/`getState`/`restore` now deflate/inflate the
    snapshot BLOB (+ 50-version trim), interoperable with Electron-written DBs.
  - **session-replay**: `recordAction` (deflate+base64 states), live per-process
    `{ sessionId, startTime }` for `getCurrentSession`, decompression in
    `getSessionActions`, and the 7-session cleanup at init.
  - **project-archiver**: `archive`/`unarchive` write/read/unlink real
    `.dex-archive` files under `app_data_dir/archive`, `getArchiveDir` returns
    that path (dispatch now takes the archive dir).
Also fixed: `assets/icon.png` converted palette -> RGBA (Tauri's
`generate_context!` codegen rejects non-RGBA PNGs; required for Linux builds,
harmless elsewhere). Note for Linux dev boxes: `cargo check` needs
`libgtk-3-dev libwebkit2gtk-4.1-dev librsvg2-dev libsoup-3.0-dev` — and beware
`cargo check | tail` masking the exit code. `cargo check` green, zero warnings;
`core` tests green. `docs/RELEASE_NOTES.md` was cleared ahead of the next
release line (publish new notes there once the migrated build ships).

**Earlier slice (2026-06-09): 13 SQLite-backed subsystems wired native.** All
share `dex.db` through the native `db.rs` connection and route via
`db_dispatch` (one channel-prefix arm each) in [main.rs](src-tauri/src/main.rs):
activity-feed, changelog, color-labels, dashboard, goal-system, help, journal,
layout, licensing (+ telemetry/crash, self-contained SHA-256), read-later,
recycle-bin, time-tracking, word-count. Each module copies its Electron
manager's CREATE TABLE verbatim in `ensure_schema()` (registered in `setup()`)
and matches the exact IPC return shapes; window-/dialog-/timer-only handlers
degrade honestly. `cargo check` green. `TAURI_NATIVE_SUBSYSTEMS` updated.

**Installer verified 2026-06-09:** `npm run build:tauri` (NSIS) produces
`src-tauri/target/release/bundle/nsis/DEX_6.0.0_x64-setup.exe` (**15 MB**, vs
Electron ~88 MB). The built `dex-tauri.exe` boots, opens the "DEX" window, and
runs stably at ~35 MB working set — smoke-tested clean (no panic/stderr).

**Baseline (must stay green) — verified 2026-06-06:**
- `cd core && cargo test` — native core crates (smart-router, vault, search, audio,
  automation, scanner). **green.** Run before and after every Rust change.
- `cd src-tauri && cargo build` — the Tauri shell. **green (48s incremental).**
- `npm run build:tauri` — produces the Tauri installer. Slow; run at slice end.
- Electron is untouched by Tauri work (additive: `src-tauri/`, `core/`,
  `services/platform/*`), so the shipping app cannot be broken by a migration slice.

**HOW TO GO 100% WITHOUT MESS-UPS — data-driven porting.** The clean pure-Rust,
JSON-friendly, renderer-wired channels are largely ported. The remainder is the
heavy/plugin/binary tier, and porting it blind risks orphaned or shape-mismatched
handlers. The correct path is data-driven:
  1. Run `npm run dev:tauri`, exercise the app (open Home, Files, Notes, Settings,
     a creative app, the Store…).
  2. In devtools run `__dexDegradeReport()` — it lists every channel that was hit
     and degraded to null, most-used first. That is the EXACT, prioritized port
     list, with real call shapes to match.
  3. Port those channels in `dex_ipc` (pure Rust) or a `core/` crate; re-run; repeat
     until the report is empty. Then P4 (flip default + retire Electron).
This converges to 100% deterministically and never ports a dead/guessed channel.

**Known hard cases to handle during porting:**
- **Binary over the bridge:** ArrayBuffer args/returns (e.g. `creativeApps:readFile/
  saveFile`, `code:readFile`) don't survive the JSON `dex_ipc` bridge. Standardize
  on base64 on both ends (add a small encode/decode in `tauriCompat` + Rust).
- **Dialogs / notifications:** use the Tauri v2 plugins (`tauri-plugin-dialog`,
  `tauri-plugin-notification`) + capability permissions — not raw blocking crates
  (event-loop deadlock).
- **Stateful engines** (Rewind capture, transfer, PTY, automation store): need a
  native store/runtime; build as `core/` crates with `cargo test`, then thin-wire.

**Command-layer tier 1 DONE (2026-06-09): zlib BLOBs.** Added the `flate2` dep +
a shared zlib helper, byte-compatible with Node `zlib.deflateSync`/`inflateSync`
(today `src-tauri/src/zlib.rs`; see the merge-consolidation entry below). Now
fully functional (no longer degraded): `version-history:save/
getState/restore` (deflate→BLOB, inflate→JSON, 50-version cap), `session-replay:
recordAction/getSessionActions/getCurrentSession`, and
`snapshot-comparison:getSnapshot` (fixed: was reading the
compressed BLOB as raw UTF-8). `cargo check` green.

**Command-layer tier 2 DONE (2026-06-09): native dialogs + OS notifications.**
Added `tauri-plugin-dialog` + `tauri-plugin-notification` (registered in the
builder), and a new `src-tauri/src/native_ops.rs` command layer invoked from
`dex_ipc` (which holds the `AppHandle`). Now functional: `dialog:showOpenDialog` /
`files:openDialog` (native picker -> Electron `{ canceled, filePaths }`, honoring
openDirectory/multiSelections/filters/defaultPath) and `notification-center:send`
(DB record + real OS toast). Pattern established: app/UI-bound channels get an
explicit arm in `dex_ipc` before the db-prefix guard, calling `native_ops`.
`cargo check` green.

**Command-layer tier 3 DONE (2026-06-09): filesystem ops (no new dep).** Via
`native_ops` (app paths/dialog + `with_conn` to reach the shared db): real
`project-archiver:archive/unarchive/getArchiveDir` (zlib `.dex-archive` files
under <appData>/archive + DB row lifecycle), `media-library:import` (dedupe or
stat+insert with extension type detection), `changelog:export` (render markdown
-> native save dialog -> write). `cargo check` green.

**Command-layer tier 3b DONE (2026-06-09): notes attachments.** `dexnotes:
addAttachment` (copy source into <appData>/notes-data/attachments as `<uuid><ext>`,
50 MB cap, type detect, DB row + note updated_at), `removeAttachment` (unlink +
row), `openAttachment` (OS default handler via `open`). No new dep. Full NSIS
installer rebuilt green WITH the dialog/notification plugins (06:01).

**Command-layer tier 4 DONE (2026-06-09): backup (no new dep).** `backup:create`
uses SQLite `VACUUM INTO` for a WAL-safe single-file snapshot of dex.db to a
`.dexbak` in the configured/`<appData>/backups` dir, records the row, prunes to
max_backups; `backup:verify` recomputes the sha256 (reusing licensing's audited
impl, now `pub(crate)`) and compares. `cargo check` green.

**Command-layer tier 5 DONE (2026-06-09): reminder scheduler (no new dep).** A
background thread (`native_ops::start_reminder_scheduler`, spawned in setup())
polls due/non-completed/non-snoozed reminders every 30s (2s initial delay, matching
the TS), fires an OS toast per reminder, then completes (`repeat='none'`) or
advances `remind_at` by the repeat interval (SQLite date math). Renderer push and
the legacy notifications-table insert are intentionally skipped (bridge no-ops
event subscriptions; legacy table schema differs). `cargo check` green AND
runtime-verified: seeded an overdue reminder via sqlite3, launched the built
`dex-tauri.exe`, and confirmed the row flipped `completed 0 -> 1` within the
first poll — the scheduler fires for real, not just compiles.

**Command-layer tier 5b DONE (2026-06-09): automatic backups (no new dep).** A
second background thread (`native_ops::start_autobackup_scheduler`) honors
`backup_settings` (auto_enabled, interval_hours, last_auto_backup) with a startup
catchup, calling `backup:create('automatic')` when due. RUNTIME-VERIFIED: set
interval_hours=0, launched the built exe, confirmed an `automatic` backups row +
a ~946 KB `.dexbak` snapshot on disk + `last_auto_backup` set. NOTE (faithful):
ContentExpiry has NO timer in Electron (IPC-only), so no expiry auto-run was
added — not inventing behavior.

**Command-layer tier 6 DONE (2026-06-09): backup:restore (no new dep).**
Implemented in native_ops: verify checksum -> pre-restore safety backup -> lock
DbState + drop the live connection -> atomic swap (copy snapshot -> dex.restore-tmp
-> rename over dex.db) + remove stale dex.db-wal/-shm -> reopen + `ensure_all_schemas`
(factored out of setup() and reused) -> restore the managed connection. On any
failure the old dex.db is left intact and reopened (no data-loss path). Compiles
green; the swap+WAL-drop+reopen MECHANISM was data-level validated on a throwaway
WAL db (live B -> snapshot A round-trips). NOT yet launch-tested through the
renderer (restore is IPC-triggered, can't be driven headlessly) — needs a manual
in-app smoke test to fully confirm.

**Command-layer tier 7 DONE (2026-06-09): export-bundle, link-preview, monitors,
scratchpad, file-watcher config.** Five self-contained `src-tauri/src/cmd_*.rs`
modules (reusing `native_ops` `pub(crate)` helpers), wired via explicit `dex_ipc`
arms before the db guard:
  - `export-bundle:create` — gather project rows -> gzip (flate2) -> native save
    dialog -> write file; returns path (cmd_export_bundle.rs).
  - `link-preview:fetch` — cache hit OR `ureq` HTTP GET (8s timeout, 512KB cap)
    -> scrape og:title/description + <title> -> UPSERT cache (cmd_link_preview.rs).
    Added `ureq` dep (you OK'd HTTP+TLS). Network call done outside the db lock.
  - `multimonitor:get-displays/get-current-display/get-scale-factor` — Tauri
    Window monitor APIs; Display shape approximate (physical px, workArea==bounds,
    rotation/internal constant) (cmd_window_monitor.rs).
  - `scratchpad:updateContent/saveNow` — persist content directly (no in-memory
    buffer needed) (cmd_scratchpad.rs).
  - `file-watcher:addFolder/importFile` — folder dialog + DB insert / stat+insert
    (cmd_file_watcher.rs). LIVE fs-watch events deferred (need the renderer event
    bridge). `cargo check` green (first try).

**Merge consolidation DONE (2026-06-10): local command layer + cloud refinement
(PR #19) reconciled.** Both lines of work landed in one merge. The cloud PR
contributed the shared helpers `src-tauri/src/zlib.rs` (deflate/inflate/gzip/
gunzip + string conveniences; supersedes the earlier compress.rs, now deleted)
and `src-tauri/src/util.rs` (pseudo_uuid_v4, iso_utc_now), plus fs-capable db
modules. Where both sides implemented the same channels, exactly one
implementation now serves each:
  - **session-replay:** cloud version adopted — states stored as zlib+base64
    TEXT exactly like Electron's compressJson (the local raw-BLOB port did not
    round-trip Electron-written rows), and per-process session identity via
    OnceLock (the local meta-table port wrongly reused one session id across runs).
  - **version-history:** cloud version adopted (same raw zlib BLOB format,
    crate::zlib helpers).
  - **project-archiver / media-library:import:** cloud db-module implementations
    adopted (db_dispatch passes the app data dir in); the duplicate native_ops
    fns + explicit dex_ipc arms were removed.
  - **backup:create/verify/restore:** local native_ops kept — VACUUM INTO
    snapshot of the Tauri-native dex.db + atomic-swap restore, both
    runtime-verified. The cloud's Electron-file-format trio was removed from
    backup_restore.rs: it archived dex-core.db/dex-notes.db/help.db, which do
    not exist in the Tauri data dir, so it would have backed up nothing.
    backup_restore.rs keeps list/get-settings/update-settings/delete.
  - **voice-memo:save DONE (cloud):** base64 audio -> `.opus` under
    <appData>/voice-memos + DB row, matching Electron's audioBase64 contract.
    Renderer store fixed: loadMemos now calls the real `voice-memo:getForParent`
    channel (`voice-memo:get` never existed in either shell) and saveMemo
    base64-encodes the ArrayBuffer before crossing the JSON bridge.

**Renderer event bridge DONE (2026-06-10).** The generic push path now works
end to end: Rust pushes with `native_ops::emit_event(app, channel, payload)`
(Tauri `Emitter`, one payload value per event — the analog of Electron's
`webContents.send`), and tauriCompat implements the preload's generic
`dex.on(channel, cb)` / `dex.off(channel, cb)` (plus `window.electron.on/off`)
over `__TAURI__.event.listen` (withGlobalTauri is on). Callbacks receive the
payload directly, matching the preload wrappers that strip the IPC event arg.
Namespaced `dex.x.onY(cb)` subscriptions still return no-op unsubscribes (their
channel mapping under Electron is irregular). Wired emit sites, mirroring the
Electron broadcasts: `reminder:fired` (full reminder row, from the scheduler
thread), `notification-center:new` (inserted record) +
`notification-center:unread-count` after send, and `unread-count` after
markRead/markAllRead/clearAll/delete. `cargo check` + `tsc` green; renderer
delivery still needs an in-app smoke test (subscriptions are UI-triggered).

**Remaining non-DB items:**
  - **file-watcher live fs events** — `notify` crate + emit
    `file-watcher:detected` through the (now live) event bridge.
  - Live multiwindow detach, live theme apply + theme-schedule timer —
    BrowserWindow/OS-theme bound.
  - **Networking:** live-collab mDNS/peer sync.
Use `__dexDegradeReport()` (see Verify) to order these by real usage. Then the
non-DB engines from the phase plan: transfer/device, audio sink, PTY, rewind
capture.

---

## Where we are (honest status)

Raw scale: the renderer drives **~2,369 `ipcMain` handlers across 200+ files**.
By raw channel count the native port is **early (~3%)** — but most of those handlers
live in heavy controllers not needed for day-one parity, and **most renderer state
is `localStorage`, which already works natively under WebView2** (AI keys, model
prefs, perf tier, onboarding, most settings). So the usable surface is far higher
than 3%.

| Subsystem | Channels (native in `dex_ipc`) | State |
|---|---|---|
| Window | minimize/maximize/close/hide | done |
| Files | list/rename/move/copy/delete/mkdir, getScopes/isInScope | done |
| File search/recent | files/fileSearch/search:query, recent, getRecentFiles | done (Tantivy index + bounded-walk fallback) |
| System/Power | getStatus/getProcesses/killProcess, power stats | done (`sysinfo`) |
| Shell/Reveal | openPath/openExternal/showItemInFolder, reveal/openFile | done (`open`) |
| OS | lockScreen | partial (shutdown/restart/sleep deferred for safety) |
| Clipboard | writeText/readText, vault copy | done (`arboard`) |
| Storage | capability:storage + storage get/set | done (JSON in config dir) |
| Health/Diag | health, watchdog, diagnostics, crashReporter | done |
| App/Net | app:getVersion/getPath, data:getLocations, connection/online | done |
| Audio | metadata, waveform/peaks | done (`core/dex-audio`, Symphonia) |
| Vault | full `vault:*` | done (`core/dex-vault`, Argon2id + AES-GCM, 14 tests) |
| Scanner | findDuplicates | done (`core/dex-scanner`) |
| Automation | run/executeNew | partial (id-based store-backed runs need a native store) |
| AI router | `smart_router_route` (dedicated command) | done (`core/dex-smart-router`) |
| Notifications | full `notifications:*` | done (`notifications.rs`, managed store) |
| Activity feed | full `activity-feed:*` | done (`activity_feed.rs`, shared dex.db) |
| Changelog / Color labels / Dashboard | full `*:*` | done (`changelog.rs`, `color_labels.rs`, `dashboard.rs`) |
| Goal system / Help / Journal | full `*:*` | done (`goal_system.rs`, `help_system.rs` (FTS5), `journal.rs`) |
| Layout / Read-later / Recycle bin | full `*:*` | done (`layout.rs`, `read_later.rs`, `recycle_bin.rs`) |
| Time tracking / Word count | full `*:*` | done (`time_tracking.rs`, `word_count.rs`) |
| Licensing / telemetry | full `licensing:*` | done (`licensing.rs`, self-contained SHA-256) |
| **Dialogs (file/folder)** | — | todo (use Tauri dialog plugin to avoid event-loop deadlock) |
| **Transfer / device / pairing** | — | todo (network protocols) |
| **Audio playback sink** | — | todo (device output; analysis already native) |
| **PTY / terminal** | — | todo |
| **Security/Workflow controllers** | — | todo (largest; phase last) |
| **OS theme accent** | — | todo |

Crates in `src-tauri`: `sysinfo`, `open`, `arboard`, `trash` (+ path-dep core crates).

## Phase plan (priority order)

- **P0 — Boot + shell parity (mostly done).** Window controls, Files, system,
  shell, clipboard, storage, health, app/net, audio analysis, vault, search. ✅
- **P1 — Everyday gaps (current).** Notifications (wired both shells), native
  file/folder dialogs, OS theme accent, finish OS controls (guarded
  shutdown/restart/sleep), automation native store.
- **P2 — Heavy engines.** Audio playback sink, transfer/device/pairing, PTY/terminal.
- **P3 — Big controllers.** Security, workflow, agents, microservices — the long
  tail of the ~2,369 handlers; port by what real usage hits, measured via the
  degrade-log (see Verify).
- **P4 — Flip default + retire Electron.** When P0–P3 cover real usage: make the
  Tauri build the shipped artifact, move `release.yml` to `build:tauri`, drop the
  Electron packaging, and remove the `tauriCompat` `null` fallbacks that are no
  longer hit.

## Architecture: the one-seam bridge

The renderer drives the backend through `window.dex.<ns>.<method>()` /
`window.electron.invoke('<ns>:<method>', ...)`, all funnelling through
`ipcRenderer.invoke('<ns>:<method>', ...)`. Rather than reimplement each, the
renderer boots under Tauri with a single seam:

- **`src/renderer/services/platform/tauriCompat.ts`** — a Proxy-based
  `window.dex`/`window.electron` that turns every `<ns>:<method>` call into one
  native command `dex_ipc(channel, args)`. Unported channels resolve to `null`
  (graceful degrade); `onX/offX` subscriptions return no-op unsubscribes.
  `installTauriCompat()` runs first in `main.tsx` — **no-op under Electron**.
- **`src-tauri/src/main.rs` `dex_ipc`** — the native dispatcher. Channels are a
  big `match channel.as_str()`; each subsystem is plain Rust fns returning
  `serde_json::Value`. The `_ => Value::Null` arm covers the long tail. Raw
  Rust (`std::fs`, `sysinfo`, etc.) is NOT gated by Tauri permissions, so ports
  work without plugin/permission config.
- **`services/platform/capabilities.ts`** — `getCapabilities()`/`hasNative(ns)`;
  keep `TAURI_NATIVE_SUBSYSTEMS` in sync with `dex_ipc` as subsystems land.

## How to port a subsystem (the repeatable recipe)

1. Find the Electron handlers: `grep "ipcMain.handle('<ns>:" src/main`. Note each
   channel's args + exact return shape (match it precisely).
2. Implement plain Rust fns in `src-tauri/src/main.rs` (or a `core/` crate for
   real logic + `cargo test`).
3. Add `match` arms in `dex_ipc` mapping `"<ns>:<method>"` → the fn.
4. Add the namespace to `TAURI_NATIVE_SUBSYSTEMS` in `capabilities.ts`.
5. Verify: `cd core && cargo test` (if core touched) + `npm run build:tauri`.
6. Update the status table + RESUME HERE in this file. Commit.

## Build / run

- `npm run dev:tauri` — live dev window (live renderer + bridge).
- `npm run build:tauri` — release installers in `src-tauri/target/release/bundle/`.
  Builds on the **GNU** toolchain (no MSVC needed).

## Verify on real hardware

The shell can't render headlessly (needs WebView2). Run `npm run dev:tauri` and
confirm: UI boots · window buttons work · Files lists real folders · search/recent
return results. **Add a degrade-log:** have `tauriCompat` count which unported
channels get hit at runtime — that data orders P3 (port what's actually used).
