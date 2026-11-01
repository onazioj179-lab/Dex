# DEX Tauri — Part 2 Improvement Report

**Date:** 2026-11-01 · **Branch:** `claude/dex-tuari-repair-optimize-756d99` (Part 1 = commit `57aa120`, see `DEX_TUARI_SYSTEM_AUDIT_REPORT.md`)
**Machine:** Windows 11 Pro 26300, 8 logical cores, WebView2 156.0.4314.58. All numbers are from the packaged release build on this machine. The environment was noisy (other sessions building under `Documents\DEX`), so where a comparison isn't controlled, that's stated.

---

## 1. Executive Summary

Part 2 went where measurement pointed. The biggest finding was performance: **the idle app burned 50–100% of a CPU core continuously**. Stack sampling with the build's PDB traced it to the search engine (tantivy) re-indexing and re-merging on every launch. After the fix, the shell idles at **~1–2% of a core** in the Rust process and **1.35% of the machine** overall. The privacy pass found real problems: fake security and privacy toggles, a Location setting that wasn't enforced, a silent transfer of UKI messages to a third party, and a policy that doesn't match the product. The Storage page was replaced with a measured, working cleanup. Light mode, which rendered unreadable text, was fixed. App tiers and an Essentials default for new setups were added.

Not done in this pass (detail in §14): the broad visual refinement (radius/color sweep, shell modernization), a new motion system, a keyboard-navigation audit, and true downloadable app modules (which need hosting and signing decisions).

## 2. Modular Applications

| Tier | Count | Apps |
|---|---|---|
| Core (cannot be removed) | 6 | home, settings, store, files, browser, taskmanager |
| Recommended (new setups) | 16 | notes, tasks, calendar, calculator, weather, worldclock, timer, gallery, audio, transfers, security, backup, recyclebin, maps, pdfviewer, inbox |
| Optional (one click in the Store) | 37 | creative suite (Axl, Imosion, Prism, Flux, Forge, video editor, canvas, pixel art, color picker), developer tools (DexCode, Git, SSH, Env, Nexus, workflows, …), niche utilities |

- **Essentials default:** finishing first-run onboarding applies the preset (22 of 59 apps visible). Existing users never re-run onboarding, so **nobody's app list changes on update**. Onboarding stays two screens, per the owner's earlier decision.
- **Store:** each app shows its tier, and removable apps explain what Remove really does: it hides the app, data is kept so reinstalling restores everything, and it frees **no** disk space.
- **Honest limitation:** every app's code ships inside the 37.9 MB exe. True download-on-demand modules need a trusted hosting location, a signing key and verification before loading code into the privileged webview. That's an owner decision (§14).
- Files: `store/installedAppsStore.ts` (`appTier`, `RECOMMENDED_APP_IDS`, `essentialsRemovedSet`, `applyEssentials`), `components/Onboarding.tsx`, `pages/Store.tsx`.

## 3. Debloat Results

| Item | Result |
|---|---|
| Search index on disk | 24 segments / 148 files / **48 MB** → 3–4 segments / **37 MB** (merges now complete instead of being abandoned) |
| Dead code | UKI Hugging Face fallback function + its CSP entry; the fake Storage controls; 10 fake security/privacy toggles and the invented "Security Status" panel; 19 stale Settings search entries |
| Startup network | Removed the Google Fonts DNS prefetch (2 lookups to Google per launch, for fonts DEX never loads) |
| (Part 1) | 13 npm packages / 76 incl. transitive, −54 MB `node_modules`; 2 dead Rust functions |

## 4. Cache Investigation (the "24 GB")

Measured, not assumed:

| Location | Size | What it is |
|---|---|---|
| `Documents\DEX\src-tauri\target` | **18 GB** | Rust build cache (developer machine only) |
| `Documents\DEX\native\target` | **3.0 GB** | Electron-era N-API build cache |
| `Documents\DEX\core\target` | **2.8 GB** | Rust build cache |
| **Subtotal** | **≈ 23.8 GB** | **This is the "24 GB": developer build caches, not the DEX app** |
| `%LOCALAPPDATA%\npm-cache` | 11.2 GB | User-global npm cache |
| `Documents\DEX\.claude\worktrees` | 6.9 GB | Agent worktrees |
| `~\.cargo\registry` | 1.4 GB | Rust crate sources |

What the **installed app** itself uses (from the new Storage panel, verified on disk):

| Category | Size | Kept / disposable |
|---|---|---|
| Databases | 1.2 MB | Kept |
| Search index | 39 MB | Kept (rebuildable) |
| Web storage (Local Storage/IndexedDB = settings) | 0.08 MB | Kept |
| Script code cache | 60 MB | Kept (speeds startup) |
| Web engine cache (HTTP + GPU/shader) | **93 MB** | Disposable |
| Logs | 3 KB | Disposable |

**Cleanup performed on the app's caches (tested end to end):** HTTP cache 74.6 MB → 0. GPU cache cleared and regenerated (1.6 MB). Code cache and Local Storage untouched, and a settings probe value survived. Log line: `storage: cleared web caches, freed 90953 KB`. **No developer cache was deleted.** That needs your approval (§14). Chromium already caps and evicts its own disk cache; DEX caches don't grow unbounded (`startup.log` rotates at 256 KB).

## 5. UI Refinement

- **Light mode was unreadable, now fixed.** Presets write text/background colors inline on `<html>`, but six different code paths flip `data-theme` (index.html pre-paint, App.tsx, `utils/theme` incl. OS-follow, `useStore`, Settings, command palette). Measured: switching to light gave **1.00:1** text contrast; booting with light saved gave **1.34:1**. Fix: one `MutationObserver` keeps the preset in step with `data-theme`, whoever sets it (`installSchemePresetSync`). Settings now also pins an explicit Dark Mode choice, which `utils/theme` previously ignored in favor of the OS. Result in the worst case (stale dark preset + light saved): primary **20.1:1**, secondary **10.5:1**.
- **Light `--color-text-muted`** `#8E8E93` (2.9–3.3:1, fails AA) → `#6C6C70` (4.7–5.2:1).
- **Radius scale kept on purpose.** The existing tokens (`xs 4 / sm 6 / md 8 / lg 11 / xl 14 / 2xl 18 / full`) are *tighter* than the suggested table (`10/14/18/24`). Your standing direction is "sharp, not large", and Part 2 itself asks for "a tighter visual system". A per-component hardcoded-radius sweep was not done in this pass.
- No color-token or component restyle sweep was done beyond the above.

## 6. Motion System

Not changed. The token system already exists in `design-system.css` (`--duration-fast 40ms`, `normal 80ms`, `slow 120ms`, `--motion-window-open 220ms`, `--motion-panel-expand 200ms`, `--motion-dock-*`, easing tokens), and reduced-motion is applied at boot via `initComfort()`. Idle profiling found **0 running CSS animations** and JS busy at **0.15% of a core**, so there is no animation performance problem to fix.

## 7. Shell Improvements

- **Settings › Storage & Data:** rebuilt with measured usage and working cleanup (`pages/settingsPanels/StoragePanel.tsx`, `src-tauri/src/storage_ctl.rs`).
- **Settings › Privacy & Security:** fake controls replaced with a factual "How DEX protects you" block (§8). Added an "Open Windows Security" button.
- **Store:** tiers + honest removal note (§2).
- Desktop/dock/window-manager/control-center modernization was **not** done.

## 8. Privacy Audit

| Finding | Severity | Action |
|---|---|---|
| **Silent third-party transfer:** with no AI provider configured, UKI POSTed the user's message + context (foreground app, open apps, local time) to Hugging Face's keyless API | High | **Removed.** The endpoint no longer resolves (`curl` exit 6), so it never answered anyway |
| **Location Services ignored:** Maps' "My location" read the position even with the setting off (default off) | High | **Enforced.** Off → explains how to enable; nothing is read |
| **Fake security controls:** "Built-in Firewall", "Anti-Hacker Protection", "Malware Protection", "Sandbox Applications", "VPN Protection", "Protect Stored Data", "Require on Wake", "Wi-Fi Protection", "Block Tracker Domains", "Strict Security", plus a status panel showing "Active"/"Protected"/"Active monitoring" | High (misleading) | **Removed.** Replaced with facts: lock screen (Argon2id), Vault (AES-256-GCM, key never stored), malware/firewall = Windows Security |
| "Crash Reports: Send crash reports" toggle; nothing is sent anywhere | Medium | Replaced with the truth: kept on device, nothing sent |
| Fake Storage controls + "Clear Cache" that cleared nothing but reported success | Medium | Replaced (§4) |
| Google Fonts DNS prefetch on every launch | Low | Removed |
| UKI time/dictionary/currency answers and Maps Satellite/Topo styles were **CSP-blocked** (broken) | Functional | CSP allows exactly those hosts, documented in `index.html` |
| Third-party SDKs | — | **None.** No analytics/telemetry/crash/ad SDK. Network capture: **0 external requests** at launch + 30 s idle |
| `PRIVACY.md` over-claims (diagnostics/analytics/provider sharing that don't exist) and omits the real user-triggered services | High (legal accuracy) | **Not edited. Needs approval** (re-acceptance implications). Factual inventory + exact gaps: `docs/privacy/DATA_FLOWS.md` |
| Cookie banner | — | **Not needed:** no non-essential tracking technology |
| Refund policy | — | **Not applicable:** `PAYMENTS_ENABLED = false` ("Free — all features included"). Required before enabling payments |
| Form consent | — | Onboarding keeps optional analytics **off** and doesn't pre-check it; no marketing consent exists |

## 9. Children's Privacy

DEX is local-first: no server-side accounts, ads, analytics, social graph or behavioral tracking. Location is off by default and stays on-device. The policy says it is not directed at children under 13. **No age-assurance mechanism is proportionate** for today's feature set, and none was added; no birthdates or IDs are collected. Re-assess before shipping cloud accounts, collaboration or payments, and confirm against each market's store rating rules. **Legal review required** for the final wording.

## 10. Accessibility

Contrast measured from the live app's resolved tokens:

| Token on base | Dark | Light (after fixes) |
|---|---|---|
| text-primary | 18.72:1 ✓ | 20.12:1 ✓ (was 1.00 / 1.34) |
| text-secondary | 7.63:1 ✓ | 10.48:1 ✓ |
| text-tertiary | 5.99:1 ✓ | 5.74:1 ✓ |
| text-muted | 7.51:1 ✓ | 4.68–5.23:1 ✓ (was 2.92–3.26) |
| accent / error / success / warning | 10.2 / 5.7 / 8.8 / 9.5 ✓ | 4.0 / 5.2 / 4.2 / 5.1 ✓ (≥3:1) |
| `--color-border` | 1.2–1.3:1 | 1.5–1.7:1 |

`--color-border` passes WCAG 1.4.11 only where it's decorative; any control whose *only* boundary is that border fails 3:1. That needs a per-component check, which was **not done**. The new Storage panel uses table/row/cell roles and a `status` live region. **Keyboard-navigation audit: not run.**

## 11. Performance Benchmarks

Rust process CPU per 10 s slice after launch (`cpu-timeline.ps1`):

| | Before | After |
|---|---|---|
| First 10 s | 117–258% of a core | 14–17% (first launch after update: 48% incl. one-time 24→3 segment compaction) |
| Steady idle | **50–100%** of a core, continuous | **0.6–2.8%** of a core |
| Launch-time `search:sync` | full clear + re-index (~80 CPU-s) | incremental: 1.6 s walk, 0–1 files |

Whole app, all 7 processes, 30 s idle window:

| | Part-1 build | Part-2 build |
|---|---|---|
| CPU | 7.01% of machine (56.1% of a core) | **1.35%** of machine (10.8% of a core) |
| Working set | 743 MB | **617 MB** |
| Rust process | 35% of a core / 68 MB | **1.8%** / 40 MB |

Root causes, each fixed and tested:
1. The launch-time `search:sync` diffed against an in-memory snapshot that's empty every launch, so it **rebuilt the whole index each launch**. The snapshot is now persisted inside the index dir (loaded lazily, written atomically, only when changed, trusted only when the index has docs).
2. A **new tantivy reader per search/count** re-parsed `meta.json` and spawned a watcher thread each time. Now one shared reader with manual reload.
3. A **new writer + commit per file** fragmented the index into 24 segments, and their merges were abandoned on exit and redone. Now one batch commit per burst, waiting for merges.
4. The file watcher reacted to churn in `node_modules`/`target`/`.git` (which the index never contains) with full walks. Events are now filtered with the scanner's own skip rules (relative to the watched root), edits update only the changed paths, and full syncs are spaced at least 30 s apart.

Bundle: exe 37.9 MB, NSIS 14.1 MB, MSI 17.7 MB (unchanged vs Part 1).

## 12. Files Changed

**New:** `src-tauri/src/storage_ctl.rs`, `src/renderer/pages/settingsPanels/StoragePanel.tsx`, `docs/privacy/DATA_FLOWS.md`, `tests/unit/theme-scheme-sync.test.ts`, this report.
**Modified:** `core/dex-search/src/lib.rs`, `core/dex-scanner/src/lib.rs`, `src-tauri/src/main.rs`, `src/renderer/{App.tsx, main.tsx, index.html}`, `components/{ThemeManager, Onboarding, UkiOverlay}.tsx`, `pages/{Settings, Store}.tsx`, `pages/settingsPanels/settingsSearchIndex.ts`, `store/{installedAppsStore, useStore}.ts`, `DEXAPPLICATIONS/standalone/Maps.tsx`, `styles/design-system.css`, `tests/unit/installed-apps.test.ts`.
**Deleted files:** none.

## 13. Tests

| Check | Result |
|---|---|
| vitest (full) | **499 files / 5,317 passed**, 14 skipped, 0 failed (Part-1 baseline 5,313) |
| `theme-scheme-sync.test.ts` (added after that run) | 3/3 |
| `cargo test -p dex-scanner -p dex-search` | 10/10 + 10/10 (new: ignore rules, batch apply) |
| Rust shell unit tests (`cargo test --release --bin dex-tauri`) | **60/60** (incl. 3 new `storage_ctl`: clears only listed dirs, leaves in-use dirs alone, sizes) |
| `tsc --noEmit` / watermark lint | 0 / OK (2,267 files) |
| `npm run build:tauri` + bundle gate | pass |
| Runtime on packaged exe | index create/delete found/removed within 5 s; storage cleanup end-to-end; network capture 0 external; contrast audits; CPU timelines |
| Not run | keyboard/screen-reader audit, axe-core, clean-VM install, ARM64 |

## 14. Remaining Issues (prioritized)

1. **`PRIVACY.md` / in-app policy summary are inaccurate.** Needs your approval and probably legal review; a version bump triggers re-acceptance. Inputs ready in `docs/privacy/DATA_FLOWS.md`.
2. **Downloadable app modules:** needs hosting + signing-key decisions (the same key question as the updater in Part 1).
3. **Developer caches (~24 GB) + npm cache (11.2 GB):** reclaimable with `cargo clean` / `npm cache clean --force`, but **only with your approval**.
4. Visual sweep (hardcoded radii/colors), shell modernization, keyboard audit, border contrast on controls: not done.
5. `shell:openExternal` opens any target (including executables) via the OS. Restrict it to `http(s)`/`mailto`/known schemes.
6. 70 of 149 Settings keys are read by nothing outside Settings (found by checking each `DEFAULT_SETTINGS` key for any reference elsewhere in `src/`). The security/privacy ones were removed; the rest (e.g. display resolution/refresh rate, audio balance, Bluetooth mode, download limits, autofill) are harmless no-ops but still promise behavior that doesn't happen.

## 15. Next Steps

| Rank | Step | Impact | Effort | Risk |
|---|---|---|---|---|
| 1 | Approve + publish the corrected Privacy Policy (bump version) | High (legal) | Low | Low |
| 2 | Allowlist `shell:openExternal` schemes | High (security) | Low | Low |
| 3 | Remove/implement the remaining no-op Settings | Medium | Medium | Low |
| 4 | Keyboard + screen-reader audit of Settings, Store, dock | Medium | Medium | Low |
| 5 | Signed module hosting → real on-demand apps + updater | High | High | Medium |
| 6 | Hardcoded radius/color sweep with a lint guard | Medium | Medium | Low |
