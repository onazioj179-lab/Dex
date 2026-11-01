# DEX — Performance Report

**Date:** 2026-11-01 · **Creator:** Onazi Oj · Machine: Windows 11 Pro 26300, 8 logical cores, WebView2 156. All numbers measured on the packaged release build. Where a comparison isn't like-for-like, it says so. No number here is estimated.

## Headline results

| Metric | Before | After | Notes |
|---|---|---|---|
| Installed app starts | **No** (`0xC0000135`, missing `WebView2Loader.dll`) | **Yes**, 1.3 s to window | Installed 6.0.1 vs installed 6.1.0 |
| Packaged UI renders | No (boot ReferenceError, 21 DOM nodes) | Yes (166–192 nodes, 0 exceptions) | |
| Rust process, steady idle | **50–100%** of a core, continuous | **~1–2%** of a core | Per-10 s CPU slices over 1–3 min, 3 launches |
| Rust process, first 10 s | 117–258% of a core | 14–17% (48% once, during a one-time segment compaction) | |
| Whole app idle (7 processes, 30 s) | 7.01% of machine / 743 MB | **1.35%** of machine / **617 MB** | |
| Launch-time search sync | Full clear + re-index (~80 CPU-s) | Incremental: ~1.6 s walk, 0–1 files | Snapshot persisted |
| Search index on disk | 24 segments / 48 MB | 3–4 segments / 37–39 MB | |
| IPC transport | postMessage 0.3 ms p50 | Kept (custom protocol measured 5× slower) | Same-page A/B |
| Shell exe | 60.9 MB (GNU) | 37.9 MB (MSVC) | |
| NSIS / MSI | 19.3 / 25.3 MB (6.0.1) | 14.1 / 17.7 MB (6.1.0) | Version content differs too |
| Eager startup JS | 6 chunks / 2,008 KB | 4 chunks / 1,888 KB | |
| WebView2 preflight cost | — | 0.27–0.86 ms | |
| `node_modules` | 331 MB | 277 MB | |
| Developer disk | +23.5 GB Rust caches, 11.2 GB npm cache | reclaimed (owner-approved) | Not part of the app |
| External network at launch/idle | 2 Google DNS prefetches | **0** requests | Network capture |

## Root causes fixed (idle CPU)

1. Every launch rebuilt the whole full-text index (the in-memory snapshot was always empty). Now the snapshot is persisted next to the index.
2. Each search/count built a new tantivy reader (meta.json re-parse + watcher thread). Now one shared reader.
3. One commit per file fragmented the index into 24 segments, and merges were abandoned and redone. Now batch commits that wait for merges.
4. The file watcher reacted to `node_modules`/`target`/`.git` churn with full folder walks. Those events are now filtered, changed paths are applied directly, and full syncs are spaced ≥30 s apart.

Method: thread CPU deltas plus a dbghelp `StackWalk64` sampler with the build PDB; samples were dominated by `IndexMerger::write` / `segment_updater::merge`.

## Not measured

Warm vs cold startup separately (no controlled cold-cache setup); frame consistency (no frame-timing harness; this PC has Windows animations off); battery (desktop); app install time (apps are bundled, not downloaded); search latency at scale.
