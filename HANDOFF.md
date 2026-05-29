# DEX HANDOFF

Operational state of the DEX desktop platform. Update at the end of every session.

Current version: **4.60.4** · Branch: `main` · Tag: `v4.60.4` (released) · Last session: 2026-05-29 (session 4)
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
| Test suite | Full suite green on Windows: 4611 passed / 0 failed / 7 skipped (256 files). TS clean on renderer + main. |

---

## Files & Systems Recently Modified

**Session 4 (2026-05-29): UI/UX stabilization — invalid `var()` + hex-alpha CSS bug**
- Root cause: appending hex-alpha digits to a CSS `var()` token (e.g. `` `${iconColor}15` `` where `iconColor = 'var(--color-accent)'`) yields `var(--color-accent)15`, which is invalid CSS — the `var()` substitutes a color token, then a stray `15` follows, so the whole declaration is dropped and the element renders with no tint/border/glow. Only broken when the base is a `var()` token; concrete hex bases (`#RRGGBB` + `NN` → valid 8-digit hex) are unaffected, which is why it was easy to miss. Fixed with premultiplied `color-mix(in srgb, <color> N%, transparent)` (works for both hex and token inputs; Chromium ≥111 / Electron ≥28).
- `src/renderer/shell/NotificationBanners.tsx` — icon-badge tint (l.262), grouped unread badge bg (l.717) + border (l.735), and timeline dot glow (l.781) were rendering transparent/invalid for every banner; now use `color-mix`. Affects all notifications (icon colors are always `var()` tokens).
- `src/renderer/DEXAPPLICATIONS/vinx/Timeline.tsx` — `VINX_COLORS.videoTrack = 'var(--color-accent)'`, so every **video** clip lost its background tint, border, trim handles, frame-strip gradient, and transition gradients. Added `alpha(color, pct)` helper and routed the `getClipColor`-derived usages through it. Audio/title tracks (hex) were unaffected and untouched.

**Session 4 (2026-05-29): Windows test-suite green + dead-code/leak cleanup**
- Test suite went from **31 failing → 0** on Windows. All failures were Windows-only (the prior "green" baseline ran on Linux CI, which skips win32 branches / uses `/` separators):
  - `src/main/controllers/AuthController.ts` — `setupSystemListeners()` called `powerMonitor.on(...)` from a `require('electron')` that returns no `powerMonitor` outside an Electron runtime, throwing during singleton construction at import time on win32/darwin. Guarded with `if (!powerMonitor || typeof powerMonitor.on !== 'function') return;` (real robustness fix, not just a test fix).
  - `src/main/security/PathValidator.ts` — `sanitizeFilename` used platform `path.basename`, so on Windows `\` was treated as a separator (dropping the prefix) instead of being sanitized. Switched to `path.posix.basename` so only `/` strips directories and the regex neutralises `\` identically on every OS. Only caller (`main.ts:3438`) passes a URL-derived basename, so behaviour is unchanged in production.
  - `tests/unit/self-healing-manager.test.ts` — fs mock now normalises `\`→`/` so it matches `path.join` output on Windows.
  - `tests/unit/path-validator.test.ts` — `MOCK_HOME`/`os.homedir` mock made platform-absolute via `path.resolve`; return-value assertions wrapped in `path.resolve` (no-op on POSIX); symlink `realpathSync` mock returns a `path.join` path so it matches `BLOCKED_PATHS`.
  - `tests/unit/renderer-pages.test.tsx` — Power page tests now wrap `<Power/>` in `<WithToast>` (Power started using `useToastHelpers` in 2522dba; tests weren't updated).
- `src/renderer/shell/NotificationBanners.tsx` — pruned `recentTitlesRef` duplicate-coalesce map past the 5s window (was one retained entry per distinct notification title forever → unbounded long-session growth). Addresses the "notification stale layer" backlog item.
- Deleted dead code: `src/renderer/services/CollaborationLayer.ts` (938 lines, zero refs after session-3 barrel prune) and `src/renderer/store/notificationStore.ts` (zero importers; HANDOFF's "1 importer" note conflated a local const in SystemFeatures.tsx).
- Verified-stale backlog notes (no fix needed): Gallery has proper infinite-scroll pagination (`visibleCount` grows via IntersectionObserver + Load More) — no hardcoded 200 cap exists; `featureSuiteStore` is **live** (Files.tsx `useColorLabelsStore`) — kept.
- **Z-index ladder consistency** (Spotlight/Stage backlog): components were hardcoding `var(--z-max)` (9999) instead of their dedicated ladder tokens, floating above everything incl. modals/toasts/context-menus:
  - `src/renderer/shell/SpotlightSearch.tsx` — overlay backdrop + container now use `--z-spotlight` (8500).
  - `src/renderer/shell/StageManager.tsx` — left-edge strip + hit-zone now use `--z-stage-manager` (5400).
  - `src/renderer/DEXAPPLICATIONS/vinx/Vinx.tsx` — clip context menu now uses `--z-context-menu` (9700) and replaced hardcoded `#333`/`#555`/`#e0e0e0` with `--color-border`/`--color-text-disabled`/`--color-text-primary` tokens (theme-aware, consistent with shell context menus).
- Final validation: **4611 passed / 0 failed / 7 skipped** (256 files), `tsc --noEmit` clean on renderer + main.

**Session 4 (cont.): Performance & stability backlog clear-out**
- `src/renderer/services/WorkerPool.ts` — suspend-on-minimize: pause + free idle workers on `visibilitychange` hidden (10s debounce to avoid alt-tab thrash), resume on visible. Fixed `pause()` (was a no-op stub — `processQueue` now honors a real `paused` flag). Clears the "background worker suspension" perf item.
- `src/renderer/DEXAPPLICATIONS/imosion/Imosion.tsx` — `decodedBuffersRef` AudioBuffer cache FIFO-capped at `MAX_DECODED_BUFFERS=48` (was unbounded: multi-MB PCM retained per played clip incl. deleted ones → long-session growth).
- `src/main/core/WorkspaceSnapshot.ts` — `loadSnapshots` now skips malformed-but-valid-JSON files (shape guard on id+state) instead of inserting a junk `undefined`-keyed entry; hardens crash recovery against partial writes.
- Evaluated + deliberately deferred with documented reasons (not silent skips): achievementsCatalog async lazy-load (ripples async/race risk through 6 apps for ~40ms), Prism ImageData pooling (Canvas-2D `getImageData` always allocates — needs WebGL/OffscreenCanvas redesign), Imosion decode chunking (`decodeAudioData` has no streaming variant). Update-server URL verified correct as-is.

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
- **DexCode "exposed debug elements"**: Re-audited (session 4). The output panel, status bar, and footer hint bar are intentional production UI — no `console.`/`__DEV__`/`process.env` leakage or raw dev dumps. No fix needed; backlog note was stale.
- **`var()` + hex-alpha invalid-CSS antipattern**: Swept `src/renderer` (session 4). Only `var()`-token bases were broken — found in NotificationBanners + Vinx Timeline (both fixed). All other `${color}NN` sites use concrete hex (`track.color`, `app.color`, `meta.color`, `marker.color`, hardcoded `activeColor`) → valid 8-digit hex, not broken.

---

## Remaining UI/UX Work

- ~~**Gallery.tsx 200-item hardcoded limit**~~ Verified non-issue (session 4): uses infinite-scroll pagination (`visibleCount` + IntersectionObserver + Load More). No hardcoded cap.
- **Spotlight / Stage**: Old fallback UI still partially visible. Needs density pass. *(Deferred — subjective polish, no concrete defect; goal forbids speculative redesign.)*
- ~~**DexCode output panel**: Exposed debug elements~~ Re-audited session 4 — no leakage, backlog note was stale.
- **Creative app panels**: Vinx — video-clip color rendering bug + context-menu z-index/colors fixed (session 4). Imosion toolbar — reviewed session 4: hardcoded hexes are intentional DAW theming that renders correctly (no `var()`+alpha bug like Vinx had); no defect. Further "density" tuning is subjective polish, intentionally not pursued (goal forbids speculative redesign).
- ~~Tasks drag-drop~~ Done (2522dba). ~~Power polling toast~~ Done (2522dba). ~~pg-text tokens~~ Done (session 2).

---

## Remaining Internal Systems Work

- ~~**CollaborationLayer.ts**~~ Deleted session 4 (zero refs confirmed across src/tests).
- ~~**Remaining unused stores**~~ Session 4: `notificationStore` deleted (zero importers); `featureSuiteStore` is **live** (Files.tsx `useColorLabelsStore`) — kept.
- **Shell workspace restoration**: Now wired (session 2). Crash/restart recovery path still needs end-to-end smoke test on real abnormal exit.
- ~~**Notification stale layer**~~ Session 4: pruned unbounded `recentTitlesRef` coalesce map in NotificationBanners.
- ~~Notes autosave reliability~~ Done (session 3, 500ms debounce). ~~Browser tab suspension~~ Already implemented. ~~UKI stream cleanup~~ Non-issue (Web Speech API self-manages).

---

## Remaining Performance Work

- **achievementsCatalog.ts lazy load** — *deliberate, documented deferral.* The only correct implementation makes `checkAchievements`/`getTotalPoints`/`getAchievementStats` async (they iterate `ACHIEVEMENTS` and are called synchronously by 6 apps after user actions). Converting them ripples async + race risk through all callers for a one-time ~40ms startup cost — disproportionate. Not worth destabilizing a green system; revisit only if startup budget tightens.
- ~~Forge job queue cap~~ Done (session 3, MAX_QUEUE_JOBS=200).
- ~~**Imosion decoded-buffer leak**~~ Done (session 4): `decodedBuffersRef` was unbounded (multi-MB PCM per played clip, incl. deleted clips) — now FIFO-capped at `MAX_DECODED_BUFFERS=48`. (True waveform *chunking* of the decode itself isn't possible — `decodeAudioData` has no streaming/partial variant; full decode is required for playback.)
- **Prism canvas ImageData pooling** — *not feasible as refinement.* Canvas-2D `getImageData` always allocates a fresh `ImageData`; there's no read-into-existing-buffer API. Pooling would require an OffscreenCanvas/WebGL rearchitecture (redesign, out of scope per goal).
- **Long-session memory profile**: Heap snapshot at t=0, t=30m, t=2h — **requires running the packaged app** (not doable in this headless env). Manual/runtime task.
- ~~**Background worker suspension**~~ Done (session 4): `WorkerPool` now pauses + frees idle workers on `visibilitychange` hidden (10s debounce), resumes on visible. Also fixed `pause()` which was a no-op stub.

---

## Remaining Stability Risks

**Externally blocked (cannot be done from the codebase — require secrets / hardware / a running app):**
- **Windows code signing** 🔒 *user action*: `CSC_LINK` + `CSC_KEY_PASSWORD` CI secrets must be set in repo Settings → Secrets → Actions. Until set, builds ship unsigned and Defender warns. No code change possible.
- **ARM64 Windows installer** 🔒 *hardware*: build target exists; validation needs real ARM64 hardware.
- **Multi-monitor focus desync** 🔒 *runtime*: needs a multi-monitor Windows session to stress-test compositor/window ordering.
- **Memory-pressure CSS validation** 🔒 *runtime*: set `data-motion-degraded=minimal` in DevTools and confirm transitions stop — needs the running app.
- **WorkspaceSnapshot crash recovery (end-to-end)** 🔒 *runtime*: needs a real abnormal kill + relaunch. **Code path reviewed session 4** — load is per-file fault-tolerant and now skips malformed-but-valid-JSON files; logic is correct.
- **Creative-app OOM recovery** 🔒 *runtime*: needs an induced low-memory crash. Session-4 decoded-buffer cap + worker suspension reduce OOM likelihood.

**Resolved:**
- ~~**Update server URL**~~ Verified correct (session 4): empty `update-server.json` is the intended *optional private-server override*; auto-update uses the GitHub provider from `package.json build.publish` (`onazioj179-lab/Dex`), which is configured. Setting a URL would wrongly override the working feed.

---

## Exact Next Steps

All code-actionable backlog items are now resolved (sessions 3–4). The only remaining work is **external/manual** and cannot be done from the codebase:

1. 🔒 Set `CSC_LINK` + `CSC_KEY_PASSWORD` repo secrets before next signed release (user action).
2. 🔒 Validate memory-pressure CSS in DevTools (`data-motion-degraded=minimal` → transitions stop) — needs running app.
3. 🔒 Smoke-test WorkspaceSnapshot crash recovery (kill process mid-session, relaunch, confirm restore prompt) — needs abnormal exit. Code path reviewed + hardened session 4.
4. 🔒 Validate ARM64 Windows installer on real ARM64 hardware.
5. 🔒 Long-session heap profile (t=0 / 30m / 2h) + multi-monitor focus stress test — need packaged app + hardware.

Completed code items (session 4): all 31 Windows test failures fixed; CSS color-mix bug; z-index ladder alignment; NotificationBanners + Imosion leak caps; WorkerPool suspend-on-minimize (and pause() stub fix); dead-code removal; snapshot-load hardening.

---

## Release Readiness Status

| Item | State |
|---|---|
| CI: Lint & Type Check | Green |
| CI: Unit Tests | Full suite green on Windows: 4611 passed / 0 failed / 7 skipped (session 4). |
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
