# DEX: Remaining Work

**Updated:** 2026-11-12 · **Creator:** Onazi oJ · This is the active backlog: only rows with work left. Finished rows that still need a packaged-app, hardware, key or owner check are listed at the end; fully completed rows are in `docs/reports/DEX_COMPLETED_WORK.md` (row numbers unchanged).

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
| 34 | Playwright e2e; CI-load flakiness of `v6-performance-guards` | PARTIAL (perf guards FIXED) | Perf guards now warm up, take the best of 7 runs (load only adds time) and scale budgets by a same-machine calibration loop (1x to 4x), so a loaded runner no longer fails them while a quadratic regression still does; passed during a cargo LTO build at 100% CPU (the clamp guard measured 33 ms against its 30 ms raw budget, which failed before). e2e still not run in CI | `v6-performance-guards.test.ts` | Run e2e in CI | — | P2 |
| 39 | UI sound effects | PARTIAL | Interface sounds are synthesized Web Audio (`shell/SpatialAudio.ts`), mute persists, Settings toggle synced. Windows notification toasts were always silent (WinRT writes `<audio silent>` when no sound is set); Settings › Notifications › Sound now reaches the toast. Not done: listen-test in the packaged app | Listen-test | — | P3 |
| 40 | Old 6.1.0 artifacts / release cleanup | WAITING | Rollback-critical until 7.0.1 installs. Inventory (Part 12): installed 6.1.0 at `%LOCALAPPDATA%DEX` (replaced by the 7.0.1 setup, not deleted by hand); Electron-era leftovers `%LOCALAPPDATA%dex-updaterinstaller.exe` (87 MB, May 2026) and `%APPDATA%dex` (old Electron profile, may hold user data); stale 6.1.0/7.0.1 MSI/NSIS files in worktree `target/` folders. Nothing was deleted | Owner approves deleting `dex-updater` after 7.0.1 installs; keep `%APPDATA%dex` until its contents are checked | Owner | P3 |

## Part 7: real functionality, honest controls (2026-11-02, `claude/dex-part7`)

| # | Requirement | Status | Detail | Components | Next action | Needs | Priority |
|---|---|---|---|---|---|---|---|
| 47 | Browser features the native view cannot provide yet | PARTIAL (2026-11-11: back/forward state and the failed-load error page VERIFIED live on an isolated profile — a dead .com host shows "This site's address can't be found" (the earlier .invalid test had become a web search). Element fullscreen wired but UNVERIFIED: the test window wasn't frontmost, so DEX hid the view. Credential capture deliberately not added: it would scrape passwords from web pages. 18f: downloads had no native handler (stuck at "downloading" forever); now download_ctl.rs saves to Downloads, verified live) | Credential capture (`ipc-message`), per-request ad-block count (`console-message`), load-error page (WebView2 shows its own), HTML fullscreen events, true `canGoBack` | `Browser.tsx` | Add a page-to-host bridge for the browser view only | — | P2 |
| 53 | Dead code | DONE (132 files, ~89k lines) | Unreachable from the app entry and unreferenced by tests/scripts/configs/CSS; includes simulated downloads (`BrowserFeatures.ts`) and a random "threat" scanner (`SystemSecurity.ts`). Verified: tsc 0, production build, full unit suite (521/521 files after merging main) | `src/renderer`, `src/shared` | ~380 more orphan files are still imported by tests only; prune with their tests | — | P3 |
| 58 | Restore a collaboration checkpoint | DONE for VINX, AXL, Imosion and Canvas (2026-11-13: Imosion File › Save Checkpoint + 5-min autosave, restore verified in the preview; Canvas autosave + restore of the open board, verified in the preview; a restore at start is not overwritten by the late native load) | Per-app checkpoints on this device (10 per app, 2 MB cap), saved by hand or automatically when the project changes; Collab Hub lists them with Restore and Delete (`app-checkpoints.test.ts`) | `appCheckpoints.ts`, `useAppCheckpoints.ts` | Add PRISM, FLUX and Presentation; click-through | Tester | P3 |

## Release status

**NOT READY.** The 7.0.1 draft release was built from the stale #81 branch (aff4006) and lacks #82 to #85; rebuild from `main` after this merge and replace the draft assets (#124 to #126). #1 is done. Still required: an install test of the single 7.0.1 setup (built and smoke-tested in Part 12; #32, #97), and a check in the installed app that the clipboard and MIDI prompts are gone (#87, #88). Signing (#30) is recommended but not required to publish. After that: **READY WITH DOCUMENTED LIMITATIONS**. Part 8 found and fixed data-loss defects in Files (#59–#62); none of the remaining open items is a crash or data-loss defect.

## Part 8: completion + stress testing (2026-11-03, `claude/dex-os-completion-stabilization-93cea6`)

Evidence: `DEX_7.0.1_VERIFICATION.md` › Part 8 checks.

| # | Requirement | Status | Detail | Components | Next action | Needs | Priority |
|---|---|---|---|---|---|---|---|
| 61 | File-op failures reported as success | FIXED (+ Notes save failures, Organize by type) | The bridge resolves `{success:false}`; Files, PowerRename and Workflows now treat it as a failure | `Files.tsx` `fileOp()` | Shell opens swept in #191 (`openWithShell`); still to sweep: other non-file channels that answer `{success:false}` | — | P2 |
| 62 | DEX Recycle Bin "Restore" did nothing | FIXED | Notes are un-trashed or recreated, Kanban cards go back to their column; the row is removed only afterwards. Old Files rows say they can't be restored | `recycleRestore.ts`, `RecycleBin.tsx`, `KanbanApp.tsx` | Rows written by `content_expiry`/`bulk_metadata` are shown as not restorable | — | P3 |
| 65 | Launch latency grows with open windows | FIXED (p50 29 ms with 59 open, was 172 ms) | p50 48 ms (10 open) → 172 ms (59 open); each launch re-renders work proportional to open windows | `AppManager.tsx` | Profile a launch with 30 open; memoise per-window chrome | — | P2 |

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
| 107 | Electron leftovers | REMOVED | Renderer uses the Tauri `window.dex` bridge only; revived UKI native events, Browser download progress, Forge watch folders, crash-recovery check; compact window is real (`compact_window.rs`) | Native suspend/resume/lock events don't exist in Tauri yet (old Electron listeners deleted) | P3 |

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
| 157 | Browser | ROADMAP track 5 next: cosmetic filtering, EasyList import, per-site Shields | MEDIUM | VERIFIED (preview UI, tests) / NOT TESTED (pages in the packaged app) | **Element hiding:** the page script now also adds a stylesheet that hides ad slots. The built-in list covers only markers the ad networks themselves put on their slots (`ins.adsbygoogle`, `div-gpt-ad…`, `google_ads_iframe…`, Taboola, Outbrain, `amp-ad`), so ordinary content called "ad…" is never hidden. Each selector is its own CSS rule, so one bad rule drops alone. **Filter list:** Privacy & Security › Filter list › Import… reads an EasyList / uBlock `.txt` (8 MB cap). It keeps `\|\|host^` rules (resource-type and third-party options allowed), `##selector` and `site.com##selector`. Everything else is skipped and counted, never half-applied: exceptions, `$domain=` scoping, paths and regexes, procedural/scriptlet cosmetics, `#@#`, selectors with braces, markup, `@` or `;` (so no `@import`). Caps: 40k hosts, 15k generic and 20k site rules. Imported hosts join the built-in list for both the navigation check and the page script. Replace and Remove are there too; a storage-quota failure is reported. **Shields:** a per-site switch for the open website. Off means no blocking or hiding on that host and its pages; the tab reloads to apply. Sites with Shields off are listed under the switch. `filterList.ts`, `browser-filter-list.test.ts` (12, incl. a script-breakout guard). Preview: the switch read "On for example.com", turned off and was saved as `["example.com"]`; a 4-rule list imported as "1 hosts, 2 hiding rules, 1 unsupported skipped" | Packaged run on real pages: check hidden slots and the blocked count with Shields on and off. Later: block in WebView2 itself (WebResourceRequested) so requests are stopped before the page sees them |

## Session 2026-11-12 (`claude/backlog-pass`): backlog cleanup, eval ratchet, unslop pass 2, AXL save pass

Completed rows (nothing left to do or check) moved to `docs/reports/DEX_COMPLETED_WORK.md`; row numbers are unchanged.

| # | App | Requirement | Priority | Status | Evidence / blocker | Next action |
|---|---|---|---|---|---|---|
| 167 | Shell / apps | UI unslop pass 2 (#164 follow-up) | MEDIUM | PARTIAL (tests) | Flat fills instead of decorative 135° gradients: Home icon fallbacks (and their 12 px shadows cut to 2 px), startup splash logo (blue→purple), Imosion buttons (a gradient of one colour twice) and track avatars, Settings app tints, Share dialog note, PRISM filter swatches, VINX offline-clip placeholder (navy gradient; now flat and says "Media not loaded"). Dead CSS removed: 19 rules for classes no component uses (`vault-item-icon`, `voice-orb`, `automation-icon`, `device-card`, `transfer-icon`, `learning-icon`, `plugin-icon`, six `*-accent-gradient`, `vinx-clip`), and the unused `DEX_THEME` constant (gradient backgrounds, 14–20 px radii). Kept: live wallpapers and LUT thumbnails (content), the resize grip. `ui-unslop-guard.test.ts` gained a pass-2 check | Header heights; Control Center (owner taste) |

## Session 2026-11-13 (`claude/retire-rewind`): retire Rewind, release build

| # | App | Requirement | Priority | Status | Evidence / blocker | Next action |
|---|---|---|---|---|---|---|
| 193 | Release, Rewind, Shell | 7.0.2: retire Rewind; release build and packaged smoke run; Show in File Explorer told the truth | HIGH | VERIFIED (release exe, isolated profile; tests) | **Rewind retired** (owner, 2026-11-13; it could not record in this version): removed from `APP_DEFINITIONS` and everything derived from it, the AppManager map, command palette (also "Take Screenshot", which only opened Rewind), Home dashboard widget, Send To, Spotlight, app subsystem, tips; `RETIRED_APPS` guard in `launchApp` so pins, restored sessions, shortcuts and UKI cannot open it, and a stored session on Rewind comes back on Home (`retired-apps.test.ts`, 4). `DEXAPPLICATIONS/rewind` and `src/shared/rewind` (used only by Rewind) deleted with their 16 tests; user data (journal key, native activity log) left in place; native `rewind:*` channels kept. **Release build** (7.0.1 serial 18o tree before the 7.0.2 merge; `npm run build:tauri`, MSVC, 55 min): BUILD_EXIT 0, WebView2 loader static, no source maps, `DEX_7.0.1_x64-setup.exe` 14.9 MB, NotSigned, SHA256SUMS written. **Packaged smoke** (release exe, `DEX_DATA_DIR` + own WebView2 folder, CDP): Rewind launch refused with the message; Imosion, Canvas, Forge, AXL, Gallery, Pixel Art opened with no error boundary or page error, the first four showing their save state; an Imosion edit wrote the native copy (`capability:storage:get` buses 0 → 1) and showed Saved just now; `shell:openPath` on a missing file answered `{success:false}`; `rewind:deleteAllData` deleted the isolated log and nothing under the real profile. **Found there and fixed:** `shell:showItemInFolder` answered success for a missing file (Explorer was started for any string and opened some other folder) and quoted the `/select` argument so paths with spaces opened Documents; it now checks the path first and passes `/select,"path"` raw (`cargo test reveal`, 2) | Rebuild and recheck Show in File Explorer on a path with spaces |

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
| 33 | Click-through of the transparency slider in rendered Settings | Packaged-app run |
| 38 | Light/dark + 125/150/200% scaling audit of every built-in app | Packaged-app run |
| 44 | Packaged app exits with `thread '<unknown>' has overflowed its stack` | Packaged-app run |
| 46 | Browser blank in the packaged app (WebView2 has no `<webview>`) | Packaged-app run |
| 54 | Remaining apps audited this way | Packaged-app run |
| 55 | Auth engine lost from `main` | Packaged-app run |
| 57 | Fake controls in creative apps | Packaged-app run |
| 59 | Files deleted permanently while saying "moved to the recycle bin" | Packaged-app run |
| 60 | Native copy/move/rename could overwrite or lose data | Packaged-app run |
| 68 | Redundant square controls at the bottom of the spatial desktop | Packaged-app run |
| 79 | Maps "My location" failed silently | Packaged-app run |
| 84 | Browser address bar: localhost / IPs searched instead of opened; other schemes … | Packaged-app run |
| 86 | FLUX undo/redo ran side effects inside state updaters | Packaged-app run |
| 91 | Spatial canvas grew into a horizontal strip | Packaged-app run |
| 99 | Nexus, Spotlight, context menus, dropdowns, notifications | Packaged-app run |
| 103 | Blank strip above the DEX Bar in every app | Packaged-app run |
| 113 | Telemetry / Task Manager redesign | Packaged-app run |
| 115 | Live preview verification of 111-114 | Packaged-app run |
| 128 | Terminal is a real terminal (§7) | Packaged-app run |
| 133 | Windows PowerShell 5.1 `Read-Host` can receive keys out of order | Packaged-app run |
| 139 | Terminal: Split panes, standalone app | Packaged-app run |
| 142 | Dock / App Menu: Pin, unpin, reorder; app menu completeness | Packaged-app run |
| 145 | Forge Watermark / Crop & Pad / Subtitle burn-in did nothing | Packaged-app run |
| 146 | Terminal: Shell profiles, default shell, text size, open in folder | Packaged-app run |
| 150 | Bio: GenBank import/export with features; primer pair check | Packaged-app run |
| 152 | VINX: Honest recovery, save that reports failure, no lost edits on close (#77) | Packaged-app run |
| 153 | Terminal: WSL offered on machines without a Linux distribution | Packaged-app run |
| 154 | Terminal: Live shells in the packaged app (extends #139/#146) | Packaged-app run |
| 155 | Bio: GenBank + primers in the packaged app (extends #150) | Packaged-app run |
| 156 | Ledger: Edit transactions in the table, not only in the side editor | Packaged-app run |
| 158 | VINX: Real 3D LUT math (ROADMAP "Vinx 3D-LUT"); the built-in looks were … | Packaged-app run |
| 163 | FLUX: True save state; unsaved flag that clears; Open Project that checks the … | Packaged-app run |
| 165 | Browser: block ads and trackers in WebView2 itself, before requests leave … | Packaged-app run |
| 168 | AXL: Save state that is true; Open/New that cannot lose work; honest export … | Packaged-app run |
| 169 | Imosion, Canvas, Forge: True save status in the remaining creative apps (#77) | Packaged-app run |
| 191 | Gallery, Pixel Art, Files, Home, Settings, Terminal: silent failures and a Gallery crash … | Packaged-app run |
| 9 | Cloud model catalog is dated | Provider key |
| 11 | Agent resume after app restart | Provider key |
| 159 | UKI: UKI can schedule reminders and background requests (ROADMAP GOAL track 2 … | Provider key |

## Session 2026-11-12 (`claude/dex-backlog-recovery-804924`): mock / fake data sweep

| # | App | Requirement | Priority | Status | Evidence / blocker | Next action |
|---|---|---|---|---|---|---|
| 180 | All | Mock / fake data sweep (owner, 2026-11-05) | HIGH | FIXED; `fs:writeText`/`fs:readText` VERIFIED in a release exe 2026-11-12 (isolated profile: write, read back, missing-file error) | Scanned product code for mock/fake/demo/sample data, invented stats and renderer calls to native channels that don't exist (66 of 232 had no handler). Removed or replaced (Ledger starter categories and Bio's sample stay as main ships them: opt-in and labelled); VINX colour scopes drew pseudo-random dots, now the real frame-sampling scopes (RGB parade added); Learn's power profiles ("CPU 60% / GPU 50%"), "Restricted mode" and Clear cache / Optimize / Refresh did nothing, removed (Power app sets the real plan), and its battery/CPU/memory used non-existent channels (always "100% charging", 0%), now Battery API + `system:getStatus`; Home widgets showed a frame-timing guess as CPU, JS heap as memory and the browser quota (default 10 GB) as disk, now `system:getStatus` or "needs the desktop app"; DexCode open/save and Backup export/sync called non-existent `fs:read-file`/`fs:write-file`/`dialog:save-file` and reported success without writing, now native `fs:readText`/`fs:writeText` (atomic temp+rename) + `dialog:showSaveDialog` with errors shown; Browser downloads: my `download.rs` was dropped in the merge in favour of main's `download_ctl.rs`; Workflows "Run Script" reported a run that never happened, now removed from the catalog and fails with a reason; collaboration "invited" message implied an email was sent. Tests: Rust text-file round trip, TS suites 178 pass | Backup export through the save dialog (needs a person to pick the file; it writes with the same verified `fs:writeText`) |
| 181 | All | Renderer calls with no native handler (follow-up to #180) | MEDIUM | VERIFIED (release exe, isolated profile, 2026-11-12): renderer.log got crash/warn/memory lines and dropped info; `system:getUserInfo`; plugin install from folder → listed → enable → Settings › Plugins shows it → uninstall; Open-Meteo fetch allowed by the packaged CSP | Rescan after merging main: 60 of 229 channels had no handler; now 11 of 186, and those all degrade honestly (shimmed telemetry, `weather:get` falls back to the shared cache, `screencapture:getSources` to the picker, `optimization:*` to defaults). Done: `log:renderer` (warn/error), `render-error:report` and `renderer:memory-critical` go to `<logs>/renderer.log` (`renderer_log.rs`, rotates at 512 KB; they were discarded); `system:getUserInfo` (Home greeting); Imosion's native waveform path used a channel that never existed (now `audio:getWaveform` + `audio:getMetadata`); VINX export free-space read `system:getDiskUsage`; Notes' Trash button opens Trash; Settings › Plugins lost its Discover/Publish tabs (no registry channels existed, install showed "Installed" on failure) and gained Install from folder; dead `nativeBridge.ts`, `NativeSpringBatch.ts` and the never-shown batch action bar removed. Home Weather widget now refreshes via the shared `weatherData.ts` (was cache-only, stale forever; verified live: London 8°) | Plugin manifest ids must be lowercase letters, digits and hyphens (a dotted id is refused with a clear error) |
| 182 | All | Drag and drop did nothing in built DEX (files onto apps, in-page drags: Kanban, Files, Imosion clips, uploads in Browser pages) | HIGH | FIXED; bug REPRODUCED in a release exe 2026-11-12 (real mouse drag: dragstart 1, dragover 0, drop 0) | Tauri 2 installs its own Windows file-drop handler by default and that swallows HTML5 drag and drop (Tauri docs: disabling it "is required to use HTML5 drag and drop on the frontend on Windows"). Nothing in DEX listened to Tauri's drop events. Now off for the main window (`dragDropEnabled: false`), detached app windows and Browser views (`disable_drag_drop_handler()`); `tauri-html5-dragdrop.test.ts` guards it | Re-run the same drag in a fresh release build (it was being rebuilt when the session ended) |
| 183 | Flux | Camera layers did nothing; library Shape/Text/Particles drew invisible | MEDIUM | FIXED, VERIFIED live (preview) | Camera Rig toasted "FOV 50, DOF" but the renderer skipped camera layers and the rig type was never read. Now the topmost active camera frames the shot (`flux/fluxCamera.ts`): its position centres the view, rotation rolls it, FOV zooms, layer Depth (Z) gives perspective (behind the camera = hidden), optional depth of field blurs away from the focus distance. Inspector has Depth (Z) for every layer and a Camera section (FOV, DOF, focus, blur strength); the do-nothing Orbit/2-Node/POI picker was removed. Separately, default shape/text/particle colours were `var(--…)` tokens that canvas ignores, so a new Shape drew black on black: now resolved with `resolveCanvasColor` (`utils/canvasTheme.ts`). Live: FOV 25° made a 101 px square 215 px; moving the camera 200 right moved it ~420 px left. `flux-camera.test.ts` (4) | Keyframe a camera move and export |
| 184 | Flux | Text Animator, Pre-compose, motion-path orient and templates did nothing or hid layers | MEDIUM | FIXED, VERIFIED live (preview: Fade Up hid the text at 0 and revealed it as time ran) | Text Animator stored a preset and a `textAnim` behavior nothing read; text layers with `textAnimator` now draw per character/word/line with cascade (`flux/textAnimator.ts`: Typewriter, Fade Up, Scale Pop, Rotate In, Slide Left, Blur Reveal; panel shows what is applied and can remove it). Pre-compose replaced the layer with a `group` the renderer never drew (the layer vanished) at 1% scale: the render loop is now `drawLayer`, groups draw their children, identity transform, and Move Attributes no longer double-applies the transform. Motion path Orient wrote `rotation` (renderer reads `rotationZ`). Composition templates made shapes at 1% scale. `flux-text-animator.test.ts` (5) | Export a pre-comp |
| 185 | Flux | Parenting / Null objects did nothing | MEDIUM | FIXED, VERIFIED live (preview: text parented to a shape stayed put, then followed the shape when it moved) | Layers had a `parent` field the renderer never read, and Create Null Object made a 1%-scale shape that drew nothing useful. Now children draw inside their ancestors' transforms (`flux/parenting.ts`, cycle-safe), the inspector has a Parent picker that keeps the layer in place on screen, and a null can take a control layer as its child. Null layers are never drawn. `flux-parenting.test.ts` (4) | — |
| 186 | Flux | Light layers drew nothing; Auto Wiggle ignored its property | LOW | FIXED, VERIFIED live (light: scene brightness 3 → 182) | A Light layer is now an additive radial glow (size = Scale, strength = Opacity). Auto Wiggle's Position/Rotation/Scale/Opacity choice was stored but the behavior always moved position, and its frequency (wiggles per second) was read as radians per frame; both honored now | — |
| 187 | Flux | Shader Effects GLSL editor never compiled the code | MEDIUM | FIXED, VERIFIED live (preview: a syntax error showed the GPU's own message; a valid shader filled the frame) | "Compile & Apply" ignored the GLSL and added CSS filters (one set 50% sepia from the speed slider); presets like "Barrel Distortion" were only contrast. Now the code compiles in WebGL (`flux/shaderLayer.ts`), errors are shown verbatim, and it renders every frame as a Shader layer (or onto the selected generator) with `u_time`, `u_resolution`, `u_intensity`, `u_color`. Presets load real GLSL (Colour cycle, Plasma, Rings, Film grain, CRT scanlines). Contexts are pooled per layer and released when the layer goes. `flux-shader-layer.test.ts` (4) | Export a shader layer to WebM |
| 188 | Flux | Chromatic Aberration did nothing; Vignette only dimmed the whole layer; effect presets dropped their settings | LOW | FIXED, VERIFIED live (preview: text gained 434 red / 233 cyan fringe pixels) | Layers with these effects are drawn to an offscreen frame with the same transform, processed on pixels (`flux/postEffects.ts`: RGB split along an angle; edge falloff with amount/roundness/feather), then composited. `addFilter` now keeps the preset's settings. Old saved `customFilter` strings are applied. `flux-post-effects.test.ts` (3). Audio-reactive stays a live-preview tool (mic only runs while its panel is open) | — |
| 189 | Prism | Pixel tools baked the whole screen (checkerboard + every visible layer) into the selected layer; Canvas Size ignored its anchor | HIGH | FIXED (tsc + Prism tests); NOT live-verified (the Prism menus could not be driven in the preview this session) | 23 tools (noise, posterize, threshold, gradient map, unsharp mask, bucket fill, actions, panorama, colour lookup and others) read `canvasRef` — the on-screen composite — and saved it as the selected layer, so other layers were duplicated into it and transparency became checkerboard. They now work on `layerWorkCanvas()`: the selected layer alone, rotated as drawn, at document size; the result is saved document-sized at the origin (`bakePatch`). Shape/text layers (no pixels) get a clear message instead of being replaced. Canvas Size now shifts layers by the chosen anchor | Apply Add Noise to an image layer with other layers visible and check only that layer changed |
| 190 | Flux | Render Queue: "Render All" rendered only the first job, jobs were labelled "MP4 H.264" though export is WebM, progress jumped 0 → 100 | LOW | FIXED (tsc); not live-verified (needs a real-time recording) | Jobs now render one after another, progress follows the playhead while recording, a recorder that never starts marks the job failed instead of done, and jobs say WebM (VP9) | Queue two jobs and render |

## Session 2026-11-12 (`claude/system-roadmap-v7-b0988b`): v7.0.2 (001z) roadmap, "we do not break userspace"

| # | App | Item | Priority | Status | What changed | Next check |
|---|---|---|---|---|---|---|
| 201 | Platform | Native IPC ABI guard (B001/B002/B016) | HIGH | FIXED (unit tests + `npm run abi:check`) | `scripts/ipc-abi.mjs` locks all 1,920 native channels in `src-tauri/ipc-abi.lock.json`; removing one, or adding a renderer call nothing answers, fails `tests/unit/ipc-abi-compat.test.ts` and `npm run lint`. 7 known unhandled calls, all honest degrades, may only shrink | Add `npm run abi:check` as its own CI step |
| 202 | Quick Look | Text previews always blank in the desktop app | HIGH | FIXED (found by #201); not run in a packaged build | Called `files:read`, which no native arm answers; now `fs:readText` | Quick Look a `.txt` in the packaged app |
| 203 | Gallery | Save a copy without metadata (B003/B011) | HIGH | FIXED (5 cargo tests); not run in a packaged build | Native `fs:stripMetadata` (`metadata_strip.rs`): lossless JPEG/PNG copy without EXIF/GPS, XMP, IPTC, comments, PNG text/time; keeps colour profile, orientation, C2PA credentials; never touches the original | Strip a phone photo with GPS; check it opens upright and the GPS row reads "No GPS Data" |
| 204 | Shell | Hover submenus closed while the pointer moved into them; no safe triangle | MEDIUM | FIXED (6 component tests) | `UnifiedDropdown` closed a submenu 180 ms after leaving its row; now the parent owns one-open-at-a-time + safe triangle (`utils/safeTriangle.ts`), same guard in `ContextMenu` | Hover a nested menu in a real app menu bar |
| 205 | Notes | Move to Trash asked every time; no undo | LOW | FIXED (tsc); not clicked through | Deletes at once with an Undo toast (restores from Trash); permanent delete still asks | Delete a note, press Undo |
| 206 | Shell | Easter eggs never counted; Egg Hunter achievements could not unlock (B010) | LOW | FIXED, VERIFIED live (preview: Konami code showed the credits card) | 4 eggs (`services/easterEggs.ts`), each counts once toward `easterEggsFound` | — |
| 207 | Shell | Hit slop, continuous corners, view-transition theme fade (B013) | LOW | FIXED (tsc; corner-shape confirmed applied in the preview, Chrome 156) | `.dex-hit-slop` on traffic lights; `corner-shape: superellipse(1.5)`; theme flips cross-fade, off with Reduce Motion | Look at window corners and a theme flip in the packaged app (WebView2 version decides corner-shape support) |
| 208 | Gallery | "Scan for Faces" invented groups | MEDIUM | FIXED (removed; tsc + Gallery tests) | It made "Person 1..N" from the media count with no face detection. The Faces tool and panel are gone; real on-device detection would be a new feature | — |
| 209 | Shell | Settings › Reduce Motion didn't reach JS motion (B012) | HIGH | FIXED (3 unit tests) | The toggle only shortened CSS duration tokens; `isReduceMotion()` stayed false and the global `.reduce-motion` kill switch never turned on, so springs, menus and view transitions ignored it. New `setReduceMotionOverride` (MotionController) is now the one switch; off = follow Windows | Toggle it in the packaged app and open a menu |
| 210 | Notifications | Swipe-to-dismiss needed half the banner width; no flick, no cancel (B013) | LOW | FIXED, VERIFIED live (preview: a 64 px flick dismissed; old rule needed ~180 px) | `utils/swipeDismiss.ts`: distance or flick velocity, rubber band when pulled left, slide-off follow-through, pointercancel springs back. 6 tests | Try on a touch screen |
| 211 | Shell | Command Palette "Keyboard Shortcuts" opened Settings home | LOW | FIXED, VERIFIED live (preview) | Opens the pinned shortcut sheet (`dex-show-shortcuts` event) and shows its Ctrl+/ hint | — |
| 212 | Release | Release builds didn't run the ABI check (B001) | HIGH | FIXED (workflow edit; runs on the next tag) | `release.yml` runs `npm run abi:check` before building, so a release can't drop a shipped channel. CI's lint step already ran it | Watch the next release run |
