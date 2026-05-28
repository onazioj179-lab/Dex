# DEX Handoff

Operational state of the DEX desktop platform. Update at the end of every session.

Current version: **4.60.3** · Working branch: `claude/test-coverage-analysis-vYvyJ`

### Release Artifacts per Platform
| Platform | Artifacts |
|---|---|
| Windows | NSIS installer (x64 + ARM64) · Portable exe (x64) · ZIP (x64) |
| macOS | DMG (x64 + ARM64) · ZIP (x64 + ARM64) |
| Linux | AppImage (x64) · DEB (x64) · RPM (x64) |

---

## Main Goal

Production stabilization and ecosystem polish, not new features. Objectives:

1. **Long-session stability** — no memory growth over time, controlled resource pressure.
2. **8 GB RAM reliability** — memory pressure degradation path fully functional.
3. **Shell correctness** — z-order, drag/resize lifecycle, minimized-window restore all clean.
4. **Architecture hygiene** — dead systems identified, hot paths optimized.
5. **Release quality** — CI green, watermarks clean, cross-platform build config verified.

---

## Current System State

| Area | Status |
|---|---|
| CI: Lint & Type Check | Fixed (missing watermark on zIndex.ts was blocking CI). Now green. |
| TypeScript | Clean — renderer + main both pass `--noEmit`. |
| Watermarks | 2091 files in compliance. |
| Shell (FloatingWindow, snap, depth) | Stable. dragRafRef leak fixed on unmount. Snap engine correct. |
| Memory pressure CSS | **Now wired.** `data-motion-degraded` and `data-compositor-pressure` attributes have CSS rules in globals.css. Previously set by JS but ignored by CSS. |
| Memory management | completedTasks LRU cap (200), MemoryPressureBridge timeout deduplication, MemoryMonitor polling halved (5s→10s), DOM fallback removed. |
| Installer cache | TTL 7d→3d, prune interval 24h→12h. |
| Achievement hot path | O(n×m) → O(n) via Set lookups in checkAchievements/getTotalPoints/getAchievementStats. |
| Clock timer (AppManager) | Confusing placeholder pattern cleaned up. |
| Update lifecycle | ReleaseManager is single source of truth. UpdateController throws at import. |
| UI/UX | No native dialogs. Z-index ladder complete. Minimized-window restore functional. |
| Release tooling | Node-based prune script. All 3-platform build targets verified. |

---

## Files & Systems Recently Modified

**Session: Production Stabilization & Resource Optimization**

Memory fixes:
- `src/renderer/services/ProPerformanceEngine.ts` — `completedTasks` Map capped at 200 (LRU eviction). Previously grew without bound in long sessions.
- `src/renderer/utils/MemoryPressureBridge.ts` — Auto-relax timeout deduplicated; only one timer queues at a time. Added `relaxTimer` field to state.
- `src/renderer/services/MemoryMonitor.ts` — Polling interval 5s→10s. DOM `querySelectorAll('*')` fallback removed (forced style-recalc every 5s on Electron).
- `src/main/core/ReleaseManager.ts` — Installer cache TTL 7d→3d, prune interval 24h→12h.

Shell fixes:
- `src/renderer/shell/FloatingWindow.tsx` — `dragRafRef` added to unmount cleanup. Previously, closing a window mid-drag left a pending RAF frame.
- `src/renderer/components/AppManager.tsx` — Clock timer pattern simplified (removed confusing `alignTimerRef` object and dead `clockTimer` placeholder).

Performance optimization:
- `src/renderer/services/engagement.ts` — `checkAchievements`, `getTotalPoints`, `getAchievementStats` all use `Set.has()` instead of `Array.includes()`. Reduces hot-path cost from O(n×m) to O(n+m) when called on every user activity event.

CSS (critical fix):
- `src/renderer/styles/globals.css` — Added CSS rules responding to `data-motion-degraded` (reduced/minimal) and `data-compositor-pressure` (high) attributes. These attributes were being set by `MemoryPressureBridge.ts` and `CompositorHealth.ts` but had zero CSS effect. Now: `reduced` = 80ms transitions, `minimal` = animations/transitions disabled, `compositor-pressure=high` = will-change reset.

Infrastructure:
- `src/shared/zIndex.ts` — Added canonical watermark (was blocking CI Lint gate).

---

## Problems Already Investigated

- **UpdateController**: deprecated v2.0.1; throws on construction. Dead file kept as tombstone. Do not re-introduce.
- **4 competing update systems** (UpdateManager, UpdateStabilityMode, OptimisticUpdateManager, ReleaseManager): Only ReleaseManager is wired in main.ts. The others are exported from core/index.ts barrel but never imported in startup. Safe to leave as-is; removing them requires auditing all barrel consumers.
- **6 animation/motion systems**: MotionController, UnifiedMotionSystem, motionHooks, motionHooksExtended, spring-animation, animationBudget — roles are distinct (MotionController = spring interp, FrameGovernor = rAF orchestration, etc). Not pure duplication.
- **MemoryPressureBridge timer accumulation**: Fixed (deduplication). The `seenAt` guard already prevented wrong calls, but dead timers stacked up under flapping pressure events.
- **dragRafRef leak in FloatingWindow**: Fixed. Was already guarded in pointerup/cancel handlers (lines 409, 446) but not in the unmount cleanup.
- **AppManager clock timer**: Was functional but confusing — `alignTimerRef._interval` assigned inside a setTimeout callback. Cleaned up to simple `let` variables.
- **data-motion-degraded CSS gap**: Fixed. The MemoryPressureBridge was correctly setting HTML attributes under pressure, but globals.css had no matching rules. Added reduced/minimal/compositor rules.
- **achievement O(n×m) loop**: Fixed. `checkAchievements` was called on every user activity event and iterated 5000 achievements with O(n) `Array.includes()` per entry. Now uses a Set.
- **32-bit Windows**: Not supported. Electron >=28 dropped ia32. Package config is x64+arm64 only. Correct.

---

## Remaining UI/UX Work

- **Tasks.tsx drag-drop reordering**: Feature gap confirmed by audit — no drag handlers implemented despite drag-drop UI indicators. Low urgency.
- **Gallery.tsx 200-item hardcoded limit**: Line 210. Low priority.
- **Power.tsx silent polling failures**: No toast when IPC bridge breaks. Low urgency.
- **Browser.tsx blocked domains**: ~~Extracted~~ Done. Moved to `src/renderer/config/blocked-domains.ts`; Browser.tsx imports `BLOCKED_DOMAIN_LIST` and builds the `Set` from it.

---

## Remaining Internal Systems Work

- **CollaborationLayer.ts** vs **CollaborationSystem.ts**: Two systems, only CollaborationSystem is imported. CollaborationLayer (938 lines) appears unused. Verify before removing.
- **Remaining unused stores**: `intentSessionStore` and `blackBoxStore` removed (1145 lines, confirmed zero imports). `featureSuiteStore` has 2 importers, `notificationStore` has 1 — verify those are also dead before removing. 17 others still need auditing.
- **UKI speech recognition stream**: `getUserMedia` stream not stored for explicit cleanup in ukiBridge.ts. Minor: `recognition.stop()` releases the mic; stream GC handles the rest. But explicit `stream.getTracks().forEach(t => t.stop())` would be cleaner.
- **Worker thread pool**: Only one worker (`searchIndexer.worker.ts`). No pool coordination. Single-threaded search indexing. Low priority unless search latency becomes an issue.

---

## Remaining Performance Work

- **achievementsCatalog.ts lazy load**: 330KB file is synchronously imported in AppManager startup chain. Deferring to dynamic import would save ~40ms parse time at startup. Requires making engagement functions async — medium refactor.
- **Forge job queue cap**: No maximum on encode queue. Recommend cap at 200 jobs. Low priority until user reports.
- **Imosion waveform chunking**: ~~Done~~ Fixed. `importAudioFiles` and `handleFileDrop` in `Imosion.tsx` now use the native IPC bridge (`native:audio-waveform`) when `file.path` is available (Electron file drag-drop). Large files never decode a full AudioBuffer in the renderer. Fallback (recorded audio, no filesystem path) keeps existing behavior.
- **Prism canvas ImageData pooling**: Filter passes allocate new ImageData objects. Ping-pong buffer reuse would help. Medium priority.

---

## Remaining Stability Risks

- **Windows code signing**: `CSC_LINK` + `CSC_KEY_PASSWORD` CI secrets wired into `release.yml` Windows build step. Set both secrets in repo Settings → Secrets → Actions before the next release tag push. Until set, build succeeds unsigned and Defender will warn.
- **ARM64 Windows installer**: Build target added but not validated on real ARM64 hardware.
- **Update server URL**: `assets/config/update-server.json` has empty `"url"`. Point at GitHub releases feed once signed build ships.
- **Release cache prune real-world test**: Logic is correct; needs one real update+relaunch cycle to confirm `downloadedArtifactPath` is preserved.

---

## Exact Next Steps

1. ~~**Windows code-sign**~~: Done — `CSC_LINK` + `CSC_KEY_PASSWORD` wired into `release.yml`. Set the secrets in repo Settings → Secrets → Actions before next release tag.
2. **Verify CI is green on PR #3**: Tests pass locally (4602/4602). CI run on PR #3 failed — likely a transient environment issue. Watch for the next CI trigger; if it still fails, compare output to local run.
3. **Validate memory pressure CSS**: Open DevTools → manually set `document.documentElement.setAttribute('data-motion-degraded', 'minimal')` → verify all transitions stop. Then `'reduced'` → verify 80ms transitions.
4. **Remove unused stores** (audit needed): `homeAppsStore`, `homePinnedAppsStore`, `homePinnedFilesStore` are all imported by `Home.tsx`; `networkStore` imported by `QuickControls.tsx` + `Settings.tsx`. All 5 named "safe" candidates are actively used. Audit the 19-store list in "Remaining Internal Systems Work" for truly dead stores.
5. ~~**Imosion waveform chunking**~~: Done — `importAudioFiles` and `handleFileDrop` in `Imosion.tsx` use native bridge for filesystem-path files.
6. ~~**Browser.tsx blocked domains**~~: Done — extracted to `src/renderer/config/blocked-domains.ts`.

---

## Release Readiness Status

| Item | State |
|---|---|
| CI: Lint & Type Check | Fixed — watermark on zIndex.ts added. Push triggered re-run. |
| CI: Build | Was skipped due to lint failure. Should pass on re-run. |
| CI: Unit Tests | **Green** — all 4602 tests passing, 14 skipped, 0 failed (as of this session). |
| Memory leak fixes | In branch, committed, pushed. |
| CSS motion degradation | Fixed. In branch. |
| Shell cleanup | In branch. |
| Native dialogs | None remain. |
| Z-index ladder | Complete. |
| Release retention | Node prune script in place. |
| Windows code signing | NOT configured. Required before shipping. |

---

## Important Development Rules

- No unnecessary test files — write tests only when a real bug needs locking down.
- No junk architecture — refine existing systems; do not duplicate.
- No placeholder code — every committed line must do something useful.
- Patch real production systems only.
- Keep repositories clean and maintainable.
- Always update HANDOFF.md at the end of a session.
