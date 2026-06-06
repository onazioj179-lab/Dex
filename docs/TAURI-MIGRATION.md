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
the same renderer; ~24 namespaces are natively backed; the rest degrade to `null`.

**Baseline (must stay green):**
- `cd core && cargo test` — native core crates (smart-router, vault, search, audio,
  automation, scanner). Run this before and after every Rust change.
- `npm run build:tauri` — produces the Tauri installer. Slow; run at slice end.
- Electron is untouched by Tauri work (additive: `src-tauri/`, `core/`,
  `services/platform/*`), so the shipping app cannot be broken by a migration slice.

**Next slice (P1 — pick up here):** port **notifications as a renderer-driven
channel**. Current state: OS notifications are fired *internally* in the Electron
main process (`src/main/automation/HumanCenteredAutomation.ts` via electron
`Notification`), so there is no renderer IPC channel to mirror yet. Two options,
in order:
  1. Add a renderer notification IPC (`notifications:show` → main) on the Electron
     side first, then mirror it in `dex_ipc` with the `notify-rust` crate. This
     makes the feature wired in BOTH shells (no orphan).
  2. If keeping notifications main-internal, port the internal trigger path instead.
Then add `notifications` to `TAURI_NATIVE_SUBSYSTEMS` and update the table below.

After notifications, follow the **priority order** in the phase plan.

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
| **Notifications** | — | **todo (next slice)** |
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
