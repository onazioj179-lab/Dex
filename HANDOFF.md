# DEX Handoff

Operational state of the DEX desktop platform. Update this file at the end of
every working session. Keep it short, current, and actionable.

Current version: **4.60.2** · Working branch: `claude/test-coverage-analysis-vYvyJ`

---

## Main Goal

Production stabilization and ecosystem polish, not new features. The
immediate objectives are:

1. **Multi-window stability** — predictable z-order, no orphaned overlays,
   minimized windows always restorable.
2. **Cross-platform shell parity** — keyboard shortcuts, window chrome,
   and dialog patterns render correctly on macOS and Windows.
3. **Release lifecycle hygiene** — retention enforced (current + 2 priors),
   prune step cross-platform, stale caches reclaimed.
4. **Workflow calm** — no native `confirm`/`prompt`, no auto-popping tips,
   no dead modals.

---

## Current System State

| Area | Status |
| --- | --- |
| Shell (FloatingWindow, snap, depth) | Stable. Snap engine tested. Persistence debounced at 220ms. |
| Compositor | No flicker reports. Reduce-motion respected via `MotionController`. |
| Update lifecycle | `ReleaseManager` is the single source of truth; deprecated `UpdateController` throws at import. `pruneInstallHistory` keeps current + 2 priors. |
| Release retention | GitHub releases pruned to newest 3 by `scripts/prune-releases.js` (and `.ps1` sibling). Wired into `scripts/release.js`. |
| UI/UX | Native dialogs eliminated app-wide. Caps Lock warning on LockScreen. Platform-aware shortcut symbols (⌘ vs Ctrl) throughout. |
| Performance | No `useEffect` without deps. Toast 3s auto-dismiss. Stage manager 800-1200ms auto-hide. Dock 450ms overshoot grace. |

---

## Files & Systems Recently Modified

Production shell:
- `src/renderer/components/AppManager.tsx` — removed dead What's New modal block; cleaned auto-dismiss timer. Added minimized-window restore popover in activities strip (see Minimized-window discoverability below).
- `src/renderer/components/MiniPulse.tsx` — z-index reset from `2,147,483,000` to `8,500` (sits below the focus-session overlay at `99,998` so it never traps Focus Mode controls).
- `src/renderer/components/HelpOverlay.tsx` — removed `QuickTipBanner` (auto-popping tip spam).
- `src/renderer/components/LockScreen.tsx` — added Caps Lock detection.
- `src/renderer/components/SystemFeatures.tsx` — removed `useSessionAutoSave` hook (wrote `dex-session` every 30s with no reader; window restore is owned by `WindowManifest`).
- `src/renderer/App.tsx` — dropped the `useSessionAutoSave()` call site.
- `src/renderer/shell/FloatingWindow.tsx` — platform-aware traffic-light / system-button chrome; **resize-drag listeners now cleaned on unmount** via a `resizeCleanupRef`, fixing the document-listener leak that occurred when a window was closed mid-resize.
- `src/renderer/utils/MotionController.ts` — `initReduceMotion()` now honors the `dex-reduce-motion` localStorage override the system menu was setting (the toggle previously did nothing).
- `src/renderer/core/UniversalCore.ts` — `getKeyCombo` now maps macOS Cmd → ctrl so bindings fire on Mac.

Native-dialog migration (window.confirm / window.prompt → in-app input/ConfirmDialog):
- `src/renderer/pages/TaskManager.tsx` (process kill / force kill)
- `src/renderer/pages/Files.tsx` (new folder)
- `src/renderer/pages/Audio.tsx` (new playlist)
- `src/renderer/components/NexusBiometrics.tsx` (enroll label / revoke)
- `src/renderer/components/PluginMarketplace.tsx` (install / uninstall)
- `src/renderer/components/Onboarding.tsx` (quit)
- `src/renderer/DEXAPPLICATIONS/imosion/Imosion.tsx` (save chain preset)
- `src/renderer/DEXAPPLICATIONS/rewind/Rewind.tsx` (focus goal)

Z-index ladder:
- `src/shared/zIndex.ts` *(new)* — single source of truth for all stacking layers. Named constants from `Z_FLOATING_WINDOW_BASE` through `Z_FOCUS_SESSION_TOP`. Migrated all hardcoded values in `MiniPulse`, `DiagnosticsPanel`, `HelpOverlay`, `PolicyViewer`, `Onboarding`, `SystemFeatures`, and `FocusSessionSystem`.

Onboarding prefs wiring:
- `src/renderer/components/Onboarding.tsx` — `handleComplete` now fires `diagnostics:setPreferences({ crashReportingEnabled })` and `updates:setPreferences({ autoCheck })` via IPC so the crash-reporting and auto-update toggles actually take effect. Previously only `analytics` was wired downstream.

Release tooling:
- `scripts/prune-releases.js` *(new)* — Node-based, cross-platform; uses `gh` CLI. `--repo <owner/name> --keep N [--dry-run]`.
- `scripts/release.js` — switched prune step from PowerShell to Node so Linux/macOS release runners can execute the retention pass without a `pwsh` install.
- `scripts/prune-releases.ps1` — kept as parity sibling for Windows-only invocations.

Release cache reclaim:
- `src/main/core/ReleaseManager.ts` — new `pruneCache(maxAgeMs)` method removes files older than 7 days from `tmp/dex-cache`, preserving the currently-downloaded artifact. Scheduled at startup (30s delay) and every 24h via `setInterval`. Disposed in main shutdown sequence (`releaseManager.dispose()`). New IPC channel `updates:pruneCache` for manual trigger.
- `src/main/preload.ts` — `dexUpdates.pruneCache()` exposed to renderer.
- `src/main/main.ts` — `releaseManager.dispose()` wired into `before-quit` shutdown chain.

Settings ↔ Onboarding sync:
- `src/renderer/pages/Settings.tsx` — `crashReports` toggle now fires `diagnostics:setPreferences({ crashReportingEnabled })` via IPC, matching what Onboarding wrote. A new mount-time effect reads `diagnostics:getPreferences` and reconciles the displayed state with the main-process source of truth.

Minimized-window popover — keyboard access:
- `src/renderer/components/AppManager.tsx` — popover auto-focuses first entry on open; ArrowUp/ArrowDown wrap-navigate entries; Escape closes; outside-click handler now uses a containment check via `minimizedListRef` so clicking inside the menu doesn't dismiss it. Popover z-index pulled into the named ladder (`Z_DROPDOWN_BASE + 500`).

---

## Problems Already Investigated

- **What's New modal**: was permanently disabled via `useState(false)` with an
  inline comment ("z-index 99998 blocks all interaction"). The proper
  `WhatsNewModal` component already handles this flow via its own storage
  key. The dead block in AppManager is gone.
- **`UpdateController`**: deprecated in v2.0.1; throws on construction.
  Do not re-introduce. All `updates:*` IPC channels are served by
  `ReleaseManager`.
- **MiniPulse z-index**: was at near-`Int32.MaxValue`, blocking interaction
  with anything above 9000. Fixed.
- **`showTips` flag in `creative-suite.ts`**: declared but never consumed.
  Left as-is — removing requires renderer/main type alignment and isn't
  worth a churn cycle.

---

## What Failed & Why

- **Auto-dismissing modals**: any timer-based auto-dismiss on a primary
  modal (e.g. What's New at 10s) is a footgun — users mid-action lose the
  dialog without consent. Pattern removed.
- **Native `window.confirm` for in-app destructive actions**: ugly,
  ignores DEX theme, blocks the main thread. Replaced with `ConfirmDialog`
  (destructive tone, focus-trapped, Esc/Enter wired).
- **Hardcoded shortcut strings (`'Ctrl+K'`)**: misleading on macOS,
  blocked Cmd-bound shortcuts from firing at all in `UniversalCore`.
  Codebase now derives modifier from `platform.isMac` at module load.

---

## Next Steps

In priority order:

1. **Migrate remaining hardcoded z-index integers** — a few non-critical
   call sites still use raw numbers (`Browser.tsx`, `MediaBrowser.tsx`,
   `useFileDrop.ts`, `TouchInputSystem.ts`, `CreativeAppsSnappy.ts`).
   Migrate to the named constants from `src/shared/zIndex.ts` so the
   ladder stays honest as new layers are added.
2. **Surface cache-reclaim in Settings → About** — `dexUpdates.pruneCache()`
   exists over IPC. Add a "Clear update cache" button to the Settings →
   Updates section that surfaces the freed-bytes return value to the user.
3. **Verify cache prune across real upgrade cycles** — the 7-day age cap
   and protected-current-artifact logic is correct on paper. Run a real
   update + relaunch to confirm `downloadedArtifactPath` survives a
   prune cycle.
4. **HANDOFF.md cadence** — every session must update this file in the
   final commit.

## Completed Items (session 2026-05-28)

- **Minimized-window discoverability** — "N minimized" in the activities
  strip is now a clickable button that opens a per-app restore popover.
  Each entry shows the app's accent color dot and name; clicking restores
  and focuses that app. Popover dismisses on outside click and Escape;
  ArrowUp/Down wrap-navigate entries; auto-focuses first entry on open.
- **`dex-onboarding-prefs` wiring** — `handleComplete` in `Onboarding`
  now calls `diagnostics:setPreferences({ crashReportingEnabled })` and
  `updates:setPreferences({ autoCheck })` over IPC. Settings page reads
  the same `diagnostics:getPreferences` on mount and writes back when the
  `crashReports` toggle flips, so the two surfaces stay in sync.
- **Z-index constants** — `src/shared/zIndex.ts` created with the full
  named ladder. Migrated: `MiniPulse`, `DiagnosticsPanel`, `HelpOverlay`,
  `PolicyViewer`, `Onboarding`, `SystemFeatures`, `FocusSessionSystem`,
  and the AppManager minimized-window popover.
- **Release cache reclaim** — `ReleaseManager.pruneCache()` removes
  installer downloads older than 7 days from `tmp/dex-cache`, preserving
  the active artifact. Runs at startup (30s delay) and every 24h. IPC
  channel `updates:pruneCache` exposed via preload as
  `dexUpdates.pruneCache()`. Disposed cleanly in shutdown sequence.

---

## Release Readiness Status

| Item | State |
| --- | --- |
| CI: Lint & Type Check | Green on `main` after merge of PR #1. |
| CI: Build | Green on `main`. |
| CI: Unit Tests | Last run was in-progress at session end; merged anyway. Re-verify. |
| Native dialogs in production code paths | None remain. |
| Cross-platform shortcut display | Verified across spotlight, palette, help, onboarding, dock, creative apps. |
| Release retention pruning | Cross-platform script in place; needs one real-world run to validate. |
| Crash recovery | Untouched this phase. `CrashRecoverySystem.ts` owns it. |

Known risks for the next release:

- The Cmd-key fix in `UniversalCore.getKeyCombo` is behaviorally
  significant on macOS — any user remap that previously didn't fire
  will start firing. Smoke-test the macOS build before shipping.
- `prune-releases.js` requires `gh` to be authenticated on the release
  runner. CI runners that ran the PowerShell version had this; verify
  the Linux release runner does too.

---

## Important Development Rules

- No unnecessary test files — write tests when a real bug needs locking
  down, not as filler.
- No junk architecture — refine existing systems; do not duplicate.
- No placeholder code — every committed line must do something useful.
- Patch real production systems only.
- Keep repositories clean and maintainable.
- Always update HANDOFF.md at the end of a session.
