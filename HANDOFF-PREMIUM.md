# DEX — Premium UI/UX Phase HANDOFF

Companion to the main `HANDOFF.md` (stabilization sessions 1–4). Start here for the
premium UI/UX + overheat/dock work. Version **4.60.4** · Branch `main`.

> **Accuracy note (important):** An earlier commit (`e29845c`) and a previous draft of
> this file claimed the overheat fix targeted `TierManager`'s `enableParticles` /
> `enableLiveWallpaper` fields. **That was wrong** — see "Corrected root-cause analysis"
> below. Those fields are dead. This file supersedes that draft.

---

## 🔴 CRITICAL #1 — DEX overheats CPU/GPU and crashes

### Corrected root-cause analysis (verified by reading the code, not guessing)
The real causes, in order of impact:

1. **The thermal/perf safety valve is disabled.** `src/renderer/services/AdaptivePerfMonitor.ts`
   `startAdaptivePerfMonitor()` has an early `return;` (≈line 145) — its whole body is a
   no-op. A *previous* user directive ("keep all visuals at max regardless of power state")
   disabled it. That directive directly conflicts with the current report (overheating/
   crashing); **the current directive wins.** The monitor's `tick()` already measures rAF
   jank and can downgrade — it's just never started.

2. **It was disabled for a real reason — don't naively re-enable it.** When active, its
   downgrade path called `applyTierPresets(next)`, which flips `deferHeavyApps` and
   **unmounts background apps → blank screen**, and it cycled tiers on OS power-mode
   toggles. The fix must throttle **visuals only**, never unmount apps.

3. **No thermal telemetry exists.** Nothing in `src/main` emits `dex:thermal-state`;
   `PerformanceOptimization.ts:223` only *listens*. So a thermal-driven valve would be wired
   to a signal that never fires. Any overheat fix must be **renderer-self-contained**
   (measure rAF frame time directly).

4. **The idle coordinator deliberately does NOT pause on visible-idle.**
   `src/renderer/utils/idlePause.ts` pauses on hidden/blur only; a comment explicitly keeps
   the Home screen fully rendered while the user is away "even if that costs more power."
   On a low-end machine that means effects churn forever on an idle desktop.

5. **Dead fields (ignore):** `TierManager.ts` `TIER_PRESETS[*].enableParticles` /
   `enableLiveWallpaper` are **never read** by `applyTierPresets()` and have no consumers.
   Editing them does nothing. (The particle + cursor-trail rAF loops in `VisualEffects.ts`
   already self-terminate when empty, and there is no live-wallpaper component.)

### The fix (visual-only throttle — see commit accompanying this file)
A self-contained renderer watchdog (`src/renderer/services/ThermalGuard.ts`) measures rAF
frame time; on sustained slow frames it sets `data-thermal-throttle="on"` on `<html>`, and
CSS under that attribute disables `backdrop-filter` and heavy animations app-wide. It clears
the attribute when frames recover. **It never unmounts apps and never touches tier/
`deferHeavyApps`,** so it cannot reproduce the blank-screen regression that got
`AdaptivePerfMonitor` disabled. Started from `App.tsx` alongside the existing coordinators.

This gives low-end machines automatic relief under load while high-end machines keep full
fluid glass. The existing `html[data-perf-tier="low"]` CSS already proves the "kill effects"
approach works; `data-thermal-throttle` reuses the same idea, dynamically.

---

## 🔴 CRITICAL #2 — Dock not working
**Status: investigated, NOT yet fixed** (see tooling caveat — could not safely edit the
5000-line `AppManager.tsx` this session).

Verified facts:
- Dock lives in `src/renderer/components/AppManager.tsx` (not a separate file).
- Default mode is `'auto-hide'` (`src/renderer/store/dockPinStore.ts` `DEFAULT_SETTINGS.mode`).
- Reveal: bottom trigger zone (≈line 4667) → `beginDockIntent`/`trackDockIntent` (≈1122/1135)
  → `showDock()` (≈1108) with a 140ms dwell + velocity (<0.45px/ms) hover-intent gate.
- `showDock()` early-returns if `anyWindowMaximized && !showAppMenuRef && !dockCtxRef`.

Most likely causes to check (need running app + reliable tooling):
- `showDock()` early-return: is `anyWindowMaximized` stuck true on the home screen (no
  windows open)? If so the dock never reveals. **First thing to check.**
- Hover-intent never satisfied: dwell timer cleared by a stray move, or the trigger zone's
  z-index sits under a full-bleed overlay so `onMouseEnter` never fires.
- `taskbarVisible` stuck false; or `dockMode` persisted as something unexpected in
  localStorage (`SETTINGS_KEY`).
Repro: hover the bottom-center screen edge; log `beginDockIntent` firing and `showDock()`
reaching `setTaskbarVisible(true)`.

---

## ✅ Completed this premium phase
- **Shared glass system refined** (`src/renderer/styles/glassMenu.ts`, commit `6f15c89`):
  rim-lit top edge (inset highlight), consistent 10/8px radii, layered shadows on
  `glassMenu`/`glassPanel`/`glassToolbar`. Cascades to all menus/panels/toolbars. tsc clean,
  suite 4611 passing. Perf-tier gating untouched.
- **Live preview validated**: renderer runs via Vite (`.claude/launch.json`); shell renders
  (top bar, Spotlight search, glass time widget, wallpaper). Onboarding gated behind
  `dex-welcomed` + `dex-policy-acceptance-v2`.

## ✅ Already-strong systems (refine, don't rebuild)
- `glassMenu.ts`: comprehensive perf-tier-aware glass (liquidGlass presets, `adaptiveBlur`/
  `adaptiveShadow`, gloss).
- `PerfTier.ts` (main) + `TierManager.ts` (renderer): 5-tier classification, persisted,
  `data-perf-tier` on `<html>` driving CSS in `design-system.css` (low tier already kills
  backdrop-filter/animations/shadows).
- `idlePause.ts`: hidden/blur pause coordinator (`dex:idle-pause`/`dex:idle-resume`).
- `WorkerPool`: suspend + free idle workers on hidden (session 4).
- Icons: `DexIcon` defaults `strokeWidth: 1.5` — already thin/sharp; keep consistent.

---

## Premium roadmap (needs running Electron app + reliable tooling)
1. Dock excellence (after fixing #2): the existing hover-intent is good; verify anchored
   reveal, indicators, running states.
2. Shell transitions: window open/close/minimize/restore, workspace switching — no layout
   jumps / redraw flashes.
3. Window management: min-sizes, resize correctness across all apps.
4. Audio UX: subtle notification/confirmation sounds, latency, device switching.
5. Creative apps (Vinx/Imosion/Prism/Forge/AXL/Canvas): toolbar/panel density, long-session
   comfort. (Vinx clip-color + ctx-menu already fixed session 4.)
6. UKI & Nexus: density, search quality, response readability.

---

## ⚠️ Tooling caveat (this session)
The Bash **stdout channel intermittently returned empty** even for trivial `echo`/`node`
commands, and Read returned empty for large-file regions (notably `AppManager.tsx`). Edit
(explicit match/no-match), Write (explicit success), and background-task **exit codes** (via
notification) remained trustworthy. **No blind edits were made to `AppManager.tsx`** to avoid
corrupting the 100%-green build. Redo the dock fix in a clean session: verify by reading a
small file first; note `TierManager.ts` has a UTF-8 BOM.

## Verify-before-commit checklist
- `npx tsc --noEmit` clean (renderer + main)
- `npx vitest run` → 4611+ passing / 0 failing (rely on exit code if stdout is flaky)
- Stage explicit files (`git add <file>`), not `git add -A`, while tooling is degraded.
