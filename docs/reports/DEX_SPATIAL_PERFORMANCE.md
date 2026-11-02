# DEX Spatial Desktop — Performance

**Date:** 2026-11-02 · **Creator:** Onazi Oj

## Method

- **Packaged release build** (MSVC, `npm run build:tauri`), WebView2 156, on the development PC: window 1280×800 CSS px at display scale 2.25 (≈2880×1800 device px). Same-PC numbers only. **No hardware requirement is claimed yet.**
- Driven over the Chrome DevTools Protocol (`--remote-debugging-port`). Real apps opened as windows (6 → 20 → 50), arranged in a grid, fit to view.
- **Frame timing** = intervals between real `requestAnimationFrame` callbacks while CDP injects real input (`Input.dispatchMouseEvent` wheel): 3 s per scenario. Pan = wheel over the desktop margin; zoom = Alt+wheel at the centre.
- CPU profile (`Profiler`) and a `devtools.timeline` trace for attribution.
- Isolation: a throwaway WebView2 profile, and the native data folder snapshotted before and restored after each run (see *Data safety*).
- Scripts: `spatial_fps.mjs`, `fps_profile.mjs`, `fps_trace.mjs` (kept with the session notes, not shipped).

## Results — first build (before the fixes below)

| Windows | Idle | Pan | Zoom |
|---|---|---|---|
| 6 | 60.0 fps (p95 16.8 ms) | 57.7 fps (p95 16.8 ms) | 23.8 fps (median 33.3 ms) |
| 20 | 59.5 fps | 47.7 fps | 19.3 fps |
| 50 | 35.7 fps | 7.4 fps | 3.0 fps |

## What the traces showed

- **Style recalc is no longer the problem.** After the ancestor-`[style]` selector fix, 3 s of panning with 50 windows ran 5 style recalcs touching 238 elements total. (Before that fix one camera update cost ~3 s of style work.)
- **50 live apps keep the main thread busy on their own** (idle already ~36 fps): clocks, live charts, animations → style / layout / paint / layerize every frame (trace: ~0.9 s of every 1 s on `CrRendererMain`).
- **Task Manager forced a whole-document layout every second**: its sparkline and area chart called `getBoundingClientRect` on each sample (187 ms of 3 s idle in the CPU profile).
- `will-change: transform` alone during motion did not help at 50 windows (A/B: pan 6.5 → 6.3 fps), because the cost is the apps' own repainting, not the camera.

## Fixes made from these measurements

1. Task Manager charts size from a `ResizeObserver` (no per-sample forced layout; also correct when zoomed).
2. Zoomed out below 35% (thumbnail-sized windows): every window except the front one moves to the `background` lifecycle phase and its CSS animations pause. Content stays painted; apps keep running.
3. `will-change: transform` on the world layer only while the camera moves (dropped 180 ms after), so content re-rasterises crisply at rest.

## Results — after the fixes

See the table appended below once the rebuilt package is measured.

## Data safety finding

An isolated WebView2 profile is **not** full isolation: DEX mirrors localStorage into the native `dex-kv.json`, so the first test run replaced the owner's settings mirror with a fresh profile's defaults. It was detected by diffing against the pre-test snapshot and the whole native folder was restored (verified identical). All later runs snapshot → run → restore.

## Crash observed under diagnostic tracing (open)

Three times, the packaged app exited with `thread '<unknown>' has overflowed its stack` shortly after a CDP trace that enabled the `gpu, viz, cc` categories with 50 windows open. Evidence so far: the renderer made **zero** native IPC calls in the window before the crash (instrumented), the failing thread is not a Rust-created thread, and a run with the same 50 windows and no tracing stayed up for 4+ minutes. This points at WebView2's in-process code under heavy diagnostic tracing rather than a DEX code path, but it is **not proven**; it stays in `DEX_REMAINING_WORK.md`.
