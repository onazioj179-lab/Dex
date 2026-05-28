# DEX HANDOFF

Operational state of the DEX desktop platform. Update at the end of every session.

Current version: **4.60.4** · Branch: `main` · Tag: `v4.60.4` (released)
Three-phase goal: [GOAL-1-COMPLETION.md](GOAL-1-COMPLETION.md) · [GOAL-2-STABILITY.md](GOAL-2-STABILITY.md) · [GOAL-3-RELEASE.md](GOAL-3-RELEASE.md)

### Release Artifacts per Platform
| Platform | Artifacts |
|---|---|
| Windows | NSIS installer (x64 + ARM64) · Portable exe (x64) · ZIP (x64) |
| macOS | DMG (x64 + ARM64) · ZIP (x64 + ARM64) |
| Linux | AppImage (x64) · DEB (x64) · RPM (x64) |

---

## Main Goal

Production stabilization and ecosystem polish — no new features. Objectives:

1. **Long-session stability** — no memory growth over time, controlled resource pressure.
2. **8 GB RAM reliability** — memory pressure degradation path fully functional.
3. **Shell correctness** — z-order, drag/resize lifecycle, minimized-window restore all clean.
4. **Architecture hygiene** — dead systems identified, hot paths optimized.
5. **Release quality** — CI green, watermarks clean, cross-platform build config verified.
6. **Completion pass** — finish all unfinished systems, remove stale workflows.

---

## Current System State

| Area | Status |
|---|---|
| CI: Lint & Type Check | Green (watermark on zIndex.ts fixed). |
| TypeScript | Clean — renderer + main both pass `--noEmit`. |
| Watermarks | 2091 files in compliance. |
| Shell (FloatingWindow, snap, depth) | Stable. dragRafRef leak fixed. Snap engine correct. |
| Memory pressure CSS | Wired. `data-motion-degraded` and `data-compositor-pressure` have CSS rules. |
| Memory management | completedTasks LRU cap (200), MemoryPressureBridge deduplicated, MemoryMonitor at 10s. |
| Installer cache | TTL 7d→3d, prune interval 24h→12h. |
| Achievement hot path | O(n×m) → O(n) via Set lookups. |
| IPC listeners | WeakMap precision wrappers — `off()` removes only the targeted callback. |
| Workflow runner | Multi-trigger routing, manual trigger activates all paths, O(1) nodeMap. |
| Update lifecycle | ReleaseManager is single source of truth. UpdateController deprecated/tombstoned. |
| UI/UX | No native dialogs. Z-index ladder complete. Minimized-window restore functional. |
| Release tooling | Node-based prune script. v4.60.4 tag pushed — release workflow triggered. |
| Test suite | 8/8 workflow-runner tests passing. |

---

## Files & Systems Recently Modified

**Session: IPC precision, multi-trigger workflow routing, test harness**
- `src/main/preload.ts` — WeakMap per-callback wrappers; `off()` no longer calls removeAllListeners
- `src/shared/apps/workflows/runner.ts` — Multi-trigger routing, O(1) nodeMap, upstream-skip logic
- `src/shared/apps/workflows/workflowGraph.ts` — Manual trigger activates all trigger-anchored paths
- `src/renderer/DEXAPPLICATIONS/forge/Forge.tsx` — Bridge: `.on` → `.ipcRenderer.on`
- `src/renderer/components/LockScreen.tsx` — Bridge: `.on/.off` → `.ipcRenderer.on/.off`, @ts-ignore removed
- `src/renderer/pages/Browser.tsx` — Bridge: `.on/.off` → `.ipcRenderer.on/.off`
- `src/renderer/pages/Settings.tsx` — Inline box-shadow (replaced unresolved `--pg-shadow-chip`), simplified poller
- `src/renderer/utils/animationBudget.ts` — Guard canvas/WebGL probe behind jsdom detection
- `tests/setup.ts` — Stub canvas.getContext, remove console noise
- `tests/unit/workflow-runner.test.ts` — Multi-trigger + manual-trigger test coverage

**Previous session: Production Stabilization & Resource Optimization**
- `src/renderer/services/ProPerformanceEngine.ts` — completedTasks Map capped at 200 (LRU)
- `src/renderer/utils/MemoryPressureBridge.ts` — Auto-relax timeout deduplicated
- `src/renderer/services/MemoryMonitor.ts` — Polling 5s→10s, DOM querySelectorAll fallback removed
- `src/main/core/ReleaseManager.ts` — Installer cache TTL 7d→3d, prune interval 24h→12h
- `src/renderer/shell/FloatingWindow.tsx` — dragRafRef unmount cleanup
- `src/renderer/services/engagement.ts` — O(n) Set.has() replacing O(n×m) Array.includes()
- `src/renderer/styles/globals.css` — CSS rules for data-motion-degraded and data-compositor-pressure
- `src/shared/zIndex.ts` — Canonical watermark added (was blocking CI lint gate)

---

## Problems Already Investigated

- **UpdateController**: deprecated v2.0.1; throws on construction. Dead file kept as tombstone.
- **4 competing update systems**: Only ReleaseManager is wired in main.ts. Others safe to leave; removing requires full barrel audit.
- **6 animation/motion systems**: Roles are distinct — not pure duplication.
- **MemoryPressureBridge timer accumulation**: Fixed (deduplication).
- **dragRafRef leak in FloatingWindow**: Fixed.
- **data-motion-degraded CSS gap**: Fixed.
- **achievement O(n×m) loop**: Fixed via Set.
- **removeAllListeners collateral damage on IPC**: Fixed via WeakMap wrappers.
- **Multi-trigger workflow early-return bug**: Fixed — runner now continues past non-matching triggers.
- **--pg-shadow-chip unresolved token in Settings**: Inlined concrete box-shadow values.
- **jsdom canvas getContext noise**: Guarded in animationBudget and stubbed in test setup.
- **32-bit Windows**: Not supported — Electron ≥28 dropped ia32. x64+ARM64 only. Correct.

---

## Remaining UI/UX Work

- **Tasks.tsx drag-drop reordering**: No drag handlers implemented despite UI indicators. (Remote has drag-to-reorder merged in 2522dba — verify it's complete.)
- **Gallery.tsx 200-item hardcoded limit**: Line 210. Low priority.
- **Power.tsx silent polling failures**: No toast when IPC bridge breaks. Low urgency.
- **Spotlight / Stage**: Old fallback UI still partially visible. Needs density pass.
- **DexCode output panel**: Exposed debug elements in release UI.
- **Creative app panels** (Vinx timeline, Imosion toolbar): Density and alignment pass needed.
- **Inconsistent CSS tokens**: Audit remaining `var(--pg-*)` references that may be unresolved.

---

## Remaining Internal Systems Work

- **CollaborationLayer.ts vs CollaborationSystem.ts**: Two systems; CollaborationLayer appears unused (938 lines). Verify before removing.
- **Remaining unused stores**: `featureSuiteStore` (2 importers), `notificationStore` (1 importer) — verify dead before removing.
- **UKI speech recognition stream**: `getUserMedia` stream not stored for explicit cleanup in ukiBridge.ts. Minor.
- **Shell workspace restoration**: Crash/restart recovery path not smoke-tested.
- **Browser tab lifecycle**: Hidden-tab suspension not implemented.
- **Notes autosave**: Reliability pass needed under low memory.
- **Notification stale layer**: Rendering stale-layer cleanup pass.

---

## Remaining Performance Work

- **achievementsCatalog.ts lazy load**: 330KB file synchronously imported at startup. Dynamic import saves ~40ms parse time. Medium refactor.
- **Forge job queue cap**: No maximum on encode queue. Cap at 200 jobs recommended.
- **Imosion waveform chunking**: Done for native IPC path. Fallback still decodes full AudioBuffer.
- **Prism canvas ImageData pooling**: Ping-pong buffer reuse for filter passes. Medium priority.
- **Long-session memory profile**: Heap snapshot at t=0, t=30m, t=2h not yet done.
- **Background worker suspension**: Workers not suspended on window minimize.

---

## Remaining Stability Risks

- **Windows code signing**: `CSC_LINK` + `CSC_KEY_PASSWORD` CI secrets must be set in repo Settings → Secrets → Actions before next release. Until set, builds ship unsigned and Defender will warn.
- **ARM64 Windows installer**: Build target added but not validated on real ARM64 hardware.
- **Update server URL**: `assets/config/update-server.json` has empty `"url"`. Point at GitHub releases feed before shipping auto-update.
- **Multi-monitor focus desync**: Windows compositor + Electron window ordering not stress-tested.
- **Workspace snapshot restoration**: After abnormal exit, restoration untested end-to-end.
- **Creative app OOM recovery**: Project recovery on low-memory OOM not verified.

---

## Exact Next Steps

1. Confirm CI green after latest push (workflow-runner fix + IPC precision + stale artifact cleanup)
2. Validate memory pressure CSS in DevTools: set `data-motion-degraded=minimal` → verify transitions stop
3. Audit `Tasks.tsx` drag-drop (2522dba) — confirm it's complete or flag remaining gaps
4. Audit remaining `var(--pg-*)` CSS token references across Settings and shell
5. Shell workspace restoration audit (`src/main/` window lifecycle handlers)
6. Browser hidden-tab suspension pass (`src/renderer/pages/Browser.tsx`)
7. Set `CSC_LINK` + `CSC_KEY_PASSWORD` repo secrets before next signed release

---

## Release Readiness Status

| Item | State |
|---|---|
| CI: Lint & Type Check | Green |
| CI: Unit Tests | 8/8 workflow-runner. Full suite was 4602 passing locally (last run). |
| Memory leak fixes | Committed and pushed. |
| CSS motion degradation | Fixed and pushed. |
| Shell cleanup | Committed and pushed. |
| IPC listener precision | Committed — pending CI validation. |
| Native dialogs | None remain. |
| Z-index ladder | Complete. |
| Release retention | Node prune script in place. |
| Windows code signing | NOT configured. Required before shipping signed build. |

---

## Important Development Rules

- No unnecessary test files — write tests only when a real bug needs locking down.
- No junk architecture — refine existing systems; do not duplicate.
- No placeholder code — every committed line must do something useful.
- Patch real production systems only.
- Always run tests before committing.
- Windows is primary platform — validate on Windows first.
- Always update HANDOFF.md at the end of every session.
