# DEX OS - Final Stabilization & Release Roadmap (v4.56 -> v5.0)

Status snapshot at draft time:
- TypeScript: clean (`tsc --noEmit` -> 0 errors).
- Tests: 216 files / 3344 tests passing, 7 skipped, 0 failing.
- CI: latest 3 runs all green (release v4.10.0 wave 6, v4.9.0 wave 5, raf alias fix).
- Native: `dex-native` Rust module builds clean.
- Package version: 4.56.0.

This document is the authoritative checklist for the *final* refinement,
packaging, and release pass. It is intentionally small. Each item is a
named owner-area with an acceptance signal. No feature bloat.

---

## 1. UI Refinement Pass (closeout)

Driver token: `--pg-*` (Premium Glass v1, see [design-system.css](src/renderer/styles/design-system.css)).
Style helper barrel: [glassMenu.ts](src/renderer/styles/glassMenu.ts).

| Surface | State | Acceptance |
| --- | --- | --- |
| FloatingWindow title bar | tokenized | active-state inset highlight stays at 1px; no shadow stacking |
| StageManager strip | tokenized | hairline border; no border doubling on resize |
| Settings nav rows | tokenized | 2px accent bar; focus ring distinct from active |
| Files / Audio / Gallery / Browser / Power / Home | tokenized | toolbars share `--pg-toolbar`; sidebar widths match `--pg-sidebar-width` |
| Spotlight / Orbit / Stage / Home / Dock | audit | shadows use `--pg-shadow-overlay`; no `box-shadow` literals |
| DexCode / Terminal / Nexus shells | audit | scrollbars styled; resize never clips toolbar |
| Notifications | audit | enter/exit motion uses Tahoe easing; never overlaps Dock |
| Context menus | audit | hover row uses `--pg-row-hover`; focus is keyboard-visible |

Acceptance signal: `rg "box-shadow:\s*0" src/renderer | wc -l` trends toward 0
inside primary surfaces; no inline literals for `--pg-*` substitutes.

---

## 2. Workflow Improvements (Win/macOS/Linux-inspired)

Refinement-only - no new feature surface:

- Window snapping: confirm 1/2 / 1/4 / center snap zones round to physical
  pixel boundaries on HiDPI; verify in `dockGeometry.ts`.
- Workspace restoration: round-trip Stage layouts across launch via
  `appstore.config.json` snapshot; confirm fail-safe is empty desktop, not crash.
- Keyboard-first: Cmd/Ctrl+K (Spotlight), Cmd/Ctrl+Tab (window cycle),
  Cmd/Ctrl+` (window cycle within app) all reachable from any focused surface.
- Multi-monitor: window restore uses `screen.getDisplayMatching(bounds)`;
  off-screen windows snap to primary.
- Continuity: clipboard, recent files, Stage layouts persist across restart
  via existing `electron-store` keys; no migration on minor versions.

Acceptance signal: manual smoke pass against checklist
`docs/sprints/release-smoke-checklist.md` (create if absent).

---

## 3. Compositor & Internal Stabilization

Targets (no rewrites - audits + tightening):

1. Floating windows: confirm `requestAnimationFrame` budget honored via
   `useTickBudget` (lesson: rafThrottle alias collision already fixed in
   24e313c).
2. Blur tiers: `adaptiveBlur(24,180)` falls back gracefully on
   ultra-low/low perf tiers; verified via `glassMenu.ts` perf tier branches.
3. GPU rendering: Nexus knowledge mode tick loop disposes on mode change
   (verified in session 14 notes); no orphan d3-force sims.
4. Notification routing: single `dex-toast` event channel; duplicate
   listeners pruned in `Toast.tsx`.
5. Memory: `uki:mem:archive` enforces 100 MB default budget
   (covered by `uki-knowledge-feeder` tests).
6. Idle behavior: background services pause after 5min idle
   (existing `idleScheduler.ts` if present; otherwise no-op).

Acceptance signal: 60-min idle session with Activity tab open shows no
unbounded growth on heap snapshot.

---

## 4. Creative Ecosystem (Vinx, Imosion, Prism, Forge, Polish, AXL, Canvas, PresentationBuilder, PixelArt)

Refinement matrix - confirm only:

- Autosave cadence: every 30s + on blur; uses `requestIdleCallback`.
- Export pipelines: each app surfaces a single progress channel
  (`dex-export-progress` event), no per-call listeners leaking.
- Floating panels: dock to `FloatingWindow`, never raw `<dialog>`.
- Cross-app handoff: `useCreativeInbox(appId, handler)` is the single
  inbox primitive (verified in DexNotes).

Acceptance signal: each creative app passes its existing unit suite plus
a 10-minute soak in dev mode without console errors.

---

## 5. UKI / AI Infrastructure

Already covered in depth by [DEX_OS_PRODUCTION_ROADMAP.md](docs/DEX_OS_PRODUCTION_ROADMAP.md)
sections 1-3. Final-pass items only:

- Confirm `uki/knowledgeFeeder.ts` cooldown honored.
- Confirm `uki/compressedMemory.ts` archive threshold and
  `enforceBudget` prune (covered by tests).
- Confirm offline mode disables free-API fetch paths cleanly (no
  retry storms).

Acceptance signal: `uki-knowledge-feeder` + `uki-compressed-memory`
suites green (already passing).

---

## 6. Task Manager & Monitoring

- Waveform / CPU / GPU graphs throttled to display refresh.
- Process grouping uses stable identity key (PID + start time).
- Thermal monitoring polls at 2s; widgets read shared store.

Acceptance signal: Task Manager open during idle costs <2% CPU on a
mid-tier machine.

---

## 7. Packaging & Release

Pipelines already in `package.json` scripts:
- `npm run build` (renderer + main)
- `npm run build:native`
- `npm run package:win | :mac | :linux | :all`
- `npm run release:prune:all`

Pre-release gate (must pass in order):
1. `npx tsc --noEmit -p tsconfig.json` - 0 errors.
2. `npx tsc --noEmit -p tsconfig.main.json` - 0 errors.
3. `npx vitest run` - 0 failures, skip count documented.
4. `npm run watermark:check` - clean.
5. `cd native; cargo check` - clean.
6. `npm run build` - success.
7. `npm run build:native` (per platform) - success.
8. `npm run package:win` (or target) - artifact emitted in `release/`.
9. `node scripts/release-audit.js` - artifacts validated.
10. `npm run release:prune:all` - keep last 3 releases.

Update infrastructure: `electron-updater` already wired; signing handled by
`scripts/creator-sign.js`. No changes required.

---

## 8. Repository & Deployment

Cleanup checklist (mechanical, low-risk):
- Drop transient logs: `_t1.log`..`_t4.log`, `_tsc_now.txt`,
  `tsc_output.txt`, `tsc_pcf.txt`, `vitest-out.txt`, `runs_output.txt`,
  `test_output.txt`, `test-fail-details.txt`. (Verify they are gitignored;
  if not, add to `.gitignore` rather than committing them.)
- `runs.txt`, `ci-list.json`, `ci-status.json`, `run_status.json`: keep
  if used by `scripts/release-audit.js`; otherwise gitignore.
- Confirm `release/` is gitignored; only signed artifacts upload to GH releases.

Branch policy:
- `main` is production; tagged `vX.Y.Z` per release.
- Feature work in short-lived branches; rebase before merge.

Push policy: any `git push`, `git tag`, or release upload requires
explicit user confirmation (operational safety - documented here, not
executed by automation).

---

## 9. Final QA & Stress Testing

Suites (each owned by an existing or trivially-added test file):
- Long-session uptime: `tests/e2e/uptime.spec.ts` - 30 min headed.
- Heavy multitasking: `tests/e2e/multitasking.spec.ts` - 12 windows.
- Creative workload: per-app smoke specs under `tests/e2e/creative/`.
- AI workflow: `tests/unit/uki-*` (existing).
- Memory leak: heap-diff harness in `tests/perf/` (optional).
- Update rollback: simulate failed update via `electron-updater` mock.

Acceptance signal: full `vitest run` plus `playwright test` green.

---

## 10. Execution Order (this is the runbook)

1. Land any in-flight cleanup PRs.
2. Run sections 7.1-7.5 locally; fix any regressions.
3. Bump version (`npm version minor` or `patch`).
4. Build native + main + renderer (`npm run build:all`).
5. Package per target (`package:win`, etc.).
6. Run `release-audit.js`.
7. *Pause for user confirmation* before `git push --tags` or upload.
8. After confirmation: tag, push, upload, prune.
9. Update [RELEASE_NOTES.md](docs/RELEASE_NOTES.md) and [CHANGELOG.md](docs/CHANGELOG.md).
10. Monitor first 24h via `electron-log` and CI.

---

## Constraints (carry forward)

- No emojis anywhere in code, UI, or docs.
- No new feature work in this pass; only stability, polish, packaging.
- Preserve DEX visual identity: Premium Glass tokens, Tahoe easing, Apple HIG palette.
- Local-first: no network calls in hot paths.
- All destructive actions (push, tag, force-push, prune-remote) require
  explicit user confirmation.
