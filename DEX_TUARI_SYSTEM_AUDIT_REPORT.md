# DEX Tauri — System Audit, Repair & Optimization Report

**Date:** 2026-11-01 · **Branch:** `claude/dex-tuari-repair-optimize-756d99` · **Version audited:** 6.1.0 (installed copy on this PC: 6.0.1)
**Machine:** Windows 11 Pro 10.0.26300, x64 (AMD64), WebView2 Evergreen runtime 156.0.4314.58, Rust 1.95 (MSVC default + GNU installed), VS Build Tools 2026 (MSVC 14.51, SDK 10.0.26100), Node 22.20.

Every number below was measured on this machine during this session. Where a measurement is a single sample or the comparison is not like-for-like, it says so.

---

## A. System Overview

| Layer | What it is | Health before |
|---|---|---|
| Shell | Tauri 2.11.2 (`src-tauri/`, ~95k lines Rust, 240+ modules, one `dex_ipc` dispatcher with ~3,000 channels) | Builds. **Installed copy cannot start.** |
| Renderer | React 18 + Zustand, Vite 5 (`src/renderer/`, 67 output chunks), embedded in the exe | **Throws at boot in the packaged build** (blank window) |
| Native core | `core/` Rust crates (search, vault, audio, scanner, …) linked into the shell | OK |
| Legacy | `native/` N-API addon (Electron-era; still referenced by tests and `vite.config.ts`) | Not loadable in WebView2; kept, see I |
| Packaging | NSIS + MSI, WebView2 `embedBootstrapper` | Installer missing a required DLL when built with GNU |
| CI | `ci.yml`, `release.yml` (MSVC on `windows-latest`), `npm ci` | Lockfile out of sync with `package.json` |

**Baseline checks (before changes):** `tsc --noEmit` exit 0 · watermark lint OK (2,264 files) · vitest **498 files / 5,311 tests passed**, 14 skipped, exit 0.

---

## B. Problems Found

| # | Severity | Problem | Root cause | Files | Impact |
|---|---|---|---|---|---|
| 1 | **Critical** | "WebView2 not found" — installed DEX 6.0.1 never starts, although WebView2 156 is installed | The 6.0.x release was built with the **GNU** Rust toolchain. `webview2-com-sys` links the WebView2 loader statically only on MSVC (`WebView2LoaderStatic.lib`); on GNU the exe imports **`WebView2Loader.dll`** dynamically. The bundler never ships that DLL. Windows' loader fails with `0xC0000135 STATUS_DLL_NOT_FOUND` before any DEX code runs. Interactively it shows a hard-error dialog (which reads as "WebView2 not found"); the process then sits blocked on an `LpcReply` to CSRSS. | `src-tauri/build.rs`, toolchain, `%LOCALAPPDATA%\DEX\dex-tauri.exe` | App unusable for every user of that installer |
| 2 | **Critical** | Packaged renderer throws `ReferenceError: Cannot access 'Wt' before initialization` in `app-notes-*.js` at boot; page stays at 21 DOM nodes (blank) | Static import cycle **`dex-app-core ↔ app-notes`**: the shared `components/AssistedTextarea` imports `DEXAPPLICATIONS/notes/WordSuggestions`, which `manualChunks` put in `app-notes`. The dev server (unbundled ESM) cannot show it. Same chunk hash (`app-notes-CdjcXNSe.js`) is produced from current `main`, so v6.1.0 ships it. | `vite.config.ts` | Blank window / broken boot |
| 3 | High | Any WebView2 failure exited silently | `main()` ended in `.expect(..)` under `windows_subsystem = "windows"` (no console, no dialog, no log) | `src-tauri/src/main.rs` | Undiagnosable startup failures |
| 4 | High | Webview-controller failures hang forever with an empty window | In this Tauri/wry version, controller creation is async; its errors never reach `Builder::run`'s `Result`. Reproduced: second instance with different WebView2 options → window, **0** WebView2 processes, no error, never exits. | `main.rs` | Silent hang |
| 5 | High | Multiple DEX instances could run at once | No single-instance guard; a duplicate shell double-runs reminder/autobackup schedulers and file watchers on the same `dex.db` (or hangs, see #4) | `main.rs` | Duplicate notifications/backups, DB contention |
| 6 | High | `package-lock.json` out of sync with `package.json` | Lock root still said version 5.5.0 and lacked `@types/d3-force` | `package-lock.json` | `npm ci` (used by both CI workflows) rejects an out-of-sync lock |
| 7 | Medium | Notes "Attach file" / "Import" did nothing | `native_ops::note_pick_file` existed but was never routed; `dexnotes:pick-*` channels fell into the db-backed `dexnotes:` prefix route, which returns `null` | `main.rs`, `native_ops.rs` | Broken feature (documented as ported in `rendererShims.ts`) |
| 8 | Medium | 13 unused npm packages incl. native `better-sqlite3` (compiled at install time) | Electron-era leftovers (`node-schedule`, `ps-list`, `systeminformation`, `loudness`, …) and duplicates (`happy-dom` next to the configured `jsdom`; `lightningcss` whose transformer was removed) | `package.json` | Slower/fragile installs, 54 MB of `node_modules` |
| 9 | Low | Dead Rust code (compiler warnings) | `power::get_stats`, `containment_ctl::default_all_domain_status` never called | `power.rs`, `containment_ctl.rs` | Noise |
| 10 | Low | Diagnostic report had a stale hardcoded `Build: 2026.03.09` and no WebView2 info | — | `pages/Settings.tsx` | Support friction |
| 11 | Info | In-app updates are stubs | `updates:check/download/install` return `not ported`; `update-service` version URL is empty | `updates_ctl.rs`, `update_service.rs` | No in-app updates (see I) |
| 12 | Info | Shell release profile not tuned | `[profile.release]` lives in `core/Cargo.toml`, but profiles only apply at the package being built, so `src-tauri` uses defaults | `src-tauri/Cargo.toml` | Possible size/speed headroom (see H) |

---

## C. Repairs Completed

| Fix | Change | Files | Verification |
|---|---|---|---|
| #1 root cause | `build.rs` **refuses Windows-GNU release builds** with an actionable message (override `DEX_ALLOW_GNU_RELEASE=1` for throwaway builds only). Release built with MSVC. | `src-tauri/build.rs` | New exe imports 31 DLLs, **no `WebView2Loader.dll`** |
| #1 regression gate | `scripts/verify-tauri-bundle.js` parses the PE import tables (regular + delay-load) of the shipped exe and fails if it imports `WebView2Loader.dll`; also asserts NSIS + MSI exist **for the current version**. Wired into `npm run build:tauri` (which `release.yml` runs). | `scripts/verify-tauri-bundle.js`, `package.json`, `tests/unit/verify-tauri-bundle.test.ts` | Flags the broken 6.0.1 exe (exit 1); passes the new build; 2 unit tests pass |
| #3 | WebView2 **preflight** before the event loop via Microsoft's own `GetAvailableCoreWebView2BrowserVersionString` (same API wry uses; honours per-user/per-machine installs, all architectures and `WEBVIEW2_BROWSER_EXECUTABLE_FOLDER`). If missing, a Yes/No dialog explains it (naming a bad env override if set) and, **only on Yes**, opens Microsoft's official download page. Nothing is downloaded or installed silently. `.expect` replaced with a logged, shown fatal error. Panics are logged. | `src-tauri/src/webview2.rs` (new), `main.rs`, `Cargo.toml` | Simulated missing runtime → correct dialog + log line, no WebView2 processes started; normal launch logs `webview2 ok … (269–863 µs)` |
| #4 | **Page-load watchdog**: if the main webview never fires a page-load event within 30 s, the error is logged and explained (common causes + repair path) | `webview2.rs`, `main.rs` | Forced failure (unwritable `WEBVIEW2_USER_DATA_FOLDER`) → "DEX — window did not load" dialog at 30 s + `WATCHDOG` log line |
| #5 | `tauri-plugin-single-instance` (registered first): a second launch focuses the running window and exits | `main.rs`, `Cargo.toml` | Second launch exit code 0, exactly one `dex-tauri` remains |
| #2 | Pinned `WordSuggestions` into `dex-app-core`. Added a Vite plugin **`dex-no-chunk-cycles`** that fails `vite build` on any static chunk cycle. | `vite.config.ts` | Chunk graph: 1 cycle → **0**. Negative test (fix removed) → build fails naming `dex-app-core → app-notes → dex-app-core`. Packaged app: no boot exception, 170–192 DOM nodes |
| #6 | Lockfile regenerated during the dependency cleanup | `package-lock.json` | Root version 6.1.0, `@types/d3-force` present |
| #7 | Routed `dexnotes:pick-attachment-file` / `pick-import-file` to the native picker (above the prefix route) | `main.rs` | Invoking the channel in the packaged app opens the native **Open** dialog |
| #8 | Removed 13 packages (see E) | `package.json`, lock | 76 packages removed; `tsc` 0; tests: see J |
| #9 | Removed both dead functions | `power.rs`, `containment_ctl.rs` | Rust warnings 4 → 1 (remaining: `idle_ctl::suspend_on_battery`, an unimplemented setting) |
| #10 | Diagnostic report now includes WebView2 runtime/loader/arch/registry/env override and the startup-log path; stale build date removed. New IPC channel `diagnostics:getWebView2`. | `Settings.tsx`, `main.rs` | Channel returns live data in the packaged app (below) |

### Considered and reverted (measured)
I first allowed Tauri's custom-protocol IPC (`http://ipc.localhost`) in the CSP, because every `invoke` was being CSP-blocked and falling back to postMessage. A same-page A/B in the packaged app, forcing each transport via CDP request interception, showed **postMessage is ~5× faster on WebView2**:

| Transport | small call p50 / p95 | 100 KB payload p50 / p95 |
|---|---|---|
| custom protocol | 1.7 / 2.2 ms | 3.6–3.8 / 4.4–5.2 ms |
| postMessage (fallback) | **0.3 / 0.5–0.7 ms** | **1.6–2.0 / 2.3–3.1 ms** |

(2 launches × 200 small + 60 large calls each.) The CSP change was reverted, and `index.html` now documents why, so the one-time "IPC custom protocol failed" warning at boot isn't "fixed" into a slowdown later.

---

## D. WebView2 Status

| Item | Result |
|---|---|
| Runtime on this PC | Evergreen **156.0.4314.58**, per-machine (`HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-…}`, the standard location on x64). Per-user and non-WOW keys absent. |
| Why it "wasn't found" | It was found; the **DEX exe could not load `WebView2Loader.dll`** (GNU build, DLL not shipped). Exit `0xC0000135`. |
| Detection now | Loader API at startup (0.27–0.86 ms), plus registry probe (diagnostics only, lazily via `reg.exe` with `CREATE_NO_WINDOW`). Live output from the packaged app: `installed: true, version: 156.0.4314.58, linkage: static, processArch: x86_64, osArch: AMD64, registry: {machine-wow64: 156.0.4314.58}`. |
| Architectures | Detection is arch-agnostic (loader API). The shipped bundle is x64 only. The static loader supports x86/ARM64 too, but no x86/ARM64 build target is configured. |
| Missing runtime | Consent dialog → official Microsoft page; tested via `WEBVIEW2_BROWSER_EXECUTABLE_FOLDER` → empty folder (`0x80070002`). |
| Installer behaviour | Unchanged: NSIS/MSI use `embedBootstrapper`, Microsoft's official bootstrapper, run by the installer the user launched. It needs internet to fetch the runtime when it's absent. |
| Logs | `%LOCALAPPDATA%\com.onazioj.dex\logs\startup.log` (rotates at 256 KB) |
| Not tested | A real clean machine without WebView2 (simulated instead); an actual install of the new MSI/NSIS (built and verified, not installed, to avoid replacing your installed copy without asking; see I). |

---

## E. Debloat Results

**npm (done):** removed `better-sqlite3`, `@types/better-sqlite3`, `node-schedule`, `@types/node-schedule`, `ps-list`, `systeminformation`, `loudness`, `@tauri-apps/api`, `@types/dompurify`, `cross-env`, `happy-dom`, `lightningcss`, `concurrently`. Each was verified to have no imports or script users. `loudness` only appears as string literals. `systeminformation` only appears inside a `vi.mock` of a module nothing imports. `@tauri-apps/api` is unused because the app uses the global `window.__TAURI__` (`withGlobalTauri`). `dompurify` 3 ships its own types. Result: **76 packages removed; `node_modules` 331 MB → 277 MB (−54 MB)**; one native compile step (`better-sqlite3`) gone from installs. (`happy-dom` remains on disk only as vitest's optional peer.)

**Rust:** 2 dead functions removed (38 lines).

**Shipped artifacts (size):** see F.

**Measured but NOT deleted (needs approval, see I):**

| Location | Size | Nature |
|---|---|---|
| `DEX\src-tauri\target` (main checkout) | 18 GB | Rust build cache, regenerable |
| `DEX\native\target` | 3.0 GB | Electron-era N-API build cache |
| `DEX\core\target` | 2.8 GB | Rust build cache, regenerable |
| `%LOCALAPPDATA%\npm-cache` | **11.2 GB** | User-global npm cache, regenerable |
| `DEX\.claude\worktrees` | 6.9 GB | Agent worktrees (other sessions' work) |
| `src-tauri\target\release\bundle` | stale 6.0.1 NSIS/MSI next to 6.1.0 | old installers |
| WebView2 profile (`%LOCALAPPDATA%\com.onazioj.dex\EBWebView`) | 167 MB (HTTP cache 75, code cache 52, GPU 6) | Disposable caches; code cache helps startup |
| User data (`%APPDATA%\com.onazioj.dex`) | 106 MB | **Keep:** databases, backups, search index |

---

## F. Performance Improvements

| Metric | Before | After | Notes |
|---|---|---|---|
| Installed app starts | **No** (`0xC0000135`) | Yes | Different builds, 6.0.1 vs 6.1.0 + fixes |
| Packaged UI renders | **No** (boot ReferenceError, 21 DOM nodes) | Yes (170–192 nodes, 0 exceptions) | 7/3 local build vs final |
| Shell exe size | 60.9 MB (GNU, symbols embedded) | **37.9 MB** (MSVC) | −38% |
| NSIS installer | 19.3 MB (6.0.1) | **14.1 MB** (6.1.0) | Version content differs too |
| MSI installer | 25.3 MB (6.0.1) | **17.8 MB** (6.1.0) | Version content differs too |
| Eager startup JS (static closure of entry) | 6 chunks / 2,008 KB | **4 chunks / 1,888 KB** | Notes + DOMPurify no longer load at boot |
| IPC transport | postMessage (0.3 ms p50) | postMessage, kept deliberately | See C |
| WebView2 preflight overhead | — | 0.27–0.86 ms | Startup cost of the new check |
| `node_modules` | 331 MB | 277 MB | |
| Time-to-window | 3.7 s (single cold sample, freshly copied exe) | 0.79 / 0.85 / 1.49 s | **Not like-for-like**: the baseline sample was a first launch of a just-copied 60 MB exe; see `TIMING` note in J |
| Memory / idle CPU | 372 MB WS, 0.7% | 743–925 MB WS, 3.5–9.8% | **Not comparable**: the baseline renderer had crashed (nothing running). The after-number is the cost of the actual working shell, a Part-2 optimization target. |

---

## G. Remaining Problems

1. **In-app updates are not implemented** (stubs). A real updater (`tauri-plugin-updater`) needs a signing keypair whose private key you hold, plus a hosted update manifest. That's your decision (I).
2. **Idle cost of the live shell** (3.5–9.8% CPU, ~0.75–0.9 GB working set across 7–8 processes) is unmeasured against a working baseline because the baseline didn't render. One concrete lead: `PerformanceManager` polls `power:getStats` every 10 s, and that call does a full `sysinfo::System::new_all()` (every process, disk, network) plus a 200 ms sleep.
3. `native/` (N-API addon) can't run under Tauri but is still referenced by 3 tests and `vite.config.ts`. Removal needs a decision (I).
4. One startup console warning remains by design (IPC fallback, see C).
5. `idle_ctl::suspend_on_battery` is parsed but never acted on (unimplemented setting).
6. Duplicate update controllers (`update_ctl.rs` and `updates_ctl.rs` both implement `updates:*`; routing picks `updates_ctl`). Harmless but confusing.
7. Builds here are slow mainly because of the network (~150 KB/s, ~1.8 s DNS). The cold MSVC build took 45 min, incremental 5–7 min. Bundling also downloads the WebView2 bootstrapper on every MSI build, and one bundle attempt failed on a DNS error and succeeded on retry.

---

## H. Recommended Improvements

| Rank | Improvement | Impact | Effort | Risk |
|---|---|---|---|---|
| 1 | Re-release 6.1.x built by CI (MSVC) so installed users get a working app | Critical | Low | Low |
| 2 | Implement signed updates with `tauri-plugin-updater` | High | Medium | Medium (key custody) |
| 3 | Replace the 10 s `new_all()` pressure poll with a cached, cheap sampler (CPU+memory only) | Medium (idle CPU) | Low | Low |
| 4 | Add `[profile.release]` to `src-tauri` (`lto = "thin"`, `codegen-units = 1`; **not** `panic = "abort"`, which would defeat the `dex_ipc` panic guard). Measure size/startup against build time. | Medium | Low | Low |
| 5 | Split `dex-app-core` (1.57 MB eager) carefully, with the new cycle guard as a safety net | Medium | High | Medium |
| 6 | Add an x86/ARM64 bundle target if those users matter | Low–Medium | Low | Low |
| 7 | Consolidate `update_ctl.rs` / `updates_ctl.rs` | Low | Low | Low |

---

## I. Approval Required

Nothing below has been done.

1. **Reclaim ~24 GB of Rust build caches** in the main checkout (`src-tauri/target` 18 GB, `native/target` 3 GB, `core/target` 2.8 GB): `cargo clean` per crate. Fully regenerable; the next build is a cold build (45 min on this network).
2. **Clear the 11.2 GB npm cache** (`npm cache clean --force`). It's user-global, so it affects all your Node projects, which will re-download packages.
3. **Install the fixed build** over your installed 6.0.1 (`src-tauri\target\release\bundle\nsis\DEX_6.1.0_x64-setup.exe`). User data in `%APPDATA%\com.onazioj.dex` is not touched by the installer, but it is your call.
4. **Remove `native/`** (Electron N-API addon, its 3 tests and the `vite.config.ts` reference).
5. **Updater signing key** creation and custody (for H-2).
6. Remove stale 6.0.1 installers from `src-tauri\target\release\bundle`.

No Windows components, services, registry entries, drivers or security settings were changed. No system-wide cleanup was performed.

---

## J. Final System Health

- **Working:** release build (MSVC) → NSIS + MSI; the exe starts, detects WebView2, renders the full shell with no boot exception; IPC on the fast path; single instance; Notes file picker; startup log; diagnostics channel.
- **Repaired:** WebView2Loader.dll startup failure (root cause + build gate + bundle gate), boot-time chunk-cycle crash (+ permanent build guard), silent exits/hangs (preflight, fatal dialog, watchdog), duplicate instances, out-of-sync lockfile, orphaned Notes picker, stale diagnostic info.
- **Removed:** 13 npm packages (76 incl. transitive, −54 MB), 2 dead Rust functions.
- **Still broken / missing:** in-app updates (stub); live-shell idle cost not yet optimized.
- **Still needs testing:** install of the new NSIS/MSI on a clean VM without WebView2; ARM64 hardware.
- **Next:** approve items in I; re-release via CI; then H-2/H-3.

### Test evidence

| Check | Result |
|---|---|
| `tsc --noEmit` | exit 0 (before and after) |
| Watermark lint | OK, 2,265 files |
| vitest (full) | before: 498 files / 5,311 passed / 14 skipped · after: **499 files / 5,313 passed / 14 skipped, exit 0** (+1 file, +2 tests: the new bundle-gate tests) |
| `cargo test --release webview2` | **3/3 passed** (`log_path_is_under_identifier`, `status_json_has_stable_shape`, `detects_runtime_consistently_with_error_field`) |
| `tauri build` (MSVC) + bundle gate | pass (NSIS 14.1 MB, MSI 17.8 MB, no `WebView2Loader.dll` import) |
| Cycle guard negative test | build fails as intended |
| Runtime: normal start, missing runtime, watchdog, single-instance, Notes picker | all as described in C/D, on the packaged exe |
| Same-page IPC A/B | see C |

TIMING: time-to-window samples are single launches on a loaded machine (other builds/tests running). They show the app reaches a window in under 1.5 s; they are not a controlled before/after benchmark.
