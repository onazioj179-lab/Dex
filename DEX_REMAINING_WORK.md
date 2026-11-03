# DEX: Remaining Work

**Date:** 2026-11-02 · **Creator:** Onazi Oj · This is the active backlog. Items from completed task files were moved here before those files were archived.

| # | Requirement | Status | Why incomplete | Components | Next action | Needs | Priority |
|---|---|---|---|---|---|---|---|
| 1 | Merge `claude/dex-part7-2` (Part 7 continued; #74 merged) | Open PR | Owner merges personally | — | Review + merge | Owner | P0 |
| 2 | Accurate Privacy Policy | **BLOCKED** | Owner has not approved the rewrite | `PRIVACY.md`, `src/shared/policies.ts` | Approve a rewrite from `docs/privacy/DATA_FLOWS.md` + `docs/reports/DEX_AI_PRIVACY.md` (must disclose Web Speech cloud recognition, provider data flow, Ollama check) | Owner / legal | P0 |
| 3 | Local AI measured end to end | DEFERRED (owner) | Owner parked Ollama work. Local AI is now opt-in (no startup probe, not routed to unless connected in Settings › AI Providers) | Ollama | None until the owner reopens it | Owner | — |
| 4 | Cloud AI measured end to end | NOT TESTED | No provider key here | Providers | Add a key; run a scripted agent session (web search + file read) | Owner key | P1 |
| 5 | Screen sharing in the packaged app | NOT TESTED | The system picker needs a human to choose a window | `uki/screenCapture.ts` | Click "look at my screen", pick a window, confirm one frame is sent and the indicator clears | Tester | P1 |
| 6 | Clean-machine install test | NOT TESTED | No VM | NSIS/MSI, WebView2 bootstrapper | Install on a VM without WebView2 | VM | P1 |
| 7 | Screen-reader pass | NOT TESTED | Needs an interactive session | Shell + new assistant controls | Narrator/NVDA walkthrough | Tester | P1 |
| 8 | Signed updates + downloadable apps | BLOCKED | Needs signing key + hosting | Updater, Store | Owner creates key; choose hosting | Owner | P1 |
| 9 | Cloud model catalog is dated | DONE (Part 7) | Current static fallbacks (Claude Opus/Sonnet/Haiku 5.5, Fable 5.1; GPT-5/5 mini/4o; Gemini 2.5) + live lists from each provider's models endpoint when a key is set (`liveModels.ts`); request shapes fixed (no temperature for Claude/reasoning models, token floors) | `uki/providers/*.ts` | Live-verify with a real key (#4) | Owner key | — |
| 10 | AI spending limits / usage totals | DONE | Per-provider daily totals and an optional daily token cap (`usage.ts`, enforced in `connect.ts`/`orchestrator.ts`, shown in AI settings); streaming counts are estimates and labelled so | `uki/providers/usage.ts` | — | — | — |
| 11 | Agent resume after app restart | MISSING | Interrupted tasks are marked failed (honest), not resumed | `ukiTasksStore.ts` | Persist step checkpoints + replay | — | P3 |
| 12 | Cross-device continuity | MISSING | No sync service exists | — | Product decision + authenticated, encrypted sync backend | Service | P3 |
| 13 | Camera understanding | MISSING | No assistant camera capture (deliberately not continuous) | — | One-shot camera frame via `getUserMedia`, same pattern as the screen picker | — | P3 |
| 14 | Offline speech recognition | MISSING | Web Speech API may use an online service | Voice | Evaluate an on-device ASR (e.g. a small Whisper build) | — | P3 |
| 15 | Live boot image root device | BLOCKED (boot-critical) | Live `grub.cfg` uses `root=/dev/sda2` | `dex-os/boot/grub.cfg` | Use `root=LABEL=DEX_ROOT` (see `docs/reports/DEX_UKI_INTEGRATION.md`) | Owner approval + VM | P2 |
| 16 | Unified Kernel Image, Secure Boot, rollback | MISSING | GRUB + bzImage today; no signing, no previous-kernel entry | `dex-os/` | Design decision; owner-held keys | Owner | P3 |
| 17 | DEX OS image build + boot test | BLOCKED | No Buildroot toolchain/VM here | `dex-os/` | Build in CI, boot in QEMU | VM | P2 |
| 18 | App-level colour sweep | PARTIAL | Imosion done (#67: chrome on tokens, pinned dark); green switches OS-wide now accent. Other apps still have UI-chrome hex (many remaining values are canvas/editor content colours) | `DEXAPPLICATIONS/*`, shell | Same per app: Prism, Flux, CollabHub, Rewind next | — | P2 |
| 19 | Terms of Service legal review | PARTIAL | Not a legal reviewer | `TERMS.md` | Legal review | Legal | P2 |
| 20 | Podcasts, shared albums, live captions | MISSING | Need backends/services | New apps | Product decision first | Services | P3 |
| 21 | Multi-monitor test | NOT TESTED | Single display | Window manager | Test on two displays | Hardware | P3 |
| 22 | Dock/taskbar visual rework | PARTIAL | Not in scope this pass | Shell | Design pass | — | P3 |

## Part 5: spatial desktop and creative suite (2026-11-01)

| # | Requirement | Status | Why incomplete | Components | Next action | Needs | Priority |
|---|---|---|---|---|---|---|---|
| 23 | Spatial desktop FPS / GPU, hardware requirements | NOT TESTED | Preview pane hidden, so no frames | `shell/spatial/*` | Performance-panel trace in the packaged build; one low-end machine | — | P1 |
| 24 | Spatial camera ~20–35 ms per update with a large on-screen app (50 windows) | PARTIAL | Dominated by the on-screen app's restyle | AppManager world layer | Profile in packaged build | — | P2 |
| 25 | Spatial: zones, guides, magnetic snap, align/distribute, lock, send to back, saved views, layout files, rebindable shortcuts, touch pinch | DONE (#70) | — | `spatialStore.ts`, `SpatialHud.tsx` | Duplicate views not applicable: DEX apps are single-instance | — | — |
| 26 | Creative suite §7–15 | PARTIAL | Canvas now has editable whiteboard objects + templates; Creative Hub app added; PRISM shows image metadata. Not done: shared assets library, Video proxy/hardware-decode audit, Audio/Present gap audit | Canvas, CreativeHub, Prism | Audit Vinx, Imosion, Presentation against §12–14 next | — | P2 |
| 27 | Glass / translucency (§16) | PARTIAL | Owner decision (2026-11) made refined glass the default. 7.0.1 adds the Interface Transparency slider on top (default reads as 40%; 0% = opaque, no blur; shared 0.55 opacity floor), an independent blur-strength slider, and a Refined/Liquid style choice. Not yet clicked through in a rendered Settings page, light + dark | `shellPreferencesStore`, `InterfaceTransparencyControl` | Click-through | Test profile | P2 |
| 28 | Markdown cleanup (§1) | DONE (#70) | Owner approved; 9 files retired, open items carried below, 0 broken links | — | — | — | — |
| 29 | Foreign native windows on the canvas | NOT APPLICABLE on Windows | No supported way to composite other programs' windows into WebView2 | — | Only via a custom compositor in `dex-os` | — | — |

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

### From `docs/AUDIT-BRUTAL-COMPLETION.md` (v6.0.4 defect audit, 2026-06-24)

13 of the 42 open items are resolved (their files no longer exist). The rest, with today's check:

| Bucket | Defect | Where | Status 2026-11-02 |
|---|---|---|---|
| fix-now | Frame Snapping panel controls (snap-on-drag, gutter, cycle-on-repeat) do nothing | `src/renderer/pages/settingsPanels/AccessPanels.tsx` | FIXED (#70) |
| fix-now | IntegrityPanel UI is never rendered, so integrity results are invisible | `src/renderer/services/IntegrityMonitor.tsx` | open |
| fix-now | PerformancePanel (live FPS/memory/DOM/alerts UI) is built but mounted nowhere | `src/renderer/services/PerformanceMonitor.tsx` | open |
| fix-now | Files settings 'Show Hidden Files' / 'Confirm Delete' / 'Default View' / 'Sort By' do not affect the Files app | `src/renderer/pages/Settings.tsx` | FIXED (#70) |
| fix-now | Window Management toggles (Snap/Animate/Remember/Shadows/Max windows) are never consumed | `src/renderer/pages/Settings.tsx` | REMOVED (Part 7: dead keys deleted, no control shown) |
| fix-now | Unified menu animation system is never imported | `src/renderer/shell/MenuAnimator.ts` | DELETED (Part 7 debloat) |
| fix-now | force-touch and swipe-down-3 gestures are emitted but no handler reacts | `src/renderer/shell/GestureEngine.ts` | open |
| fix-now | Visual Timeline / Work Reports / Memory Map Rewind stores are exported but unused | `src/renderer/services/RewindExtensions.ts` | DELETED (Part 7) |
| fix-careful | Power 'Lock DEX' / 'Safe Mode' / 'Learning' toggles set state nothing reads | `src/renderer/pages/Power.tsx` | FIXED (Part 7: Power rebuilt on real data) |
| fix-careful | Entire enhanced AutoSave/crash-recovery feature is never used | `src/renderer/services/AutoSaveManager.ts` | DELETED (Part 7) |
| fix-careful | Quick Look preview feature (component + useQuickLook hook) is never wired in | `src/renderer/shell/QuickLook.tsx` | WIRED (Files routes to the global Quick Look host) |
| fix-careful | CreativeCommandBar (NL command bar for creative apps) is never imported by any app | `src/renderer/components/CreativeCommandBar.tsx` | WIRED (creative apps) |
| fix-careful | recentSearches.ts and searchRecency.ts helper modules are never imported | `src/renderer/services/recentSearches.ts` | DELETED (Part 7) |
| fix-careful | Wallpaper accent extraction + crossfade layer is entirely unused | `src/renderer/shell/WallpaperAccent.tsx` | DELETED (Part 7 debloat) |
| fix-careful | Entire System Journal UI (JournalView) is never mounted anywhere | `src/renderer/components/JournalView.tsx` | DELETED (Part 7 debloat) |
| fix-careful | ThemeManager customization panel (presets + accent picker) is never rendered | `src/renderer/components/ThemeManager.tsx` | open |
| fix-careful | systemUndoStore (useSystemUndoStore) is never imported | `src/renderer/store/systemUndoStore.ts` | DELETED (Part 7 debloat) |
| fix-careful | SearchHistory module (spell-correction, completions, voice search store) has zero importers | `src/renderer/services/SearchHistory.ts` | DELETED (Part 7) |
| fix-careful | REST API / CLI / Mobile-Companion / Portable-Mode stores exported but consumed by no UI | `src/renderer/services/PlatformExtensions.ts` | DELETED (Part 7) |
| fix-careful | 'Enable Global Shortcuts' toggle is never read by the shortcut handlers | `src/renderer/pages/Settings.tsx` | REMOVED (Part 7: dead key) |
| fix-careful | ui/ micro-control cluster (RangeSlider, NumberStepper, SegmentedControl, controlMath) is unused; apps use the components/controls duplicates | `src/renderer/ui/RangeSlider.tsx` | open |
| remove | PerformancePanel component is never mounted | `src/renderer/services/PerformanceMonitor.tsx` | open |
| remove | SelectionToolbar and LetterScrubber primitives are exported but never used | `src/renderer/shell/UIComponents.tsx` | open |
| remove | Search indexer worker pipeline is orphaned (its only client is itself never imported) | `src/renderer/workers/searchIndexer.worker.ts` | DELETED (Part 7) |
| remove | Global undo/redo manager + useGlobalUndo hook is fully orphaned | `src/renderer/services/undoManager.ts` | DELETED (Part 7) |
| remove | featureSuiteStore claims '38 subsystems' but 35 of 38 stores are never imported anywhere | `src/renderer/store/featureSuiteStore.ts` | FIXED (Part 7: 2 used stores kept, 35 removed) |
| remove | Finished UndoRedoButtons toolbar component is exported but never mounted | `src/renderer/store/useUndoRedo.tsx` | DELETED (Part 7 debloat) |
| remove | Focus/Context-prediction/Smart-recents stores are never consumed | `src/renderer/services/IntelligenceLayer.ts` | DELETED (Part 7) |
| remove | Per-app focus profiles are stored but never read (no effect) | `src/renderer/services/FocusSessionSystem.ts` | DELETED (Part 7) |

## 7.0.1 pass (2026-11-01, `claude/cranky-hopper-4f196b`)

Shipped: Interface Transparency slider, theme-aware glass vars (light mode no longer gets dark panels), Reduce Motion no longer disables glass, creator attribution, version 7.0.1, Tauri release profile, `npm run release:checksums`. Evidence: `DEX_7.0.1_VERIFICATION.md`. Release verdict **NOT READY**.

| # | Requirement | Status | Why incomplete | Next action | Needs | Priority |
|---|---|---|---|---|---|---|
| 30 | Code signing of the 7.0.1 installer | BLOCKED | No certificate; installer is unsigned | Install cert, set thumbprint per `docs/SIGNING.md`, rebuild | Owner cert | P0 |
| 31 | MSI for 7.0.1 | VERIFIED (pre-reconcile build) | Built fine with network on `claude/dex-part4` (17.8 MB). Rebuild after merge for the final code | Rebuild | — | P1 |
| 32 | Packaged-app tests + before/after startup, idle CPU, memory | NOT TESTED | No install/upgrade/uninstall run. Sizes on `claude/dex-part4` (pre-reconcile build): exe 37.1 MB vs 40.1 MB, NSIS 14.4 vs 15.1 MB, MSI 17.8 vs 19.0 MB. Idle Home in the dev preview: 0 frame callbacks/s after the thermal-monitor fix | Install over 6.x on a test profile, measure, compare | VM / time | P0 |
| 33 | Click-through of the transparency slider in rendered Settings | NOT TESTED | Preview sits behind the Terms gate; logic is unit-tested and verified live at the store level | Accept gate on a test profile, drag the slider light + dark | Owner / test profile | P1 |
| 34 | Playwright e2e; CI-load flakiness of `v6-performance-guards` | PARTIAL | Full unit suite run once: 516/520 files, the 4 failures classified (see verification). e2e not run | Run e2e in CI; make perf guards load-tolerant | — | P2 |
| 35 | CRLF shebang broke `radius-scale-ratchet` import on Windows checkouts | FIXED | `.gitattributes` now pins `scripts/*.mjs` and `*.sh` to LF; the unblocked ratchet then caught one off-scale radius in `SpatialHud.tsx` (fixed) | — | — | — |
| 36 | Calculator visual pass | PARTIAL | Hard-coded accent/success gradient + shadow colors moved to tokens (`color-mix`); logic + tests pass. Not yet re-checked at 125/150/200% scaling or keyboard-navigated in a rendered window | Visual check in the packaged app | — | P3 |
| 37 | Popup audit, live-activities completion, background-process audit | PARTIAL | Done: redundant toasts removed; one live-activity store for every producer (downloads/encodes/transfers were Home-only); failed/cancelled tasks shown honestly; transfer Cancel; thermal monitor no longer runs a perpetual frame loop (and no longer mistakes a minimized window for overheating). Remaining: ~45 other `toast.success/info` sites, update-notice repetition | Finish the toast sweep | — | P2 |
| 38 | Light/dark + 125/150/200% scaling audit of every built-in app | PARTIAL | Scanned for hard-coded dark backgrounds: shell/general hits were overlays/scrims (fine) except 3 real light-mode defects, fixed (Focus-mode pill, Home widget picker, live-activity card/track/close button). Creative apps are deliberately pinned dark. Not yet checked visually, and scaling not tested | Visual pass in the packaged app, light + dark | — | P2 |
| 39 | UI sound effects | PARTIAL | Interface sounds are synthesized Web Audio (`shell/SpatialAudio.ts`), mute persists, Settings toggle synced. Windows notification toasts were always silent (WinRT writes `<audio silent>` when no sound is set); Settings › Notifications › Sound now reaches the toast. Not done: listen-test in the packaged app | Listen-test | — | P3 |
| 40 | Old 6.1.0 artifacts / release cleanup | WAITING | Rollback-critical until 7.0.1 is verified | Owner approves after install test | Owner | P3 |
| 41 | Frontend obfuscation | DECIDED: not added | Minification + identifier mangling only; an obfuscator would break dynamic imports/IPC and slow startup. Sensitive work is in Rust | Revisit only for a specific threat | — | — |
| 42 | Settings toggles still unread | RESOLVED on `claude/dex-part7` (see #51) | e.g. Window Management toggles, "Enable Global Shortcuts" (see the carried-over audit list) | Wire or remove each | — | P2 |
| 43 | Two parallel 7.0.1 implementations | RESOLVED in the reconcile merge | Kept main's transparency engine and docs numbering; kept this branch's Calculator rewrite (safe parser, focus-scoped keys), live-activity host, local-AI opt-in, bundle gate, About | — | — | — |
| 44 | Packaged app exits with `thread '<unknown>' has overflowed its stack` | OPEN | Seen 3× right after CDP tracing with gpu/viz/cc categories and 50 windows; 0 DEX native calls in the window before; not reproduced without tracing (4+ min, 50 apps) | Host process / WebView2 | Reproduce without tracing on a quiet machine; if it recurs, capture a minidump | — | P1 |
| 45 | Test isolation for packaged-app tests | DONE (Part 7) | `DEX_DATA_DIR=<dir>` redirects everything DEX writes (dex.db, dex-kv.json, index, vault, backups); one `DexPaths` resolver for all 107 call sites. WebView2 profile still needs `WEBVIEW2_USER_DATA_FOLDER` | `src-tauri/src/paths.rs` | Use it in every live test | — | — |

## Part 7: real functionality, honest controls (2026-11-02, `claude/dex-part7`)

| # | Requirement | Status | Detail | Components | Next action | Needs | Priority |
|---|---|---|---|---|---|---|---|
| 46 | Browser blank in the packaged app (WebView2 has no `<webview>`) | FIXED, verified live | Tabs are native child webviews behind a `<webview>`-compatible adapter. Debug build over CDP: example.com loads (title "Example Domain"), hidden when covered and shown again, released when the app closes and recreated on relaunch; the page's call to `dex_ipc` is refused | `browser_view.rs`, `NativeWebview.tsx` | Click-through of back/forward, find, reader mode, downloads in the packaged app | Tester | P1 |
| 47 | Browser features the native view cannot provide yet | PARTIAL | Credential capture (`ipc-message`), per-request ad-block count (`console-message`), load-error page (WebView2 shows its own), HTML fullscreen events, true `canGoBack` | `Browser.tsx` | Add a page-to-host bridge for the browser view only | — | P2 |
| 48 | `system:getProcesses` returned `{success, processes}`; all four callers expected an array | FIXED | Task Manager, Power, Settings, UKI showed empty process lists | `main.rs` | — | — | — |
| 49 | Power: fabricated data and no-op controls | FIXED | Rebuilt: Battery API, real Windows plan (reads `powercfg /getactivescheme`), wake lock, live energy list with confirmed End. Removed fake memory cleanup, CPU/GPU/fan sliders, empty Startup/Thermal, Panic/Safe Mode/Lock, name-matching "Shield". Memory tab showed bytes as GB | `Power.tsx`, `power.rs` | — | — | — |
| 50 | Power plan names never reached Windows | FIXED | `powerSaver`/`highPerformance` were coerced to Balanced | `power.rs` | — | — | — |
| 51 | Settings controls with no consumer | FIXED | Defaults 149 -> 46 keys; 22 controls with no reader removed (incl. an inactivity Auto-Lock that contradicted the no-idle-lock rule); every remaining control traced to a reader; DND uses the real store; Sound gates the banner chime; Launch at Login is real (HKCU Run); duplicate Text Size removed (it reset the other); Browser privacy is one shared store; "Clear All Data" is an honest "Reset DEX" (KV file kept as backup) | `Settings.tsx`, `useDexSetting.ts`, search indexes | — | — | — |
| 52 | Browser fabricated privacy stats; misleading "Tor Mode" | FIXED | "Fingerprints = blocked x 0.3", "Cookies = blocked x 0.6" removed; Tor mode only changed the user agent | `Browser.tsx` | — | — | — |
| 53 | Dead code | DONE (132 files, ~89k lines) | Unreachable from the app entry and unreferenced by tests/scripts/configs/CSS; includes simulated downloads (`BrowserFeatures.ts`) and a random "threat" scanner (`SystemSecurity.ts`). Verified: tsc 0, production build, full unit suite (521/521 files after merging main) | `src/renderer`, `src/shared` | ~380 more orphan files are still imported by tests only; prune with their tests | — | P3 |
| 54 | Remaining apps audited this way | PARTIAL | Done: Power, Settings, Browser, Imosion, Forge, Flux, Prism, Vinx, Gallery, AXL, CollabHub, Creative Suite settings, AppManager; every `<button>` now has a handler (parse of all TSX). Not yet scanned in depth: Calculator, Calendar, Notes, Files, Store, Transfers (no write-only state found by the heuristic) | `DEXAPPLICATIONS/*`, `pages/*` | Click-through in the packaged app | Tester | P2 |
| 55 | Auth engine lost from `main` | FIXED (Part 7) | PR #57 merged a real engine on 2026-07-02, then `main`'s history was rewritten and it vanished: PINs/passwords could be set but never verified, changed or recovered. Restored from the surviving branch (Argon2id, lockout with recovery, security questions, session tokens); 9 native tests | `auth.rs`, `LockScreen.tsx`, `useAuthStore.ts` | Live unlock test on a test profile (`DEX_DATA_DIR`) | Tester | P1 |
| 56 | Stale agent work + lost merges | REVIEWED | `main` was replaced by a different history between July and November, so PRs #1-#59 are not ancestors of `main`. Content check of every merged PR (share of its added lines present today): only #57 and #58 (auth) were lost (8-10%), now restored (97-100%); all others 52-99% present, gaps matching later deliberate rewrites. `feat/ui-consistency` superseded; `dex-part3-features` already in main. The main checkout (`feat/premium-overhaul-glass`, 149 behind) holds 57 uncommitted July files, left untouched | — | Owner decides whether to discard that working copy | Owner | P3 |
| 57 | Fake controls in creative apps | FIXED (Part 7) | Imosion bus compressor/tape/reference track/advanced export/MIDI learn, Forge shutdown + "GPU" toggle, Flux repeater/time remap/env map/frame blend/export presets, Creative Suite settings (polled localStorage every 2 s in 5 apps) | creative apps | Listen/visual check in the packaged app | Tester | P2 |
| 58 | Restore a collaboration checkpoint | MISSING | Checkpoints store serialized app data (`CollaborationSystem.restoreCheckpoint`), but no creative app can load it back; CollabHub's Restore button had no handler and was removed | `useCollaborationFeatures.ts`, creative apps | Add an `onRestore(data)` per app (start with Flux/Prism, whose state already serialises) | — | P3 |

## Release status

**NOT READY** until #1 and #2 are done. After that: **READY WITH DOCUMENTED LIMITATIONS** (items 3–29). None of those items is a crash or data-loss defect.
