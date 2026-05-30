# DEX — Premium UI/UX Phase HANDOFF

Companion to the main `HANDOFF.md` (stabilization sessions 1–4). Start here for the
premium UI/UX + overheat/dock work. Version **4.60.4** · Branch `main`.

> **Accuracy log (read this):** Two earlier missteps this phase, now corrected —
> 1. Commit `e29845c` claimed an overheat fix landed; it didn't (a `TierManager` edit
>    silently failed on wrong field names, and those fields are dead anyway).
> 2. A first draft of *this file* described a new `ThermalGuard.ts` service. That service
>    was **removed before commit** once I found an existing equivalent; the real fix is in
>    `globals.css`. This file now reflects what actually shipped in commit `1a90f48`.

---

## ✅ CRITICAL #1 — Overheat / crash — FIXED & VERIFIED (commit `1a90f48`)

### What was actually wrong
DEX pegged the GPU and overheated/crashed on weaker machines because **class- and
token-based glass kept re-rasterizing `backdrop-filter` blur every frame**, even under
the thermal protection that supposedly mitigated it.

There is an existing, **active** FPS-based thermal monitor —
`src/renderer/services/ThermalAdaptiveMonitor.ts` (started in `main.tsx`). On sustained
low FPS it sets `data-thermal-state="warm"|"hot"|"critical"` on `<html>`. **But the CSS
for `hot` only removed `backdrop-filter` from elements with an *inline* style
(`[style*="backdrop-filter"]`).** All the heavy glass uses CSS *classes* /
tokens (`.dex-glass-panel`, `.dex-frosted`, `.liquid-glass-*`, tokenized surfaces), so
their blur kept compositing every frame — the dominant continuous GPU cost.

### The fix (in `src/renderer/styles/globals.css`)
- `html[data-thermal-state="hot"] *` now disables `backdrop-filter` on **all** elements
  (universal selector), mirroring the proven `html[data-perf-tier="low"]` rule but applied
  **dynamically** only while the monitor reports sustained hot, and **auto-removed when FPS
  recovers**. No app is unmounted; the perf tier is untouched.
- Added a `warm`-state pre-emptive cap on the heaviest class glass so surfaces ease off
  *before* reaching the hot cutoff.

### Why this approach (not a new service / not re-enabling AdaptivePerfMonitor)
- A first-draft `ThermalGuard.ts` was **removed** — it duplicated `ThermalAdaptiveMonitor`
  (no junk architecture). Strengthening the existing monitor's CSS is the minimal fix.
- `src/renderer/services/AdaptivePerfMonitor.ts` is intentionally a **no-op** (`return;` at
  ~line 145). A *previous* directive ("max visuals regardless of power state") disabled it,
  and its downgrade path called `applyTierPresets` → `deferHeavyApps` → **unmounted
  background apps (blank screen)**. Do **not** naively re-enable it. The CSS-only thermal
  approach cannot reproduce that regression.

### Dead ends documented so the next agent doesn't repeat them
- `TierManager.ts` `TIER_PRESETS[*].enableParticles` / `enableLiveWallpaper` are **never
  read** by `applyTierPresets()` — editing them does nothing.
- The particle + cursor-trail rAF loops in `VisualEffects.ts` already **self-terminate**
  when empty; not a continuous idle cost. No live-wallpaper component exists.
- `idlePause.ts` deliberately does **not** pause on *visible*-idle (comment: keep Home
  rendered while away). Hidden/blur still pause via `dex:idle-pause`.

### Verified
`tsc --noEmit` 0 errors; full suite **4611 passed / 0 failed**.

---

## 🔴 CRITICAL #2 — Dock not working — INVESTIGATED, NOT FIXED

**Honest status:** could not safely land this session. The Read/Grep/temp-file output
channel degraded to returning corrupted/empty content for `AppManager.tsx` (5000+ lines).
I will **not** blind-edit the dock — that is exactly what produced the bad `e29845c`
commit. Redo in a clean session with verified reads.

Verified facts (via Node, reliable):
- Dock is in `src/renderer/components/AppManager.tsx` (no separate file).
- Default mode `'auto-hide'` (`src/renderer/store/dockPinStore.ts` `DEFAULT_SETTINGS.mode`).
- Reveal: bottom-center trigger zone (≈line 4667) — `bottom:0, width:320, height:32,
  zIndex:5001, pointerEvents: anyWindowMaximized ? 'none' : 'auto'` →
  `beginDockIntent`/`trackDockIntent` (≈1122/1135) → `showDock()` (≈1108).
- `showDock()` early-returns when `anyWindowMaximized && !showAppMenuRef && !dockCtxRef`.
- `anyWindowMaximized = windows.some(w => w.isMaximized && !w.isMinimized)`.
- Geometry: `src/shared/shell/dockGeometry.ts` (`computeDockGeometry`).

Prioritized root-cause checks for next session (need running app):
1. **Trigger hit area too small/narrow** — only 32px tall, 320px wide, centered. Hard to
   hit; corners never trigger. Likely the "doesn't appear" complaint. Safe first fix:
   widen to full width / increase height to ~6–8px guaranteed band + keep center pill.
2. `anyWindowMaximized` stuck true → `showDock()` early-returns and trigger zone has
   `pointerEvents:'none'`. Check on a fresh home screen with no windows.
3. `computeDockGeometry` returning a zero/off-screen rect for the current window size.
4. `dockMode` persisted to an unexpected value in localStorage (`SETTINGS_KEY`).
Repro: hover bottom-center edge; log `beginDockIntent` firing and `showDock()` reaching
`setTaskbarVisible(true)`; inspect the dock bar element's computed transform/opacity.

---

## ✅ Completed earlier this premium phase
- **Shared glass refined** (`glassMenu.ts`, commit `6f15c89`): rim-lit top edge, consistent
  10/8px radii, layered shadows on `glassMenu`/`glassPanel`/`glassToolbar`. Cascades to all
  menus/panels/toolbars. Perf-tier gating untouched.
- **Live preview validated**: renderer runs via Vite (`.claude/launch.json`); shell renders
  (top bar, Spotlight, glass time widget, wallpaper). Onboarding gated behind
  `dex-welcomed` + `dex-policy-acceptance-v2`.

## ✅ Already-strong systems (refine, don't rebuild)
- `glassMenu.ts`: perf-tier-aware glass (`adaptiveBlur`/`adaptiveShadow`, liquidGlass presets).
- `TierManager.ts` (renderer) + `PerfTier.ts` (main): 5-tier classification, persisted,
  drives `data-perf-tier` CSS (low tier already kills blur/animations/shadows).
- `ThermalAdaptiveMonitor.ts`: FPS + long-task → `data-thermal-state` (now with universal
  hot CSS). Main-process `ThermalPowerManager.ts` emits real CPU-temp `dex:thermal-state`.
- `idlePause.ts`: hidden/blur pause. `WorkerPool`: suspend idle workers on hidden.
- Icons: `DexIcon` defaults `strokeWidth: 1.5` — already thin/sharp.

---

## Premium roadmap (needs running Electron app + reliable tooling)
1. Dock fix (#2) then dock excellence: anchored reveal, indicators, running states.
2. Shell transitions: window open/close/minimize/restore, workspace switching — no jumps.
3. Window management: min-sizes, resize correctness across all apps.
4. Audio UX: subtle notification/confirmation sounds, latency, device switching.
5. Creative apps (Vinx/Imosion/Prism/Forge/AXL/Canvas): toolbar/panel density.
6. UKI & Nexus: density, search quality, response readability.

---

## ⚠️ Tooling caveat (this session)
The Bash stdout + Read/Grep channels intermittently returned **empty or corrupted**
content (phantom `===` separators, duplicated lines) for larger reads — notably
`AppManager.tsx`. Reliable: `Write` (explicit success), `Edit` (explicit match/no-match),
**background-task exit codes** (via notification), and **tiny** `echo`/`node` outputs.
**No blind edits were made to files that couldn't be read back.** Verify reads on a small
file first next session. Note `TierManager.ts` has a UTF-8 BOM.

## Verify-before-commit checklist
- `npx tsc --noEmit` → 0 errors (`grep -c "error TS"` the log)
- `npx vitest run` → 4611+ passed / 0 failed (parse the log with Node; stdout may be flaky)
- Stage explicit files (`git add <file>`), never `git add -A`, while tooling is degraded.
