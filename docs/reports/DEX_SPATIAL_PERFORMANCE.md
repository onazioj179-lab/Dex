# DEX Spatial Desktop — Performance

**Date:** 2026-11-01 · **Creator:** Onazi Oj

## How this was measured (read first)

- Vite dev build in the Claude desktop app's browser pane, viewport emulated at 1280×720, preview profile (not a user profile).
- The pane was **hidden** for most runs. Hidden, Chromium produced **no frames** (requestAnimationFrame did not fire, screenshots timed out), so `requestAnimationFrame` was replaced by a 16 ms timer **for testing only**.
- Therefore **frame rate, GPU usage and input-to-photon latency were not measured.** The numbers below are main-thread costs (synchronous style + layout) forced after each camera update, which is an upper bound on per-frame work.
- Not yet measured in the packaged Tauri build or on other hardware.

## Results

| Scenario | Windows | Measure | Result |
|---|---|---|---|
| Camera update **before** the CSS fix below | 58 | forced style+layout per pan step | **~3,000 ms** (3,042 / 2,479 / 2,394 ms) |
| Style write on an empty element, before fix | 58 open | forced style+layout | 23 ms |
| Same, after fix | 50 open | forced style+layout | **0.2 ms** |
| Pan, fit-all (12 %), after fix | 50 | 30 steps | median 30.8 ms · p90 35.6 · max 39.2 |
| Zoom (Ctrl+wheel), fit-all, after fix | 50 | 30 steps | median 31.4 ms · p90 34.7 · max 36.6 |
| Pan at 100 %, 6 visible / 44 culled | 50 | 30 steps | median 33.8 ms |
| Transform-only update, per-window attribution | 50 | contents hidden one at a time | 17.1 ms total, **14.8 ms from the one large on-screen window (Weather)**; every other window ≤3.4 ms |
| Arrange grid | 58 | synchronous part (incl. React re-render) | 133.5 ms, one-off |
| Arrange result | 58 / 50 | overlapping pairs | 0 / 0 |
| Memory | 6 → 58 | JS heap | 46 MB → 128 MB; 15,712 DOM nodes |
| Zoom anchor accuracy | 6 | 55 % → 90 % at cursor | 0.0018 world px drift (CSS matrix rounding) |
| Drag tracking at 90 % | 6 | 150×80 px pointer move | window moved (166, 88) world px = pointer ÷ zoom |

## Defect found and fixed: ancestor `[style]` selectors

Seven rules matched `html[style*=…] *` / `:root[style*="--dex-…"] …` (large-text mode and the Phase 15 appearance bus). Blink keys invalidation on the attribute name, so **every inline-style write on any element recomputed that element's entire subtree**. That cost hit the whole OS, not just the canvas. Window drags write an inline transform every frame, so drags paid it on the dragged window's subtree. The rules now match `data-dex-*` attributes mirrored on `<html>` (`data-dex-motion`, `-transparency`, `-blur-tier`, `-density`, `-contrast`, `-large-text`, `-custom-accent`). `tests/unit/css-style-attr-selectors.test.ts` fails if the pattern returns.

## What remains

- ~20–35 ms main-thread work per camera update with 50 windows, dominated by the large on-screen app content, not by window count. Culled windows are cheap. Tried without improvement: `will-change: transform`, absolute instead of fixed windows, a CSSOM rule instead of inline style, Web Animations (worse, ~400 ms).
- Needs: a visible-window FPS trace in the packaged build (Performance panel), and a lower-end machine run before publishing hardware requirements. **No hardware requirement is claimed yet.**
