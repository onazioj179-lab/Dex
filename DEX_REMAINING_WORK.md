# DEX: Remaining Work

**Updated:** 2026-11-17 (finished rows cleared: 46 moved to the archive, #14 closed, #39 waiting on a listen-test) · **Creator:** Onazi oJ · This is the active backlog: only rows with work left. Finished rows that still need a packaged-app, hardware, key or owner check are listed at the end; fully completed rows are in `docs/reports/DEX_COMPLETED_WORK.md` (row numbers unchanged).

| # | Requirement | Status | Why incomplete | Components | Next action | Needs | Priority |
|---|---|---|---|---|---|---|---|
| 3 | Local AI measured end to end | DEFERRED (owner) | Owner parked Ollama work. Local AI is now opt-in (no startup probe, not routed to unless connected in Settings › AI Providers) | Ollama | None until the owner reopens it | Owner | — |
| 4 | Cloud AI measured end to end | NOT TESTED | No provider key here | Providers | Add a key; run a scripted agent session (web search + file read) | Owner key | P1 |
| 5 | Screen sharing in the packaged app | NOT TESTED | The system picker needs a human to choose a window | `uki/screenCapture.ts` | Click "look at my screen", pick a window, confirm one frame is sent and the indicator clears | Tester | P1 |
| 6 | Clean-machine install test | NOT TESTED | No VM | NSIS/MSI, WebView2 bootstrapper | Install on a VM without WebView2 | VM | P1 |
| 7 | Screen-reader pass | NOT TESTED | Needs an interactive session | Shell + new assistant controls | Narrator/NVDA walkthrough | Tester | P1 |
| 8 | Signed updates + downloadable apps | BLOCKED | Needs signing key + hosting | Updater, Store | Owner creates key; choose hosting | Owner | P1 |
| 12 | Cross-device continuity | MISSING | No sync service exists | — | Product decision + authenticated, encrypted sync backend | Service | P3 |
| 15 | Live boot image root device | PARKED (owner, 2026-11-04: no Linux; DEX is the Windows Tauri app) | Live `grub.cfg` uses `root=/dev/sda2` | `dex-os/boot/grub.cfg` | Use `root=LABEL=DEX_ROOT` (see `docs/reports/DEX_UKI_INTEGRATION.md`) | Owner approval + VM | P2 |
| 16 | Unified Kernel Image, Secure Boot, rollback | PARKED (owner, 2026-11-04: no Linux; DEX is the Windows Tauri app) | GRUB + bzImage today; no signing, no previous-kernel entry | `dex-os/` | Design decision; owner-held keys | Owner | P3 |
| 17 | DEX OS image build + boot test | PARKED (owner, 2026-11-04: no Linux; DEX is the Windows Tauri app) | No Buildroot toolchain/VM here | `dex-os/` | Build in CI, boot in QEMU | VM | P2 |
| 19 | Terms of Service legal review | PARTIAL | Not a legal reviewer | `TERMS.md` | Legal review | Legal | P2 |
| 20 | Podcasts, shared albums, live captions | MISSING | Need backends/services | New apps | Product decision first | Services | P3 |
| 21 | Multi-monitor test | NOT TESTED | Single display | Window manager | Test on two displays | Hardware | P3 |

## Part 5: spatial desktop and creative suite (2026-11-01)

| # | Requirement | Status | Why incomplete | Components | Next action | Needs | Priority |
|---|---|---|---|---|---|---|---|
| 23 | Spatial desktop FPS / GPU, hardware requirements | NOT TESTED | Preview pane hidden, so no frames | `shell/spatial/*` | Performance-panel trace in the packaged build; one low-end machine | — | P1 |
| 24 | Spatial camera ~20–35 ms per update with a large on-screen app (50 windows) | PARTIAL | Dominated by the on-screen app's restyle. 2026-11-17: the camera pass no longer re-runs on unrelated store writes (zones, groups, guides, selection) | AppManager world layer | Profile in packaged build | — | P2 |
| 26 | Creative suite §7–15 | PARTIAL | Canvas now has editable whiteboard objects + templates; Creative Hub app added; PRISM shows image metadata. Shared assets library done (#271: persisted in dex.db, shared colours Colors ↔ PRISM, PRISM asset inserts render real pixels). **Video proxy audit (2026-11-14):** VINX has proxy settings (`ProxySettings`, `setProxySettings`) but nothing generates proxies and no UI sets them; `proxyPath` is always null and the Viewer prefers the original anyway. Native `video:transcode` works when ffmpeg is on PATH, but imported media are blob URLs (no disk path for ffmpeg), and export records the live playback canvas, so proxies would also need an export-time swap back to the originals. Hardware decode: playback is WebView2 `<video>`, which uses the GPU decoder by default; nothing to add. Not done: Audio/Present gap audit | Canvas, CreativeHub, Prism, VINX | VINX proxies: import keeps the disk path, `video:transcode` gains a scale option, Viewer plays the proxy, export swaps to originals. Then audit Imosion, Presentation against §12–14 | — | P2 |
| 27 | Glass / translucency (§16) | PARTIAL | Owner decision (2026-11) made refined glass the default. 7.0.1 adds the Interface Transparency slider on top (default reads as 40%; 0% = opaque, no blur; shared 0.55 opacity floor), an independent blur-strength slider, and a Refined/Liquid style choice. Not yet clicked through in a rendered Settings page, light + dark | `shellPreferencesStore`, `InterfaceTransparencyControl` | Click-through | Test profile | P2 |

## Carried over from retired task files (2026-11-01)

These open items came from Markdown task files that were deleted in the Part 5 cleanup (git history keeps the originals).

### From `docs/NEXT-STAGE.md` (backend / native milestone)

| Track | Needs | Foundations already in the code |
| App marketplace | Hosted registry, submission/review, package signing | `shared/plugin/manifest.ts`, `pluginHost`, `pages/Store.tsx` (see #8) |
| Cross-device sync + handoff | Account-bound sync server, per-store change feeds | `shared/cloud/*`, `shared/account/*` (see #12) |
| Real-time co-editing | CRDT relay / signalling server | `shared/collab/crdt.ts`, CollabHub (local) |
| E2E-encrypted offline sync | Sync server + key exchange | `shared/cloud/encryption.ts`, `uki/keystore` |
| Pluggable storage backends | Adapter interface + one remote adapter | `shared/cloud/coldTier.ts`, safe-storage layer |
| Bundled offline AI model | Packaged on-device model + native inference | UKI routing, Ollama provider (see #3) |

## 7.0.1 pass (2026-11-01, `claude/cranky-hopper-4f196b`)

Shipped: Interface Transparency slider, theme-aware glass vars (light mode no longer gets dark panels), Reduce Motion no longer disables glass, creator attribution, version 7.0.1, Tauri release profile, `npm run release:checksums`. Evidence: `DEX_7.0.1_VERIFICATION.md`. Release verdict **NOT READY**.

| # | Requirement | Status | Why incomplete | Next action | Needs | Priority |
|---|---|---|---|---|---|---|
| 30 | Code signing of the 7.0.1 installer | BLOCKED | No certificate; installer is unsigned | Install cert, set thumbprint per `docs/SIGNING.md`, rebuild | Owner cert | P0 |
| 34 | Playwright e2e; CI-load flakiness of `v6-performance-guards` | PARTIAL (perf guards FIXED; Dock reorder e2e waits for the real order since 2026-11-17, 5/5 runs) | Perf guards now warm up, take the best of 7 runs (load only adds time) and scale budgets by a same-machine calibration loop (1x to 4x), so a loaded runner no longer fails them while a quadratic regression still does; passed during a cargo LTO build at 100% CPU (the clamp guard measured 33 ms against its 30 ms raw budget, which failed before). e2e still not run in CI | `v6-performance-guards.test.ts` | 2026-11-13 (#229): the Electron-era specs could not run (they launch a main process that no longer exists); a web smoke suite now runs in CI. 2026-11-14 (#260): the old specs are deleted and their flows that work without native are ported (Calculator, Tasks, Calendar, rapid app switching) | — | P2 |
| 40 | Old 6.1.0 artifacts / release cleanup | WAITING | Rollback-critical until 7.0.1 installs. Inventory (Part 12): installed 6.1.0 at `%LOCALAPPDATA%DEX` (replaced by the 7.0.1 setup, not deleted by hand); Electron-era leftovers `%LOCALAPPDATA%dex-updaterinstaller.exe` (87 MB, May 2026) and `%APPDATA%dex` (old Electron profile, may hold user data); stale 6.1.0/7.0.1 MSI/NSIS files in worktree `target/` folders. Nothing was deleted | Owner approves deleting `dex-updater` after 7.0.1 installs; keep `%APPDATA%dex` until its contents are checked | Owner | P3 |

## Release status

**NOT READY.** The 7.0.1 draft release was built from the stale #81 branch (aff4006) and lacks #82 to #85; rebuild from `main` after this merge and replace the draft assets (#124 to #126). #1 is done. Still required: an install test of the single 7.0.1 setup (built and smoke-tested in Part 12; #32, #97), and a check in the installed app that the clipboard and MIDI prompts are gone (#87, #88). Signing (#30) is recommended but not required to publish. After that: **READY WITH DOCUMENTED LIMITATIONS**. Part 8 found and fixed data-loss defects in Files (#59–#62); none of the remaining open items is a crash or data-loss defect.

## Part 8: completion + stress testing (2026-11-03, `claude/dex-os-completion-stabilization-93cea6`)

Evidence: `DEX_7.0.1_VERIFICATION.md` › Part 8 checks.


## Part 9: spatial UX, multitouch, haptics, search (2026-11-03, `claude/dex-os-functional-completion-682249`)

Evidence: `DEX_7.0.1_VERIFICATION.md` › Part 9.

| # | Requirement | Status | Detail | Components | Next action | Needs | Priority |
|---|---|---|---|---|---|---|---|
| 77 | Creative apps deep pass (Part 9 §3): per-app editing workflows (Notes, Canvas, Design, Photo, Video, Audio, Present) | PARTIAL (2026-11-11: Presentation and VINX done: Presentation autosave now reports failures, Save/Open Deck files, local pictures; Presentation undo/redo, debounced autosave with a visible status and recovery of an unreadable stored deck in #151; VINX save failures now reported and export errors confirmed working. Correction: the VINX recovery banner was NOT working, it claimed "Recovered unsaved work" on every normal open; fixed in #152 (shown only after a session that did not close). Then (18l): Prism Open Project added (Save files were unopenable), Imosion and Canvas save failures now reported. 18k: Notes Export and Import were never ported to Tauri (both always failed); now converted in the renderer, saved/read natively, verified in the built exe. 2026-11-12: PRISM (#160), FLUX (#163), AXL (#168), Imosion, Canvas and Forge (#169) save passes done) | Keyboard scoping done (#85). Not yet audited workflow by workflow against §3 | Creative apps | Workflow-by-workflow audit against §3 for each creative app (save paths of Rewind, Gallery and Pixel Art done in #191/#192) | — | P1 |
| 82 | Maps routes / turn-by-turn | NOT IMPLEMENTED | Needs a routing provider whose terms allow it; none configured. Not faked | Maps | Pick a provider (self-hosted OSRM/Valhalla or a keyed API kept server-side) | Owner decision | P3 |

## Part 10: permissions, Password Generator+, spatial layout, docs (2026-11-03, `claude/dex-part10`)

Evidence: `DEX_7.0.1_VERIFICATION.md` › Part 10.

| # | Requirement | Status | Detail | Components | Next action | Needs | Priority |
|---|---|---|---|---|---|---|---|
| 97 | GitHub release v7.0.1 | NOT PUBLISHED | Part 12 built the single setup from this code, checksummed it and passed a packaged smoke test (6/6). Not installed on a machine; signing is blocked (#30) | — | Merge, install test (VM or over 6.1.0), then push tag `v7.0.1` (the workflow builds, checksums and publishes) | Owner | P0 |

## Part 12: one installer, release build, full-height apps (2026-11-04, `claude/dex-os-final-release-27d6d4`)

Evidence: `DEX_7.0.1_VERIFICATION.md` › Part 12.

| # | Requirement | Status | Detail | Components | Next action | Needs | Priority |
|---|---|---|---|---|---|---|---|
| 102 | Install, upgrade, uninstall, reinstall of the 7.0.1 setup | NOT TESTED | Running it here would replace the owner's working 6.1.0 | NSIS setup | Run on a VM, or over 6.1.0 when the owner chooses | Owner / VM | P0 |
| 105 | Per-app completion pass (Part 12 §2–5) | NOT DONE this pass (2026-11-11 smoke: all 56 apps opened in a built exe on a fresh isolated profile with 0 console errors and 0 error boundaries, after fixing Rewind null lists in 18g) | This pass fixed release blockers. Packaged smoke opened 31 apps without a crash; workflow-level checks per app remain as in #54, #77, #99 | Apps | Continue app by app | — | P2 |

## Part 13: refinement (2026-11-04, `claude/dex-part8-followup`)

| # | Requirement | Status | Detail | Next action | Priority |
|---|---|---|---|---|---|
| 116 | Remaining Part 13 batches | PARTIAL | Done 2026-11-14 (#290): dock/system-surface geometry (one work area for windows, tabs and the Dock) and the high-DPI test (real app at 225%). Left: per-app control consolidation beyond the top bar, creative/engineering app passes, multi-monitor (one display here), installer re-verification and old-executable cleanup | Next sessions | P2 |

## Recovered from PR #81 (2026-11-04, `claude/diagnostics-figures-flakiness-b81412`)

PR #81 was merged at 58639d9, then eight more commits were pushed to its branch (`claude/dex-build-chunks`) and never reached `main`: the packaged-app `window.dex` fix, the Vault state fix, the isolated-instance guard and both Diagnostics fixes. The 7.0.1 draft release was built from that branch tip (aff4006), so it lacks #82 to #85. This branch merges both lines. In #81's own numbering these rows were 100 to 103; they are renumbered here because `main` reused those numbers.

| # | Requirement | Status | Detail | Components | Next action | Needs | Priority |
|---|---|---|---|---|---|---|---|
| 127 | Installer signing | BLOCKED (no certificate) | No code-signing certificate on this machine. `release.yml` now signs automatically when the `WINDOWS_CERTIFICATE` / `WINDOWS_CERTIFICATE_PASSWORD` secrets exist (thumbprint passed via `TAURI_CONFIG`, nothing committed) and fails if the result is not `Valid`; unsigned builds print a warning. See `docs/SIGNING.md` Option C | `release.yml` | Buy an OV/EV certificate, add the two secrets | Owner | P1 |

## Part 17 (2026-11-04, `claude/dex-backlog-recovery-804924`): backlog recovery, Bioengineering, Ledger, creator identity

Audit result: every open row above was re-read; the items below are the Part 17 scope classified against the code as it is today (not from earlier notes). Priority: CRITICAL / HIGH / MEDIUM / LOW. "Verified" means checked in this session with the evidence shown.

| # | App | Requirement | Priority | Status | Evidence / blocker | Next action |
|---|---|---|---|---|---|---|
| 140 | Maps | Routing | LOW | BLOCKED (#82) | Needs a routing provider decision; not faked | Owner decision |
| 141 | AXL, VINX, DexCode, creative apps | Per-app workflow completion | MEDIUM | PARTIAL (see #54, #77, #105) | Not reworked in this pass | Continue app by app |
| 144 | Release | 7.0.1 packaged verification | CRITICAL | PARTIAL (2026-11-13: 18o release build + isolated packaged smoke, see #193) | Built and smoke-tested on an isolated profile; the setup itself was not installed (it would replace the owner's DEX); signing still blocked (#30, #102) | `npm run build:tauri`, install test on a VM |

## Session 2026-11-12 (`claude/backlog-pass`): backlog cleanup, eval ratchet, unslop pass 2, AXL save pass

Completed rows (nothing left to do or check) moved to `docs/reports/DEX_COMPLETED_WORK.md`; row numbers are unchanged.

| # | App | Requirement | Priority | Status | Evidence / blocker | Next action |
|---|---|---|---|---|---|---|
| 167 | Shell / apps | UI unslop pass 2 (#164 follow-up) | MEDIUM | PARTIAL (tests) | Flat fills instead of decorative 135° gradients: Home icon fallbacks (and their 12 px shadows cut to 2 px), startup splash logo (blue→purple), Imosion buttons (a gradient of one colour twice) and track avatars, Settings app tints, Share dialog note, PRISM filter swatches, VINX offline-clip placeholder (navy gradient; now flat and says "Media not loaded"). Dead CSS removed: 19 rules for classes no component uses (`vault-item-icon`, `voice-orb`, `automation-icon`, `device-card`, `transfer-icon`, `learning-icon`, `plugin-icon`, six `*-accent-gradient`, `vinx-clip`), and the unused `DEX_THEME` constant (gradient backgrounds, 14–20 px radii). Kept: live wallpapers and LUT thumbnails (content), the resize grip. `ui-unslop-guard.test.ts` gained a pass-2 check | App bar padding unified in #227 (bars are 44 px single-line, 59 to 69 px with a subtitle). One title-block size done in #261. Left: Control Center (owner taste) |

## Session 2026-11-13 (`claude/compassionate-wescoff-3fb5db`): UI unslop pass 3, inner apps

Rule for apps: accent is for the primary action and the selected state. Hover is neutral and flat. Keyboard focus is the one global ring.


## Done, waiting on a check or an owner decision

The work in these rows is finished; what is left is a run in the packaged/installed app, on hardware, or an owner choice. Full detail is in `docs/reports/DEX_COMPLETED_WORK.md` under the same number.

| # | Item | Needs |
|---|---|---|
| 309 | Setup Assistant (first run) | Packaged-app run (fresh profile) |
| 39 | UI sound effects (listen-test) | Packaged-app run |
| 22 | Dock/taskbar visual rework | Packaged-app run |
| 231 | Browser: A page opened while DEX was minimized stayed blank after restore | Packaged-app run |
| 47 | Browser: Closed: every listed piece exists (see `DEX_COMPLETED_WORK.md`) | Packaged-app run |
| 261 | CollabHub, Extensions, Kanban, Tasks, Workflows, Store: App bars still differed in height (59 to 69 px) after  | Packaged-app run |
| 270 | Window manager: Apps ran edge to edge under the top bar and the DEX Bar | Packaged-app run |
| 277 | Trophies | Packaged-app run |
| 278 | Terminal: Text-link toolbar, "✕" glyphs, green status dot, red-washed banner over an empty pane | Packaged-app run |
| 300 | Window manager: Owner spec: the Dock is a floating overlay; no permanent strip, windows not shrunk for it | Packaged-app run |
| 303 | VINX: Proxy settings existed but nothing made proxies (#26) | Packaged-app run |
| 306 | UKI voice | Packaged-app run |
| 308 | Shell + everyday apps | Packaged-app run |
| 36 | Calculator visual pass | Hardware (touch, DPI, displays) |
| 71 | Ten-point multitouch | Hardware (touch, DPI, displays) |
| 76 | Touch-friendly density mode (precision vs touch) | Hardware (touch, DPI, displays) |
| 111 | Black strip under fullscreen apps | Hardware (touch, DPI, displays) |
| 123 | Black strip in native fullscreen (root cause) | Hardware (touch, DPI, displays) |
| 18 | App-level colour sweep | Owner decision |
| 56 | Stale agent work + lost merges | Owner decision |
| 74 | Zeno subsystem | Owner decision |
| 75 | C++ components | Owner decision |
| 92 | Xenon C++ | Owner decision |
| 98 | Old releases | Owner decision |
| 104 | Product name "DEX" vs "DEX OS" in the installer and Start menu | Owner decision |
| 143 | C++: Native C++ modules | Owner decision |
| 38 | Light/dark + 125/150/200% scaling audit of every built-in app | Packaged-app run |
| 54 | Remaining apps audited this way | Packaged-app run |
| 55 | Auth engine lost from `main` | Packaged-app run |
| 57 | Fake controls in creative apps | Packaged-app run |
| 79 | Maps "My location" failed silently | Packaged-app run |
| 86 | FLUX undo/redo ran side effects inside state updaters | Packaged-app run |
| 91 | Spatial canvas grew into a horizontal strip | Packaged-app run |
| 99 | Nexus, Spotlight, context menus, dropdowns, notifications | Packaged-app run (2026-11-17 smoke: all 61 apps opened in the release exe on an isolated profile with no crash screen; menus/notifications still to click through) |
| 113 | Telemetry / Task Manager redesign | VERIFIED 2026-11-17 (release exe: `system:getStatus` returned real cpu/memory/disk/network/uptime, CPU 27.7%) |
| 115 | Live preview verification of 111-114 | Packaged-app run |
| 128 | Terminal is a real terminal (§7) | VERIFIED 2026-11-17 (release exe, isolated profile: Terminal app started Windows PowerShell; typed `echo DEX_PTY_OK_42`, the shell printed it back) |
| 133 | Windows PowerShell 5.1 `Read-Host` can receive keys out of order | Packaged-app run |
| 142 | Dock / App Menu: reorder and running dots (pin/unpin verified 2026-11-13) | Packaged-app run |
| 145 | Forge Watermark / Crop & Pad / Subtitle burn-in did nothing | Packaged-app run |
| 150 | Bio: GenBank import/export with features; primer pair check | Packaged-app run |
| 154 | Terminal: Live shells in the packaged app (extends #139/#146) | VERIFIED 2026-11-17 (same run as #128: live PowerShell session in the packaged app) |
| 155 | Bio: GenBank + primers in the packaged app (extends #150) | Packaged-app run |
| 158 | VINX: Real 3D LUT math (ROADMAP "Vinx 3D-LUT"); the built-in looks were … | Packaged-app run |
| 165 | Browser: block ads and trackers in WebView2 itself, before requests leave … | Packaged-app run |
| 168 | AXL: Save state that is true; Open/New that cannot lose work; honest export … | Packaged-app run: Export only (edit → Saved, Open, New VERIFIED 2026-11-13) |
| 169 | Imosion, Canvas, Forge: True save status in the remaining creative apps (#77) | Packaged-app run: Forge queue only (needs a real file; Imosion + Canvas edit → Saved VERIFIED 2026-11-13) |
| 191 | Gallery, Pixel Art, Files, Home, Settings, Terminal: silent failures and a Gallery crash … | Packaged-app run |
| 58 | Restore a collaboration checkpoint (all creative apps) | Packaged-app run |
| 9 | Cloud model catalog is dated | Provider key |
| 11 | Agent resume after app restart | Provider key |
| 159 | UKI: UKI can schedule reminders and background requests (ROADMAP GOAL track 2 … | Provider key |
| 157 | Browser | Packaged-app run (real pages) |
| 180 | Mock / fake data sweep (owner, 2026-11-05) | Packaged-app run (backup export via save dialog) |
| 181 | Renderer calls with no native handler (follow-up to #180) | Packaged-app run |
| 182 | Drag and drop did nothing in built DEX (files onto apps, in-page drags: Kanban, … | Packaged-app run (fresh release build drag) |
| 183 | Camera layers did nothing; library Shape/Text/Particles drew invisible | Packaged-app run (camera export) |
| 184 | Text Animator, Pre-compose, motion-path orient and templates did nothing or hid … | Packaged-app run (pre-comp export) |
| 187 | Shader Effects GLSL editor never compiled the code | Packaged-app run (shader export) |
| 189 | Pixel tools baked the whole screen (checkerboard + every visible layer) into the… | Packaged-app run |
| 190 | Render Queue: "Render All" rendered only the first job, jobs were labelled "MP4 … | Packaged-app run (render queue) |
| 193 | 7.0.2: retire Rewind; release build and packaged smoke run; Show in File Explore… | Packaged-app run (path with spaces) |
| 201 | Native IPC ABI guard (B001/B002/B016) | Next CI run (own step, #229) |
| 210 | Swipe-to-dismiss needed half the banner width; no flick, no cancel (B013) | Hardware (touch screen) |
| 212 | Release builds didn't run the ABI check (B001) | Next release tag run |
| 214 | EXIF read and "Save a copy without metadata" got `file://` URLs | Packaged-app run |
| 215 | Back ignored the app's own history; mouse side buttons did nothing (B013 predict… | Packaged-app run (mouse side button) |
| 216 | Local photos, music, video, PDFs and disk wallpapers never loaded in the desktop… | VERIFIED 2026-11-17 (release exe: a local PNG served through dexmedia, 200 image/png 386 KB, decoded in an <img>; SVG is refused on purpose) |
| 217 | "Split down" on a side-by-side tab added a third column | Owner decision (tree splits) |
| 219 | Send Files to a nearby DEX did nothing (fake control) | Two PCs on one network |
| 220 | Failures reported as success (#61 sweep) | Packaged-app run |
| 222 | Attach file, open and remove attachment did nothing | Packaged-app run |
| 226 | Every `dex.<ns>.onY(cb)` subscription was a silent no-op under Tauri | Packaged-app run (detached Vault / PIN change) |

## Session 2026-11-13 (`claude/backlog-cleanup-conflicts-16b9e3`): unslop passes 4 and 5, style leak between apps, web e2e in CI

Backlog cleanup: `main` had row #221 twice (unslop pass 3, and the auth/bridge fix). The auth/bridge row is now #226. Still colliding, in other open PRs: PR #132 uses #222 (taken on `main` by Notes attachments) and PR #133 renumbers the auth/bridge row to #223 (taken on `main` by Do Not Disturb); whichever merges after this one should take #226 for the auth row and the next free number for its own.


## Session 2026-11-13 (`claude/robustness-pass-2`): CI status, LAN load limits

CI on `main` and on every PR since 2026-11-14 00:13 UTC is red without running: GitHub refused to start the jobs ("recent account payments have failed or your spending limit needs to be increased"). Not a code failure. The same steps were run locally on `main` (aa80201a): type check 0, watermark check 0, ABI check OK, `cargo test --bin dex-tauri` 143/143, Vitest 5367 passed. 14 tests failed in the full run while cargo built in parallel (11 were 10 s timeouts); all 14 pass when run alone.

| # | App | Item | Priority | Status | What changed | Next check |
|---|---|---|---|---|---|---|
| 246 | CI | GitHub Actions jobs not starting | HIGH | BLOCKED (owner: billing) | Nothing to change in the repo | Owner fixes Billing & plans, then re-run the latest `main` run |
