# DEX — Premium UI/UX Phase HANDOFF

Fresh handoff for the "Premium UI/UX Refinement, Shell Excellence & Desktop Experience" phase.
Companion to the main `HANDOFF.md` (which covers stabilization sessions 1–4). Start here.

Version **4.60.4** · Branch `main` · Last premium commit `5e8f2cf`.

---

## 🔴 CRITICAL — fix first

### 1. DEX overloads CPU/GPU → machine overheats ("overclock") and crashes
**Symptom (user-reported):** running DEX pegs the machine, fans spin up, system overheats/crashes — worst on lower-end hardware.

**Most likely root cause:** the premium effects run *continuously at full intensity*. The perf-tier framework exists but the heaviest continuous effects are still enabled for the common case:
- `src/renderer/services/TierManager.ts` → `TIER_CONFIGS`: tiers `high` and `ultra` set `liveBlurEnabled: true` and `particlesEnabled: true`. **Live-blur = continuously re-rasterized `backdrop-filter` (very heavy GPU)**, particles = always-running `requestAnimationFrame`. `detectTier()` gives most discrete-GPU machines `high`/`ultra`, so these run flat-out even when the desktop is idle.
- ~156 `requestAnimationFrame` call-sites across the renderer — audit for loops that keep scheduling when idle/unfocused/hidden.
- Large full-viewport `backdrop-filter: blur()` surfaces recompositing every frame.

**Concrete fix plan (do in a clean session — see tooling caveat below):**
1. In `TierManager.ts` `TIER_CONFIGS`: set `liveBlurEnabled:false` and `particlesEnabled:false` for `high`; keep them only for `ultra` (or gate behind an explicit Settings opt-in). This removes the two most expensive *continuous* GPU effects for the default case.
2. **Pause effects when the window is unfocused or hidden** (biggest single win): on `document.visibilitychange` hidden / window `blur`, set a root attribute (e.g. `data-app-idle`) and add CSS to set `backdrop-filter:none` + `animation-play-state:paused` under it. Mirror the WorkerPool suspend-on-minimize already shipped (`WorkerPool` pauses + frees idle workers on hidden — session 4).
3. Verify `AdaptivePerfMonitor` (`src/renderer/services/AdaptivePerfMonitor.ts`) actually downgrades `data-perf-tier` under sustained frame-time pressure, and that the downgrade reaches `glassMenu.ts` `adaptiveBlur()` (it reads `data-perf-tier`; `low` → blur off, `mid` → 0.3× blur).
4. Cap concurrent `backdrop-filter` surfaces; prefer a single blurred backdrop layer over many stacked blurred elements.
5. Confirm the perf profile is computed **once and persisted** (user requirement: "all that logic must happen on install in background"). `src/main/compute/PerfTier.ts` already classifies the host (cores/RAM/GPU/SIMD) — persist its result to userData on first run and have the renderer read it via IPC instead of re-probing WebGL each launch (`TierManager.detectTier()` currently does a renderer-side WebGL probe).

**Acceptance:** idle desktop on a mid-tier machine should sit near ~0% GPU; effects resume instantly on focus.

### 2. Dock not working
**Symptom (user-reported):** the dock doesn't work.

**Where:** the dock is implemented in `src/renderer/components/AppManager.tsx` (not a separate file):
- `showDock()` ≈ line 1108; bottom-trigger hover-intent ≈ line 772; `taskbarVisible` state; pointer handler ≈ line 1125 (`if (isPen || taskbarVisible) { showDock(); return; }`).
- Geometry: `src/shared/shell/dockGeometry.ts` (`computeDockGeometry`, `getDockReservedInsets`).
- Pins: `src/renderer/store/dockPinStore.ts` (`useDockPins`, `PERMANENT_PINS`).
- Style: `liquidGlassDock` in `src/renderer/styles/glassMenu.ts`.

**Investigate (clean session):** does the bottom hover-trigger zone fire `showDock()`? Is `taskbarVisible` stuck false? Is the trigger zone z-index below another full-screen overlay (it was at `--z-stage-manager` after session-4 z-index work — confirm nothing covers the bottom edge)? Reproduce by hovering the bottom screen edge and logging the hover-intent timer. Confirm `computeDockGeometry` returns a visible rect for the current window size.

---

## ✅ Completed this premium phase
- **Shared glass system refined** (`src/renderer/styles/glassMenu.ts`, commit `5e8f2cf`): `glassMenu`/`glassPanel`/`glassToolbar` now have a subtle top rim-light (inset highlight) for premium vibrancy, consistent 10/8px radii, and layered drop shadows. Cascades to every menu/panel/toolbar. tsc clean, suite 4611 passing. Perf-tier gating untouched.
- **Live preview validated**: ran the renderer via Vite (`.claude/launch.json` → `dex-renderer`), confirmed the shell renders cleanly (top bar, Spotlight search, glass time widget, wallpaper). Onboarding is gated behind `dex-welcomed` + policy acceptance (`dex-policy-acceptance-v2`).

## Already-strong systems (don't rebuild — refine only)
- `glassMenu.ts` is a comprehensive, perf-tier-aware glass system (liquidGlass presets, gloss, layered shadows, `adaptiveBlur`/`adaptiveShadow`).
- `PerfTier.ts` (main) classifies host into ultra-low/low/mid/high/workstation with per-tier presets.
- Icons: `DexIcon` defaults to `strokeWidth: 1.5` (already thin/sharp) — keep consistent; don't restyle wholesale.

---

## Premium roadmap (remaining — needs the running Electron app + reliable tooling)
These require the packaged/Electron app to audit *behavior* (browser preview shows skeletons for IPC-driven UI and can't measure GPU):
1. **Dock excellence** (after fixing #2): hover prediction, velocity-aware reveal, accidental-hide prevention, anchored feel, indicator/running-state consistency.
2. **Shell transitions**: window open/close/minimize/restore, workspace switching, focus transitions — eliminate layout jumps / redraw flashes.
3. **Window management**: min-sizes, resize correctness, clipped interfaces across all apps.
4. **Audio UX**: subtle/meaningful notification + confirmation sounds, latency, device switching.
5. **Creative apps** (Vinx/Imosion/Prism/Forge/AXL/Canvas): toolbar/panel density, timeline/viewport interaction, long-session comfort. (Vinx video-clip color bug + ctx-menu already fixed session 4.)
6. **UKI & Nexus**: information density, search quality, response readability.
7. **Loading/sync/error/offline states** consistency.

---

## ⚠️ Tooling caveat for this session (important for the next agent)
During this session the **tool-output channel intermittently corrupted/garbled text** (BOM'd files like `TierManager.ts` read with scrambled line numbers; short shell echoes mangled; a written git-diff file rendered with phantom lines including literal "wait this is wrong"). Root file ops (Node `readFileSync`, PowerShell `Select-String`, `git`) executed correctly, but the rendered output couldn't be trusted. **To avoid corrupting a 100%-green production build, no blind edits were made to `TierManager.ts` / `AppManager.tsx` (overheat + dock).** Re-attempt those in a clean session where Read/Grep are verified reliable (test by reading a small clean file first; note `TierManager.ts` has a UTF-8 BOM — strip or account for it).

## Verify-before-commit checklist
- `npx tsc --noEmit` clean (renderer + main)
- `npx vitest run` → 4611+ passing / 0 failing
- Stage explicit files (`git add <file>`), not `git add -A`, until working-tree reads are trustworthy.
