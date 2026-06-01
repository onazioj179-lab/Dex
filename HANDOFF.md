# DEX HANDOFF

Operational state of the DEX desktop platform. Update at the end of every session.

Current version: **4.60.5** · Branch: `main` · Last session: 2026-06-01 (overheat + dock fixes, v4.60.5 release tagged unsigned)

> See **HANDOFF-PREMIUM.md** for the premium UI/UX phase: overheat fix (thermal-hot universal backdrop-filter kill), dock full-width reveal fix, fluid-glass refinement. v4.60.5 tagged to trigger an unsigned release build; the release workflow auto-prunes old releases to newest 3.

### Release Artifacts per Platform
| Platform | Artifacts |
|---|---|
| Windows | NSIS installer (x64 + ARM64) · Portable exe (x64) · ZIP (x64) |
| macOS | DMG (x64 + ARM64) · ZIP (x64 + ARM64) |
| Linux | AppImage (x64) · DEB (x64) · RPM (x64) |

Release mechanism: bump `package.json` version → commit → push tag `vX.Y.Z` → GitHub Actions release workflow builds + publishes. Auto-update reads the GitHub provider in `package.json build.publish` (`onazioj179-lab/Dex`).

---

## Current Phase: UI/UX Modernization (modern · sharp · pro · fluid glass)

Goal: a more modern, sharp, "pro" feel across the shell and apps — thin/sharp icons, fluid (liquid) glass where it fits, consistent surfaces, no missing/inconsistent styling — while scaling cleanly from low- to high-end machines. Improve *in place* (replace/refine existing components); not a drag-to-rearrange system.

### IMPORTANT — these systems already exist and are wired. Build on them; do not reinvent.

| System | Where | What it does |
|---|---|---|
| **Device perf tier** (low/mid/high/ultra) | `src/renderer/services/TierManager.ts` | Single source of truth for the **visual** tier. Detects hardware on **first launch** (`getHardwareSummary` — cores, RAM, GPU renderer string via WebGL), **persists to localStorage**, applies `data-perf-tier` + CSS vars (`--blur-intensity`, `--glass-opacity`, motion durations). `initializeTier()` is called in `App.tsx:147`. Re-detection does not happen every launch — stored tier is reused (your "detect once in the background, then just read it"). |
| **Adaptive perf monitor** | `src/renderer/services/AdaptivePerfMonitor.ts` | Downgrades/upgrades the live visual tier when the system is hot/busy; restores on idle. |
| **Compute tier** (separate, backend selection) | `src/main/compute/PerfTier.ts` | Main-process classification (ultra-low…workstation) for WebGPU/ONNX-quant/worker-count/path-tracing presets. Distinct purpose from the visual tier — not a duplicate. NOT IPC-wired to the renderer (compute subsystems consume it directly). |
| **Fluid / "liquid" glass** | `src/renderer/styles/glassMenu.ts` + `shellPreferencesStore.ts` | `GlassMode = 'off' | 'reduced' | 'normal' | 'liquid'`. `adaptiveBlur()` scales blur+saturation by tier and `data-glass-effective-mode`. `applyGlassVars()` sets `--dex-glass-effective-mode` + `data-glass-mode`/`data-glass-effective-mode` on root. Low tier → backdrop-filter off. |
| **Perf-tier CSS** | `src/renderer/styles/design-system.css` (~line 2572+) | `html[data-perf-tier="low"]` strips blur/shadows/transitions; full effects on high/ultra. |
| **Design tokens** | `design-system.css` | Comprehensive: `--color-*`, `--space-1..20`, `--radius-xs..2xl`, `--blur-sm..xl`, `--pg-shadow-*`, full `--z-*` ladder, glass/gloss tokens. Refining core tokens cascades app-wide. |
| **Icons** | `src/renderer/components/DexIcon.tsx` | `<DexIcon name size strokeWidth=1.5 />` — already thin/sharp by default. |

### Changed this session (safe, cascade-level, perf-tier-aware)
- `src/renderer/styles/design-system.css` — modernized the core fluid-glass utilities (`.dex-glass-panel`, `.dex-frosted`): higher backdrop saturation, **token-based hairline border** (`--color-border-glass` instead of a hardcoded rgba — consistency), and a 1px inner top highlight (`--pg-gloss-top`) for crisp modern depth. Low tier still strips these automatically.

### Modernization audit — every item investigated this session (not deferred)
Each "redesign" candidate was opened and checked against the real code. Findings:
1. **Glass-surface consistency** — ✅ already consistent. Grep of shell chrome for opaque one-off panel backgrounds found **none** (only one intentional notification-badge red). Shell surfaces already route through the glass tokens / `adaptiveBlur`. Core `.dex-glass-panel`/`.dex-frosted` modernized this session (token border + inner highlight).
2. **Icon thin/sharp** — ✅ already correct. DexIcon defaults to `strokeWidth=1.5`. The inline SVGs that *look* heavy (sw 2.5–3.5) are on **tiny** icons (7–13px) in a 24-unit viewBox, so they render at ≈0.9–1.5px *actual* — correctly tuned for crispness at small sizes. Forcing them to 1.5 would render ≈0.6px (faint/blurry), i.e. a regression. No change warranted.
3. **Token radii/shadows** — radii are already tight (xs 3 → 2xl 12). Tightening further or re-weighting `--pg-shadow-*` is subjective taste with app-wide blast radius; doing it blind risks regressing a tuned look (over-doing). Needs a before/after screenshot pass with the user.
4. **Density (Spotlight/Stage/Imosion)** — purely subjective spacing taste; no concrete defect found. Needs user direction on the live app.
5. **`liquid` glass default on high/ultra** — evaluated; rejected. `normal` is already a full 22px-blur glass; `liquid` (30px) is marginal, would override a user's deliberate `normal` choice, and can't be visually confirmed here. Available in Settings for users who want it.

Net: the **code-level** modernization is complete (glass consistent + modernized, icons correctly thin, perf scaling wired). What genuinely remains is **subjective visual taste** that needs eyes on the running app — share a screen (Dock / Spotlight / a creative app) and it's a quick contained pass.

---

## Test / Build Status
| Item | State |
|---|---|
| TypeScript | Clean (`tsc --noEmit`, renderer + main). |
| Unit tests | **4611 passed / 0 failed / 7 skipped** (256 files) on Windows. |
| Production build | `npm run build` (vite renderer + main tsc) — **passing** (exit 0). Release-buildable. |
| Watermarks | In compliance (`npm run watermark:check`). |

---

## Stability / Release — externally blocked (cannot be done from the codebase)
- **Windows code signing** 🔒 *user action*: set `CSC_LINK` + `CSC_KEY_PASSWORD` repo secrets (Settings → Secrets → Actions). Until then builds ship **unsigned** (Defender warns).
- **ARM64 Windows installer** 🔒 *hardware*: build target exists; validate on real ARM64.
- **Multi-monitor focus / memory-pressure CSS / crash-recovery / long-session heap** 🔒 *runtime*: need the packaged app on real hardware. WorkspaceSnapshot load path was code-reviewed + hardened (skips malformed files).

---

## Prior phase (sessions 1–4): production stabilization — COMPLETE
All code-actionable items from the stabilization backlog were resolved. Highlights:
- Windows test suite 31 failures → 0 (powerMonitor guard, `path.posix.basename`, platform-agnostic fixtures, ToastProvider wrap).
- Invalid `var()`+hex-alpha CSS bug fixed (NotificationBanners, Vinx) via `color-mix`.
- Z-index ladder alignment (Spotlight→`--z-spotlight`, StageManager→`--z-stage-manager`, Vinx ctx menu→`--z-context-menu`).
- Long-session leak caps: NotificationBanners `recentTitlesRef`, Imosion `decodedBuffersRef` (FIFO 48).
- WorkerPool suspend-on-minimize + fixed no-op `pause()` stub.
- Dead-code removal: `CollaborationLayer.ts`, `notificationStore.ts`.
- Deferred with documented reasons: achievementsCatalog async lazy-load (race risk for 40ms), Prism ImageData pooling (Canvas-2D allocates), Imosion decode chunking (`decodeAudioData` no streaming variant).

---

## Important Development Rules
- Refine/replace existing systems in place — do not duplicate or add parallel systems.
- No placeholder code — every committed line must do something useful.
- The perf-tier + glass systems are mature and wired — extend them, don't rebuild.
- Visual changes need eyes-on iteration; keep blind changes token-level and perf-tier-aware.
- Always run `tsc --noEmit` + `vitest run` before committing. Windows is the primary platform.
- Always update this HANDOFF at the end of every session.
