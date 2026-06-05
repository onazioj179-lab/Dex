# DEX — Electron → Tauri Migration

Status reference for the GOAL-6A migration. Electron stays the shipping product
until Tauri reaches parity.

## Architecture: the one-seam bridge

The renderer drives the backend through `window.dex.<ns>.<method>()` and
`window.electron.invoke('<ns>:<method>', ...)`, all funnelling through Electron's
`ipcRenderer.invoke('<ns>:<method>', ...)` — **~2,369 `ipcMain` handlers across
200+ files**.

Rather than reimplement each, the renderer boots under Tauri with a single seam:

- **`src/renderer/services/platform/tauriCompat.ts`** — installs a Proxy-based
  `window.dex` / `window.electron` that turns every `<ns>:<method>` call into one
  native command `dex_ipc(channel, args)`. Unported channels resolve to `null`
  (graceful degrade, same as the browser preview); `onX/offX` subscriptions return
  no-op unsubscribes. `installTauriCompat()` runs first in `main.tsx` — **no-op
  under Electron**.
- **`src-tauri/src/main.rs` `dex_ipc`** — the native dispatcher. Channels are
  ported subsystem-by-subsystem; the `_ => null` arm covers the long tail.

Most renderer state is `localStorage`, which works natively in WebView2 (AI keys,
model prefs, perf tier, onboarding, most settings) — so the app is far from hollow.

## Dual-shell "blend" (Electron + Tauri from one codebase)

DEX does **not** fuse the two runtimes into one binary (impossible — different
runtimes). Instead the *same* renderer runs under either shell, selected at
runtime:

- **Electron** → `window.dex` (real preload) = the full ~2,400-handler backend.
  The shipping product, unchanged.
- **Tauri** → `tauriCompat` routes the same `window.dex` calls to native
  `dex_ipc` (ported subsystems) and degrades the rest gracefully.
- **`detectShell()`** picks the path; feature code is identical in both.

`services/platform/capabilities.ts` exposes `getCapabilities()` / `hasNative(ns)`
so the UI can adapt: **full** under Electron, **native-where-ported** under Tauri,
localStorage-only on web/preview. Keep `TAURI_NATIVE_SUBSYSTEMS` in sync with
`src-tauri/src/main.rs` as subsystems land. This is the "operable everywhere"
seam — build/ship Electron today, run the lightweight Tauri build in parallel,
and the gap closes one ported subsystem at a time.

## Build / run

- `npm run dev:tauri` — live dev window (serves the live renderer + bridge).
- `npm run build:tauri` — release + installers in `src-tauri/target/release/bundle/`
  (`*-setup.exe` NSIS, `*.msi`). Builds on the **GNU** toolchain (no MSVC needed).

## Ported channels (native, real)

| Subsystem | Channels |
|---|---|
| Window | `window:minimize/maximize/close/hide` |
| Files | `files:list/rename/move/copy/delete/mkdir`, `files:getScopes/isInScope` |
| File search/recent | `files:search`, `fileSearch:search`, `search:query`, `files:recent`, `fileIntel:getRecentFiles`, `fileSearch:getScopes` (bounded walk; index TBD) |
| System/Power | `system:getStatus/getProcesses/killProcess`, `power:getStats/closeProcess` (`sysinfo`) |
| Shell/Reveal | `shell:openPath/openExternal/showItemInFolder`, `fileIntel:revealInExplorer/openFile`, `media:openWithSystem` (`open` crate) |
| OS | `os:lockScreen` (shutdown/restart/sleep deferred for safety) |
| Clipboard | `clipboard:writeText/readText`, `vault:copyToClipboard` (`arboard`) |
| Storage | `capability:storage:get/set`, `storage:get/set` (JSON in app config dir) |
| Health/Diag | `health:check/getStatus`, `watchdog:health`, `diagnostics:getSystemInfo/getPerformance`, `crashReporter:getStats` |
| App/Net | `app:getVersion/getPath`, `data:getLocations`, `connection:isOnline`, `networkHygiene:isOnline` |
| Audio | `audio:getMetadata/getInfo` (Symphonia metadata), `audio:getWaveform/getPeaks`, `media:getWaveform` (decode + downsampled peaks) — `core/dex-audio` |
| Vault | `vault:*` — encrypted password manager + TOTP (`core/dex-vault`: Argon2id + AES-256-GCM) |
| AI | `smart_router_route` (dedicated command, native `dex-smart-router` crate) |

Crates added to `src-tauri`: `sysinfo`, `open`, `arboard`.

## Remaining (heavy engines — each a real multi-session build)

Currently graceful-`null`; need genuine native implementations:

- **Vault / auth / encryption / secureKeys** — AES-GCM, TOTP, key lifecycle
- **Native search index** — Tantivy (supersedes the bounded walk for big trees)
- **Audio playback** — a real output sink (metadata + waveform analysis already done via `core/dex-audio`)
- **Automation / agents / scripting** — execution engine
- **Transfer / device / HTTP transfer** — network protocols + pairing
- **Notifications (OS)**, native file/folder **dialogs** (use the Tauri dialog
  plugin to avoid event-loop deadlock), **theme** accent from the OS

## Verify on real hardware

The shell can't render in the headless browser preview (needs `window.dex`/WebView2).
Run `npm run dev:tauri` and confirm: UI boots · window buttons work · Files lists
real folders · search/recent return results. Report empties → that orders the next
ports.
