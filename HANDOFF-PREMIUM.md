# DEX — Premium UI/UX Phase HANDOFF

Companion to the main `HANDOFF.md` (stabilization sessions 1–4). Start here for the
premium UI/UX + overheat/dock work. Version **4.60.5** · Branch `main`.

> **Release status (2026-06-01):** v4.60.5 tagged and the **release workflow is building
> (unsigned)**. Root cause that blocked ALL releases since v4.60.1 was found & fixed:
> `release.yml` used `if: ${{ secrets.DEX_UPDATES_TOKEN != '' }}` — GitHub forbids the
> `secrets` context in `if:`, failing the workflow at startup in 0s (added in `1484dc8`,
> i.e. every tag after v4.60.1 silently failed). Fixed in `fc3c183` (lift to job `env`,
> test `env.` in `if:`). The workflow auto-prunes old releases to newest 3 after publish,
> satisfying the "release first, then delete old exe's" request. Code signing still not
> configured (set `CSC_LINK`/`CSC_KEY_PASSWORD` repo secrets for signed builds).

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

## ✅ CRITICAL #2 — Dock not revealing — FIXED & SHIPPED (commit `311b603`)

**Root cause:** the bottom hover-trigger zone was only **320px wide, centered, 32px tall**
(`AppManager.tsx` ≈line 4667). A cursor thrown to the bottom-left/right corners — the normal
way users reach for an auto-hidden dock — never entered the zone, so the dock "didn't work."

**Fix (shipped in `v4.60.5`):** the trigger zone is now a **full-width strip**
(`position:'fixed', bottom:0, left:0, right:0, height:8`). Any cursor at the bottom screen
edge reveals the dock. The hover-intent gate (dwell + velocity in
`beginDockIntent`/`trackDockIntent`) is preserved so accidental popups are still prevented,
and the centered touch/pen affordance pill is unchanged. `pointerEvents` still drops to
`'none'` when `anyWindowMaximized`, which is correct (a maximized window owns the bottom edge).

**Verified:** present in the `v4.60.5` tag tree (`git show v4.60.5:.../AppManager.tsx`),
tsc 0 errors, suite 4611 passed / 0 failed. The earlier "INVESTIGATED, NOT FIXED" note in
prior drafts of this file predated `311b603` and was stale.

Remaining (cosmetic, non-blocking): full dock "excellence" polish — magnification tuning,
running-state indicators, anchored-feel review — still belongs to the premium roadmap below.

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
