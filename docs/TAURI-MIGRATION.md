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

**Latest slice (2026-06-09): 13 SQLite-backed subsystems wired native.** All
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
shared `src-tauri/src/compress.rs` (byte-compatible with Node `zlib.deflateSync`/
`inflateSync`). Now fully functional (no longer degraded): `version-history:save/
getState/restore` (deflate→BLOB, inflate→JSON, 50-version cap), `session-replay:
recordAction/getSessionActions/getCurrentSession` (compression + DB-persisted
per-run session id), and `snapshot-comparison:getSnapshot` (fixed: was reading the
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

**Remaining non-DB items:**
  - **voice-memo save** — the one genuine cross-cutting item: needs a base64 audio
    contract in `tauriCompat` + the renderer recorder (binary over the JSON bridge),
    then write the `.opus`. Renderer + bridge + Rust.
  - **Renderer event bridge** — make `onX` subscriptions in tauriCompat deliver
    Tauri events (would light up file-watcher live events, reminder:fired push,
    notification push). Infra change, enables several deferred pushes at once.
  - Live multiwindow detach, live theme apply — BrowserWindow/OS-theme bound.
  - **voice-memo save** — the "binary over the bridge" case: needs a base64 audio
    contract in tauriCompat + the renderer recorder, then write the .opus file.
  - **link-preview fetch** (HTTP+TLS dep), **file-watcher** (`notify` + state +
    events), **timers** (reminder/expiry/theme/scratchpad; async tasks + events),
    **live window/monitor** (Tauri APIs; Electron Display shape is approximate).
  - **Native OS/UI:** dialogs (open/save), OS notifications (notification-center,
    reminder firing), live BrowserWindow/screen (multiwindow, multimonitor, layout
    apply, vinx presenter), theme apply.
  - **Networking:** link-preview HTTP fetch, live-collab mDNS/peer sync.
  - **Background runtimes:** file-watcher (fs.watch), reminder/expiry/theme timers,
    scratchpad autosave buffer, migration runner.
Use `__dexDegradeReport()` (see Verify) to order these by real usage. Then the
non-DB engines from the phase plan: transfer/device, audio sink, PTY.

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
