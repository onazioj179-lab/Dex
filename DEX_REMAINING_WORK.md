# DEX: Remaining Work

**Date:** 2026-11-01 · **Creator:** Onazi Oj · This is the active backlog. Items from completed task files were moved here before those files were archived.

| # | Requirement | Status | Why incomplete | Components | Next action | Needs | Priority |
|---|---|---|---|---|---|---|---|
| 1 | Merge `claude/dex-part5-spatial` (also carries #67, which merged into a feature branch and never reached `main`) | Open PR | Owner merges personally | — | Review + merge | Owner | P0 |
| 2 | Accurate Privacy Policy | **BLOCKED** | Owner has not approved the rewrite | `PRIVACY.md`, `src/shared/policies.ts` | Approve a rewrite from `docs/privacy/DATA_FLOWS.md` + `docs/reports/DEX_AI_PRIVACY.md` (must disclose Web Speech cloud recognition, provider data flow, Ollama check) | Owner / legal | P0 |
| 3 | Local AI measured end to end | BLOCKED | Ollama is installed with 0 models; pulling one is a multi-GB download | Ollama | Approve `ollama pull llama3.2:3b`, then measure first token and tokens/s | Owner approval | P1 |
| 4 | Cloud AI measured end to end | NOT TESTED | No provider key here | Providers | Add a key; run a scripted agent session (web search + file read) | Owner key | P1 |
| 5 | Screen sharing in the packaged app | NOT TESTED | The system picker needs a human to choose a window | `uki/screenCapture.ts` | Click "look at my screen", pick a window, confirm one frame is sent and the indicator clears | Tester | P1 |
| 6 | Clean-machine install test | NOT TESTED | No VM | NSIS/MSI, WebView2 bootstrapper | Install on a VM without WebView2 | VM | P1 |
| 7 | Screen-reader pass | NOT TESTED | Needs an interactive session | Shell + new assistant controls | Narrator/NVDA walkthrough | Tester | P1 |
| 8 | Signed updates + downloadable apps | BLOCKED | Needs signing key + hosting | Updater, Store | Owner creates key; choose hosting | Owner | P1 |
| 9 | Cloud model catalog is dated | PARTIAL | Static lists (`gpt-4o`, `claude-3-5-*`, `gemini-1.5-*`) | `uki/providers/*.ts` | Add current model ids per provider (verify ids against provider docs) | — | P2 |
| 10 | AI spending limits / usage totals | MISSING | Usage counts returned per call are not aggregated | `orchestrator.ts` | Sum `usage` per provider per day; optional cap blocks calls | — | P2 |
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
| 25 | Spatial: zones, alignment guides, magnetic snap, distribute, lock, send backward, duplicate view, named viewports, layout export/import, configurable shortcuts, touch-screen gestures | MISSING | Not built yet | `spatialStore.ts` | Build on the store | — | P2 |
| 26 | Creative suite §7–15 (Design, Photo, Video, Audio, Present, Creative Hub) | NOT STARTED | Scope; existing apps unchanged | Prism, Vinx, Imosion, Presentation, Notes, Canvas | Audit each existing app, then fill real gaps | — | P2 |
| 27 | Glass / translucency (§16) | PARTIAL | Owner direction was "glass is out"; 7.0.1 adds an opt-in Interface Transparency slider (0% opaque default, up to max glass) with theme-aware materials. Default stays opaque | `shellPreferencesStore`, `InterfaceTransparencyControl` | Click-through in rendered Settings (light + dark); confirm owner wants it exposed | Owner | P2 |
| 28 | Markdown cleanup (§1) | BLOCKED | Deleting documentation needs approval | Root + `docs/` | Owner approves a list | Owner | P3 |
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

| Bucket | Defect | Where | Status 2026-11-01 |
|---|---|---|---|
| fix-now | Frame Snapping panel controls (snap-on-drag, gutter, cycle-on-repeat) do nothing | `src/renderer/pages/settingsPanels/AccessPanels.tsx` | still present |
| fix-now | IntegrityPanel UI is never rendered, so integrity results are invisible | `src/renderer/services/IntegrityMonitor.tsx` | `IntegrityPanel` now referenced in 1 other file(s) (recheck) |
| fix-now | PerformancePanel (live FPS/memory/DOM/alerts UI) is built but mounted nowhere | `src/renderer/services/PerformanceMonitor.tsx` | `PerformancePanel` now referenced in 1 other file(s) (recheck) |
| fix-now | Files settings 'Show Hidden Files' / 'Confirm Delete' / 'Default View' / 'Sort By' do not affect the Files app | `src/renderer/pages/Settings.tsx` | still present |
| fix-now | Window Management toggles (Snap/Animate/Remember/Shadows/Max windows) are never consumed | `src/renderer/pages/Settings.tsx` | still present |
| fix-now | Unified menu animation system is never imported | `src/renderer/shell/MenuAnimator.ts` | still present |
| fix-now | force-touch and swipe-down-3 gestures are emitted but no handler reacts | `src/renderer/shell/GestureEngine.ts` | still present |
| fix-now | Visual Timeline / Work Reports / Memory Map Rewind stores are exported but unused | `src/renderer/services/RewindExtensions.ts` | still present |
| fix-careful | Power 'Lock DEX' / 'Safe Mode' / 'Learning' toggles set state nothing reads | `src/renderer/pages/Power.tsx` | still present |
| fix-careful | Entire enhanced AutoSave/crash-recovery feature is never used | `src/renderer/services/AutoSaveManager.ts` | still present |
| fix-careful | Quick Look preview feature (component + useQuickLook hook) is never wired in | `src/renderer/shell/QuickLook.tsx` | `useQuickLook` now referenced in 1 other file(s) (recheck) |
| fix-careful | CreativeCommandBar (NL command bar for creative apps) is never imported by any app | `src/renderer/components/CreativeCommandBar.tsx` | `CreativeCommandBar` now referenced in 4 other file(s) (recheck) |
| fix-careful | recentSearches.ts and searchRecency.ts helper modules are never imported | `src/renderer/services/recentSearches.ts` | still present |
| fix-careful | Wallpaper accent extraction + crossfade layer is entirely unused | `src/renderer/shell/WallpaperAccent.tsx` | still present |
| fix-careful | Entire System Journal UI (JournalView) is never mounted anywhere | `src/renderer/components/JournalView.tsx` | still present |
| fix-careful | ThemeManager customization panel (presets + accent picker) is never rendered | `src/renderer/components/ThemeManager.tsx` | `ThemeManager` now referenced in 2 other file(s) (recheck) |
| fix-careful | systemUndoStore (useSystemUndoStore) is never imported | `src/renderer/store/systemUndoStore.ts` | still present |
| fix-careful | SearchHistory module (spell-correction, completions, voice search store) has zero importers | `src/renderer/services/SearchHistory.ts` | still present |
| fix-careful | REST API / CLI / Mobile-Companion / Portable-Mode stores exported but consumed by no UI | `src/renderer/services/PlatformExtensions.ts` | still present |
| fix-careful | 'Enable Global Shortcuts' toggle is never read by the shortcut handlers | `src/renderer/pages/Settings.tsx` | still present |
| fix-careful | ui/ micro-control cluster (RangeSlider, NumberStepper, SegmentedControl, controlMath) is unused; apps use the components/controls duplicates | `src/renderer/ui/RangeSlider.tsx` | `RangeSlider` now referenced in 2 other file(s) (recheck) |
| remove | PerformancePanel component is never mounted | `src/renderer/services/PerformanceMonitor.tsx` | `PerformancePanel` now referenced in 1 other file(s) (recheck) |
| remove | SelectionToolbar and LetterScrubber primitives are exported but never used | `src/renderer/shell/UIComponents.tsx` | still present |
| remove | Search indexer worker pipeline is orphaned (its only client is itself never imported) | `src/renderer/workers/searchIndexer.worker.ts` | still present |
| remove | Global undo/redo manager + useGlobalUndo hook is fully orphaned | `src/renderer/services/undoManager.ts` | still present |
| remove | featureSuiteStore claims '38 subsystems' but 35 of 38 stores are never imported anywhere | `src/renderer/store/featureSuiteStore.ts` | still present |
| remove | Finished UndoRedoButtons toolbar component is exported but never mounted | `src/renderer/store/useUndoRedo.tsx` | still present |
| remove | Focus/Context-prediction/Smart-recents stores are never consumed | `src/renderer/services/IntelligenceLayer.ts` | still present |
| remove | Per-app focus profiles are stored but never read (no effect) | `src/renderer/services/FocusSessionSystem.ts` | still present |

## 7.0.1 pass (2026-11-01, `claude/cranky-hopper-4f196b`)

Shipped: Interface Transparency slider, theme-aware glass vars (light mode no longer gets dark panels), Reduce Motion no longer disables glass, creator attribution, version 7.0.1, Tauri release profile, `npm run release:checksums`. Evidence: `DEX_7.0.1_VERIFICATION.md`. Release verdict **NOT READY**.

| # | Requirement | Status | Why incomplete | Next action | Needs | Priority |
|---|---|---|---|---|---|---|
| 30 | Code signing of the 7.0.1 installer | BLOCKED | No certificate; installer is unsigned | Install cert, set thumbprint per `docs/SIGNING.md`, rebuild | Owner cert | P0 |
| 31 | MSI for 7.0.1 | FAILED offline | WiX step downloads the WebView2 bootstrapper | Rebuild with network or an offline bootstrapper | Network | P1 |
| 32 | Packaged-app tests + before/after startup, idle CPU, memory | NOT TESTED | No install/upgrade/uninstall run; 7.0.1 exe and installer are ~2 MB / ~0.4 MB larger than 6.1.0 (cause not isolated) | Install over 6.x, measure, compare | VM / time | P0 |
| 33 | Click-through of the transparency slider in rendered Settings | NOT TESTED | Preview sits behind the Terms gate; logic is unit-tested and verified live at the store level | Accept gate on a test profile, drag the slider light + dark | Owner / test profile | P1 |
| 34 | Playwright e2e; CI-load flakiness of `v6-performance-guards` | PARTIAL | Full unit suite run once: 516/520 files, the 4 failures classified (see verification). e2e not run | Run e2e in CI; make perf guards load-tolerant | — | P2 |
| 35 | CRLF shebang broke `radius-scale-ratchet` import on Windows checkouts | FIXED | `.gitattributes` now pins `scripts/*.mjs` and `*.sh` to LF; the unblocked ratchet then caught one off-scale radius in `SpatialHud.tsx` (fixed) | — | — | — |
| 36 | Calculator visual pass | PARTIAL | Hard-coded accent/success gradient + shadow colors moved to tokens (`color-mix`); logic + tests pass. Not yet re-checked at 125/150/200% scaling or keyboard-navigated in a rendered window | Visual check in the packaged app | — | P3 |
| 37 | Popup audit, live-activities completion, background-process audit | PARTIAL | Removed redundant toasts (pin/unpin in Files, custom-wallpaper-applied, Forge per-10-frame spam); Forge image-sequence export now reports real frame progress on the shared live-activity card. Remaining: ~45 other `toast.success/info` call sites unreviewed (Forge dialogs, Files clipboard), update-notice repetition, background-process audit | Finish the sweep | — | P2 |
| 38 | Light/dark + 125/150/200% scaling audit of every built-in app | PARTIAL | Scanned for hard-coded dark backgrounds: shell/general hits were overlays/scrims (fine) except 3 real light-mode defects, fixed (Focus-mode pill, Home widget picker, live-activity card/track/close button). Creative apps are deliberately pinned dark. Not yet checked visually, and scaling not tested | Visual pass in the packaged app, light + dark | — | P2 |
| 39 | UI sound effects | UNKNOWN | No bundled audio files and no UI sound system found in a quick scan | Decide if wanted; audit | Owner | P3 |
| 40 | Old 6.1.0 artifacts / release cleanup | WAITING | Rollback-critical until 7.0.1 is verified | Owner approves after install test | Owner | P3 |

## Release status

**NOT READY** until #1 and #2 are done. After that: **READY WITH DOCUMENTED LIMITATIONS** (items 3–29). None of those items is a crash or data-loss defect.
