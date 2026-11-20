# DEX OS 7.0.2 — Verification

**Updated:** 2026-11-19 · **Creator:** Onazi oJ · **Branch:** `claude/part25-hardening` (PR #157)
**Build identity:** `7.0.2+build.<commit count>` (serial `001z`), commit and channel from `scripts/build-info.mjs` — shown in Settings › About and Nexus › Diagnostics. Record the exact build line (About › Build info › Copy) next to any new evidence below.

Statuses: VERIFIED (evidence below) · UNIT (tests only) · PREVIEW (web preview only, no native) · NOT TESTED · BLOCKED. Only VERIFIED counts as a passed gate.

**Release verdict: NOT READY.** Builds and tests pass, and the packaged security and app checks below passed on release executables, and on 2026-11-19 the release exe of 7.0.2+build.1023 (commit 943f7a53e716) passed packaged security 27/27, the packaged apps check 14/14 (including the Part 24/25 checks) and the 100/500-tab Browser probe. Gates still not run: installer install/upgrade/rollback, packaged multi-window stress, and code signing (no certificate). Nothing was published.

## Release gates

| Gate | Status | Evidence |
|---|---|---|
| Critical defects resolved | VERIFIED (known list) | No open HIGH row in `DEX_REMAINING_WORK.md` is a crash or data-loss defect; data-loss defects found in this pass were fixed (#353 compare/originals, #364 Gallery "Delete", #361 outline import, #370 due dates) |
| Data migration | UNIT | Old UTC-midnight task dates read as the picked day (`local-date.test.ts`); old Gallery adjustment keys read (`gallery-adjust.test.ts`); Studio/board formats versioned |
| Security checks | VERIFIED (release exe, 2026-11-18) | `scripts/perf/packaged-security.mjs` 27/27 → `docs/reports/perf/2026-11-18-security-xack.json`: onboarding gate, tampered onboarding file, privileged/elevation/system-folder/relative-folder refusals, Xack tickets (none, other command, unapproved, reused, privileged at request), secret env scrubbing, cancel, timeout, history, browser tab has no native IPC, downloads |
| Permissions | UNIT + PREVIEW | UKI capability grants and decisions (`uki-agent-runner-policy`, `uki-xack-routing`); native web-permission prompts verified earlier (#87/#88 rows) |
| Onboarding | VERIFIED (release exe) | Same security run: required decision enforced natively, stale versions refused |
| UKI | UNIT + PREVIEW | Agent policy, Xack routing, context budget (`uki-context-budget`), per-app actions registered and run in preview (#360). Cloud model run needs a provider key (#4) |
| Xack | VERIFIED (release exe) + UNIT | 6 packaged Xack checks above; 11 Rust unit tests in `xack.rs` |
| Umari | VERIFIED (release exe, 2026-11-19) + UNIT | packaged: 47 projects detected, retrieval stays inside its character budget (500/500; build 1022 overran it at 525/500, fixed in umari.rs `retrieve`); Rust tests in `umari.rs` and `dex-search` (secret files not content-indexed); folder picker click-through in the packaged app NOT TESTED (#350) |
| Browser | VERIFIED (release exe, 2026-11-19) | 100 tabs: all kept, 1 live page after restore, 542 MB private, 1.6% of a core; after visiting 20 tabs 6 live pages, 917 MB (`2026-11-19-tabs100.json`). 500 tabs: all kept, 1 live page, 553 MB, 1.6%; the first 500-tab run reported 0 live page targets after visits (6 hosts mounted), the re-run 6/6 at 865 MB, recorded as a flaky probe reading, not investigated further (`2026-11-19-tabs500.json`) |
| Multi-window / all apps | VERIFIED (release exe build 1023, 2026-11-19) | `scripts/perf/packaged-apps-stress.mjs` → `2026-11-19-apps-stress.json`: all 61 apps open alone with no crash screen and no uncaught error; all 61 open at once: 62 windows mounted, 0 crashes, event-loop delay p99 20.8 ms (max 129 ms), 37 MB heap; 3 open/close-all rounds: heap after GC 28 → 31 MB. Opening all 61 one after another took 35 s (app mounts block the shell, a speed item). An earlier run against a debug exe loaded an error page and is discarded |
| Apps | VERIFIED (release exe, 14 checks, 2026-11-19) / PREVIEW (Gallery, Studio, Browser history) | `2026-11-19-apps-check.json` 14/14: build identity, fs:writeBase64, Xack read-only grant vs chained command and revoke, Umari, unified chrome, Calendar alert with Calendar closed, plus the 8 earlier checks; security `2026-11-19-security.json` 27/27. Calculator launch time is not measured by the probe (null) |
| Installer | NOT TESTED for 7.0.2 | `npm run build:tauri` produces MSI + NSIS with the bundle gate; no install run on this head |
| Upgrade | NOT TESTED | Needs an install of the previous build first |
| Rollback | NOT TESTED | — |
| Code signing | BLOCKED | No certificate (`docs/SIGNING.md`); release workflow builds unsigned without one |

## Measurements on this machine

i7-8665U, 16 GB, Windows 26300, release exe, isolated profile (`docs/reports/perf/2026-11-17-after-500tabs.json`): desktop usable 1.45 s cold / 2.0 s warm; idle shell measured 54.6% of one core in that run (cause not recorded in the file; a fresh profile also builds the search index), 21.5% with 10 apps open, 7 processes. Re-measure on this head before release. No 90/120 Hz hardware here; frame-time targets are not claimed.

## Tests at this head

Unit suite (vitest), TypeScript, watermark and IPC ABI gates, renderer build (chunk-cycle guard), `cargo check`, Rust unit tests for `xack`, `umari`, `dex-search`, `native_ops::write_base64`. Run before each push; CI repeats them on the PR.
