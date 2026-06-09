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

**Next slice (P3 done for DB; pick up at the Tauri command layer):** the
shared-`dex.db` subsystem sweep is complete — every DatabaseManager-backed
manager is ported. What remains is the **non-DB tail** that the ported modules
currently degrade honestly. These need real Tauri commands (not the pure-DB
`dispatch` layer):
  - **Filesystem + compression:** version-history / session-replay / project-archiver
    zlib BLOB save/restore; export-bundle + backup/restore zip + native save dialog;
    bulk-metadata / smart-rename on-disk writes; voice-memo + media-library file IO.
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
