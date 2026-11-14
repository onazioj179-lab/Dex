# DEX: Remaining Work

**Updated:** 2026-11-13 (finished rows cleared, #53 #61 #62 #65 #107 #157 #180–#226 moved) · **Creator:** Onazi oJ · This is the active backlog: only rows with work left. Finished rows that still need a packaged-app, hardware, key or owner check are listed at the end; fully completed rows are in `docs/reports/DEX_COMPLETED_WORK.md` (row numbers unchanged).

| # | Requirement | Status | Why incomplete | Components | Next action | Needs | Priority |
|---|---|---|---|---|---|---|---|
| 3 | Local AI measured end to end | DEFERRED (owner) | Owner parked Ollama work. Local AI is now opt-in (no startup probe, not routed to unless connected in Settings › AI Providers) | Ollama | None until the owner reopens it | Owner | — |
| 4 | Cloud AI measured end to end | NOT TESTED | No provider key here | Providers | Add a key; run a scripted agent session (web search + file read) | Owner key | P1 |
| 5 | Screen sharing in the packaged app | NOT TESTED | The system picker needs a human to choose a window | `uki/screenCapture.ts` | Click "look at my screen", pick a window, confirm one frame is sent and the indicator clears | Tester | P1 |
| 6 | Clean-machine install test | NOT TESTED | No VM | NSIS/MSI, WebView2 bootstrapper | Install on a VM without WebView2 | VM | P1 |
| 7 | Screen-reader pass | NOT TESTED | Needs an interactive session | Shell + new assistant controls | Narrator/NVDA walkthrough | Tester | P1 |
| 8 | Signed updates + downloadable apps | BLOCKED | Needs signing key + hosting | Updater, Store | Owner creates key; choose hosting | Owner | P1 |
| 12 | Cross-device continuity | MISSING | No sync service exists | — | Product decision + authenticated, encrypted sync backend | Service | P3 |
| 14 | Offline speech recognition | MISSING | Web Speech API may use an online service | Voice | Evaluate an on-device ASR (e.g. a small Whisper build) | — | P3 |
| 15 | Live boot image root device | PARKED (owner, 2026-11-04: no Linux; DEX is the Windows Tauri app) | Live `grub.cfg` uses `root=/dev/sda2` | `dex-os/boot/grub.cfg` | Use `root=LABEL=DEX_ROOT` (see `docs/reports/DEX_UKI_INTEGRATION.md`) | Owner approval + VM | P2 |
| 16 | Unified Kernel Image, Secure Boot, rollback | PARKED (owner, 2026-11-04: no Linux; DEX is the Windows Tauri app) | GRUB + bzImage today; no signing, no previous-kernel entry | `dex-os/` | Design decision; owner-held keys | Owner | P3 |
| 17 | DEX OS image build + boot test | PARKED (owner, 2026-11-04: no Linux; DEX is the Windows Tauri app) | No Buildroot toolchain/VM here | `dex-os/` | Build in CI, boot in QEMU | VM | P2 |
| 19 | Terms of Service legal review | PARTIAL | Not a legal reviewer | `TERMS.md` | Legal review | Legal | P2 |
| 20 | Podcasts, shared albums, live captions | MISSING | Need backends/services | New apps | Product decision first | Services | P3 |
| 21 | Multi-monitor test | NOT TESTED | Single display | Window manager | Test on two displays | Hardware | P3 |
| 22 | Dock/taskbar visual rework | PARTIAL | Not in scope this pass | Shell | Design pass | — | P3 |

## Part 5: spatial desktop and creative suite (2026-11-01)

| # | Requirement | Status | Why incomplete | Components | Next action | Needs | Priority |
|---|---|---|---|---|---|---|---|
| 23 | Spatial desktop FPS / GPU, hardware requirements | NOT TESTED | Preview pane hidden, so no frames | `shell/spatial/*` | Performance-panel trace in the packaged build; one low-end machine | — | P1 |
| 24 | Spatial camera ~20–35 ms per update with a large on-screen app (50 windows) | PARTIAL | Dominated by the on-screen app's restyle | AppManager world layer | Profile in packaged build | — | P2 |
| 26 | Creative suite §7–15 | PARTIAL | Canvas now has editable whiteboard objects + templates; Creative Hub app added; PRISM shows image metadata. Not done: shared assets library, Video proxy/hardware-decode audit, Audio/Present gap audit | Canvas, CreativeHub, Prism | Audit Vinx, Imosion, Presentation against §12–14 next | — | P2 |
| 27 | Glass / translucency (§16) | PARTIAL | Owner decision (2026-11) made refined glass the default. 7.0.1 adds the Interface Transparency slider on top (default reads as 40%; 0% = opaque, no blur; shared 0.55 opacity floor), an independent blur-strength slider, and a Refined/Liquid style choice. Not yet clicked through in a rendered Settings page, light + dark | `shellPreferencesStore`, `InterfaceTransparencyControl` | Click-through | Test profile | P2 |

## Carried over from retired task files (2026-11-01)

These open items came from Markdown task files that were deleted in the Part 5 cleanup (git history keeps the originals).

### From `docs/NEXT-STAGE.md` (backend / native milestone)

| Track | Needs | Foundations already in the code |
|---|---|---|
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
| 34 | Playwright e2e; CI-load flakiness of `v6-performance-guards` | PARTIAL (perf guards FIXED) | Perf guards now warm up, take the best of 7 runs (load only adds time) and scale budgets by a same-machine calibration loop (1x to 4x), so a loaded runner no longer fails them while a quadratic regression still does; passed during a cargo LTO build at 100% CPU (the clamp guard measured 33 ms against its 30 ms raw budget, which failed before). e2e still not run in CI | `v6-performance-guards.test.ts` | 2026-11-13 (#229): the Electron-era specs could not run (they launch a main process that no longer exists); a web smoke suite now runs in CI. Next: port the old per-app specs worth keeping to the web suite, delete the rest | — | P2 |
| 39 | UI sound effects | PARTIAL | Interface sounds are synthesized Web Audio (`shell/SpatialAudio.ts`), mute persists, Settings toggle synced. Windows notification toasts were always silent (WinRT writes `<audio silent>` when no sound is set); Settings › Notifications › Sound now reaches the toast. Not done: listen-test in the packaged app | Listen-test | — | P3 |
| 40 | Old 6.1.0 artifacts / release cleanup | WAITING | Rollback-critical until 7.0.1 installs. Inventory (Part 12): installed 6.1.0 at `%LOCALAPPDATA%DEX` (replaced by the 7.0.1 setup, not deleted by hand); Electron-era leftovers `%LOCALAPPDATA%dex-updaterinstaller.exe` (87 MB, May 2026) and `%APPDATA%dex` (old Electron profile, may hold user data); stale 6.1.0/7.0.1 MSI/NSIS files in worktree `target/` folders. Nothing was deleted | Owner approves deleting `dex-updater` after 7.0.1 installs; keep `%APPDATA%dex` until its contents are checked | Owner | P3 |

## Part 7: real functionality, honest controls (2026-11-02, `claude/dex-part7`)

| # | Requirement | Status | Detail | Components | Next action | Needs | Priority |
|---|---|---|---|---|---|---|---|
| 47 | Browser features the native view cannot provide yet | PARTIAL (2026-11-11: back/forward state and the failed-load error page VERIFIED live on an isolated profile — a dead .com host shows "This site's address can't be found" (the earlier .invalid test had become a web search). Element fullscreen wired but UNVERIFIED: the test window wasn't frontmost, so DEX hid the view. Credential capture deliberately not added: it would scrape passwords from web pages. 18f: downloads had no native handler (stuck at "downloading" forever); now download_ctl.rs saves to Downloads, verified live) | Credential capture (`ipc-message`), per-request ad-block count (`console-message`), load-error page (WebView2 shows its own), HTML fullscreen events, true `canGoBack` | `Browser.tsx` | Add a page-to-host bridge for the browser view only | — | P2 |

## Release status

**NOT READY.** The 7.0.1 draft release was built from the stale #81 branch (aff4006) and lacks #82 to #85; rebuild from `main` after this merge and replace the draft assets (#124 to #126). #1 is done. Still required: an install test of the single 7.0.1 setup (built and smoke-tested in Part 12; #32, #97), and a check in the installed app that the clipboard and MIDI prompts are gone (#87, #88). Signing (#30) is recommended but not required to publish. After that: **READY WITH DOCUMENTED LIMITATIONS**. Part 8 found and fixed data-loss defects in Files (#59–#62); none of the remaining open items is a crash or data-loss defect.

## Part 8: completion + stress testing (2026-11-03, `claude/dex-os-completion-stabilization-93cea6`)

Evidence: `DEX_7.0.1_VERIFICATION.md` › Part 8 checks.

| # | Requirement | Status | Detail | Components | Next action | Needs | Priority |
|---|---|---|---|---|---|---|---|

## Part 9: spatial UX, multitouch, haptics, search (2026-11-03, `claude/dex-os-functional-completion-682249`)

Evidence: `DEX_7.0.1_VERIFICATION.md` › Part 9.

| # | Requirement | Status | Detail | Components | Next action | Needs | Priority |
|---|---|---|---|---|---|---|---|
| 72 | Haptics | DONE (gated) / NOT HARDWARE-TESTED | One service: fires only on mobile touch hardware with a vibration API (desktop WebView2 has the API but no motor, so it reports unavailable), user switch, rate limit, one pulse when a spatial snap engages. Removed a document-wide MutationObserver that vibrated on every button touch, and the default 10 ms vibrate on every button press | `shell/input/haptics.ts`, `ScreenGuardSystem.ts`, `UIPolishSystem.ts` | Windows pen/touchpad haptics need a native `SimpleHapticsController` bridge | Native + hardware | P3 |
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

## Part 8 follow-up (2026-11-03, PR #77)

| # | Requirement | Status | Detail | Next action | Priority |
|---|---|---|---|---|---|

## Part 13: refinement (2026-11-04, `claude/dex-part8-followup`)

| # | Requirement | Status | Detail | Next action | Priority |
|---|---|---|---|---|---|
| 116 | Remaining Part 13 batches | OPEN | Not started this pass: dock/system-surface geometry, per-app control consolidation beyond the top bar, creative/engineering app passes, multi-monitor/high-DPI tests, installer re-verification and old-executable cleanup | Next sessions | P2 |

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

## Session 2026-11-12 (`claude/browser-shields`): Browser element hiding, filter lists, per-site Shields

| # | App | Requirement | Priority | Status | Evidence / blocker | Next action |
|---|---|---|---|---|---|---|

## Session 2026-11-12 (`claude/backlog-pass`): backlog cleanup, eval ratchet, unslop pass 2, AXL save pass

Completed rows (nothing left to do or check) moved to `docs/reports/DEX_COMPLETED_WORK.md`; row numbers are unchanged.

| # | App | Requirement | Priority | Status | Evidence / blocker | Next action |
|---|---|---|---|---|---|---|
| 167 | Shell / apps | UI unslop pass 2 (#164 follow-up) | MEDIUM | PARTIAL (tests) | Flat fills instead of decorative 135° gradients: Home icon fallbacks (and their 12 px shadows cut to 2 px), startup splash logo (blue→purple), Imosion buttons (a gradient of one colour twice) and track avatars, Settings app tints, Share dialog note, PRISM filter swatches, VINX offline-clip placeholder (navy gradient; now flat and says "Media not loaded"). Dead CSS removed: 19 rules for classes no component uses (`vault-item-icon`, `voice-orb`, `automation-icon`, `device-card`, `transfer-icon`, `learning-icon`, `plugin-icon`, six `*-accent-gradient`, `vinx-clip`), and the unused `DEX_THEME` constant (gradient backgrounds, 14–20 px radii). Kept: live wallpapers and LUT thumbnails (content), the resize grip. `ui-unslop-guard.test.ts` gained a pass-2 check | App bar padding unified in #227 (bars are 44 px single-line, 59 to 69 px with a subtitle). Left: one title-block size for all app bars; Control Center (owner taste) |

## Session 2026-11-13 (`claude/compassionate-wescoff-3fb5db`): UI unslop pass 3, inner apps

Rule for apps: accent is for the primary action and the selected state. Hover is neutral and flat. Keyboard focus is the one global ring.

| # | App | Requirement | Priority | Status | Evidence / blocker | Next action |
|---|---|---|---|---|---|---|
| 221 | All inner apps | UI unslop pass 3 (#164, #167 follow-up): accent hover tints, hover lifts, glows, per-app focus rings, accent-coloured readouts | MEDIUM | VERIFIED (preview: 26 apps opened with no error; live rules read in 14; focused input measured), tests | **Hover.** Menu, context-menu, dropdown, tool and tab hovers in Forge, Prism, VINX, Imosion, AXL and Notes were accent-tinted (text also turned accent); now `--color-bg-hover` / `--color-bg-active` with primary text. Forge's hover used a fixed navy `#0d1a2e` (wrong in light theme) and had 4 rules for classes nothing uses; removed. **No lift.** Hover no longer raises, grows or spins controls: Calendar, Kanban, Pomodoro, Project Dashboard, QR, Unit Converter (swap button spun 180°), World Clock, Color Picker, CollabHub, Games, Notes, Settings swatches. Hover on cards that are not clickable (Achievements, Weather hourly) removed. **Focus.** Apps painted their own accent ring or 3 px blue halo on top of the global white ring (Calendar, Color Picker, Unit Converter, Smart Inbox, Kanban, Ledger, Calculator, Maps, Tasks, Password Generator, Pomodoro, Weather, World Clock, Games, Timer, QR). All removed. Two shared rules in globals.css (`input:focus`, `:where(input, textarea, select):focus-visible`) and `.property-input:focus` still added a blue halo to every input in the OS; removed. Measured on a focused Unit Converter input: before, white outline plus `rgba(10,132,255,0.15) 0 0 0 3px`; after, white outline only. **Glows.** Pomodoro 28 px drop-shadow, Imosion drop line 12 px and pads 16 px, Kanban drop line, Settings nav marker, Audio play button, Calendar today badge, window snap preview 20 px: removed or cut to 4 px. Startup progress bar blue→purple gradient is the solid accent. Flux, Forge and Prism status bars were a fixed dark gradient (dark in light theme too); now `--color-bg-surface`. **Accent text.** Readouts, static icons and labels use text colours: Transfers (speed, ETA, percent, limits, device tile), Workflows icons, Unit Converter result, Git hashes, Env names, SSH key types, Screen Recorder countdown, UKI wordmark and action title, Kanban board icon, World Clock tags, Store and Home icon tiles, Settings data-state labels and changed-settings note, Imosion section titles. Kept: links, filled primary buttons, selected tabs, category/data colours. `ui-unslop-guard.test.ts` gained 5 pass-3 checks (no hover lift, no accent hover, no app accent focus ring, no input halo in shared CSS, no glow over 4 px) | Light-theme look of the neutral hovers in the packaged app. Style leak and shared hover scale rules fixed in #227 / #228. Still open: selected-state tint per creative app (Prism white, Flux purple, Forge accent) is an owner colour choice  **3c (2026-11-14, light theme):** `.dex-creative-panel(-strong)` was hard-coded near-black, so Forge showed white cards on a black sidebar in light theme; now surface tokens in light, shadows 30–64 px → 1–3 px. AXL pinned dark (`dex-theme-dark`, like Imosion): its metal panels stayed dark while toolbar and cards went light. Notes used a cyan `#64d2ff` accent (New Note, selection, caret, checkbox, drop zone); now the OS accent. Accent uppercase section labels (Forge, Prism, Imosion) → tertiary text; Forge Save as Preset not green; Flux library tiles not rainbow; Pomodoro button bloom, Games cover 18 px shadow, Browser new-tab blue glow removed. Confirmed in a packaged WebView2 run (Edge 157): Forge light sidebar white, AXL root dark, Notes button `#0066CC`. |

## Session 2026-11-13 (`claude/retire-rewind`): retire Rewind, release build

| # | App | Requirement | Priority | Status | Evidence / blocker | Next action |
|---|---|---|---|---|---|---|

## Done, waiting on a check or an owner decision

The work in these rows is finished; what is left is a run in the packaged/installed app, on hardware, or an owner choice. Full detail is in `docs/reports/DEX_COMPLETED_WORK.md` under the same number.

| # | Item | Needs |
|---|---|---|
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
| 99 | Nexus, Spotlight, context menus, dropdowns, notifications | Packaged-app run |
| 113 | Telemetry / Task Manager redesign | Packaged-app run |
| 115 | Live preview verification of 111-114 | Packaged-app run |
| 128 | Terminal is a real terminal (§7) | Packaged-app run |
| 133 | Windows PowerShell 5.1 `Read-Host` can receive keys out of order | Packaged-app run |
| 142 | Dock / App Menu: reorder and running dots (pin/unpin verified 2026-11-13) | Packaged-app run |
| 145 | Forge Watermark / Crop & Pad / Subtitle burn-in did nothing | Packaged-app run |
| 150 | Bio: GenBank import/export with features; primer pair check | Packaged-app run |
| 154 | Terminal: Live shells in the packaged app (extends #139/#146) | Packaged-app run |
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
| 216 | Local photos, music, video, PDFs and disk wallpapers never loaded in the desktop… | Packaged-app run |
| 217 | "Split down" on a side-by-side tab added a third column | Owner decision (tree splits) |
| 219 | Send Files to a nearby DEX did nothing (fake control) | Two PCs on one network |
| 220 | Failures reported as success (#61 sweep) | Packaged-app run |
| 222 | Attach file, open and remove attachment did nothing | Packaged-app run |
| 226 | Every `dex.<ns>.onY(cb)` subscription was a silent no-op under Tauri | Packaged-app run (detached Vault / PIN change) |

## Session 2026-11-13 (`claude/backlog-cleanup-conflicts-16b9e3`): unslop passes 4 and 5, style leak between apps, web e2e in CI

Backlog cleanup: `main` had row #221 twice (unslop pass 3, and the auth/bridge fix). The auth/bridge row is now #226. Still colliding, in other open PRs: PR #132 uses #222 (taken on `main` by Notes attachments) and PR #133 renumbers the auth/bridge row to #223 (taken on `main` by Do Not Disturb); whichever merges after this one should take #226 for the auth row and the next free number for its own.

| # | App | Item | Priority | Status | What changed | Next check |
|---|---|---|---|---|---|---|
| 227 | Shell, all apps | UI unslop pass 4 (#221 follow-up): shared CSS | MEDIUM | VERIFIED (tests; preview measured) | No shared hover rule lifts, grows or spins. About 570 lines of CSS for classes no component uses were removed from `design-system.css` and `globals.css` (lift, scale, glow and shine utilities; the old `.card`, `.list-row`, `.media-btn`, `.gallery-item`, `.creative-toolbar` families). Live ones were flattened: Home wallpaper tiles (border carries hover and the chosen state), the DEX Bar press (press only, no hover lift), slider thumbs. Sliders take the one canonical focus ring (an accent outline plus a double blue halo on the thumb is gone). Shared menu-item hover is neutral. Flux hovers, missed by pass 3 because the tint came from a JS constant, are neutral. App bars in CollabHub, Extensions, Kanban, Inbox, Tasks, Workflows and Store now share one rule: min-height `--app-header-height`, 8 px above and below a two-line title block, 4 px for a single line (padding was 12 or 16 px, mixed). Measured in the preview: Inbox 44 px, the two-line bars 59 to 69 px. They are not one height yet, because each app sizes its title block differently (42 to 52 px). `ui-unslop-guard.test.ts` gained 7 pass-4 checks | Look at the 7 app bars and the wallpaper picker in the packaged app, light and dark. One title-block size for all app bars would make them one height |
| 228 | AXL, Flux, Forge, Imosion, Prism, Audio, Files, Gallery, Tasks, Transfers, Workflows | An open app restyled every other app | HIGH | FIXED, VERIFIED (preview: with Imosion mounted behind Settings, its 24 px button rule and 16 px slider rule applied inside Imosion only; live CSSOM check in the e2e suite) | These 11 apps shipped bare `button`, `*`, `select`, `input[type=range]` and scrollbar rules in their own `<style>`. Apps stay mounted while others are open, so the rules applied OS-wide: with Imosion open every slider in DEX became its metal fader and every button lost its border and outline; scrollbars changed width depending on which app was open. All such rules are now scoped with `:where(.<app>-root)`, which adds no specificity, so each app looks the same inside. Imosion's `.btn` rules (the name is also used by Prism, Password Generator and the spatial HUD) are scoped too. Presentation's `@media print` rule is left global on purpose | Open Imosion, then check a slider in Settings |
| 229 | Platform | E2E in CI (#34); ABI check as its own CI step (#201) | MEDIUM | VERIFIED locally (4 of 4 pass in 1.9 min); CI job runs on the next push | The Playwright specs were from the Electron era ("version 3.6.0", launching a main process that no longer exists) and could not run. `playwright.config.ts` now starts Vite and runs `tests/e2e/web` in Chromium: the shell boots with no page error; all 60 apps open with no error boundary and no page error; a retired app is refused; no component `<style>` carries a bare element rule (checked in the live CSSOM, which is how #230 was found). New CI job `e2e`. CI's lint job runs type check, watermark check and `npm run abi:check` as three named steps. The old Electron specs stay in `tests/e2e` unmatched | Watch the first CI run of the `e2e` job. Port the old per-app specs worth keeping, delete the rest |
| 230 | Shell | UI unslop pass 5: CSS written from script in the shell layer | MEDIUM | VERIFIED (tests; e2e live CSSOM check) | Passes 1 to 4 covered apps and `.css` files only. In `shell/`, `services/`, `utils/`, `components/` and `styles/*.ts`: the shell injected a slider hover grow (1.2x), an 8 px blue glow on drag and a second blue focus ring (`utils/uiPolish.ts`), which undid the shared-CSS fixes; bare accent `:focus-visible` rules in AccessibilityManager, MotionController, ScreenGuardSystem, `.dex-btn`, Live Activity and the Lock Screen either lost to the canonical ring or drew a second ring on top of it; ContextMenu hover was accent while UnifiedDropdown was neutral (both neutral now); CreativeSlider grew on hover; blue glows on the PremiumGlass marker and status dot and the glass button hover. All removed. `shell/VisualEffects.ts` deleted (961 lines): 24 of its 26 exports had no caller, and at startup it injected 8 stylesheets (ambient glows, particles, a pulsing focus ring) for classes nothing applied. Guard gained 5 pass-5 checks over the whole shell layer | Tab through the Lock Screen keypad and a context menu in the packaged app. Selected-state tint per creative app (Prism white, Flux purple, Forge accent) is an owner colour choice |

## Session 2026-11-13 (`claude/browser-minimized-create`): Browser blank after restore

| # | App | Item | Priority | Status | What changed | Next check |
|---|---|---|---|---|---|---|
| 231 | Browser | A page opened while DEX was minimized stayed blank after restore | HIGH | FIXED (component test); PACKAGED RE-RUN PENDING | Reproduced in the 7.0.2 release exe: minimize DEX, open a tab with example.org, restore → its native view stayed 810×2 px and `browserView:evalResult` timed out. `NativeWebview` now creates a view only in a usable slot (`slotUsable`: ≥ 40 px, document visible); otherwise the URL waits and the 250 ms loop creates it after restore. `native-webview-create.test.tsx` fails on the old code (view created at 360×1) | Rebuilt exe: minimize, open a page, restore, page draws |

## Session 2026-11-13 (`claude/robustness-pass-1113`): crash-proofing under load, security, speed

| # | App | Item | Priority | Status | What changed | Next check |
|---|---|---|---|---|---|---|
| 240 | Platform (native) | One panic inside a locked section killed that subsystem until restart | HIGH | FIXED (cargo test; 36 more sites converted in #250) | `util::LockSafe::lock_safe()` recovers a poisoned mutex and clears the poison; used by voice, large files, render governor, phone share, browser bridge and site permissions (was `.lock().unwrap()`, which re-panicked on every later call) | — |
| 241 | Transfers (phone share) | Sharing a file with a non-English name crashed the share server; uploads could fill memory | HIGH | FIXED (4 cargo tests) | Download header is RFC 6266 ASCII + `filename*` (tiny_http refused "café.jpg" and the `unwrap` killed the server thread); request loop guarded; waiting uploads capped at 16 files / 1 GiB (HTTP 429); declined uploads free their bytes (they stayed in memory until the server stopped); accepted files no longer overwrite an existing file; a failed save is reported, not "accepted" | Share "café.jpg" to a phone; upload two files with the same name |
| 242 | Security, Auth, Keys | Random bytes started PowerShell for every call, with a clock+pid fallback | HIGH | FIXED (auth/keys/encryption cargo tests) | `keys_ctl` / `encryption_ctl` `os_random_bytes` use the in-process OS CSPRNG (`dex_vault::crypto::random_bytes`): sign-in session tokens, salts, recovery codes and keys no longer cost a PowerShell start (~0.3–1 s) and can no longer fall back to a predictable stream | Time a PIN sign-in in the packaged app |
| 243 | Browser bridge | Any web page could read the bridge's pending actions or forge results once paired | MEDIUM | FIXED (cargo test) | 127.0.0.1:19847 (dormant: nothing in DEX starts it today): `/pair` returns a 256-bit secret that `/action`, `/result`, `/heartbeat` require as `X-Dex-Connection`; 5 wrong pairing codes cancel the pairing; no wildcard CORS; constant-time compares | — |
| 244 | Notes | Learned words were recorded but never loaded into suggestions | LOW | FIXED (cargo test, ABI lock) | The editor asked for `dexnotes:get-word-suggestions`, which nothing answered; new `dexnotes:topWords` returns the vocabulary with counts | Type a rare word in a note, reopen Notes, start typing it |

## Session 2026-11-13 (`claude/robustness-pass-2`): CI status, LAN load limits

CI on `main` and on every PR since 2026-11-14 00:13 UTC is red without running: GitHub refused to start the jobs ("recent account payments have failed or your spending limit needs to be increased"). Not a code failure. The same steps were run locally on `main` (aa80201a): type check 0, watermark check 0, ABI check OK, `cargo test --bin dex-tauri` 143/143, Vitest 5367 passed. 14 tests failed in the full run while cargo built in parallel (11 were 10 s timeouts); all 14 pass when run alone.

| # | App | Item | Priority | Status | What changed | Next check |
|---|---|---|---|---|---|---|
| 246 | CI | GitHub Actions jobs not starting | HIGH | BLOCKED (owner: billing) | Nothing to change in the repo | Owner fixes Billing & plans, then re-run the latest `main` run |
| 247 | Transfers (DEX to DEX) | The receiver started one thread per incoming connection with no limit | HIGH | FIXED (cargo test) | At most 8 receives at once; extra connections are refused; the slot is freed however a receive ends | Send to one PC from two others at once |
| 248 | Transfers (discovery) | Announces with made-up device ids grew the nearby-device list and its UI events without bound | MEDIUM | FIXED | List capped at 64 devices; existing devices still update | — |
| 249 | Platform (native) | A panic on a server thread (phone share, browser bridge, sync) stopped that server for good | MEDIUM | FIXED | `util::guard_panic` around each request; those threads are outside the `dex_ipc` guard | — |
| 250 | Auth, Encryption, DTP | After one panic, sign-in sessions never verified, encryption read as locked, and Devices listed nothing | HIGH | FIXED (cargo test) | 36 more lock sites in 14 files moved to `lock_safe()`. A few read-only reads (`renderer_health` status, search doc count) still show an empty value after a poison | — |
