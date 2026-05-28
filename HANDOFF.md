# DEX HANDOFF

Operational state of the DEX desktop platform. Update at the end of every session.

Current version: **4.60.4** · Branch: `main` · Tag: `v4.60.4` (released) · Last session: 2026-05-28 (session 3)
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
| Workspace snapshot | Wired into main.ts startup + shutdown. Auto-save live, crash recovery loads from disk. |
| Forge queue | Capped at 200 jobs across all add-callsites. |
| Notes autosave | Content save debounced to 500ms (was per-keystroke IPC). |
| Release tooling | Node-based prune script. v4.60.4 tag pushed — release workflow triggered. |
| Test suite | 8/8 workflow-runner tests passing. TS clean on renderer + main. |

---

## Files & Systems Recently Modified

**Session 3 (2026-05-28): Completion & consistency pass**
- `src/renderer/DEXAPPLICATIONS/forge/Forge.tsx` — MAX_QUEUE_JOBS=200 cap at all 8 add-job callsites; bulk drops slice to remaining capacity (was unbounded → OOM risk)
- `src/renderer/DEXAPPLICATIONS/notes/DexNotes.tsx` — content save debounced 500ms (was 1 IPC call per keystroke); save timer cleared on unmount
- `src/renderer/services/index.ts` — removed dead CollaborationLayer barrel re-exports (zero consumers; CollaborationSystem is the live store)

**Session 2 (2026-05-28): Shell wiring + CSS token completion**
- `src/main/main.ts` — WorkspaceSnapshot.initialize() + .shutdown() now called; crash recovery and auto-save are live
- `src/renderer/styles/design-system.css` — defined missing --pg-text-primary/secondary/tertiary tokens; DiagnosticsPanel/LogsPanel/PolicyViewer/ProgressRing now render correct text colors

**Session 1: IPC precision, multi-trigger workflow routing, test harness**
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
- **WorkspaceSnapshot never initialized**: initialize() and shutdown() were never called from main.ts — fixed. Auto-save now runs, crash recovery loads snapshots from disk on startup.
- **--pg-text-primary/secondary/tertiary undefined**: Used in 4 components, never defined — added to design-system.css aliasing color-text-* tokens.
- **Tasks drag-drop**: Confirmed complete in 2522dba. draggable, dragIdRef, reorderTasks all implemented.
- **Browser tab suspension**: Already solid — background:true tabs are unmounted from DOM; 40-tab limit enforced.
- **Power.tsx polling failure toast**: Already present (line 231, added in 2522dba) — toasts after 3 consecutive poll failures.
- **UKI speech recognition stream**: Non-issue. startVoiceInput uses Web Speech API (SpeechRecognition), which manages mic access internally; recognition.stop() releases it. No explicit getUserMedia stream to clean up.
- **Forge unbounded queue**: Fixed — MAX_QUEUE_JOBS=200 enforced at all add-callsites.
- **Notes per-keystroke IPC**: Fixed — content save debounced to 500ms.
- **CollaborationLayer dead exports**: Removed from barrel. File itself (938 lines) retained — not deleted, but no longer reachable via services/index.ts.
- **32-bit Windows**: Not supported — Electron ≥28 dropped ia32. x64+ARM64 only. Correct.

---

## Remaining UI/UX Work

- **Gallery.tsx 200-item hardcoded limit**: Line 210. Low priority.
- **Spotlight / Stage**: Old fallback UI still partially visible. Needs density pass.
- **DexCode output panel**: Exposed debug elements in release UI.
- **Creative app panels** (Vinx timeline, Imosion toolbar): Density and alignment pass needed.
- ~~Tasks drag-drop~~ Done (2522dba). ~~Power polling toast~~ Done (2522dba). ~~pg-text tokens~~ Done (session 2).

---

## Remaining Internal Systems Work

- **CollaborationLayer.ts**: Barrel exports removed (session 3). File (938 lines) still on disk but unreachable. Safe to delete in a future cleanup once confirmed no dynamic import references it.
- **Remaining unused stores**: `featureSuiteStore` (2 importers), `notificationStore` (1 importer) — verify dead before removing.
- **Shell workspace restoration**: Now wired (session 2). Crash/restart recovery path still needs end-to-end smoke test on real abnormal exit.
- **Notification stale layer**: Rendering stale-layer cleanup pass.
- ~~Notes autosave reliability~~ Done (session 3, 500ms debounce). ~~Browser tab suspension~~ Already implemented. ~~UKI stream cleanup~~ Non-issue (Web Speech API self-manages).

---

## Remaining Performance Work

- **achievementsCatalog.ts lazy load**: 330KB file synchronously imported at startup. Dynamic import saves ~40ms parse time. Medium refactor.
- ~~Forge job queue cap~~ Done (session 3, MAX_QUEUE_JOBS=200).
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

1. Validate memory pressure CSS in DevTools: set `data-motion-degraded=minimal` → verify transitions stop
2. achievementsCatalog.ts lazy load (330KB sync import, ~40ms) — deferred: medium refactor, needs checkAchievements/getTotalPoints/getAchievementStats made async + AppManager updated. 40ms cost acceptable short-term.
3. Delete CollaborationLayer.ts file (now unreachable) after confirming no dynamic-import references
4. Smoke-test WorkspaceSnapshot crash recovery end-to-end (kill process mid-session, relaunch, confirm restore prompt)
5. Audit `featureSuiteStore` / `notificationStore` for removal
6. Set `CSC_LINK` + `CSC_KEY_PASSWORD` repo secrets before next signed release

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
