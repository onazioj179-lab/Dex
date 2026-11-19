# DEX OS 7.0.2 — Verification

**Updated:** 2026-11-19 · **Creator:** Onazi oJ · **Branch:** `claude/part25-hardening` (PR #157)
**Build identity:** `7.0.2+build.<commit count>` (serial `001z`), commit and channel from `scripts/build-info.mjs` — shown in Settings › About and Nexus › Diagnostics. Record the exact build line (About › Build info › Copy) next to any new evidence below.

Statuses: VERIFIED (evidence below) · UNIT (tests only) · PREVIEW (web preview only, no native) · NOT TESTED · BLOCKED. Only VERIFIED counts as a passed gate.

**Release verdict: NOT READY.** Builds and tests pass, and the packaged security and app checks below passed on release executables, but several release gates have not been run on a build of the current head: installer install/upgrade/rollback, a packaged pass over the Part 24/25 changes, and code signing (no certificate). Nothing was published.

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
| Umari | UNIT | Rust tests in `umari.rs` and `dex-search` (secret files not content-indexed); folder picker click-through in the packaged app NOT TESTED (#350) |
| Browser | VERIFIED (release exe, 2026-11-17) | 500 saved tabs: all 500 kept after restore, 1 live page, 574 MB private, 4.9% of a core (`2026-11-17-after-500tabs.json`) |
| Multi-window | UNIT + PREVIEW | `appWindows`, session reopen tests; packaged multi-window stress NOT TESTED |
| Apps | VERIFIED (release exe, 8 checks) / PREVIEW (Part 24/25 changes) | `2026-11-18-apps-check.json` 8/8; later Gallery, Studio, Calendar/Tasks alerts, Browser history checked in the web preview only |
| Installer | NOT TESTED for 7.0.2 | `npm run build:tauri` produces MSI + NSIS with the bundle gate; no install run on this head |
| Upgrade | NOT TESTED | Needs an install of the previous build first |
| Rollback | NOT TESTED | — |
| Code signing | BLOCKED | No certificate (`docs/SIGNING.md`); release workflow builds unsigned without one |

## Measurements on this machine

i7-8665U, 16 GB, Windows 26300, release exe, isolated profile (`docs/reports/perf/2026-11-17-after-500tabs.json`): desktop usable 1.45 s cold / 2.0 s warm; idle shell measured 54.6% of one core in that run (cause not recorded in the file; a fresh profile also builds the search index), 21.5% with 10 apps open, 7 processes. Re-measure on this head before release. No 90/120 Hz hardware here; frame-time targets are not claimed.

## Tests at this head

Unit suite (vitest), TypeScript, watermark and IPC ABI gates, renderer build (chunk-cycle guard), `cargo check`, Rust unit tests for `xack`, `umari`, `dex-search`, `native_ops::write_base64`. Run before each push; CI repeats them on the PR.
